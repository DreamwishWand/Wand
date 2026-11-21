<script lang="ts">
  import {
    GUIDE_LOCALES, importGuideSearch, importGuideFolder, importGuideDetail, searchGuide,
    detailStepRows, guideStaticFacts, guideMissionReferences, guideVerifiedSourceBridge, MAX_SHARD_BYTES
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
  let scopeToken = '';
  let page = 0;
  let selectedId = '';
  let selectedDetail: any = null;
  let detailError = '';
  let loadingDetail = false;
  let loadingIndex = false;
  let importError = '';
  let info = '';
  let shardFiles: Record<string, File> = {};
  let characterNames: Record<string, Record<string,string>> = {};
  let groupInfo: Record<string, {id:string,rawName:string,names:Record<string,string>,missionIds:string[]}> = {};
  let loadEpoch = 0;
  let detailEpoch = 0;

  $: filtered = searchIndex ? searchGuide(searchIndex, {
    query: query.slice(0, 128), locale, character, group, update, objective, scopeToken,
    characterNames, groupInfo, offset: page * 40, limit: 40
  }) : {total: 0, results: [], nextOffset: null};
  $: characters = searchIndex ? [...new Set(searchIndex.records.map((r: any) => r.characterId).filter(Boolean))].sort() : [];
  $: groups = searchIndex ? [...new Set(searchIndex.records.map((r: any) => r.groupId).filter(Boolean))].sort() : [];
  $: updates = searchIndex ? [...new Set(searchIndex.records.map((r: any) => r.sourceUpdateGroup).filter(Boolean))].sort() : [];
  $: objectives = searchIndex ? [...new Set(searchIndex.records.flatMap((r: any) => r.objectiveKinds))].sort() : [];
  $: scopeTokens = searchIndex ? [...new Set(searchIndex.records.flatMap((r: any) => r.sourceScopeTokens))].sort() : [];
  $: selectedRow = selectedId && searchIndex ? searchIndex.records.find((r: any) => r.id === selectedId) : null;
  $: sourceBridge = searchIndex ? guideVerifiedSourceBridge(searchIndex) : null;
  $: detailSteps = selectedDetail ? detailStepRows(selectedDetail, locale) : [];
  $: staticFacts = selectedDetail ? guideStaticFacts(selectedDetail, locale) : {conditions:[], policies:[], rewards:[]};
  $: missionReferences = selectedDetail && searchIndex ? guideMissionReferences(selectedDetail, searchIndex, locale) : [];
  $: siblingQuests = selectedRow && groupInfo[selectedRow.groupId] && searchIndex
    ? groupInfo[selectedRow.groupId].missionIds.map((id: string) => searchIndex.records.find((r: any) => r.id === id)).filter(Boolean) : [];
  $: requiredShards = searchIndex
    ? new Set(searchIndex.records.map((r: any) => r.detail.file)).size : 0;

  function resetPage() { page = 0; }
  function characterLabel(value: unknown): string {
    const id = String(value ?? '');
    const names = characterNames[id];
    const sourceName = names?.[locale] || names?.en;
    return sourceName ? `${sourceName} · ${id}` : id;
  }
  function groupLabel(value: unknown): string {
    const id = String(value ?? '');
    const group = groupInfo[id];
    const label = group?.names?.[locale] || group?.names?.en || group?.rawName.replaceAll('!', ' / ');
    return label ? `${label} · ${id}` : id;
  }
  function displayName(row: any) {
    return row.names[locale] || row.names.en || row.internalName || row.id;
  }
  function displayText(record: any, key: string) {
    return record?.plainText?.[key]?.[locale] || record?.plainText?.[key]?.en || '';
  }

  function resetSource() {
    detailEpoch++;
    searchIndex = null;
    shardFiles = {};
    characterNames = {};
    groupInfo = {};
    selectedId = '';
    selectedDetail = null;
    detailError = '';
    query = ''; character = ''; group = ''; update = ''; objective = ''; scopeToken = ''; page = 0;
    info = '';
    importError = '';
  }

  async function chooseFolder(event: Event) {
    const files = (event.currentTarget as HTMLInputElement).files;
    if (!files?.length) return;
    const request = ++loadEpoch;
    resetSource();
    loadingIndex = true;
    try {
      const result = await importGuideFolder(Array.from(files));
      if (request !== loadEpoch) return;
      searchIndex = result.index;
      shardFiles = result.shardFiles;
      characterNames = result.characterNames;
      groupInfo = result.groupInfo;
      info = `${searchIndex.target.platform} ${searchIndex.target.gameVersion}：検索索引と詳細ファイル ${result.matchedShards}/${result.requiredShards} 個とキャラクター名 ${Object.keys(result.characterNames).length} 件、原本クエストグループ ${Object.keys(result.groupInfo).length} 件を接続しました。データは送信せず、詳細は選択時だけ読み込みます。`;
    } catch (error) {
      if (request === loadEpoch) importError = error instanceof Error ? error.message : String(error);
    } finally {
      if (request === loadEpoch) loadingIndex = false;
    }
  }

  async function chooseIndex(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const request = ++loadEpoch;
    resetSource();
    loadingIndex = true;
    try {
      const result = await importGuideSearch(file);
      if (request !== loadEpoch) return;
      searchIndex = result;
      info = `${searchIndex.target.platform} ${searchIndex.target.gameVersion} の静的クエスト定義を読み込みました。端末からのアップロードは行っていません。`;
    } catch (error) {
      if (request === loadEpoch) importError = error instanceof Error ? error.message : String(error);
    } finally {
      if (request === loadEpoch) loadingIndex = false;
    }
  }

  async function showDetail(row: any) {
    const request = ++detailEpoch;
    selectedId = row.id;
    selectedDetail = null;
    detailError = '';
    const name = row.detail.file.split('/').at(-1);
    const file = shardFiles[name];
    if (!file) {
      detailError = `このクエストの詳細を開くには ${name} を選択してください。`;
      loadingDetail = false;
      return;
    }
    loadingDetail = true;
    const index = searchIndex;
    try {
      const detail = await importGuideDetail(index, row.id, file);
      if (request === detailEpoch) selectedDetail = detail;
    } catch (error) {
      if (request === detailEpoch) detailError = error instanceof Error ? error.message : String(error);
    } finally {
      if (request === detailEpoch) loadingDetail = false;
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
      if (file.size <= 0 || file.size > MAX_SHARD_BYTES) {
        detailError = `詳細ファイルのサイズが不正です: ${file.name}`;
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
      <p>推奨：<code>guide/quest-search.json</code> と <code>guide/quest-shards/</code> を含むフォルダを選択してください。個々の詳細ファイルは必要になった時だけ読み込みます。ファイルは外部に送信しません。</p>
    </div>
    <label class="guide-folder-input">Guideデータのフォルダを選択（推奨）
      <input type="file" webkitdirectory on:change={chooseFolder} aria-label="Select private Guide folder" disabled={loadingIndex} />
    </label>
    <details class="guide-manual">
      <summary>個別のJSONファイルを選択する</summary>
      <p class="guide-manual-note">フォルダ選択に対応しない環境では、検索索引と必要な詳細ファイルを別々に選択できます。</p>
    <div class="guide-file-inputs">
      <label>検索索引
        <input type="file" accept=".json,application/json" on:change={chooseIndex} aria-label="Select quest-search.json" />
      </label>
      <label>クエスト詳細（複数選択可）
        <input type="file" accept=".json,application/json" multiple disabled={!searchIndex} on:change={chooseShards} aria-label="Select quest detail shard files" />
      </label>
    </div>
    </details>
    {#if loadingIndex}<p class="guide-note" role="status">検索索引を検証しています…</p>{/if}
    {#if importError}<p class="guide-error" role="alert">{importError}</p>{/if}
    {#if info}<p class="guide-note" role="status">{info}</p>{/if}
  </section>

  {#if searchIndex}
    <section class="guide-stats" aria-label="Source coverage">
      <div><strong>{searchIndex.counts.missions.toLocaleString()}</strong><span>クエスト定義</span></div>
      <div><strong>{searchIndex.counts.excludedQuestGroups.toLocaleString()}</strong><span>独立表示しないグループ</span></div>
      <div><strong>{Object.keys(shardFiles).length}/{requiredShards}</strong><span>読み込み可能な詳細ファイル</span></div>
      <div><strong>{searchIndex.target.gameVersion}</strong><span>取得元のゲームバージョン</span></div>
    </section>

    {#if sourceBridge}
      <section class="guide-source-compatibility" aria-label="Verified source content equivalence">
        <strong>Steam {sourceBridge.targetVersion}との原本内容一致（範囲限定）</strong>
        <p>選択した検索索引の元ファイルSHA-256を照合しました。Steam {sourceBridge.baselineVersion}と{sourceBridge.targetVersion}では、Mission原本および8言語の翻訳ファイル内容が一致しています。</p>
        <p>ただしCondition原本には新規{sourceBridge.addedConditionRecords}件・変更{sourceBridge.changedConditionRecords}件があります。現在の解放条件、進行状況、DLC所有権、オンラインイベント開催状況の判定ではありません。表示データの取得元バージョンは{searchIndex.target.gameVersion}のままです。</p>
      </section>
    {/if}

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
                {#each characters as value}<option value={value}>{characterLabel(value)}</option>{/each}
              </select>
            </label>
            <label>グループID
              <select bind:value={group} on:change={resetPage}>
                <option value="">すべて</option>
                {#each groups as value}<option value={value}>{groupLabel(value)}</option>{/each}
              </select>
              <small>名称は原本の内部識別名で、正式な翻訳名ではありません。</small>
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
            {#if scopeTokens.length}
              <label>原本のコンテンツ区分
                <select bind:value={scopeToken} on:change={resetPage}>
                  <option value="">すべて</option>
                  {#each scopeTokens as value}<option value={value}>{value}</option>{/each}
                </select>
                <small>原本に記録された識別子です。DLC所有状況を示すものではありません。</small>
              </label>
            {/if}
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
                {#if row.matchedLocale?.startsWith('character:')}
                  <span class="guide-name-source">検索一致: キャラクター名 ({row.matchedLocale.slice(10)})</span>
                {:else if row.matchedLocale === 'sourceGroup'}
                  <span class="guide-name-source">検索一致: 原本グループ識別名</span>
                {:else if row.matchedLocale?.startsWith('group:')}
                  <span class="guide-name-source">検索一致: 原本グループ名 ({row.matchedLocale.slice(6)})</span>
                {/if}
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
          {#if selectedRow.characterId}<p class="guide-detail-meta">キャラクター: {characterLabel(selectedRow.characterId)}</p>{/if}
          {#if selectedRow.groupId}<p class="guide-detail-meta">原本グループ: {groupLabel(selectedRow.groupId)}</p>{/if}
          <p class="guide-detail-meta">原本の静的クエスト情報 · {selectedRow.objectiveKinds.join(' / ')}</p>
          {#if loadingDetail}<p role="status">詳細ファイルを検証しています…</p>{/if}
          {#if detailError}<p class="guide-detail-note" role="status">{detailError}</p>{/if}
          {#if selectedDetail}
            {#if displayText(selectedDetail, 'availableDescription')}<p class="guide-detail-description">{displayText(selectedDetail, 'availableDescription')}</p>{/if}
            {#if staticFacts.conditions.length || staticFacts.policies.length}
              <section class="guide-source-facts" aria-label="Static source conditions">
                <h3>原本の利用・解放条件</h3>
                <p>ゲーム原本の条件木と分岐設定です。現在の解放状況・達成状態・確定した前提クエストを示すものではありません。</p>
                {#each staticFacts.conditions as condition}
                  <details class="guide-source-tree">
                    <summary>{condition.label}</summary>
                    <pre>{condition.expression}</pre>
                  </details>
                {/each}
                {#each staticFacts.policies as policy}
                  <details class="guide-source-tree">
                    <summary>{policy.label}</summary>
                    {#if policy.note}<p>{policy.note}</p>{/if}
                    {#if policy.expression}<pre>{policy.expression}</pre>
                    {:else}<p>この分岐には条件木の定義がありません。無条件の解放を意味しません。</p>{/if}
                  </details>
                {/each}
              </section>
            {/if}
            {#if missionReferences.length}
              <section class="guide-source-facts" aria-label="Source-typed quest references">
                <h3>原本の条件式が参照するクエスト</h3>
                <p>条件分岐に登場する参照です。必須の前提クエスト、攻略順、解放済みの判定ではありません。原本の条件式は上の欄で確認できます。</p>
                <ul class="guide-mission-references">
                  {#each missionReferences as reference (reference.sourcePath + reference.id)}
                    <li>
                      <span class="guide-mission-reference-kind">{reference.section} · {reference.predicate}</span>
                      {#if reference.targetInSearchIndex}
                        {#if reference.id === selectedId}
                          <span>{reference.targetName} · ID {reference.id}（現在のクエスト）</span>
                        {:else}
                          <button type="button" on:click={() => showDetail(reference.targetRow)}>{reference.targetName} · ID {reference.id}</button>
                        {/if}
                        {#if reference.targetNameSource !== locale}
                          <small>名称出典: {reference.targetNameSource}</small>
                        {/if}
                      {:else}
                        <span>ID {reference.id}（選択中の検索索引には未収録）</span>
                      {/if}
                    </li>
                  {/each}
                </ul>
              </section>
            {/if}
            {#if staticFacts.rewards.length}
              <section class="guide-source-facts" aria-label="Source-configured rewards">
                <h3>原本に設定された報酬値</h3>
                <p>静的な設定値です。実際の獲得、付与保証、所持状況を示しません。通貨IDは原本の識別子です。</p>
                <ul class="guide-source-rewards">
                  {#each staticFacts.rewards as reward}
                    <li>{reward.label}: {reward.min ?? '不明'} – {reward.max ?? '不明'}</li>
                  {/each}
                </ul>
              </section>
            {/if}
            <h3>ステップ・目標の定義</h3>
            {#if detailSteps.length}
              <ol class="guide-steps">
                {#each detailSteps as step, index}
                  <li>
                    <strong>ステップ {index + 1}</strong>
                    {#if step.text}
                      <p class="guide-step-description">{step.text}{#if step.textSource !== locale}<span class="guide-text-source">{step.textSource}原文</span>{/if}</p>
                    {/if}
                    {#if step.storyText}
                      <details class="guide-story"><summary>ストーリー説明（ネタバレを含む場合があります）</summary>
                        <p>{step.storyText}{#if step.storyTextSource !== locale}<span class="guide-text-source">{step.storyTextSource}原文</span>{/if}</p>
                      </details>
                    {/if}
                    {#if step.objectives.length}
                      <ul class="guide-objective-list">
                        {#each step.objectives as obj}
                          <li>
                            {#if obj.text}
                              <p class="guide-objective-text">{obj.text}{#if obj.textSource !== locale}<span class="guide-text-source">{obj.textSource}原文</span>{/if}</p>
                            {:else}
                              <p class="guide-objective-missing">目標説明が原本にありません。</p>
                            {/if}
                            <span class="guide-objective-kind">{obj.kind}</span>
                            {#if obj.configuredQuantity !== null}<span class="guide-objective-quantity">原本設定数: {obj.configuredQuantity}</span>{/if}
                            {#if obj.candidates.length}
                              <details class="guide-candidates"><summary>アイテム参照候補 {obj.totalCandidates}件（原本ID）</summary>
                                <ul>{#each obj.candidates as item}<li>{item.id} <small>{item.role === 'alternative' ? '選択候補' : '直接参照'}</small></li>{/each}</ul>
                                {#if obj.totalCandidates > obj.candidates.length}<p>先頭{obj.candidates.length}件のみ表示しています。</p>{/if}
                                <p>候補はすべて同時に必要とは限りません。アイテム名や所持数は判定していません。</p>
                              </details>
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </li>
                {/each}
              </ol>
            {:else}
              <p class="guide-detail-note">この原本にはステップ定義がありません。</p>
            {/if}
            <p class="guide-verified">原本レコードのSHA-256を検証しました。進行状況の表示ではありません。</p>
            {#if siblingQuests.length > 1}
              <section class="guide-related" aria-label="Same source quest group">
                <h3>同じ原本グループ内のクエスト</h3>
                <p>原本の掲載順です。解放順、前提関係、プレイ推奨順を意味しません。</p>
                <ul>
                  {#each siblingQuests as related (related.id)}
                    <li><button type="button" class:chosen={related.id === selectedId} aria-current={related.id === selectedId ? 'true' : undefined} on:click={() => showDetail(related)}>{displayName(related)}</button></li>
                  {/each}
                </ul>
              </section>
            {/if}
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
  .guide-folder-input { color:#f2e5fa; display:grid; gap:8px; font-size:12px; font-weight:650; margin:14px 0 6px; max-width:640px; }
  .guide-manual { margin:17px 0 0; color:#bda9d0; font-size:12px; }
  .guide-manual summary { cursor:pointer; padding:8px 0; }
  .guide-manual-note { color:#ac9bbf; font-size:11px; line-height:1.7; }
  .guide-file-inputs { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .guide-note { font-size:12px; color:#bcddb9; margin:14px 0 0; }
  .guide-error { font-size:12px; color:#ffb9af; margin:14px 0 0; }
  .guide-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:18px 0; }
  .guide-stats div { padding:17px 19px; border-radius:13px; background:#1c1727; border:1px solid #ffffff16; display:grid; gap:8px; }
  .guide-stats strong { font-size:22px; font-variant-numeric:tabular-nums; }
  .guide-stats span { color:#a89cb8; font-size:11px; }
  .guide-source-compatibility { padding:16px 20px; margin:18px 0 0; border:1px solid #ffffff2e; border-radius:12px; background:#1c1727; }
  .guide-source-compatibility strong { color:#e8d7f3; font-size:13px; }
  .guide-source-compatibility p { color:#bdb0ca; font-size:12px; line-height:1.75; margin:7px 0 0; }
  .guide-workspace { display:grid; grid-template-columns:minmax(0,1fr) minmax(290px,36%); background:#171320; border:1px solid #ffffff1c; border-radius:16px; overflow:hidden; min-height:540px; margin-top:18px; }
  .guide-list { padding:23px; min-width:0; }
  .guide-toolbar { display:grid; gap:15px; }
  .guide-search-label input { width:100%; }
  .guide-facets { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .guide-facets select { width:100%; min-width:0; }
  .guide-facets small { font-size:10px; color:#ac9bbf; line-height:1.5; }
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
  .guide-step-description { white-space:pre-wrap; color:#eadbf4!important; }
  .guide-story { margin:12px 0; background:#241b31; padding:9px 11px; border-radius:9px; }
  .guide-story summary, .guide-candidates summary { cursor:pointer; color:#cba5e8; font-size:11px; }
  .guide-story p { white-space:pre-wrap; }
  .guide-objective-list { list-style:none; padding:0; display:grid; gap:10px; margin:14px 0 0; }
  .guide-objective-list>li { border:1px solid #ffffff1a; background:#291f34; padding:12px 14px; border-radius:10px; }
  .guide-objective-text { margin:0 0 10px; color:#f1e4ff!important; font-size:13px; white-space:pre-wrap; }
  .guide-objective-missing { margin:0 0 10px; font-size:11px; color:#a89bb8!important; }
  .guide-objective-kind, .guide-objective-quantity { display:inline-block; margin:0 6px 4px 0; font-size:10px; border:1px solid #a47dc04f; border-radius:6px; padding:3px 7px; color:#cab3dc; }
  .guide-objective-quantity { border-color:#5e9f7e70; color:#bddbc7; }
  .guide-text-source { font-size:10px; font-weight:normal; margin-left:8px; color:#ae9abf; }
  .guide-candidates { margin:10px 0 0; font-size:11px; }
  .guide-candidates ul { margin:8px 0; padding-left:18px; color:#d0c0df; }
  .guide-candidates small, .guide-candidates p { color:#a895b8; font-size:10px; }
  .guide-source-facts p { font-size:11px; color:#ad9bbc; line-height:1.7; overflow-wrap:anywhere; }
  .guide-source-tree { background:#281f33; border:1px solid #ffffff1f; border-radius:9px; padding:11px 13px; margin-top:9px; }
  .guide-source-tree summary { cursor:pointer; color:#d9bfec; font-size:12px; }
  .guide-source-tree pre { margin:12px 0 2px; padding:11px; background:#17111e; border-radius:7px; color:#cab8dc; font-size:10px; white-space:pre-wrap; overflow-wrap:anywhere; max-height:340px; overflow:auto; }
  .guide-mission-references { list-style:none; padding:0; display:grid; gap:8px; }
  .guide-mission-references li { background:#291f34; border:1px solid #ffffff19; border-radius:9px; padding:10px 12px; display:grid; gap:5px; color:#d9c6e7; font-size:12px; overflow-wrap:anywhere; }
  .guide-mission-reference-kind,.guide-mission-references small { color:#b29bc3; font-size:10px; }
  .guide-mission-references button { border:1px solid #a47dc055; background:#322541; color:#eddbfa; font:inherit; text-align:left; border-radius:7px; padding:8px 10px; overflow-wrap:anywhere; }
  .guide-mission-references button:hover,.guide-mission-references button:focus-visible { border-color:#c79af4; }
  .guide-source-rewards { color:#ddcbe9; font-size:12px; line-height:1.8; padding-left:18px; }
  .guide-verified { color:#bad7b6; font-size:11px; }
  .guide-related p { font-size:11px; color:#ac9bbf; line-height:1.7; }
  .guide-related ul { list-style:none; padding:0; display:grid; gap:7px; }
  .guide-related button { border:1px solid #ffffff25; background:#2e2239; color:#e5d4f4; border-radius:8px; padding:9px 11px; width:100%; text-align:left; font-size:12px; }
  .guide-related button.chosen { border-color:#c4a0e8; background:#433052; }
  .guide-placeholder,.guide-waiting { text-align:center; color:#b6a7c6; display:grid; place-content:center; gap:10px; min-height:300px; padding:30px; }
  .guide-placeholder span,.guide-waiting span { color:#bc95e0; font-size:48px; }
  .guide-placeholder h2,.guide-waiting h2 { color:#eadcf7; margin:0; font-size:20px; }
  .guide-placeholder p,.guide-waiting p { font-size:12px; line-height:1.8; max-width:420px; }
  @media (max-width:850px) { .guide-workspace { grid-template-columns:1fr; } .guide-detail { border-left:0; border-top:1px solid #ffffff1b; } .guide-hero { align-items:start; flex-direction:column; } }
  @media (max-width:570px) { .guide-stats { grid-template-columns:repeat(2,1fr); } .guide-file-inputs,.guide-facets { grid-template-columns:1fr; } .guide-page { padding-top:26px; } }
</style>
