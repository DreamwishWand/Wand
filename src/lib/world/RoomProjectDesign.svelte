<script lang="ts">
 import {readPresetText} from '../presets/preset-file.ts';
 import PresetFilePicker from './PresetFilePicker.svelte';
 import {savePresetFile,rememberPreset} from './preset-session.ts';
 import {onDestroy,onMount} from 'svelte';
 import DecorationDesign from './DecorationDesign.svelte';
 import {roomProjectWords,newRoomSurface,serializeRoomProject,parseRoomProject,roomProjectCounts,ROOM_PROJECT_FILE_LIMIT,ROOM_PROJECT_WALL_LIMIT,ROOM_PROJECT_DRAFT_KEY,type RoomProjectSurface} from './room-project-design.ts';
 import {roomDesignValid,type RoomDesignTemplate} from './room-design.ts';
 import {readDesignDraft,changeLocalWorldDraft} from './design-draft.ts';
 import {designAttachments,type EmbeddedSupportDesign} from './design-support-attachment.ts';
 import {currentDesign,type DesignItemGeometry,type DesignTimeline} from './design-layout.ts';
 import {roomFinishIdValid,type RoomFinishItem} from './room-finish-design.ts';
 import {defaultWorldLayers,type WorldLayerState} from './world-layer-state.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 import {worldArtwork} from './world-artwork.ts';
 import {base} from '$app/paths';
 export let templates:readonly RoomDesignTemplate[]=[],worker:Worker|null=null,locale:WandLanguage='ja',nextRequest:()=>number,onClose:()=>void;
 export let onBusy:(busy:boolean)=>void=()=>{};
 export let layerState:WorldLayerState=defaultWorldLayers();
 let surfaces:RoomProjectSurface[]=[],selected=0,nextId=1,embedded:EmbeddedSupportDesign|null=null,mountKey=0,floorKey='',wallKey='',childBusy=false,loading=true,validating=false,error=false,showCounts=false,input:HTMLInputElement;
 let recovery:{revision:string;draft:unknown}|undefined,revision:string|null=null,writable=true,warning=false,writePending=false,writeQueue:Promise<void>=Promise.resolve(),writeCount=0,alive=true,epoch=0;
 let seen:Worker|null=null,names=new Map<number,string>(),images=new Map<number,string>(),asked=new Set<number>(),nameRequest=0,nameSignature='',query='',limit=80;
 const requests=new Map<number,{resolve:(value:any)=>void;reject:(reason:Error)=>void}>();
 $: w=roomProjectWords[locale];
 $: floors=templates.filter(t=>t.kind==='floor');
 $: walls=templates.filter(t=>t.kind==='wall');
 $: if(!floors.some(t=>t.grid.key===floorKey))floorKey=floors[0]?.grid.key??'';
 $: if(!walls.some(t=>t.grid.key===wallKey))wallKey=walls[0]?.grid.key??'';
 $: activeSurface=surfaces.find(s=>s.id===selected)??null;
 $: blocked=loading||validating||!!recovery||childBusy;
 $: onBusy(blocked);
 $: totals=roomProjectCounts(surfaces);
 $: countIds=[...new Set([...totals.furniture.keys(),...totals.finishes.keys()])];
 $: signature=locale+':'+countIds.slice().sort((a,b)=>a-b).join(',');
 $: if(showCounts&&worker&&signature!==nameSignature){nameSignature=signature;nameRequest=nextRequest();worker.postMessage({command:'room-project-names',requestId:nameRequest,itemIds:countIds,locale});}
 $: countRows=[...totals.furniture].filter(([id])=>(names.get(id)??'').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0,limit);
 $: if(showCounts)loadArt([...countRows.map(([id])=>id),...totals.finishes.keys()]);
 $: if(worker!==seen)subscribe(worker);
 function subscribe(next:Worker|null){seen?.removeEventListener('message',receive);for(const job of requests.values())job.reject(Error('worker changed'));requests.clear();seen=next;seen?.addEventListener('message',receive);nameSignature='';}
 function receive(e:MessageEvent){const d=e.data,job=requests.get(d?.requestId);if(job){requests.delete(d.requestId);if(d.kind==='error')job.reject(Error('validation'));else job.resolve(d);return;}
  if(nameRequest&&d?.requestId===nameRequest){nameRequest=0;if(d.kind==='room-project-names'&&Array.isArray(d.names))names=new Map(d.names);}}
 function request(own:Worker,data:Record<string,unknown>):Promise<any>{
  if(!alive||own!==worker)return Promise.reject(Error('worker changed'));
  return new Promise((resolve,reject)=>{const id=nextRequest();requests.set(id,{resolve,reject});try{own.postMessage({...data,requestId:id});}catch{requests.delete(id);reject(Error('request'));}});
 }
 function loadArt(ids:number[]){for(const id of ids){if(asked.has(id))continue;asked.add(id);void worldArtwork(base,id).then(url=>{if(alive&&url)images=new Map(images).set(id,url);}).catch(()=>{});}}
 onMount(()=>{void readDesignDraft(ROOM_PROJECT_DRAFT_KEY).then(stored=>{if(!alive)return;if(stored){revision=stored.revision;recovery=stored;}}).catch(()=>{writable=false;warning=true;}).finally(()=>{if(alive)loading=false;});});
 onDestroy(()=>{alive=false;epoch++;seen?.removeEventListener('message',receive);for(const job of requests.values())job.reject(Error('closed'));requests.clear();onBusy(false);});
 function queueSave(){if(!writable||!surfaces.length)return;let content:string;try{content=serializeRoomProject(surfaces,selected);}catch{warning=true;return;}writeCount++;writePending=true;writeQueue=writeQueue.then(async()=>{if(!writable)return;try{revision=await changeLocalWorldDraft(ROOM_PROJECT_DRAFT_KEY,revision,content);}catch{writable=false;warning=true;}}).finally(()=>{writeCount--;writePending=writeCount>0;});}
 function activate(id:number){const s=surfaces.find(s=>s.id===id);if(!s)return;selected=id;childBusy=false;const token=++mountKey;
  embedded={room:true,start:s.timeline,definitions:s.definitions,finish:s.finish,onBusy:b=>{if(token===mountKey)childBusy=b;},onChange:(timeline,definitions,finish)=>{
   if(!alive||token!==mountKey||selected!==id)return;surfaces=surfaces.map(row=>row.id===id?{...row,timeline,definitions:new Map(definitions),finish}:row);queueSave();
  }};
 }
 function choose(id:number){if(blocked||id===selected)return;activate(id);queueSave();}
 function start(){if(blocked)return;const floor=floors.find(t=>t.grid.key===floorKey);if(!floor)return;if(surfaces.length&&!window.confirm(w[14]))return;surfaces=[newRoomSurface(nextId++,floor)];activate(surfaces[0].id);queueSave();}
 function addWall(){if(blocked||!surfaces.length||surfaces.length>ROOM_PROJECT_WALL_LIMIT)return;const wall=walls.find(t=>t.grid.key===wallKey);if(!wall)return;const s=newRoomSurface(nextId++,wall);surfaces=[...surfaces,s];activate(s.id);queueSave();}
 function removeWall(){if(blocked||!activeSurface||activeSurface.template.kind!=='wall'||!window.confirm(w[13]))return;surfaces=surfaces.filter(s=>s.id!==selected);activate(surfaces[0].id);queueSave();}
 async function restore(raw:string){
  if(!worker||validating)return;const own=worker,token=++epoch;validating=true;error=false;
  try{
   const doc=parseRoomProject(raw,templates),finishes=new Map<string,Set<number>>();
   for(const s of doc.surfaces){
    const rows=currentDesign(s.timeline),ids=[...new Set(rows.map(p=>p.itemId))],attachments=designAttachments(rows),defs=new Map<number,DesignItemGeometry>();
    if(ids.length){const d=await request(own,{command:'design-shapes',key:s.template.grid.key,itemIds:ids,supportAttachments:attachments});if(d.kind!=='design-shapes'||d.key!==s.template.grid.key||!Array.isArray(d.result)||d.result.length!==ids.length)throw Error('geometry');
     for(const g of d.result as DesignItemGeometry[])defs.set(g.itemId,g);if(ids.some(id=>!defs.has(id)))throw Error('geometry');}
    if(!roomDesignValid(s.timeline,s.template.grid,s.template.raster,defs))throw Error('terrain');
    if(s.finish){const kind=s.template.kind;if(kind==='support')throw Error('finish');if(!finishes.has(kind)){const d=await request(own,{command:'room-finish-catalog',kind,locale});if(d.kind!=='room-finish-catalog'||d.surface!==kind||!Array.isArray(d.items))throw Error('finish');finishes.set(kind,new Set((d.items as RoomFinishItem[]).filter(i=>roomFinishIdValid(i.itemId,kind)).map(i=>i.itemId)));}if(!finishes.get(kind)?.has(s.finish))throw Error('finish');}
    s.definitions=defs;
   }
   if(!alive||token!==epoch||own!==worker)return;
   surfaces=doc.surfaces;nextId=Math.max(...surfaces.map(s=>s.id))+1;recovery=undefined;activate(doc.selected);queueSave();
  }catch{if(alive&&token===epoch)error=true;}finally{if(alive&&token===epoch)validating=false;}
 }
 async function resume(){if(!recovery||validating)return;if(typeof recovery.draft!=='string'){error=true;return;}await restore(recovery.draft);}
 async function discard(){if(!recovery||validating||!window.confirm(w[14]))return;validating=true;try{revision=await changeLocalWorldDraft(ROOM_PROJECT_DRAFT_KEY,revision,null);recovery=undefined;error=false;}catch{warning=true;writable=false;recovery=undefined;}finally{validating=false;}}
 async function openFile(e:Event){const el=e.currentTarget as HTMLInputElement,f=el.files?.[0];el.value='';if(f)void importPresetFile(f);}
 async function importPresetFile(f:File){if(blocked||!worker||validating)return;if(surfaces.length&&!window.confirm(w[14]))return;if(f.size>ROOM_PROJECT_FILE_LIMIT){error=true;return;}validating=true;error=false;const token=++epoch,own=worker;try{const raw=await readPresetText(f,ROOM_PROJECT_FILE_LIMIT);if(!alive||token!==epoch||worker!==own)return;validating=false;await restore(raw);void rememberPreset(f,raw).catch(()=>{});}catch{if(alive)error=true;}finally{if(alive&&token===epoch)validating=false;}}
 function exportFile(){if(blocked||!surfaces.length)return;try{savePresetFile(serializeRoomProject(surfaces,selected),'wand-room-design.json');}catch{error=true;}}
</script>
<div class="project-tools">
 <select aria-label={w[17]} bind:value={floorKey} disabled={blocked}>{#each floors as t}<option value={t.grid.key}>{t.label}</option>{/each}</select>
 <button type="button" disabled={blocked||!floorKey} on:click={start}>{w[12]}</button>
 {#if surfaces.length}
  <select aria-label={w[2]} bind:value={wallKey} disabled={blocked}>{#each walls as t}<option value={t.grid.key}>{t.label}</option>{/each}</select>
  <button type="button" disabled={blocked||!wallKey||surfaces.length>ROOM_PROJECT_WALL_LIMIT} title={w[9]} on:click={addWall}>{w[3]}</button>
  <select aria-label={w[0]} value={selected} disabled={blocked} on:change={e=>choose(Number(e.currentTarget.value))}>{#each surfaces as s,i}<option value={s.id}>{i===0?w[1]:w[2]+' '+i} · {s.template.label}</option>{/each}</select>
  {#if activeSurface?.template.kind==='wall'}<button type="button" disabled={blocked} on:click={removeWall}>{w[4]}</button>{/if}
  <button type="button" disabled={blocked} aria-pressed={showCounts} on:click={()=>showCounts=!showCounts}>{w[7]}</button>
  <button type="button" disabled={blocked} on:click={exportFile}>{w[5]}</button>
 {/if}
 <input type="file" accept=".wandpreset,.json,.gz,application/json,application/gzip" hidden bind:this={input} on:change={openFile}/><PresetFilePicker {locale} schemas={['wand.room-design@1']} disabled={blocked||!worker} label={w[6]} onPick={f=>void importPresetFile(f)}/>
 <button type="button" disabled={childBusy||validating||writePending} on:click={()=>{if(!warning||!surfaces.length||window.confirm(w[19]+' '+w[8]+'?'))onClose();}}>{w[8]}</button>
</div>
{#if loading||validating}<div class="project-message" role="status">{w[16]}</div>{:else if recovery}<div class="project-message"><button type="button" disabled={!worker} on:click={resume}>{w[11]}</button><button type="button" on:click={discard}>{w[12]}</button>{#if error}<small role="alert">{w[10]}</small>{/if}</div>{:else if !surfaces.length}<div class="project-message">{w[17]} · {w[9]}</div>{/if}
{#if activeSurface&&embedded}
 <div class="project-editor" inert={validating}>{#key mountKey}<DecorationDesign active={true} grid={activeSurface.template.grid} raster={activeSurface.template.raster} {embedded} {worker} {nextRequest} {locale} bind:layerState/>{/key}</div>
 {/if}
{#if error&&!recovery}<div class="project-notice" role="alert">{w[10]}</div>{:else if warning}<div class="project-notice" role="alert">{w[19]}</div>{/if}
{#if showCounts&&surfaces.length&&!childBusy}
 <section class="project-counts" aria-label={w[7]}><strong>{w[7]} · {[...totals.furniture.values()].reduce((a,b)=>a+b,0)}</strong>
 <input type="search" bind:value={query} aria-label={w[7]} on:input={()=>limit=80}/>
 <div class="project-list" on:scroll={e=>{const el=e.currentTarget;if(el.scrollHeight-el.scrollTop-el.clientHeight<100)limit+=80;}}>
 {#each countRows as [id,n] (id)}<div>{#if images.get(id)}<img src={images.get(id)} alt="" loading="lazy"/>{/if}<span>{names.get(id)??'—'}</span><b>{n}</b></div>{/each}
 {#if totals.finishes.size}<strong>{w[15]}</strong>{#each [...totals.finishes] as [id,n] (id)}<div>{#if images.get(id)}<img src={images.get(id)} alt=""/>{/if}<span>{names.get(id)??'—'}</span><b>{n}</b></div>{/each}{/if}
 </div></section>
{/if}
<style>
 .project-editor{position:absolute;inset:0;min-height:0}
 .project-tools{position:absolute;left:6px;right:6px;top:6px;z-index:10;display:flex;gap:4px;overflow-x:auto;align-items:center;white-space:nowrap}.project-tools button,.project-tools select,.project-message button,.project-counts input{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:5px;flex:none}.project-message,.project-notice{position:absolute;top:52px;left:50%;transform:translateX(-50%);max-width:90%;z-index:11;background:var(--wand-card);padding:8px;border-radius:5px;display:flex;gap:6px;align-items:center}.project-notice{top:auto;bottom:48px}.project-counts{position:absolute;z-index:11;right:6px;top:104px;width:min(320px,75%);max-height:60%;display:flex;flex-direction:column;gap:5px;padding:8px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px}.project-list{overflow:auto;min-height:0;display:grid;gap:4px}.project-list>div{display:flex;align-items:center;gap:6px}.project-list span{flex:1;overflow-wrap:anywhere}.project-list img{width:32px;height:32px;object-fit:contain}
</style>
