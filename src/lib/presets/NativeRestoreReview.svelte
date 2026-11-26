<script lang="ts">
 import {onDestroy} from 'svelte';
 import type {WandLanguage} from '$lib/ui/preferences';
 import {nativeReviewWords} from './native-review-words.ts';
 import type {SessionPreset} from './preset-session-format.ts';
 export let entry:SessionPreset;
 export let source:File|null;
 export let locale:WandLanguage;
 type Receipt={contract:string;schemaMatches:boolean;targetReadable:boolean;matchingDesigns:number|null;existingDesignsForItem:number|null;allocatorConsistent:boolean|null;requiresNewId:boolean;writerAuthorized:false};
 let worker:Worker|null=null,result:Receipt|null=null,busy=false,error=false;
 let previousFile:File|null=null,previousEntry:SessionPreset|null=null;
 $: w=nativeReviewWords[locale];
 $: if(previousFile!==source||previousEntry!==entry){previousFile=source;previousEntry=entry;clear();}
 function clear(){worker?.terminate();worker=null;result=null;busy=false;error=false;}
 onDestroy(clear);
 function review(){
  if(!source||busy||!entry.privateBackup)return;clear();busy=true;
  const own=new Worker(new URL('./native-preset.worker.ts',import.meta.url),{type:'module'});worker=own;
  const finish=(v:any)=>{own.terminate();if(worker!==own)return;worker=null;busy=false;
   if(v?.kind==='review'&&v.result?.contract==='wand.native-preset-restore-review@1'&&v.result.writerAuthorized===false)result=v.result;else error=true;
  };
  own.onmessage=e=>finish(e.data);own.onerror=()=>finish(null);own.onmessageerror=()=>finish(null);
  own.postMessage({command:'review',file:source,backup:entry.file});
 }
</script>
<div class="restore-review">
 <button type="button" disabled={!source||busy} on:click={review}>{w[0]}</button>
 {#if error}<small role="alert">{w[10]}</small>{/if}
 {#if result}<div class="review-result" role="status">
  <strong>{result.schemaMatches?w[1]:w[2]}</strong>
  {#if !result.targetReadable}<small>{w[3]}</small>{:else}
   {#if result.matchingDesigns!==null&&result.matchingDesigns>0}<small>{w[4]} ×{result.matchingDesigns}</small>{/if}
   <small>{w[5]}: {result.existingDesignsForItem??'—'}</small>
   {#if result.requiresNewId}<small>{result.allocatorConsistent===true?w[6]:w[7]}</small>{/if}
  {/if}
  <small>{w[8]}</small><button type="button" on:click={clear}>{w[9]}</button>
 </div>{/if}
</div>
<style>.restore-review,.review-result{display:grid;gap:6px}button{font:inherit;color:inherit;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:5px;padding:7px}button:disabled{opacity:.5}</style>
