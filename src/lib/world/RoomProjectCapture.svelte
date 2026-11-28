<script lang="ts">
 import PrivateStorageBackup from './PrivateStorageBackup.svelte';
 import {readDecorationFile,savePrivateDecoration,privateDecorationWords,stagePrivateDecoration} from './private-decoration-backup.ts';
 import RestoreStockReview from './RestoreStockReview.svelte';
 import {restoreStockRows} from './restore-stock-review.ts';
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
 import {indoorFreeFloor,parseIndoorRooms} from './indoor-room-view.ts';
 import type {RoomApplySurfaceGeometry} from './room-project-apply.ts';
 import {captureRoomTemplate,captureRoomRows,captureRoomSurface,capturedRoomDocument,roomBackupSurfaceValid,roomBackupProtected,roomCaptureWords,protectedRoomWords} from './room-project-capture.ts';
 import {captureSupportScene,type SupportScene} from './support-scene.ts';
 import {parseSupportTree} from './subgrid-local.ts';
 import {designAttachments} from './design-support-attachment.ts';
 import type {IndoorRoom} from './indoor-room-view.ts';
 import {parseIndoorSupportParents,type IndoorSupportWitness} from './indoor-support.ts';
 import type {RoomDesignTemplate} from './room-design.ts';
 import type {RoomProjectSurface} from './room-project-design.ts';
 import type {DesignItemGeometry} from './design-layout.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let file:File,room:IndoorRoom,witnesses:readonly IndoorSupportWitness[],worker:Worker,locale:WandLanguage,nextRequest:()=>number,blocked=false;
 export let freePlacement=false;
 export let rooms:readonly IndoorRoom[]=[],stock:ReadonlyMap<number,number>=new Map(),owned:readonly number[]=[];
 let scope:IndoorBackupScope='room',input:HTMLInputElement,review:ReturnType<typeof buildIndoorRestore>=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null,writer:Worker|null=null;
 $: bw=indoorBackupWords[locale];
 $: testExport=browser&&testSaveExportEnabled(window.location);
 $: targets=indoorBackupRooms(scope,room,rooms);
 let privateStorage:string|null=null,stagedFile:File|null=null,includeContents=false;
 $: privateWords=privateDecorationWords[locale];
 function reset(){privateStorage=null;stagedFile=null;review=null;error=false;if(copy)URL.revokeObjectURL(copy.url);copy=null;}
 let busy=false,error=false,alive=true,epoch=0,seen:Worker|null=null,reader:Worker|null=null,rejectRead:((e:Error)=>void)|null=null;
 const requests=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
 $: w=roomCaptureWords[locale];
 $: if(worker!==seen)subscribe(worker);
 $: if(file!==lastFile||room!==lastRoom){lastFile=file;lastRoom=room;reset();}
 let lastFile=file,lastRoom=room,lastFree=freePlacement;
 $: if(freePlacement!==lastFree){lastFree=freePlacement;epoch++;writer?.terminate();writer=null;reader?.terminate();reader=null;rejectRead?.(Error('mode changed'));rejectRead=null;busy=false;reset();}
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
 async function readRoom(target:IndoorRoom,templates:RoomDesignTemplate[],own:Worker,source:File,valid:()=>boolean,finishIds:Map<string,Set<number>>,backup=false,privateContents=false,parents:readonly IndoorSupportWitness[]=witnesses):Promise<IndoorBackupRoom>{
  if(!target.surfaces.length||target.surfaces.length>9)throw Error('surfaces');
  const out:RoomProjectSurface[]=[];
   for(const face of target.surfaces){
    if(!valid())throw Error('changed');const template=captureRoomTemplate(face,templates);if(!template)throw Error('terrain');
    const supportParents=parents.filter(p=>p.roomOrdinal===target.ordinal&&p.surfaceOrdinal===face.ordinal),scenes=new Map<number,SupportScene>();
    for(let i=0;i<supportParents.length;i+=16){const batch=await readSupports(source,supportParents.slice(i,i+16));if(!valid())throw Error('changed');for(const [id,scene] of batch)scenes.set(id,scene);}
    const rows=captureRoomRows(target,face,template,supportParents,scenes,privateContents);if(!rows)throw Error('poses');
    const itemIds=[...new Set(rows.map(p=>p.itemId))],defs=new Map<number,DesignItemGeometry>();
    if(itemIds.length){const d=await request(own,{command:'design-shapes',key:template.grid.key,itemIds,roomBackup:backup&&indoorFreeFloor(face),supportAttachments:designAttachments(rows)});if(!valid()||d.kind!=='design-shapes'||d.key!==template.grid.key||!Array.isArray(d.result)||d.result.length!==itemIds.length)throw Error('geometry');for(const g of d.result as DesignItemGeometry[])defs.set(g.itemId,g);}
    if(face.finish&&!finishIds.has(face.kind)){const d=await request(own,{command:'room-finish-catalog',kind:face.kind,locale});if(!valid()||d.kind!=='room-finish-catalog'||d.surface!==face.kind||!Array.isArray(d.items))throw Error('finish');finishIds.set(face.kind,new Set(d.items.map((p:{itemId:number})=>p.itemId)));}
    const native=backup&&indoorFreeFloor(face)?await nativeGeometry(face,itemIds,own,valid,defs,true):undefined;
    const captured=captureRoomSurface(face,template,rows,defs,finishIds.get(face.kind)??new Set(),native,privateContents);if(!captured)throw Error('validation');out.push(captured);
   }

  if(!capturedRoomDocument(target,out,templates,backup,privateContents))throw Error('room');
  return {room:target,surfaces:out};
 }
 async function nativeGeometry(face:IndoorRoom['surfaces'][number],ids:readonly number[],own:Worker,valid:()=>boolean,design:ReadonlyMap<number,DesignItemGeometry>,free=false):Promise<RoomApplySurfaceGeometry>{
  const items=ids.flatMap(itemId=>(free&&face.factor===1?[0,2,4,6,8,10,12,14]:[0,4,8,12]).map(orientationCode=>({itemId,orientationCode})));
  let shapes={},allowed=new Set<number>(),freeAllowed=new Set<number>();
  if(items.length){if(items.length>5000)throw Error('native geometry limit');const d=await request(own,{command:'indoor-shapes',factor:face.factor,items});if(!valid()||d.kind!=='indoor-shapes'||!d.shapes||!Array.isArray(d.removable))throw Error('native geometry');shapes=d.shapes;allowed=new Set(d.removable);freeAllowed=new Set(Array.isArray(d.freeEligible)?d.freeEligible:[]);}
  return {design,shapes,allowed,freeAllowed};
 }
 function readStagedRooms(source:File):Promise<{rooms:IndoorRoom[];parents:IndoorSupportWitness[]}>{
  return new Promise((resolve,reject)=>{
   const session=new Worker(new URL('./indoor-room-view.worker.ts',import.meta.url),{type:'module'});reader=session;rejectRead=reject;
   const done=(d:any)=>{session.terminate();if(reader!==session)return;reader=null;rejectRead=null;
    try{if(d?.kind!=='indoor-rooms')throw Error('staged rooms');const rooms=parseIndoorRooms(d.result);resolve({rooms,parents:parseIndoorSupportParents(d.result,rooms)});}catch(e){reject(e);}
   };
   session.onmessage=e=>done(e.data);session.onerror=()=>done(null);session.onmessageerror=()=>done(null);
   session.postMessage({command:'indoor-rooms',file:source});
  });
 }
 async function run(mode:'design'|'backup'|'restore',chosen?:File){
  if(busy||blocked||mode==='restore'&&!testExport)return;reset();busy=true;const token=++epoch,source=file,target=room,own=worker,selectedScope=scope,group=mode==='design'?[target]:[...targets],baselineRooms=rooms,baselineStock=stock,selectedFree=freePlacement;
  const valid=()=>alive&&epoch===token&&file===source&&room===target&&worker===own&&rooms===baselineRooms&&stock===baselineStock&&scope===selectedScope&&freePlacement===selectedFree&&!blocked;
  try{
   if(!group.length)throw Error('scope');
   const reply=await request(own,{command:'room-design-templates'});if(!valid()||reply.kind!=='room-design-templates'||!Array.isArray(reply.templates))throw Error('templates');
   const templates=reply.templates as RoomDesignTemplate[],entries:IndoorBackupRoom[]=[],finishIds=new Map<string,Set<number>>();
   const loaded=mode==='restore'&&chosen?await readDecorationFile(chosen,INDOOR_BACKUP_LIMIT):null,incomingRaw=loaded?.text??null;
   let planningFile=source,planningGroup=group,planningParents=witnesses,normalized=loaded?.storage??null;
   if(normalized){
    const stage=await stagePrivateDecoration(source,normalized,JSON.stringify({kind:selectedScope,roomOrdinal:target.ordinal}),valid);
    if(!valid())throw Error('changed');planningFile=stage.file;normalized=stage.storage;
    if(planningFile!==source){const staged=await readStagedRooms(planningFile);if(!valid())throw Error('changed');const selected=staged.rooms.find(r=>r.ordinal===target.ordinal);if(!selected)throw Error('scope');planningGroup=indoorBackupRooms(selectedScope,selected,staged.rooms);planningParents=staged.parents;}
   }
   const incoming=incomingRaw?parseIndoorBackup(incomingRaw,selectedScope,planningGroup,templates):null;if(chosen&&incomingRaw&&!loaded?.storage)void rememberPreset(chosen,incomingRaw).catch(()=>{});
   for(const targetRoom of planningGroup)entries.push(await readRoom(targetRoom,templates,own,planningFile,valid,finishIds,mode!=='design',mode==='backup'&&includeContents,planningParents));
   if(!valid())throw Error('changed');
   if(mode==='restore'){
    if(!incoming)throw Error('file');
    const inputs:IndoorRestoreInput[]=[];
    for(const [i,entry] of entries.entries()){
     const geometry=new Map<number,RoomApplySurfaceGeometry>(),after=incoming[i].surfaces;
     for(const [j,s] of after.entries()){
      const face=entry.room.surfaces[j],rows=currentDesign(s.timeline),ids=[...new Set(rows.map(p=>p.itemId))],design=new Map<number,DesignItemGeometry>();
      if(ids.length){const d=await request(own,{command:'design-shapes',key:s.template.grid.key,itemIds:ids,roomBackup:selectedFree&&indoorFreeFloor(face),supportAttachments:designAttachments(rows)});if(!valid()||d.kind!=='design-shapes'||d.key!==s.template.grid.key||!Array.isArray(d.result)||d.result.length!==ids.length)throw Error('geometry');for(const g of d.result as DesignItemGeometry[])design.set(g.itemId,g);}
      
      if(s.finish&&!finishIds.get(face.kind)?.has(s.finish)){const d=await request(own,{command:'room-finish-catalog',kind:face.kind,locale});if(!valid()||d.kind!=='room-finish-catalog'||d.surface!==face.kind||!Array.isArray(d.items)||!d.items.some((p:{itemId:number})=>p.itemId===s.finish))throw Error('finish');finishIds.set(face.kind,new Set(d.items.map((p:{itemId:number})=>p.itemId)));}
      const nativeIds=[...new Set([...ids,...face.positions.map(p=>p.itemId)])],g=await nativeGeometry(face,nativeIds,own,valid,design,selectedFree&&indoorFreeFloor(face));
      if(!roomBackupSurfaceValid(face,s,g,selectedFree))throw Error('terrain');
      geometry.set(face.ordinal,g);
     }
     const ceiling=incoming[i].ceiling;
     if(ceiling!==undefined&&ceiling!==entry.room.ceiling&&!finishIds.get('floor')?.has(ceiling)){
      const d=await request(own,{command:'room-finish-catalog',kind:'floor',locale});if(!valid()||d.kind!=='room-finish-catalog'||d.surface!=='floor'||!Array.isArray(d.items)||!d.items.some((p:{itemId:number})=>p.itemId===ceiling))throw Error('ceiling');finishIds.set('floor',new Set(d.items.map((p:{itemId:number})=>p.itemId)));
     }
     inputs.push({room:entry.room,before:entry.surfaces,after,geometry,...(ceiling===undefined?{}:{ceiling})});
    }
    if(!valid())throw Error('changed');review=buildIndoorRestore(selectedScope,inputs,stock,new Set(owned),selectedFree);if(!review)throw Error('plan');privateStorage=normalized;stagedFile=planningFile!==source?planningFile:null;return;
   }
   const raw=mode==='design'?capturedRoomDocument(target,entries[0].surfaces,templates):serializeIndoorBackup(selectedScope,entries,templates);if(!valid()||!raw)throw Error('document');
   if(mode==='backup'&&includeContents)await savePrivateDecoration(source,JSON.stringify({kind:selectedScope,roomOrdinal:target.ordinal}),raw,'wand-private-indoor-'+selectedScope+'.json',valid);
   else savePresetFile(raw,mode==='design'?'wand-room-design.json':'wand-indoor-'+selectedScope+'-backup.json');
  }catch{if(valid())error=true;}finally{if(alive&&epoch===token)busy=false;}
 }
 function open(e:Event){const el=e.currentTarget as HTMLInputElement,f=el.files?.[0];el.value='';if(f)openBackup(f);}
 function openBackup(f:File){if(busy||blocked||copy)return;if(f.size>INDOOR_BACKUP_LIMIT){error=true;return;}void run('restore',f);}
 function validate(){if(!testExport||blocked||busy||!review||!review.changed&&!privateStorage||!review.plan||review.missing.length||copy)return;
  busy=true;const source=file,target=room,plan=review.changed?review.plan:null,own=new Worker(new URL('./indoor-room-view.worker.ts',import.meta.url),{type:'module'});writer=own;
  const done=(d:any)=>{own.terminate();if(writer!==own)return;writer=null;busy=false;if(!alive||file!==source||room!==target||blocked){d?.bytes?.fill(0);return;}try{if(d?.kind!=='indoor-room-project-copy')throw Error('receipt');copy=experimentalCopyDownload(d,source);}catch{error=true;}};
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command:'indoor-room-project-export',file:stagedFile??source,plan,allowExperimentalCopy:true,...(privateStorage?{privateStorage,privateScope:JSON.stringify({kind:scope,roomOrdinal:target.ordinal})}:{})});
 }
 function apply(){if(!testExport||blocked||busy||!copy||!commitWorldCheckpoint(file,copy.file)){error=true;return;}reset();}
</script>
<button type="button" disabled={busy||blocked} on:click={()=>run('design')}>{busy?w[2]:w[0]}</button>
<div class="indoor-backup">
 {#if targets.some(r=>r.surfaces.some(f=>f.positions.some(roomBackupProtected)))}<small>{protectedRoomWords[locale]}</small>{/if}
 <label>{bw[0]} <select bind:value={scope} disabled={busy||blocked||!!copy} on:change={reset}><option value="room">{bw[1]}</option><option value="floor">{bw[2]}</option><option value="building">{bw[3]}</option></select></label>
 <label><input type="checkbox" bind:checked={includeContents} disabled={busy||blocked}/>{privateWords[0]}</label>
 <button type="button" disabled={busy||blocked||!targets.length||!!copy} on:click={()=>run('backup')}>{bw[4]}</button>
 {#if testExport}<input hidden type="file" accept=".wandpreset,.json,.gz,application/json,application/gzip" bind:this={input} on:change={open}/><PresetFilePicker {locale} schemas={['wand.preset.indoor-decoration@1']} kinds={[scope]} disabled={busy||blocked||!targets.length||!!copy} label={bw[5]} onPick={openBackup}/><button type="button" disabled={busy||blocked||!!copy} on:click={()=>input.click()}>{privateWords[1]}</button>{/if}
 {#if targets.length}<PrivateStorageBackup {file} {locale} blocked={busy||blocked||!!copy} scopeJson={JSON.stringify({kind:scope,roomOrdinal:room.ordinal})}/>{/if}
 {#if review}<section><small>{bw[14]}</small><small>{bw[6]} {review.removed} · {bw[7]} {review.added} · {bw[8]} {review.retained} · {bw[9]} {review.finishes}</small><RestoreStockReview rows={restoreStockRows([review],review.missing,review.finishItems)} {locale}/>{#if review.missing.length}<small role="alert">{bw[13]}</small>{/if}{#if !review.changed&&!privateStorage}<small>{bw[12]}</small>{:else}<button type="button" disabled={busy||blocked||!!copy||!review.plan||!!review.missing.length} on:click={validate}>{bw[10]}</button>{/if}{#if copy}<button type="button" disabled={busy||blocked} on:click={apply}>{bw[11]}</button><a href={copy.url} download={copy.name}>{bw[10]}</a>{/if}<button type="button" disabled={busy} on:click={reset}>{bw[15]}</button></section>{/if}
 {#if error}<small role="alert">{bw[13]}</small>{/if}
</div>
<style>.indoor-backup{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.indoor-backup section{display:flex;flex-direction:column;gap:4px;border:1px solid var(--wand-line);padding:5px}</style>
