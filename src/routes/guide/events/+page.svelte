<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {watchWandLanguage} from '$lib/ui/preferences';
  import {
    loadPublicEventFriendshipRewards,DB03_EVENT_FRIENDSHIP_REWARD_FILE,
    type PublicEventFriendshipRewards,type NativeEventDefinition,
  } from '$lib/guide/public-event-friendship-rewards.ts';
  import {
    loadEventRewardItemLabels,DB03_EVENT_ITEM_LABELS_FILE,
    type EventRewardItemLabelIndex,type GuideRewardLocale,
  } from '$lib/guide/event-reward-item-labels.ts';
  import {resolveEventRewardItemDestination}
    from '$lib/guide/event-reward-navigation.ts';
  import {loadNewPublishedEventRewardNames,
    type PublicEventRewardNameRefresh}
    from '$lib/guide/public-event-reward-db00-refresh.ts';
  import {verifyPublicQuestIndex,formatPublicGuideText} from '$lib/guide/public-guide.ts';
  import {loadPublicEventQuestLinks,DB03_EVENT_QUEST_FILE,
    type PublicEventQuestIndex} from '$lib/guide/public-event-quest-links.ts';
  import {createEventQuestNameSearch,
    type EventQuestNameSearch} from '$lib/guide/event-quest-name-search.ts';
  import {loadPublicEventDutyLinks,DB03_EVENT_DUTY_FILE,
    type PublicEventDutyIndex} from '$lib/guide/public-event-duty-links.ts';
  import {loadPublicEventSceneLinks,DB03_EVENT_SCENE_FILE,
    type PublicEventSceneIndex} from '$lib/guide/public-event-scene-links.ts';

  type Filter='all'|'mini_event'|'floating_festival'|'default_friendship';
  let source:PublicEventFriendshipRewards|null=null;
  let labels:EventRewardItemLabelIndex|null=null;
  let refreshedNames:PublicEventRewardNameRefresh|null=null;
  let questCatalogue:any=null;
  let eventQuestLinks:PublicEventQuestIndex|null=null;
  let questNameSearch:EventQuestNameSearch|null=null;
  let eventDutyLinks:PublicEventDutyIndex|null=null;
  let eventSceneLinks:PublicEventSceneIndex|null=null;
  let loading=true;
  let error='';
  let labelError=false;
  let query='';
  let category:Filter='all';
  let locale:GuideRewardLocale='ja';
  let selectedKey='';
  let highlightItem='';
  const root=`${base}/guide/public/`;
  const filterOptions:readonly {id:Filter;text:string}[]=[
    {id:'all',text:'すべて'},
    {id:'mini_event',text:'イベント'},
    {id:'floating_festival',text:'フローティングフェスティバル'},
    {id:'default_friendship',text:'友情報酬'},
  ];
  const stages:Record<string,string>={
    FirstIntermediateReward:'中間報酬 1',
    SecondIntermediateReward:'中間報酬 2',
    ThirdIntermediateReward:'中間報酬 3',
    CompletedReward:'レベル完了',
  };

  function eventName(event:NativeEventDefinition):string{
    return event.names[locale]||event.names.en||event.id;
  }
  function itemName(itemId:string):string{
    const newlyPublished=refreshedNames?.getDisplayName(itemId,locale);
    if(newlyPublished)return newlyPublished;
    const resolved=labels?.getDisplayName(itemId,locale);
    return resolved&&resolved!==itemId?resolved:`Item ID ${itemId}`;
  }
  function itemCategory(itemId:string):string|null{
    return refreshedNames?.getSourceCategory(itemId)??
      labels?.getItem(itemId)?.sourceCategory??null;
  }
  function questTitle(questId:string):string{
    const quest=questCatalogue?.quests.find((row:any)=>row.id===questId);
    return formatPublicGuideText(quest?.names?.[locale]||quest?.names?.en||quest?.internalName||questId);
  }
  function filterEvents(
    events:readonly NativeEventDefinition[],type:Filter,search:string,
    language:GuideRewardLocale,availableNames:EventRewardItemLabelIndex|null,
    publishedRefresh:PublicEventRewardNameRefresh|null,
    dutyIndex:PublicEventDutyIndex|null,
    questSearch:EventQuestNameSearch|null,
    sceneIndex:PublicEventSceneIndex|null
  ):NativeEventDefinition[]{
    const words=search.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return events.filter(event=>{
      if(type!=='all'&&type!==event.kind)return false;
      if(event.id==='TestEv')return false; // Source-internal placeholder, not playable.
      if(!words.length)return true;
      const terms=[event.id,event.names[language],event.names.en,...event.rewards.flatMap(reward=>[
        reward.itemId,
        publishedRefresh?.getDisplayName(reward.itemId,language)??
          availableNames?.getDisplayName(reward.itemId,language)??reward.itemId,
      ]),...(event.kind==='mini_event'?
        (dutyIndex?.getEventDuties(event.id).map(link=>link.dutyId)??[]):[]),
        ...(event.kind==='mini_event'?
          (questSearch?.getEventSearchTerms(event.id,language)??[]):[]),
        ...(event.kind==='floating_festival'?
          (sceneIndex?.getFestivalScenes(event.id).map(link=>link.sceneId)??[]):[])
      ].join(' ').normalize('NFKC').toLocaleLowerCase();
      return words.every(word=>terms.includes(word));
    });
  }
  $: visible=filterEvents(source?.events??[],category,query,locale,labels,refreshedNames,eventDutyLinks,questNameSearch,eventSceneLinks);
  $: selected=visible.find(event=>event.id===selectedKey)??visible[0]??null;
  $: eventQuests=selected&&eventQuestLinks?eventQuestLinks.getEventQuests(selected.id):[];
  $: selectedRewards=selected?.rewards.filter(row=>
    !highlightItem||row.itemId===highlightItem)??[];
  function clearItemFocus(){
    highlightItem='';
    const url=new URL(window.location.href);
    if(['item','scene','quest','duty'].some(key=>url.searchParams.has(key))){
      for(const key of ['item','scene','quest','duty'])
        url.searchParams.delete(key);
      window.history.replaceState(window.history.state,'',url);
    }
  }
  function choose(event:NativeEventDefinition){
    clearItemFocus();
    selectedKey=event.id;
    const url=new URL(window.location.href);
    url.searchParams.set('event',event.id);
    window.history.replaceState(window.history.state,'',url);
  }
  async function loadEventQuestSources(eventSource:PublicEventFriendshipRewards){
    try{
      const response=await fetch(`${root}quest-index.json`);
      if(!response.ok)return;
      const catalog=verifyPublicQuestIndex(await response.json());
      const links=await loadPublicEventQuestLinks(eventSource,catalog,
        `${root}${DB03_EVENT_QUEST_FILE}`);
      const names=createEventQuestNameSearch(eventSource,catalog,links);
      if(source===eventSource){
        questCatalogue=catalog;eventQuestLinks=links;questNameSearch=names;
        const params=new URLSearchParams(window.location.search);
        const requested=params.getAll('quest');
        // Never treat a URL-provided Quest ID as a relation without the
        // independently pinned Quest catalogue and original Event graph.
        if(requested.length===1&&!params.has('item')&&!params.has('event')&&
          !params.has('duty')&&!params.has('scene')&&!query&&category==='all'){
          const matches=links.getQuestEvents(requested[0]);
          if(matches.length){
            category='mini_event';
            query=requested[0];
            selectedKey=matches[0].eventId;
          }
        }
      }
    }catch{
      // Optional cross-navigation: keep source-authenticated rewards available.
    }
  }
  async function loadEventDuties(eventSource:PublicEventFriendshipRewards){
    try{
      const links=await loadPublicEventDutyLinks(eventSource,
        `${root}${DB03_EVENT_DUTY_FILE}`);
      if(source===eventSource){
        eventDutyLinks=links;
        const params=new URLSearchParams(window.location.search);
        const requested=params.getAll('duty');
        // Native Duty IDs are search keys, not unlocked/completed claims.
        if(requested.length===1&&!params.has('item')&&!params.has('event')&&
          !params.has('quest')&&!params.has('scene')&&!query&&category==='all'){
          const matches=links.getDutyEvents(requested[0]);
          if(matches.length){
            category='mini_event';
            query=requested[0];
            selectedKey=matches[0].eventId;
          }
        }
      }
    }catch{
      // Event and reward browsing is independent of optional duty-ID search.
    }
  }
  async function loadEventScenes(eventSource:PublicEventFriendshipRewards){
    try{
      const links=await loadPublicEventSceneLinks(eventSource,
        `${root}${DB03_EVENT_SCENE_FILE}`);
      if(source!==eventSource)return;
      eventSceneLinks=links;
      const params=new URLSearchParams(window.location.search);
      const incoming=params.getAll('scene');
      // Only source-known Scene IDs may drive a deep link. Never override
      // a user's search entered while the optional source was loading.
      if(incoming.length===1&&!params.has('item')&&!params.has('event')&&
        !params.has('quest')&&!params.has('duty')&&!query&&category==='all'){
        const matches=links.getSceneFestivals(incoming[0]);
        if(matches.length){
          category='floating_festival';
          query=incoming[0];
          selectedKey=matches[0].festivalId;
        }
      }
    }catch{
      // Optional scene cross-navigation; source events/rewards still work.
    }
  }
  async function load(){
    loading=true;error='';labelError=false;labels=null;
    refreshedNames=null;questCatalogue=null;eventQuestLinks=null;questNameSearch=null;
    eventDutyLinks=null;eventSceneLinks=null;
    try{
      const read=await loadPublicEventFriendshipRewards(`${root}${DB03_EVENT_FRIENDSHIP_REWARD_FILE}`);
      source=read;
      void loadEventQuestSources(read);
      void loadEventDuties(read);
      void loadEventScenes(read);
      const params=new URLSearchParams(window.location.search);
      const focused=resolveEventRewardItemDestination(read,params.get('item'));
      if(focused){
        highlightItem=focused.itemId;
        if(focused.section==='default_friendship'){
          category='default_friendship';
        }else{
          category='all';
          query=focused.itemId;
          selectedKey=focused.eventId??'';
        }
      }else if(!selectedKey){
        const fromUrl=params.get('event');
        if(fromUrl&&read.events.some(event=>event.id===fromUrl&&event.id!=='TestEv'))
          selectedKey=fromUrl;
      }
      try{
        const loaded=await loadEventRewardItemLabels(read,`${root}${DB03_EVENT_ITEM_LABELS_FILE}`);
        labels=loaded;
        // A new public-only DB-00 release can fill 32 unresolved reward names;
        // the unchanged release incurs only a tiny active-pointer lookup.
        void loadNewPublishedEventRewardNames(read,loaded,base)
          .then(overlay=>{
            if(source===read&&labels===loaded)refreshedNames=overlay;
          }).catch(()=>{
            // Keep existing source-pinned 109 labels and Item ID fallbacks.
          });
      }catch{labelError=true;}
    }catch(e){
      source=null;
      error=e instanceof Error?e.message:String(e);
    }finally{loading=false;}
  }
  onMount(()=>{
    const unwatch=watchWandLanguage(lang=>{locale=lang as GuideRewardLocale;});
    void load();
    return ()=>unwatch();
  });
</script>

<svelte:head>
  <title>期間限定イベント・友情報酬 | Dreamwish Wand Guide</title>
  <meta name="description" content="ゲーム原本で確認したイベントを関連クエスト・報酬の名称やIDから調べる。" />
</svelte:head>

<main class="event-guide">
  <header class="topbar">
    <div class="headline">
      <a href={`${base}/guide/`} class="back" aria-label="Guideへ戻る">‹</a>
      <h1>イベント・友情報酬</h1>
    </div>
    <label class="search">
      <svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
      <input type="search" bind:value={query} on:input={clearItemFocus} placeholder="イベント・クエスト・アイテムを検索" aria-label="イベントや報酬を検索" />
    </label>
  </header>

  {#if loading}
    <p class="status" role="status">読み込み中…</p>
  {:else if error||!source}
    <p class="status" role="alert">イベントデータを読み込めませんでした。</p>
    <button class="retry" on:click={load}>再読み込み</button>
  {:else}
    <nav class="filters" aria-label="報酬区分">
      {#each filterOptions as option (option.id)}
        <button type="button" class:chosen={category===option.id} aria-pressed={category===option.id} on:click={()=>{clearItemFocus();category=option.id;query='';}}>{option.text}</button>
      {/each}
    </nav>
    {#key locale}
    <section class="workspace" aria-label="報酬一覧">
      {#if category!=='default_friendship'}
        <div class="event-list" aria-label="イベントの選択">
          {#each visible as event (event.kind+':'+event.id)}
            <button type="button" class="event-option" class:active={selected?.id===event.id} aria-pressed={selected?.id===event.id} on:click={()=>choose(event)}>
              <span class="event-title">{eventName(event)}</span>
              <span class="event-type">{event.kind==='floating_festival'?'フローティングフェスティバル':'イベント'} · {event.rewards.length}件</span>
              {#if event.id.includes('2026')}<span class="edition">2026年の定義</span>{/if}
            </button>
          {:else}
            <p class="empty">該当するイベントはありません。</p>
          {/each}
        </div>
        {#if selected}
          <article class="reward-detail">
            <div class="detail-header">
              <div>
                <h2>{eventName(selected)}</h2>
                <span class="native-id" title="ゲーム原本に記録された識別子">{selected.id}</span>
              </div>
              <span class="label">報酬候補 {selectedRewards.length} / {selected.rewards.length}件
                {#if highlightItem}<button type="button" class="all-rewards" on:click={clearItemFocus}>すべて表示</button>{/if}
              </span>
            </div>
            {#if eventQuests.length}
              <details class="event-quests" aria-label="原本に関連付けられたクエスト">
                <summary>関連クエスト（{eventQuests.length}）</summary>
                <div class="event-quest-grid">
                  {#each eventQuests as link (link.questId)}
                    <a href={`${base}/guide/quests/?quest=${link.questId}`} title={`Quest ID ${link.questId}`}>{questTitle(link.questId)}</a>
                  {/each}
                </div>
                <small>原本に記録された関連付けです。開始条件や進行順序ではありません。</small>
              </details>
            {/if}
            <div class="reward-grid">
              {#each selectedRewards as reward (reward.relationId)}
                <div class="reward-row">
                  <svg class="gift" viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="9" width="18" height="12" rx="1"/><path d="M2 9h20M12 9v12M12 9c-8-1-8-7-4-7 3 0 4 4 4 7Zm0 0c8-1 8-7 4-7-3 0-4 4-4 7Z"/></svg>
                  <div class="reward-text">
                    <strong>{itemName(reward.itemId)}</strong>
                    <span class="meta">ID {reward.itemId}{#if itemCategory(reward.itemId)} · {itemCategory(reward.itemId)}{/if}</span>
                  </div>
                  {#if reward.configuredAmount!==null}<span class="amount">×{reward.configuredAmount}</span>{/if}
                </div>
              {/each}
            </div>
            {#if selected.id==='HauntedFloatingFestival2026'}
              <a class="source-link" href="https://disneydreamlightvalley.com/news/update-sep-23-2026" target="_blank" rel="noopener noreferrer">2026年の公式イベント発表</a>
            {/if}
          </article>
        {/if}
      {:else}
        <article class="reward-detail friendship">
          <h2>デフォルト友情報酬</h2>
          {#each [1,2,3,4] as level}
            <section class="friendship-level">
              <h3>レベル {level}</h3>
              <div class="reward-grid">
                {#each source.getDefaultFriendshipRewards(level).filter(reward=>
                  !highlightItem||reward.itemId===highlightItem) as reward (reward.relationId)}
                  <div class="reward-row">
                    <svg class="gift" viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>
                    <div class="reward-text">
                      <strong>{itemName(reward.itemId)}</strong>
                      <span class="meta">{stages[reward.stage]} · ID {reward.itemId}</span>
                    </div>
                    <span class="amount">×{reward.configuredAmount}</span>
                  </div>
                {/each}
              </div>
            </section>
          {/each}
          <p class="note">共通のレベル設定です。キャラクター個別の報酬ではありません。</p>
        </article>
      {/if}
    </section>
    {/key}
    {#if labelError}
      <p class="note" role="status">アイテム名の照合に失敗したため、Item IDを表示しています。</p>
    {/if}
    <p class="note">ゲーム原本に収録された静的な報酬候補です。現在の開催状況、報酬の配布・取得状況は判定していません。画像は公開準備中です。</p>
    <details class="official">
      <summary>公式イベント情報</summary>
      <div class="official-links">
        <p><strong>The Haunted Floating Festival</strong> — 2026年10月7日～31日。<a href="https://disneydreamlightvalley.com/news/update-sep-23-2026" target="_blank" rel="noopener noreferrer">公式発表</a></p>
        <p><strong>Oogie Boogie’s Halloween Event</strong> — 第6週は2026年10月28日から。終了日時は未検証です。<a href="https://disneydreamlightvalley.com/news/OogieBoogieEvent2026" target="_blank" rel="noopener noreferrer">公式解説</a></p>
      </div>
    </details>
  {/if}
</main>

<style>
  .event-guide{width:100%;min-height:calc(100dvh - 68px);padding:16px clamp(12px,2.5vw,32px) 28px;color:#f4eafa;box-sizing:border-box}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}
  .headline{display:flex;align-items:center;gap:12px;min-width:0}
  .headline h1{font-size:clamp(19px,2vw,26px);font-weight:700;margin:0;white-space:nowrap}
  .back{text-decoration:none;display:grid;place-items:center;width:34px;height:34px;flex:0 0 34px;border-radius:9px;color:#eacff8;background:#332442;font-size:30px}
  .search{display:flex;align-items:center;gap:8px;border:1px solid #685478;border-radius:10px;padding:0 12px;min-height:40px;max-width:380px;flex:1;color:#ac94bb;background:#291e36}
  .search input{border:0;outline:0;background:transparent;color:#fff;min-width:0;width:100%;font:inherit;font-size:13px}
  .search input::placeholder{color:#b09fbd}
  .filters{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 13px}
  .filters button,.retry{padding:8px 13px;border:1px solid #594869;border-radius:9px;background:#2b2037;color:#d6c4e2;cursor:pointer;font-size:13px}
  .filters button.chosen{background:#59416c;border-color:#a782c5;color:#fff}
  .workspace{display:grid;grid-template-columns:minmax(230px,300px) minmax(0,1fr);gap:13px;align-items:start}
  .event-list{display:flex;flex-direction:column;gap:5px;overflow-y:auto;max-height:calc(100dvh - 185px);min-height:180px;scrollbar-width:thin}
  .event-option{text-align:left;border:1px solid transparent;border-radius:10px;background:#271c32;color:#e5d2ee;padding:12px 13px;display:flex;flex-direction:column;gap:3px;cursor:pointer}
  .event-option.active{border-color:#b28bcf;background:#473151}
  .event-title{font-weight:650;font-size:13px;line-height:1.4}
  .event-type,.edition{font-size:11px;color:#ae9abb}
  .reward-detail{min-width:0;border:1px solid #514160;border-radius:13px;background:#251a31;padding:clamp(12px,2vw,23px)}
  .detail-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:17px}
  h2{font-size:clamp(18px,2vw,23px);margin:0 0 5px}
  .native-id{font-size:11px;color:#aa99ba;overflow-wrap:anywhere}
  .label{font-size:12px;color:#d3b8ed;white-space:nowrap}
  .event-quests{margin:0 0 13px;border:1px solid #514160;border-radius:9px;padding:9px 11px;font-size:12px}
  .event-quests summary{cursor:pointer;font-weight:650;color:#e5ccf5}
  .event-quest-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:10px 0}
  .event-quest-grid a{display:block;border:1px solid #55456b;background:#30243f;border-radius:7px;padding:8px;color:#e4cefb;text-decoration:none;overflow-wrap:anywhere}
  .event-quest-grid a:hover,.event-quest-grid a:focus-visible{background:#463358}
  .event-quests small{color:#b5a4c3;font-size:11px}
  .reward-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:7px}
  .reward-row{display:flex;align-items:center;gap:10px;min-width:0;min-height:60px;border:1px solid #483b54;border-radius:9px;padding:9px;background:#2e233a}
  .gift{color:#bca5d1;flex:0 0 22px}
  .reward-text{min-width:0;display:flex;flex-direction:column;gap:3px;flex:1}
  .reward-text strong{font-size:12px;font-weight:650;overflow-wrap:anywhere}
  .reward-text .meta{font-size:10px;color:#b3a1c0;overflow-wrap:anywhere}
  .amount{font-size:13px;color:#e3cfef;white-space:nowrap}
  .all-rewards{color:#e5d0fa;background:transparent;border:0;text-decoration:underline;cursor:pointer;padding:2px 4px;font-size:11px}
  .friendship{grid-column:1/-1}
  .friendship-level{margin-top:20px}
  .friendship-level h3{font-size:14px;margin:0 0 9px}
  .source-link{display:inline-block;margin-top:16px;font-size:12px;color:#dbc0f9}
  .note{color:#b5a6c1;font-size:11px;line-height:1.6;margin:12px 0 0}
  .official{font-size:12px;color:#c3add3;margin-top:14px}
  .official summary{cursor:pointer;display:inline-block}
  .official-links{display:flex;flex-wrap:wrap;gap:10px 20px}
  .official a{color:#d5aff3;margin-left:6px}
  .status,.empty{color:#bcb0c8;font-size:13px}
  @media(max-width:800px){.workspace{grid-template-columns:minmax(190px,34%) minmax(0,1fr)}.event-list{max-height:calc(100dvh - 190px)}}
  @media(max-width:600px){.event-quest-grid{grid-template-columns:minmax(0,1fr)}.topbar{flex-wrap:wrap}.search{flex-basis:100%;max-width:none}.workspace{grid-template-columns:minmax(0,1fr)}.event-list{max-height:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.reward-detail{grid-column:1}.event-option{padding:10px}.headline h1{white-space:normal}.event-guide{min-height:100dvh}.filters{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}.filters button{white-space:nowrap}}
</style>