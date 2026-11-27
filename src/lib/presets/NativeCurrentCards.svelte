<script lang="ts">
 import {onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import type {WandLanguage} from '$lib/ui/preferences';
 import {openPublicItemMaster} from '../items/public-item-master.ts';
 import {worldArtwork} from '../world/world-artwork.ts';
 import {presetPickerWords} from '../world/preset-picker-words.ts';
 import {serviceWords} from './service-words.ts';
 type NativeCardRow={ordinal:number;kind:'tom-furniture'|'tom-clothing'|'native-decoration';storage:string;baseItemId:number|null;name:string|null;active:boolean};
 export let rows:readonly NativeCardRow[];
 export let locale:WandLanguage;
 export let nativeBusy:boolean;
 export let selected:number;
 export let onInspect:(ordinal:number)=>void;
 export let onBackup:(ordinal:number)=>void;
 const kinds={'tom-furniture':22,'tom-clothing':23,'native-decoration':24} as const;
 let query='',names=new Map<number,string>(),images=new Map<number,string>(),limit=60,lastRows:readonly NativeCardRow[]|null=null,lastLocale:WandLanguage|null=null,epoch=0;
 let observer:IntersectionObserver|null=null;
 $: p=presetPickerWords[locale];$: w=serviceWords[locale];
 $: if(lastRows!==rows||lastLocale!==locale){lastRows=rows;lastLocale=locale;limit=60;void labels(rows,locale);}
 $: filtered=rows.filter(row=>!query.trim()||(row.name||names.get(row.baseItemId??0)||p[kinds[row.kind]]).toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
 $: visible=filtered.slice(0,limit);
 $: void pictures(visible);
 function sentinel(node:HTMLElement){observer?.disconnect();observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))limit=Math.min(filtered.length,limit+60);},{rootMargin:'160px'});observer.observe(node);return{destroy(){observer?.disconnect();observer=null;}};}
 onDestroy(()=>{epoch++;observer?.disconnect();});
 async function labels(input:readonly NativeCardRow[],language:WandLanguage){const token=++epoch;names=new Map();if(!input.length)return;
  const wanted=new Set(input.flatMap(r=>r.baseItemId?[r.baseItemId]:[]));
  if(!wanted.size)return;
  try{const db=await openPublicItemMaster(base,fetch,{scope:'complete',gameVersion:'1.26.2'}),all=await db.getBrowseNames(language);if(token===epoch)names=new Map(all.filter(([id])=>wanted.has(id)));}catch{}
 }
 const pending=new Set<number>();
 async function pictures(input:readonly NativeCardRow[]){for(const row of input){const id=row.baseItemId;if(id===null||images.has(id)||pending.has(id))continue;pending.add(id);void worldArtwork(base,id).then(url=>{if(url)images=new Map(images).set(id,url);}).catch(()=>{});}}
</script>
<div class="native-cards">
 {#if rows.length}<input type="search" aria-label={p[2]} placeholder={p[2]} bind:value={query} on:input={()=>limit=60}/>{/if}
 <div class="cards">{#each visible as row (row.ordinal)}
  <article class:active={row.ordinal===selected}>
   <button type="button" class="pick" aria-pressed={row.ordinal===selected} disabled={nativeBusy} on:click={()=>onInspect(row.ordinal)}>
    {#if row.baseItemId&&images.has(row.baseItemId)}<img src={images.get(row.baseItemId)} alt="" loading="lazy"/>{:else}<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 5h22v22H5zM5 13h22M13 5v22" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>{/if}
    <span><strong>{row.name||names.get(row.baseItemId??0)||p[kinds[row.kind]]}</strong><small>{p[kinds[row.kind]]} {row.storage==='female'?'♀':row.storage==='male'?'♂':''}</small></span>
   </button>
   <button type="button" class="backup" aria-label={p[6]} title={p[6]} disabled={nativeBusy} on:click={()=>onBackup(row.ordinal)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </article>
 {:else}<p>{p[9]}</p>{/each}</div>
 {#if filtered.length>visible.length}<div use:sentinel aria-hidden="true"></div>{/if}
</div>
<style>.native-cards{display:grid;gap:8px;min-width:0}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px}article{display:flex;align-items:center;gap:3px;min-width:0;border:1px solid var(--wand-line);border-radius:6px;background:var(--wand-card)}article.active{outline:2px solid currentColor}.pick{display:flex;align-items:center;gap:5px;text-align:start;flex:1;min-width:0;padding:6px;border:0;background:none}.pick span{display:grid;min-width:0;overflow-wrap:anywhere;gap:3px}.pick img,.pick svg{width:48px;height:48px;object-fit:contain;flex:none}.backup{padding:5px;background:none;border:0}.backup svg{width:20px;height:20px}button,input{font:inherit;color:inherit}button:disabled{opacity:.5}input{padding:7px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:5px}</style>
