<script lang="ts">
 import {onDestroy} from 'svelte';
 import {travelWorldCheckpoint,type WorldCheckpointHistory} from '../ui/local-save-session';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let file:File,history:WorldCheckpointHistory,locale:WandLanguage='ja',blocked=false;
 let url='',seen:File|null=null;
 $: w=checkpointWords[locale];
 $: if(file!==seen){clear();seen=file;}
 $: name=file.name.replace(/(\.[^.]+)?$/,(_m,ext)=>'-world-test'+(ext??''));
 function clear(){if(url)URL.revokeObjectURL(url);url='';}
 function download(){if(blocked||!history.cursor)return;clear();url=URL.createObjectURL(file);}
 onDestroy(clear);
</script>
<section class="checkpoint-controls" aria-label={w[7]}>
 <strong>{w[7]} · {history.cursor}/{history.files.length-1}</strong>
 <div class="checkpoint-buttons"><button type="button" disabled={blocked||history.cursor===0} aria-label={w[1]} title={w[1]} on:click={()=>travelWorldCheckpoint(file,-1)}>↶</button><button type="button" disabled={blocked||history.cursor===history.files.length-1} aria-label={w[2]} title={w[2]} on:click={()=>travelWorldCheckpoint(file,1)}>↷</button>
 {#if url&&!blocked}<a href={url} download={name}>{w[3]}</a>{:else}<button type="button" disabled={blocked||history.cursor===0} on:click={download}>{w[3]}</button>{/if}</div>
 <small>{blocked?w[6]:w[4]}</small>
</section>
<style>
 .checkpoint-controls{display:grid;gap:3px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;padding:6px;font-size:12px;max-width:320px}.checkpoint-buttons{display:flex;gap:4px;flex-wrap:wrap}button,a{font:inherit;background:var(--wand-menu);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:4px;padding:4px}button:disabled{opacity:.45}a{color:var(--wand-accent)}small{color:var(--wand-muted)}
</style>
