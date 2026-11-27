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
 type VisualLayer={layer:number;itemId:number;color?:string|null;colors?:Array<string|null>;uvSpace?:boolean|null;repeat?:boolean|null;flipped?:boolean|null};
 type Visual={baseColor:string|null;decals:VisualLayer[];textures:VisualLayer[];source:number|null;complete:boolean};
 type Detail={contract:string;kind:string;baseItemId:number|null;creator:string|null;name:string|null;decalCount:number|null;textureCount:number|null;items:[number,number][];complete:boolean;renderedAppearanceVerified:false;visual?:Visual|null};
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
  const ids=[...new Set([...value.items.map(([id])=>id),...(value.visual?.decals??[]).map(row=>row.itemId),...(value.visual?.textures??[]).map(row=>row.itemId)])].slice(0,120),wanted=new Set(ids);
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
   {#if result.visual}
    {#if result.visual.baseColor}<div class="color-row"><span>{w[7]}</span><i class="swatch" title={result.visual.baseColor} style:background={result.visual.baseColor}></i></div>{/if}
    {#if result.visual.source===1||result.visual.source===2}<small>{w[result.visual.source===1?8:9]}</small>{/if}
    {#each [{label:w[2],rows:result.visual.decals},{label:w[3],rows:result.visual.textures}] as group}
     {#if group.rows.length}<strong>{group.label}</strong><div class="items">
      {#each group.rows as row (row.layer)}<div>{#if images.has(row.itemId)}<img src={images.get(row.itemId)} alt="" loading="lazy"/>{/if}<span>{names.get(row.itemId)??'—'}</span>
       {#each row.colors??[row.color??null] as color}{#if color}<i class="swatch" title={color} style:background={color}></i>{/if}{/each}
      </div>{/each}
     </div>{/if}
    {/each}
    {#if !result.visual.complete}<small>{w[5]}</small>{/if}<small>{w[10]}</small>
   {/if}
  {:else}
   <strong>{w[4]} ({result.items.length} / {result.items.reduce((n,row)=>n+row[1],0)})</strong>
   <div class="items">{#each result.items.slice(0,120) as [id,n] (id)}<div>{#if images.has(id)}<img src={images.get(id)} alt="" loading="lazy"/>{/if}<span>{names.get(id)??'—'}</span><strong>×{n}</strong></div>{/each}</div>
   {#if !result.complete}<small>{w[5]}</small>{/if}
  {/if}
 </section>
{:else if error}<small role="alert">{w[6]}</small>{/if}
<style>.detail{display:grid;gap:6px}.color-row{display:flex;align-items:center;gap:8px}.swatch{display:inline-block;width:22px;height:22px;border:1px solid var(--wand-line);border-radius:3px;flex:none}.base-item{width:100%;height:132px;object-fit:contain}.items{display:grid;gap:5px;max-height:36vh;overflow:auto}.items div{display:flex;align-items:center;gap:6px}.items span{flex:1}.items img{width:36px;height:36px;object-fit:contain}</style>
