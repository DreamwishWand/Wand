<script lang="ts">
 import {onDestroy} from 'svelte';
 import {browser} from '$app/environment';
 import {base} from '$app/paths';
 import {commitWorldCheckpoint} from '../ui/local-save-session.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {testSaveExportEnabled,testSaveWords} from './test-save-export.ts';
 import {captureFurnitureGroup,worldFurnitureClipboard,worldFurnitureCut,groupPasteWords,groupCutWords,captureCutWitness,cutClipboardMatches,groupCutPlan,groupPasteCandidate,rotateFurnitureGroup,groupStockAvailable,groupSceneOrigin,groupSceneWords,groupSymmetryWords,symmetricWorldCandidate,savedWorldGroupPoses,groupCandidatePoses,type WorldGroupPose,type WorldSymmetryAxis,type GroupPasteCandidate,type CutWitness,type CutClipboard} from './group-paste.ts';
 import {parseFurnitureStock} from './furniture-stock-view.ts';
 import {worldArtwork} from './world-artwork.ts';
 import {DESIGN_FILE_LIMIT,type DesignClipItem,type DesignItemGeometry} from './design-layout.ts';
 import {WORLD_BATCH_LIMIT} from './saved-map-batch.ts';
 import WorldSymmetryControls from './WorldSymmetryControls.svelte';
 import type {DesignSymmetry} from './design-symmetry.ts';
 import {mainlandExtent,sourceWorldScope} from './mainland-world-coordinates.ts';
 import {sceneWords,sceneFromClip,parseSceneAnyFactor,convertSceneFactor,sceneItemCounts,type ScenePreset} from './scene-preset.ts';
 import {parseSupportScene,supportSceneRootCounts,type SupportScene} from './support-scene.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {MainlandGrid} from './mainland-world-coordinates.ts';
 import type {TerrainRaster} from './terrain-binding.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let items:readonly MainlandSavedObject[]=[],file:File|null=null,worker:Worker|null=null,grids:readonly MainlandGrid[]=[],rasters:ReadonlyMap<string,TerrainRaster>=new Map(),objects:readonly MainlandSavedObject[]=[],omitted=0,locale:WandLanguage='ja',blocked=false,nextRequest:()=>number,onBegin:()=>void=()=>{},active=false,ghost:GroupPasteCandidate|null=null,axis:WorldSymmetryAxis|null=null;
 const allowed=browser&&testSaveExportEnabled(window.location);
 let clip:readonly DesignClipItem[]=[],defs=new Map<number,Map<number,DesignItemGeometry>>(),pending=new Map<number,{key:string;factor:1|2}>(),counts:Map<number,number>|null=null;
 let read:Worker|null=null,writing:Worker|null=null,subscribed:Worker|null=null,source:File|null=null,point:{x:number;y:number}|null=null,candidate:GroupPasteCandidate|null=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null,error=false,copied=false;
 let images=new Map<number,string>(),cutRows:CutWitness[]|null=null,activeCut:CutClipboard|null=null;
 let symmetry:DesignSymmetry|null=null,symmetryOpen=false,symmetryPicking=false,mirrorOnly:WorldGroupPose[]|null=null;
 $: frame=mainlandExtent(grids);
 $: scope=grids[0]?sourceWorldScope(grids[0]):'';
 $: axis=symmetry?{mode:symmetry.mode,x:frame.x+symmetry.x2/2,y:frame.y+frame.h-symmetry.y2/2}:null;
 let supportScene:SupportScene|null=null,supportRequest=0,supportValid=false;
 let sceneInput:HTMLInputElement,scene:ScenePreset|null=null,sceneAnchor:ScenePreset['anchor']='corner',sceneReading=false,sceneEpoch=0,sceneError='',sceneNames=new Map<number,string>();
 $: w=groupPasteWords[locale];$: sy=groupSymmetryWords[locale];$: st=sceneWords[locale];$: gs=groupSceneWords[locale];$: cutText=groupCutWords[locale];
 $: if($worldFurnitureCut&&$worldFurnitureCut.file!==file){worldFurnitureCut.set(null);worldFurnitureClipboard.set([]);copied=false;}
 $: remainingObjects=cutRows?objects.filter(p=>!cutRows?.some(r=>r.localOrdinal===p.object.localOrdinal&&r.area===p.area)):objects;$: cw=checkpointWords[locale];$: tw=testSaveWords[locale];
 $: selection=captureFurnitureGroup(items);
 $: if(worker!==subscribed){subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);cancel();}
 $: if(active&&(source!==file||blocked))cancel();
 $: required=supportScene?supportSceneRootCounts(supportScene):sceneItemCounts(clip);
 $: geometryReady=active&&(!supportScene||supportValid)&&!pending.size&&clip.length>0&&clip.every(p=>defs.has(p.itemId))&&(!activeCut||cutClipboardMatches(activeCut,file,scope,objects));
 $: baseReady=geometryReady&&!!counts&&(supportScene?[...required].every(([id,n])=>(counts!.get(id)??0)>=n):groupStockAvailable(clip,counts));
 $: anchorPoint=point&&(scene||supportScene)?groupSceneOrigin(clip,defs,grids,rasters,point,sceneAnchor):point;
 $: preview=geometryReady?previewGroup(clip,anchorPoint,axis,mirrorOnly,grids,rasters,defs,remainingObjects,omitted,required,counts,baseReady,!!scene||!!supportScene):null;
 $: ghost=candidate??(preview&&(!cutRows||groupCutPlan(cutRows,preview))?preview:null);
 $: actualRequired=supportScene?required:ghost?sceneItemCounts(groupCandidatePoses(ghost).map(p=>({itemId:p.itemId,dx:0,dy:0,orientation:p.orientation}))):required;
 $: ready=geometryReady&&!!counts&&(axis||mirrorOnly?!!ghost&&[...actualRequired].every(([id,n])=>(counts!.get(id)??0)>=n):baseReady);
 function previewGroup(clip:readonly DesignClipItem[],point:{x:number;y:number}|null,axis:WorldSymmetryAxis|null,mirror:WorldGroupPose[]|null,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,defs:Map<number,Map<number,DesignItemGeometry>>,objects:readonly MainlandSavedObject[],omitted:number,required:Map<number,number>,counts:Map<number,number>|null,baseReady:boolean,scene:boolean){
  // Stock is evaluated independently from shape preview. All final rows must
  // pass actual stock checks before the worker is called.
  const capacity=new Map([...required].map(([id,n])=>[id,n*2]));
  if(mirror)return axis?symmetricWorldCandidate(mirror,axis,false,grids,rasters,defs,capacity,objects,omitted):null;
  if(!point||!scene&&!axis&&!baseReady)return null;
  const base=groupPasteCandidate(clip,grids,rasters,defs,scene||axis?required:counts!,objects,omitted,point.x,point.y);
  return base&&axis?symmetricWorldCandidate(groupCandidatePoses(base),axis,true,grids,rasters,defs,capacity,objects,omitted):base;
 }
 function changeSymmetry(value:DesignSymmetry|null){
  if(writing||copy||cutRows||supportScene)return;
  symmetry=value;symmetryPicking=false;candidate=null;error=false;
 }
 function chooseMirror(){if(!preview||writing||copy||symmetryPicking)return;candidate=preview;error=false;}
 export function beginMirror(){
  const poses=savedWorldGroupPoses(items);
  if(!poses||!begin(true))return false;
  mirrorOnly=poses;symmetryOpen=true;
  const x=(Math.min(...poses.map(p=>p.x))+Math.max(...poses.map(p=>p.x)))/2;
  const y=(Math.min(...poses.map(p=>p.y))+Math.max(...poses.map(p=>p.y)))/2;
  symmetry={mode:'vertical',x2:Math.round((x-frame.x)*2),y2:Math.round((frame.y+frame.h-y)*2)};
  symmetryPicking=true;return true;
 }
 export function saveScene(){
  if(!selection||blocked)return;
  try{
   const half=sceneFromClip(selection,2),doc=convertSceneFactor(half,1)??half;
   const url=URL.createObjectURL(new Blob([JSON.stringify(doc)],{type:'application/json'}));
   const a=document.createElement('a');a.href=url;a.download='wand-scene.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{sceneError=gs[2];}
 }
 export function chooseScene(){if(!allowed||blocked||!file||!worker||sceneReading)return;sceneInput?.click();}
 async function openScene(e:Event){
  const input=e.currentTarget as HTMLInputElement,f=input.files?.[0];input.value='';
  if(!f||!allowed||blocked||!file||!worker||sceneReading)return;
  const original=file,own=worker,epoch=++sceneEpoch;sceneReading=true;sceneError='';
  try{
   if(f.size>DESIGN_FILE_LIMIT)throw Error('size');
   const raw=await f.text();
   if(epoch!==sceneEpoch||file!==original||worker!==own||blocked)return;
   let supportDoc:SupportScene|null=null;try{supportDoc=parseSupportScene(raw);}catch{/* Flat Scene parser below. */}
   if(supportDoc){if(!begin(false,null,supportDoc))sceneError=gs[2];return;}
   const doc=convertSceneFactor(parseSceneAnyFactor(raw),2);
   if(epoch!==sceneEpoch||file!==original||worker!==own||blocked)return;
   if(!doc)throw Error('factor');
   if(doc.items.length>WORLD_BATCH_LIMIT){sceneError=gs[3];return;}
   if(!begin(false,doc))sceneError=gs[2];
  }catch{if(epoch===sceneEpoch)sceneError=gs[2];}finally{if(epoch===sceneEpoch)sceneReading=false;}
 }
 function changeAnchor(a:ScenePreset['anchor']){if(writing||copy)return;sceneAnchor=a;candidate=null;}
 export function capture(cut=false){const captured=cut?captureFurnitureGroup(items,true):selection;if(!allowed||blocked||!captured||!file)return false;const rows=cut?captureCutWitness(items):null;if(cut&&!rows)return false;worldFurnitureCut.set(rows?{file,scope,rows}:null);worldFurnitureClipboard.set(captured);copied=true;return true;}
 export function begin(duplicate=false,sceneDoc:ScenePreset|null=null,supportDoc:SupportScene|null=null){
  const data=supportDoc?[{itemId:supportDoc.ownerItemId,dx:0,dy:0,orientation:2}]:sceneDoc?sceneDoc.items:duplicate?selection:$worldFurnitureClipboard,cut=duplicate||sceneDoc||supportDoc?null:$worldFurnitureCut;
  if(!allowed||blocked||!file||!worker||!data?.length||!grids.length)return false;
  if(cut&&!cutClipboardMatches(cut,file,scope,objects)){error=true;return false;}
  cancel();onBegin();source=file;active=true;clip=[...data];copied=false;cutRows=cut?.rows??null;activeCut=cut;scene=sceneDoc;supportScene=supportDoc;sceneAnchor=sceneDoc?.anchor??'corner';
  if(supportDoc){supportRequest=nextRequest();worker.postMessage({command:'support-scene-geometry',requestId:supportRequest,scene:supportDoc,locale});}
  if(cutRows){counts=new Map();for(const p of clip)counts.set(p.itemId,(counts.get(p.itemId)??0)+1);}
  else {const f=file,own=new Worker(new URL('./furniture-stock-view.worker.ts',import.meta.url),{type:'module'});read=own;
  const done=(raw:unknown)=>{own.terminate();if(read!==own||file!==f)return;read=null;try{counts=parseFurnitureStock(raw);if(!scene&&!supportScene&&!symmetry&&!mirrorOnly&&!groupStockAvailable(clip,counts))error=true;}catch{error=true;}};
  own.onmessage=e=>done(e.data?.kind==='furniture-stock'?e.data.result:null);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command:'read-furniture-stock',file:f});}
  const ids=[...new Set(clip.map(p=>p.itemId))],factors=new Set<number>();
  for(const g of grids){if(factors.has(g.factor))continue;factors.add(g.factor);const requestId=nextRequest();pending.set(requestId,{key:g.key,factor:g.factor});worker.postMessage({command:'design-shapes',key:g.key,itemIds:ids,requestId});}
  pending=new Map(pending);for(const id of (supportDoc?[...supportSceneRootCounts(supportDoc).keys()]:ids))void worldArtwork(base,id).then(url=>{if(url)images=new Map(images).set(id,url);}).catch(()=>{});
  return true;
 }
 function receive(e:MessageEvent){const d=e.data;if(supportRequest&&d?.requestId===supportRequest){supportRequest=0;supportValid=d.kind==='support-scene-geometry'&&d.valid===true;if(!supportValid)error=true;else if(Array.isArray(d.names))sceneNames=new Map([...sceneNames,...d.names.filter((v:unknown)=>Array.isArray(v)&&v.length===2&&Number.isSafeInteger(v[0])&&typeof v[1]==='string')]);return;}const req=pending.get(d?.requestId);if(!req)return;pending.delete(d.requestId);pending=new Map(pending);
  if(d.kind!=='design-shapes'||d.key!==req.key||!Array.isArray(d.result)){error=true;return;}
  const expected=new Set(clip.map(p=>p.itemId));
  if(d.result.length!==expected.size||d.result.some((g:DesignItemGeometry)=>!expected.has(g.itemId)||g.layer!=='furniture'||g.surfaceCapable&&g.itemId!==supportScene?.ownerItemId&&!cutRows?.some(r=>r.supportFactor&&Number(r.itemId)===g.itemId)||!g.shapes)){error=true;return;}
  const next=new Map(defs);for(const g of d.result as DesignItemGeometry[]){if(g.name)sceneNames=new Map(sceneNames).set(g.itemId,g.name);const factors=new Map(next.get(g.itemId));factors.set(req.factor,g);next.set(g.itemId,factors);}defs=next;
 }
 export function hover(p:{x:number;y:number}|null){if(active&&!candidate&&!writing&&!copy&&!symmetryPicking&&!mirrorOnly)point=p;}
 export function pick(p:{x:number;y:number}){
  if(writing||copy)return;
  if(symmetryPicking&&symmetry){changeSymmetry({...symmetry,x2:Math.round((p.x-frame.x)*2),y2:Math.round((frame.y+frame.h-p.y)*2)});return;}
  if(!geometryReady)return;
  if(mirrorOnly){chooseMirror();return;}
  const at=scene||supportScene?groupSceneOrigin(clip,defs,grids,rasters,p,sceneAnchor):p;
  const q=previewGroup(clip,at,axis,null,grids,rasters,defs,remainingObjects,omitted,required,counts,baseReady,!!scene||!!supportScene);
  if(!q||cutRows&&!groupCutPlan(cutRows,q)){error=true;return;}candidate=q;point=p;error=false;
 }
 export function turn(delta:number){if(!geometryReady||writing||copy||mirrorOnly)return;const q=rotateFurnitureGroup(clip,defs,delta);if(!q){error=true;return;}clip=q;candidate=null;error=false;}
 export function validate(){
  if(!active||!allowed||blocked||!ready||!file||source!==file||!candidate||writing||copy)return;
  const f=file,q=candidate,plan=cutRows?groupCutPlan(cutRows,q):q.rows;
  if(!plan||!counts||!cutRows&&![...sceneItemCounts(q.rows.map(p=>({itemId:Number(p.itemId),dx:0,dy:0,orientation:0})))].every(([id,n])=>(counts!.get(id)??0)>=n)||activeCut&&!cutClipboardMatches(activeCut,file,scope,objects)){error=true;return;}
  const root=supportScene?q.rows[0]:null;
  if(supportScene&&(!root||q.rows.length!==1||!supportValid||![...supportSceneRootCounts(supportScene)].every(([id,n])=>(counts!.get(id)??0)>=n)))return;
  const own=supportScene?new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'}):new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});writing=own;error=false;
  const done=(d:any)=>{own.terminate();if(writing!==own||file!==f||candidate!==q){d?.bytes?.fill(0);return;}writing=null;try{if(d?.kind!==(root?'support-parent-copy':'furniture-stock-copy'))throw Error('copy');copy=experimentalCopyDownload(d,f);}catch{d?.bytes?.fill(0);error=true;}};
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage(root?{command:'support-parent-copy',file:f,plan:{createScene:true,itemId:Number(root.itemId),x:root.x,y:root.y,orientation:root.orientation,destination:root.destination,scene:supportScene},allowExperimentalCopy:true}:{command:cutRows?'group-cut-export':'group-paste-export',file:f,plan,allowExperimentalCopy:true});
 }
 function apply(){if(!allowed||blocked||!copy||!file||source!==file)return;if(activeCut&&!cutClipboardMatches(activeCut,file,scope,objects)){error=true;return;}if(!commitWorldCheckpoint(file,copy.file)){error=true;return;}if(cutRows){worldFurnitureCut.set(null);worldFurnitureClipboard.set([]);}cancel();}
 export function cancel(){read?.terminate();writing?.terminate();read=null;writing=null;if(copy)URL.revokeObjectURL(copy.url);copy=null;active=false;source=null;clip=[];cutRows=null;activeCut=null;mirrorOnly=null;symmetry=null;symmetryOpen=false;symmetryPicking=false;scene=null;supportScene=null;supportRequest=0;supportValid=false;sceneAnchor='corner';sceneEpoch++;sceneReading=false;sceneError='';defs=new Map();pending=new Map();counts=null;point=null;candidate=null;error=false;}
 onDestroy(()=>{cancel();subscribed?.removeEventListener('message',receive);});
</script>
<input class="scene-file-input" type="file" accept=".json,application/json" bind:this={sceneInput} on:change={openScene}/>
{#if allowed}
 {#if active}<aside class="group-paste" aria-label={w[1]}><strong>{scene||supportScene?'Scene':cutRows?cutText[2]:w[1]} · {clip.length}</strong><div class="paste-images">{#each clip as p}{#if images.has(p.itemId)}<img src={images.get(p.itemId)} alt="" loading="lazy"/>{/if}{/each}</div>{#if read||pending.size||supportRequest||writing}<small role="status">{w[6]}</small>{:else if geometryReady&&!candidate}<small>{w[4]}</small>{/if}
 {#if !cutRows&&!supportScene&&!copy}<button type="button" disabled={!!writing} aria-pressed={symmetryOpen} on:click={()=>symmetryOpen=!symmetryOpen} aria-label={sy[0]}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 2v20M9 6 3 12l6 6ZM15 6l6 6-6 6Z"/></svg></button>{#if symmetryOpen}<WorldSymmetryControls {locale} value={symmetry} width={frame.w} height={frame.h} picking={symmetryPicking} count={clip.length} valid={!!preview} busy={!!writing} onChange={changeSymmetry} onPick={()=>{symmetryPicking=!symmetryPicking;candidate=null;}} onMirror={chooseMirror}/>{/if}{/if}
 {#if scene||supportScene||symmetry||mirrorOnly}<small>{gs[0]}</small><div class="scene-required">{#each [...actualRequired] as [id,n] (id)}<div class="scene-row">{#if images.has(id)}<img src={images.get(id)} alt="" loading="lazy"/>{/if}<span>{sceneNames.get(id)??'—'}</span><strong class:shortage={!!counts&&(counts.get(id)??0)<n}>{counts?counts.get(id)??0:'—'} / {n}</strong></div>{/each}</div>{#if counts&&ghost&&!ready&&geometryReady}<small role="alert">{gs[1]}</small>{/if}{#if scene||supportScene}<div><button type="button" disabled={!!writing||!!copy} aria-pressed={sceneAnchor==='center'} on:click={()=>changeAnchor('center')}>{st[2]}</button><button type="button" disabled={!!writing||!!copy} aria-pressed={sceneAnchor==='corner'} on:click={()=>changeAnchor('corner')}>{st[3]}</button></div>{/if}{/if}
 {#if !copy}<div><button type="button" disabled={!geometryReady||!!writing||!!mirrorOnly} on:click={()=>turn(-1)} aria-label={w[9]}>⟲</button><button type="button" disabled={!geometryReady||!!writing||!!mirrorOnly} on:click={()=>turn(1)} aria-label={w[10]}>⟳</button>{#if candidate}<button type="button" disabled={!ready||!!writing} on:click={validate}>{w[7]}</button>{/if}</div>{/if}
 {#if copy}<small>{tw[1]}</small><button type="button" on:click={apply}>{cw[0]}</button><a href={copy.url} download={copy.name}>{tw[2]}</a>{/if}{#if error}<small role="alert">{w[5]}</small>{/if}<button type="button" on:click={cancel}>{w[8]}</button></aside>
 {:else if sceneError}<span class="copied" role="alert">{sceneError}</span>{:else if copied||$worldFurnitureCut}<span class="copied" role="status">{$worldFurnitureCut?cutText[1]:w[3]} · {$worldFurnitureClipboard.length}</span>{:else if error}<span class="copied" role="alert">{cutText[3]}</span>{/if}
{/if}
<style>
 .scene-file-input{display:none}.group-paste .scene-required{display:grid;max-height:25vh;overflow:auto}.scene-row{align-items:center}.scene-row img{width:24px;height:24px;object-fit:contain}.scene-row span{flex:1}.shortage{color:#e35d6a}.group-paste{position:absolute;right:6px;top:52px;z-index:9;display:grid;gap:5px;width:min(270px,calc(100% - 12px));background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);padding:8px;border-radius:6px}.group-paste div{display:flex;flex-wrap:wrap;gap:4px}.paste-images img{width:32px;height:32px;object-fit:contain}button,a{font:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);color:inherit;border-radius:4px;padding:5px}button:disabled{opacity:.45}a{color:var(--wand-accent)}.copied{position:absolute;bottom:6px;right:6px;z-index:7;background:var(--wand-card);padding:4px 8px;border-radius:4px;font-size:12px}
</style>
