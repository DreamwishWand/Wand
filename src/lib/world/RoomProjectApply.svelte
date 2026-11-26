<script lang="ts">
 import PresetFilePicker from './PresetFilePicker.svelte';
 import {savePresetFile,rememberPreset} from './preset-session.ts';

 import {onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import {worldArtwork} from './world-artwork.ts';
 import {roomProjectWords} from './room-project-design.ts';
 import {roomApplyWords,roomApplyMatches,roomApplyShortages,buildRoomApplyPlan,type RoomApplyPlan,type RoomApplySurfaceGeometry} from './room-project-apply.ts';
 import {parseRoomProject,roomProjectCounts,ROOM_PROJECT_FILE_LIMIT,type RoomProjectSurface} from './room-project-design.ts';
 import type {RoomDesignTemplate} from './room-design.ts';
 import {designAttachments} from './design-support-attachment.ts';
 import {currentDesign,type DesignItemGeometry} from './design-layout.ts';
 import type {IndoorRoom} from './indoor-room-view.ts';
 import type {WandLanguage} from '../ui/preferences';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {commitWorldCheckpoint} from '../ui/local-save-session';
 import {testSaveExportEnabled,testSaveWords} from './test-save-export.ts';
 import {browser} from '$app/environment';
 export let file:File,room:IndoorRoom,stock:ReadonlyMap<number,number>,owned:readonly number[],worker:Worker|null,locale:WandLanguage,nextRequest:()=>number,onClose:()=>void,blocked=false;
 let source=file,target=room,doc:RoomProjectSurface[]=[],mapping=new Map<number,number>(),busy=false,error=false,plan:RoomApplyPlan|null=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null,output:Worker|null=null,input:HTMLInputElement;
 let alive=true,epoch=0,seen:Worker|null=null,names=new Map<number,string>(),images=new Map<number,string>();
 const requests=new Map<number,{resolve:(d:any)=>void;reject:(e:Error)=>void}>();
 $: w=roomApplyWords[locale];
 $: rw=roomProjectWords[locale];
 $: testExport=browser&&testSaveExportEnabled(window.location);
 $: cw=testSaveWords[locale];
 $: if(worker!==seen)subscribe(worker);
 $: if(file!==source||room!==target||blocked)onClose();
 $: counts=roomProjectCounts(doc);
 $: shortages=roomApplyShortages(doc,stock);
 $: unverified=doc.some(s=>currentDesign(s.timeline).some(p=>p.attachment?.designOnly));
 $: mapped=doc.length>0&&mapping.size===doc.length&&new Set(mapping.values()).size===doc.length&&doc.every(s=>room.surfaces.some(f=>f.ordinal===mapping.get(s.id)&&roomApplyMatches(s,f)));
 function subscribe(next:Worker|null){seen?.removeEventListener('message',receive);for(const p of requests.values())p.reject(Error('worker changed'));requests.clear();seen=next;seen?.addEventListener('message',receive);}
 function receive(e:MessageEvent){const d=e.data,p=requests.get(d?.requestId);if(!p)return;requests.delete(d.requestId);if(d.kind==='error')p.reject(Error('worker'));else p.resolve(d);}
 function request(own:Worker,data:Record<string,unknown>):Promise<any>{if(!alive||own!==worker)return Promise.reject(Error('worker'));return new Promise((resolve,reject)=>{const id=nextRequest();requests.set(id,{resolve,reject});try{own.postMessage({...data,requestId:id});}catch{requests.delete(id);reject(Error('worker'));}});}
 function resetPreview(){plan=null;if(copy)URL.revokeObjectURL(copy.url);copy=null;error=false;}
 onDestroy(()=>{alive=false;epoch++;seen?.removeEventListener('message',receive);for(const p of requests.values())p.reject(Error('closed'));requests.clear();output?.terminate();if(copy)URL.revokeObjectURL(copy.url);});
 async function open(e:Event){const el=e.currentTarget as HTMLInputElement,f=el.files?.[0];el.value='';if(f)void openFile(f);}
 async function openFile(f:File){if(!worker||busy||blocked)return;resetPreview();doc=[];mapping=new Map();busy=true;const token=++epoch,own=worker;
  try{if(f.size>ROOM_PROJECT_FILE_LIMIT)throw Error('size');const raw=await f.text(),res=await request(own,{command:'room-design-templates'});if(res.kind!=='room-design-templates'||!Array.isArray(res.templates))throw Error('templates');
   const incoming=parseRoomProject(raw,res.templates as RoomDesignTemplate[]).surfaces;void rememberPreset(f,raw).catch(()=>{});if(!alive||epoch!==token)return;
   doc=incoming;mapping=new Map();const floor=room.surfaces[0];if(floor&&roomApplyMatches(doc[0],floor))mapping.set(doc[0].id,floor.ordinal);mapping=new Map(mapping);
   const ids=[...new Set([...roomProjectCounts(doc).furniture.keys(),...roomProjectCounts(doc).finishes.keys()])];
   const n=await request(own,{command:'room-project-names',itemIds:ids,locale});if(!alive||epoch!==token)return;if(n.kind==='room-project-names'&&Array.isArray(n.names))names=new Map(n.names);
   for(const id of ids)void worldArtwork(base,id).then(url=>{if(alive&&epoch===token&&url)images=new Map(images).set(id,url);}).catch(()=>{});
  }catch{if(alive&&epoch===token)error=true;}finally{if(alive&&epoch===token)busy=false;}
 }
 function mapFace(id:number,ordinal:number){resetPreview();const next=new Map(mapping);if(ordinal)next.set(id,ordinal);else next.delete(id);mapping=next;}
 async function review(){
  if(!mapped||!worker||busy||blocked||shortages.length||unverified)return;resetPreview();busy=true;const own=worker,token=++epoch,chosen=doc,targets=mapping;
  try{const geometry=new Map<number,RoomApplySurfaceGeometry>();
   for(const s of chosen){const face=room.surfaces.find(f=>f.ordinal===targets.get(s.id));if(!face?.factor)throw Error('face');
    const rows=currentDesign(s.timeline),ids=[...new Set(rows.map(p=>p.itemId))],design=new Map<number,DesignItemGeometry>();
    if(ids.length){const d=await request(own,{command:'design-shapes',key:s.template.grid.key,itemIds:ids,supportAttachments:designAttachments(rows)});if(d.kind!=='design-shapes'||d.key!==s.template.grid.key||!Array.isArray(d.result)||d.result.length!==ids.length)throw Error('source geometry');for(const g of d.result as DesignItemGeometry[])design.set(g.itemId,g);if(ids.some(id=>!design.has(id)))throw Error('geometry');}
    const actualIds=[...new Set([...ids,...face.positions.map(p=>p.itemId)])],items=actualIds.flatMap(itemId=>[0,4,8,12].map(orientationCode=>({itemId,orientationCode})));
    let shapes={},allowed=new Set<number>();if(items.length){if(items.length>5000)throw Error('geometry limit');const d=await request(own,{command:'indoor-shapes',factor:face.factor,items});if(d.kind!=='indoor-shapes'||!d.shapes||!Array.isArray(d.removable))throw Error('native geometry');shapes=d.shapes;allowed=new Set(d.removable);}
    if(s.finish){const d=await request(own,{command:'room-finish-catalog',kind:face.kind,locale});if(d.kind!=='room-finish-catalog'||!Array.isArray(d.items)||!d.items.some((i:any)=>i.itemId===s.finish))throw Error('finish');}
    geometry.set(s.id,{design,shapes,allowed});
   }
   if(!alive||epoch!==token||worker!==own||doc!==chosen||mapping!==targets)return;
   plan=buildRoomApplyPlan(chosen,room,targets,geometry,stock,new Set(owned));if(!plan)throw Error('plan');
  }catch{if(alive&&epoch===token)error=true;}finally{if(alive&&epoch===token)busy=false;}
 }
 function createCopy(){if(!testExport||blocked||busy||!plan||copy)return;busy=true;error=false;const own=new Worker(new URL('./indoor-room-view.worker.ts',import.meta.url),{type:'module'});output=own;
  const done=(d:any)=>{own.terminate();if(!alive||output!==own||file!==source||room!==target){d?.bytes?.fill(0);return;}output=null;busy=false;try{if(d?.kind!=='indoor-room-project-copy')throw Error('receipt');copy=experimentalCopyDownload(d,source);}catch{error=true;}};
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command:'indoor-room-project-export',file:source,plan,allowExperimentalCopy:true});
 }
 function apply(){if(!testExport||blocked||!copy||file!==source||room!==target||!commitWorldCheckpoint(source,copy.file)){error=true;return;}onClose();}
</script>
<div class="room-apply" role="dialog" aria-label={w[0]}>
 <header><strong>{w[0]} · {room.name}</strong><button type="button" on:click={onClose}>{w[8]}</button></header>
 <p>{w[3]} · {w[15]}</p>
 <input hidden type="file" accept=".json,application/json" bind:this={input} on:change={open}/><PresetFilePicker {locale} schemas={['wand.room-design@1']} disabled={busy||blocked||!worker} label={w[1]} onPick={f=>void openFile(f)}/>
 {#if doc.length}<section><strong>{w[2]}</strong>{#each doc as s,i}<label>{i===0?rw[1]:(rw[2])+' '+i} · {s.template.label}
  <select disabled={busy||!!copy} value={mapping.get(s.id)??0} on:change={e=>mapFace(s.id,Number(e.currentTarget.value))}><option value={0}>—</option>{#each room.surfaces.filter(f=>roomApplyMatches(s,f)) as f}<option value={f.ordinal} disabled={[...mapping].some(([id,o])=>id!==s.id&&o===f.ordinal)}>{f.kind==='floor'?(rw[1]):(rw[2])+' '+(f.wallPosition===null?f.ordinal:f.wallPosition+1)}</option>{/each}</select></label>{/each}
 {#if !mapped}<small>{w[12]}</small>{/if}</section>
 <section><strong>{w[9]} · {[...counts.furniture.values()].reduce((a,b)=>a+b,0)}</strong><div class="apply-items">{#each [...counts.furniture] as [id,n]}<div>{#if images.get(id)}<img src={images.get(id)} alt=""/>{/if}<span>{names.get(id)??'—'}</span><b>{n} / {stock.get(id)??0}</b></div>{/each}</div>{#if shortages.length}<small role="alert">{w[11]} · {shortages.length}</small>{/if}</section>
 {#if counts.finishes.size}<section><strong>{w[10]}</strong><div class="apply-items">{#each [...counts.finishes] as [id,n]}<div>{#if images.get(id)}<img src={images.get(id)} alt=""/>{/if}<span>{names.get(id)??'—'}</span><b>{n}</b></div>{/each}</div></section>{/if}
 {#if unverified}<p role="alert">{w[13]}</p>{/if}
 <button type="button" disabled={busy||blocked||!mapped||unverified||!!shortages.length||!!copy} on:click={review}>{w[4]}</button>
 {#if plan}<section><strong>{w[4]} ✓</strong>{#each plan.surfaces as s}<small>{w[2]} {s.surfaceOrdinal} · +{s.place.length}{s.finish?' · '+(names.get(s.finish.itemId)??w[10]):''}</small>{/each}</section><button type="button" disabled={busy||blocked||!testExport||!!copy} on:click={createCopy}>{w[6]}</button>{/if}
 {#if copy}<button type="button" disabled={blocked} on:click={apply}>{w[7]}</button><a href={copy.url} download={copy.name}>{cw[2]}</a>{/if}
 {/if}
 {#if busy}<p role="status">{w[14]}</p>{/if}{#if error}<p role="alert">{w[5]}</p>{/if}
</div>
<style>
 .room-apply{position:absolute;inset:0;z-index:15;background:var(--wand-bg);overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;align-items:stretch}.room-apply header,.room-apply label,.apply-items>div{display:flex;gap:8px;align-items:center;justify-content:space-between}.room-apply section{display:grid;gap:5px;border:1px solid var(--wand-line);padding:8px;border-radius:5px}.apply-items{display:grid;max-height:28vh;overflow:auto;gap:4px}.apply-items img{width:32px;height:32px;object-fit:contain}.apply-items span{flex:1}
</style>