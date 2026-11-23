<script lang="ts">
  import {onDestroy} from 'svelte';
  import {base} from '$app/paths';
  import type {
    CollectionAcquisitionKind,CollectionAcquisitionCandidate,
    CollectionAcquisitionSummary
  } from './acquisition-summary.ts';

  export let itemId:number;
  let expanded=false;
  let worker:Worker|null=null;
  let requestCounter=0;
  let activeRequestId=0;
  let requestedItemId:number|null=null;
  let loading=false;
  let failed=false;
  let summary:CollectionAcquisitionSummary|null=null;
  const cache=new Map<number,CollectionAcquisitionSummary>();
  const names:Record<CollectionAcquisitionKind,string>={
    crafting:'クラフト',cooking:'料理',fishing:'釣り',mining:'採掘',
    timebending:'タイムベンディング',farming:'栽培',foraging:'採集',
    game_shop:'ゲーム内ショップ',quest_reward:'クエスト報酬',
    event_reward:'イベント報酬',friendship_reward:'友情報酬',
    starpath:'スターパス',twitch_drop:'Twitch Drops',
    redeem_code:'交換コード',premium_shop:'プレミアムショップ',
    official_campaign:'公式キャンペーン',purchase_bonus:'購入特典',
    gift:'配布'
  };
  const candidateNames:Record<CollectionAcquisitionCandidate,string>={
    loot_table:'抽選テーブル',stall_slot:'店舗の陳列候補'
  };
  type Reply=
    | {requestId:number;itemId:number;ok:true;summary:CollectionAcquisitionSummary}
    | {requestId:number;itemId:number;ok:false};

  function load(id:number):void{
    if(!Number.isSafeInteger(id)||id<=0)return;
    requestedItemId=id;
    const cached=cache.get(id);
    failed=false;
    if(cached){summary=cached;loading=false;return;}
    summary=null;
    loading=true;
    try{
      if(!worker){
        worker=new Worker(new URL('./acquisition-evidence.worker.ts',import.meta.url),
          {type:'module'});
        worker.onmessage=({data}:MessageEvent<Reply>)=>{
          if(data.ok&&data.summary.itemId===data.itemId){
            cache.set(data.itemId,data.summary);
          }
          if(data.requestId!==activeRequestId||data.itemId!==itemId)return;
          loading=false;
          if(data.ok&&data.summary.itemId===itemId){
            summary=data.summary;
            failed=false;
          }else{
            summary=null;
            failed=true;
          }
        };
        worker.onerror=()=>{
          worker?.terminate();
          worker=null;
          if(!expanded)return;
          loading=false;
          summary=null;
          failed=true;
        };
      }
      const requestId=++requestCounter;
      activeRequestId=requestId;
      worker.postMessage({requestId,itemId:id,basePath:base});
    }catch{
      loading=false;
      summary=null;
      failed=true;
    }
  }
  function retry():void{
    requestedItemId=null;
    load(itemId);
  }
  $: if(expanded&&requestedItemId!==itemId)load(itemId);
  onDestroy(()=>worker?.terminate());
</script>

<details class="inspector-details collection-acquisition"
  on:toggle={(event)=>{
    expanded=(event.currentTarget as HTMLDetailsElement).open;
    if(expanded&&requestedItemId!==itemId)load(itemId);
  }}>
  <summary>入手元</summary>
  {#if expanded}
    {#if loading}
      <p class="evidence-status" role="status">読み込み中…</p>
    {:else if failed}
      <p class="evidence-status" role="alert">情報を読み込めませんでした。</p>
      <button type="button" class="retry" on:click={retry}>再試行</button>
    {:else if summary && summary.itemId===itemId}
      {#if summary.kinds.length || summary.candidates.length}
        {#if summary.kinds.length}
          <ul class="evidence-kinds" aria-label="原本に登録された入手元">
            {#each summary.kinds as kind (kind)}
              <li>{names[kind]}</li>
            {/each}
          </ul>
        {/if}
        {#if summary.candidates.length}
          <p class="evidence-candidate-title">原本上の候補</p>
          <ul class="evidence-kinds" aria-label="入手を保証しない原本上の候補">
            {#each summary.candidates as candidate (candidate)}
              <li>{candidateNames[candidate]}</li>
            {/each}
          </ul>
        {/if}
        <p class="evidence-status">原本上の経路・候補です。現在の販売・入手可否は確認していません。</p>
      {:else}
        <p class="evidence-status">登録済みの入手元情報はありません。</p>
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
