<script lang="ts">
 import {onDestroy} from 'svelte';
 import {browser} from '$app/environment';
 import {commitWorldCheckpoint} from '../ui/local-save-session.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {testSaveExportEnabled,testSaveWords} from './test-save-export.ts';
 import {groupPickupPlan,groupPickupWords,supportPickupWords,type GroupPickupRow} from './group-pickup.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let items:readonly MainlandSavedObject[]=[],file:File|null=null,locale:WandLanguage='ja',blocked=false,active=false;
 export let onApplied:()=>void=()=>{};
 export let freePlacement=false;
 export let roomPlan:readonly GroupPickupRow[]|null=null;
 const allowed=browser&&testSaveExportEnabled(window.location);
 let worker:Worker|null=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null,error=false,source:File|null=null,expected='';
 $: plan=roomPlan??groupPickupPlan(items,freePlacement);
 $: key=JSON.stringify(plan);
 $: w=groupPickupWords[locale];$: sw=supportPickupWords[locale];$: includesSupport=!!plan?.some(p=>p.includeSupport);
 $: cw=checkpointWords[locale];
 $: tw=testSaveWords[locale];
 $: active=!!worker||!!copy;
 $: if(source&&(source!==file||key!==expected||blocked))cancel();
 export function cancel(){worker?.terminate();worker=null;if(copy)URL.revokeObjectURL(copy.url);copy=null;error=false;source=null;expected='';}
 export function prepare(){
  if(!allowed||blocked||!file||!plan||worker||copy)return;
  cancel();const own=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'}),f=file,k=key;
  source=f;expected=k;worker=own;
  const done=(d:any)=>{own.terminate();if(worker!==own||file!==f||key!==k){d?.bytes?.fill(0);return;}worker=null;try{if(d?.kind!=='furniture-stock-copy')throw Error('copy');copy=experimentalCopyDownload(d,f);}catch{d?.bytes?.fill(0);error=true;}};
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);
  own.postMessage({command:'group-pickup-export',allowExperimentalCopy:true,file:f,plan});
 }
 function apply(){if(!allowed||blocked||!copy||!file||source!==file||expected!==key)return;if(!commitWorldCheckpoint(file,copy.file)){error=true;return;}cancel();onApplied();}
 onDestroy(cancel);
</script>
{#if allowed}
 <div class="group-pickup">
  {#if !active}<button type="button" title={includesSupport?sw[1]:w[1]} disabled={blocked||!plan} on:click={prepare}>{includesSupport?sw[0]:w[0]}</button>{/if}
  {#if worker}<small role="status">{w[2]}</small>{/if}
  {#if copy}{#if includesSupport}<small>{sw[1]}</small>{/if}<small role="status">{w[3]} · {plan?.length??0}</small><small>{tw[1]}</small><button type="button" disabled={blocked} on:click={apply}>{cw[0]}</button><a href={copy.url} download={copy.name}>{tw[2]}</a>{/if}
  {#if active}<button type="button" on:click={cancel}>{w[5]}</button>{/if}
  {#if error}<small role="alert">{w[4]}</small>{/if}
 </div>
{/if}
<style>
 .group-pickup{display:flex;align-items:center;flex-wrap:wrap;gap:4px}.group-pickup small{flex-basis:100%;color:var(--wand-muted)}button,a{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:4px;padding:5px}button:disabled{opacity:.45}a{color:var(--wand-accent)}
</style>
