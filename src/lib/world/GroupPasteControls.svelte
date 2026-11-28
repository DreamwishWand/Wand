<script lang="ts">
 import {readPresetText} from '../presets/preset-file.ts';
 import PresetFilePicker from './PresetFilePicker.svelte';
 import {savePresetFile,rememberPreset} from './preset-session.ts';
 import {SCENE_SCHEMAS} from './preset-session-format.ts';
 let scenePicker:PresetFilePicker;
 import {onDestroy} from 'svelte';
 import {browser} from '$app/environment';
 import {base} from '$app/paths';
 import {commitWorldCheckpoint} from '../ui/local-save-session.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {testSaveExportEnabled,testSaveWords} from './test-save-export.ts';
 import {captureFurnitureGroup,worldFurnitureClipboard,worldFurnitureCut,groupPasteWords,groupCutWords,captureCutWitness,cutClipboardMatches,groupCutPlan,groupPasteCandidate,rotateFurnitureGroup,groupStockAvailable,groupSceneOrigin,groupSceneWords,groupSymmetryWords,symmetricWorldCandidate,savedWorldGroupPoses,groupCandidatePoses,localSupportDuplicateSelection,storageGroupSelection,storageGroupPlan,storageGroupWords,nativeDuplicateSelection,type StorageDuplicateSource,type WorldGroupPose,type WorldSymmetryAxis,type GroupPasteCandidate,type CutWitness,type CutClipboard} from './group-paste.ts';
 import {parseFurnitureStock} from './furniture-stock-view.ts';
 import {worldArtwork} from './world-artwork.ts';
 import {DESIGN_FILE_LIMIT,type DesignClipItem,type DesignItemGeometry} from './design-layout.ts';
 import {WORLD_BATCH_LIMIT} from './saved-map-batch.ts';
 import WorldSymmetryControls from './WorldSymmetryControls.svelte';
 import type {DesignSymmetry} from './design-symmetry.ts';
 import {mainlandExtent,sourceWorldScope} from './mainland-world-coordinates.ts';
 import {sceneWords,sceneFromClip,parseSceneAnyFactor,convertSceneFactor,sceneHasDiagonal,sceneItemCounts,type ScenePreset} from './scene-preset.ts';
 import {parseSupportScene,captureSupportScene,SCENE_FURNITURE_LIMIT,mixedSceneCounts,parseMixedScene,mixedSceneFromClip,mixedScenePlacement,mixedPlacementCounts,type MixedScenePlacement,type MixedScenePreset,type SupportScene} from './support-scene.ts';
 import {parseSupportTree} from './subgrid-local.ts';
 import {parseAreaScene,areaSceneFromClip,areaSceneCounts,areaPlacementCounts,captureAreaPoses,areaSceneCandidate,parseSceneNetwork,transformAreaScene,type AreaSceneTransform,type AreaScene,type SceneNetwork,type AreaSceneCandidate} from './area-scene.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {MainlandGrid} from './mainland-world-coordinates.ts';
 import type {TerrainRaster} from './terrain-binding.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let items:readonly MainlandSavedObject[]=[],file:File|null=null,worker:Worker|null=null,grids:readonly MainlandGrid[]=[],rasters:ReadonlyMap<string,TerrainRaster>=new Map(),objects:readonly MainlandSavedObject[]=[],omitted=0,locale:WandLanguage='ja',blocked=false,nextRequest:()=>number,onBegin:()=>void=()=>{},active=false,ghost:GroupPasteCandidate|null=null,axis:WorldSymmetryAxis|null=null,freePlacement=false;
 const areaTransformWords={ja:['左右反転','上下反転'],en:['Flip horizontally','Flip vertically'],fr:['Miroir horizontal','Miroir vertical'],it:['Rifletti orizzontalmente','Rifletti verticalmente'],de:['Horizontal spiegeln','Vertikal spiegeln'],'es-ES':['Voltear horizontalmente','Voltear verticalmente'],'zh-CN':['水平翻转','垂直翻转'],'pt-BR':['Inverter horizontalmente','Inverter verticalmente']} as const;
 const allowed=browser&&testSaveExportEnabled(window.location);
 let clip:readonly DesignClipItem[]=[],defs=new Map<number,Map<number,DesignItemGeometry>>(),pending=new Map<number,{key:string;factor:1|2}>(),counts:Map<number,number>|null=null;
 let read:Worker|null=null,writing:Worker|null=null,subscribed:Worker|null=null,source:File|null=null,point:{x:number;y:number}|null=null,candidate:GroupPasteCandidate|null=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null,error=false,copied=false;
 let images=new Map<number,string>(),cutRows:CutWitness[]|null=null,activeCut:CutClipboard|null=null;
 let storageSources:(StorageDuplicateSource|null)[]|null=null,copyStorageContents=false,nativeSources:CutWitness[]|null=null;
 let lastFree=false;
 $: if(freePlacement!==lastFree){lastFree=freePlacement;cancel();}
 let symmetry:DesignSymmetry|null=null,symmetryOpen=false,symmetryPicking=false,mirrorOnly:WorldGroupPose[]|null=null;
 $: frame=mainlandExtent(grids);
 $: scope=grids[0]?sourceWorldScope(grids[0]):'';
 $: axis=symmetry?{mode:symmetry.mode,x:frame.x+symmetry.x2/2,y:frame.y+frame.h-symmetry.y2/2}:null;
 let areaScene:AreaScene|null=null;
 let supportScene:MixedScenePreset|null=null,supportRequest=0,supportValid=false,captureWorker:Worker|null=null;
 let sceneInput:HTMLInputElement,scene:ScenePreset|null=null,sceneAnchor:ScenePreset['anchor']='corner',sceneReading=false,sceneEpoch=0,sceneError='',sceneNames=new Map<number,string>();
 $: w=groupPasteWords[locale];$: sy=groupSymmetryWords[locale];$: st=sceneWords[locale];$: gs=groupSceneWords[locale];$: cutText=groupCutWords[locale];
 $: if($worldFurnitureCut&&$worldFurnitureCut.file!==file){worldFurnitureCut.set(null);worldFurnitureClipboard.set([]);copied=false;}
 $: remainingObjects=cutRows?objects.filter(p=>!cutRows?.some(r=>r.localOrdinal===p.object.localOrdinal&&r.area===p.area)):objects;$: cw=checkpointWords[locale];$: tw=testSaveWords[locale];
 $: selection=captureFurnitureGroup(items,false,freePlacement);
 $: nativeOperation=!!nativeSources||!!cutRows?.some(r=>Math.floor(Number(r.itemId)/100000)!==400);
 $: freeGroup=freePlacement&&!areaScene&&(!scene||scene.items.every(p=>Math.floor(p.itemId/100000)===400));
 $: if(worker!==subscribed){subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);cancel();}
 $: if(active&&(source!==file||blocked))cancel();
 $: required=areaScene?areaSceneCounts(areaScene.items):supportScene?mixedSceneCounts(supportScene.items):sceneItemCounts(clip);
 $: geometryReady=active&&(!supportScene&&!areaScene||supportValid)&&!pending.size&&clip.length>0&&clip.every(p=>defs.has(p.itemId))&&(!activeCut||cutClipboardMatches(activeCut,file,scope,objects,freePlacement));
 $: baseReady=geometryReady&&!!counts&&(supportScene||areaScene?[...required].every(([id,n])=>(counts!.get(id)??0)>=n):groupStockAvailable(clip,counts));
 $: anchorPoint=point&&(scene||supportScene||areaScene)?groupSceneOrigin(clip,defs,grids,rasters,point,sceneAnchor,freeGroup):point;
 $: preview=geometryReady?(areaScene?anchorPoint?areaSceneCandidate(areaScene,grids,rasters,defs,remainingObjects,omitted,anchorPoint.x,anchorPoint.y,axis):null:supportScene?anchorPoint?mixedScenePlacement(clip,supportScene,anchorPoint,axis,grids,rasters,defs,remainingObjects,omitted,freeGroup):null:previewGroup(clip,anchorPoint,axis,mirrorOnly,grids,rasters,defs,remainingObjects,omitted,required,counts,baseReady,!!scene,freeGroup,new Set((nativeSources??cutRows)?.filter(r=>r.supportFactor).map(r=>Number(r.itemId))),nativeOperation)):null;
 $: ghost=candidate??(preview&&(!cutRows||groupCutPlan(cutRows,preview,freeGroup))?preview:null);
 $: actualRequired=areaScene?ghost&&'areaRows' in ghost?areaPlacementCounts(ghost as AreaSceneCandidate):required:supportScene?ghost&&'supportRows' in ghost?mixedPlacementCounts(ghost as MixedScenePlacement):required:ghost?sceneItemCounts(groupCandidatePoses(ghost).map(p=>({itemId:p.itemId,dx:0,dy:0,orientation:p.orientation}))):required;
 $: ready=geometryReady&&!!counts&&(axis||mirrorOnly?!!ghost&&[...actualRequired].every(([id,n])=>(counts!.get(id)??0)>=n):baseReady);
 function previewGroup(clip:readonly DesignClipItem[],point:{x:number;y:number}|null,axis:WorldSymmetryAxis|null,mirror:WorldGroupPose[]|null,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,defs:Map<number,Map<number,DesignItemGeometry>>,objects:readonly MainlandSavedObject[],omitted:number,required:Map<number,number>,counts:Map<number,number>|null,baseReady:boolean,scene:boolean,free=false,verifiedSupport:ReadonlySet<number>=new Set(),native=false){
  // Stock is evaluated independently from shape preview. All final rows must
  // pass actual stock checks before the worker is called.
  const capacity=new Map([...required].map(([id,n])=>[id,n*2]));
  if(mirror)return axis?symmetricWorldCandidate(mirror,axis,false,grids,rasters,defs,capacity,objects,omitted):null;
  if(!point||!scene&&!axis&&!baseReady)return null;
  const base=groupPasteCandidate(clip,grids,rasters,defs,scene||axis?required:counts!,objects,omitted,point.x,point.y,free,verifiedSupport,native);
  return base&&axis?symmetricWorldCandidate(groupCandidatePoses(base),axis,true,grids,rasters,defs,capacity,objects,omitted):base;
 }
 function changeSymmetry(value:DesignSymmetry|null){
  if(writing||copy||cutRows||storageSources||freeGroup)return;
  symmetry=value;symmetryPicking=false;candidate=null;error=false;
 }
 function chooseMirror(){if(!preview||writing||copy||symmetryPicking)return;candidate=preview;error=false;}
 export function beginMirror(){
  if(freePlacement)return false;
  const poses=savedWorldGroupPoses(items);
  if(!poses||!begin(true))return false;
  mirrorOnly=poses;symmetryOpen=true;
  const x=(Math.min(...poses.map(p=>p.x))+Math.max(...poses.map(p=>p.x)))/2;
  const y=(Math.min(...poses.map(p=>p.y))+Math.max(...poses.map(p=>p.y)))/2;
  symmetry={mode:'vertical',x2:Math.round((x-frame.x)*2),y2:Math.round((frame.y+frame.h-y)*2)};
  symmetryPicking=true;return true;
 }
 function downloadScene(doc:ScenePreset|MixedScenePreset|AreaScene){
   savePresetFile(JSON.stringify(doc),'wand-scene.json');
 }
 export function saveScene(captureItems:readonly MainlandSavedObject[]=items){
  if(blocked||captureWorker)return;
  const flat=captureFurnitureGroup(captureItems,false,freePlacement);
  if(flat){try{const half=sceneFromClip(flat,2);downloadScene(convertSceneFactor(half,1)??half);}catch{sceneError=gs[2];}return;}
  const selected=[...captureItems],mixedPoses=freePlacement?captureFurnitureGroup(selected,true,true):null,areaPoses=mixedPoses?null:captureAreaPoses(selected),poses=areaPoses??mixedPoses??captureFurnitureGroup(selected,true),f=file;
  if(!f||!poses||!areaPoses&&(poses.length>SCENE_FURNITURE_LIMIT||!selected.some(p=>p.object.subgrid)))return;
  const networks=areaPoses?selected.filter(p=>p.object.layer==='ground'||p.object.layer==='fence').map(p=>({localOrdinal:p.object.localOrdinal,itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y})):[];
  const parents=selected.filter(p=>p.object.subgrid).map(p=>({localOrdinal:p.object.localOrdinal,itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y}));
  const own=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});captureWorker=own;sceneError='';
  const done=(d:any)=>{
   own.terminate();if(captureWorker!==own)return;captureWorker=null;
   if(file!==f||blocked)return;
   try{
    if(d?.kind!=='subgrids-local'||!Array.isArray(d.results)||d.results.length!==parents.length)throw Error('tree');
    const supports=selected.map(p=>{
     if(!p.object.subgrid)return null;
     const match=d.results.find((x:any)=>x.localOrdinal===p.object.localOrdinal);
     const scene=captureSupportScene(Number(p.object.itemId),parseSupportTree(match?.result));if(!scene)throw Error('tree');return scene;
    });
    if(areaPoses){
     if(!Array.isArray(d.networks)||d.networks.length!==networks.length)throw Error('network');
     const modes=selected.map((p,i)=>{if(!networks.some(n=>n.localOrdinal===p.object.localOrdinal))return null;const m=d.networks.find((n:any)=>n.localOrdinal===p.object.localOrdinal);return parseSceneNetwork(m?.network,poses[i].itemId,poses[i].orientation);});
     downloadScene(areaSceneFromClip(poses,supports,modes));
    }else downloadScene(mixedSceneFromClip(poses,supports));
   }catch{sceneError=gs[2];}
  };
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command:'inspect-subgrids',file:f,parents,networks});
 }
 export function chooseScene(){if(!allowed||blocked||!file||!worker||sceneReading)return;scenePicker?.open();}
 async function openScene(e:Event){
  const input=e.currentTarget as HTMLInputElement,f=input.files?.[0];input.value='';if(f)void openSceneFile(f);
 }
 async function openSceneFile(f:File){
  if(!allowed||blocked||!file||!worker||sceneReading)return;
  const original=file,own=worker,epoch=++sceneEpoch;sceneReading=true;sceneError='';
  try{
   if(f.size>DESIGN_FILE_LIMIT)throw Error('size');
   const raw=await readPresetText(f,DESIGN_FILE_LIMIT);void rememberPreset(f,raw).catch(()=>{});
   if(epoch!==sceneEpoch||file!==original||worker!==own||blocked)return;
   let areaDoc:AreaScene|null=null;try{areaDoc=parseAreaScene(raw);}catch{/* Other Scene formats below. */}
   if(areaDoc){if(!begin(false,null,null,areaDoc))sceneError=gs[2];return;}
   let supportDoc:MixedScenePreset|null=null;
   try{supportDoc=parseMixedScene(raw);}catch{try{const single=parseSupportScene(raw);supportDoc=mixedSceneFromClip([{itemId:single.ownerItemId,dx:0,dy:0,orientation:2}],[single],'corner');}catch{/* Flat Scene parser below. */}}
   if(supportDoc){if(!begin(false,null,supportDoc))sceneError=gs[2];return;}
   const doc=convertSceneFactor(parseSceneAnyFactor(raw),2);
   if(epoch!==sceneEpoch||file!==original||worker!==own||blocked)return;
   if(!doc)throw Error('factor');
   if(doc.items.length>WORLD_BATCH_LIMIT){sceneError=gs[3];return;}
   if(!begin(false,doc))sceneError=gs[2];
  }catch{if(epoch===sceneEpoch)sceneError=gs[2];}finally{if(epoch===sceneEpoch)sceneReading=false;}
 }
 function changeAnchor(a:ScenePreset['anchor']){if(writing||copy)return;sceneAnchor=a;candidate=null;}
 export function capture(cut=false){const captured=cut?captureFurnitureGroup(items,true,freePlacement,true):selection;if(!allowed||blocked||!captured||!file)return false;const rows=cut?captureCutWitness(items,freePlacement):null;if(cut&&!rows)return false;worldFurnitureCut.set(rows?{file,scope,rows}:null);worldFurnitureClipboard.set(captured);copied=true;return true;}
 function beginLocalSupportDuplicate(){
  const captured=localSupportDuplicateSelection(items,freePlacement),f=file;
  if(!captured||!f||!allowed||blocked||!worker||captureWorker)return false;
  const selected=[...items],parents=selected.filter(p=>p.object.subgrid).map(p=>({localOrdinal:p.object.localOrdinal,itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y}));
  if(!parents.length)return false;
  const own=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});captureWorker=own;sceneError='';
  const done=(d:any)=>{
   own.terminate();if(captureWorker!==own)return;captureWorker=null;
   if(file!==f||blocked||items.length!==selected.length||items.some((p,i)=>p.object.localOrdinal!==selected[i].object.localOrdinal))return;
   try{
    if(d?.kind!=='subgrids-local'||!Array.isArray(d.results)||d.results.length!==parents.length)throw Error('tree');
    const supports=selected.map(p=>{if(!p.object.subgrid)return null;const match=d.results.find((x:any)=>x.localOrdinal===p.object.localOrdinal);const scene=captureSupportScene(Number(p.object.itemId),parseSupportTree(match?.result));if(!scene)throw Error('tree');return scene;});
    if(!begin(true,null,mixedSceneFromClip(captured.clip,supports),null,captured.sources))throw Error('placement');
   }catch{sceneError=gs[2];}
  };
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command:'inspect-subgrids',file:f,parents});return true;
 }
 export function begin(duplicate=false,sceneDoc:ScenePreset|null=null,supportDoc:MixedScenePreset|null=null,areaDoc:AreaScene|null=null,localStorageSources:StorageDuplicateSource[]| (StorageDuplicateSource|null)[]|null=null){
  const native=duplicate&&!sceneDoc&&!supportDoc&&!areaDoc?nativeDuplicateSelection(items,freePlacement):null;
  if(!native&&duplicate&&!sceneDoc&&!supportDoc&&!areaDoc&&items.some(p=>p.object.subgrid))return beginLocalSupportDuplicate();
  const storage=duplicate&&!sceneDoc&&!supportDoc&&!areaDoc?storageGroupSelection(items,freePlacement):null;
  const data=areaDoc?areaDoc.items.map(({support,network,...p})=>p):supportDoc?supportDoc.items.map(({support,...p})=>p):sceneDoc?sceneDoc.items:duplicate?(native?.clip??storage?.clip??selection):$worldFurnitureClipboard,cut=duplicate||sceneDoc||supportDoc||areaDoc?null:$worldFurnitureCut;
  if(!allowed||blocked||!file||!worker||!data?.length||!grids.length||sceneHasDiagonal(data)&&(!freePlacement||!!areaDoc||data.some((p,i)=>!Number.isInteger(p.orientation)&&(!!cut?.rows[i]?.supportFactor||!!cut?.rows[i]?.storage||!!supportDoc?.items[i]?.support||!!localStorageSources?.[i]))))return false;
  if(cut&&!cutClipboardMatches(cut,file,scope,objects,freePlacement)){error=true;return false;}
  cancel();onBegin();source=file;active=true;clip=[...data];nativeSources=native?.sources??null;storageSources=native?null:localStorageSources??storage?.sources??null;copied=false;cutRows=cut?.rows??null;activeCut=cut;scene=sceneDoc;supportScene=supportDoc;areaScene=areaDoc;sceneAnchor=areaDoc?.anchor??supportDoc?.anchor??sceneDoc?.anchor??'corner';
  if(supportDoc||areaDoc){supportRequest=nextRequest();worker.postMessage({command:areaDoc?'area-scene-geometry':'mixed-scene-geometry',requestId:supportRequest,scene:areaDoc??supportDoc,locale});}
  if(cutRows){counts=new Map();for(const p of clip)counts.set(p.itemId,(counts.get(p.itemId)??0)+1);}
  else {const f=file,own=new Worker(new URL('./furniture-stock-view.worker.ts',import.meta.url),{type:'module'});read=own;
  const done=(raw:unknown)=>{own.terminate();if(read!==own||file!==f)return;read=null;try{counts=parseFurnitureStock(raw);if(nativeSources){const capacity=new Map<number,number>();for(const p of clip)if(Math.floor(p.itemId/100000)!==400)capacity.set(p.itemId,(capacity.get(p.itemId)??0)+1);for(const [id,n] of capacity)counts.set(id,n);}if(!scene&&!supportScene&&!areaScene&&!symmetry&&!mirrorOnly&&!groupStockAvailable(clip,counts))error=true;}catch{error=true;}};
  own.onmessage=e=>done(e.data?.kind==='furniture-stock'?e.data.result:null);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command:'read-furniture-stock',file:f});}
  const ids=[...new Set(clip.map(p=>p.itemId))],factors=new Set<number>(),free=freePlacement&&!areaDoc&&(!sceneDoc||sceneDoc.items.every(p=>Math.floor(p.itemId/100000)===400));
  for(const g of grids){if(factors.has(g.factor))continue;factors.add(g.factor);const requestId=nextRequest();pending.set(requestId,{key:g.key,factor:g.factor});worker.postMessage({command:'design-shapes',key:g.key,itemIds:ids,requestId,freePlacement:free,allowBuildings:!!native||!!cut?.rows.some(r=>Math.floor(Number(r.itemId)/100000)!==400)});}
  pending=new Map(pending);for(const id of (areaDoc?[...new Set([...ids,...areaSceneCounts(areaDoc.items).keys()])]:supportDoc?[...mixedSceneCounts(supportDoc.items).keys()]:ids))void worldArtwork(base,id).then(url=>{if(url)images=new Map(images).set(id,url);}).catch(()=>{});
  return true;
 }
 function receive(e:MessageEvent){const d=e.data;if(supportRequest&&d?.requestId===supportRequest){supportRequest=0;supportValid=d.kind===(areaScene?'area-scene-geometry':'mixed-scene-geometry')&&d.valid===true;if(!supportValid)error=true;else if(Array.isArray(d.names))sceneNames=new Map([...sceneNames,...d.names.filter((v:unknown)=>Array.isArray(v)&&v.length===2&&Number.isSafeInteger(v[0])&&typeof v[1]==='string')]);return;}const req=pending.get(d?.requestId);if(!req)return;pending.delete(d.requestId);pending=new Map(pending);
  if(d.kind!=='design-shapes'||d.key!==req.key||!Array.isArray(d.result)){error=true;return;}
  const expected=new Set(clip.map(p=>p.itemId));
  if(d.result.length!==expected.size||d.result.some((g:DesignItemGeometry)=>!expected.has(g.itemId)||(g.layer!=='furniture'&&!(nativeOperation&&(g.layer==='landscape'||g.nativeType==='Building'))&&!areaScene?.items.some(p=>p.itemId===g.itemId&&p.network?.kind===(g.layer==='ground'?'road':g.layer==='fence'?'fence':null)))||g.surfaceCapable&&!areaScene?.items.some(p=>p.itemId===g.itemId&&p.support)&&!supportScene?.items.some(p=>p.itemId===g.itemId&&p.support)&&!(nativeSources??cutRows)?.some(r=>r.supportFactor&&Number(r.itemId)===g.itemId)||!g.shapes)){error=true;return;}
  const next=new Map(defs);for(const g of d.result as DesignItemGeometry[]){if(g.name)sceneNames=new Map(sceneNames).set(g.itemId,g.name);const factors=new Map(next.get(g.itemId));factors.set(req.factor,g);next.set(g.itemId,factors);}defs=next;
 }
 export function hover(p:{x:number;y:number}|null){if(active&&!candidate&&!writing&&!copy&&!symmetryPicking&&!mirrorOnly)point=p;}
 export function pick(p:{x:number;y:number}){
  if(writing||copy)return;
  if(symmetryPicking&&symmetry){changeSymmetry({...symmetry,x2:Math.round((p.x-frame.x)*2),y2:Math.round((frame.y+frame.h-p.y)*2)});return;}
  if(!geometryReady)return;
  if(mirrorOnly){chooseMirror();return;}
  const at=scene||supportScene||areaScene?groupSceneOrigin(clip,defs,grids,rasters,p,sceneAnchor,freeGroup):p;
  const q=areaScene?at?areaSceneCandidate(areaScene,grids,rasters,defs,remainingObjects,omitted,at.x,at.y,axis):null:supportScene?at?mixedScenePlacement(clip,supportScene,at,axis,grids,rasters,defs,remainingObjects,omitted,freeGroup):null:previewGroup(clip,at,axis,null,grids,rasters,defs,remainingObjects,omitted,required,counts,baseReady,!!scene,freeGroup,new Set((nativeSources??cutRows)?.filter(r=>r.supportFactor).map(r=>Number(r.itemId))),nativeOperation);
  if(!q||cutRows&&!groupCutPlan(cutRows,q,freeGroup)){error=true;return;}candidate=q;point=p;error=false;
 }
 function transformArea(mode:AreaSceneTransform){
  if(!areaScene||!geometryReady||writing||copy)return;
  const next=transformAreaScene(areaScene,defs,mode);if(!next){error=true;return;}
  areaScene=next;clip=next.items.map(({support,network,...p})=>p);candidate=null;error=false;
 }
 export function turn(delta:number){if(!geometryReady||writing||copy||mirrorOnly||nativeOperation)return;if(areaScene){transformArea(delta>0?'right':'left');return;}const q=rotateFurnitureGroup(clip,defs,delta);if(!q||supportScene&&q.some((p,i)=>p.itemId!==supportScene!.items[i]?.itemId)){error=true;return;}clip=q;candidate=null;error=false;}
 export function validate(){
  if(!active||!allowed||blocked||!ready||!file||source!==file||!candidate||writing||copy)return;
  const f=file,q=candidate,plan=nativeSources?groupCutPlan(nativeSources,q,freeGroup):cutRows?groupCutPlan(cutRows,q,freeGroup):q.rows;
  if(!plan||!counts||!cutRows&&!areaScene&&![...sceneItemCounts(q.rows.map(p=>({itemId:Number(p.itemId),dx:0,dy:0,orientation:0})))].every(([id,n])=>(counts!.get(id)??0)>=n)||activeCut&&!cutClipboardMatches(activeCut,file,scope,objects,freePlacement)){error=true;return;}
  if(supportScene&&(!supportValid||!('supportRows' in q)||![...mixedPlacementCounts(q as MixedScenePlacement)].every(([id,n])=>(counts!.get(id)??0)>=n)))return;
  if(areaScene&&(!supportValid||!('areaRows' in q)||![...areaPlacementCounts(q as AreaSceneCandidate)].every(([id,n])=>(counts!.get(id)??0)>=n)))return;
  const output=nativeSources?{mixedNativeDuplicate:{rows:plan,copyContents:copyStorageContents}}:storageSources?storageGroupPlan(storageSources,q,copyStorageContents,freeGroup):areaScene?(q as AreaSceneCandidate).areaRows:supportScene?(q as MixedScenePlacement).supportRows:plan;
  if(!output){error=true;return;}
  const own=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});writing=own;error=false;
  const done=(d:any)=>{own.terminate();if(writing!==own||file!==f||candidate!==q){d?.bytes?.fill(0);return;}writing=null;try{if(d?.kind!=='furniture-stock-copy')throw Error('copy');copy=experimentalCopyDownload(d,f);}catch{d?.bytes?.fill(0);error=true;}};
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command:cutRows?'group-cut-export':'group-paste-export',file:f,plan:nativeSources||storageSources?output:freeGroup?{freePlacement:true,rows:output}:output,allowExperimentalCopy:true});
 }
 function apply(){if(!allowed||blocked||!copy||!file||source!==file)return;if(activeCut&&!cutClipboardMatches(activeCut,file,scope,objects,freePlacement)){error=true;return;}if(!commitWorldCheckpoint(file,copy.file)){error=true;return;}if(cutRows){worldFurnitureCut.set(null);worldFurnitureClipboard.set([]);}cancel();}
 export function cancel(){captureWorker?.terminate();captureWorker=null;read?.terminate();writing?.terminate();read=null;writing=null;if(copy)URL.revokeObjectURL(copy.url);copy=null;active=false;source=null;clip=[];cutRows=null;activeCut=null;nativeSources=null;storageSources=null;copyStorageContents=false;mirrorOnly=null;symmetry=null;symmetryOpen=false;symmetryPicking=false;scene=null;areaScene=null;supportScene=null;supportRequest=0;supportValid=false;sceneAnchor='corner';sceneEpoch++;sceneReading=false;sceneError='';defs=new Map();pending=new Map();counts=null;point=null;candidate=null;error=false;}
 onDestroy(()=>{cancel();subscribed?.removeEventListener('message',receive);});
</script>
<input class="scene-file-input" type="file" accept=".wandpreset,.json,.gz,application/json,application/gzip" bind:this={sceneInput} on:change={openScene}/>
{#if allowed}
 <PresetFilePicker bind:this={scenePicker} {locale} schemas={SCENE_SCHEMAS} disabled={blocked||!file||!worker||sceneReading} showTrigger={false} onPick={f=>void openSceneFile(f)}/>
 {#if active}<aside class="group-paste" aria-label={w[1]}><strong>{scene||supportScene||areaScene?'Scene':cutRows?cutText[2]:w[1]} · {clip.length}</strong><div class="paste-images">{#each clip as p}{#if images.has(p.itemId)}<img src={images.get(p.itemId)} alt="" loading="lazy"/>{/if}{/each}</div>{#if read||pending.size||supportRequest||writing}<small role="status">{w[6]}</small>{:else if geometryReady&&!candidate}<small>{w[4]}</small>{/if}
 {#if (storageSources||nativeSources?.some(r=>r.storage))&&!copy}<label><input type="checkbox" bind:checked={copyStorageContents} disabled={!!writing}/>{storageGroupWords[locale]}</label>{/if}
 {#if !cutRows&&!storageSources&&!copy&&!freeGroup}<button type="button" disabled={!!writing} aria-pressed={symmetryOpen} on:click={()=>symmetryOpen=!symmetryOpen} aria-label={sy[0]}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 2v20M9 6 3 12l6 6ZM15 6l6 6-6 6Z"/></svg></button>{#if symmetryOpen}<WorldSymmetryControls {locale} value={symmetry} width={frame.w} height={frame.h} picking={symmetryPicking} count={clip.length} valid={!!preview} busy={!!writing} onChange={changeSymmetry} onPick={()=>{symmetryPicking=!symmetryPicking;candidate=null;}} onMirror={chooseMirror}/>{/if}{/if}
 {#if scene||supportScene||areaScene||symmetry||mirrorOnly}<small>{gs[0]}</small><div class="scene-required">{#each [...actualRequired] as [id,n] (id)}<div class="scene-row">{#if images.has(id)}<img src={images.get(id)} alt="" loading="lazy"/>{/if}<span>{sceneNames.get(id)??'—'}</span><strong class:shortage={!!counts&&(counts.get(id)??0)<n}>{counts?counts.get(id)??0:'—'} / {n}</strong></div>{/each}</div>{#if counts&&ghost&&!ready&&geometryReady}<small role="alert">{gs[1]}</small>{/if}{#if scene||supportScene||areaScene}<div><button type="button" disabled={!!writing||!!copy} aria-pressed={sceneAnchor==='center'} on:click={()=>changeAnchor('center')}>{st[2]}</button><button type="button" disabled={!!writing||!!copy} aria-pressed={sceneAnchor==='corner'} on:click={()=>changeAnchor('corner')}>{st[3]}</button></div>{/if}{/if}
 {#if !copy}<div><button type="button" disabled={!geometryReady||!!writing||!!mirrorOnly||nativeOperation} on:click={()=>turn(-1)} aria-label={w[9]}>⟲</button><button type="button" disabled={!geometryReady||!!writing||!!mirrorOnly||nativeOperation} on:click={()=>turn(1)} aria-label={w[10]}>⟳</button>{#if areaScene}<button type="button" disabled={!geometryReady||!!writing} aria-label={areaTransformWords[locale][0]} title={areaTransformWords[locale][0]} on:click={()=>transformArea('vertical')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v18M9 6 3 12l6 6ZM15 6l6 6-6 6Z"/></svg></button><button type="button" disabled={!geometryReady||!!writing} aria-label={areaTransformWords[locale][1]} title={areaTransformWords[locale][1]} on:click={()=>transformArea('horizontal')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12h18M6 9l6-6 6 6ZM6 15l6 6 6-6Z"/></svg></button>{/if}{#if candidate}<button type="button" disabled={!ready||!!writing} on:click={validate}>{w[7]}</button>{/if}</div>{/if}
 {#if copy}<small>{tw[1]}</small><button type="button" on:click={apply}>{cw[0]}</button><a href={copy.url} download={copy.name}>{tw[2]}</a>{/if}{#if error}<small role="alert">{w[5]}</small>{/if}<button type="button" on:click={cancel}>{w[8]}</button></aside>
 {:else if captureWorker}<span class="copied" role="status">{w[6]}</span>{:else if sceneError}<span class="copied" role="alert">{sceneError}</span>{:else if copied||$worldFurnitureCut}<span class="copied" role="status">{$worldFurnitureCut?cutText[1]:w[3]} · {$worldFurnitureClipboard.length}</span>{:else if error}<span class="copied" role="alert">{cutText[3]}</span>{/if}
{/if}
<style>
 .scene-file-input{display:none}.group-paste .scene-required{display:grid;max-height:25vh;overflow:auto}.scene-row{align-items:center}.scene-row img{width:24px;height:24px;object-fit:contain}.scene-row span{flex:1}.shortage{color:#e35d6a}.group-paste{position:absolute;right:6px;top:52px;z-index:9;display:grid;gap:5px;width:min(270px,calc(100% - 12px));background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);padding:8px;border-radius:6px}.group-paste div{display:flex;flex-wrap:wrap;gap:4px}.paste-images img{width:32px;height:32px;object-fit:contain}button,a{font:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);color:inherit;border-radius:4px;padding:5px}button:disabled{opacity:.45}a{color:var(--wand-accent)}.copied{position:absolute;bottom:6px;right:6px;z-index:7;background:var(--wand-card);padding:4px 8px;border-radius:4px;font-size:12px}
</style>
