<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {PUBLIC_GUIDE_LOCALES,verifyPublicQuestIndex,filterPublicQuests,loadPublicQuestPart,formatPublicGuideText} from '$lib/guide/public-guide.mjs';

  const LANG:Record<string,string>={ja:'日本語',en:'English',fr:'Français',it:'Italiano',de:'Deutsch','es-ES':'Español','zh-CN':'简体中文','pt-BR':'Português'};
  let catalog:any=null;
  let loadError='';
  let loading=true;
  let selected:any=null;
  let selectedRow:any=null;
  let detailLoading=false;
  let detailError='';
  let query='';
  let locale='ja';
  let character='';
  let objective='';
  let limit=40;
  let selectionTicket=0;
  const cached=new Map<number,any>();
  const prefix=`${base}/guide/public/`;

  $: filtered=catalog?filterPublicQuests(catalog,{query:query.slice(0,120),locale,character,objective,limit}):{total:0,rows:[]};
  $: characters=catalog?[...new Set(catalog.quests.map((x:any)=>x.characterId).filter(Boolean))].sort() as string[]:[];
  $: objectives=catalog?[...new Set(catalog.quests.flatMap((x:any)=>x.objectiveKinds))].sort() as string[]:[];

  function label(names:Record<string,string>|null|undefined,fallback='',language='ja') {return formatPublicGuideText(names?.[language]||names?.en||Object.values(names||{})[0]||fallback);}
  function questName(row:any,language:string) {return label(row.names,row.internalName||row.id,language);}
  function characterName(id:string|undefined,language:string) {return label(catalog?.characters?.[id||''],id||'',language);}
  function setSearch() {limit=40;}

  async function loadCatalog() {
    loading=true;loadError='';
    try {
      const res=await fetch(`${prefix}quest-index.json`);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data=await res.json();
      catalog=verifyPublicQuestIndex(data);
    }catch(e){loadError=e instanceof Error?e.message:String(e)}
    finally {loading=false}
  }
  onMount(()=>{void loadCatalog()});

  async function openQuest(row:any) {
    const ticket=++selectionTicket;
    selectedRow=row;selected=null;detailError='';detailLoading=true;
    try {
      let part=cached.get(row.detailPart);
      if(!part){
        part=await loadPublicQuestPart(catalog,row.detailPart,`${prefix}quest-details-${String(row.detailPart).padStart(2,'0')}.json`);
        cached.set(row.detailPart,part);
      }
      const match=part.quests.find((x:any)=>x.id===row.id);
      if(!match)throw new Error('クエスト詳細が見つかりません');
      if(ticket===selectionTicket)selected=match;
    }catch(e){if(ticket===selectionTicket)detailError=e instanceof Error?e.message:String(e)}
    finally {if(ticket===selectionTicket)detailLoading=false}
  }
</script>

<svelte:head>
  <title>クエストガイド | Dreamwish Wand</title>
  <meta name="description" content="Disney Dreamlight Valleyのクエスト733件を8言語で検索。目標、手順、キャラクター別に無料で閲覧できます。" />
</svelte:head>

<main class="quests-public">
  <header class="hero">
    <div class="eyebrow">DREAMWISH WAND · GUIDE</div>
    <h1>クエストガイド</h1>
    <p>ゲームのクエストを検索し、目標と手順を確認できます。データファイルの準備は不要です。</p>
    <div class="meta">Steam v1.26.2に対応 · 8言語 · 静的クエスト情報</div>
  </header>

  {#if loading}
    <p class="status" role="status">クエスト一覧を読み込んでいます…</p>
  {:else if loadError}
    <p class="error" role="alert">公開クエストデータを読み込めませんでした：{loadError}</p>
    <button on:click={loadCatalog}>再読み込み</button>
  {:else if catalog}
    <div class="numbers"><span><strong>{catalog.counts.quests.toLocaleString()}</strong> クエスト</span><span><strong>{catalog.counts.steps.toLocaleString()}</strong> ステップ</span><span><strong>{catalog.counts.objectives.toLocaleString()}</strong> 目標</span></div>
    <div class="searchbar">
      <label>クエストを検索<input aria-label="クエスト名・IDを検索" placeholder="クエスト名・キャラクター名・ID" bind:value={query} on:input={setSearch}/></label>
      <label>表示言語<select aria-label="表示言語" bind:value={locale} on:change={setSearch}>{#each PUBLIC_GUIDE_LOCALES as language}<option value={language}>{LANG[language]}</option>{/each}</select></label>
      <label>キャラクター<select aria-label="キャラクターで絞り込み" bind:value={character} on:change={setSearch}><option value="">すべて</option>{#each characters as id}<option value={id}>{characterName(id,locale)}</option>{/each}</select></label>
      <label>目標の種類<select aria-label="目標で絞り込み" bind:value={objective} on:change={setSearch}><option value="">すべて</option>{#each objectives as kind}<option value={kind}>{kind}</option>{/each}</select></label>
    </div>
    <div class="workspace">
      <section class="results" aria-label="クエスト一覧">
        <p class="count">{filtered.total.toLocaleString()}件のクエスト</p>
        {#each filtered.rows as row (row.id)}
          <button class:active={selectedRow?.id===row.id} class="quest-row" on:click={()=>openQuest(row)}>
            <strong>{questName(row,locale)}</strong>
            <small>{characterName(row.characterId,locale)} · {row.id}</small>
          </button>
        {/each}
        {#if filtered.total>limit}<button class="load-more" on:click={()=>limit+=40}>さらに表示（残り{(filtered.total-limit).toLocaleString()}件）</button>{/if}
        {#if filtered.total===0}<p class="empty">該当するクエストはありません。</p>{/if}
      </section>
      <section class="detail" aria-label="クエスト詳細">
        {#if !selectedRow}
          <p class="placeholder">左の一覧からクエストを選択してください。</p>
        {:else}
          <div class="detail-header"><span>クエストID {selectedRow.id}</span><h2>{questName(selectedRow,locale)}</h2><p>{characterName(selectedRow.characterId,locale)}</p></div>
          {#if detailLoading}<p class="status">目標データを検証しています…</p>{/if}
          {#if detailError}<p class="error" role="alert">{detailError}</p>{/if}
          {#if selected}
            <div class="detail-stats"><span>{selected.steps.length} ステップ</span><span>{selected.objectiveCount} 目標</span>
              {#if selected.configuredFriendshipRange}<span>設定上の友情ポイント：{selected.configuredFriendshipRange.min}–{selected.configuredFriendshipRange.max}</span>{/if}
            </div>
            {#each selected.steps as step (step.index)}
              <section class="step"><h3>ステップ {step.index+1}</h3>
                {#if label(step.text,'',locale)}<p>{label(step.text,'',locale)}</p>{/if}
                {#each step.subSteps as sub (sub.index)}
                  {#if sub.objectives.length}<ol>
                    {#each sub.objectives as goal, i (i)}
                      <li><span>{label(goal.text,goal.type,locale)}</span><small>{goal.type}{goal.objectiveId?' · ID '+goal.objectiveId:''}</small></li>
                    {/each}
                  </ol>{/if}
                {/each}
              </section>
            {/each}
          {/if}
        {/if}
      </section>
    </div>
  {/if}
  <footer>
    <p>クエスト定義を元にした静的ガイドです。現在の進捗・解放判定・開催中イベント・DLC所有状況を示すものではありません。詳細にはネタバレが含まれます。</p>
    <p>ゲームおよびゲーム内コンテンツの権利は各権利者に帰属します。非公式ファンガイドです。</p>
    <a href="{base}/guide/">原本データをローカルで検証する開発用画面</a>
  </footer>
</main>

<style>
  .quests-public{max-width:1300px;margin:0 auto;padding:26px 26px 90px;color:#f2eafa}
  .hero{padding:18px 6px 26px}.eyebrow{letter-spacing:.21em;font-size:11px;color:#c4a4ed;font-weight:700}
  h1{font-size:clamp(28px,4vw,43px);margin:10px 0 8px} .hero p{color:#b9afc5;font-size:15px;margin:0 0 9px}
  .meta{font-size:12px;color:#b9afc5}.numbers{display:flex;gap:18px;flex-wrap:wrap;margin:12px 0 20px;color:#c7b7d5;font-size:13px}
  .numbers strong{color:#f4e7ff;font-size:20px}
  .searchbar{display:grid;grid-template-columns:2fr repeat(3,minmax(120px,1fr));gap:10px;margin-bottom:18px}
  .searchbar label{display:grid;gap:5px;font-size:12px;color:#d6c5e8}
  .searchbar input,.searchbar select{box-sizing:border-box;min-width:0;width:100%;background:#231b30;border:1px solid #65577c;color:#fff;border-radius:9px;padding:11px;font:inherit}
  .workspace{display:grid;grid-template-columns:minmax(270px,.85fr) minmax(0,1.5fr);gap:15px;align-items:start}
  .results,.detail{background:#1d1628;border:1px solid #4c3d5e;border-radius:15px;padding:15px;min-width:0}
  .count{font-size:12px;color:#bea9ce;margin:1px 4px 12px}
  .quest-row{display:flex;flex-direction:column;align-items:start;text-align:left;width:100%;gap:5px;padding:13px 14px;border:1px solid transparent;border-radius:9px;background:none;color:inherit;cursor:pointer}
  .quest-row:hover,.quest-row.active{background:#302440;border-color:#654b85}.quest-row strong{font-size:14px}.quest-row small{color:#aa9cb7;font-size:11px}
  button{cursor:pointer}.load-more{width:100%;padding:11px;border:1px solid #665180;border-radius:9px;background:#342646;color:#f3e6ff;margin-top:10px}
  .detail{position:sticky;top:16px;max-height:calc(100vh - 28px);overflow:auto;scrollbar-width:thin}.placeholder,.empty{color:#ac9dbb;padding:20px 4px}
  .detail-header{border-bottom:1px solid #514260;padding:0 0 16px;margin-bottom:16px}.detail-header span{font-size:11px;color:#b79aca}.detail-header h2{font-size:22px;margin:7px 0}.detail-header p{font-size:13px;color:#c9b8db;margin:0}
  .detail-stats{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:#d6c1e5;margin-bottom:17px}.detail-stats span{padding:5px 9px;border-radius:8px;background:#30243f}
  .step{border-top:1px solid #40344b;padding:13px 0}.step h3{font-size:15px;margin:0 0 8px}.step p{font-size:13px;color:#c2b4cb}.step ol{margin:0;padding-left:25px}.step li{padding:6px 0 8px;font-size:14px}.step li small{display:block;color:#9588a5;font-size:11px;margin-top:3px}
  .error{color:#ffb5bc}.status{color:#d0b4e7}footer{margin-top:28px;color:#a99db6;font-size:12px}footer a{color:#c8a4f6}
  @media(max-width:850px){.searchbar{grid-template-columns:1fr 1fr}.workspace{grid-template-columns:1fr}.detail{position:static;max-height:none}}
  @media(max-width:510px){.quests-public{padding:18px 12px 70px}.searchbar{grid-template-columns:1fr}}
</style>
