<script lang="ts">
  import GuideCommunityHelp from '$lib/guide/GuideCommunityHelp.svelte';
  import {onMount,tick} from 'svelte';
  import {base} from '$app/paths';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {autoAppend} from '$lib/ui/auto-append';
  import {loadPublicStarpath} from '$lib/guide/public-starpath.ts';
  import {loadStarpathWeeklyLocales,starpathWeeklyDescription} from '$lib/guide/public-starpath-locales.ts';
  import type {StarpathDailyParts,StarpathLocalizedPart} from '$lib/guide/starpath-locale-contract.ts';
  import {loadStarpathDailyLocales,starpathDailyDescription} from '$lib/guide/public-starpath-daily.ts';
  import {starpathRewardDisplayName,loadStarpathRewardExtras,type StarpathRewardExtras} from '$lib/guide/starpath-reward-extras.ts';
  import {createGuideRewardIndex,type GuideRewardIndex} from '$lib/guide/reward-relations.ts';
  import {createGuideStarpathHistory,type GuideStarpathHistory} from '$lib/guide/starpath-history.ts';
  import {loadStarpathNativeRevisionEvidence,STARPATH_NATIVE_REVISION_FILE,
    type StarpathNativeRevisionEvidence} from '$lib/guide/starpath-native-revision.ts';
  import {loadStarpathMedia,starpathMediaThumbnail} from '$lib/guide/starpath-public-media.ts';
  import {guideCalendarEvents,eventScheduleState} from '$lib/guide/event-calendar.ts';
  import {starpathTaskDisplay} from '$lib/guide/starpath-task-guidance.ts';
  import {filterStarpathTasks} from '$lib/guide/starpath-search.ts';
  import {resolveStarpathDutyLink,resolveStarpathSeasonLink,starpathDutyHref,type StarpathDutySelection} from '$lib/guide/starpath-duty-link.ts';
  import {resolveStarpathRewardLink,starpathRewardHref,type StarpathRewardSelection} from '$lib/guide/starpath-reward-link.ts';
  import type {GuideRewardOccurrence} from '$lib/guide/reward-relations.ts';
  import {loadPublicStarpathGoals,starpathGoalLabel,starpathGoalHeading,starpathGoalSourceNote,
    type PublicStarpathGoals} from '$lib/guide/public-starpath-goals.ts';

  let catalog:any=null, publicMedia:any=null, goalWarning='', error='', loading=true;
  let goalAmounts:PublicStarpathGoals|null=null;
  let rewardExtras:StarpathRewardExtras|null=null;
  let weeklyLocales:StarpathLocalizedPart|null=null;
  let dailyLocales:StarpathDailyParts|null=null;
  let sharedRewardIndex:GuideRewardIndex|null=null;
  let officialHistory:GuideStarpathHistory|null=null;
  let nativeRevisionEvidence:StarpathNativeRevisionEvidence|null=null;
  let locale:WandLanguage='ja';
  let selectedId='HauntingElegance2026';
  let now=Date.now();
  let tab:'tasks'|'weekly'|'rewards'='tasks';
  let query='';
  let weeklyQuery='';
  let rewardQuery='';
  let rewardTier:'all'|'free'|'premium'='all';
  let limit=60;
  let highlightedTaskId='';
  let highlightedRewardId='';
  // Source-snapshot browsing is permanent; scheduled status must not gate access
  // to the original static tasks and rewards or imply live server availability.
  $: seasonEvents=catalog?guideCalendarEvents(catalog).filter((e:any)=>e.kind==='starpath'):[];
  $: selectableSeasons=catalog?.seasons||[];
  $: season=selectableSeasons.find((s:any)=>s.id===selectedId)||selectableSeasons[0];
  $: seasonRevision=season?nativeRevisionEvidence?.getVerifiedSeasonRevision(season.id)??null:null;
  $: selectedEvent=season?seasonEvents.find((e:any)=>e.sourceSeasonId===season.id):null;
  $: scheduleState=selectedEvent?eventScheduleState(selectedEvent,now):null;
  // The same source-backed reward relation index is available to Collection,
  // DB-02 Acquisition and Save without copying or redefining Item IDs.
  $: rewardRows=season?sharedRewardIndex?.getSeasonRewards(season.id)??[]:[];
  $: rewardGroups=season?sharedRewardIndex?.getSeasonGroups(season.id)??[]:[];
  $: filtered=season?filterStarpathTasks(season.id,season.tasks,{
    query,locale,
    descriptionOf:(t:any)=>starpathDailyDescription(dailyLocales,season.id,t.id,locale),
    goalTextOf:(t:any)=>starpathGoalLabel(goalAmounts,season.id,t,locale)
  }):[];
  $: filteredWeeks=season?season.weeklyTasks.map((tasks:any[],i:number)=>({
    number:i+1,
    tasks:filterStarpathTasks(season.id,tasks,{
      query:weeklyQuery,locale,
      descriptionOf:(t:any)=>starpathWeeklyDescription(weeklyLocales,t.descriptionKey,locale),
      goalTextOf:(t:any)=>starpathGoalLabel(goalAmounts,season.id,t,locale)
    })
  })):[];
  $: weeklyMatches=filteredWeeks.reduce((count:number,week:any)=>count+week.tasks.length,0);
  function date(value:string){
    return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  }
  function clearDutyLink(){
    highlightedTaskId='';
    highlightedRewardId='';
    const url=new URL(window.location.href);
    url.searchParams.delete('season');
    url.searchParams.delete('task');
    url.searchParams.delete('reward');
    window.history.replaceState(window.history.state,'',url);
  }
  function changeSeason(id:string){
    selectedId=id;limit=60;query='';weeklyQuery='';rewardQuery='';rewardTier='all';
    clearDutyLink();
  }
  function changeTab(next:'tasks'|'weekly'|'rewards'){tab=next;clearDutyLink();}
  async function displayRewardLink(link:StarpathRewardSelection){
    selectedId=link.seasonId;
    tab='rewards';
    rewardQuery=link.occurrence.itemId;
    rewardTier='all';
    highlightedTaskId='';
    highlightedRewardId=link.occurrence.occurrenceId;
    await tick();
    document.getElementById('starpath-reward-'+link.occurrence.occurrenceId)?.scrollIntoView({block:'center'});
  }
  async function displayDutyLink(link:StarpathDutySelection){
    selectedId=link.seasonId;
    tab=link.tab;
    query='';weeklyQuery='';
    limit=link.tab==='tasks'?Math.max(60,link.index+1):60;
    highlightedTaskId=link.taskId;
    highlightedRewardId='';
    await tick();
    document.getElementById(`starpath-${link.seasonId}-${link.taskId}`)?.scrollIntoView({block:'center'});
  }
  function navigateDuty(event:MouseEvent,seasonId:string,taskId:string){
    if(event.button!==0||event.ctrlKey||event.shiftKey||event.altKey||event.metaKey)return;
    if(!catalog)return;
    const link=resolveStarpathDutyLink('?season='+seasonId+'&task='+taskId,catalog);
    if(!link)return;
    event.preventDefault();
    const url=new URL(window.location.href);
    url.searchParams.set('season',seasonId);
    url.searchParams.set('task',taskId);
    url.searchParams.delete('reward');
    window.history.pushState(window.history.state,'',url);
    void displayDutyLink(link);
  }
  function navigateReward(event:MouseEvent,occurrence:GuideRewardOccurrence){
    if(event.button!==0||event.ctrlKey||event.shiftKey||event.altKey||event.metaKey)return;
    if(!sharedRewardIndex)return;
    const target=starpathRewardHref(base,occurrence);
    const link=resolveStarpathRewardLink(new URL(target,window.location.href).search,sharedRewardIndex);
    if(!link)return;
    event.preventDefault();
    const url=new URL(window.location.href);
    url.searchParams.set('season',link.seasonId);
    url.searchParams.set('reward',link.occurrence.occurrenceId);
    url.searchParams.delete('task');
    window.history.pushState(window.history.state,'',url);
    void displayRewardLink(link);
  }
  function visibleRewards(rewards:readonly any[],search:string,tier:string,language:string,extras:any){
    const needle=search.trim().toLocaleLowerCase();
    return rewards.filter(r=>{
      if(tier==='free'&&r.premium||tier==='premium'&&!r.premium)return false;
      if(!needle)return true;
      const label=starpathRewardDisplayName(r.itemId,language,extras)||'';
      const alt=r.alternateItemId?starpathRewardDisplayName(r.alternateItemId,language,extras)||'':'';
      return [r.itemId,r.alternateItemId||'',label,alt].join(' ').toLocaleLowerCase().includes(needle);
    });
  }
  async function load(){
    loading=true;error='';goalWarning='';goalAmounts=null;sharedRewardIndex=null;officialHistory=null;
    nativeRevisionEvidence=null;
    try{
      catalog=await loadPublicStarpath(`${base}/guide/public/starpath-cache-2026-11-22.json`);
      sharedRewardIndex=createGuideRewardIndex(catalog);
      officialHistory=createGuideStarpathHistory(sharedRewardIndex);
      const verifiedSnapshot=catalog;
      // Optional historical verification must never block current Quest/Star Path browsing.
      void loadStarpathNativeRevisionEvidence(
        `${base}/guide/public/${STARPATH_NATIVE_REVISION_FILE}`,verifiedSnapshot
      ).then(result=>{
        if(catalog===verifiedSnapshot)nativeRevisionEvidence=result;
      }).catch(()=>{if(catalog===verifiedSnapshot)nativeRevisionEvidence=null;});
      [weeklyLocales,dailyLocales,rewardExtras]=await Promise.all([
        loadStarpathWeeklyLocales(`${base}/guide/public/starpath-weekly-locales-2026-11-22.json`,catalog),
        loadStarpathDailyLocales(`${base}/guide/public/`,catalog.seasons),
        loadStarpathRewardExtras(`${base}/guide/public/starpath-reward-extras-2026-11-22.json`,catalog)
      ]);
      publicMedia=await loadStarpathMedia(`${base}/`,catalog);
      try{
        goalAmounts=await loadPublicStarpathGoals(`${base}/guide/public/starpath-goals-2026-11-22.json`,catalog);
      }catch(e){goalWarning=e instanceof Error?e.message:String(e);goalAmounts=null;}
    }
    catch(e){error=e instanceof Error?e.message:String(e)}
    finally{loading=false;}
    if(!error&&catalog){
      const reward=resolveStarpathRewardLink(window.location.search,sharedRewardIndex);
      const selected=resolveStarpathDutyLink(window.location.search,catalog);
      if(reward)await displayRewardLink(reward);
      else if(selected)await displayDutyLink(selected);
      else{
        const linkedSeason=resolveStarpathSeasonLink(window.location.search,catalog);
        if(linkedSeason)selectedId=linkedSeason;
      }
    }
  }
  onMount(()=>{
    const unwatch=watchWandLanguage(next=>locale=next);
    now=Date.now();
    const clock=setInterval(()=>{now=Date.now()},60000);
    const restoreLink=()=>{
      if(!catalog)return;
      const reward=resolveStarpathRewardLink(window.location.search,sharedRewardIndex);
      const restored=resolveStarpathDutyLink(window.location.search,catalog);
      if(reward)void displayRewardLink(reward);
      else if(restored)void displayDutyLink(restored);
      else{
        highlightedTaskId='';highlightedRewardId='';
        selectedId=resolveStarpathSeasonLink(window.location.search,catalog)??catalog.seasons[0].id;
      }
    };
    window.addEventListener('popstate',restoreLink);
    void load();
    return ()=>{unwatch();clearInterval(clock);window.removeEventListener('popstate',restoreLink);};
  });
</script>

<svelte:head>
  <title>スターパスガイド | Dreamwish Wand</title>
  <meta name="description" content="Disney Dreamlight Valley Steam v1.26.2で観測されたスターパスの静的報酬とタスク定義を確認できます。" />
</svelte:head>
<main class="starpath">
  <header>
    <h1>スターパス</h1>
    <p>タスクの達成方法・目標数・報酬を確認できます。</p>
    <a class="guide-back" href="{base}/guide/">Guide・イベントカレンダーへ</a>
  </header>
  {#if loading}
    <p role="status">キャッシュ定義を検証しています…</p>
  {:else if error}
    <p role="alert" class="error">データの検証に失敗しました：{error}</p>
    <button on:click={load}>再読み込み</button>
  {:else if catalog}
    <div class="seasons" role="group" aria-label="シーズンを選択">
      {#each selectableSeasons as s}
        {@const event=seasonEvents.find((e:any)=>e.sourceSeasonId===s.id)}
        {@const status=event?eventScheduleState(event,now):null}
        <button class:selected={s.id===season?.id} on:click={()=>changeSeason(s.id)} aria-pressed={s.id===selectedId}>
          {s.title}{#if status==='ended'} <small>（終了）</small>{:else if status==='exchange-only'} <small>（交換期間）</small>{:else if status==='upcoming'} <small>（開始前）</small>{/if}
        </button>
      {/each}
    </div>
    {#if officialHistory}
      <details class="historic-starpaths">
        <summary>過去のスターパス（公式発表 {officialHistory.coverage.officialOnlyAnnouncementCount}件）</summary>
        <ul>
          {#each officialHistory.officialAnnouncementsOnly as entry (entry.historyKey)}
            <li><a href={entry.officialEvidenceUrl} target="_blank" rel="noopener noreferrer">{entry.titleEn}</a><span>{entry.year}</span></li>
          {/each}
        </ul>
        <p>公式記事で存在が確認できた過去のシーズンです。ゲーム内部のシーズンIDと報酬アイテムIDは未確認のため、入手元データには使用していません。</p>
      </details>
    {/if}
    {#if season}
      {#if scheduleState==='ended'}
        <p class="archive-notice" role="status">終了済みのスターパスです。保存された攻略・報酬情報を閲覧できます。</p>
      {:else if scheduleState==='exchange-only'}
        <p class="archive-notice" role="status">タスク期間は終了しています。報酬交換期限前の保存データです。サーバーの開催状態は未確認です。</p>
      {:else if scheduleState==='upcoming'}
        <p class="archive-notice" role="status">開始前の日程です。保存済みのゲームデータを参考として表示しています。</p>
      {/if}
      {#if goalWarning}<p class="hint" role="status">目標数量を検証できなかったため、ゲーム内の説明のみを表示しています。</p>{/if}
      <div class="deadline-strip" aria-label="シーズンの期限">
        <span>タスク期限 <strong>{date(season.finishUtcExclusive)}</strong></span>
        <span>報酬交換期限 <strong>{date(season.endUtcExclusive)}</strong></span>
      </div>
      <details class="season-more">
        <summary>詳細なシーズン情報</summary>
      <section class="summary" aria-label="シーズン情報">
        <div><span>開始日時</span><strong>{date(season.startUtc)}</strong></div>
        <div><span>タスク期限（未満）</span><strong>{date(season.finishUtcExclusive)}</strong></div>
        <div><span>交換期限（未満）</span><strong>{date(season.endUtcExclusive)}</strong></div>
        <div><span>通常 / 週間</span><strong>{season.counts.dailyTasks} / {season.counts.weeklyTasks}</strong></div>
        <div><span>通常 / ボーナス / Vault報酬</span><strong>{season.counts.normalRewards} / {season.counts.bonusRewards} / {season.counts.vaultRewards}</strong></div>
        <div><span>プレミアム設定価格</span><strong>{season.premiumPrice.amount} {starpathRewardDisplayName(season.premiumPrice.itemId,locale,rewardExtras)}（ID {season.premiumPrice.itemId}）</strong></div>
      </section>
      {#if seasonRevision}
        <section class="version-evidence" aria-label="原本で確認したスターパスの設定更新">
          <strong>原本比較：v1.25.0 → v1.26.2</strong>
          <span>報酬 {seasonRevision.rewardSlotsWithIdenticalFullSourceDefinition} 枠は設定が同一。通常タスクの説明のみ {seasonRevision.descriptionEdits.length} 件変更。</span>
          <small>v1.26.2ではApple Arcadeの除外設定が追加されています。原本の比較結果であり、プレイヤーの参加・所有状況や現在の開催状態は示していません。</small>
        </section>
      {/if}
      </details>
      <nav class="tabs" aria-label="表示内容">
        <button class:active={tab==='tasks'} on:click={()=>changeTab('tasks')}>通常タスク</button>
        <button class:active={tab==='weekly'} on:click={()=>changeTab('weekly')}>週間タスク</button>
        <button class:active={tab==='rewards'} on:click={()=>changeTab('rewards')}>報酬</button>
      </nav>
      {#if tab==='tasks'}
        <div class="search">
          <label>タスクを検索<input type="search" bind:value={query} maxlength="120" on:input={()=>limit=60} placeholder="内容・攻略対象・目標数・ID" aria-label="通常タスクを検索"/></label>
          <span>{filtered.length}件</span>
        </div>
        <ul class="entries">
          {#each filtered.slice(0,limit) as t (t.id)}
            {@const display=starpathTaskDisplay(season.id,t,locale,starpathDailyDescription(dailyLocales,season.id,t.id,locale))}
            {@const goal=starpathGoalLabel(goalAmounts,season.id,t,locale)}
            <li id={`starpath-${season.id}-${t.id}`} class:permalink-focused={highlightedTaskId===t.id}><strong>{display.headline}</strong>{#if display.note}<small>{display.note}</small>{/if}<small class="task-data">{#if goal}<span class="goal-badge">{starpathGoalHeading(locale)} {goal}</span>{/if}<span class="token-badge"><WandIcon name="star" size={13}/> {t.tokenReward} {season.currencyName}</span><span>{t.id}{t.availableOnDay!==undefined?' · 解放設定日 '+t.availableOnDay:''}</span><a class="duty-permalink" href={starpathDutyHref(base,season.id,t.id)} aria-label={`タスク ${t.id} の共有リンク`} title="このタスクへのリンク" on:click={event=>navigateDuty(event,season.id,t.id)}><WandIcon name="arrow" size={13}/> リンク</a></small></li>
          {/each}
        </ul>
        {#if filtered.length===0}<p role="status" class="empty-match">一致する通常タスクはありません。</p>{/if}
        {#if filtered.length>limit}<div class="auto-sentinel" use:autoAppend={{hasMore:()=>filtered.length>limit,load:()=>limit+=60}} role="status" aria-label="スクロールでタスクを追加表示"></div>{/if}
      {:else if tab==='weekly'}
        <div class="search">
          <label>週間タスクを検索<input type="search" bind:value={weeklyQuery} maxlength="120" placeholder="内容・攻略対象・目標数・ID" aria-label="週間タスクを検索"/></label>
          <span>{weeklyMatches}件</span>
        </div>
        {#each filteredWeeks as week (week.number)}
          {#if week.tasks.length}
          <section class="week"><h2>第{week.number}週</h2>
            <ul class="entries">
              {#each week.tasks as t (t.id)}
                {@const sourceText=starpathWeeklyDescription(weeklyLocales,t.descriptionKey,locale)}
                {@const display=starpathTaskDisplay(season.id,t,locale,sourceText)}
                {@const goal=starpathGoalLabel(goalAmounts,season.id,t,locale)}
                {@const discrepancy=starpathGoalSourceNote(goalAmounts,season.id,t,locale,sourceText)}
                <li id={`starpath-${season.id}-${t.id}`} class:permalink-focused={highlightedTaskId===t.id}><strong>{display.headline}</strong>{#if display.note}<small>{display.note}</small>{/if}{#if discrepancy}<small class="source-discrepancy">{discrepancy}</small>{/if}<small class="task-data">{#if goal}<span class="goal-badge">{starpathGoalHeading(locale)} {goal}</span>{/if}<span class="token-badge"><WandIcon name="star" size={13}/> {t.tokenReward} {season.currencyName}</span><span>{t.id}</span><a class="duty-permalink" href={starpathDutyHref(base,season.id,t.id)} aria-label={`タスク ${t.id} の共有リンク`} title="このタスクへのリンク" on:click={event=>navigateDuty(event,season.id,t.id)}><WandIcon name="arrow" size={13}/> リンク</a></small></li>
              {/each}
            </ul>
          </section>
          {/if}
        {/each}
        {#if weeklyMatches===0}<p role="status" class="empty-match">一致する週間タスクはありません。</p>{/if}
      {:else}
        <div class="reward-search" role="search">
          <label>報酬を検索<input bind:value={rewardQuery} aria-label="報酬を検索" placeholder="報酬名・アイテムID" /></label>
          <label>入手枠<select bind:value={rewardTier} aria-label="報酬の入手枠"><option value="all">すべて</option><option value="free">無料</option><option value="premium">プレミアム</option></select></label>
        </div>
        <div class="reward-groups">
          {#each rewardGroups as group (group.key)}
            {#if visibleRewards(group.rewards,rewardQuery,rewardTier,locale,rewardExtras).length}
              <section class="week reward-section">
                <h2>{group.section==='normal'?'報酬ページ '+group.page:
                  group.section==='bonus'?'ボーナスページ '+group.page+(group.currencyConversionPage?'（通貨交換）':''):'Vault報酬'}</h2>
                {#if group.minPurchased!==undefined}
                  <p class="reward-condition">前ページで必要な交換数：{group.minPurchased}件</p>
                {/if}
                <ul class="reward-grid" aria-label={group.section==='normal'?'報酬ページ '+group.page:
                  group.section==='bonus'?'ボーナスページ '+group.page:'Vault報酬'}>
                  {#each visibleRewards(group.rewards,rewardQuery,rewardTier,locale,rewardExtras) as r (r.occurrenceId)}
                    <li id={'starpath-reward-'+r.occurrenceId} class="reward-entry" class:premium={r.premium} class:permalink-focused={highlightedRewardId===r.occurrenceId}>
                      <div class="reward-art">
                        {#if starpathMediaThumbnail(publicMedia,r.itemId)}
                          <img class="reward-thumb" src={starpathMediaThumbnail(publicMedia,r.itemId)??''}
                            alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                        {:else}
                          <WandIcon name="collection" size={27}/>
                        {/if}
                      </div>
                      <div class="reward-info">
                        <strong class="reward-name">{starpathRewardDisplayName(r.itemId,locale,rewardExtras)||'名称未確認'}</strong>
                        <div class="reward-tags">
                          <span class="reward-amount">×{r.amount.toLocaleString(locale==='ja'?'ja-JP':locale)}</span>
                          {#if r.premium}<span class="reward-premium"><WandIcon name="lock" size={12}/> プレミアム</span>
                          {:else}<span class="reward-standard">無料枠</span>{/if}
                          {#if r.recurrent}<span>繰り返し交換</span>{/if}
                        </div>
                        {#if r.price!==undefined}
                          <div class="reward-price"><WandIcon name="star" size={14}/>
                            <span>{r.price.toLocaleString(locale==='ja'?'ja-JP':locale)} {season.currencyName}</span>
                          </div>
                        {/if}
                        <details class="reward-source">
                          <summary>アイテム情報</summary>
                          <div>ID {r.itemId}</div>
                          {#if r.alternateItemId}
                            <div>Vault代替候補：{starpathRewardDisplayName(r.alternateItemId,locale,rewardExtras)||'名称未確認'}（ID {r.alternateItemId}）</div>
                            <div>代替候補は自動的な付与を意味しません。</div>
                          {/if}
                        </details>
                         <a class="duty-permalink" href={starpathRewardHref(base,r)} aria-label={`報酬 ${r.itemId} の共有リンク`} on:click={event=>navigateReward(event,r)}><WandIcon name="arrow" size={13}/> リンク</a>
                      </div>
                    </li>
                  {/each}
                </ul>
              </section>
            {/if}
          {/each}
        </div>
        <details class="reward-provenance">
          <summary>報酬データについて</summary>
          <p>52種類はSteam v1.26.2の原本から名称を照合しています。8種類のモチーフには公式の個別表示名がありません。{publicMedia?'画像は公開済み・検証済みのものだけを表示しています。':'画像はSRC-04の正式公開後に追加されます。'}</p>
        </details>
        {#if visibleRewards(rewardRows,rewardQuery,rewardTier,locale,rewardExtras).length===0}
          <p role="status">一致する報酬はありません。</p>
        {/if}
      {/if}
      <GuideCommunityHelp kind="star-path" id={season.id}/>
    {/if}
  {/if}
  <footer>
    <a href="{base}/guide/quests/">クエストガイドへ</a>
    <details class="source-more">
      <summary>表示情報の出典と制限</summary>
      <p>公式発表日程とSteam v1.26.2の保存済みゲームデータを照合しています。ゲームサーバーの即時開催状態、タスクの解放・達成状態は取得していません。攻略手順はゲーム原文とは別に検証し、未確認の解答は推測で埋めません。</p>
    </details>
    <p>非公式ファンガイド。コンテンツの権利は各権利者に帰属します。</p>
  </footer>
</main>
<style>
  .starpath{max-width:1100px;padding:17px 22px 65px;margin:0 auto;color:#f4eafa}
  header h1{font-size:clamp(26px,3vw,34px);margin:3px 0}
  header>p{font-size:13px;color:#c7bbd2;line-height:1.6;margin:0 0 5px}
  .guide-back{display:inline-block;color:#d2b5f0;font-size:12px;margin-bottom:3px}
  .hint{font-size:12px!important;color:#c0afce!important}
  .seasons,.tabs{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}
  .seasons button,.tabs button{border:1px solid #65527d;border-radius:10px;background:#261c32;color:#ecdcfa;padding:11px 17px}
  .seasons button.selected,.tabs button.active{background:#503667;border-color:#bb91ed;color:#fff}
  .seasons button small{font-size:11px;color:#d9bded;font-weight:450}
  .historic-starpaths{margin:7px 0 12px;font-size:12px;color:#cab6db}
  .historic-starpaths summary{cursor:pointer;width:max-content;max-width:100%;padding:6px;color:#ddc7ef}
  .historic-starpaths ul{list-style:none;padding:0;margin:6px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:7px}
  .historic-starpaths li{display:flex;justify-content:space-between;gap:10px;align-items:center;min-width:0;padding:7px 9px;border:1px solid #59466a;border-radius:7px}
  .historic-starpaths a{color:#e4d1f0;overflow-wrap:anywhere}
  .historic-starpaths span{font-size:11px;color:#b49fc7}
  .historic-starpaths p{font-size:11px;color:#a996bf;line-height:1.5}
  .archive-notice{font-size:12px;color:#ddc6ee;margin:9px 0;padding:9px 12px;border-left:2px solid #9d77bd;background:#251b31;line-height:1.5}
  .deadline-strip{display:flex;align-items:center;gap:18px;flex-wrap:wrap;background:#241a32;border:1px solid #4b3d5e;border-radius:10px;padding:9px 13px;margin:12px 0 6px;font-size:12px;color:#bdaacc}
  .deadline-strip strong{color:#f4eafa;font-size:12px;margin-left:6px}
  .season-more{margin:6px 0 0;font-size:12px;color:#cfbde1}
  .version-evidence{display:grid;gap:5px;padding:10px 12px;margin:6px 0 12px;border:1px solid #59456f;border-radius:8px;background:#261b32;line-height:1.5}
  .version-evidence strong{color:#f4eafa;font-size:12px}
  .version-evidence small{font-size:11px;color:#b6a4c5}
  .season-more summary,.source-more summary{cursor:pointer;padding:5px 0;color:#c7a9e4}
  .summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0 14px}
  .summary>div{display:grid;gap:5px;background:#20192c;border:1px solid #4c3e60;padding:10px;border-radius:9px}
  .summary span{font-size:11px;color:#baa7cf}.summary strong{font-size:14px;overflow-wrap:anywhere}
  .search{display:flex;gap:18px;align-items:end;justify-content:space-between;margin:12px 0}
  .search label{font-size:12px;color:#d2c1df;display:grid;gap:8px;flex:1}
  .search input{width:100%;max-width:460px;padding:12px;color:white;background:#261d34;border:1px solid #66537e;border-radius:9px}
  .reward-search{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}.reward-search label{display:grid;gap:7px;font-size:12px;flex:1;min-width:150px;color:#d2c1df}.reward-search input,.reward-search select{width:100%;padding:11px;background:#261d34;color:white;border:1px solid #66537e;border-radius:9px}.reward-search label:first-child{flex:3}
  .entries{list-style:none;padding:0;display:grid;gap:8px}
  .entries li{display:grid;gap:6px;border:1px solid #493956;background:#21192b;border-radius:10px;padding:12px 16px;font-size:13px;overflow-wrap:anywhere}
  .entries li strong{font-size:14px}.entries li small{color:#ab9ab9;font-size:11px}
  .entries li.permalink-focused{border-color:#bd92eb;box-shadow:inset 0 0 0 1px #8e65ba}
  .duty-permalink{display:inline-flex;gap:4px;align-items:center;padding:4px 6px;color:#dcc1f5;text-decoration:none;border:1px solid #695080;border-radius:6px}
  .duty-permalink:hover,.duty-permalink:focus-visible{background:#453054}
  .task-data{display:flex!important;gap:8px;align-items:center;flex-wrap:wrap}
  .goal-badge,.token-badge{display:inline-flex;align-items:center;gap:4px;border-radius:7px;padding:4px 7px;background:#352342;color:#f0dcff}
  .source-discrepancy{display:block;color:#e6c38c;font-size:11px;line-height:1.45;margin-top:4px}
  .goal-badge{border:1px solid #8063a0;color:#f8eaff}
  .token-badge{color:#e7ca93}
  .reward-groups{display:grid;gap:18px;margin:12px 0}
  .reward-section{margin:0}
  .reward-grid{list-style:none;padding:0;margin:9px 0 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
  .reward-grid .reward-entry{display:flex;gap:10px;min-width:0;padding:11px;background:#21192b;border:1px solid #493956;border-radius:11px;overflow-wrap:anywhere}
  .reward-grid .reward-entry.premium{border-color:#745c8e}
  .reward-grid .reward-entry.permalink-focused{border-color:#bd92eb;box-shadow:inset 0 0 0 1px #8e65ba}
  .reward-art{display:grid;place-items:center;flex:0 0 58px;width:58px;height:58px;color:#9b80b8;background:#30243e;border-radius:9px;overflow:hidden}
  .reward-thumb{display:block;width:58px;height:58px;object-fit:contain}
  .reward-info{min-width:0;flex:1;display:grid;align-content:start;gap:7px}
  .reward-name{font-size:13px;line-height:1.45;color:#f4eafa;overflow-wrap:anywhere}
  .reward-tags{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:11px;color:#c2b1d0}
  .reward-tags span{display:inline-flex;align-items:center;gap:4px}
  .reward-amount{font-weight:750;color:#f4eafa}
  .reward-premium{color:#e5c594}
  .reward-standard{color:#c3b6d0}
  .reward-price{display:flex;gap:5px;align-items:center;font-size:12px;color:#e5c594;overflow-wrap:anywhere}
  .reward-source{font-size:10px;color:#b09fbe}
  .reward-source summary{cursor:pointer;width:max-content;max-width:100%}
  .reward-source div{margin-top:4px;overflow-wrap:anywhere}
  .reward-condition{font-size:11px;color:#c0afce;margin:6px 0}
  .reward-provenance{font-size:11px;color:#b9a7c8;line-height:1.5;margin:12px 0}
  .reward-provenance summary{cursor:pointer;width:max-content}
  .week{margin:23px 0}.week h2{font-size:16px;margin:0 0 5px}
  .hint{line-height:1.7}.error{color:#ffb9c3}
  .empty-match{font-size:13px;color:#c4b2d2;padding:14px 0}
  footer{margin-top:24px;font-size:12px;color:#a99ab8}footer a{color:#d7baff}
  .source-more{margin:8px 0 0;line-height:1.7}
  @media(max-width:850px){.reward-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:720px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:510px){.reward-grid{grid-template-columns:1fr}}
  @media(max-width:420px){.summary{grid-template-columns:1fr}.starpath{padding:20px 12px 65px}}
</style>
