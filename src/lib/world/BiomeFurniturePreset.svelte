<script lang="ts">
 import {readPresetText} from '../presets/preset-file.ts';
 import PresetFilePicker from './PresetFilePicker.svelte';
 import {savePresetFile,rememberPreset} from './preset-session.ts';

 import {onDestroy} from 'svelte';
 import {biomeFurnitureSnapshot,biomeFurnitureReplacement,biomeFurnitureWords} from './biome-furniture-preset.ts';
 import {parseWholeArea,wholeAreaKind} from './whole-area-preset.ts';
 import {DESIGN_FILE_LIMIT,type DesignItemGeometry,type DesignPlacement} from './design-layout.ts';
 import {parseFurnitureStock} from './furniture-stock-view.ts';
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
 let key='',input:HTMLInputElement,epoch=0,reading=false,error=false,shapeRequest=0,stockWorker:Worker|null=null,writeWorker:Worker|null=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null;
 let source:File|null=null,sourceObjects:readonly MainlandSavedObject[]|null=null,sourceKey='',incoming:DesignPlacement[]|null=null,defs:Map<number,DesignItemGeometry>|null=null,stock:Map<number,number>|null=null,subscribed:Worker|null=null;
 $: w=biomeFurnitureWords[locale];$: cw=checkpointWords[locale];$: tw=testSaveWords[locale];
 $: available=grids.filter(g=>wholeAreaKind(g,grids)==='biome'&&sessions.some(s=>s.receipt.viewKey===g.key&&!!s.completeGridOrdinal&&s.verifiedGridOrdinals.length===1&&s.verifiedGridOrdinals[0]===s.completeGridOrdinal&&!s.receipt.dataSampled&&!s.receipt.rowsWithoutCoordinates));
 $: if(!available.some(g=>g.key===key))key=available[0]?.key??'';
 $: grid=available.find(g=>g.key===key);
 $: snapshot=grid?biomeFurnitureSnapshot(grid,objects,omitted):null;
 $: result=grid&&source===file&&sourceObjects===objects&&sourceKey===key&&incoming&&defs&&stock?biomeFurnitureReplacement(grid,grids,rasters,objects,omitted,incoming,defs,stock):null;
 $: ghosts=result?.ghosts??[];$: removed=result?.removed??[];
 $: busy=reading||!!shapeRequest||!!stockWorker||!!writeWorker;
 $: if(source&&(source!==file||sourceObjects!==objects||sourceKey!==key||blocked))cancel();
 $: if(worker!==subscribed){subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);cancel();}
 function cancel(){epoch++;reading=false;shapeRequest=0;stockWorker?.terminate();stockWorker=null;writeWorker?.terminate();writeWorker=null;if(copy)URL.revokeObjectURL(copy.url);copy=null;source=null;sourceObjects=null;sourceKey='';incoming=null;defs=null;stock=null;error=false;}
 function exportPreset(){if(!snapshot||!grid||blocked||busy)return;savePresetFile(snapshot.text,'wand-biome-furniture-'+grid.key+'.json');}
 async function open(e:Event){
  const element=e.currentTarget as HTMLInputElement,f=element.files?.[0];element.value='';if(f)void openFile(f);
 }
 async function openFile(f:File){if(!file||!worker||!grid||!snapshot||blocked||!allowed||busy||copy)return;
  cancel();const own=worker,g=grid,activeFile=file,activeObjects=objects,token=epoch;source=activeFile;sourceObjects=activeObjects;sourceKey=g.key;reading=true;
  try{
   if(f.size>DESIGN_FILE_LIMIT)throw Error('size');const raw=await readPresetText(f,DESIGN_FILE_LIMIT),rows=parseWholeArea(raw,g,'biome');void rememberPreset(f,raw).catch(()=>{});
   if(epoch!==token||file!==activeFile||objects!==activeObjects||key!==g.key||worker!==own||blocked)return;
   incoming=rows;
   if(rows.length){shapeRequest=nextRequest();own.postMessage({command:'design-shapes',requestId:shapeRequest,key:g.key,itemIds:[...new Set(rows.map(p=>p.itemId))]});}else defs=new Map();
   const read=new Worker(new URL('./furniture-stock-view.worker.ts',import.meta.url),{type:'module'});stockWorker=read;
   const done=(d:any)=>{read.terminate();if(stockWorker!==read||source!==activeFile)return;stockWorker=null;try{if(d?.kind!=='furniture-stock')throw Error('stock');stock=parseFurnitureStock(d.result);}catch{error=true;}};
   read.onmessage=e=>done(e.data);read.onerror=()=>done(null);read.onmessageerror=()=>done(null);read.postMessage({command:'read-furniture-stock',file:activeFile});
  }catch{if(epoch===token)error=true;}finally{if(epoch===token)reading=false;}
 }
 function receive(e:MessageEvent){const d=e.data;if(!shapeRequest||d?.requestId!==shapeRequest)return;shapeRequest=0;if(d.kind!=='design-shapes'||d.key!==key||!Array.isArray(d.result)){error=true;return;}defs=new Map<number,DesignItemGeometry>(d.result.map((x:DesignItemGeometry)=>[x.itemId,x]));}
 function validate(){
  if(!allowed||blocked||busy||copy||!file||source!==file||sourceObjects!==objects||!result?.changed||result.missing.length)return;
  const f=file,plan=result.plan,own=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});writeWorker=own;error=false;
  const done=(d:any)=>{own.terminate();if(writeWorker!==own||source!==f||file!==f||sourceObjects!==objects){d?.bytes?.fill(0);return;}writeWorker=null;try{if(d?.kind!=='furniture-stock-copy')throw Error('copy');copy=experimentalCopyDownload(d,f);}catch{d?.bytes?.fill(0);error=true;}};
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command:'biome-furniture-export',file:f,plan,allowExperimentalCopy:true});
 }
 function apply(){if(!allowed||blocked||!copy||!file||source!==file||sourceObjects!==objects||sourceKey!==key)return;if(!commitWorldCheckpoint(file,copy.file)){error=true;return;}cancel();onClose();}
 onDestroy(()=>{cancel();subscribed?.removeEventListener('message',receive);});
</script>
<aside class="biome-furniture-panel" aria-label={w[0]}>
 <strong>{w[0]}</strong>
 <select aria-label={w[1]} bind:value={key} disabled={busy||!!copy}>{#each available as g (g.key)}<option value={g.key}>{label(g.key)}</option>{/each}</select>
 <small>{w[11]}</small>
 {#if snapshot}<small>{w[15]} {snapshot.editable.length} · {w[7]} {snapshot.protectedObjects.length}</small>{/if}
 <input class="biome-preset-input" type="file" accept=".wandpreset,.json,.gz,application/json,application/gzip" bind:this={input} on:change={open}/>
 <div><button type="button" disabled={!snapshot||blocked||busy||!!copy} on:click={exportPreset}>{w[2]}</button>{#if allowed}<PresetFilePicker {locale} schemas={['wand.preset.whole-area-design@1']} kinds={['biome']} disabled={!snapshot||blocked||busy||!!copy} label={w[3]} onPick={f=>void openFile(f)}/>{/if}</div>
 {#if busy}<small role="status">{w[14]}</small>{/if}
 {#if result}
  <small>{w[4]} {result.retained.length} · {w[5]} {result.removed.length} · {w[6]} {result.plan.add.length} · {w[7]} {result.protectedObjects.length}</small>
  {#if result.missing.length}<small role="alert">{w[8]} · {result.missing.reduce((n,p)=>n+p.quantity,0)}</small>{/if}
  {#if !result.changed}<small>{w[13]}</small>{/if}
  {#if allowed&&!copy}<button type="button" disabled={blocked||busy||!result.changed||!!result.missing.length} on:click={validate}>{w[9]}</button>{/if}
 {:else if incoming&&!busy}<small role="alert">{w[12]}</small>{/if}
 {#if copy}<small>{tw[1]}</small><button type="button" disabled={blocked} on:click={apply}>{cw[0]}</button><a href={copy.url} download={copy.name}>{tw[2]}</a>{/if}
 {#if error||!snapshot}<small role="alert">{w[12]}</small>{/if}
 <button type="button" on:click={onClose}>{w[10]}</button>
</aside>
<style>
 .biome-furniture-panel{position:absolute;top:52px;right:6px;z-index:9;width:min(290px,calc(100% - 12px));display:grid;gap:6px;padding:8px;border:1px solid var(--wand-line);border-radius:6px;color:var(--wand-text);background:var(--wand-card)}.biome-preset-input{display:none}.biome-furniture-panel button,.biome-furniture-panel select{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:4px;padding:5px}.biome-furniture-panel button:disabled{opacity:.45}.biome-furniture-panel small{font-size:12px}.biome-furniture-panel div{display:flex;gap:5px;flex-wrap:wrap}
</style>
