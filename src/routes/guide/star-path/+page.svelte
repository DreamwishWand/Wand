<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {loadPublicStarpath} from '$lib/guide/public-starpath.mjs';
  import {loadStarpathWeeklyLocales,starpathWeeklyDescription} from '$lib/guide/public-starpath-locales.mjs';
  import {starpathRewardName} from '$lib/guide/starpath-reward-names.mjs';

  let catalog:any=null, weeklyLocales:any=null, error='', loading=true;
  let locale='ja';
  const languages=[['ja','日本語'],['en','English'],['fr','Français'],['it','Italiano'],['de','Deutsch'],['es-ES','Español'],['pt-BR','Português'],['zh-CN','简体中文']];
  let selectedId='HauntingElegance2026';
  let tab:'tasks'|'weekly'|'rewards'='tasks';
  let query='';
  let limit=60;
  $: season=catalog?.seasons?.find((s:any)=>s.id===selectedId);
  $: filtered=season?.tasks?.filter((t:any)=>(t.description||t.descriptionKey||'').toLowerCase().includes(query.toLowerCase().trim())
      ||t.id.toLowerCase().includes(query.toLowerCase().trim())
      ||t.objectiveKind.toLowerCase().includes(query.toLowerCase().trim()))||[];
  function date(value:string){
    return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  }
  function changeSeason(id:string){selectedId=id;limit=60;query='';}
  function item(r:any){
    const name=starpathRewardName(r.itemId,locale);
    return (name||'名称未確認')+' · ID '+r.itemId+' · '+r.amount+'個'+(r.price!==undefined?' · 価格 '+r.price:'')+(r.premium?' · プレミアム':'')+(r.recurrent?' · 繰り返し':'');
  }
  async function load(){
    loading=true;error='';
    try{
      catalog=await loadPublicStarpath(`${base}/guide/public/starpath-cache-2026-11-22.json`);
      weeklyLocales=await loadStarpathWeeklyLocales(`${base}/guide/public/starpath-weekly-locales-2026-11-22.json`,catalog);
    }
    catch(e){error=e instanceof Error?e.message:String(e)}
    finally{loading=false;}
  }
  onMount(()=>{void load()});
</script>

<svelte:head>
  <title>スターパスガイド | Dreamwish Wand</title>
  <meta name="description" content="Disney Dreamlight Valley Steam v1.26.2で観測されたスターパスの静的報酬とタスク定義を確認できます。" />
</svelte:head>
<main class="starpath">
  <header>
    <div class="eyebrow">DREAMWISH WAND · GUIDE</div>
    <h1>スターパスガイド</h1>
    <p>Steam v1.26.2環境で保存された、2026年11月22日時点のキャッシュに基づく静的定義です。</p>
    <p class="disclaimer">キャッシュは開催中であること、タスクが解放済みであること、アイテムを所持していることの証明ではありません。通常タスクの説明はキャッシュ原文（英語）、週間タスクと確認済み報酬名はゲーム原本の8言語に対応しています。</p>
  </header>
  {#if loading}
    <p role="status">キャッシュ定義を検証しています…</p>
  {:else if error}
    <p role="alert" class="error">データの検証に失敗しました：{error}</p>
    <button on:click={load}>再読み込み</button>
  {:else if catalog}
    <div class="seasons" role="group" aria-label="シーズンを選択">
      {#each catalog.seasons as s}
        <button class:selected={s.id===selectedId} on:click={()=>changeSeason(s.id)} aria-pressed={s.id===selectedId}>{s.title}</button>
      {/each}
    </div>
    <label class="language">表示言語 <select bind:value={locale} aria-label="スターパスの表示言語">{#each languages as [code,name]}<option value={code}>{name}</option>{/each}</select></label>
    {#if season}
      <section class="summary" aria-label="シーズン情報">
        <div><span>開始日時</span><strong>{date(season.startUtc)}</strong></div>
        <div><span>タスク期限（未満）</span><strong>{date(season.finishUtcExclusive)}</strong></div>
        <div><span>交換期限（未満）</span><strong>{date(season.endUtcExclusive)}</strong></div>
        <div><span>通常 / 週間</span><strong>{season.counts.dailyTasks} / {season.counts.weeklyTasks}</strong></div>
        <div><span>通常 / ボーナス / Vault報酬</span><strong>{season.counts.normalRewards} / {season.counts.bonusRewards} / {season.counts.vaultRewards}</strong></div>
        <div><span>プレミアム設定価格</span><strong>{season.premiumPrice.amount}（ID {season.premiumPrice.itemId}）</strong></div>
      </section>
      <nav class="tabs" aria-label="表示内容">
        <button class:active={tab==='tasks'} on:click={()=>tab='tasks'}>通常タスク</button>
        <button class:active={tab==='weekly'} on:click={()=>tab='weekly'}>週間タスク</button>
        <button class:active={tab==='rewards'} on:click={()=>tab='rewards'}>報酬</button>
      </nav>
      {#if tab==='tasks'}
        <div class="search">
          <label>タスクを検索<input bind:value={query} on:input={()=>limit=60} placeholder="説明・種別・ID" aria-label="通常タスクを検索"/></label>
          <span>{filtered.length}件</span>
        </div>
        <ul class="entries">
          {#each filtered.slice(0,limit) as t (t.id)}
            <li><strong lang="en">{t.description||'説明未確認'}</strong><small>{t.objectiveKind} · {t.id} · {t.tokenReward} {season.currencyName}{t.availableOnDay!==undefined?' · 解放設定日 '+t.availableOnDay:''}</small></li>
          {/each}
        </ul>
        {#if filtered.length>limit}<button class="more" on:click={()=>limit+=60}>さらに表示</button>{/if}
      {:else if tab==='weekly'}
        <p class="hint">週間タスクの説明はゲーム原本のLocDBと照合した正式な表記です。地域によって文章や数値が異なる場合も、原文をそのまま表示します。</p>
        {#each season.weeklyTasks as week,i}
          <section class="week"><h2>第{i+1}週</h2>
            <ul class="entries">
              {#each week as t (t.id)}
                <li><strong>{starpathWeeklyDescription(weeklyLocales,t.descriptionKey,locale)||'説明未確認'}</strong><small>{t.objectiveKind} · {t.id} · {t.tokenReward} {season.currencyName}</small></li>
              {/each}
            </ul>
          </section>
        {/each}
      {:else}
        <p class="hint">確認済み43種類の名前はDB-01 Steam v1.26.2原本と照合しています。その他17種類は名称未確認のためIDを表示します。Vaultの代替報酬は付与を意味しません。</p>
        {#each season.rewardPages as p}
          <section class="week"><h2>報酬ページ {p.page}</h2>
            {#if p.minPurchasedFromPreviousPage!==undefined}<p class="hint">前ページの購入設定：{p.minPurchasedFromPreviousPage}件</p>{/if}
            <ul class="entries">{#each p.rewards as r,i (i)}<li>{item(r)}</li>{/each}</ul>
          </section>
        {/each}
        {#each season.bonusPages as p}
          <section class="week"><h2>ボーナスページ {p.page}{p.currencyConversionPage?'（通貨交換）':''}</h2>
            {#if p.minPurchasedFromPreviousPage!==undefined}<p class="hint">前ページの購入設定：{p.minPurchasedFromPreviousPage}件</p>{/if}
            <ul class="entries">{#each p.rewards as r,i (i)}<li>{item(r)}</li>{/each}</ul>
          </section>
        {/each}
        <section class="week"><h2>Vault報酬</h2>
          <ul class="entries">{#each season.vaultRewards as r,i (i)}
            <li>{item(r)}{r.alternateItemId?' · 代替候補: '+(starpathRewardName(r.alternateItemId,locale)||'名称未確認')+' (ID '+r.alternateItemId+')':''}</li>
          {/each}</ul>
        </section>
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
  .disclaimer,.hint{font-size:12px!important;color:#c0afce!important}
  .seasons,.tabs{display:flex;gap:9px;flex-wrap:wrap;margin:23px 0}
  .language{display:inline-flex;align-items:center;gap:10px;font-size:12px;color:#dfcfed}.language select{padding:9px;background:#251e31;color:#fff;border:1px solid #66537e;border-radius:9px}
  .seasons button,.tabs button,.more{border:1px solid #65527d;border-radius:10px;background:#261c32;color:#ecdcfa;padding:11px 17px}
  .seasons button.selected,.tabs button.active{background:#503667;border-color:#bb91ed;color:#fff}
  .summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:22px 0}
  .summary>div{display:grid;gap:8px;background:#20192c;border:1px solid #4c3e60;padding:14px;border-radius:11px}
  .summary span{font-size:11px;color:#baa7cf}.summary strong{font-size:14px;overflow-wrap:anywhere}
  .search{display:flex;gap:18px;align-items:end;justify-content:space-between;margin:20px 0}
  .search label{font-size:12px;color:#d2c1df;display:grid;gap:8px;flex:1}
  .search input{width:100%;max-width:460px;padding:12px;color:white;background:#261d34;border:1px solid #66537e;border-radius:9px}
  .entries{list-style:none;padding:0;display:grid;gap:8px}
  .entries li{display:grid;gap:6px;border:1px solid #493956;background:#21192b;border-radius:10px;padding:12px 16px;font-size:13px;overflow-wrap:anywhere}
  .entries li strong{font-size:14px}.entries li small{color:#ab9ab9;font-size:11px}
  .week{margin:28px 0}.week h2{font-size:17px}
  .hint{line-height:1.7}.error{color:#ffb9c3}
  footer{margin-top:38px;font-size:12px;color:#a99ab8}footer a{color:#d7baff}
  @media(max-width:720px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:420px){.summary{grid-template-columns:1fr}.starpath{padding:20px 12px 65px}}
</style>
