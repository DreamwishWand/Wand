<script lang="ts">
 import {onDestroy} from 'svelte';
 import {sessionPresets,rememberPreset,renameSessionPreset,removeSessionPreset,downloadPresetFile} from './preset-session.ts';
 import {filterSessionPresets,type PresetSchema,type PresetKind} from './preset-session-format.ts';
 import {presetPickerWords} from './preset-picker-words.ts';
 import type {WandLanguage} from '../ui/preferences';
 export let locale:WandLanguage='ja',schemas:readonly PresetSchema[]=[],kinds:readonly PresetKind[]|undefined=undefined,disabled=false,label='',showTrigger=true,onPick:(file:File)=>void;
 let visible=false,reading=false,query='',selected=0,alias='',error=false,alive=true,input:HTMLInputElement;
 const kindIndex:Record<PresetKind,number>={scene:11,support:12,biome:13,island:14,world:15,region:16,room:17,floor:18,building:19,design:20,network:21,'tom-furniture':22,'tom-clothing':23,'native-decoration':24,'decoration-code':25,'shop-code':26};
 $: w=presetPickerWords[locale];$: entries=filterSessionPresets($sessionPresets,schemas,query,kinds);
 $: current=entries.find(e=>e.id===selected);
 $: if(disabled&&visible)visible=false;
 export function open(){if(disabled)return;query='';selected=0;alias='';error=false;visible=true;}
 function close(){visible=false;selected=0;}
 function choose(id:number){selected=id;alias=entries.find(e=>e.id===id)?.name??'';}
 function apply(){if(!current||disabled||reading)return;const file=current.file;close();onPick(file);}
 async function add(e:Event){
  const el=e.currentTarget as HTMLInputElement,files=[...(el.files??[])];el.value='';if(!files.length||reading||disabled)return;
  reading=true;error=false;let last=0;
  try{for(const file of files){try{const entry=await rememberPreset(file);if(alive&&(!schemas.length||schemas.includes(entry.schema))&&(!kinds||kinds.includes(entry.kind)))last=entry.id;else if(alive)error=true;}catch{if(alive)error=true;}}}
  finally{if(alive){reading=false;if(last){query='';selected=last;alias=$sessionPresets.find(e=>e.id===last)?.name??'';}}}
 }
 onDestroy(()=>{alive=false;});
</script>
{#if showTrigger}<button type="button" disabled={disabled} aria-expanded={visible} on:click={()=>visible?close():open()}>{label||w[0]}</button>{/if}
{#if visible}<div class="preset-picker" role="dialog" aria-label={w[0]} on:keydown|stopPropagation>
 <div class="preset-picker-head"><strong>{w[0]}</strong><button type="button" aria-label={w[7]} on:click={close}>×</button></div>
 <small>{w[8]}</small>
 <input type="file" hidden multiple accept=".wandpreset,.json,.gz,application/json,application/gzip" bind:this={input} on:change={add}/>
 <div class="preset-picker-actions"><button type="button" disabled={reading||disabled} on:click={()=>input.click()}>{w[1]}</button><input type="search" placeholder={w[2]} aria-label={w[2]} bind:value={query}/></div>
 <div class="preset-picker-list">{#each entries as entry (entry.id)}<button type="button" class:chosen={entry.id===selected} aria-pressed={entry.id===selected} on:click={()=>choose(entry.id)}><span>{entry.name}</span><small>{w[kindIndex[entry.kind]]}{entry.version?' · '+entry.version:''}</small></button>{:else}<small>{w[9]}</small>{/each}</div>
 {#if current}<div class="preset-picker-actions"><input type="text" maxlength="160" aria-label={w[4]} bind:value={alias}/><button type="button" on:click={()=>{if(current&&!renameSessionPreset(current.id,alias))error=true;}}>{w[4]}</button></div>
 <div class="preset-picker-actions"><button type="button" disabled={disabled||reading} on:click={apply}>{w[3]}</button><button type="button" on:click={()=>{if(current)void downloadPresetFile(current.file,current.name).catch(()=>error=true);}}>{w[6]}</button><button type="button" on:click={()=>{if(current)removeSessionPreset(current.id);selected=0;}}>{w[5]}</button></div>{/if}
 {#if error}<small role="alert">{w[10]}</small>{/if}
</div>{/if}
<style>
 .preset-picker{position:fixed;z-index:80;top:50%;left:50%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 24px));max-height:80vh;overflow:auto;display:grid;gap:8px;padding:12px;background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:8px;box-shadow:0 8px 40px #0006}
 .preset-picker-head,.preset-picker-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.preset-picker-head strong{flex:1}
 .preset-picker input:not([type=file]){flex:1;min-width:90px;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);padding:6px;border-radius:4px}
 .preset-picker button{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:4px;padding:6px}.preset-picker button:disabled{opacity:.5}
 .preset-picker-list{display:grid;gap:3px;max-height:40vh;overflow:auto}.preset-picker-list button{display:flex;flex-direction:column;align-items:start;min-width:0;text-align:left}.preset-picker-list span{overflow-wrap:anywhere}.preset-picker-list .chosen{outline:2px solid currentColor;outline-offset:-2px}
</style>
