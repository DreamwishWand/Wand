<script lang="ts">
  import {onMount} from 'svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {base} from '$app/paths';
  import {watchWandLanguage} from '$lib/ui/preferences';
  import {autoAppend} from '$lib/ui/auto-append';
  import {collectWindow} from '$lib/ui/collect-window.mjs';
  import {verifyPublicQuestIndex,filterPublicQuests,publicQuestSection,publicQuestStoryArc,
    publicQuestNativeOrder,publicFriendshipCharacters,findPublicQuestByLink,loadPublicQuestPart,formatPublicGuideText,
    type PublicQuestIndex,type PublicQuestPart,type PublicQuestIndexRow,type PublicQuestDetailRow,
    type PublicQuestObjective,type PublicGuideNames,type PublicQuestSection,type PublicQuestStoryArc
  } from '$lib/guide/public-guide.ts';
  import {loadPublicQuestTargetsIndex,loadPublicQuestTargetsPart,itemTargetName,originalTargetLookup,
    guideQuestTargetCollectionHref,
    type PublicQuestTargetIndex,type PublicQuestTargetPart,type PublicQuestTargetEntry
  } from '$lib/guide/public-targets.ts';
  import {publicQuestStepIndex,publicQuestStepQuery} from '$lib/guide/public-quest-steps.ts';
  import {loadPublicQuestConditions,publicConditionText,PUBLIC_QUEST_CONDITIONS_FILE,
    type PublicQuestConditionReader} from '$lib/guide/public-quest-conditions.ts';
  import {loadPublicQuestRewards,DB03_QUEST_REWARDS_FILE,
    type PublicQuestRewardsReader} from '$lib/guide/public-quest-rewards.ts';
  import {resolveQuestRewardItemDestination} from '$lib/guide/quest-reward-navigation.ts';
  import {resolveQuestRewardNameMatches} from '$lib/guide/quest-reward-name-search.ts';
  import {loadPublicQuestRewardItemLabels,DB03_QUEST_REWARD_LABEL_FILE,
    type PublicQuestRewardItemLabels} from '$lib/guide/public-quest-reward-item-labels.ts';
  import {loadPublicQuestOverrideLoot,DB03_QUEST_OVERRIDE_LOOT_FILE,
    type QuestOverrideLootIndex} from '$lib/guide/public-quest-override-loot.ts';
  import {loadPublicQuestTargetReverse,DB03_QUEST_TARGET_REVERSE_FILE,
    type PublicQuestTargetReverseReader} from '$lib/guide/public-quest-target-reverse.ts';
  import {loadPublicEventFriendshipRewards,DB03_EVENT_FRIENDSHIP_REWARD_FILE,
    type PublicEventFriendshipRewards} from '$lib/guide/public-event-friendship-rewards.ts';
  import {loadPublicEventQuestLinks,DB03_EVENT_QUEST_FILE,
    type PublicEventQuestIndex} from '$lib/guide/public-event-quest-links.ts';

  let catalog:PublicQuestIndex|null=null;
  let loadError='';
  let loading=true;
  let selected:PublicQuestDetailRow|null=null;
  let selectedRow:PublicQuestIndexRow|null=null;
  let detailLoading=false;
  let detailError='';
  let query='';
  let locale='ja';
  let character='';
  let section:PublicQuestSection='story';
  let unclassifiedOpen=false;
  let storyArc:PublicQuestStoryArc='valley';
  const arcs:readonly {id:PublicQuestStoryArc;name:string}[]=[
    {id:'valley',name:'ドリームライトバレー'},
    {id:'rift',name:'時間の裂け目'},
    {id:'storybook',name:'物語の谷'},
    {id:'ranch',name:'願い咲く牧場'},
    {id:'honeyglow',name:'ハニーグローの森'},
    {id:'keepsake',name:'思い出の海'}
  ];
  let objective='';
  let limit=40;
  let selectionTicket=0;
  let detailPanel:HTMLElement|null=null;
  let activeStep=0;
  let showAllSteps=false;
  $: visibleSteps=selected?.steps?
    (showAllSteps?selected.steps:selected.steps.slice(activeStep,activeStep+1)):[];
  const cached=new Map<number,PublicQuestPart>();
  const cachedTargets=new Map<number,PublicQuestTargetPart>();
  let conditionIndex:PublicQuestConditionReader|null=null;
  let rewardIndex:PublicQuestRewardsReader|null=null;
  let rewardLabels:PublicQuestRewardItemLabels|null=null;
  let overrideIndex:QuestOverrideLootIndex|null=null;
  let relatedEventSource:PublicEventFriendshipRewards|null=null;
  let relatedEventIndex:PublicEventQuestIndex|null=null;
  let rewardItemFocus:string|null=null;
  let rewardError='';
  let conditionError='';
  let targetIndex:PublicQuestTargetIndex|null=null;
  let targetReverseIndex:PublicQuestTargetReverseReader|null=null;
  let targetItemFocus:string|null=null;
  let targetReverseError=false;
  let targetLookup:Record<string,readonly PublicQuestTargetEntry[]>={};
  let targetLoading=false;
  let targetError='';
  const prefix=`${base}/guide/public/`;

  $: rewardFocus=rewardItemFocus&&rewardIndex
    ?resolveQuestRewardItemDestination(rewardIndex,rewardItemFocus,overrideIndex):null;
  $: searchedTargetId=targetReverseIndex&&/^[1-9][0-9]{0,15}$/.test(query)&&
    targetReverseIndex.getItemCandidates(query).length>0?query:null;
  $: targetFocusId=targetItemFocus??searchedTargetId;
  $: targetMatches=targetReverseIndex&&targetFocusId
    ?targetReverseIndex.getItemCandidates(targetFocusId):[];
  $: targetQuestIds=[...new Set(targetMatches.map(row=>row.questId))];
  $: matchedRewardNames=!rewardItemFocus&&!targetItemFocus&&rewardIndex&&
    overrideIndex&&rewardLabels
    ?resolveQuestRewardNameMatches(rewardIndex,overrideIndex,rewardLabels,query,locale):null;
  $: selectedQuestId=selectedRow?.id??null;
  $: selectedGroupId=selectedRow?.groupId??null;
  $: selectedTargetRefs=selectedQuestId
    ?targetMatches.filter(row=>row.questId===selectedQuestId):[];
  $: filtered=catalog?(rewardFocus
    ?{total:rewardFocus.questIds.length,
      rows:catalog.quests.filter((row:any)=>rewardFocus.questIds.includes(row.id))}
    :targetMatches.length
      ?{total:targetQuestIds.length,
        rows:catalog.quests.filter((row:any)=>targetQuestIds.includes(row.id))}
      :matchedRewardNames
        ?{total:matchedRewardNames.questIds.length,
          rows:catalog.quests.filter((row:any)=>matchedRewardNames?.questIds.includes(row.id))}
        :collectWindow((offset:number,batch:number)=>filterPublicQuests(catalog!,{
      query:query.slice(0,120),locale,character,objective,
      section:query.trim()?'all':section,
      arc:section==='story'&&!query.trim()?storyArc:'all',offset,limit:batch
    }),limit,'rows')):{total:0,rows:[]};
  $: friendshipCharacters=catalog?publicFriendshipCharacters(catalog,locale):[];
  // Native Mission group association, not an unlock prerequisite or chronological link.
  $: questConditions=selectedRow&&conditionIndex?conditionIndex.getQuest(selectedRow.id):null;
  $: linkedEventRefs=selectedRow&&relatedEventIndex
    ?relatedEventIndex.getQuestEvents(selectedRow.id):[];
  $: questRewardInfo=selectedRow&&rewardIndex?rewardIndex.getQuest(selectedRow.id):null;
  $: questOverrideInfo=selectedRow&&overrideIndex?overrideIndex.getQuest(selectedRow.id):null;
  $: relatedQuests=catalog&&selectedGroupId&&
    catalog.groups&&Object.hasOwn(catalog.groups,selectedGroupId)
    ?catalog.quests.filter(row=>row.groupId===selectedGroupId&&row.id!==selectedQuestId):[];
  $: objectives=catalog?[...new Set(catalog.quests.flatMap((x:any)=>x.objectiveKinds))].sort() as string[]:[];

  function label(names:PublicGuideNames|null|undefined,fallback='',language='ja') {return formatPublicGuideText(names?.[language as keyof PublicGuideNames]||names?.en||Object.values(names||{})[0]||fallback);}
  function questName(row:PublicQuestIndexRow,language:string) {
    return label(row.names,'',language)||`名称未確認（ID ${row.id}）`;
  }
  function characterName(id:string|undefined,language:string) {return label(catalog?.characters?.[id||''],id||'',language);}
  function relatedEventName(eventId:string):string{
    const event=relatedEventSource?.getEvent('mini_event',eventId);
    return event?.names?.[locale]||event?.names?.en||eventId;
  }
  function clearRewardItemFocus(){
    if(!rewardItemFocus)return;
    rewardItemFocus=null;
    const url=new URL(window.location.href);
    url.searchParams.delete('item');
    window.history.replaceState(window.history.state,'',url);
  }
  function clearTargetItemFocus(){
    if(!targetItemFocus)return;
    targetItemFocus=null;
    const url=new URL(window.location.href);
    url.searchParams.delete('target');
    window.history.replaceState(window.history.state,'',url);
  }
  function setSearch(){limit=40;clearRewardItemFocus();clearTargetItemFocus();}
  function resetBrowsedSelection(){
    selectionTicket++;
    selectedRow=null;selected=null;detailError='';detailLoading=false;
    targetLookup={};targetLoading=false;targetError='';
    const url=new URL(window.location.href);
    url.searchParams.delete('quest');
    url.searchParams.delete('step');
    window.history.replaceState(window.history.state,'',url);
  }
  function selectSection(next:PublicQuestSection){
    if(section===next)return;
    section=next;character='';storyArc='valley';objective='';query='';
    setSearch();resetBrowsedSelection();
  }
  function selectArc(next:PublicQuestStoryArc){
    if(storyArc===next)return;
    storyArc=next;limit=40;resetBrowsedSelection();
  }
  function selectCharacter(next:string){
    if(character===next)return;
    character=next;limit=40;resetBrowsedSelection();
  }
  function targetStep(questId:string,numberOfSteps:number):number{
    const step=publicQuestStepIndex(window.location.search,questId,numberOfSteps);
    if(new URLSearchParams(window.location.search).has('step'))return step;
    const id=targetItemFocus??searchedTargetId;
    const first=id?targetReverseIndex?.getItemCandidates(id)
      .find(ref=>ref.questId===questId&&ref.step<numberOfSteps):null;
    return first?.step??step;
  }
  function selectStep(index:number){
    if(!selectedRow||!selected||!Number.isInteger(index)||
      index<0||index>=selected.steps.length)return;
    activeStep=index;showAllSteps=false;
    const url=new URL(window.location.href);
    const next=publicQuestStepQuery(selectedRow.id,index,selected.steps.length);
    const chosen=new URLSearchParams(next);
    url.searchParams.set('quest',selectedRow.id);
    url.searchParams.set('step',chosen.get('step')||'1');
    window.history.pushState(window.history.state,'',url);
  }
  function objectiveText(goal:PublicQuestObjective,target:PublicQuestTargetEntry|undefined,language:string){
    let value=label(goal.text,goal.type,language);
    if(!target)return value;
    if(target.amount?.kind==='value' && Number.isSafeInteger(target.amount.value)){
      value=value.replace(/\{TargetAmount\}/g,String(target.amount.value));
    }
    // Only a single explicit direct item may resolve a name placeholder.
    // Weighted lists, filters, dynamic generators and missing official names
    // never become fabricated mandatory ingredients.
    if(target.selectors?.length===1){
      const selector=target.selectors[0];
      if(selector.mode==='item' && selector.candidates?.length===1 && selector.candidates[0].role==='direct'){
        const name=itemTargetName(targetIndex,selector.candidates[0].id,language);
        if(name)value=value.replace(/\{(?:ItemName|itemName)\}/g,name);
      }
    }
    return value;
  }
  async function loadQuestTargets(row:PublicQuestIndexRow,details:PublicQuestPart,ticket:number){
    targetLoading=true;targetError='';
    try{
      if(!targetIndex)targetIndex=await loadPublicQuestTargetsIndex(`${prefix}quest-targets-index.json`);
      let part=cachedTargets.get(row.detailPart);
      if(!part){
        part=await loadPublicQuestTargetsPart(targetIndex,row.detailPart,
          `${prefix}quest-targets-${String(row.detailPart).padStart(2,'0')}.json`,details);
        cachedTargets.set(row.detailPart,part);
      }
      if(ticket===selectionTicket)targetLookup=originalTargetLookup(part,row.id);
    }catch(e){
      if(ticket===selectionTicket)targetError=e instanceof Error?e.message:String(e);
    }finally{if(ticket===selectionTicket)targetLoading=false;}
  }

  // Deep links resolve against authenticated quest IDs, never an unverified URL
  // value. Back/forward navigation restores the matching quest without
  // fetching unrelated or duplicate detail partitions.
  function restoreAddressSelection() {
    if(!catalog)return;
    const params=new URLSearchParams(window.location.search);
    const requested=params.getAll('item');
    const focus=requested.length===1&&rewardIndex
      ?resolveQuestRewardItemDestination(rewardIndex,requested[0],overrideIndex):null;
    rewardItemFocus=focus?.itemId??null;
    const targetRequested=params.getAll('target');
    const sourceTargets=!focus&&targetRequested.length===1&&targetReverseIndex
      ?targetReverseIndex.getItemCandidates(targetRequested[0]):[];
    targetItemFocus=sourceTargets.length?targetRequested[0]:null;
    const targetIds=new Set(sourceTargets.map(ref=>ref.questId));
    const addressed=findPublicQuestByLink(catalog,window.location.search);
    const row=focus
      ?(addressed&&focus.questIds.includes(addressed.id)?addressed:
        catalog.quests.find((candidate:any)=>focus.questIds.includes(candidate.id))??null)
      :sourceTargets.length
        ?(addressed&&targetIds.has(addressed.id)?addressed:
          catalog.quests.find((candidate:any)=>targetIds.has(candidate.id))??null)
        :addressed;
    if(row){
      if(!focus&&!sourceTargets.length&&params.has('quest')){
        section=publicQuestSection(row);
        if(section==='special'||section==='tutorial')unclassifiedOpen=true;
        if(section==='story')storyArc=publicQuestStoryArc(row)??'valley';
        character=section==='friendship'?row.characterId:'';
      }
      if(selectedRow?.id!==row.id)void openQuest(row,false);
      else if(selected) {
        activeStep=targetStep(row.id,selected.steps.length);
        showAllSteps=false;
      }
    }else if(selectedRow){
      selectionTicket++;
      selectedRow=null;selected=null;detailError='';detailLoading=false;
      activeStep=0;showAllSteps=false;
      targetLookup={};targetError='';targetLoading=false;
    }
  }
  async function loadRelatedEventLinks(index:PublicQuestIndex){
    try{
      const events=await loadPublicEventFriendshipRewards(
        `${prefix}${DB03_EVENT_FRIENDSHIP_REWARD_FILE}`);
      const links=await loadPublicEventQuestLinks(events,index,
        `${prefix}${DB03_EVENT_QUEST_FILE}`);
      if(catalog===index){relatedEventSource=events;relatedEventIndex=links;}
    }catch{
      // The Quest Guide stays available if optional event navigation is absent.
    }
  }
  async function loadTargetReverse(index:PublicQuestIndex){
    try{
      const data=await loadPublicQuestTargetReverse(index,
        `${prefix}${DB03_QUEST_TARGET_REVERSE_FILE}`);
      if(catalog===index){targetReverseIndex=data;restoreAddressSelection();}
    }catch{
      if(catalog===index)targetReverseError=true;
    }
  }
  async function loadConditions(index:PublicQuestIndex){
    try{
      const loaded=await loadPublicQuestConditions(index,`${prefix}${PUBLIC_QUEST_CONDITIONS_FILE}`);
      if(catalog===index)conditionIndex=loaded;
    }catch(error){
      if(catalog===index)conditionError=error instanceof Error?error.message:String(error);
    }
  }
  async function loadRewards(index:PublicQuestIndex){
    try{
      const data=await loadPublicQuestRewards(index,`${prefix}${DB03_QUEST_REWARDS_FILE}`);
      if(catalog===index){rewardIndex=data;restoreAddressSelection();}
      try{
        const verified=await loadPublicQuestOverrideLoot(data,
          `${prefix}${DB03_QUEST_OVERRIDE_LOOT_FILE}`);
        if(catalog===index){overrideIndex=verified;restoreAddressSelection();}
        try{
          const labels=await loadPublicQuestRewardItemLabels(data,verified,
            `${prefix}${DB03_QUEST_REWARD_LABEL_FILE}`);
          if(catalog===index&&rewardIndex===data&&overrideIndex===verified)
            rewardLabels=labels;
        }catch{
          // Existing source-pinned Quest reward IDs remain usable even
          // if the optional public DB-00 name crosswalk is unavailable.
        }
      }catch{
        // The SHA-pinned base rewards remain independently usable.
      }
    }catch(e){
      if(catalog===index)rewardError=e instanceof Error?e.message:String(e);
    }
  }
  async function loadCatalog() {
    loading=true;loadError='';
    try {
      const res=await fetch(`${prefix}quest-index.json`);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data=await res.json();
      catalog=verifyPublicQuestIndex(data);
      conditionIndex=null;conditionError='';
      rewardIndex=null;overrideIndex=null;rewardLabels=null;rewardError='';
      relatedEventSource=null;relatedEventIndex=null;
      targetReverseIndex=null;targetReverseError=false;
      void loadConditions(catalog);
      void loadRewards(catalog);
      void loadTargetReverse(catalog);
      void loadRelatedEventLinks(catalog);
      restoreAddressSelection();
    }catch(e){loadError=e instanceof Error?e.message:String(e)}
    finally {loading=false}
  }
  onMount(()=>{
    const unwatch=watchWandLanguage(next=>{locale=next;limit=40;});
    window.addEventListener('popstate',restoreAddressSelection);
    void loadCatalog();
    return ()=>{unwatch();window.removeEventListener('popstate',restoreAddressSelection);};
  });

  async function openQuest(row:PublicQuestIndexRow,updateAddress=true) {
    const currentCatalog=catalog;
    if(!currentCatalog)return;
    if(rewardFocus&&!rewardFocus.questIds.includes(row.id))clearRewardItemFocus();
    if(targetItemFocus&&targetReverseIndex&&
      !targetReverseIndex.getItemQuestIds(targetItemFocus).includes(row.id))clearTargetItemFocus();
    const ticket=++selectionTicket;
    selectedRow=row;selected=null;detailError='';detailLoading=true;
    activeStep=0;showAllSteps=false;
    if(updateAddress){
      const url=new URL(window.location.href);
      if(url.searchParams.getAll('quest').length!==1||url.searchParams.get('quest')!==row.id){
        url.searchParams.set('quest',row.id);
        url.searchParams.delete('step');
        window.history.pushState(window.history.state,'',url);
      }
    }
    targetLookup={};targetLoading=false;targetError='';
    try {
      let part=cached.get(row.detailPart);
      if(!part){
        part=await loadPublicQuestPart(currentCatalog,row.detailPart,`${prefix}quest-details-${String(row.detailPart).padStart(2,'0')}.json`);
        cached.set(row.detailPart,part);
      }
      const match=part.quests.find((x:any)=>x.id===row.id);
      if(!match)throw new Error('クエスト詳細が見つかりません');
      if(ticket===selectionTicket){
        selected=match;
        activeStep=targetStep(row.id,match.steps.length);
        void loadQuestTargets(row,part,ticket);
      }
    }catch(e){if(ticket===selectionTicket)detailError=e instanceof Error?e.message:String(e)}
    finally {if(ticket===selectionTicket)detailLoading=false}
  }
</script>

<svelte:head>
  <title>クエストガイド | Dreamwish Wand</title>
  <meta name="description" content="Disney Dreamlight Valleyのクエスト733件を8言語で検索。目標、手順、キャラクター別に無料で閲覧できます。" />
</svelte:head>

<main class="quests-public">
  <header class="hero"><h1>クエスト</h1></header>

  {#if loading}
    <p class="status" role="status">クエスト一覧を読み込んでいます…</p>
  {:else if loadError}
    <p class="error" role="alert">公開クエストデータを読み込めませんでした：{loadError}</p>
    <button on:click={loadCatalog}>再読み込み</button>
  {:else if catalog}
    <!-- The Japanese labels below are exact questlog_* values from Steam
         1.26.2 StreamingAssets/Localization/LocDB_ja.zip/menu.locbin.
         Source menu.locbin SHA-256: c334dd9d1b6f896ac784c33b28d1103b8de8cf5cdfd0b5f8ce4ebd7b917ff5bb.
         Prefix-based category membership is separate from the UI label source. -->
    <nav class="quest-sections" aria-label="ゲーム内のクエスト分類">
      {#each [
        ['story','ストーリークエスト'],['realm','世界クエスト'],
        ['friendship','友情クエスト'],['event','イベントクエスト'],
        ['daily','デイリークエスト'],['premium','ドリームパッククエスト'],
        ['all','すべて']
      ] as [key,name]}
        <button class:chosen={section===key} on:click={()=>selectSection(key as PublicQuestSection)}
          aria-pressed={section===key}>{name}</button>
      {/each}
    </nav>
    <!-- Secret and FTUE are Mission source categories, not verified Japanese
         in-game Quest Log categories. Keep them accessible but distinct. -->
    <details class="quest-unclassified" bind:open={unclassifiedOpen}>
      <summary>分類確認中のクエスト</summary>
      <nav class="quest-sections" aria-label="原本内の分類確認中クエスト">
        <button class:chosen={section==='special'} on:click={()=>selectSection('special')}
          aria-pressed={section==='special'}>追加クエスト</button>
        <button class:chosen={section==='tutorial'} on:click={()=>selectSection('tutorial')}
          aria-pressed={section==='tutorial'}>導入用</button>
      </nav>
    </details>
    {#if section==='story'}
      <nav class="story-arcs" aria-label="ストーリーの舞台">
        {#each arcs as arc}
          <button class:chosen={storyArc===arc.id} on:click={()=>selectArc(arc.id)}
            aria-pressed={storyArc===arc.id}>{arc.name}</button>
        {/each}
      </nav>
    {/if}
    <div class="searchbar">
      <label>クエストを検索<input aria-label="クエスト名・IDを検索"
        placeholder="クエスト名・キャラクター・報酬名" bind:value={query} on:input={setSearch}/></label>
    </div>
    {#if rewardFocus}
      <div class="reward-focus" role="status">
        <span>報酬候補に関連するクエスト：{rewardFocus.questIds.length}件（Item ID {rewardFocus.itemId}）</span>
        <button type="button" on:click={clearRewardItemFocus}>すべて表示</button>
      </div>
    {:else if targetMatches.length}
      <div class="reward-focus" role="status">
        <span>目標アイテムの候補に関連するクエスト：{targetQuestIds.length}件（Item ID {targetFocusId}）</span>
        {#if targetItemFocus}<button type="button" on:click={clearTargetItemFocus}>すべて表示</button>{/if}
      </div>
    {:else if matchedRewardNames}
      <div class="reward-focus" role="status">
        <span>報酬名に一致するクエスト：{matchedRewardNames.questIds.length}件</span>
      </div>
    {:else if targetReverseError}
      <small class="condition-warning">目標アイテムの逆引きデータは読み込めませんでした。</small>
    {/if}
    <div class="workspace" class:with-character-rail={section==='friendship'}>
      {#if section==='friendship'}
        <nav class="character-rail" aria-label="フレンドシップクエストのキャラクター">
          <button class:chosen={character===''} aria-pressed={character===''}
            on:click={()=>selectCharacter('')}>すべてのキャラクター
            <small>341</small></button>
          {#each friendshipCharacters as member (member.id)}
            <button class:chosen={character===member.id} aria-pressed={character===member.id}
              on:click={()=>selectCharacter(member.id)}>
              <span>{member.name}</span><small>{member.quests}</small>
            </button>
          {/each}
        </nav>
      {/if}
      <section class="results" aria-label="クエスト一覧">
        <p class="count">{filtered.total.toLocaleString()}件のクエスト</p>
        {#each filtered.rows as row (row.id)}
          <button class:active={selectedRow?.id===row.id} class="quest-row" title={'クエストID '+row.id} on:click={()=>openQuest(row)}>
            <strong>{questName(row,locale)}</strong>
            <small>
              {#if publicQuestSection(row)==='story'}
                {publicQuestNativeOrder(row)===null?'関連クエスト':'メインクエストライン'} ·
              {/if}
              {characterName(row.characterId,locale)}
            </small>
          </button>
        {/each}
        {#if filtered.total>limit}<div class="auto-sentinel" use:autoAppend={{hasMore:()=>filtered.total>limit,load:()=>limit+=40}} role="status" aria-label="スクロールでクエストを追加表示"></div>{/if}
        {#if filtered.total===0}<p class="empty">該当するクエストはありません。</p>{/if}
      </section>
      <section class="detail" aria-label="クエスト詳細" bind:this={detailPanel}>
        {#if !selectedRow}
          <p class="placeholder">左の一覧からクエストを選択してください。</p>
        {:else}
          <div class="detail-header">
            <h2>{questName(selectedRow,locale)}</h2>
            <p><a class="character-link" href={`${base}/guide/characters/?character=${selectedRow.characterId}`}>{characterName(selectedRow.characterId,locale)}</a></p>
            <a class="quest-permalink" href={`${base}/guide/quests/?quest=${selectedRow.id}`}>このクエストへのリンク</a>
            <details class="source-id"><summary>クエストID</summary><code>{selectedRow.id}</code></details>
          </div>
          {#if detailLoading}<p class="status">目標データを検証しています…</p>{/if}
          {#if detailError}<p class="error" role="alert">{detailError}</p>{/if}
          {#if selected}
            {#if linkedEventRefs.length}
              <details class="related-quests quest-events" aria-label="原本に関連付けられたイベント">
                <summary>関連イベント（{linkedEventRefs.length}）</summary>
                <ul>
                  {#each linkedEventRefs as link (link.eventId)}
                    <li><a href={`${base}/guide/events/?event=${link.eventId}`}>{relatedEventName(link.eventId)}</a></li>
                  {/each}
                </ul>
                <p>イベント設定の静的な参照です。開催や解放条件は保証しません。</p>
              </details>
            {/if}
            {#if questRewardInfo}
              <details class="quest-rewards" aria-label="クエストの静的報酬候補"
                open={(!!rewardFocus&&rewardFocus.questIds.includes(selectedRow.id))||
                  (!!matchedRewardNames&&matchedRewardNames.questIds.includes(selectedRow.id))}>
                <summary>報酬候補（{questRewardInfo.currencies.length+questRewardInfo.lootCandidates.length+(questOverrideInfo?1:0)}件）</summary>
                {#if questRewardInfo.currencies.length}
                  <div class="quest-reward-block">
                    <strong>通貨報酬の設定</strong>
                    <ul>
                      {#each questRewardInfo.currencies as reward}
                        <li class:reward-item-match={rewardItemFocus===reward.itemId||
                          (matchedRewardNames?.itemIds.includes(reward.itemId)??false)}>
                          {rewardLabels?.getDisplayName(reward.itemId,locale)??itemTargetName(targetIndex,reward.itemId,locale)??'通貨'} · {reward.amountMin===reward.amountMax?reward.amountMin:`${reward.amountMin}～${reward.amountMax}`}（ID {reward.itemId}）
                          {#if rewardLabels?.getCollectionHref(reward.itemId,base)}
                            <a class="reward-collection-link" href={rewardLabels?.getCollectionHref(reward.itemId,base)}
                              title="Collectionで開く"
                              aria-label={`Collectionで開く：${rewardLabels?.getDisplayName(reward.itemId,locale)??itemTargetName(targetIndex,reward.itemId,locale)??'通貨'}`}>
                              <WandIcon name="collection" size={15}/>
                            </a>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
                {#if questRewardInfo.lootCandidates.length}
                  <div class="quest-reward-block">
                    <strong>追加報酬のアイテム候補</strong>
                    <div class="quest-reward-chips">
                      {#each questRewardInfo.lootCandidates as reward}
                        <span class:reward-item-match={rewardItemFocus===reward.itemId||
                          (matchedRewardNames?.itemIds.includes(reward.itemId)??false)} title={`Item ID ${reward.itemId} · Loot Table ${reward.tableIndex+1}`}>
                          {rewardLabels?.getDisplayName(reward.itemId,locale)??itemTargetName(targetIndex,reward.itemId,locale)??'アイテム'}（ID {reward.itemId}）
                          {#if rewardLabels?.getCollectionHref(reward.itemId,base)}
                            <a class="reward-collection-link" href={rewardLabels?.getCollectionHref(reward.itemId,base)}
                              title="Collectionで開く"
                              aria-label={`Collectionで開く：${rewardLabels?.getDisplayName(reward.itemId,locale)??itemTargetName(targetIndex,reward.itemId,locale)??'アイテム'}`}>
                              <WandIcon name="collection" size={15}/>
                            </a>
                          {/if}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
                {#if questOverrideInfo}
                  <div class="quest-reward-block">
                    <strong>別定義のLoot Table候補</strong>
                    <div class="quest-reward-chips">
                      <span class:reward-item-match={rewardItemFocus===questOverrideInfo.itemId||
                          (matchedRewardNames?.itemIds.includes(questOverrideInfo.itemId)??false)}
                        title={`Item ID ${questOverrideInfo.itemId} · Loot Table ${questOverrideInfo.lootTableId}`}>
                        {rewardLabels?.getDisplayName(questOverrideInfo.itemId,locale)??itemTargetName(targetIndex,questOverrideInfo.itemId,locale)??'アイテム'}（ID {questOverrideInfo.itemId}）
                        {#if rewardLabels?.getCollectionHref(questOverrideInfo.itemId,base)}
                          <a class="reward-collection-link" href={rewardLabels?.getCollectionHref(questOverrideInfo.itemId,base)}
                            title="Collectionで開く"
                            aria-label={`Collectionで開く：${rewardLabels?.getDisplayName(questOverrideInfo.itemId,locale)??itemTargetName(targetIndex,questOverrideInfo.itemId,locale)??'アイテム'}`}>
                            <WandIcon name="collection" size={15}/>
                          </a>
                        {/if}
                      </span>
                    </div>
                    {#if questOverrideInfo.rollCount==='native_unbounded_sentinel'}
                      <small>原本の抽選回数欄は最大値の特殊値です。数量や配布回数として解釈しません。</small>
                    {/if}
                  </div>
                {:else if questRewardInfo.opaqueOverrideUnresolved}
                  <small>参照先未解決の追加報酬設定があります。</small>
                {/if}
                <small>原本の設定上の候補です。Loot Tableからの実際の配布・数量やプレイヤーの取得状況は確認していません。</small>
              </details>
            {/if}
            {#if rewardError}
              <small class="condition-warning">報酬情報を読み込めませんでした。</small>
            {/if}
            {#if questConditions}
              <details class="quest-activation" aria-label="クエスト出現・解放条件の原本設定">
                <summary>出現・解放条件</summary>
                <div class="quest-activation-block">
                  <strong>利用条件</strong>
                  <p>{publicConditionText(questConditions.availability,catalog,locale)}</p>
                </div>
                {#if questConditions.unlock?.clauses.length}
                  <div class="quest-activation-block">
                    <strong>解放条件</strong>
                    <p>{publicConditionText(questConditions.unlock,catalog,locale)}</p>
                  </div>
                {/if}
                <small>Steam v1.26.2のゲーム原本に定義された静的条件です。現在の進捗・条件成立・実際の解放可否は判定していません。未抽出の値は推測で補完しません。</small>
              </details>
            {/if}
            {#if conditionError}
              <small class="condition-warning">出現・解放条件は表示できません（{conditionError}）。手順は引き続き閲覧できます。</small>
            {/if}
            {#if targetLoading}<p class="target-status" role="status">原本に記録されたアイテム候補を照合しています…</p>{/if}
            {#if targetError}<p class="target-warning" role="alert">アイテム参照を検証できませんでした：{targetError}</p>{/if}
            <div class="detail-stats"><span>{selected.steps.length} ステップ</span><span>{selected.objectiveCount} 目標</span>
              {#if selected.configuredFriendshipRange}<span>設定上の友情ポイント：{selected.configuredFriendshipRange.min}–{selected.configuredFriendshipRange.max}</span>{/if}
            </div>
            {#if selected.steps.length>0}
              <nav class="step-navigation" aria-label="クエストの手順ナビゲーション">
                <button type="button" aria-label="前のステップ" disabled={activeStep===0}
                  on:click={()=>selectStep(activeStep-1)}>前へ</button>
                <label>手順
                  <select aria-label="クエストのステップを選択" bind:value={activeStep}
                    on:change={()=>selectStep(activeStep)}>
                    {#each selected.steps as step,i (i)}
                      <option value={i}>ステップ {step.index+1}</option>
                    {/each}
                  </select>
                </label>
                <button type="button" aria-label="次のステップ" disabled={activeStep>=selected.steps.length-1}
                  on:click={()=>selectStep(activeStep+1)}>次へ</button>
                <button type="button" class="show-all" aria-pressed={showAllSteps}
                  on:click={()=>showAllSteps=!showAllSteps}>{showAllSteps?'1ステップ表示':'全ステップ表示'}</button>
              </nav>
              <div class="step-permalink">
                <span>ステップ {activeStep+1} / {selected.steps.length}</span>
                <a aria-label="選択中のステップへの直接リンク" href={`${base}/guide/quests/${publicQuestStepQuery(selectedRow.id,activeStep,selected.steps.length)}`}>このステップへのリンク</a>
              </div>
            {/if}
            {#each visibleSteps as step (step.index)}
              <section class="step"><h3>ステップ {step.index+1}</h3>
                {#if label(step.text,'',locale)}<p>{label(step.text,'',locale)}</p>{/if}
                {#each step.subSteps as sub (sub.index)}
                  {#if sub.objectives.length}<ol>
                    {#each sub.objectives as goal, i (i)}
                      <li class:target-item-match={selectedTargetRefs.some(ref=>
                            ref.step===step.index&&ref.subStep===sub.index&&ref.objectiveIndex===i)}>
                         <span>{objectiveText(goal,targetLookup[`${step.index}:${sub.index}:${i}`]?.[0],locale)}</span>
                         <details class="source-id"><summary>条件の識別情報</summary><small>{goal.type}</small></details>
                         {#each targetLookup[`${step.index}:${sub.index}:${i}`]||[] as target}
                           {#if target.amount?.kind==='value'}
                             <small class="source-amount">必要数 {target.amount.value}</small>
                           {:else if target.amount?.kind==='range'}
                             <small class="source-amount">必要数 {target.amount.min??'不明'}～{target.amount.max??'不明'}</small>
                           {/if}
                           {#each target.selectors as selector}
                             {#if selector.candidates.length}
                               <div class="target-candidates" aria-label="原本で設定された候補アイテム">
                                 {#each selector.candidates as candidate}
                                   <span class="target-chip" title={'アイテムID '+candidate.id+(candidate.role==='alternative'?' · 代替候補':'')}>
                                     {itemTargetName(targetIndex,candidate.id,locale)||'名称未確認'}
                                     {#if guideQuestTargetCollectionHref(targetIndex,candidate.id,base)}
                                       <a class="target-collection-link" href={guideQuestTargetCollectionHref(targetIndex,candidate.id,base)}
                                         title="Collectionで開く"
                                         aria-label={`Collectionで開く：${itemTargetName(targetIndex,candidate.id,locale)}`}>
                                         <WandIcon name="collection" size={15}/>
                                       </a>
                                     {/if}
                                   </span>
                                 {/each}
                               </div>
                             {:else if selector.mode==='filterGenerator'||selector.mode==='unresolved'}
                               <small class="source-amount">動的条件（アイテム未確定）</small>
                             {/if}
                           {/each}
                         {/each}
                       </li>
                    {/each}
                  </ol>{/if}
                {/each}
              </section>
            {/each}
            {#if relatedQuests.length}
              <details class="related-quests">
                <summary>関連クエスト（{relatedQuests.length}件）</summary>
                <ul>
                  {#each relatedQuests as linked (linked.id)}
                    <li>
                      <a href={`${base}/guide/quests/?quest=${linked.id}`}
                        on:click={(event)=>{
                          if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
                          event.preventDefault();
                          void openQuest(linked);
                          if(detailPanel){
                            detailPanel.scrollTop=0;
                            detailPanel.scrollIntoView({block:'start'});
                          }
                        }}>{questName(linked,locale)}</a>
                    </li>
                  {/each}
                </ul>
                <p>ゲーム原本の同一グループに属するクエストです。解放条件や達成順序を示すものではありません。</p>
              </details>
            {/if}
          {/if}
        {/if}
      </section>
    </div>
    <details class="catalog-meta">
      <summary>データの詳細と分類について</summary>
      <div class="numbers"><span><strong>{catalog.counts.quests.toLocaleString()}</strong> クエスト</span><span><strong>{catalog.counts.steps.toLocaleString()}</strong> ステップ</span><span><strong>{catalog.counts.objectives.toLocaleString()}</strong> 目標</span></div>
      <p class="section-note">Steam v1.26.2の静的クエスト定義を8言語で表示します。原本のMission内部区分に基づく分類であり、解放条件の完全な判定を意味しません。</p>
    </details>
  {/if}
  <footer>
    <p>クエスト定義を元にした静的ガイドです。現在の進捗・解放判定・開催中イベント・DLC所有状況を示すものではありません。詳細にはネタバレが含まれます。</p>
    <p>ゲームおよびゲーム内コンテンツの権利は各権利者に帰属します。非公式ファンガイドです。</p>
    <a href="{base}/guide/">Guide・イベントカレンダーへ</a> · <a href="{base}/guide/source/">原本データをローカルで検証する開発用画面</a>
  </footer>
</main>

<style>
  .quests-public{width:100%;max-width:none;box-sizing:border-box;margin:0;padding:10px 16px 30px;color:var(--wand-text)}
  .hero{padding:4px 6px 10px}
  h1{font-size:clamp(26px,3vw,33px);margin:2px 0 4px}.hero p{color:var(--wand-muted);font-size:13px;margin:0}
  .numbers{display:flex;gap:18px;flex-wrap:wrap;margin:8px 0;color:var(--wand-text);font-size:12px}
  .numbers strong{color:var(--wand-text);font-size:20px}
  .quest-sections{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 9px}
  .quest-sections button{padding:10px 14px;border:1px solid var(--wand-line);border-radius:9px;background:var(--wand-control);color:var(--wand-text);font-size:12px}
  .quest-sections button.chosen{border-color:var(--wand-selected-line);background:var(--wand-selected);color:var(--wand-text)}
  .quest-unclassified{margin:0 0 8px;font-size:12px;color:var(--wand-muted)}
  .quest-unclassified summary{cursor:pointer;display:list-item;width:max-content}
  .quest-unclassified .quest-sections{margin:6px 0}
  .story-arcs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin;padding:0 0 8px;margin-bottom:6px}
  .story-arcs button{flex:0 0 auto;border:1px solid var(--wand-line);border-radius:8px;padding:9px 12px;
    background:var(--wand-control);color:var(--wand-text);font-size:12px}
  .story-arcs button.chosen{background:var(--wand-selected);border-color:var(--wand-selected-line);color:var(--wand-text)}
  .section-note{font-size:11px;color:var(--wand-muted);line-height:1.65;margin:7px 0}
  .searchbar{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-bottom:10px}
  .searchbar input{max-width:560px}
  .searchbar label{display:grid;gap:5px;font-size:12px;color:var(--wand-text)}
  .searchbar input,.searchbar select{box-sizing:border-box;min-width:0;width:100%;background:var(--wand-control);border:1px solid var(--wand-line);color:var(--wand-text);border-radius:9px;padding:11px;font:inherit}
  .reward-focus{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 10px;font-size:12px;color:var(--wand-text)}
  .reward-focus button{background:var(--wand-control);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:7px;padding:6px 10px}
  .workspace{display:grid;grid-template-columns:minmax(240px,.75fr) minmax(0,1.6fr);gap:10px;align-items:start}
  .workspace.with-character-rail{grid-template-columns:minmax(170px,.5fr) minmax(220px,.7fr) minmax(0,1.5fr)}
  .character-rail{background:var(--wand-surface);border:1px solid var(--wand-line);border-radius:12px;
    padding:7px;min-width:0;max-height:calc(100vh - 28px);overflow:auto;scrollbar-width:thin;position:sticky;top:12px}
  .character-rail button{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;
    border:1px solid transparent;background:none;color:var(--wand-text);text-align:left;border-radius:8px;
    padding:9px 10px;font-size:12px}
  .character-rail button.chosen,.character-rail button:hover{background:var(--wand-selected);border-color:var(--wand-selected-line)}
  .character-rail small{color:var(--wand-muted);font-size:11px}
  .results,.detail{background:var(--wand-surface);border:1px solid var(--wand-line);border-radius:15px;padding:15px;min-width:0}
  .count{font-size:12px;color:var(--wand-muted);margin:1px 4px 12px}
  .quest-row{display:flex;flex-direction:column;align-items:start;text-align:left;width:100%;max-width:100%;min-width:0;box-sizing:border-box;gap:5px;padding:13px 14px;border:1px solid transparent;border-radius:9px;background:none;color:inherit;cursor:pointer}
  .quest-row:hover,.quest-row.active{background:var(--wand-selected);border-color:var(--wand-selected-line)}
  .quest-row strong,.quest-row small{display:block;min-width:0;max-width:100%;overflow-wrap:anywhere;word-break:break-word;white-space:normal}
  .quest-row strong{font-size:14px}.quest-row small{color:var(--wand-muted);font-size:11px}
  button{cursor:pointer}.auto-sentinel{height:18px;margin-top:8px}
  .detail{position:sticky;top:16px;max-height:calc(100vh - 28px);overflow:auto;scrollbar-width:thin}.placeholder,.empty{color:var(--wand-muted);padding:20px 4px}
  .detail-header{border-bottom:1px solid var(--wand-line);padding:0 0 12px;margin-bottom:12px}.detail-header h2{font-size:21px;margin:4px 0}.detail-header p{font-size:13px;color:var(--wand-text);margin:0}
  .quest-permalink{display:inline-block;margin-top:10px;font-size:12px;color:var(--wand-link);text-underline-offset:3px}
  .characters-nav{display:inline-block;margin:6px 0 0;font-size:12px;color:var(--wand-link);text-underline-offset:3px}
  .character-link{color:var(--wand-link);text-underline-offset:3px}
  .detail-stats{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--wand-text);margin-bottom:11px}.detail-stats span{padding:5px 9px;border-radius:8px;background:var(--wand-surface-raised)}
  .step-navigation{display:flex;align-items:center;flex-wrap:wrap;gap:7px;border:1px solid var(--wand-line);background:var(--wand-surface);border-radius:10px;padding:10px;margin:8px 0}
  .step-navigation label{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--wand-text)}
  .step-navigation button,.step-navigation select{background:var(--wand-control);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:7px;padding:7px 10px;font:inherit;font-size:12px}
  .step-navigation select{max-width:160px}
  .step-navigation button:disabled{opacity:.35;cursor:not-allowed}
  .step-navigation .show-all{margin-left:auto;background:transparent}
  .step-permalink{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between;color:var(--wand-muted);font-size:12px;margin:4px 0 12px}
  .step-permalink a{color:var(--wand-link);text-underline-offset:3px}
  .step{border-top:1px solid var(--wand-line);padding:13px 0}.step h3{font-size:15px;margin:0 0 8px}.step p{font-size:13px;color:var(--wand-muted)}.step ol{margin:0;padding-left:25px}.step li{padding:6px 0 8px;font-size:14px}.step li.target-item-match{background:var(--wand-surface-raised);outline:1px solid var(--wand-selected-line);border-radius:7px;padding:7px 9px}.step li small{display:block;color:var(--wand-muted);font-size:11px;margin-top:3px}
  .quest-rewards{margin:10px 0;border:1px solid var(--wand-line);border-radius:9px;padding:10px 12px;font-size:12px;color:var(--wand-text)}
  .quest-rewards summary{cursor:pointer;font-weight:650;color:var(--wand-text)}
  .quest-rewards small{display:block;color:var(--wand-muted);margin-top:8px;line-height:1.5}
  .quest-reward-block{display:grid;gap:6px;margin:9px 0}
  .quest-reward-block ul{margin:0;padding-left:17px}
  .quest-reward-chips{display:flex;flex-wrap:wrap;gap:6px}
  .quest-reward-chips span{border:1px solid var(--wand-line);border-radius:7px;padding:5px 8px;color:var(--wand-text);background:var(--wand-surface-raised);overflow-wrap:anywhere}
  .quest-rewards .reward-item-match{background:var(--wand-surface-raised);border-radius:6px;outline:1px solid var(--wand-selected-line);padding:4px 6px}
  .reward-collection-link{display:inline-grid;place-items:center;vertical-align:middle;width:24px;height:24px;margin-left:4px;border-radius:5px;color:var(--wand-link);text-decoration:none}
  .reward-collection-link:hover,.reward-collection-link:focus-visible{background:var(--wand-control-hover);color:var(--wand-link)}
  .quest-activation{margin:10px 0;border:1px solid var(--wand-line);border-radius:9px;padding:10px 12px;font-size:12px;color:var(--wand-text)}
  .quest-activation summary{cursor:pointer;font-weight:650;color:var(--wand-text)}
  .quest-activation-block{margin:9px 0}
  .quest-activation-block strong{font-size:12px}
  .quest-activation-block p{line-height:1.65;margin:4px 0 6px;overflow-wrap:anywhere}
  .quest-activation small{display:block;color:var(--wand-muted);line-height:1.5}
  .condition-warning{display:block;color:var(--wand-muted);font-size:11px;margin:9px 0}
  .related-quests{border-top:1px solid var(--wand-line);margin-top:15px;padding:13px 0 4px;font-size:12px;color:var(--wand-text);min-width:0;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}
  .related-quests summary{cursor:pointer;font-size:13px;font-weight:650;color:var(--wand-text)}
  .related-quests ul{list-style:none;margin:12px 0 6px;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;min-width:0;max-width:100%;box-sizing:border-box}
  .related-quests li{min-width:0;overflow:hidden}
  .related-quests a{display:block;max-width:100%;box-sizing:border-box;padding:9px 10px;border-radius:7px;border:1px solid var(--wand-line);color:var(--wand-link);text-decoration:none;overflow-wrap:anywhere;word-break:break-word}
  .related-quests a:hover,.related-quests a:focus-visible{background:var(--wand-control-hover)}
  .related-quests p{margin:10px 0 0;line-height:1.5;color:var(--wand-muted);font-size:11px}
  .source-amount{color:var(--wand-text)!important}
  .source-id{font-size:11px;color:var(--wand-muted);margin:5px 0}
  .source-id summary{cursor:pointer;width:max-content;max-width:100%;color:var(--wand-muted)}
  .source-id code{display:inline-block;padding:5px 0;font-size:11px}
  .catalog-meta{margin:12px 4px 0;border-top:1px solid var(--wand-line);padding:10px 2px;color:var(--wand-muted);font-size:12px}
  .catalog-meta summary{cursor:pointer;display:list-item;width:max-content;max-width:100%}.target-status{color:var(--wand-muted);font-size:12px}
  .target-warning{color:var(--wand-warning);font-size:12px}.target-candidates{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}
  .target-chip{display:inline-flex;align-items:baseline;gap:6px;flex-wrap:wrap;border:1px solid var(--wand-line);background:var(--wand-surface-raised);border-radius:7px;padding:5px 8px;font-size:12px}
  .target-chip small{font-size:10px!important;color:var(--wand-muted)!important;margin:0!important}
  .target-collection-link{display:inline-grid;place-items:center;align-self:center;flex:0 0 24px;width:24px;height:24px;border-radius:5px;color:var(--wand-link);text-decoration:none}
  .target-collection-link:hover,.target-collection-link:focus-visible{background:var(--wand-control-hover);color:var(--wand-link)}
  .error{color:var(--wand-danger)}.status{color:var(--wand-muted)}footer{margin-top:28px;color:var(--wand-muted);font-size:12px}footer a{color:var(--wand-muted)}
  @media(max-width:1100px){.workspace.with-character-rail{grid-template-columns:minmax(180px,.55fr) minmax(0,1.4fr)}
    .workspace.with-character-rail .character-rail{grid-row:1;grid-column:1}
    .workspace.with-character-rail .results{grid-row:2;grid-column:1}
    .workspace.with-character-rail .detail{grid-row:1 / span 2;grid-column:2}}
  @media(max-width:850px){.workspace,.workspace.with-character-rail{grid-template-columns:minmax(0,1fr)}
    .workspace.with-character-rail .character-rail,.workspace.with-character-rail .results,
    .workspace.with-character-rail .detail{grid-row:auto;grid-column:auto}
    .character-rail{position:static;max-height:none;display:flex;overflow-x:auto;gap:5px}
    .character-rail button{flex:0 0 auto;width:auto;white-space:nowrap;gap:7px}
    .detail{position:static;max-height:none}}
  @media(max-width:520px){.related-quests ul{grid-template-columns:1fr}}
  @media(max-width:510px){.quests-public{padding:8px 10px 24px}
    .quest-sections{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin}
    .quest-sections button{white-space:nowrap;flex:0 0 auto}
    .searchbar{grid-template-columns:1fr}}
</style>
