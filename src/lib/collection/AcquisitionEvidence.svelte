<script lang="ts">
  import {onDestroy} from 'svelte';
  import {base} from '$app/paths';
  import type {CollectionAcquisitionSummary} from './acquisition-summary.ts';
  import {collectionAcquisitionCopy} from './acquisition-copy.ts';
  import {acquireCollectionEvidenceClient,type CollectionEvidenceHandle}
    from './source-evidence-client.ts';

  export let itemId:number;
  export let locale:string='ja';
  $: copy=collectionAcquisitionCopy(locale);
  let expanded=false;
  let requestCounter=0;
  let requestedItemId:number|null=null;
  let loading=false;
  let failed=false;
  let destroyed=false;
  let summary:CollectionAcquisitionSummary|null=null;
  let client:CollectionEvidenceHandle|null=null;

  function load(id:number):void{
    if(!Number.isSafeInteger(id)||id<=0)return;
    requestedItemId=id;
    summary=null;
    failed=false;
    loading=true;
    const ticket=++requestCounter;
    try{
      client??=acquireCollectionEvidenceClient();
      void client.loadAcquisition(id,base).then(result=>{
        if(destroyed||ticket!==requestCounter||id!==itemId)return;
        summary=result;
        loading=false;
      },()=>{
        if(destroyed||ticket!==requestCounter||id!==itemId)return;
        summary=null;
        loading=false;
        failed=true;
      });
    }catch{
      loading=false;
      failed=true;
    }
  }
  function retry():void{
    requestedItemId=null;
    load(itemId);
  }
  $: if(expanded&&requestedItemId!==itemId)load(itemId);
  onDestroy(()=>{
    destroyed=true;
    client?.release();
  });
</script>

<details class="inspector-details collection-acquisition"
  on:toggle={(event)=>{
    expanded=(event.currentTarget as HTMLDetailsElement).open;
    if(expanded&&requestedItemId!==itemId)load(itemId);
  }}>
  <summary>{copy.title}</summary>
  {#if expanded}
    {#if loading}
      <p class="evidence-status" role="status">{copy.loading}</p>
    {:else if failed}
      <p class="evidence-status" role="alert">{copy.error}</p>
      <button type="button" class="retry" on:click={retry}>{copy.retry}</button>
    {:else if summary && summary.itemId===itemId}
      {#if summary.kinds.length || summary.candidates.length}
        {#if summary.kinds.length}
          <ul class="evidence-kinds" aria-label={copy.sourcesLabel}>
            {#each summary.kinds as kind (kind)}
              <li>{copy.kinds[kind]}</li>
            {/each}
          </ul>
        {/if}
        {#if summary.candidates.length}
          <p class="evidence-candidate-title">{copy.candidatesTitle}</p>
          <ul class="evidence-kinds" aria-label={copy.candidatesLabel}>
            {#each summary.candidates as candidate (candidate)}
              <li>{copy.candidates[candidate]}</li>
            {/each}
          </ul>
        {/if}
        <p class="evidence-status">{copy.caveat}</p>
      {:else}
        <p class="evidence-status">{copy.empty}</p>
      {/if}
    {/if}
  {/if}
</details>

<style>
  .collection-acquisition {margin:8px 0 12px}
  .evidence-kinds {display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;padding:0;list-style:none}
  .evidence-candidate-title {margin:10px 0 4px;font-size:11px;opacity:.75}
  .evidence-kinds li {border:1px solid #ffffff30;border-radius:8px;padding:6px 9px;color:inherit}
  .evidence-status {font-size:11px;line-height:1.5;color:inherit;opacity:.75;margin:8px 0}
  .retry {border:1px solid #ffffff35;background:transparent;color:inherit;border-radius:8px;padding:5px 10px;cursor:pointer}
</style>
