<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import {base} from '$app/paths';
  import type {CollectionAcquisitionWithDistribution}
    from './distribution-evidence.ts';
  import {collectionAcquisitionCopy} from './acquisition-copy.ts';
  import {collectionDistributionCopy} from './distribution-copy.ts';
  import {acquireCollectionEvidenceClient,type CollectionEvidenceHandle}
    from './source-evidence-client.ts';

  import type {CollectionConcreteAcquisition} from './concrete-acquisition.ts';
  import type {ItemMasterLocale} from '../items/public-item-master.ts';

  export let itemId:number;
  export let locale:string='ja';
  $: copy=collectionAcquisitionCopy(locale);
  $: distributionCopy=collectionDistributionCopy(locale);
  let expanded=false;
  onMount(()=>{expanded=true;});
  let requestCounter=0;
  let requestedItemId:number|null=null;
  let loading=false;
  let failed=false;
  let destroyed=false;
  let summary:CollectionAcquisitionWithDistribution|null=null;
  let client:CollectionEvidenceHandle|null=null;
  let concrete:CollectionConcreteAcquisition|null=null;
  let concreteKey:string|null=null;
  let concreteTicket=0;
  let concreteLoading=false;
  let concreteFailed=false;
  const supportedLocales:readonly ItemMasterLocale[]=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'];
  function loadConcrete(id:number,language:string):void{
    if(!Number.isSafeInteger(id)||id<=0)return;
    const selected=supportedLocales.find(l=>l===language)??'ja';
    concreteKey=id+'|'+language;concrete=null;concreteLoading=true;concreteFailed=false;
    const ticket=++concreteTicket;
    try{
      client??=acquireCollectionEvidenceClient();
      void client.loadConcreteAcquisition(id,base,selected).then(result=>{
        if(destroyed||ticket!==concreteTicket||id!==itemId||language!==locale)return;
        concrete=result;concreteLoading=false;
      },()=>{
        if(destroyed||ticket!==concreteTicket||id!==itemId||language!==locale)return;
        concreteLoading=false;concreteFailed=true;
      });
    }catch{concreteLoading=false;concreteFailed=true;}
  }

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
  $: if(expanded&&concreteKey!==itemId+'|'+locale)loadConcrete(itemId,locale);
  onDestroy(()=>{
    destroyed=true;
    client?.release();
  });
</script>

<section class="inspector-details collection-acquisition">
  <h3 class="item-section-heading">{copy.title}</h3>
  {#if expanded}
    {#if loading}
      <p class="evidence-status" role="status">{copy.loading}</p>
    {:else if failed}
      <p class="evidence-status" role="alert">{copy.error}</p>
      <button type="button" class="retry" on:click={retry}>{copy.retry}</button>
    {:else if summary && summary.itemId===itemId}
      {#if summary.kinds.length || summary.candidates.length || summary.distribution.groups.length}
        {#if summary.distribution.groups.length}
          <p class="distribution-title">{distributionCopy.title}</p>
          <ul class="distribution-groups" aria-label={distributionCopy.sourcesLabel}>
            {#each summary.distribution.groups as entry (entry.group)}
              <li>
                <span>{distributionCopy.groups[entry.group]}</span>
                <small>{entry.proofs.map(proof=>distributionCopy.proofs[proof]).join(' · ')}</small>
              </li>
            {/each}
          </ul>
        {/if}
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
        <p class="evidence-status">{summary.distribution.groups.length
          ?distributionCopy.caveat:copy.caveat}</p>
      {:else if !concreteLoading&&!concreteFailed&&!concrete?.configuredNames.length&&!concrete?.candidateNames.length}
        <p class="evidence-status">{copy.empty}</p>
      {/if}
    {/if}
    {#if concreteLoading}
      <p class="evidence-status" role="status">{copy.loading}</p>
    {:else if concreteFailed}
      <button type="button" class="retry" on:click={()=>loadConcrete(itemId,locale)}>{copy.retry}</button>
    {:else if concrete&&concrete.itemId===itemId}
      {#if concrete.configuredNames.length}
        <ul class="concrete-sources" aria-label={copy.sourcesLabel}>
          {#each concrete.configuredNames as name (name)}<li>{name}</li>{/each}
        </ul>
      {/if}
      {#if concrete.candidateNames.length}
        <p class="evidence-candidate-title">{copy.candidatesTitle}</p>
        <ul class="concrete-sources" aria-label={copy.candidatesLabel}>
          {#each concrete.candidateNames as name (name)}<li>{name}</li>{/each}
        </ul>
      {/if}
      {#if (failed||!summary)&&concrete.candidateNames.length}
        <p class="evidence-status">{copy.caveat}</p>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .item-section-heading{font-size:14px;margin:0 0 8px;color:var(--wand-text)}
  .collection-acquisition {margin:8px 0 12px}
  .concrete-sources{list-style:none;margin:5px 0 8px;padding:0;display:flex;flex-wrap:wrap;gap:5px;font-size:12px}
  .concrete-sources li{border:1px solid #ffffff30;border-radius:7px;padding:4px 7px}
  .evidence-kinds {display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;padding:0;list-style:none}
  .distribution-title{font-size:12px;font-weight:600;margin:10px 0 5px}
  .distribution-groups{list-style:none;display:grid;gap:5px;margin:0 0 8px;padding:0}
  .distribution-groups li{display:grid;gap:2px;padding:6px 8px;
    border:1px solid #ffffff27;border-radius:7px;line-height:1.35;font-size:12px}
  .distribution-groups small{font-size:11px;opacity:.7;line-height:1.4}
  .evidence-candidate-title {margin:10px 0 4px;font-size:11px;opacity:.75}
  .evidence-kinds li {border:1px solid #ffffff30;border-radius:8px;padding:6px 9px;color:inherit}
  .evidence-status {font-size:11px;line-height:1.5;color:inherit;opacity:.75;margin:8px 0}
  .retry {border:1px solid #ffffff35;background:transparent;color:inherit;border-radius:8px;padding:5px 10px;cursor:pointer}
</style>
