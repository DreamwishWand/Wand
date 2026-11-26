<script lang="ts">
 import {readPresetText} from '../presets/preset-file.ts';
 import PresetFilePicker from './PresetFilePicker.svelte';
 import {savePresetFile,rememberPreset} from './preset-session.ts';
 import {onDestroy} from 'svelte';
 import {browser} from '$app/environment';
 import {testSaveExportEnabled} from './test-save-export.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {commitWorldCheckpoint} from '../ui/local-save-session';
 import {indoorBackupRooms,serializeIndoorBackup,parseIndoorBackup,buildIndoorRestore,INDOOR_BACKUP_LIMIT,indoorBackupWords,type IndoorBackupScope,type IndoorBackupRoom,type IndoorRestoreInput} from './indoor-decoration-backup.ts';
 import {currentDesign} from './design-layout.ts';
 import {roomDesignValid} from './room-design.ts';
 import type {RoomApplySurfaceGeometry} from './room-project-apply.ts';
 import {captureRoomTemplate,captureRoomRows,captureRoomSurface,capturedRoomDocument,roomCaptureWords} from './room-project-capture.ts';
 import {captureSupportScene,type SupportScene} from './support-scene.ts';
 import {parseSupportTree} from './subgrid-local.ts';
 import {designAttachments} from './design-support-attachment.ts';
 import type {IndoorRoom} from './indoor-room-view.ts';
 import type {IndoorSupportWitness} from './indoor-support.ts';
 import type {RoomDesignTemplate} from './room-design.ts';
 import type {RoomProjectSurface} from './room-project-design.ts';
 import type {DesignItemGeometry} from './design-layout.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let file:File,room:IndoorRoom,witnesses:readonly IndoorSupportWitness[],worker:Worker,locale:WandLanguage,nextRequest:()=>number,blocked=false;
 export let rooms:readonly IndoorRoom[]=[],stock:ReadonlyMap<number,number>=new Map(),owned:readonly number[]=[];
 let scope:IndoorBackupScope='room',input:HTMLInputElement,review:ReturnType<typeof buildIndoorRestore>=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null,writer:Worker|null=null;
 $: bw=indoorBackupWords[locale];
 $: testExport=browser&&testSaveExportEnabled(window.location);
 $: targets=indoorBackupRooms(scope,room,rooms);
 function reset(){review=null;error=false;if(copy)URL.revokeObjectURL(copy.url);copy=null;}
 let busy=false,error=false,alive=true,epoch=0,seen:Worker|null=null,reader:Worker|null=null,rejectRead:((e:Error)=>void)|null=null;
 const requests=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
 $: w=roomCaptureWords[locale];
 $: if(worker!==seen)subscribe(worker);
 $: if(file!==lastFile||room!==lastRoom){lastFile=file;lastRoom=room;reset();}
 let lastFile=file,lastRoom=room;
 function subscribe(next:Worker){seen?.removeEventListener('message',receive);for(const p of requests.values())p.reject(Error('worker changed'));requests.clear();seen=next;seen.addEventListener('message',receive);}
 function receive(e:MessageEvent){const d=e.data,p=requests.get(d?.requestId);if(!p)return;requests.delete(d.requestId);if(d.kind==='error')p.reject(Error('worker'));else p.resolve(d);}
 function request(own:Worker,data:Record<string,unknown>):Promise<any>{if(!alive||own!==worker)return Promise.reject(Error('worker'));return new Promise((resolve,reject)=>{const id=nextRequest();requests.set(id,{resolve,reject});try{own.postMessage({...data,requestId:id});}catch{requests.delete(id);reject(Error('request'));}});}
 function readSupports(source:File,parents:readonly IndoorSupportWitness[]):Promise<Map<number,SupportScene>>{
  if(!parents.length)return Promise.resolve(new Map());
  return new Promise((resolve,reject)=>{const session=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});reader=session;rejectRead=reject;
   const done=(d:any)=>{session.terminate();if(reader!==session)return;reader=null;rejectRead=null;
    try{if(d?.kind!=='subgrids-local'||!Array.isArray(d.results)||d.results.length!==parents.length)throw Error('receipt');
     const result=new Map<number,SupportScene>();for(const p of parents){const row=d.results.find((v:any)=>v.localOrdinal===p.localOrdinal),scene=captureSupportScene(p.itemId,parseSupportTree(row?.result));if(!scene)throw Error('support');result.set(p.localOrdinal,scene);}resolve(result);
    }catch(e){reject(e instanceof Error?e:Error('support'));}
   };session.onmessage=e=>done(e.data);session.onerror=()=>done(null);session.onmessageerror=()=>done(null);
   try{session.postMessage({command:'inspect-subgrids',file:source,parents:parents.map(({localOrdinal,itemId,x,y})=>({localOrdinal,itemId,x,y}))});}catch{done(null);}
  });
 }
 onDestroy(()=>{alive=false;epoch++;seen?.removeEventListener('message',receive);for(const p of requests.values())p.reject(Error('closed'));requests.clear();reader?.terminate();reader=null;rejectRead?.(Error('closed'));rejectRead=null;writer?.terminate();if(copy)URL.revokeObjectURL(copy.url);});
 async function readRoom(target:IndoorRoom,templates:RoomDesignTemplate[],own:Worker,source:File,valid:()=>boolean,finishIds:Map<string,Set<number>>):Promise<IndoorBackupRoom>{
  if(!target.surfaces.length||target.surfaces.length>9)throw Error('surfaces');
  const out:RoomProjectSurface[]=[];
   for(const face of target.surfaces){
    if(!valid())throw Error('changed');const template=captureRoomTemplate(face,templates);if(!template)throw Error('terrain');
    const supportParents=witnesses.filter(p=>p.roomOrdinal===target.ordinal&&p.surfaceOrdinal===face.ordinal),scenes=new Map<number,SupportScene>();
    for(let i=0;i<supportParents.length;i+=16){const batch=await readSupports(source,supportParents.slice(i,i+16));if(!valid())throw Error('changed');for(const [id,scene] of batch)scenes.set(id,scene);}
    const rows=captureRoomRows(target,face,template,supportParents,scenes);if(!rows)throw Error('poses');
    const itemIds=[...new Set(rows.map(p=>p.itemId))],defs=new Map<number,DesignItemGeometry>();
    if(itemIds.length){const d=await request(own,{command:'design-shapes',key:template.grid.key,itemIds,supportAttachments:designAttachments(rows)});if(!valid()||d.kind!=='design-shapes'||d.key!==template.grid.key||!Array.isArray(d.result)||d.result.length!==itemIds.length)throw Error('geometry');for(const g of d.result as DesignItemGeometry[])defs.set(g.itemId,g);}
    if(face.finish&&!finishIds.has(face.kind)){const d=await request(own,{command:'room-finish-catalog',kind:face.kind,locale});if(!valid()||d.kind!=='room-finish-catalog'||d.surface!==face.kind||!Array.isArray(d.items))throw Error('finish');finishIds.set(face.kind,new Set(d.items.map((p:{itemId:number})=>p.itemId)));}
    const captured=captureRoomSurface(face,template,rows,defs,finishIds.get(face.kind)??new Set());if(!captured)throw Error('validation');out.push(captured);
   }

  if(!capturedRoomDocument(target,out,templates))throw Error('room');
  return {room:target,surfaces:out};
 }
 async function run(mode:'design'|'backup'|'restore',chosen?:File){
  if(busy||blocked||mode==='restore'&&!testExport)return;reset();busy=true;const token=++epoch,source=file,target=room,own=worker,selectedScope=scope,group=mode==='design'?[target]:[...targets],baselineRooms=rooms,baselineStock=stock;
  const valid=()=>alive&&epoch===token&&file===source&&room===target&&worker===own&&rooms===baselineRooms&&stock===baselineStock&&scope===selectedScope&&!blocked;
  try{
   if(!group.length)throw Error('scope');
   const reply=await request(own,{command:'room-design-templates'});if(!valid()||reply.kind!=='room-design-templates'||!Array.isArray(reply.templates))throw Error('templates');
   const templates=reply.templates as RoomDesignTemplate[],entries:IndoorBackupRoom[]=[],finishIds=new Map<string,Set<number>>();
   const incomingRaw=mode==='restore'&&chosen?await chosen.text():null,incoming=incomingRaw?parseIndoorBackup(incomingRaw,selectedScope,group,templates):null;if(chosen&&incomingRaw)void rememberPreset(chosen,incomingRaw).catch(()=>{});
   for(const targetRoom of group)entries.push(await readRoom(targetRoom,templates,own,source,valid,finishIds));
   if(!valid())throw Error('changed');
   if(mode==='restore'){
    if(!incoming)throw Error('file');
    const inputs:IndoorRestoreInput[]=[];
    for(const [i,entry] of entries.entries()){
     const geometry=new Map<number,RoomApplySurfaceGeometry>(),after=incoming[i].surfaces;
     for(const [j,s] of after.entries()){
      const face=entry.room.surfaces[j],rows=currentDesign(s.timeline),ids=[...new Set(rows.map(p=>p.itemId))],design=new Map<number,DesignItemGeometry>();
      if(ids.length){const d=await request(own,{command:'design-shapes',key:s.template.grid.key,itemIds:ids,supportAttachments:designAttachments(rows)});if(!valid()||d.kind!=='design-shapes'||d.key!==s.template.grid.key||!Array.isArray(d.result)||d.result.length!==ids.length)throw Error('geometry');for(const g of d.result as DesignItemGeometry[])design.set(g.itemId,g);}
      if(!roomDesignValid(s.timeline,s.template.grid,s.template.raster,design))throw Error('terrain');
      if(s.finish&&!finishIds.get(face.kind)?.has(s.finish)){const d=await request(own,{command:'room-finish-catalog',kind:face.kind,locale});if(!valid()||d.kind!=='room-finish-catalog'||d.surface!==face.kind||!Array.isArray(d.items)||!d.items.some((p:{itemId:number})=>p.itemId===s.finish))throw Error('finish');finishIds.set(face.kind,new Set(d.items.map((p:{itemId:number})=>p.itemId)));}
      const nativeIds=[...new Set([...ids,...face.positions.map(p=>p.itemId)])],items=nativeIds.flatMap(itemId=>[0,4,8,12].map(orientationCode=>({itemId,orientationCode})));
      let shapes={},allowed=new Set<number>();if(items.length){if(items.length>5000)throw Error('limit');const d=await request(own,{command:'indoor-shapes',factor:face.factor,items});if(!valid()||d.kind!=='indoor-shapes'||!d.shapes||!Array.isArray(d.removable))throw Error('native geometry');shapes=d.shapes;allowed=new Set(d.removable);}
      geometry.set(face.ordinal,{design,shapes,allowed});
     }
     inputs.push({room:entry.room,before:entry.surfaces,after,geometry});
    }
    if(!valid())throw Error('changed');review=buildIndoorRestore(selectedScope,inputs,stock,new Set(owned));if(!review)throw Error('plan');return;
   }
   const raw=mode==='design'?capturedRoomDocument(target,entries[0].surfaces,templates):serializeIndoorBackup(selectedScope,entries,templates);if(!valid()||!raw)throw Error('document');
   savePresetFile(raw,mode==='design'?'wand-room-design.json':'wand-indoor-'+selectedScope+'-backup.json');
  }catch{if(valid())error=true;}finally{if(alive&&epoch===token)busy=false;}
 }
 function open(e:Event){const el=e.currentTarget as HTMLInputElement,f=el.files?.[0];el.value='';if(f)openBackup(f);}
 function openBackup(f:File){if(busy||blocked||copy)return;if(f.size>INDOOR_BACKUP_LIMIT){error=true;return;}void run('restore',f);}
 function validate(){if(!testExport||blocked||busy||!review?.changed||copy)return;
  busy=true;const source=file,target=room,plan=review.plan,own=new Worker(new URL('./indoor-room-view.worker.ts',import.meta.url),{type:'module'});writer=own;
  const done=(d:any)=>{own.terminate();if(writer!==own)return;writer=null;busy=false;if(!alive||file!==source||room!==target||blocked){d?.bytes?.fill(0);return;}try{if(d?.kind!=='indoor-room-project-copy')throw Error('receipt');copy=experimentalCopyDownload(d,source);}catch{error=true;}};
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command:'indoor-room-project-export',file:source,plan,allowExperimentalCopy:true});
 }
 function apply(){if(!testExport||blocked||busy||!copy||!commitWorldCheckpoint(file,copy.file)){error=true;return;}reset();}
</script>
<button type="button" disabled={busy||blocked} on:click={()=>run('design')}>{busy?w[2]:w[0]}</button>
<div class="indoor-backup">
 <label>{bw[0]} <select bind:value={scope} disabled={busy||blocked||!!copy} on:change={reset}><option value="room">{bw[1]}</option><option value="floor">{bw[2]}</option><option value="building">{bw[3]}</option></select></label>
 <button type="button" disabled={busy||blocked||!targets.length||!!copy} on:click={()=>run('backup')}>{bw[4]}</button>
 {#if testExport}<input hidden type="file" accept=".wandpreset,.json,.gz,application/json,application/gzip" bind:this={input} on:change={open}/><PresetFilePicker {locale} schemas={['wand.preset.indoor-decoration@1']} kinds={[scope]} disabled={busy||blocked||!targets.length||!!copy} label={bw[5]} onPick={openBackup}/>{/if}
 {#if review}<section><small>{bw[14]}</small><small>{bw[6]} {review.removed} · {bw[7]} {review.added} · {bw[8]} {review.retained} · {bw[9]} {review.finishes}</small>{#if !review.changed}<small>{bw[12]}</small>{:else}<button type="button" disabled={busy||blocked||!!copy} on:click={validate}>{bw[10]}</button>{/if}{#if copy}<button type="button" disabled={busy||blocked} on:click={apply}>{bw[11]}</button><a href={copy.url} download={copy.name}>{bw[10]}</a>{/if}<button type="button" disabled={busy} on:click={reset}>{bw[15]}</button></section>{/if}
 {#if error}<small role="alert">{bw[13]}</small>{/if}
</div>
<style>.indoor-backup{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.indoor-backup section{display:flex;flex-direction:column;gap:4px;border:1px solid var(--wand-line);padding:5px}</style>
