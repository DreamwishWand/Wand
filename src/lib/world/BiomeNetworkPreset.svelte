<script lang="ts">
 import {onDestroy} from 'svelte';
 import {networkRows,serializeBiomeNetwork,parseBiomeNetwork,reviewBiomeNetwork,networkPresetWords,type NetworkPose} from './biome-network-preset.ts';
 import {biomeFurnitureWords} from './biome-furniture-preset.ts';
 import {wholeAreaKind} from './whole-area-preset.ts';
 import type {DesignItemGeometry} from './design-layout.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {commitWorldCheckpoint} from '../ui/local-save-session.ts';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {testSaveWords} from './test-save-export.ts';
 import type {StockCandidate} from './save-furniture-placement.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {MainlandGrid} from './mainland-world-coordinates.ts';
 import type {TerrainRaster,TerrainScopeReceipt} from './terrain-binding.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let file:File|null,worker:Worker|null,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,objects:readonly MainlandSavedObject[],sessions:readonly TerrainScopeReceipt[],omitted=0,blocked=false,allowed=false,locale:WandLanguage='ja',nextRequest:()=>number,label:(key:string)=>string,onClose:()=>void;
 export let ghosts:readonly StockCandidate[]=[],removed:readonly MainlandSavedObject[]=[];
 let key='',input:HTMLInputElement,source:File|null=null,sourceObjects:readonly MainlandSavedObject[]|null=null,sourceKey='',error=false,reading=false,epoch=0,own:Worker|null=null,subscribed:Worker|null=null,requestId=0;
 let before:NetworkPose[]|null=null,after:NetworkPose[]|null=null,defs=new Map<number,DesignItemGeometry>(),copy:ReturnType<typeof experimentalCopyDownload>|null=null;
 $: w=networkPresetWords[locale];$: bw=biomeFurnitureWords[locale];$: cw=checkpointWords[locale];$: tw=testSaveWords[locale];
 $: available=grids.filter(g=>wholeAreaKind(g,grids)==='biome'&&sessions.some(s=>s.receipt.viewKey===g.key&&s.verifiedGridOrdinals.length===1&&!s.receipt.dataSampled&&!s.receipt.rowsWithoutCoordinates));
 $: if(!available.some(g=>g.key===key))key=available[0]?.key??'';
 $: grid=available.find(g=>g.key===key);
 $: busy=reading||!!own||!!requestId;
 $: result=grid&&source===file&&sourceObjects===objects&&sourceKey===key&&before&&after&&!busy?reviewBiomeNetwork(grid,rasters,objects,omitted,before,after,defs):null;
 $: ghosts=result?.ghosts??[];$: removed=result?.removed??[];
 $: if(source&&(source!==file||sourceObjects!==objects||sourceKey!==key||blocked))cancel();
 $: if(worker!==subscribed){subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);cancel();}
 function cancel(){epoch++;own?.terminate();own=null;requestId=0;reading=false;source=null;sourceObjects=null;sourceKey='';before=null;after=null;defs=new Map();error=false;if(copy)URL.revokeObjectURL(copy.url);copy=null;}
 function inspect(download:boolean,preset?:File){
  if(!file||!grid||blocked||busy||omitted||preset&&!allowed)return;
  cancel();const f=file,g=grid,token=epoch;source=f;sourceObjects=objects;sourceKey=key;
  const dest={layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY};
  const job=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});own=job;
  const done=async(d:any)=>{
   job.terminate();if(own!==job||epoch!==token)return;own=null;reading=true;
   try{
    if(d?.kind!=='area-network')throw Error('read');
    const rows=networkRows(d.rows,g);
    if(download){const text=serializeBiomeNetwork(g,rows),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='wand-biome-network-'+g.key+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
    if(!preset||!worker||preset.size>1_000_000)throw Error('file');
    const incoming=parseBiomeNetwork(await preset.text(),g);
    if(epoch!==token||source!==file||sourceObjects!==objects||sourceKey!==key)return;
    before=rows;after=incoming;
    const ids=[...new Set(incoming.map(p=>p.itemId))];if(ids.length){requestId=nextRequest();worker.postMessage({command:'design-shapes',requestId,key:g.key,itemIds:ids});}
   }catch{if(epoch===token)error=true;}finally{if(epoch===token)reading=false;}
  };
  job.onmessage=e=>void done(e.data);job.onerror=()=>void done(null);job.onmessageerror=()=>void done(null);job.postMessage({command:'inspect-area-network',file:f,plan:dest});
 }
 function open(e:Event){const el=e.currentTarget as HTMLInputElement,f=el.files?.[0];el.value='';if(f)inspect(false,f);}
 function receive(e:MessageEvent){const d=e.data;if(!requestId||d?.requestId!==requestId)return;requestId=0;if(d.kind!=='design-shapes'||d.key!==key||!Array.isArray(d.result)){error=true;return;}defs=new Map(d.result.map((p:DesignItemGeometry)=>[p.itemId,p]));}
 function validate(){
  if(!allowed||blocked||busy||copy||!file||source!==file||sourceObjects!==objects||!result?.changed)return;
  const f=file,plan=result.plan,job=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});own=job;error=false;
  const done=(d:any)=>{job.terminate();if(own!==job||source!==file||sourceObjects!==objects){d?.bytes?.fill(0);return;}own=null;try{if(d?.kind!=='furniture-stock-copy')throw Error('copy');copy=experimentalCopyDownload(d,f);}catch{d?.bytes?.fill(0);error=true;}};
  job.onmessage=e=>done(e.data);job.onerror=()=>done(null);job.onmessageerror=()=>done(null);job.postMessage({command:'biome-network-export',file:f,plan,allowExperimentalCopy:true});
 }
 function apply(){if(!allowed||blocked||!copy||!file||source!==file||sourceObjects!==objects||sourceKey!==key)return;if(!commitWorldCheckpoint(file,copy.file)){error=true;return;}cancel();onClose();}
 onDestroy(()=>{cancel();subscribed?.removeEventListener('message',receive);});
</script>
<aside class="biome-network-panel" aria-label={w[0]}>
 <strong>{w[0]}</strong><select aria-label={bw[1]} bind:value={key} disabled={busy||!!copy}>{#each available as g (g.key)}<option value={g.key}>{label(g.key)}</option>{/each}</select>
 <small>{w[3]}</small>
 <input class="biome-network-input" type="file" accept=".json,application/json" bind:this={input} on:change={open}/>
 <div><button type="button" disabled={!grid||blocked||busy||!!copy||!!omitted} on:click={()=>inspect(true)}>{w[1]}</button>{#if allowed}<button type="button" disabled={!grid||blocked||busy||!!copy||!!omitted} on:click={()=>input.click()}>{w[2]}</button>{/if}</div>
 {#if busy}<small role="status">{bw[14]}</small>{/if}
 {#if result}<small>{bw[4]} {result.retained} · {bw[5]} {result.removed.length} · {bw[6]} {result.ghosts.length}</small>{#if !result.changed}<small>{bw[13]}</small>{/if}{#if allowed&&!copy}<button type="button" disabled={blocked||busy||!result.changed} on:click={validate}>{bw[9]}</button>{/if}{:else if after&&!busy}<small role="alert">{bw[12]}</small>{/if}
 {#if copy}<small>{tw[1]}</small><button type="button" disabled={blocked} on:click={apply}>{cw[0]}</button><a href={copy.url} download={copy.name}>{tw[2]}</a>{/if}
 {#if error||!grid||omitted}<small role="alert">{bw[12]}</small>{/if}
 <button type="button" on:click={onClose}>{bw[10]}</button>
</aside>
<style>
 .biome-network-panel{position:absolute;top:52px;right:6px;z-index:9;width:min(290px,calc(100% - 12px));display:grid;gap:6px;padding:8px;border:1px solid var(--wand-line);border-radius:6px;color:var(--wand-text);background:var(--wand-card)}.biome-network-input{display:none}.biome-network-panel button,.biome-network-panel select{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:4px;padding:5px}.biome-network-panel button:disabled{opacity:.45}.biome-network-panel small{font-size:12px}.biome-network-panel div{display:flex;gap:5px;flex-wrap:wrap}
</style>
