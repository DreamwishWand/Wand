<script lang="ts">
 import {onDestroy} from 'svelte';
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
 let busy=false,error=false,alive=true,epoch=0,seen:Worker|null=null,reader:Worker|null=null,rejectRead:((e:Error)=>void)|null=null;
 const requests=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
 $: w=roomCaptureWords[locale];
 $: if(worker!==seen)subscribe(worker);
 $: if(file!==lastFile||room!==lastRoom){lastFile=file;lastRoom=room;error=false;}
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
 onDestroy(()=>{alive=false;epoch++;seen?.removeEventListener('message',receive);for(const p of requests.values())p.reject(Error('closed'));requests.clear();reader?.terminate();reader=null;rejectRead?.(Error('closed'));rejectRead=null;});
 async function capture(){
  if(busy||blocked)return;busy=true;error=false;const token=++epoch,source=file,target=room,own=worker,parents=witnesses.filter(p=>p.roomOrdinal===target.ordinal);
  const valid=()=>alive&&epoch===token&&file===source&&room===target&&worker===own&&!blocked;
  try{
   if(!target.surfaces.length||target.surfaces.length>9)throw Error('surfaces');
   const reply=await request(own,{command:'room-design-templates'});if(!valid()||reply.kind!=='room-design-templates'||!Array.isArray(reply.templates))throw Error('templates');
   const templates=reply.templates as RoomDesignTemplate[],out:RoomProjectSurface[]=[],finishIds=new Map<string,Set<number>>();
   for(const face of target.surfaces){
    if(!valid())throw Error('changed');const template=captureRoomTemplate(face,templates);if(!template)throw Error('terrain');
    const supportParents=parents.filter(p=>p.surfaceOrdinal===face.ordinal),scenes=new Map<number,SupportScene>();
    for(let i=0;i<supportParents.length;i+=16){const batch=await readSupports(source,supportParents.slice(i,i+16));if(!valid())throw Error('changed');for(const [id,scene] of batch)scenes.set(id,scene);}
    const rows=captureRoomRows(target,face,template,supportParents,scenes);if(!rows)throw Error('poses');
    const itemIds=[...new Set(rows.map(p=>p.itemId))],defs=new Map<number,DesignItemGeometry>();
    if(itemIds.length){const d=await request(own,{command:'design-shapes',key:template.grid.key,itemIds,supportAttachments:designAttachments(rows)});if(!valid()||d.kind!=='design-shapes'||d.key!==template.grid.key||!Array.isArray(d.result)||d.result.length!==itemIds.length)throw Error('geometry');for(const g of d.result as DesignItemGeometry[])defs.set(g.itemId,g);}
    if(face.finish&&!finishIds.has(face.kind)){const d=await request(own,{command:'room-finish-catalog',kind:face.kind,locale});if(!valid()||d.kind!=='room-finish-catalog'||d.surface!==face.kind||!Array.isArray(d.items))throw Error('finish');finishIds.set(face.kind,new Set(d.items.map((p:{itemId:number})=>p.itemId)));}
    const captured=captureRoomSurface(face,template,rows,defs,finishIds.get(face.kind)??new Set());if(!captured)throw Error('validation');out.push(captured);
   }
   const raw=capturedRoomDocument(target,out,templates);if(!valid()||!raw)throw Error('document');
   const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='wand-room-design.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{if(valid())error=true;}finally{if(alive&&epoch===token)busy=false;}
 }
</script>
<button type="button" disabled={busy||blocked} on:click={capture}>{busy?w[2]:w[0]}</button>
{#if error}<small role="alert">{w[1]}</small>{/if}
