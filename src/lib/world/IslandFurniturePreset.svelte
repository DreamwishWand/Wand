<script lang="ts">
 import PrivateStorageBackup from './PrivateStorageBackup.svelte';
 import {regionStorageWitnesses} from './region-decoration-backup.ts';
 import {verifiedLandscape,landscapeBackupWords,type LandscapePose} from './landscape-decoration-preset.ts';
 import RestoreStockReview from './RestoreStockReview.svelte';
 import {restoreStockRows} from './restore-stock-review.ts';
 import {readPresetText} from '../presets/preset-file.ts';
 import PresetFilePicker from './PresetFilePicker.svelte';
 import {savePresetFile,rememberPreset} from './preset-session.ts';
 import {onMount,onDestroy} from 'svelte';
 import {reviewRegionCapture,parseRegionDecoration,mergeRegionDecoration,regionBackupWords} from './region-decoration-backup.ts';
 import type {CaptureRegion} from './scene-capture-region.ts';
 import {readAreaSupportTrees,validateAreaSupportTrees,supportAreaWords} from './area-support-trees.ts';
 import type {SupportAreaTrees} from './biome-furniture-preset.ts';
 import {buildingBackupWords} from './building-pose-backup.ts';
 import {houseBackupWords} from './player-house-backup.ts';
 import {captureIslandDecoration,parseIslandDecoration,reviewIslandDecoration,islandDecorationWords,ISLAND_DECORATION_FILE_LIMIT,WORLD_DECORATION_FILE_LIMIT,worldDecorationWords} from './island-decoration-preset.ts';
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
 export let freePlacement=false;
 export let world=false,region:CaptureRegion|null=null;
 export let ghosts:readonly StockCandidate[]=[],removed:readonly MainlandSavedObject[]=[];
 let snapshot:ReturnType<typeof islandSaveSnapshot>=null,review:ReturnType<typeof islandSaveReplacement>=null;
 let includeSupport=false,supportTrees:SupportAreaTrees|undefined,supportAbort:AbortController|null=null,supportSnapshot:ReturnType<typeof captureIslandDecoration>=null;
 let landscapes=new Map<string,LandscapePose[]>();
 let includeNetworks=false,networkSnapshot:ReturnType<typeof captureIslandDecoration>=null,decorationReview:ReturnType<typeof reviewIslandDecoration>=null,networks=new Map<string,NetworkPose[]>();
 let input:HTMLInputElement,reading=true,error=false,source:File|null=null,sourceSessions:readonly TerrainScopeReceipt[]|null=null,epoch=0,writeWorker:Worker|null=null,stockWorker:Worker|null=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null;
 const cancelRequests=new Set<()=>void>();
 const openWords={ja:'浮島Presetを開く',en:'Open island preset',fr:'Ouvrir le preset de l’île',it:'Apri preset isola',de:'Inselvorlage öffnen','es-ES':'Abrir preset de la isla','zh-CN':'打开浮岛预设','pt-BR':'Abrir preset da ilha'} as const;
 $: rg=regionBackupWords[locale];$: ww=worldDecorationWords[locale];$: w=islandSaveWords[locale];$: sw=supportAreaWords[locale];$: selectedSnapshot=includeSupport?supportSnapshot:networkSnapshot;$: dw=islandDecorationWords[locale];$: bw2=biomeDecorationWords[locale];$: bw=biomeFurnitureWords[locale];$: cw=checkpointWords[locale];$: tw=testSaveWords[locale];
 $: regionCapture=region&&snapshot&&supportTrees&&supportSnapshot?reviewRegionCapture(region,grids,snapshot,networks,supportTrees,world,landscapes,freePlacement&&world):null;
 $: privateRegion=region&&snapshot?regionStorageWitnesses(region,grids,snapshot.objects):null;
 $: result=includeNetworks?decorationReview:review;
 $: stockRows=decorationReview&&includeNetworks?restoreStockRows([...decorationReview.reviews.values()].map(r=>r.furniture),decorationReview.missing):review&&!includeNetworks?restoreStockRows([...review.reviews.values()],review.missing):[];
 $: ghosts=world?[...(result?.reviews.values()??[])].flatMap(r=>r.ghosts):result?.reviews.get(activeKey)?.ghosts??[];$: removed=world?[...(result?.reviews.values()??[])].flatMap(r=>r.removed):result?.reviews.get(activeKey)?.removed??[];
 $: busy=reading||!!writeWorker;
 let lastFree=false;
 $: if(freePlacement!==lastFree){lastFree=freePlacement;if(source)onClose();}
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
 function readNetworks(f:File,scope:readonly MainlandGrid[]):Promise<{networks:Map<string,NetworkPose[]>;landscapes:Map<string,LandscapePose[]>}>{
  return new Promise((resolve,reject)=>{
   const own=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});
   const cleanup=()=>{clearTimeout(timer);own.terminate();cancelRequests.delete(cancel);};
   const cancel=()=>{cleanup();reject(Error('network'));};
   const timer=setTimeout(cancel,120000);cancelRequests.add(cancel);
   own.onmessage=e=>{cleanup();try{
    const data=e.data;if(data?.kind!=='map-networks'||!Array.isArray(data.receipts)||data.receipts.length!==scope.length)throw Error('network batch');
    const networks=new Map<string,NetworkPose[]>(),landscapes=new Map<string,LandscapePose[]>();
    for(const g of scope){const rows=data.receipts.filter((p:{key?:string})=>p?.key===g.key);if(rows.length!==1)throw Error('network identity');const p=rows[0];networks.set(g.key,networkRows(p.rows,g));landscapes.set(g.key,verifiedLandscape(g,snapshot?.objects.get(g.key)??[],p.landscape,freePlacement&&world));}
    resolve({networks,landscapes});
   }catch(e){reject(e);}};
   own.onerror=cancel;own.onmessageerror=cancel;own.postMessage({command:'inspect-map-networks',file:f,includeLandscape:true,plan:scope.map(g=>({key:g.key,destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY}}))});
  });
 }
 async function loadNetworks(f:File,ss:readonly TerrainScopeReceipt[],token:number){
  if(networkSnapshot)return;
  const {networks:next,landscapes:land}=await readNetworks(f,grids);
  if(epoch!==token||file!==f||sessions!==ss||!snapshot)throw Error('cancel');
  const capture=captureIslandDecoration(grids,snapshot,next,undefined,world,land);if(!capture)throw Error('network');
  networkSnapshot=capture;networks=next;landscapes=land;
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
  try{const trees=await readSupports(f,own);if(epoch!==token||file!==f||sessions!==ss||!snapshot)return;supportSnapshot=captureIslandDecoration(grids,snapshot,networks,trees,world,landscapes,world&&!region);if(!supportSnapshot)throw Error('support');supportTrees=trees;}
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
   snapshot=islandSaveSnapshot(grids,ss,maps,world);if(!snapshot)throw Error('snapshot');
   if(world||region){includeNetworks=true;includeSupport=true;await loadNetworks(f,ss,token);const trees=await readSupports(f,own);if(epoch!==token||file!==f||sessions!==ss)return;supportSnapshot=captureIslandDecoration(grids,snapshot,networks,trees,world,landscapes,world&&!region);if(!supportSnapshot)throw Error('support');supportTrees=trees;}
  }catch{if(token===epoch)error=true;}finally{if(token===epoch)reading=false;}
 }
 function exportPreset(){
  if(!snapshot||blocked||busy||includeNetworks&&!selectedSnapshot)return;const text=region?(regionCapture?.text??null):includeNetworks?selectedSnapshot!.text:snapshot.text;if(!text){error=true;return;}savePresetFile(text,region?'wand-region-decoration.json':world?'wand-world-'+grids[0].layoutId.split('/')[1]+'-decoration.json':'wand-island-'+(includeNetworks?'decoration-':'furniture-')+grids[0].layoutId.split('/')[2]+'.json');
 }
 async function open(e:Event){
  const el=e.currentTarget as HTMLInputElement,preset=el.files?.[0];el.value='';if(preset)void openPreset(preset);
 }
 async function openPreset(preset:File){
  if(!snapshot||!file||!worker||blocked||!allowed||busy||copy)return;
  const own=worker,f=file,ss=sessions,token=++epoch;reading=true;error=false;review=null;decorationReview=null;
  try{
   if(preset.size>(world?WORLD_DECORATION_FILE_LIMIT:Math.max(ISLAND_DECORATION_FILE_LIMIT,DESIGN_FILE_LIMIT)))throw Error('size');
   const text=await readPresetText(preset,world?WORLD_DECORATION_FILE_LIMIT:Math.max(ISLAND_DECORATION_FILE_LIMIT,DESIGN_FILE_LIMIT));if(token!==epoch||file!==f||sessions!==ss)return;void rememberPreset(preset,text).catch(()=>{});
   const schema=JSON.parse(text)?.schema,regionDoc=(world||region)&&schema==='wand.preset.region-decoration@1'?parseRegionDecoration(text,grids,world):null;
   if(region&&!regionDoc)throw Error('region');
   if(regionDoc&&region&&(['x','y','w','h'] as const).some(k=>region![k]!==regionDoc.region[k]))throw Error('region mismatch');
   const full=!!regionDoc||schema===(world?'wand.preset.world-decoration@1':'wand.preset.floating-island-decoration@1');if(world&&!full)throw Error('world');
   if(preset.size>(world?WORLD_DECORATION_FILE_LIMIT:full?ISLAND_DECORATION_FILE_LIMIT:DESIGN_FILE_LIMIT))throw Error('size');
   let combined=regionDoc?.incoming??(full?parseIslandDecoration(text,grids,world):null);
   const current=regionDoc&&supportSnapshot?parseIslandDecoration(supportSnapshot.text,grids,world):null;
   if(regionDoc&&!current)throw Error('current region');
   const incoming=combined?new Map([...combined].map(([k,v])=>[k,v.furniture])):parseIslandSavePreset(text,grids),rasters=new Map<string,TerrainRaster>(),definitions=new Map<string,Map<number,DesignItemGeometry>>();
   if(world&&combined&&[...combined.values()].some(v=>v.supports===undefined))throw Error('support scope');
   if(full)await loadNetworks(f,ss,token);
   if(token!==epoch||file!==f||sessions!==ss)return;
   for(const g of grids){
    if(token!==epoch)return;
    const d=await request(own,g.key,'terrain',{});
    if(d.sizeX!==g.sizeX||d.sizeY!==g.sizeY||!(d.nativeFloorValues instanceof Uint32Array)||d.nativeFloorValues.length!==g.sizeX*g.sizeY)throw Error('terrain');
    rasters.set(g.key,{sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:d.nativeFloorValues});
    const ids=[...new Set([...(incoming.get(g.key)??[]),...(combined?.get(g.key)?.network??[]),...(current?.get(g.key)?.furniture??[]),...(current?.get(g.key)?.network??[]),...(combined?.get(g.key)?.landscape??[]),...(current?.get(g.key)?.landscape??[]),...(regionDoc?combined?.get(g.key)?.buildings??[]:[])].map(p=>p.itemId))],defs=new Map<number,DesignItemGeometry>();
    for(let i=0;i<ids.length;i+=128){
     const batch=ids.slice(i,i+128),r=await request(own,g.key,'design-shapes',{itemIds:batch,allowBuildings:!!regionDoc&&world,freePlacement:freePlacement&&world,eightWay:world&&[...(incoming.get(g.key)??[]),...(current?.get(g.key)?.furniture??[])].some(p=>!Number.isInteger(p.orientation))});
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
    supportTrees=trees;supportSnapshot=captureIslandDecoration(grids,snapshot,networks,trees,world,landscapes,world&&!region);if(!supportSnapshot)throw Error('support');
   }
   const stock=await readStock(f);
   if(token!==epoch||file!==f||sessions!==ss||worker!==own||blocked||!snapshot)return;
   if(regionDoc){if(!trees||!current||!combined)throw Error('region');combined=mergeRegionDecoration(regionDoc.region,grids,snapshot,networks,trees,current,combined,definitions,world,landscapes,freePlacement&&world);if(!combined)throw Error('region boundary');}
   if(combined){decorationReview=reviewIslandDecoration(grids,rasters,snapshot,networks,combined,definitions,stock,trees,world,landscapes,freePlacement&&world);if(!decorationReview)throw Error('plan');}else{review=islandSaveReplacement(grids,rasters,snapshot,incoming,definitions,stock);if(!review)throw Error('plan');}
   // Do not change the confirmed rectangle or mode on a rejected import.
   if(regionDoc)region=regionDoc.region;
   includeNetworks=full;includeSupport=!!trees;
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
<aside class="biome-furniture-panel island-furniture-panel" aria-label={region?rg[0]:world?ww[0]:includeNetworks?dw[0]:w[0]}>
 <strong>{region?rg[0]:world?ww[0]:includeNetworks?dw[0]:w[0]}</strong>{#if !world&&!region}<label><input type="checkbox" checked={includeNetworks} disabled={!snapshot||busy||!!copy} on:change={e=>void setMode(e.currentTarget.checked)}/>{dw[1]}</label>{#if includeNetworks}<label><input type="checkbox" checked={includeSupport} disabled={!networkSnapshot||busy||!!copy} on:change={e=>void setSupports(e.currentTarget.checked)}/>{sw[0]}</label>{/if}{/if}<small>{region?rg[4]:world?ww[3]:includeNetworks?(includeSupport?sw[1]:dw[4]):w[3]}</small>
 {#if region}{#if regionCapture}<small>{bw2[4]} {regionCapture.summaries.reduce((n,r)=>n+r.furnitureCount,0)} · {bw2[5]} {regionCapture.summaries.reduce((n,r)=>n+r.networkCount,0)} · {landscapeBackupWords[locale]} {regionCapture.summaries.reduce((n,r)=>n+r.landscapeCount,0)} · {bw[7]} {regionCapture.summaries.reduce((n,r)=>n+r.protectedCount,0)}</small>{#if world}<small>{buildingBackupWords[locale]} {regionCapture.summaries.reduce((n,r)=>n+r.buildingCount,0)}</small>{/if}{:else if !busy}<small role="alert">{rg[4]}</small>{/if}{:else if includeNetworks&&selectedSnapshot}{#each selectedSnapshot.summaries as row (row.key)}<small>{label(row.key)} · {bw2[4]} {row.furnitureCount} · {bw2[5]} {row.networkCount} · {landscapeBackupWords[locale]} {row.landscapeCount} · {bw[7]} {row.protectedCount}</small>{#if world&&row.houseCount}<small>{houseBackupWords[locale]} {row.houseCount}</small>{/if}{#if world&&row.buildingCount}<small>{buildingBackupWords[locale]} {row.buildingCount}</small>{/if}{/each}{:else if snapshot}{#each snapshot.summaries as row (row.key)}<small>{label(row.key)} · {bw[15]} {row.editable} · {bw[7]} {row.preserved}</small>{/each}{/if}
 <input class="island-save-preset-input" type="file" accept=".wandpreset,.json,.gz,application/json,application/gzip" bind:this={input} on:change={open}/>
 <div><button type="button" disabled={!snapshot||blocked||busy||!!copy||includeNetworks&&!selectedSnapshot||!!region&&!regionCapture} on:click={exportPreset}>{region?rg[2]:world?ww[1]:includeNetworks?dw[2]:w[1]}</button>{#if allowed}<PresetFilePicker {locale} schemas={region?['wand.preset.region-decoration@1']:world?['wand.preset.world-decoration@1','wand.preset.region-decoration@1']:['wand.preset.floating-island-design@1','wand.preset.floating-island-decoration@1','wand.preset.whole-area-design@1']} kinds={region?['region']:world?['world','region']:['island']} disabled={!snapshot||blocked||busy||!!copy} label={region?rg[3]:world?ww[2]:openWords[locale]} onPick={f=>void openPreset(f)}/>{/if}</div>
 {#if file&&region&&privateRegion}<PrivateStorageBackup {file} {locale} blocked={blocked||busy||!!copy} scopeJson={JSON.stringify({kind:'region',objects:privateRegion})}/>{:else if file&&!region}<PrivateStorageBackup {file} {locale} blocked={blocked||busy||!!copy} scopeJson={JSON.stringify({kind:'outdoor',destinations:grids.map(g=>({layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY}))})}/>{/if}
 {#if busy}<small role="status">{bw[14]}</small>{/if}
 {#if result}
  {#if decorationReview&&includeNetworks}{#if decorationReview.houseReview}<small>{houseBackupWords[locale]} · {bw[4]} {decorationReview.houseReview.retained} · {bw[5]} {decorationReview.houseReview.removed} · {bw[6]} {decorationReview.houseReview.added}</small>{/if}{#if decorationReview.buildingReview}<small>{buildingBackupWords[locale]} · {decorationReview.buildingReview.moved}</small>{/if}{#each [...decorationReview.reviews] as [key,r] (key)}<small>{label(key)} · {bw2[4]} {bw[4]} {r.furniture.retained.length} · {bw[5]} {r.furniture.removed.length} · {bw[6]} {r.furniture.ghosts.length}</small><small>{bw2[5]} · {bw[4]} {r.network.retained} · {bw[5]} {r.network.removed.length} · {bw[6]} {r.network.ghosts.length}</small>{/each}{:else if review}{#each [...review.reviews] as [key,r] (key)}<small>{label(key)} · {bw[4]} {r.retained.length} · {bw[5]} {r.removed.length} · {bw[6]} {r.plan.add.length}</small>{/each}{/if}
  <RestoreStockReview rows={stockRows} {locale}/>
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
