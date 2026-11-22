<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {loadPublicStarpath} from '$lib/guide/public-starpath.mjs';
  import {loadStarpathWeeklyLocales,starpathWeeklyDescription} from '$lib/guide/public-starpath-locales.mjs';
  import {loadStarpathDailyLocales,starpathDailyDescription} from '$lib/guide/public-starpath-daily.mjs';
  import {starpathRewardDisplayName,loadStarpathRewardExtras} from '$lib/guide/starpath-reward-extras.mjs';
  import {loadStarpathMedia,starpathMediaThumbnail} from '$lib/guide/starpath-public-media.mjs';
  import {guideCalendarEvents,activeScheduleStarpaths} from '$lib/guide/event-calendar.mjs';
  import {actionableStarpathTask} from '$lib/guide/starpath-task-guidance.mjs';
  import {observeGuideListEnd} from '$lib/guide/auto-load.mjs';

  let catalog:any=null, weeklyLocales:any=null, dailyLocales:any=null, rewardExtras:any=null, publicMedia:any=null, error='', loading=true;
  let locale='ja';
  const languages=[['ja','日本語'],['en','English'],['fr','Français'],['it','Italiano'],['de','Deutsch'],['es-ES','Español'],['pt-BR','Português'],['zh-CN','简体中文']];
  let selectedId='HauntingElegance2026';
  let now=Date.now();
  let tab:'tasks'|'weekly'|'rewards'='tasks';
  let query='';
  let rewardQuery='';
  let rewardTier:'all'|'free'|'premium'='all';
  let limit=60;
  let pagingRevision=0;
  $: activeIds=catalog?new Set(activeScheduleStarpaths(guideCalendarEvents(catalog),now).map((e:any)=>e.sourceSeasonId)):new Set<string>();
  $: availableSeasons=catalog?.seasons?.filter((s:any)=>activeIds.has(s.id))||[];
  $: season=availableSeasons.find((s:any)=>s.id===selectedId)||availableSeasons[0];
  $: rewardRows=season?[...season.rewardPages.flatMap((p:any)=>p.rewards),...season.bonusPages.flatMap((p:any)=>p.rewards),...season.vaultRewards]:[];
  $: filtered=season?.tasks?.filter((t:any)=>(starpathDailyDescription(dailyLocales,season.id,t.id,locale)||t.description||'').toLowerCase().includes(query.toLowerCase().trim())
      ||(t.description||'').toLowerCase().includes(query.toLowerCase().trim())
      ||t.id.toLowerCase().includes(query.toLowerCase().trim())
      ||t.objectiveKind.toLowerCase().includes(query.toLowerCase().trim()))||[];
  function date(value:string){
    return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  }
  function resetTaskPaging(){limit=60;pagingRevision++;}
  function changeSeason(id:string){selectedId=id;query='';rewardQuery='';rewardTier='all';resetTaskPaging();}
  function observeMoreTasks(node:HTMLElement){
    return observeGuideListEnd(node,(showAll:boolean)=>{
      if(filtered.length>limit)limit=showAll?filtered.length:Math.min(limit+60,filtered.length);
    });
  }
  function visibleRewards(rewards:any[],search:string,tier:string,language:string,extras:any){
    const needle=search.trim().toLocaleLowerCase();
    return rewards.filter(r=>{
      if(tier==='free'&&r.premium||tier==='premium'&&!r.premium)return false;
      if(!needle)return true;
      const label=starpathRewardDisplayName(r.itemId,language,extras)||'';
      const alt=r.alternateItemId?starpathRewardDisplayName(r.alternateItemId,language,extras)||'':'';
      return [r.itemId,r.alternateItemId||'',label,alt].join(' ').toLocaleLowerCase().includes(needle);
    });
  }
  function item(r:any,language:string){
    const name=starpathRewardDisplayName(r.itemId,language,rewardExtras);
    return (name||'名称未確認')+' · ID '+r.itemId+' · '+r.amount+'個'+(r.price!==undefined?' · 価格 '+r.price:'')+(r.premium?' · プレミアム':'')+(r.recurrent?' · 繰り返し':'');
  }
  async function load(){
    loading=true;error='';
    try{
      catalog=await loadPublicStarpath(`${base}/guide/public/starpath-cache-2026-11-22.json`);
      [weeklyLocales,dailyLocales,rewardExtras]=await Promise.all([
        loadStarpathWeeklyLocales(`${base}/guide/public/starpath-weekly-locales-2026-11-22.json`,catalog),
        loadStarpathDailyLocales(`${base}/guide/public/`,catalog.seasons),
        loadStarpathRewardExtras(`${base}/guide/public/starpath-reward-extras-2026-11-22.json`,catalog)
      ]);
      publicMedia=await loadStarpathMedia(`${base}/`,catalog);
    }
    catch(e){error=e instanceof Error?e.message:String(e)}
    finally{loading=false;}
  }
  onMount(()=>{
    now=Date.now();
    const clock=setInterval(()=>{now=Date.now()},60000);
    void load();
    return ()=>clearInterval(clock);
  });
</script>

<svelte:head>
  <title>スターパスガイド | Dreamwish Wand</title>
  <meta name="description" content="Disney Dreamlight Valley Steam v1.26.2で観測されたスターパスの静的報酬とタスク定義を確認できます。" />
</svelte:head>
<main class="starpath">
  <header>
    <div class="eyebrow">DREAMWISH WAND · GUIDE</div>
    <h1>スターパスガイド</h1>
    <p>現在の公式発表日程でタスク期間内にあるスターパスのみ、ガイドの対象として表示します。</p>
    <a class="guide-back" href="{base}/guide/">Guide・イベントカレンダーへ</a>
    <p class="disclaimer">表示期間は公式発表とSteamの保存済み日程を照合したものです。ゲームサーバーの即時開催状態は未取得です。タスクの解放や達成状況も取得していません。タスクの具体的な操作説明は原本の文言とは別に検証し、未確認の解答は推測で埋めません。</p>
  </header>
  {#if loading}
    <p role="status">キャッシュ定義を検証しています…</p>
  {:else if error}
    <p role="alert" class="error">データの検証に失敗しました：{error}</p>
    <button on:click={load}>再読み込み</button>
  {:else if catalog}
    <div class="seasons" role="group" aria-label="シーズンを選択">
      {#each availableSeasons as s}
        <button class:selected={s.id===season?.id} on:click={()=>changeSeason(s.id)} aria-pressed={s.id===selectedId}>{s.title}</button>
      {/each}
    </div>
    <label class="language">表示言語 <select bind:value={locale} aria-label="スターパスの表示言語">{#each languages as [code,name]}<option value={code}>{name}</option>{/each}</select></label>
    {#if !availableSeasons.length}<p role="status">現在の日程上、タスク期間内と確認できるスターパスはありません。過去の保存キャッシュだけを根拠に開催中とは表示しません。</p>{/if}
    {#if season}
      <section class="summary" aria-label="シーズン情報">
        <div><span>開始日時</span><strong>{date(season.startUtc)}</strong></div>
        <div><span>タスク期限（未満）</span><strong>{date(season.finishUtcExclusive)}</strong></div>
        <div><span>交換期限（未満）</span><strong>{date(season.endUtcExclusive)}</strong></div>
        <div><span>通常 / 週間</span><strong>{season.counts.dailyTasks} / {season.counts.weeklyTasks}</strong></div>
        <div><span>通常 / ボーナス / Vault報酬</span><strong>{season.counts.normalRewards} / {season.counts.bonusRewards} / {season.counts.vaultRewards}</strong></div>
        <div><span>プレミアム設定価格</span><strong>{season.premiumPrice.amount} {starpathRewardDisplayName(season.premiumPrice.itemId,locale,rewardExtras)}（ID {season.premiumPrice.itemId}）</strong></div>
      </section>
      <nav class="tabs" aria-label="表示内容">
        <button class:active={tab==='tasks'} on:click={()=>tab='tasks'}>通常タスク</button>
        <button class:active={tab==='weekly'} on:click={()=>tab='weekly'}>週間タスク</button>
        <button class:active={tab==='rewards'} on:click={()=>tab='rewards'}>報酬</button>
      </nav>
      {#if tab==='tasks'}
        <div class="search">
          <label>タスクを検索<input bind:value={query} on:input={resetTaskPaging} placeholder="説明・種別・ID" aria-label="通常タスクを検索"/></label>
          <span>{filtered.length}件</span>
        </div>
        <ul class="entries">
          {#each filtered.slice(0,limit) as t (t.id)}
            <li><strong>{actionableStarpathTask(season.id,t,locale==='ja'?'ja':'en')?.action||'達成方法は検証中'}</strong><small>{actionableStarpathTask(season.id,t,locale==='ja'?'ja':'en')?'確認済みの具体的な操作 · ':'解答未確認 · '}ゲーム内表記：{starpathDailyDescription(dailyLocales,season.id,t.id,locale)||'説明未確認'}</small><small>{t.objectiveKind} · {t.id} · {t.tokenReward} {season.currencyName}{t.availableOnDay!==undefined?' · 解放設定日 '+t.availableOnDay:''}</small></li>
          {/each}
        </ul>
        {#if filtered.length>limit}
          {#key `${pagingRevision}:${limit}`}
            <div class="autoload-sentinel" use:observeMoreTasks aria-hidden="true"></div>
          {/key}
        {/if}
      {:else if tab==='weekly'}
        <p class="hint">週間タスクも具体的な操作・謎解きの答えを優先して表示します。未検証のものは解答を創作せず、ゲーム内文言を参考情報として併記します。</p>
        {#each season.weeklyTasks as week,i}
          <section class="week"><h2>第{i+1}週</h2>
            <ul class="entries">
              {#each week as t (t.id)}
                <li><strong>{actionableStarpathTask(season.id,t,locale==='ja'?'ja':'en')?.action||'達成方法は検証中'}</strong><small>{actionableStarpathTask(season.id,t,locale==='ja'?'ja':'en')?'確認済みの具体的な操作 · ':'解答未確認 · '}ゲーム内表記：{starpathWeeklyDescription(weeklyLocales,t.descriptionKey,locale)||'説明未確認'}</small><small>{t.objectiveKind} · {t.id} · {t.tokenReward} {season.currencyName}</small></li>
              {/each}
            </ul>
          </section>
        {/each}
      {:else}
        <div class="reward-search" role="search">
          <label>報酬を検索<input bind:value={rewardQuery} aria-label="報酬を検索" placeholder="報酬名・アイテムID" /></label>
          <label>入手枠<select bind:value={rewardTier} aria-label="報酬の入手枠"><option value="all">すべて</option><option value="free">無料</option><option value="premium">プレミアム</option></select></label>
        </div>
        <p class="hint">52種類の正式名称はSteam v1.26.2のゲーム原本と照合しています。残り8種類は、原本に個別表示名がない「タッチ・オブ・マジック」のモチーフとして表示します。Vaultの代替報酬は付与を意味しません。{publicMedia?'公開済み・検証済みの画像のみ表示しています。':'報酬画像はSRC-04の正式な公開後に表示されます。'}</p>
        {#each season.rewardPages as p}
          {#if visibleRewards(p.rewards,rewardQuery,rewardTier,locale,rewardExtras).length}
          <section class="week"><h2>報酬ページ {p.page}</h2>
            {#if p.minPurchasedFromPreviousPage!==undefined}<p class="hint">前ページの購入設定：{p.minPurchasedFromPreviousPage}件</p>{/if}
            <ul class="entries">{#each visibleRewards(p.rewards,rewardQuery,rewardTier,locale,rewardExtras) as r,i (i)}<li class="reward-entry">{#if starpathMediaThumbnail(publicMedia,r.itemId)}<img class="reward-thumb" src={starpathMediaThumbnail(publicMedia,r.itemId)??''} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />{/if}<span>{item(r,locale)}</span></li>{/each}</ul>
          </section>
          {/if}
        {/each}
        {#each season.bonusPages as p}
          {#if visibleRewards(p.rewards,rewardQuery,rewardTier,locale,rewardExtras).length}
          <section class="week"><h2>ボーナスページ {p.page}{p.currencyConversionPage?'（通貨交換）':''}</h2>
            {#if p.minPurchasedFromPreviousPage!==undefined}<p class="hint">前ページの購入設定：{p.minPurchasedFromPreviousPage}件</p>{/if}
            <ul class="entries">{#each visibleRewards(p.rewards,rewardQuery,rewardTier,locale,rewardExtras) as r,i (i)}<li class="reward-entry">{#if starpathMediaThumbnail(publicMedia,r.itemId)}<img class="reward-thumb" src={starpathMediaThumbnail(publicMedia,r.itemId)??''} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />{/if}<span>{item(r,locale)}</span></li>{/each}</ul>
          </section>
          {/if}
        {/each}
        {#if visibleRewards(season.vaultRewards,rewardQuery,rewardTier,locale,rewardExtras).length}
        <section class="week"><h2>Vault報酬</h2>
          <ul class="entries">{#each visibleRewards(season.vaultRewards,rewardQuery,rewardTier,locale,rewardExtras) as r,i (i)}
            <li class="reward-entry">{#if starpathMediaThumbnail(publicMedia,r.itemId)}<img class="reward-thumb" src={starpathMediaThumbnail(publicMedia,r.itemId)??''} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />{/if}<span>{item(r,locale)}{r.alternateItemId?' · 代替候補: '+(starpathRewardDisplayName(r.alternateItemId,locale,rewardExtras)||'名称未確認')+' (ID '+r.alternateItemId+')':''}</span></li>
          {/each}</ul>
        </section>
        {/if}
        {#if visibleRewards(rewardRows,rewardQuery,rewardTier,locale,rewardExtras).length===0}
          <p role="status">一致する報酬はありません。</p>
        {/if}
      {/if}
    {/if}
  {/if}
  <footer><a href="{base}/guide/quests/">クエストガイドへ</a><p>非公式ファンガイド。原本は非公開のまま維持し、静的候補のみを表示しています。コンテンツの権利は各権利者に帰属します。</p></footer>
</main>
<style>
  .starpath{max-width:1100px;padding:32px 22px 90px;margin:0 auto;color:#f4eafa}
  header h1{font-size:clamp(28px,4vw,42px);margin:10px 0}
  header>p{font-size:14px;color:#c7bbd2;line-height:1.8}
  .eyebrow{font-size:11px;font-weight:700;letter-spacing:.18em;color:#caa6ed}
  .guide-back{display:inline-block;color:#d2b5f0;font-size:12px;margin-bottom:8px}
  .disclaimer,.hint{font-size:12px!important;color:#c0afce!important}
  .seasons,.tabs{display:flex;gap:9px;flex-wrap:wrap;margin:23px 0}
  .language{display:inline-flex;align-items:center;gap:10px;font-size:12px;color:#dfcfed}.language select{padding:9px;background:#251e31;color:#fff;border:1px solid #66537e;border-radius:9px}
  .seasons button,.tabs button{border:1px solid #65527d;border-radius:10px;background:#261c32;color:#ecdcfa;padding:11px 17px}
  .autoload-sentinel{height:1px;width:100%;pointer-events:none}
  .seasons button.selected,.tabs button.active{background:#503667;border-color:#bb91ed;color:#fff}
  .summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:22px 0}
  .summary>div{display:grid;gap:8px;background:#20192c;border:1px solid #4c3e60;padding:14px;border-radius:11px}
  .summary span{font-size:11px;color:#baa7cf}.summary strong{font-size:14px;overflow-wrap:anywhere}
  .search{display:flex;gap:18px;align-items:end;justify-content:space-between;margin:20px 0}
  .search label{font-size:12px;color:#d2c1df;display:grid;gap:8px;flex:1}
  .search input{width:100%;max-width:460px;padding:12px;color:white;background:#261d34;border:1px solid #66537e;border-radius:9px}
  .reward-search{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}.reward-search label{display:grid;gap:7px;font-size:12px;flex:1;min-width:150px;color:#d2c1df}.reward-search input,.reward-search select{width:100%;padding:11px;background:#261d34;color:white;border:1px solid #66537e;border-radius:9px}.reward-search label:first-child{flex:3}
  .entries{list-style:none;padding:0;display:grid;gap:8px}
  .entries li{display:grid;gap:6px;border:1px solid #493956;background:#21192b;border-radius:10px;padding:12px 16px;font-size:13px;overflow-wrap:anywhere}
  .entries li strong{font-size:14px}.entries li small{color:#ab9ab9;font-size:11px}
  .entries li.reward-entry{display:flex;align-items:center;gap:12px;min-width:0}.reward-entry span{min-width:0;overflow-wrap:anywhere}
  .reward-thumb{display:block;width:56px;height:56px;object-fit:contain;flex:0 0 56px;border-radius:9px;background:#33273f}
  .week{margin:28px 0}.week h2{font-size:17px}
  .hint{line-height:1.7}.error{color:#ffb9c3}
  footer{margin-top:38px;font-size:12px;color:#a99ab8}footer a{color:#d7baff}
  @media(max-width:720px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:420px){.summary{grid-template-columns:1fr}.starpath{padding:20px 12px 65px}}
</style>
