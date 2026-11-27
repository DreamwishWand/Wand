<script lang="ts">
 import {savePresetFile} from './preset-session.ts';
 import {readPresetText} from '../presets/preset-file.ts';
 import {onDestroy} from 'svelte';
 import {flatSupportScene,supportDesignWords} from './room-design.ts';
 import {parseSceneAnyFactor,convertSceneFactor} from './scene-preset.ts';
 import {captureSupportScene,parseSupportScene,supportSceneCounts,supportScenePlan,supportSceneWords,supportSceneRootCounts,supportSceneTemplateCompatible,supportSceneCreateWords,type SupportScene} from './support-scene.ts';
 import {supportShapeKey,type SupportTree} from './subgrid-local.ts';
 import type {SourceObjectShape} from './source-object-map.ts';
 import type {TerrainRaster} from './terrain-binding.ts';
 import type {SupportParentWitness} from './indoor-support.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {commitWorldCheckpoint} from '../ui/local-save-session.ts';
 import {testSaveWords} from './test-save-export.ts';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {worldArtwork} from './world-artwork.ts';
 export let tree:SupportTree,ownerItemId:number,parent:MainlandSavedObject|null=null,file:File|null,worker:Worker|null,path:readonly number[],counts:ReadonlyMap<number,number>,names:ReadonlyMap<number,string>,base:string,locale:WandLanguage,canMove:boolean,nextRequest:()=>number,onBack:()=>void,onApplied:()=>void,onDuplicate:((scene:SupportScene)=>void)|null=null;
 export let roomParent:SupportParentWitness|null=null;
 $: witness=parent?{localOrdinal:parent.object.localOrdinal,itemId:Number(parent.object.itemId),x:parent.object.x,y:parent.object.y}:roomParent;
 let scene:SupportScene|null=null,shapes:Readonly<Record<string,SourceObjectShape>>={},terrain:TerrainRaster|null=null,allowed=new Set<number>(),request=0,reading=false,error=false,own:Worker|null=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null,epoch=0,source:File|null=null;
 let images=new Map<number,string>(),geometryRequest=0,geometryValid=false,flatRaw:string|null=null,flatImport=false;
 $: sdw=supportDesignWords[locale];
 $: createWords=supportSceneCreateWords[locale];
 $: createNeeds=scene?supportSceneRootCounts(scene):new Map<number,number>();
 $: compatible=!!scene&&path.length===0&&supportSceneTemplateCompatible(scene,ownerItemId,tree);
 $: createReady=!!scene&&!flatImport&&!!onDuplicate&&canMove&&source===file&&compatible&&geometryValid&&[...createNeeds].every(([id,n])=>(counts.get(id)??0)>=n);
 $: w=supportSceneWords[locale];
 $: tw=testSaveWords[locale];
 $: cw=checkpointWords[locale];
 $: capture=captureSupportScene(ownerItemId,tree);
 $: needed=scene?supportSceneCounts(scene.tree):new Map<number,number>();
 $: plan=scene&&source===file&&canMove&&(!flatImport||geometryValid)?supportScenePlan(scene,ownerItemId,tree,shapes,terrain,counts,allowed):null;
 let subscribed:Worker|null=null;
 $: if(worker!==subscribed){subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);if(scene){requestShapes(scene);requestGeometry(scene);}}
 $: if(source&&source!==file)reset();
 function reset(){epoch++;reading=false;own?.terminate();own=null;request=0;geometryRequest=0;geometryValid=false;scene=null;flatRaw=null;flatImport=false;source=null;shapes={};terrain=null;allowed=new Set();images=new Map();if(copy)URL.revokeObjectURL(copy.url);copy=null;error=false;}
 function save(){
  if(!capture)return;
  savePresetFile(JSON.stringify(capture),'wand-support-scene.json');
 }
 async function load(e:Event){
  const input=e.currentTarget as HTMLInputElement,f=input.files?.[0];input.value='';
  if(!f||!file||!canMove)return;
  reset();const token=epoch,original=file;source=original;reading=true;
  try{if(f.size>262144)throw Error('size');const raw=await readPresetText(f,262144);if(epoch!==token||file!==original)return;
   let doc:SupportScene;try{doc=parseSupportScene(raw);}catch{
    const flat=convertSceneFactor(parseSceneAnyFactor(raw),tree.factor);if(!flat||!tree.sourcePath||tree.objects.length||flat.items.length>32||flat.items.some(p=>!Number.isInteger(p.orientation))||!worker)throw Error('flat scene');
    flatRaw=raw;flatImport=true;const items=[...new Set(flat.items.map(p=>p.itemId))].flatMap(itemId=>[0,4,8,12].map(orientationCode=>({itemId,orientationCode})));
    request=nextRequest();worker.postMessage({command:'support-shapes',requestId:request,factor:tree.factor,items,sourcePath:tree.sourcePath,ownerItemId});return;
   }scene=doc;requestShapes(doc);requestGeometry(doc);
   for(const id of supportSceneCounts(doc.tree).keys())void worldArtwork(base,id).then(url=>{if(url&&epoch===token)images=new Map(images).set(id,url);}).catch(()=>{});
  }catch{if(epoch===token)error=true;}finally{if(epoch===token)reading=false;}
 }
 function requestShapes(doc:SupportScene){
  shapes={};terrain=null;allowed=new Set();request=0;
  if(!worker||!tree.sourcePath||doc.ownerItemId!==ownerItemId||doc.tree.sourcePath!==tree.sourcePath||doc.tree.factor!==tree.factor)return;
  const items=[...new Set(doc.tree.objects.map(o=>o.itemId))].flatMap(itemId=>[0,4,8,12].map(orientationCode=>({itemId,orientationCode})));
  request=nextRequest();worker.postMessage({command:'support-shapes',requestId:request,factor:tree.factor,items,sourcePath:tree.sourcePath,ownerItemId});
 }
 function requestGeometry(doc:SupportScene){geometryValid=false;geometryRequest=0;if(!worker||!flatImport&&(!onDuplicate||path.length||!supportSceneTemplateCompatible(doc,ownerItemId,tree)))return;geometryRequest=nextRequest();worker.postMessage({command:'support-scene-geometry',requestId:geometryRequest,scene:doc});}
 function receive(e:MessageEvent){const d=e.data;if(geometryRequest&&d?.requestId===geometryRequest){geometryRequest=0;geometryValid=d.kind==='support-scene-geometry'&&d.valid===true;return;}if(!request||d?.requestId!==request)return;request=0;if(d.kind!=='support-shapes'||!d.shapes||!(d.terrain?.nativeFloorValues instanceof Uint32Array)){error=true;return;}shapes=d.shapes;terrain=d.terrain;allowed=new Set(Array.isArray(d.removable)?d.removable.filter(Number.isSafeInteger):[]);
  if(flatRaw){const raw=flatRaw;flatRaw=null;const doc=flatSupportScene(raw,ownerItemId,tree,shapes,terrain!,allowed);if(!doc){error=true;return;}scene=doc;requestGeometry(doc);const token=epoch;for(const id of supportSceneCounts(doc.tree).keys())void worldArtwork(base,id).then(url=>{if(url&&epoch===token)images=new Map(images).set(id,url);}).catch(()=>{});}
 }
 function validate(){
  if(!plan||!file||source!==file||!canMove||own||copy||!tree.sourcePath||!witness)return;
  const f=file,session=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'}),token=epoch;own=session;error=false;
  const done=(d:any)=>{session.terminate();if(own!==session||file!==f||epoch!==token){d?.bytes?.fill(0);return;}own=null;try{if(d?.kind!=='support-child-copy')throw Error('copy');copy=experimentalCopyDownload(d,f);}catch{error=true;}};
  session.onmessage=e=>done(e.data);session.onerror=()=>done(null);session.onmessageerror=()=>done(null);
  session.postMessage({command:'support-child-copy',file:f,allowExperimentalCopy:true,plan:{localOrdinal:witness.localOrdinal,itemId:witness.itemId,expectedX:witness.x,expectedY:witness.y,path:[...path],terrainPath:tree.sourcePath,stock:plan}});
 }
 function apply(){if(!copy||!file||source!==file||!canMove||!commitWorldCheckpoint(file,copy.file)){error=true;return;}onApplied();}
 onDestroy(()=>{reset();subscribed?.removeEventListener('message',receive);});
</script>
<div class="scene">
 <div class="actions"><strong>{w[0]}</strong><button type="button" on:click={onBack}>{w[7]}</button></div>
 <button type="button" disabled={!capture||!!own} on:click={save}>{w[1]}</button>
 <label title={sdw[2]}>{w[2]}<input type="file" accept=".wandpreset,.json,.gz,application/json,application/gzip" disabled={!canMove||!!own||!!copy} on:change={load}/></label>
 {#if reading||request||geometryRequest||own}<small role="status">…</small>{/if}
 {#if scene}
  <strong>{names.get(scene.ownerItemId)??'—'} · {w[4]}</strong>
  <div class="required">{#each [...needed] as [id,n]}<div>{#if images.get(id)}<img src={images.get(id)} alt=""/>{/if}<span>{names.get(id)??'—'}</span><span class:shortage={(counts.get(id)??0)<n}>{counts.get(id)??0}/{n}</span></div>{/each}</div>
  {#if terrain}<svg viewBox={'0 0 '+terrain.sizeX*tree.factor+' '+terrain.sizeY*tree.factor} aria-label={w[0]} role="img">
    {#each Array.from(terrain.nativeFloorValues) as cell,i}<rect x={(i%terrain.sizeX)*tree.factor} y={Math.floor(i/terrain.sizeX)*tree.factor} width={tree.factor} height={tree.factor} fill={cell?'#6ba98b':'#8b5555'} fill-opacity=".3" stroke="currentColor" stroke-opacity=".2" vector-effect="non-scaling-stroke"/>{/each}
    {#each scene.tree.objects as o}{@const key=supportShapeKey(o)}{@const shape=key?shapes[key]:null}{#if shape}<g transform={'translate('+o.x+' '+o.y+')'}><path d={shape.path} fill={plan?'#4bddcd':'#c45b5b'} fill-opacity=".5" stroke="currentColor" vector-effect="non-scaling-stroke"/>{#if images.get(o.itemId)}<image href={images.get(o.itemId)} width={shape.width} height={shape.height}/>{/if}</g>{/if}{/each}
  </svg>{/if}
  {#if !plan&&!reading&&!request}<small role="status">{w[5]}</small>{/if}
  {#if !copy}<button type="button" disabled={!plan||!!own} on:click={validate}>{w[3]}</button>{/if}
  {#if onDuplicate&&!flatImport&&path.length===0&&!copy}<small>{createWords[1]}</small><div class="required"><div><span>{names.get(scene.ownerItemId)??'—'}</span><span class:shortage={(counts.get(scene.ownerItemId)??0)<(createNeeds.get(scene.ownerItemId)??0)}>{counts.get(scene.ownerItemId)??0}/{createNeeds.get(scene.ownerItemId)??0}</span></div></div><button type="button" disabled={!createReady||!!own} on:click={()=>{if(scene&&createReady)onDuplicate?.(scene);}}>{createWords[0]}</button>{#if !createReady&&!reading&&!geometryRequest}<small>{createWords[2]}</small>{/if}{/if}
 {/if}
 {#if copy}<small>{tw[1]}</small><button type="button" disabled={!canMove} on:click={apply}>{cw[0]}</button><a href={copy.url} download={copy.name}>{tw[2]}</a>{/if}
 {#if error}<small role="alert">{w[6]}</small>{/if}
</div>
<style>
 .scene{display:grid;gap:6px}.actions,.required>div{display:flex;align-items:center;gap:6px;justify-content:space-between}.required{max-height:180px;overflow:auto}.required img{width:32px;height:32px;object-fit:contain}.required span:first-of-type{flex:1}.shortage{color:#e35d6a}svg{width:100%;height:180px;background:var(--wand-menu)}button,a,input{font:inherit;color:inherit}button,a{background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:4px;padding:5px}label{display:grid;gap:4px}small{font-size:.8em}
</style>
