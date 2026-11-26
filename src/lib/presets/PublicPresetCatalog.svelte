<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import type {WandLanguage} from '$lib/ui/preferences';
 import {rememberPreset} from './preset-session.ts';
 import {PUBLIC_KINDS,listPublicPresets,downloadPublicPreset,presetPublicEndpoint,publicMediaUrl,type PublicKind,type PublicPresetEntry} from './public-preset-client.ts';
 import {catalogWords} from './catalog-words.ts';
 import {presetPickerWords} from '../world/preset-picker-words.ts';
 export let locale:WandLanguage;
 let origin:string|null=null,query='',kind:PublicKind|'all'='all',rows:PublicPresetEntry[]=[],offset=0,next:number|null=null,loading=false,error=false,importError=false,importing='',imported=new Set<string>(),controller:AbortController|null=null,download:AbortController|null=null,alive=true;
 const kindIndex:Record<PublicKind,number>={scene:11,support:12,biome:13,island:14,world:15,region:16,room:17,floor:18,building:19,design:20,network:21};
 $: w=catalogWords[locale];$: p=presetPickerWords[locale];
 onMount(()=>{origin=presetPublicEndpoint(import.meta.env.VITE_WAND_PRESETS_PUBLIC_URL,window.location.hostname);if(origin)void load(0);});
 onDestroy(()=>{alive=false;controller?.abort();download?.abort();});
 async function load(start:number){
  if(!origin)return;controller?.abort();const own=new AbortController();controller=own;loading=true;error=false;rows=[];next=null;
  try{const result=await listPublicPresets(origin,query,kind==='all'?null:kind,start,fetch,own.signal);if(!alive||controller!==own)return;rows=result.entries;offset=start;next=result.nextOffset;}
  catch{if(alive&&controller===own&&!own.signal.aborted)error=true;}
  finally{if(alive&&controller===own)loading=false;}
 }
 async function importEntry(row:PublicPresetEntry){
  if(!origin||importing)return;const own=new AbortController();download=own;importing=row.revisionId;importError=false;
  try{const result=await downloadPublicPreset(origin,row,base,fetch,own.signal);if(!alive||download!==own)return;await rememberPreset(result.file,result.raw,result.source);if(alive)imported=new Set(imported).add(row.revisionId);}
  catch{if(alive&&!own.signal.aborted)importError=true;}
  finally{if(alive&&download===own)importing='';}
 }
</script>
<section class="public-presets">
 {#if !origin}<p role="status">{w[13]}</p>
 {:else}
 <form class="toolbar" on:submit|preventDefault={()=>load(0)}>
  <input type="search" maxlength="100" placeholder={w[1]} aria-label={w[1]} bind:value={query}/>
  <select bind:value={kind} aria-label={w[2]}><option value="all">{w[2]}</option>{#each PUBLIC_KINDS as k}<option value={k}>{p[kindIndex[k]]}</option>{/each}</select>
  <button type="submit" disabled={loading}>{w[1]}</button>
 </form>
 {#if error}<p role="alert">{w[6]}</p>{:else if loading}<p role="status">{w[11]}</p>{:else if !rows.length}<p role="status">{w[5]}</p>{/if}
 <div class="results">{#each rows as row (row.workId)}
  <article>
   {#if row.mediaId}<img src={publicMediaUrl(origin,row.mediaId)??undefined} alt="" loading="lazy" referrerpolicy="no-referrer"/>{/if}
   <strong>{row.title}</strong><small>{row.creatorName} · {p[kindIndex[row.receipt.kind as PublicKind]]}</small>
   <small>{row.receipt.distinctObjectTypes} / {row.receipt.totalObjects} · {Math.ceil(row.receipt.byteSize/1024).toLocaleString(locale)} KiB</small>
   <button type="button" disabled={!!importing||imported.has(row.revisionId)} on:click={()=>importEntry(row)}>{imported.has(row.revisionId)?w[8]:importing===row.revisionId?w[11]:w[7]}</button>
  </article>
 {/each}</div>
 {#if imported.size}<small role="status">{w[12]}</small>{/if}
 {#if importError}<small role="alert">{w[9]}</small>{/if}
 {#if offset>0||next!==null}<div class="toolbar"><button type="button" disabled={loading||offset===0} on:click={()=>load(Math.max(0,offset-30))}>{w[4]}</button><button type="button" disabled={loading||next===null} on:click={()=>next!==null&&load(next)}>{w[3]}</button></div>{/if}
 {/if}
</section>
<style>
 .public-presets{display:grid;gap:8px}.toolbar{display:flex;gap:6px;flex-wrap:wrap}.toolbar input{flex:1;min-width:90px}.results{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}article{display:grid;gap:5px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;overflow:hidden;padding:8px;align-content:start}article img{width:100%;aspect-ratio:16/9;object-fit:cover}button,input,select{font:inherit;color:inherit;background:var(--wand-card);border:1px solid var(--wand-line);padding:7px;border-radius:5px}button:disabled{opacity:.5}strong,small{overflow-wrap:anywhere}
</style>
