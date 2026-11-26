<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 import {readAreaSupportTrees,validateAreaSupportTrees,supportAreaWords} from './area-support-trees.ts';
 import type {SupportAreaTrees} from './biome-furniture-preset.ts';
 import {captureIslandDecoration,parseIslandDecoration,reviewIslandDecoration,islandDecorationWords,ISLAND_DECORATION_FILE_LIMIT} from './island-decoration-preset.ts';
 import {networkRows,type NetworkPose} from './biome-network-preset.ts';
 import {biomeDecorationWords} from './biome-decoration-preset.ts';
 import {islandSaveSnapshot,parseIslandSavePreset,islandSaveReplacement,islandSaveWords} from './island-save-preset.ts';
 import {biomeFurnitureWords} from './biome-furniture-preset.ts';
 import {DESIGN_FILE_LIMIT,type DesignItemGeometry} from './design-layout.ts';
 import {parseFurnitureStock} from './furniture-stock-view.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {commitWorldCheckpoint} from '../ui/local-save-session.ts';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {testSaveWords} from './test-save-export.ts';
 import type {StockCandidate} from './save-furniture-placement.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {MainlandGrid} from './mainland-world-coordinates.ts';
 import type {SavedShapeMap} from './saved-shape-map.ts';
 import type {TerrainRaster,TerrainScopeReceipt} from './terrain-binding.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let file:File|null,worker:Worker|null,grids:readonly MainlandGrid[],sessions:readonly TerrainScopeReceipt[],activeKey:string,blocked=false,allowed=false,locale:WandLanguage='ja',nextRequest:()=>number,label:(key:string)=>string,onClose:()=>void;
 export let ghosts:readonly StockCandidate[]=[],removed:readonly MainlandSavedObject[]=[];
 let snapshot:ReturnType<typeof islandSaveSnapshot>=null,review:ReturnType<typeof islandSaveReplacement>=null;
 let includeSupport=false,supportTrees:SupportAreaTrees|undefined,supportAbort:AbortController|null=null,supportSnapshot:ReturnType<typeof captureIslandDecoration>=null;
 let includeNetworks=false,networkSnapshot:ReturnType<typeof captureIslandDecoration>=null,decorationReview:ReturnType<typeof reviewIslandDecoration>=null,networks=new Map<string,NetworkPose[]>();
 let input:HTMLInputElement,reading=true,error=false,source:File|null=null,sourceSessions:readonly TerrainScopeReceipt[]|null=null,epoch=0,writeWorker:Worker|null=null,stockWorker:Worker|null=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null;
 const cancelRequests=new Set<()=>void>();
 $: w=islandSaveWords[locale];$: sw=supportAreaWords[locale];$: selectedSnapshot=includeSupport?supportSnapshot:networkSnapshot;$: dw=islandDecorationWords[locale];$: bw2=biomeDecorationWords[locale];$: bw=biomeFurnitureWords[locale];$: cw=checkpointWords[locale];$: tw=testSaveWords[locale];
 $: result=includeNetworks?decorationReview:review;
 $: ghosts=result?.reviews.get(activeKey)?.ghosts??[];$: removed=result?.reviews.get(activeKey)?.removed??[];
 $: busy=reading||!!writeWorker;
 $: if(source&&(file!==source||sessions!==sourceSessions||blocked))onClose();
 function request(own:Worker,key:string,kind:string,params:Record<string,unknown>):Promise<any>{
  return new Promise((resolve,reject)=>{
   const requestId=nextRequest();
   const cleanup=()=>{clearTimeout(timer);own.removeEventListener('message',receive);cancelRequests.delete(cancel);};
   const cancel=()=>{cleanup();reject(Error('cancelled'));};
   const timer=setTimeout(cancel,30000);
   const receive=(e:MessageEvent)=>{const d=e.data;if(d?.requestId!==requestId)return;cleanup();if(d.kind!==kind||d.key!==key)reject(Error('worker response'));else resolve(d);};
   cancelRequests.add(cancel);own.addEventListener('message',receive);
   try{own.postMessage({command:kind,requestId,key,...params});}catch(e){cleanup();reject(e);}
  });
 }
 function readStock(f:File):Promise<Map<number,number>>{
  return new Promise((resolve,reject)=>{
   const own=new Worker(new URL('./furniture-stock-view.worker.ts',import.meta.url),{type:'module'});stockWorker=own;
   const cleanup=()=>{clearTimeout(timer);own.terminate();if(stockWorker===own)stockWorker=null;cancelRequests.delete(cancel);};
   const cancel=()=>{cleanup();reject(Error('stock'));};
   const timer=setTimeout(cancel,30000);cancelRequests.add(cancel);
   own.onmessage=e=>{cleanup();try{if(e.data?.kind!=='furniture-stock')throw Error('stock');resolve(parseFurnitureStock(e.data.result));}catch(e){reject(e);}};
   own.onerror=cancel;own.onmessageerror=cancel;own.postMessage({command:'read-furniture-stock',file:f});
  });
 }
 function readNetwork(f:File,g:MainlandGrid):Promise<NetworkPose[]>{
  return new Promise((resolve,reject)=>{
   const own=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});
   const cleanup=()=>{clearTimeout(timer);own.terminate();cancelRequests.delete(cancel);};
   const cancel=()=>{cleanup();reject(Error('network'));};
   const timer=setTimeout(cancel,30000);cancelRequests.add(cancel);
   own.onmessage=e=>{cleanup();try{if(e.data?.kind!=='area-network')throw Error('network');resolve(networkRows(e.data.rows,g));}catch(e){reject(e);}};
   own.onerror=cancel;own.onmessageerror=cancel;own.postMessage({command:'inspect-area-network',file:f,plan:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY}});
  });
 }
 async function loadNetworks(f:File,ss:readonly TerrainScopeReceipt[],token:number){
  if(networkSnapshot)return;
  const next=new Map<string,NetworkPose[]>();
  for(const g of grids){const rows=await readNetwork(f,g);if(epoch!==token||file!==f||sessions!==ss)throw Error('cancel');next.set(g.key,rows);}
  if(epoch!==token||file!==f||sessions!==ss||!snapshot)throw Error('cancel');
  const capture=captureIslandDecoration(grids,snapshot,next);if(!capture)throw Error('network');
  networkSnapshot=capture;networks=next;
 }
 async function setMode(value:boolean){
  if(busy||copy||!file||!snapshot||blocked)return;
  includeNetworks=value;if(!value)includeSupport=false;review=null;decorationReview=null;error=false;
  if(!value||networkSnapshot)return;
  const f=file,ss=sessions,token=++epoch;reading=true;
  try{
   await loadNetworks(f,ss,token);
  }catch{if(epoch===token)error=true;}finally{if(epoch===token)reading=false;}
 }
 async function readSupports(f:File,own:Worker){
  if(!snapshot)throw Error('snapshot');supportAbort?.abort();const ac=new AbortController();supportAbort=ac;
  const trees=await readAreaSupportTrees(f,[...snapshot.objects.values()].flat(),own,nextRequest,ac.signal);
  if(ac.signal.aborted)throw Error('cancel');return trees;
 }
 async function setSupports(value:boolean){
  if(busy||copy||blocked||!snapshot||!file||!worker||!networkSnapshot)return;
  includeSupport=value;review=null;decorationReview=null;error=false;if(!value||supportSnapshot)return;
  const f=file,own=worker,ss=sessions,token=++epoch;reading=true;
  try{const trees=await readSupports(f,own);if(epoch!==token||file!==f||sessions!==ss||!snapshot)return;supportSnapshot=captureIslandDecoration(grids,snapshot,networks,trees);if(!supportSnapshot)throw Error('support');supportTrees=trees;}
  catch{if(epoch===token)error=true;}finally{if(epoch===token)reading=false;}
 }
 async function load(){
  const own=worker,f=file,ss=sessions,token=++epoch;source=f;sourceSessions=ss;reading=true;error=false;
  try{
   if(!own||!f||blocked||!grids.length)throw Error('scope');
   const maps=new Map<string,SavedShapeMap>();
   for(const g of grids){
    const s=ss.find(x=>x.receipt.viewKey===g.key);
    if(!s?.completeGridOrdinal||s.receipt.rowsWithoutCoordinates||s.receipt.dataSampled)throw Error('scope');
    if(s.receipt.points.length){
     const d=await request(own,g.key,'shapes',{points:s.receipt.points});if(token!==epoch)return;maps.set(g.key,d.result);
    }
   }
   if(token!==epoch||file!==f||sessions!==ss)return;
   snapshot=islandSaveSnapshot(grids,ss,maps);if(!snapshot)throw Error('snapshot');
  }catch{if(token===epoch)error=true;}finally{if(token===epoch)reading=false;}
 }
 function exportPreset(){
  if(!snapshot||blocked||busy||includeNetworks&&!selectedSnapshot)return;const text=includeNetworks?selectedSnapshot!.text:snapshot.text;const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='wand-island-'+(includeNetworks?'decoration-':'furniture-')+grids[0].layoutId.split('/')[2]+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function open(e:Event){
  const el=e.currentTarget as HTMLInputElement,preset=el.files?.[0];el.value='';
  if(!preset||!snapshot||!file||!worker||blocked||!allowed||busy||copy)return;
  const own=worker,f=file,ss=sessions,token=++epoch;reading=true;error=false;review=null;decorationReview=null;
  try{
   if(preset.size>Math.max(ISLAND_DECORATION_FILE_LIMIT,DESIGN_FILE_LIMIT))throw Error('size');
   const text=await preset.text();if(token!==epoch||file!==f||sessions!==ss)return;
   const full=JSON.parse(text)?.schema==='wand.preset.floating-island-decoration@1';
   if(preset.size>(full?ISLAND_DECORATION_FILE_LIMIT:DESIGN_FILE_LIMIT))throw Error('size');
   const combined=full?parseIslandDecoration(text,grids):null,incoming=combined?new Map([...combined].map(([k,v])=>[k,v.furniture])):parseIslandSavePreset(text,grids),rasters=new Map<string,TerrainRaster>(),definitions=new Map<string,Map<number,DesignItemGeometry>>();
   if(full)await loadNetworks(f,ss,token);
   if(token!==epoch||file!==f||sessions!==ss)return;
   includeNetworks=full;includeSupport=false;
   for(const g of grids){
    if(token!==epoch)return;
    const d=await request(own,g.key,'terrain',{});
    if(d.sizeX!==g.sizeX||d.sizeY!==g.sizeY||!(d.nativeFloorValues instanceof Uint32Array)||d.nativeFloorValues.length!==g.sizeX*g.sizeY)throw Error('terrain');
    rasters.set(g.key,{sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:d.nativeFloorValues});
    const ids=[...new Set([...(incoming.get(g.key)??[]),...(combined?.get(g.key)?.network??[])].map(p=>p.itemId))],defs=new Map<number,DesignItemGeometry>();
    for(let i=0;i<ids.length;i+=128){
     const batch=ids.slice(i,i+128),r=await request(own,g.key,'design-shapes',{itemIds:batch});
     if(!Array.isArray(r.result)||r.result.length!==batch.length||r.result.some((x:DesignItemGeometry)=>!batch.includes(x.itemId)))throw Error('shape');
     for(const def of r.result as DesignItemGeometry[])defs.set(def.itemId,def);
    }
    definitions.set(g.key,defs);
   }
   let trees:SupportAreaTrees|undefined;
   if(combined&&[...combined.values()].some(v=>v.supports!==undefined)){
    if([...combined.values()].some(v=>v.supports===undefined))throw Error('support scope');
    trees=supportTrees??await readSupports(f,own);const ac=new AbortController();supportAbort=ac;
    await validateAreaSupportTrees(own,[...combined.values()].flatMap(v=>[...v.supports!.values()]),nextRequest,ac.signal);
    if(token!==epoch||ac.signal.aborted||file!==f||sessions!==ss||!snapshot)return;
    supportTrees=trees;supportSnapshot=captureIslandDecoration(grids,snapshot,networks,trees);if(!supportSnapshot)throw Error('support');includeSupport=true;
   }else includeSupport=false;
   const stock=await readStock(f);
   if(token!==epoch||file!==f||sessions!==ss||worker!==own||blocked||!snapshot)return;
   if(combined){decorationReview=reviewIslandDecoration(grids,rasters,snapshot,networks,combined,definitions,stock,trees);if(!decorationReview)throw Error('plan');}else{review=islandSaveReplacement(grids,rasters,snapshot,incoming,definitions,stock);if(!review)throw Error('plan');}
  }catch{if(token===epoch)error=true;}finally{if(token===epoch)reading=false;}
 }
 function validate(){
  if(!allowed||blocked||busy||copy||!file||file!==source||sessions!==sourceSessions||!result?.changed||result.missing.length)return;
  const f=file,plan=result.plan,own=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});writeWorker=own;error=false;
  const done=(d:any)=>{own.terminate();if(writeWorker!==own||file!==f||source!==f||sessions!==sourceSessions){d?.bytes?.fill(0);return;}writeWorker=null;try{if(d?.kind!=='furniture-stock-copy')throw Error('copy');copy=experimentalCopyDownload(d,f);}catch{d?.bytes?.fill(0);error=true;}};
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command:includeNetworks?'island-decoration-export':'island-furniture-export',file:f,plan,allowExperimentalCopy:true});
 }
 function apply(){if(!allowed||blocked||!copy||!file||file!==source||sessions!==sourceSessions)return;if(!commitWorldCheckpoint(file,copy.file)){error=true;return;}onClose();}
 onMount(()=>{void load();});
 onDestroy(()=>{epoch++;supportAbort?.abort();for(const cancel of [...cancelRequests])cancel();stockWorker?.terminate();writeWorker?.terminate();if(copy)URL.revokeObjectURL(copy.url);writeWorker=null;});
</script>
<aside class="biome-furniture-panel island-furniture-panel" aria-label={includeNetworks?dw[0]:w[0]}>
 <strong>{includeNetworks?dw[0]:w[0]}</strong><label><input type="checkbox" checked={includeNetworks} disabled={!snapshot||busy||!!copy} on:change={e=>void setMode(e.currentTarget.checked)}/>{dw[1]}</label>{#if includeNetworks}<label><input type="checkbox" checked={includeSupport} disabled={!networkSnapshot||busy||!!copy} on:change={e=>void setSupports(e.currentTarget.checked)}/>{sw[0]}</label>{/if}<small>{includeNetworks?(includeSupport?sw[1]:dw[4]):w[3]}</small>
 {#if includeNetworks&&selectedSnapshot}{#each selectedSnapshot.summaries as row (row.key)}<small>{label(row.key)} · {bw2[4]} {row.furnitureCount} · {bw2[5]} {row.networkCount} · {bw[7]} {row.protectedCount}</small>{/each}{:else if snapshot}{#each snapshot.summaries as row (row.key)}<small>{label(row.key)} · {bw[15]} {row.editable} · {bw[7]} {row.preserved}</small>{/each}{/if}
 <input class="island-save-preset-input" type="file" accept=".json,application/json" bind:this={input} on:change={open}/>
 <div><button type="button" disabled={!snapshot||blocked||busy||!!copy||includeNetworks&&!selectedSnapshot} on:click={exportPreset}>{includeNetworks?dw[2]:w[1]}</button>{#if allowed}<button type="button" disabled={!snapshot||blocked||busy||!!copy} on:click={()=>input.click()}>{w[2]}</button>{/if}</div>
 {#if busy}<small role="status">{bw[14]}</small>{/if}
 {#if result}
  {#if decorationReview&&includeNetworks}{#each [...decorationReview.reviews] as [key,r] (key)}<small>{label(key)} · {bw2[4]} {bw[4]} {r.furniture.retained.length} · {bw[5]} {r.furniture.removed.length} · {bw[6]} {r.furniture.ghosts.length}</small><small>{bw2[5]} · {bw[4]} {r.network.retained} · {bw[5]} {r.network.removed.length} · {bw[6]} {r.network.ghosts.length}</small>{/each}{:else if review}{#each [...review.reviews] as [key,r] (key)}<small>{label(key)} · {bw[4]} {r.retained.length} · {bw[5]} {r.removed.length} · {bw[6]} {r.plan.add.length}</small>{/each}{/if}
  {#if result.missing.length}<small role="alert">{bw[8]} · {result.missing.reduce((n,p)=>n+p.quantity,0)}</small>{/if}
  {#if !result.changed}<small>{bw[13]}</small>{/if}
  {#if allowed&&!copy}<button type="button" disabled={blocked||busy||!result.changed||!!result.missing.length} on:click={validate}>{bw[9]}</button>{/if}
 {/if}
 {#if copy}<small>{tw[1]}</small><button type="button" disabled={blocked} on:click={apply}>{cw[0]}</button><a href={copy.url} download={copy.name}>{tw[2]}</a>{/if}
 {#if error}<small role="alert">{w[4]}</small>{/if}
 <button type="button" on:click={onClose}>{bw[10]}</button>
</aside>
<style>
 .island-furniture-panel{position:absolute;top:52px;right:6px;z-index:9;width:min(310px,calc(100% - 12px));display:grid;gap:6px;padding:8px;max-height:calc(100% - 60px);overflow:auto;border:1px solid var(--wand-line);border-radius:6px;color:var(--wand-text);background:var(--wand-card)}.island-save-preset-input{display:none}.island-furniture-panel button{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:4px;padding:5px}.island-furniture-panel button:disabled{opacity:.45}.island-furniture-panel small{font-size:12px}.island-furniture-panel div{display:flex;gap:5px;flex-wrap:wrap}.island-furniture-panel label{display:flex;gap:6px;align-items:center;font-size:12px}
</style>
