<script lang="ts">
 import {onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import type {SessionPreset} from './preset-session-format.ts';
 import type {WandLanguage} from '$lib/ui/preferences';
 import {openPublicItemMaster} from '../items/public-item-master.ts';
 import {worldArtwork} from '../world/world-artwork.ts';
 import {nativeDetailWords} from './native-detail-words.ts';
 export let entry:SessionPreset;
 export let locale:WandLanguage;
 type Detail={contract:string;kind:string;baseItemId:number|null;creator:string|null;name:string|null;decalCount:number|null;textureCount:number|null;items:[number,number][];complete:boolean;renderedAppearanceVerified:false};
 let previous:SessionPreset|null=null,job:Worker|null=null,result:Detail|null=null,error=false,names=new Map<number,string>(),images=new Map<number,string>(),epoch=0,labelEpoch=0;
 $: w=nativeDetailWords[locale];
 $: if(previous!==entry){previous=entry;inspect(entry);}
 $: void labels(result,locale);
 function clear(){epoch++;labelEpoch++;job?.terminate();job=null;result=null;error=false;names=new Map();images=new Map();}
 onDestroy(clear);
 function inspect(source:SessionPreset){clear();if(!source.privateBackup)return;
  const token=epoch,own=new Worker(new URL('./native-scene.worker.ts',import.meta.url),{type:'module'});job=own;
  const finish=(v:any)=>{own.terminate();if(job!==own||epoch!==token)return;job=null;
   if(v?.kind==='native-detail'&&v.result?.contract==='wand.native-preset-detail@1'&&v.result.kind===source.kind&&v.result.renderedAppearanceVerified===false&&Array.isArray(v.result.items))result=v.result;else error=true;
  };
  own.onmessage=e=>finish(e.data);own.onerror=()=>finish(null);own.onmessageerror=()=>finish(null);own.postMessage({command:'inspect',file:source.file});
 }
 async function labels(value:Detail|null,language:WandLanguage){const token=++labelEpoch;names=new Map();images=new Map();if(!value)return;
  const ids=value.items.slice(0,120).map(([id])=>id),wanted=new Set(ids);
  for(const id of ids.slice(0,32))void worldArtwork(base,id).then(url=>{if(token===labelEpoch&&url)images=new Map(images).set(id,url);}).catch(()=>{});
  try{const db=await openPublicItemMaster(base,fetch,{scope:'complete',gameVersion:'1.26.2'}),all=await db.getBrowseNames(language);if(token===labelEpoch)names=new Map(all.filter(([id])=>wanted.has(id)));}catch{}
 }
</script>
{#if result}
 <section class="detail">
  {#if result.name}<strong>{result.name}</strong>{/if}
  {#if result.baseItemId}
   {#if images.has(result.baseItemId)}<img class="base-item" src={images.get(result.baseItemId)} alt={names.get(result.baseItemId)??''} loading="lazy"/>{/if}
   <strong>{names.get(result.baseItemId)??'—'}</strong><small>{w[0]}</small>
   {#if result.creator}<small>{w[1]}: {result.creator}</small>{/if}
   {#if result.decalCount!==null}<small>{w[2]}: {result.decalCount}</small>{/if}
   {#if result.textureCount!==null}<small>{w[3]}: {result.textureCount}</small>{/if}
  {:else}
   <strong>{w[4]} ({result.items.length} / {result.items.reduce((n,row)=>n+row[1],0)})</strong>
   <div class="items">{#each result.items.slice(0,120) as [id,n] (id)}<div>{#if images.has(id)}<img src={images.get(id)} alt="" loading="lazy"/>{/if}<span>{names.get(id)??'—'}</span><strong>×{n}</strong></div>{/each}</div>
   {#if !result.complete}<small>{w[5]}</small>{/if}
  {/if}
 </section>
{:else if error}<small role="alert">{w[6]}</small>{/if}
<style>.detail{display:grid;gap:6px}.base-item{width:100%;height:132px;object-fit:contain}.items{display:grid;gap:5px;max-height:36vh;overflow:auto}.items div{display:flex;align-items:center;gap:6px}.items span{flex:1}.items img{width:36px;height:36px;object-fit:contain}</style>
