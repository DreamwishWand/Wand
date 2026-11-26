<script lang="ts">
 import {onDestroy} from 'svelte';
 import DecorationDesign from './DecorationDesign.svelte';
 import {roomDesignWords,type RoomDesignTemplate} from './room-design.ts';
 import {defaultWorldLayers,type WorldLayerState} from './world-layer-state.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let worker:Worker|null=null,locale:WandLanguage='ja';
 export let nextRequest:()=>number,onClose:()=>void;
 export let layerState:WorldLayerState=defaultWorldLayers();
 let templates:RoomDesignTemplate[]=[],key='',pending=0,error=false,seen:Worker|null=null;
 $: w=roomDesignWords[locale];
 $: selected=templates.find(t=>t.grid.key===key)??null;
 $: if(worker!==seen)load(worker);
 function receive(e:MessageEvent){const d=e.data;if(!pending||d?.requestId!==pending)return;pending=0;if(d.kind!=='room-design-templates'||!Array.isArray(d.templates)||!d.templates.length){error=true;return;}templates=d.templates;key=templates[0].grid.key;}
 function load(next:Worker|null){seen?.removeEventListener('message',receive);seen=next;templates=[];key='';pending=0;error=false;if(!next)return;next.addEventListener('message',receive);pending=nextRequest();next.postMessage({command:'room-design-templates',requestId:pending});}
 onDestroy(()=>seen?.removeEventListener('message',receive));
</script>
<div class="room-design">
 <div class="room-tools"><select aria-label={w[1]} bind:value={key} disabled={!templates.length}>{#each templates as t}<option value={t.grid.key}>{t.label}</option>{/each}</select><button type="button" on:click={onClose}>{w[3]}</button></div>
 {#if error}<p role="alert">{w[2]}</p>{:else if !selected}<p role="status">…</p>{/if}
 <DecorationDesign active={!!selected} grid={selected?.grid??null} raster={selected?.raster??null} {worker} {nextRequest} {locale} bind:layerState/>
</div>
<style>
 .room-design{position:absolute;inset:0;min-height:0;background:var(--wand-bg);z-index:5}.room-tools{position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:8;display:flex;gap:4px;max-width:80%;align-items:center}.room-tools select,.room-tools button{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:4px;padding:6px}.room-design>p{padding:48px 12px;text-align:center}
</style>
