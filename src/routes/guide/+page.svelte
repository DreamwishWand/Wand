<script lang="ts">
  import {
    GUIDE_LOCALES, importGuideSearch, importGuideDetail, searchGuide,
    detailStepRows
  } from '$lib/guide/client.mjs';

  const languageLabels: Record<string, string> = {
    ja: '日本語', en: 'English', fr: 'Français', it: 'Italiano', de: 'Deutsch',
    'es-ES': 'Español', 'zh-CN': '简体中文', 'pt-BR': 'Português'
  };
  let searchIndex: any = null;
  let query = '';
  let locale = 'ja';
  let character = '';
  let group = '';
  let update = '';
  let objective = '';
  let page = 0;
  let selectedId = '';
  let selectedDetail: any = null;
  let detailError = '';
  let loadingDetail = false;
  let loadingIndex = false;
  let importError = '';
  let info = '';
  let shardFiles: Record<string, File> = {};

  $: filtered = searchIndex ? searchGuide(searchIndex, {
    query: query.slice(0, 128), locale, character, group, update, objective,
    offset: page * 40, limit: 40
  }) : {total: 0, results: [], nextOffset: null};
  $: characters = searchIndex ? [...new Set(searchIndex.records.map((r: any) => r.characterId).filter(Boolean))].sort() : [];
  $: groups = searchIndex ? [...new Set(searchIndex.records.map((r: any) => r.groupId).filter(Boolean))].sort() : [];
  $: updates = searchIndex ? [...new Set(searchIndex.records.map((r: any) => r.sourceUpdateGroup).filter(Boolean))].sort() : [];
  $: objectives = searchIndex ? [...new Set(searchIndex.records.flatMap((r: any) => r.objectiveKinds))].sort() : [];
  $: selectedRow = selectedId && searchIndex ? searchIndex.records.find((r: any) => r.id === selectedId) : null;
  $: detailSteps = selectedDetail ? detailStepRows(selectedDetail, locale) : [];

  function resetPage() { page = 0; }
  function displayName(row: any) {
    return row.names[locale] || row.names.en || row.internalName || row.id;
  }
  function displayText(record: any, key: string) {
    return record?.plainText?.[key]?.[locale] || record?.plainText?.[key]?.en || '';
  }

  async function chooseIndex(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    loadingIndex = true;
    importError = '';
    info = '';
    searchIndex = null;
    shardFiles = {};
    selectedId = '';
    selectedDetail = null;
    try {
      searchIndex = await importGuideSearch(file);
      query = ''; character = ''; group = ''; update = ''; objective = ''; page = 0;
      info = `Steam ${searchIndex.target.gameVersion} / ${searchIndex.target.platform} の静的クエスト定義を読み込みました。端末からのアップロードは行っていません。`;
    } catch (error) {
      importError = error instanceof Error ? error.message : String(error);
    } finally {
      loadingIndex = false;
    }
  }

  async function showDetail(row: any) {
    selectedId = row.id;
    selectedDetail = null;
    detailError = '';
    const name = row.detail.file.split('/').at(-1);
    const file = shardFiles[name];
    if (!file) {
      detailError = `このクエストの詳細を開くには ${name} を選択してください。`;
      return;
    }
    loadingDetail = true;
    try {
      selectedDetail = await importGuideDetail(searchIndex, row.id, file);
    } catch (error) {
      detailError = error instanceof Error ? error.message : String(error);
    } finally {
      loadingDetail = false;
    }
  }

  async function chooseShards(event: Event) {
    const selected = (event.currentTarget as HTMLInputElement).files;
    if (!selected?.length || !searchIndex) return;
    const next: Record<string, File> = {...shardFiles};
    let added = 0;
    for (const file of Array.from(selected)) {
      if (!/^part-(?:0\d|[12]\d|3[01])\.json$/.test(file.name)) {
        detailError = 'part-00.json 〜 part-31.json のファイルのみ選択できます。';
        return;
      }
      next[file.name] = file;
      added++;
    }
    shardFiles = next;
    info = `${added}個の詳細ファイルを選択しました。読み込みはクエスト詳細を開く時だけ行います。`;
    if (selectedRow) await showDetail(selectedRow);
  }
</script>

<svelte:head>
  <title>Guide | Dreamwish Wand</title>
  <meta name="description" content="Source-verified local quest lookup for Dreamlight Valley" />
</svelte:head>

<section class="guide-page">
  <header class="guide-hero">
    <div>
      <p class="guide-eyebrow">DREAMWISH WAND · GUIDE</p>
      <h1>クエストガイド <span>✦</span></h1>
      <p>ゲーム原本に基づくクエスト名・目標・ステップを検索。選択した詳細だけを読み込みます。</p>
      <p class="guide-disclaimer">静的なゲーム定義です。セーブデータ、クエスト進捗、DLC所有状況、開催中イベントは判定しません。</p>
    </div>
    <label class="guide-language">表示言語
      <select bind:value={locale} aria-label="Guide language">
        {#each GUIDE_LOCALES as language}
          <option value={language}>{languageLabels[language]}</option>
        {/each}
      </select>
    </label>
  </header>

  <section class="guide-import" aria-label="Guide local source files">
    <div class="guide-import-intro">
      <strong>ローカルデータを接続</strong>
      <p>まず <code>quest-search.json</code> を選択してください。詳細を見る際は対応する <code>part-XX.json</code> を指定します。すべてブラウザ内で処理します。</p>
    </div>
    <div class="guide-file-inputs">
      <label>検索索引
        <input type="file" accept=".json,application/json" on:change={chooseIndex} aria-label="Select quest-search.json" />
      </label>
      <label>クエスト詳細（複数選択可）
        <input type="file" accept=".json,application/json" multiple disabled={!searchIndex} on:change={chooseShards} aria-label="Select quest detail shard files" />
      </label>
    </div>
    {#if loadingIndex}<p class="guide-note" role="status">検索索引を検証しています…</p>{/if}
    {#if importError}<p class="guide-error" role="alert">{importError}</p>{/if}
    {#if info}<p class="guide-note" role="status">{info}</p>{/if}
  </section>

  {#if searchIndex}
    <section class="guide-stats" aria-label="Source coverage">
      <div><strong>{searchIndex.counts.missions.toLocaleString()}</strong><span>クエスト定義</span></div>
      <div><strong>{searchIndex.counts.excludedQuestGroups.toLocaleString()}</strong><span>独立表示しないグループ</span></div>
      <div><strong>{Object.keys(shardFiles).length}/32</strong><span>読み込み可能な詳細ファイル</span></div>
      <div><strong>{searchIndex.target.gameVersion}</strong><span>取得元のゲームバージョン</span></div>
    </section>

    <div class="guide-workspace">
      <section class="guide-list" aria-label="Quest search results">
        <div class="guide-toolbar">
          <label class="guide-search-label">クエスト名またはID
            <input type="search" placeholder="名前・IDを検索" maxlength="128" bind:value={query} on:input={resetPage} />
          </label>
          <div class="guide-facets">
            <label>キャラクターID
              <select bind:value={character} on:change={resetPage}>
                <option value="">すべて</option>
                {#each characters as value}<option value={value}>{value}</option>{/each}
              </select>
            </label>
            <label>グループID
              <select bind:value={group} on:change={resetPage}>
                <option value="">すべて</option>
                {#each groups as value}<option value={value}>{value}</option>{/each}
              </select>
            </label>
            <label>更新区分
              <select bind:value={update} on:change={resetPage}>
                <option value="">すべて</option>
                {#each updates as value}<option value={value}>{value}</option>{/each}
              </select>
            </label>
            <label>目標種別
              <select bind:value={objective} on:change={resetPage}>
                <option value="">すべて</option>
                {#each objectives as value}<option value={value}>{value}</option>{/each}
              </select>
            </label>
          </div>
        </div>
        <div class="guide-result-count">{filtered.total.toLocaleString()}件の検索結果 · {Math.min(page * 40 + 1, filtered.total)}–{Math.min((page + 1) * 40, filtered.total)}件目</div>
        <ul class="guide-results">
          {#each filtered.results as row (row.id)}
            <li>
              <button class:selected={selectedId === row.id} type="button" on:click={() => showDetail(row)}>
                <span class="guide-quest-title">{row.displayName}</span>
                <span class="guide-quest-sub">ID {row.id} · {row.objectiveKinds.slice(0, 3).join(' · ') || '目標未分類'}</span>
                {#if row.displayNameSource !== locale}<span class="guide-name-source">名称出典: {row.displayNameSource}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
        {#if filtered.total === 0}<p class="guide-empty">該当するクエストはありません。検索条件を変更してください。</p>{/if}
        <div class="guide-pagination">
          <button type="button" on:click={() => page -= 1} disabled={page === 0}>前へ</button>
          <span>{page + 1} ページ</span>
          <button type="button" on:click={() => page += 1} disabled={filtered.nextOffset === null}>次へ</button>
        </div>
      </section>

      <aside class="guide-detail" aria-label="Quest details">
        {#if selectedRow}
          <p class="guide-eyebrow">QUEST DETAIL · {selectedRow.id}</p>
          <h2>{displayName(selectedRow)}</h2>
          <p class="guide-detail-meta">原本の静的クエスト情報 · {selectedRow.objectiveKinds.join(' / ')}</p>
          {#if loadingDetail}<p role="status">詳細ファイルを検証しています…</p>{/if}
          {#if detailError}<p class="guide-detail-note" role="status">{detailError}</p>{/if}
          {#if selectedDetail}
            {#if displayText(selectedDetail, 'availableDescription')}<p class="guide-detail-description">{displayText(selectedDetail, 'availableDescription')}</p>{/if}
            <h3>ステップ・目標の定義</h3>
            {#if detailSteps.length}
              <ol class="guide-steps">
                {#each detailSteps as step, index}
                  <li>
                    <strong>ステップ {index + 1}</strong>
                    {#if step.text}<p>{step.text}</p>{/if}
                    <div class="guide-objectives">
                      {#each step.objectives as obj}<span>{obj.kind}</span>{/each}
                    </div>
                  </li>
                {/each}
              </ol>
            {:else}
              <p class="guide-detail-note">この原本にはステップ定義がありません。</p>
            {/if}
            <p class="guide-verified">原本レコードのSHA-256を検証しました。進行状況の表示ではありません。</p>
          {/if}
        {:else}
          <div class="guide-placeholder"><span aria-hidden="true">✧</span><h2>クエストを選択</h2><p>一覧からクエストを選ぶと、対応する詳細ファイルを検証して表示します。</p></div>
        {/if}
      </aside>
    </div>
  {:else}
    <div class="guide-waiting" role="status"><span aria-hidden="true">✧</span><h2>検索データ未読み込み</h2><p>非公開データは自動公開しません。手元の検索索引を接続すると、クエストを閲覧できます。</p></div>
  {/if}
</section>

<style>
  .guide-page { width:100%; max-width:1540px; margin:0 auto; padding:44px clamp(18px,4vw,68px) 70px; }
  .guide-hero { display:flex; justify-content:space-between; gap:28px; align-items:end; margin-bottom:28px; }
  .guide-eyebrow { color:#caa1fa; font-size:11px; font-weight:800; letter-spacing:.13em; }
  .guide-hero h1 { font-size:clamp(35px,4.1vw,54px); letter-spacing:-.055em; margin:8px 0 10px; }
  .guide-hero h1 span { color:#c89bf7; }
  .guide-hero p:not(.guide-eyebrow) { color:#c4b7d4; font-size:13px; line-height:1.8; max-width:720px; }
  .guide-hero .guide-disclaimer { color:#988ca8!important; font-size:11px!important; }
  .guide-language, .guide-file-inputs label,.guide-facets label,.guide-search-label { color:#beaccd; display:grid; gap:7px; font-size:12px; }
  select, input[type="search"],input[type="file"] { color:#f4ebff; background:#21192c; border:1px solid #ffffff28; border-radius:10px; padding:10px; max-width:100%; }
  select { min-width:120px; }
  input[type="file"] { width:100%; font-size:11px; }
  input:focus-visible,select:focus-visible { border-color:#cdb0ec; }
  .guide-import { padding:22px 24px; border:1px solid #a179b447; border-radius:16px; background:linear-gradient(135deg,#2d223d,#211a2c); }
  .guide-import-intro strong { font-size:15px; }
  .guide-import-intro p { color:#b9a9c8; font-size:12px; line-height:1.8; margin:8px 0 16px; }
  .guide-import code { background:#1d1529; padding:3px 6px; border-radius:5px; }
  .guide-file-inputs { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .guide-note { font-size:12px; color:#bcddb9; margin:14px 0 0; }
  .guide-error { font-size:12px; color:#ffb9af; margin:14px 0 0; }
  .guide-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:18px 0; }
  .guide-stats div { padding:17px 19px; border-radius:13px; background:#1c1727; border:1px solid #ffffff16; display:grid; gap:8px; }
  .guide-stats strong { font-size:22px; font-variant-numeric:tabular-nums; }
  .guide-stats span { color:#a89cb8; font-size:11px; }
  .guide-workspace { display:grid; grid-template-columns:minmax(0,1fr) minmax(290px,36%); background:#171320; border:1px solid #ffffff1c; border-radius:16px; overflow:hidden; min-height:540px; margin-top:18px; }
  .guide-list { padding:23px; min-width:0; }
  .guide-toolbar { display:grid; gap:15px; }
  .guide-search-label input { width:100%; }
  .guide-facets { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .guide-facets select { width:100%; min-width:0; }
  .guide-result-count { font-size:12px; color:#aa9bbd; margin:19px 0 12px; }
  .guide-results { display:grid; gap:8px; margin:0; padding:0; list-style:none; }
  .guide-results button { display:grid; gap:5px; width:100%; text-align:left; background:#241b30; color:#f1e7fb; border:1px solid #ffffff1d; border-radius:11px; padding:14px 15px; }
  .guide-results button:hover,.guide-results button.selected { border-color:#b28ce2; background:#342640; }
  .guide-quest-title { font-size:13px; font-weight:650; overflow-wrap:anywhere; }
  .guide-quest-sub,.guide-name-source { font-size:10px; color:#aa98b9; }
  .guide-name-source { color:#c1a3df; }
  .guide-empty { font-size:12px; color:#aa9bbd; }
  .guide-pagination { display:flex; align-items:center; justify-content:center; gap:16px; margin:25px 0; color:#b7a7c9; font-size:12px; }
  .guide-pagination button { border:1px solid #ffffff29; background:#2d2239; color:#ddcdec; padding:9px 15px; border-radius:9px; }
  .guide-detail { border-left:1px solid #ffffff1b; background:#1e1728; min-width:0; padding:29px 25px; }
  .guide-detail h2 { font-size:21px; overflow-wrap:anywhere; margin:10px 0 7px; }
  .guide-detail-meta { font-size:11px; color:#a88fbd; line-height:1.8; }
  .guide-detail h3 { font-size:14px; border-top:1px solid #ffffff1a; padding-top:24px; margin-top:26px; }
  .guide-detail-note { background:#352840; border:1px solid #795d92; padding:14px; border-radius:10px; color:#d7c4e9; font-size:12px; line-height:1.7; }
  .guide-detail-description { margin-top:22px; color:#d9cce6; font-size:13px; line-height:1.85; white-space:pre-wrap; }
  .guide-steps { margin:0; padding-left:21px; color:#d6c5e4; }
  .guide-steps li { padding:8px 0 18px; line-height:1.75; font-size:12px; }
  .guide-steps p { color:#bcaecc; white-space:pre-wrap; }
  .guide-objectives { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .guide-objectives span { color:#dfcff1; border:1px solid #b08bdb47; border-radius:8px; background:#382948; padding:4px 8px; font-size:11px; }
  .guide-verified { color:#bad7b6; font-size:11px; }
  .guide-placeholder,.guide-waiting { text-align:center; color:#b6a7c6; display:grid; place-content:center; gap:10px; min-height:300px; padding:30px; }
  .guide-placeholder span,.guide-waiting span { color:#bc95e0; font-size:48px; }
  .guide-placeholder h2,.guide-waiting h2 { color:#eadcf7; margin:0; font-size:20px; }
  .guide-placeholder p,.guide-waiting p { font-size:12px; line-height:1.8; max-width:420px; }
  @media (max-width:850px) { .guide-workspace { grid-template-columns:1fr; } .guide-detail { border-left:0; border-top:1px solid #ffffff1b; } .guide-hero { align-items:start; flex-direction:column; } }
  @media (max-width:570px) { .guide-stats { grid-template-columns:repeat(2,1fr); } .guide-file-inputs,.guide-facets { grid-template-columns:1fr; } .guide-page { padding-top:26px; } }
</style>
