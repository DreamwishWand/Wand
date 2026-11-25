<script lang="ts">
 import {onDestroy} from 'svelte';
 import {browser} from '$app/environment';
 import {base} from '$app/paths';
 import {commitWorldCheckpoint} from '../ui/local-save-session.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {testSaveExportEnabled,testSaveWords} from './test-save-export.ts';
 import {captureFurnitureGroup,worldFurnitureClipboard,groupPasteWords,groupPasteCandidate,rotateFurnitureGroup,groupStockAvailable,type GroupPasteCandidate} from './group-paste.ts';
 import {parseFurnitureStock} from './furniture-stock-view.ts';
 import {worldArtwork} from './world-artwork.ts';
 import type {DesignClipItem,DesignItemGeometry} from './design-layout.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {MainlandGrid} from './mainland-world-coordinates.ts';
 import type {TerrainRaster} from './terrain-binding.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let items:readonly MainlandSavedObject[]=[],file:File|null=null,worker:Worker|null=null,grids:readonly MainlandGrid[]=[],rasters:ReadonlyMap<string,TerrainRaster>=new Map(),objects:readonly MainlandSavedObject[]=[],omitted=0,locale:WandLanguage='ja',blocked=false,nextRequest:()=>number,onBegin:()=>void=()=>{},active=false,ghost:GroupPasteCandidate|null=null;
 const allowed=browser&&testSaveExportEnabled(window.location);
 let clip:readonly DesignClipItem[]=[],defs=new Map<number,Map<number,DesignItemGeometry>>(),pending=new Map<number,{key:string;factor:1|2}>(),counts:Map<number,number>|null=null;
 let read:Worker|null=null,writing:Worker|null=null,subscribed:Worker|null=null,source:File|null=null,point:{x:number;y:number}|null=null,candidate:GroupPasteCandidate|null=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null,error=false,copied=false;
 let images=new Map<number,string>();
 $: w=groupPasteWords[locale];$: cw=checkpointWords[locale];$: tw=testSaveWords[locale];
 $: selection=captureFurnitureGroup(items);
 $: if(worker!==subscribed){subscribed?.removeEventListener('message',receive);subscribed=worker;subscribed?.addEventListener('message',receive);cancel();}
 $: if(active&&(source!==file||blocked))cancel();
 $: ready=active&&!!counts&&!pending.size&&groupStockAvailable(clip,counts)&&clip.every(p=>defs.has(p.itemId));
 $: ghost=candidate??(ready&&counts&&point?groupPasteCandidate(clip,grids,rasters,defs,counts,objects,omitted,point.x,point.y):null);
 export function capture(){if(!allowed||blocked||!selection)return false;worldFurnitureClipboard.set(selection);copied=true;return true;}
 export function begin(duplicate=false){
  const data=duplicate?selection:$worldFurnitureClipboard;
  if(!allowed||blocked||!file||!worker||!data?.length||!grids.length)return false;
  cancel();onBegin();source=file;active=true;clip=[...data];copied=false;
  const f=file,own=new Worker(new URL('./furniture-stock-view.worker.ts',import.meta.url),{type:'module'});read=own;
  const done=(raw:unknown)=>{own.terminate();if(read!==own||file!==f)return;read=null;try{counts=parseFurnitureStock(raw);if(!groupStockAvailable(clip,counts))error=true;}catch{error=true;}};
  own.onmessage=e=>done(e.data?.kind==='furniture-stock'?e.data.result:null);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command:'read-furniture-stock',file:f});
  const ids=[...new Set(clip.map(p=>p.itemId))],factors=new Set<number>();
  for(const g of grids){if(factors.has(g.factor))continue;factors.add(g.factor);const requestId=nextRequest();pending.set(requestId,{key:g.key,factor:g.factor});worker.postMessage({command:'design-shapes',key:g.key,itemIds:ids,requestId});}
  pending=new Map(pending);for(const id of ids)void worldArtwork(base,id).then(url=>{if(url)images=new Map(images).set(id,url);}).catch(()=>{});
  return true;
 }
 function receive(e:MessageEvent){const d=e.data,req=pending.get(d?.requestId);if(!req)return;pending.delete(d.requestId);pending=new Map(pending);
  if(d.kind!=='design-shapes'||d.key!==req.key||!Array.isArray(d.result)){error=true;return;}
  const expected=new Set(clip.map(p=>p.itemId));
  if(d.result.length!==expected.size||d.result.some((g:DesignItemGeometry)=>!expected.has(g.itemId)||g.layer!=='furniture'||g.surfaceCapable||!g.shapes)){error=true;return;}
  const next=new Map(defs);for(const g of d.result as DesignItemGeometry[]){const factors=new Map(next.get(g.itemId));factors.set(req.factor,g);next.set(g.itemId,factors);}defs=next;
 }
 export function hover(p:{x:number;y:number}|null){if(active&&!candidate&&!writing&&!copy)point=p;}
 export function pick(p:{x:number;y:number}){if(!ready||!counts||writing||copy)return;const q=groupPasteCandidate(clip,grids,rasters,defs,counts,objects,omitted,p.x,p.y);if(!q){error=true;return;}candidate=q;point=p;error=false;}
 export function turn(delta:number){if(!ready||writing||copy)return;const q=rotateFurnitureGroup(clip,defs,delta);if(!q){error=true;return;}clip=q;candidate=null;error=false;}
 export function validate(){
  if(!active||!allowed||blocked||!file||source!==file||!candidate||writing||copy)return;
  const f=file,q=candidate,own=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});writing=own;error=false;
  const done=(d:any)=>{own.terminate();if(writing!==own||file!==f||candidate!==q){d?.bytes?.fill(0);return;}writing=null;try{if(d?.kind!=='furniture-stock-copy')throw Error('copy');copy=experimentalCopyDownload(d,f);}catch{d?.bytes?.fill(0);error=true;}};
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command:'group-paste-export',file:f,plan:q.rows,allowExperimentalCopy:true});
 }
 function apply(){if(!allowed||blocked||!copy||!file||source!==file)return;if(!commitWorldCheckpoint(file,copy.file)){error=true;return;}cancel();}
 export function cancel(){read?.terminate();writing?.terminate();read=null;writing=null;if(copy)URL.revokeObjectURL(copy.url);copy=null;active=false;source=null;clip=[];defs=new Map();pending=new Map();counts=null;point=null;candidate=null;error=false;}
 onDestroy(()=>{cancel();subscribed?.removeEventListener('message',receive);});
</script>
{#if allowed}
 {#if active}<aside class="group-paste" aria-label={w[1]}><strong>{w[1]} · {clip.length}</strong><div class="paste-images">{#each clip as p}{#if images.has(p.itemId)}<img src={images.get(p.itemId)} alt="" loading="lazy"/>{/if}{/each}</div>{#if read||pending.size||writing}<small role="status">{w[6]}</small>{:else if ready&&!candidate}<small>{w[4]}</small>{/if}
 {#if !copy}<div><button type="button" disabled={!ready||!!writing} on:click={()=>turn(-1)} aria-label={w[9]}>⟲</button><button type="button" disabled={!ready||!!writing} on:click={()=>turn(1)} aria-label={w[10]}>⟳</button>{#if candidate}<button type="button" disabled={!!writing} on:click={validate}>{w[7]}</button>{/if}</div>{/if}
 {#if copy}<small>{tw[1]}</small><button type="button" on:click={apply}>{cw[0]}</button><a href={copy.url} download={copy.name}>{tw[2]}</a>{/if}{#if error}<small role="alert">{w[5]}</small>{/if}<button type="button" on:click={cancel}>{w[8]}</button></aside>
 {:else if copied}<span class="copied" role="status">{w[3]} · {$worldFurnitureClipboard.length}</span>{/if}
{/if}
<style>
 .group-paste{position:absolute;right:6px;top:52px;z-index:9;display:grid;gap:5px;width:min(270px,calc(100% - 12px));background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);padding:8px;border-radius:6px}.group-paste div{display:flex;flex-wrap:wrap;gap:4px}.paste-images img{width:32px;height:32px;object-fit:contain}button,a{font:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);color:inherit;border-radius:4px;padding:5px}button:disabled{opacity:.45}a{color:var(--wand-accent)}.copied{position:absolute;bottom:6px;right:6px;z-index:7;background:var(--wand-card);padding:4px 8px;border-radius:4px;font-size:12px}
</style>
