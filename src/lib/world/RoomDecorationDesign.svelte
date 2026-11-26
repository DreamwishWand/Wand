<script lang="ts">
 import {onDestroy} from 'svelte';
 import DecorationDesign from './DecorationDesign.svelte';
 import RoomProjectDesign from './RoomProjectDesign.svelte';
 import {roomProjectWords} from './room-project-design.ts';
 import {roomDesignWords,roomSurfaceWords,supportDesignWords,type RoomDesignTemplate} from './room-design.ts';
 import {defaultWorldLayers,type WorldLayerState} from './world-layer-state.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let worker:Worker|null=null,locale:WandLanguage='ja';
 export let nextRequest:()=>number,onClose:()=>void;
 export let layerState:WorldLayerState=defaultWorldLayers();
 let templates:RoomDesignTemplate[]=[],supports:RoomDesignTemplate[]=[],key='',pending=0,supportPending=0,error=false,supportError=false,seen:Worker|null=null,supportMode=false,query='',supportLocale='';
 let projectMode=false,projectBusy=false;
 $: rpw=roomProjectWords[locale];
 $: sdw=supportDesignWords[locale];
 $: matches=supports.filter(t=>t.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 $: if(worker&&supportMode&&supportLocale!==locale)loadSupports(worker,locale);
 $: w=roomDesignWords[locale];
 $: sw=roomSurfaceWords[locale];
 $: selected=(supportMode?supports:templates).find(t=>t.grid.key===key)??null;
 $: if(worker!==seen)load(worker);
 function loadSupports(next:Worker,lang:WandLanguage){supportLocale=lang;supportPending=nextRequest();supportError=false;next.postMessage({command:'support-design-templates',requestId:supportPending,locale:lang});}
 function toggleSupport(){supportMode=!supportMode;query='';key=(supportMode?supports:templates)[0]?.grid.key??'';if(supportMode&&worker&&!supports.length&&!supportPending)loadSupports(worker,locale);}
 function receive(e:MessageEvent){const d=e.data;if(supportPending&&d?.requestId===supportPending){supportPending=0;if(d.kind!=='support-design-templates'||!Array.isArray(d.templates)){supportError=true;return;}supports=d.templates;if(supportMode&&!supports.some(t=>t.grid.key===key))key=supports[0]?.grid.key??'';return;}if(!pending||d?.requestId!==pending)return;pending=0;if(d.kind!=='room-design-templates'||!Array.isArray(d.templates)||!d.templates.length){error=true;return;}templates=d.templates;if(!supportMode)key=templates[0].grid.key;}
 function load(next:Worker|null){seen?.removeEventListener('message',receive);seen=next;templates=[];supports=[];supportLocale='';supportPending=0;supportMode=false;key='';pending=0;error=false;if(!next)return;next.addEventListener('message',receive);pending=nextRequest();next.postMessage({command:'room-design-templates',requestId:pending});}
 onDestroy(()=>seen?.removeEventListener('message',receive));
</script>
<div class="room-design">
 {#if projectMode}<RoomProjectDesign {templates} {worker} {nextRequest} {locale} bind:layerState onClose={()=>{projectMode=false;projectBusy=false;}} onBusy={v=>projectBusy=v}/>{:else}
 <div class="room-tools"><button type="button" disabled={!templates.length} on:click={()=>projectMode=true}>{rpw[0]}</button><button type="button" aria-pressed={supportMode} on:click={toggleSupport}>{sdw[0]}</button>{#if supportMode}<input type="search" placeholder={sdw[1]} aria-label={sdw[1]} bind:value={query}/><select aria-label={sdw[0]} bind:value={key} disabled={!supports.length}>{#if selected&&!matches.some(t=>t.grid.key===key)}<option value={key}>{selected.label}</option>{/if}{#each matches as t}<option value={t.grid.key}>{t.label}</option>{/each}</select>{:else}<select aria-label={w[1]} bind:value={key} disabled={!templates.length}><optgroup label={sw[0]}>{#each templates.filter(t=>t.kind==='floor') as t}<option value={t.grid.key}>{t.label}</option>{/each}</optgroup><optgroup label={sw[1]}>{#each templates.filter(t=>t.kind==='wall') as t}<option value={t.grid.key}>{t.label}</option>{/each}</optgroup></select>{/if}<button type="button" on:click={onClose}>{w[3]}</button></div>
 {#if supportMode?supportError:error}<p role="alert">{w[2]}</p>{:else if !selected}<p role="status">…</p>{/if}
 <DecorationDesign active={!!selected} grid={selected?.grid??null} raster={selected?.raster??null} {worker} {nextRequest} {locale} bind:layerState/>
 {/if}
</div>
<style>
 .room-design{position:absolute;inset:0;min-height:0;background:var(--wand-bg);z-index:5}.room-tools{position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:8;display:flex;gap:4px;max-width:80%;align-items:center}.room-tools select,.room-tools input,.room-tools button{min-width:0;font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:4px;padding:6px}.room-design>p{padding:48px 12px;text-align:center}
</style>
