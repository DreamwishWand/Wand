<script lang="ts">
 import {onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import {worldArtwork} from './world-artwork.ts';
 import {parseFurnitureStock} from './furniture-stock-view.ts';
 import {stockToolWords,ordinaryFurniture,stockSourceEligible,stockPickup,stockPlacement,type StockCandidate} from './save-furniture-placement.ts';
 import {CARDINAL_ORIENTATIONS,type Cardinal} from './saved-map-transform.ts';
 import type {DesignCatalogItem,DesignItemGeometry} from './design-layout.ts';
 import type {MainlandGrid} from './mainland-world-coordinates.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {TerrainRaster} from './terrain-binding.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let open=false,file:File|null=null,worker:Worker|null=null,grids:readonly MainlandGrid[]=[],rasters:ReadonlyMap<string,TerrainRaster>=new Map(),chosen:MainlandSavedObject|null=null;
 export let locale:WandLanguage='ja',blocked=false,canStart=true,nextRequest:()=>number,onBegin:()=>void=()=>{},onClose:()=>void=()=>{};
 export let placing=false,ghost:StockCandidate|null=null;
 let catalog:DesignCatalogItem[]=[],counts:Map<number,number>|null=null,query='',limit=80;
 let catalogState:'idle'|'loading'|'ready'|'error'='idle',stockState:'idle'|'loading'|'ready'|'error'='idle';
 let ownStock:Worker|null=null,ownPreview:Worker|null=null,seenFile:File|null=null,subscribed:Worker|null=null,catalogRequest=0,catalogLocale:WandLanguage|null=null;
 let shapeRequests=new Map<number,{factor:1|2;key:string}>(),definitions=new Map<number,DesignItemGeometry>(),itemId=0,source:MainlandSavedObject|null=null,orientation:Cardinal='GridOrientation_Down';
 let point:{x:number;y:number}|null=null,candidate:StockCandidate|null=null,status:'idle'|'working'|'valid'|'error'='idle',stockChange:{before:number;after:number}|null=null;
 let artwork=new Map<number,string>(),asked=new Set<number>();
 $: w=stockToolWords[locale]??stockToolWords.en;
 $: if(file!==seenFile)resetFile(file);
 $: if(worker!==subscribed){subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);catalogRequest=0;catalogLocale=null;catalogState='idle';cancel();}
 $: if(open&&file&&stockState==='idle')loadStock(file);
 $: if(open&&worker&&grids.length&&catalogLocale!==locale)loadCatalog(worker,grids[0],locale);
 $: if(!open||blocked||!canStart)cancel();
 $: normalized=query.normalize('NFKC').toLocaleLowerCase().trim();
 $: items=catalog.filter(o=>o.layer==='furniture'&&ordinaryFurniture(o.itemId)&&(counts?.get(o.itemId)??0)>0&&o.name.normalize('NFKC').toLocaleLowerCase().includes(normalized));
 $: visible=items.slice(0,limit);
 $: if(open)loadArtwork(visible);
 $: ghost=candidate??(placing&&point?stockPlacement(grids,rasters,definitions,itemId,orientation,point.x,point.y,source):null);
 function resetFile(next:File|null){cancel();ownStock?.terminate();ownStock=null;counts=null;stockState='idle';seenFile=next;}
 function loadArtwork(rows:readonly DesignCatalogItem[]){for(const row of rows){if(asked.has(row.itemId))continue;asked.add(row.itemId);void worldArtwork(base,row.itemId).then(url=>{if(url)artwork=new Map(artwork).set(row.itemId,url);}).catch(()=>{});}}
 function loadStock(f:File){stockState='loading';const own=new Worker(new URL('./furniture-stock-view.worker.ts',import.meta.url),{type:'module'});ownStock=own;
  const finish=(raw:unknown)=>{own.terminate();if(ownStock!==own||file!==f)return;ownStock=null;try{counts=parseFurnitureStock(raw);stockState='ready';}catch{counts=null;stockState='error';}};
  own.onmessage=e=>finish(e.data?.kind==='furniture-stock'?e.data.result:null);own.onerror=()=>finish(null);own.onmessageerror=()=>finish(null);own.postMessage({command:'read-furniture-stock',file:f});
 }
 function loadCatalog(own:Worker,g:MainlandGrid,l:WandLanguage){catalogLocale=l;catalogState='loading';catalogRequest=nextRequest();own.postMessage({command:'design-catalog',key:g.key,locale:l,requestId:catalogRequest});}
 function receive(e:MessageEvent){const d=e.data;
  if(d?.requestId===catalogRequest){catalogRequest=0;if(d.kind==='design-catalog'&&Array.isArray(d.items)){catalog=d.items;catalogState='ready';limit=80;}else catalogState='error';return;}
  const request=shapeRequests.get(d?.requestId);if(!request)return;
  shapeRequests.delete(d.requestId);shapeRequests=new Map(shapeRequests);
  if(d.kind!=='design-shape'||d.key!==request.key||d.result?.itemId!==itemId){cancel();status='error';return;}
  definitions=new Map(definitions).set(request.factor,d.result as DesignItemGeometry);
 }
 export function cancel(){ownPreview?.terminate();ownPreview=null;placing=false;candidate=null;point=null;shapeRequests=new Map();definitions=new Map();itemId=0;source=null;status='idle';stockChange=null;}
 function begin(id:number,duplicate:MainlandSavedObject|null=null){
  if(blocked||!canStart||!open||!file||!worker||!ordinaryFurniture(id)||(counts?.get(id)??0)<1)return;
  cancel();onBegin();itemId=id;source=duplicate;orientation=duplicate&&CARDINAL_ORIENTATIONS.includes(duplicate.object.orientation as Cardinal)?duplicate.object.orientation as Cardinal:'GridOrientation_Down';placing=true;
  const seen=new Set<number>();for(const g of grids){if(seen.has(g.factor)||duplicate&&g.factor!==duplicate.factor)continue;seen.add(g.factor);const requestId=nextRequest();shapeRequests.set(requestId,{factor:g.factor,key:g.key});worker.postMessage({command:'design-shape',key:g.key,itemId:id,requestId});}shapeRequests=new Map(shapeRequests);
 }
 function pickup(){if(blocked||!canStart||!stockSourceEligible(chosen)||!counts?.has(Number(chosen.object.itemId)))return;const q=stockPickup(chosen);if(!q)return;cancel();onBegin();candidate=q;validate();}
 export function hover(p:{x:number;y:number}|null){if(placing&&!candidate)point=p;}
 export function pick(p:{x:number;y:number}){if(!placing||blocked||!canStart||shapeRequests.size||status==='working')return;
  const q=stockPlacement(grids,rasters,definitions,itemId,orientation,p.x,p.y,source);if(!q){status='error';return;}
  candidate=q;point=p;status='idle';stockChange=null;
 }
 export function turn(delta:number){if(!placing||source||status==='working')return;candidate=null;stockChange=null;status='idle';orientation=CARDINAL_ORIENTATIONS[(CARDINAL_ORIENTATIONS.indexOf(orientation)+delta+4)%4];}
 export function validate(){
  if(!candidate||!file||blocked||!canStart||status==='working')return;
  const q=candidate,f=file;ownPreview?.terminate();status='working';stockChange=null;
  const own=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});ownPreview=own;
  const finish=(data:unknown)=>{own.terminate();if(ownPreview!==own||file!==f||candidate!==q)return;ownPreview=null;const d=data as {kind?:string;validated?:boolean;stockBefore?:number;stockAfter?:number}|null;
   if(d?.kind==='furniture-stock-preview'&&d.validated===true&&typeof d.stockBefore==='number'&&typeof d.stockAfter==='number'&&Number.isSafeInteger(d.stockBefore)&&Number.isSafeInteger(d.stockAfter)&&d.stockAfter-d.stockBefore===(q.plan.action==='remove'?1:-1)){stockChange={before:d.stockBefore,after:d.stockAfter};status='valid';}else status='error';};
  own.onmessage=e=>finish(e.data);own.onerror=()=>finish(null);own.onmessageerror=()=>finish(null);own.postMessage({command:'furniture-stock-preview',file:f,destination:q.destination,plan:q.plan});
 }
 $: duplicateEligible=stockSourceEligible(chosen)&&!nativeMoveBlocked(chosen)&&(counts?.get(Number(chosen.object.itemId))??0)>0;
 function nativeMoveBlocked(p:MainlandSavedObject){return p.object.editRestrictions?.move==='denied'||p.object.editRestrictions?.move==='conditional';}
 onDestroy(()=>{cancel();ownStock?.terminate();subscribed?.removeEventListener('message',receive);});
</script>
{#if open}
 <aside class="save-furniture-palette" aria-label={w[0]}>
  <div class="palette-head"><strong>{w[0]}</strong><button type="button" aria-label={w[8]} on:click={onClose}>×</button></div>
  {#if blocked||!canStart}<small role="status">{w[12]}</small>{:else}
   {#if chosen&&stockSourceEligible(chosen)}
    <div class="palette-actions"><button type="button" disabled={!duplicateEligible} on:click={()=>begin(Number(chosen!.object.itemId),chosen)}>{w[4]}</button><button type="button" disabled={!counts?.has(Number(chosen.object.itemId))} on:click={pickup}>{w[5]}</button></div>
   {/if}
   {#if placing||candidate}
    <div class="palette-actions">{#if placing&&!source}<button type="button" aria-label={w[14]} on:click={()=>turn(-1)}>⟲</button><button type="button" aria-label={w[15]} on:click={()=>turn(1)}>⟳</button>{/if}<button type="button" on:click={cancel}>{w[7]}</button></div>
    {#if candidate&&candidate.plan.action!=='remove'}<button type="button" disabled={status==='working'} on:click={validate}>{candidate.plan.action==='duplicate'?w[4]:w[3]}</button>{:else if placing}<small>{w[6]}</small>{/if}
   {/if}
   {#if status==='working'}<small role="status">{w[9]}</small>{:else if status==='valid'}<small class="stock-preview-result" role="status">{w[10]} {#if stockChange}{w[2]} {stockChange.before} → {stockChange.after}{/if}</small>{:else if status==='error'}<small role="alert">{w[11]}</small>{/if}
   <input type="search" aria-label={w[1]} placeholder={w[1]} bind:value={query} on:input={()=>limit=80}/>
   {#if stockState==='loading'||catalogState==='loading'}<small role="status">{w[9]}</small>{:else if stockState==='error'||catalogState==='error'}<small role="alert">{w[11]}</small>{:else}
    <div class="stock-items" on:scroll={e=>{const el=e.currentTarget;if(el.scrollTop+el.clientHeight>=el.scrollHeight-100)limit=Math.min(items.length,limit+80);}}>
     {#each visible as item (item.itemId)}<button type="button" class="stock-item" aria-pressed={placing&&itemId===item.itemId} on:click={()=>begin(item.itemId)} title={item.name}>{#if artwork.has(item.itemId)}<img src={artwork.get(item.itemId)} alt="" loading="lazy"/>{/if}<span>{item.name}</span><small>{w[2]} {counts?.get(item.itemId)}</small></button>{/each}
     {#if !items.length}<small>{w[13]}</small>{/if}
    </div>
   {/if}
  {/if}
 </aside>
{/if}
<style>
 .save-furniture-palette{position:absolute;z-index:8;left:6px;top:56px;bottom:52px;width:min(250px,65%);display:flex;flex-direction:column;gap:5px;padding:6px;background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px;overflow:hidden}
 .palette-head,.palette-actions{display:flex;align-items:center;gap:4px;flex-wrap:wrap}.palette-head strong{flex:1}.stock-items{overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));align-content:start;gap:3px;min-height:0;flex:1}.stock-item{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:12px;overflow-wrap:anywhere}.stock-item img{width:48px;height:48px;object-fit:contain}.stock-item small{color:var(--wand-muted)}
 button,input{font:inherit;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:4px;padding:5px}button:disabled{opacity:.45}button[aria-pressed=true]{outline:2px solid var(--wand-accent)}small{font-size:12px}
</style>
