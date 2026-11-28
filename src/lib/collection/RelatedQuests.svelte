<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import {base} from '$app/paths';
  import {collectionQuestCopy} from './quest-copy.ts';
  import type {CollectionQuestSummary,CollectionRelatedQuest}
    from './quest-evidence.ts';
  import {formatPublicGuideText,type PublicGuideNames}
    from '../guide/public-guide.ts';
  import {acquireCollectionEvidenceClient,type CollectionEvidenceHandle}
    from './source-evidence-client.ts';

  export let itemId:number;
  export let locale:string='ja';
  $: copy=collectionQuestCopy(locale);
  let expanded=false;
  onMount(()=>{expanded=true;});
  let requestCounter=0;
  let requestedItemId:number|null=null;
  let loading=false;
  let failed=false;
  let destroyed=false;
  let summary:CollectionQuestSummary|null=null;
  let client:CollectionEvidenceHandle|null=null;
  const LIMIT=8;

  function questName(quest:CollectionRelatedQuest):string{
    const names:PublicGuideNames=quest.names;
    const value=names[locale as keyof PublicGuideNames]??names.en??
      names.ja??quest.internalName;
    return formatPublicGuideText(value)||quest.questId;
  }
  function questHref(id:string,role:'target'|'item'):string{
    return `${base}/guide/quests/?quest=${id}&${role}=${itemId}`;
  }
  function allHref(role:'target'|'item'):string{
    return `${base}/guide/quests/?${role}=${itemId}`;
  }
  function load(id:number):void{
    if(!Number.isSafeInteger(id)||id<=0)return;
    requestedItemId=id;
    summary=null;
    loading=true;
    failed=false;
    const ticket=++requestCounter;
    try{
      client??=acquireCollectionEvidenceClient();
      void client.loadQuests(id,base).then(result=>{
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

<section class="inspector-details collection-related-quests">
  <h3 class="item-section-heading">{copy.title}</h3>
  {#if expanded}
    {#if loading}
      <p class="quest-evidence-status" role="status">{copy.loading}</p>
    {:else if failed}
      <p class="quest-evidence-status" role="alert">{copy.error}</p>
      <button type="button" class="quest-evidence-retry" on:click={retry}>{copy.retry}</button>
    {:else if summary&&summary.itemId===itemId}
      {#if summary.targets.length||summary.rewards.length}
        {#if summary.targets.length}
          <div class="quest-evidence-section">
            <p>{copy.targetHeading} ({summary.targets.length})</p>
            <ul>
              {#each summary.targets.slice(0,LIMIT) as quest (quest.questId)}
                <li><a href={questHref(quest.questId,'target')}>{questName(quest)}</a></li>
              {/each}
            </ul>
            {#if summary.targets.length>LIMIT}
              <a class="quest-evidence-more" href={allHref('target')}>{copy.showAll}</a>
            {/if}
          </div>
        {/if}
        {#if summary.rewards.length}
          <div class="quest-evidence-section">
            <p>{copy.rewardHeading} ({summary.rewards.length})</p>
            <ul>
              {#each summary.rewards.slice(0,LIMIT) as quest (quest.questId)}
                <li><a href={questHref(quest.questId,'item')}>{questName(quest)}</a></li>
              {/each}
            </ul>
            {#if summary.rewards.length>LIMIT}
              <a class="quest-evidence-more" href={allHref('item')}>{copy.showAll}</a>
            {/if}
          </div>
        {/if}
        <p class="quest-evidence-status">{copy.caution}</p>
      {:else}
        <p class="quest-evidence-status">{copy.empty}</p>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .item-section-heading{font-size:14px;margin:0 0 8px;color:var(--wand-text)}
  .collection-related-quests{margin:0 0 12px}
  .quest-evidence-section{margin:9px 0}
  .quest-evidence-section p{font-size:12px;font-weight:600;margin:0 0 6px}
  .quest-evidence-section ul{list-style:none;margin:0;padding:0;display:grid;gap:5px}
  .quest-evidence-section a,.quest-evidence-more{
    color:inherit;text-decoration:underline;text-underline-offset:2px;
    font-size:12px;line-height:1.4
  }
  .quest-evidence-section li{min-width:0;overflow-wrap:anywhere}
  .quest-evidence-more{display:inline-block;margin:8px 0 0}
  .quest-evidence-status{font-size:11px;line-height:1.5;opacity:.75;margin:8px 0}
  .quest-evidence-retry{border:1px solid #ffffff35;background:transparent;
    color:inherit;border-radius:8px;padding:5px 10px;cursor:pointer}
</style>
