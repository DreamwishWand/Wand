<script lang="ts">
  import {base} from '$app/paths';
  import {autoAppend} from '$lib/ui/auto-append';
  import {collectWindow} from '$lib/ui/collect-window.mjs';
  import {
    GUIDE_LOCALES, importGuideSearch, importGuideFolder, importGuideDetail, searchGuide,
    detailStepRows, guideStaticFacts, guideMissionReferences, guideVerifiedSourceBridge, MAX_SHARD_BYTES
  } from '$lib/guide/client.ts';
  import type {LocalGuideFile,OriginalGuideGroup} from '$lib/guide/client.ts';
  import {importCurrentGuideConditions, currentConditionMentionsForQuest, withVerifiedConditionStepDetails,
    type CurrentConditionMention,type CurrentGuideConditions} from '$lib/guide/current-conditions.ts';
  import {createStructuralGuideConditionRelations,type GuideConditionRelationIndex} from '$lib/guide/condition-relations.ts';
  import {createQuestConditionCrossrefs} from '$lib/guide/quest-condition-crossrefs.ts';
  import {loadPinnedCommonConditionGraph,type NativeCommonConditionGraph,
    type NativeCommonConditionPath,type NativeIndirectMissionMention}
    from '$lib/guide/condition-common-links.ts';
  import {guideVerifiedStaticComposite} from '$lib/guide/source-composite.ts';
  import {loadVerifiedLocalGuideRewards} from '$lib/guide/local-reward-files';
  import type {CurrentCompatibleRewardReader} from '$lib/guide/reward-source-equivalence';

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
  let visible = 40;
  let selectedId = '';
  let selectedDetail: any = null;
  let detailError = '';
  let loadingDetail = false;
  let loadingIndex = false;
  let importError = '';
  let info = '';
  let shardFiles:Record<string,LocalGuideFile>={};
  let characterNames: Record<string, Record<string,string>> = {};
  let groupInfo:Record<string,OriginalGuideGroup>={};
  let loadEpoch = 0;
  let detailEpoch = 0;
  let conditionEpoch = 0;
  let conditionRegistry:CurrentGuideConditions|null=null;
  let conditionDisplayRows:readonly CurrentConditionMention[]=[];
  let conditionRelations: GuideConditionRelationIndex|null = null;
  let conditionCommonGraph: NativeCommonConditionGraph|null = null;
  let indirectConditionMentions: Map<string,readonly NativeIndirectMissionMention[]> = new Map();
  let nestedConditionPaths: Map<string,readonly NativeCommonConditionPath[]> = new Map();
  let conditionError = '';
  let loadingConditions = false;
  let rewardEpoch = 0;
  let loadingRewards = false;
  let rewardError = '';
  let localRewards: CurrentCompatibleRewardReader|null = null;

  $: filtered = searchIndex ? collectWindow((offset:number,batch:number)=>searchGuide(searchIndex, {
    query: query.slice(0, 128), locale, character, group, update, objective, scopeToken,
    characterNames, groupInfo, offset, limit: batch
  }),visible,'results') : {total: 0, results: [], nextOffset: null};
  $: characters = searchIndex ? [...new Set(searchIndex.records.map((r: any) => r.characterId).filter(Boolean))].sort() : [];
  $: groups = searchIndex ? [...new Set(searchIndex.records.map((r: any) => r.groupId).filter(Boolean))].sort() : [];
  $: updates = searchIndex ? [...new Set(searchIndex.records.map((r: any) => r.sourceUpdateGroup).filter(Boolean))].sort() : [];
  $: objectives = searchIndex ? [...new Set(searchIndex.records.flatMap((r: any) => r.objectiveKinds))].sort() : [];
  $: scopeTokens = searchIndex ? [...new Set(searchIndex.records.flatMap((r: any) => r.sourceScopeTokens))].sort() : [];
  $: selectedRow = selectedId && searchIndex ? searchIndex.records.find((r: any) => r.id === selectedId) : null;
  $: sourceBridge = searchIndex ? guideVerifiedSourceBridge(searchIndex) : null;
  $: staticComposite = searchIndex && conditionRegistry
    ? guideVerifiedStaticComposite(searchIndex, conditionRegistry) : null;
  $: currentConditionMentions = conditionRegistry && selectedId
    ? (conditionRelations
      ? conditionRelations.getMissionReferences(selectedId)
      : currentConditionMentionsForQuest(conditionRegistry,selectedId))
    : {total:0,rows:[]};
  $: questRewardCandidates = localRewards && selectedId
    ? localRewards.getQuestCandidates(selectedId) : [];
  $: questConditionCrossrefs = selectedDetail && searchIndex && conditionRelations
    ? createQuestConditionCrossrefs(selectedDetail,searchIndex,conditionRelations) : null;
  $: indirectConditionMentions = questConditionCrossrefs && conditionCommonGraph && conditionRelations
    ? new Map([...new Set(questConditionCrossrefs.pointers.map(pointer=>pointer.conditionId))]
      .map(id=>[id,conditionCommonGraph!.getIndirectMissionMentions(id,conditionRelations!)]))
    : new Map<string,readonly NativeIndirectMissionMention[]>();
  $: nestedConditionPaths = questConditionCrossrefs && conditionCommonGraph
    ? new Map([...new Set(questConditionCrossrefs.pointers.map(pointer=>pointer.conditionId))]
      .map(id=>[id,conditionCommonGraph!.getReachable(id)]))
    : new Map<string,readonly NativeCommonConditionPath[]>();
  $: detailSteps = selectedDetail ? detailStepRows(selectedDetail, locale) : [];
  $: conditionDisplayRows = selectedDetail && selectedId && conditionRegistry
    ? withVerifiedConditionStepDetails(selectedDetail, detailSteps, currentConditionMentions.rows, selectedId)
    : currentConditionMentions.rows;
  $: staticFacts = selectedDetail ? guideStaticFacts(selectedDetail, locale) : {conditions:[], policies:[], rewards:[]};
  $: missionReferences = selectedDetail && searchIndex ? guideMissionReferences(selectedDetail, searchIndex, locale) : [];
  $: siblingQuests = selectedRow && groupInfo[selectedRow.groupId] && searchIndex
    ? groupInfo[selectedRow.groupId].missionIds.map((id: string) => searchIndex.records.find((r: any) => r.id === id)).filter(Boolean) : [];
  $: requiredShards = searchIndex
    ? new Set(searchIndex.records.map((r: any) => r.detail.file)).size : 0;

  function resetPage() { visible = 40; }
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
  function conditionRoleLabel(role: string): string {
    const labels: Record<string,string> = {
      availability:'利用条件',unlock:'解放条件',auto_accept:'自動受諾設定',
      ui_visibility:'UI表示条件',owner_override:'担当キャラクター上書き'
    };
    return labels[role]??role;
  }
  function displayName(row: any) {
    return row.names[locale] || row.names.en || row.internalName || row.id;
  }
  function displayText(record: any, key: string) {
    return record?.plainText?.[key]?.[locale] || record?.plainText?.[key]?.en || '';
  }

  function resetSource() {
    detailEpoch++;
    conditionEpoch++;
    conditionRegistry = null;
    conditionRelations = null;
    conditionCommonGraph = null;
    conditionError = '';
    loadingConditions = false;
    rewardEpoch++;
    localRewards = null;
    rewardError = '';
    loadingRewards = false;
    searchIndex = null;
    shardFiles = {};
    characterNames = {};
    groupInfo = {};
    selectedId = '';
    selectedDetail = null;
    detailError = '';
    query = ''; character = ''; group = ''; update = ''; objective = ''; scopeToken = ''; visible = 40;
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
      // Verify both private current-Condition files *before* presenting any
      // data from this folder. Never rely on filenames or index JSON claims.
      const bridge = guideVerifiedSourceBridge(result.index);
      const current = result.currentConditionFiles
        ? await importCurrentGuideConditions(
            result.currentConditionFiles.indexFile,
            result.currentConditionFiles.manifestFile,
            bridge)
        : null;
      const commonGraph = current?.formatVersion===2&&result.currentConditionFiles
        ? await loadPinnedCommonConditionGraph(result.currentConditionFiles.indexFile) : null;
      if (request !== loadEpoch) return;
      searchIndex = result.index;
      shardFiles = result.shardFiles;
      characterNames = result.characterNames;
      groupInfo = result.groupInfo;
      conditionRelations = current?.formatVersion===2 ? createStructuralGuideConditionRelations(current) : null;
      conditionCommonGraph = commonGraph;
      conditionRegistry = current;
      info = `${searchIndex.target.platform} ${searchIndex.target.gameVersion}：検索索引と詳細ファイル ${result.matchedShards}/${result.requiredShards} 個とキャラクター名 ${Object.keys(result.characterNames).length} 件、原本クエストグループ ${Object.keys(result.groupInfo).length} 件を接続しました。${current ? ' Steam '+current.targetVersion+'のCondition '+current.count.toLocaleString()+'件（ミッション参照 '+(typeof current.missionReferenceCount === 'number' ? current.missionReferenceCount.toLocaleString() : '未提供')+'件）も原本SHA-256検証後に自動接続しました。' : ''}データは送信せず、詳細は選択時だけ読み込みます。`;
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

  async function chooseConditions(event: Event) {
    const chosen = Array.from((event.currentTarget as HTMLInputElement).files || []);
    const request = ++conditionEpoch;
    const activeIndex = searchIndex;
    conditionRegistry = null;
    conditionRelations = null;
    conditionCommonGraph = null;
    conditionError = '';
    if (!sourceBridge) {
      conditionError = '原本SHA-256を確認したSteam 1.26.1のGuide検索索引が必要です。';
      return;
    }
    const selection = new Map(chosen.map((file) => [file.name, file]));
    const useV2 = selection.has('condition-native-index-v2.json') ||
      selection.has('condition-native-index-manifest-v2.json');
    const indexName = useV2 ? 'condition-native-index-v2.json' : 'condition-native-index.json';
    const manifestName = useV2 ? 'condition-native-index-manifest-v2.json' :
      'condition-native-index-manifest.json';
    if (chosen.length !== 2 || selection.size !== 2 ||
        !selection.has(indexName) || !selection.has(manifestName)) {
      conditionError = '同じ形式のConditionインデックスとマニフェストの2ファイルを選択してください（v2推奨）。';
      return;
    }
    loadingConditions = true;
    try {
      const result = await importCurrentGuideConditions(
        selection.get(indexName)!,
        selection.get(manifestName)!,
        sourceBridge
      );
      const commonGraph=result.formatVersion===2
        ? await loadPinnedCommonConditionGraph(selection.get(indexName)!) : null;
      if (request === conditionEpoch && activeIndex === searchIndex) {
        conditionCommonGraph=commonGraph;
        conditionRelations = result.formatVersion===2 ? createStructuralGuideConditionRelations(result) : null;
        conditionRegistry = result;
      }
    } catch (error) {
      if (request === conditionEpoch) conditionError = error instanceof Error ? error.message : String(error);
    } finally {
      if (request === conditionEpoch) loadingConditions = false;
    }
  }

  async function chooseRewardFiles(event: Event) {
    const chosen = Array.from((event.currentTarget as HTMLInputElement).files || []);
    if(!chosen.length)return;
    const request=++rewardEpoch;
    const activeIndex=searchIndex;
    localRewards=null;
    rewardError='';
    loadingRewards=true;
    try{
      const next=await loadVerifiedLocalGuideRewards(chosen);
      if(request===rewardEpoch&&activeIndex===searchIndex)localRewards=next;
    }catch(error){
      if(request===rewardEpoch)rewardError=error instanceof Error?error.message:String(error);
    }finally{
      if(request===rewardEpoch)loadingRewards=false;
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
    const next:Record<string,LocalGuideFile>={...shardFiles};
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
  <div class="guide-public-entry">
    <strong>クエスト情報は公開されています。</strong>
    <p>733件のクエストとその目標を、ファイル選択なしで検索できます。</p>
    <a href="{base}/guide/quests/">公開クエストガイドを開く</a>
  </div>
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
      <p>推奨：Steam v1.26.2統合Guideフォルダを選択してください。検索索引・詳細32ファイル・Condition v2の2ファイルを一度に認証して読み込みます。個々のクエスト詳細は必要になった時だけ読み込みます。従来のGuideフォルダも引き続き使用できます。ファイルは外部に送信しません。</p>
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
      <section class="guide-condition-import" aria-label="Steam 1.26.2 Condition originals">
        <strong>Steam 1.26.2の静的Condition定義（任意）</strong>
        <p>推奨：非公開の <code>condition-native-index-v2.json</code> と <code>condition-native-index-manifest-v2.json</code> を2つ同時に選択してください。v1の従来ファイルにも対応します。原本SHA-256を照合し、クエストへの静的条件参照を表示します。ファイルは端末内で処理します。</p>
        <label>Conditionインデックスと検証マニフェスト
          <input type="file" accept=".json,application/json" multiple on:change={chooseConditions}
            disabled={loadingIndex || loadingConditions} aria-label="Select current Condition index and manifest" />
        </label>
        {#if loadingConditions}<p role="status">Condition全件と原本のハッシュを検証しています…</p>{/if}
        {#if conditionError}<p class="guide-error" role="alert">{conditionError}</p>{/if}
        {#if conditionRegistry}
          <p class="guide-condition-loaded" role="status">Steam {conditionRegistry.targetVersion}（Condition v{conditionRegistry.formatVersion}）：{conditionRegistry.count.toLocaleString()}件の定義と{conditionRegistry.missionReferenceCount.toLocaleString()}件のミッション参照を検証しました。{#if conditionCommonGraph}Condition間の参照{conditionCommonGraph.coverage.commonConditionPointers}件も原本SHA-256で検証しました。{/if}クエスト一覧は{searchIndex.target.gameVersion}のままです。</p>
        {/if}
      </section>
      <section class="guide-condition-import" aria-label="Owner-local reward candidate sources">
        <strong>報酬Item IDの原本候補（任意）</strong>
        <p>非公開の5ファイル（guide-event-links.json、quest-item-flows.json、rewards.json、guide-source-composite-1.26.2-v2.json、protodb-source-bridge.private.json）を選択すると、原本SHA-256を照合し、クエストごとのアイテム報酬候補を表示します。データはこの端末内だけで処理します。</p>
        <label>報酬索引と原本一致証明の5ファイル
          <input type="file" accept=".json,application/json" multiple on:change={chooseRewardFiles}
            disabled={loadingIndex || loadingRewards} aria-label="Select 5 private reward proof files" />
        </label>
        {#if loadingRewards}<p role="status">報酬索引と原本の一致を検証しています…</p>{/if}
        {#if rewardError}<p class="guide-error" role="alert">{rewardError}</p>{/if}
        {#if localRewards}
          <p class="guide-condition-loaded" role="status">618件の報酬設定候補（イベント202件・クエスト400件・共通友好レベル16件）を照合しました。実際の獲得、解放条件や現在の開催状況は未検証です。</p>
        {/if}
      </section>
      {#if staticComposite}
        <section class="guide-source-compatibility" aria-label="Verified Steam 1.26.2 static Guide source composite">
          <strong>Steam {staticComposite.targetGameVersion}：静的Guide原本9系列の統合照合が完了</strong>
          <p>8系列の原本ファイル全体が一致し、変更されたCondition 5,440件はv1.26.2から再抽出したものです。8言語の展開済み内容、アーカイブProtoDBも原本照合済みです。ミッション参照は{staticComposite.currentConditionMissionMentions.toLocaleString()}件です。</p>
          <p>検索索引と32分割の詳細データは元のSteam {staticComposite.questSearchOriginalVersion}版を保持しています。元の全32シャード（{staticComposite.totalOriginalQuestShardBytes.toLocaleString()}バイト）と733クエストの詳細を一括検証済みです。友情レベル設定の原本も両バージョンで一致しています。実際に選択した詳細シャードは開く際にファイル全体と個別レコードのSHA-256を検証します。</p>
          <p>これは静的原本の一致・再抽出の証明です。現在のスターパス・イベント、セーブ進捗、解放の必須条件、DLC所有状況を示すものではありません。</p>
        </section>
      {/if}
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
        <div class="guide-result-count">{filtered.total.toLocaleString()}件の検索結果 · {filtered.results.length.toLocaleString()}件表示</div>
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
        {#if filtered.nextOffset!==null}
          <div class="guide-pagination auto-sentinel" use:autoAppend={{hasMore:()=>filtered.nextOffset!==null,load:()=>visible+=40}}
            role="status" aria-label="スクロールでクエストを追加表示"></div>
        {/if}
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
          {#if localRewards}
            <details class="guide-source-facts guide-reward-candidates" aria-label="Verified local quest reward candidates">
              <summary>クエスト報酬の設定候補（{questRewardCandidates.length}件）</summary>
              <p>ゲーム原本が参照する静的な候補です。実際の付与、ドロップ確率、入手条件や所持を保証しません。</p>
              {#if questRewardCandidates.length}
                <ul class="guide-mission-references">
                  {#each questRewardCandidates as candidate (candidate.original.relationId)}
                    <li>
                      <span class="guide-mission-reference-kind">{candidate.original.originFamily === 'quest_intro' ? '開始時の付与設定' : '追加報酬Lootの候補'}</span>
                      <span>Item ID {candidate.itemId}{#if candidate.original.amount !== null} · 設定数量 {candidate.original.amount}{/if}</span>
                      <details class="guide-source-tree">
                        <summary>原本参照</summary>
                        <small>Mission ID {candidate.nativeOriginId} · {candidate.original.relationId}</small>
                        <small>原本フィールド：{candidate.original.sourceField}</small>
                        <small>抽出元 Steam {candidate.originalExtractionVersion}／同一原本 Steam {candidate.sourceCompatibleWith}</small>
                      </details>
                    </li>
                  {/each}
                </ul>
              {:else}
                <p>選択した部分的な報酬索引には、このクエストの候補がありません。報酬が存在しないことを証明するものではありません。</p>
              {/if}
            </details>
          {/if}
          {#if conditionRegistry}
            <section class="guide-source-facts" aria-label="Current Condition source mission references">
              <h3>Steam {conditionRegistry.targetVersion}のConditionが参照するクエスト（{currentConditionMentions.total}件）</h3>
              <p>Condition原本に記載されたこのミッションIDへの静的参照です。v2では完了・進行中・状態・ステップ・目標条件なども含みます。解放条件・攻略順・進行状況・実際の利用箇所を示すものではありません。AND/OR/NOTは原本の条件分岐を保持します。</p>
              {#if conditionDisplayRows.length}
                <ul class="guide-mission-references">
                  {#each conditionDisplayRows as mention (mention.conditionId + mention.sourcePath)}
                    <li>
                      <span class="guide-mission-reference-kind">Condition ID {mention.conditionId} · {mention.operator} · {mention.kind}</span>
                      <span>{mention.sourceName.replaceAll('!', ' / ')}</span>
                      <small>原本パス: {mention.sourcePath}</small>
                      {#if mention.stepId !== undefined}<span>ステップID: {mention.stepId}</span>{/if}
                      {#if mention.subStepId !== undefined}<span>サブステップID: {mention.subStepId}</span>{/if}
                      {#if mention.objectiveId !== undefined}<span>目標ID: {mention.objectiveId}</span>{/if}
                      {#if mention.status !== undefined}<span>原本上のステップ状態指定: {mention.status} ({mention.statusCode})</span>{/if}
                      {#if mention.missionState !== undefined}<span>原本上のミッション状態比較: {mention.comparisonOperator ?? '比較子なし'} · {mention.missionState} ({mention.missionStateCode})</span>{/if}
                      {#if mention.inversed === true}<small>原本で反転フラグが指定されています。</small>{/if}
                      {#if mention.sourceStepIndex !== undefined}
                        <small>詳細原本に実在するステップ：{mention.sourceStepIndex + 1}番目{#if mention.sourceStepName} · {mention.sourceStepName}{/if}</small>
                        {#if mention.localizedStepDescription}
                          <p>{mention.localizedStepDescription}{#if mention.localizedStepDescriptionLanguage !== locale}（{mention.localizedStepDescriptionLanguage ?? '出典不明'}原文）{/if}</p>
                        {/if}
                      {/if}
                    </li>
                  {/each}
                </ul>
                {#if currentConditionMentions.total > conditionDisplayRows.length}
                  <p>先頭{conditionDisplayRows.length}件のみ表示しています。</p>
                {/if}
              {:else}
                <p>このミッションIDへの対象形式の参照は、選択したCondition原本にありません。</p>
              {/if}
            </section>
          {/if}
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
            {#if questConditionCrossrefs && questConditionCrossrefs.pointers.length}
              <details class="guide-source-facts guide-condition-crossrefs"
                aria-label="Current Condition matches from original quest branches">
                <summary>原本のCondition ID参照（{questConditionCrossrefs.coverage.commonConditionOccurrences}箇所）</summary>
                <p>このクエスト自身の利用・解放・自動受諾・UI表示・担当設定から参照されたCondition IDと、Steam v1.26.2原本内のMission参照を対応付けています。AND/OR/NOTや反転設定を保持しますが、必須の前提クエストや条件成立の証明ではありません。</p>
                <ul class="guide-mission-references">
                  {#each questConditionCrossrefs.pointers as pointer (pointer.sourcePath)}
                    <li>
                      <span class="guide-mission-reference-kind">{conditionRoleLabel(pointer.role)}{pointer.branchIndex===null?'':' '+(pointer.branchIndex+1)} · Condition ID {pointer.conditionId}</span>
                      <small>原本の論理分岐：{pointer.booleanPath.join(' → ')}{pointer.inversed===true?' · 反転指定':''}</small>
                      {#if pointer.currentMissionMentions.length}
                        <details class="guide-source-tree">
                          <summary>このCondition内で原本確認されたMission参照（{pointer.currentMissionMentions.length}件）</summary>
                          <ul class="guide-condition-mention-list">
                            {#each pointer.currentMissionMentions.slice(0,12) as mention (mention.missionId + mention.sourcePath)}
                              <li>Mission {mention.missionId} · {mention.kind}{mention.stepId===undefined?'':' · Step ID '+mention.stepId}</li>
                            {/each}
                          </ul>
                          {#if pointer.currentMissionMentions.length>12}
                            <small>その他{pointer.currentMissionMentions.length-12}件の参照は省略しています。</small>
                          {/if}
                        </details>
                      {:else}
                        <small>このCondition IDに対応する直接Mission参照は検出されていません。Condition定義自体が存在しないことを意味しません。</small>
                      {/if}
                      {#if (nestedConditionPaths.get(pointer.conditionId)?.length ?? 0)>0}
                        <details class="guide-source-tree">
                          <summary>さらに参照するCondition（{nestedConditionPaths.get(pointer.conditionId)?.length ?? 0}経路）・間接Mission参照（{indirectConditionMentions.get(pointer.conditionId)?.length ?? 0}件）</summary>
                          <p>複数のConditionを経由した静的参照です。原本のAND/OR/NOTを保持します。参照先の条件成立や必須の前提クエストではありません。CommonConditionsの反転値はこの原本索引では未抽出です。</p>
                          <ul class="guide-condition-mention-list">
                            {#each (nestedConditionPaths.get(pointer.conditionId)??[]).slice(0,16) as chain (chain.via.map(edge=>edge.sourcePath).join('/'))}
                              <li>Condition {chain.conditionId} · {chain.via.map(edge=>edge.booleanPath.join('→')).join(' / ')}</li>
                            {/each}
                          </ul>
                          {#if (nestedConditionPaths.get(pointer.conditionId)?.length??0)>16}
                            <small>その他{(nestedConditionPaths.get(pointer.conditionId)?.length??0)-16}経路は省略しています。</small>
                          {/if}
                          {#if (indirectConditionMentions.get(pointer.conditionId)?.length??0)>0}
                            <ul class="guide-condition-mention-list">
                              {#each (indirectConditionMentions.get(pointer.conditionId)??[]).slice(0,12) as row (row.sourceConditionId+'|'+row.mention.missionId+'|'+row.mention.sourcePath+'|'+row.via.map(edge=>edge.sourcePath).join('/'))}
                                <li>Mission {row.mention.missionId} · {row.mention.kind}（Condition {row.sourceConditionId}経由）</li>
                              {/each}
                            </ul>
                            {#if (indirectConditionMentions.get(pointer.conditionId)?.length??0)>12}
                              <small>その他{(indirectConditionMentions.get(pointer.conditionId)?.length??0)-12}件のMission参照は省略しています。</small>
                            {/if}
                          {/if}
                        </details>
                      {/if}
                    </li>
                  {/each}
                </ul>
              </details>
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
            <p class="guide-verified">原本レコードのSHA-256を検証しました。{#if sourceBridge}所有者原本シャードのファイル全体SHA-256も検証しました。{/if}進行状況の表示ではありません。</p>
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
  .guide-eyebrow { color:var(--wand-muted); font-size:11px; font-weight:800; letter-spacing:.13em; }
  .guide-hero h1 { font-size:clamp(35px,4.1vw,54px); letter-spacing:-.055em; margin:8px 0 10px; }
  .guide-hero h1 span { color:var(--wand-link); }
  .guide-hero p:not(.guide-eyebrow) { color:var(--wand-muted); font-size:13px; line-height:1.8; max-width:720px; }
  .guide-hero .guide-disclaimer { color:var(--wand-muted)!important; font-size:11px!important; }
  .guide-language, .guide-file-inputs label,.guide-facets label,.guide-search-label { color:var(--wand-muted); display:grid; gap:7px; font-size:12px; }
  select, input[type="search"],input[type="file"] { color:var(--wand-text); background:var(--wand-control); border:1px solid var(--wand-subtle-line); border-radius:10px; padding:10px; max-width:100%; }
  select { min-width:120px; }
  input[type="file"] { width:100%; font-size:11px; }
  input:focus-visible,select:focus-visible { border-color:var(--wand-line); }
  .guide-import { padding:22px 24px; border:1px solid var(--wand-subtle-line); border-radius:16px; background:linear-gradient(135deg,var(--wand-surface-raised),var(--wand-surface)); }
  .guide-import-intro strong { font-size:15px; }
  .guide-import-intro p { color:var(--wand-muted); font-size:12px; line-height:1.8; margin:8px 0 16px; }
  .guide-condition-import code { background:var(--wand-surface); padding:3px 6px; border-radius:5px; }
  .guide-condition-import { padding:16px 20px; margin:14px 0 0; border:1px solid var(--wand-subtle-line); border-radius:12px; background:var(--wand-surface); display:grid; gap:9px; }
  .guide-condition-import strong { color:var(--wand-text); font-size:13px; }
  .guide-condition-import p { color:var(--wand-muted); font-size:12px; line-height:1.7; margin:0; }
  .guide-condition-import label { color:var(--wand-text); display:grid; gap:8px; font-size:11px; max-width:640px; }
  .guide-condition-import .guide-error { color:var(--wand-danger); }
  .guide-condition-import .guide-condition-loaded { color:var(--wand-text); }
  
  .guide-folder-input { color:var(--wand-text); display:grid; gap:8px; font-size:12px; font-weight:650; margin:14px 0 6px; max-width:640px; }
  .guide-manual { margin:17px 0 0; color:var(--wand-muted); font-size:12px; }
  .guide-manual summary { cursor:pointer; padding:8px 0; }
  .guide-manual-note { color:var(--wand-muted); font-size:11px; line-height:1.7; }
  .guide-file-inputs { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .guide-note { font-size:12px; color:var(--wand-muted); margin:14px 0 0; }
  .guide-error { font-size:12px; color:var(--wand-danger); margin:14px 0 0; }
  .guide-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:18px 0; }
  .guide-stats div { padding:17px 19px; border-radius:13px; background:var(--wand-surface); border:1px solid var(--wand-subtle-line); display:grid; gap:8px; }
  .guide-stats strong { font-size:22px; font-variant-numeric:tabular-nums; }
  .guide-stats span { color:var(--wand-muted); font-size:11px; }
  .guide-source-compatibility { padding:16px 20px; margin:18px 0 0; border:1px solid var(--wand-subtle-line); border-radius:12px; background:var(--wand-surface); }
  .guide-source-compatibility strong { color:var(--wand-text); font-size:13px; }
  .guide-source-compatibility p { color:var(--wand-muted); font-size:12px; line-height:1.75; margin:7px 0 0; }
  .guide-workspace { display:grid; grid-template-columns:minmax(0,1fr) minmax(290px,36%); background:var(--wand-surface); border:1px solid var(--wand-subtle-line); border-radius:16px; overflow:hidden; min-height:540px; margin-top:18px; }
  .guide-list { padding:23px; min-width:0; }
  .guide-toolbar { display:grid; gap:15px; }
  .guide-search-label input { width:100%; }
  .guide-facets { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .guide-facets select { width:100%; min-width:0; }
  .guide-facets small { font-size:10px; color:var(--wand-muted); line-height:1.5; }
  .guide-result-count { font-size:12px; color:var(--wand-muted); margin:19px 0 12px; }
  .guide-results { display:grid; gap:8px; margin:0; padding:0; list-style:none; }
  .guide-results button { display:grid; gap:5px; width:100%; text-align:left; background:var(--wand-control); color:var(--wand-text); border:1px solid var(--wand-subtle-line); border-radius:11px; padding:14px 15px; }
  .guide-results button:hover,.guide-results button.selected { border-color:var(--wand-selected-line); background:var(--wand-selected); }
  .guide-quest-title { font-size:13px; font-weight:650; overflow-wrap:anywhere; }
  .guide-quest-sub,.guide-name-source { font-size:10px; color:var(--wand-muted); }
  .guide-name-source { color:var(--wand-link); }
  .guide-empty { font-size:12px; color:var(--wand-muted); }
  .guide-pagination { display:flex; align-items:center; justify-content:center; gap:16px; margin:25px 0; color:var(--wand-muted); font-size:12px; }
  .guide-pagination button { border:1px solid var(--wand-subtle-line); background:var(--wand-control); color:var(--wand-text); padding:9px 15px; border-radius:9px; }
  .guide-detail { border-left:1px solid var(--wand-subtle-line); background:var(--wand-surface); min-width:0; padding:29px 25px; }
  .guide-detail h2 { font-size:21px; overflow-wrap:anywhere; margin:10px 0 7px; }
  .guide-detail-meta { font-size:11px; color:var(--wand-muted); line-height:1.8; }
  .guide-detail h3 { font-size:14px; border-top:1px solid var(--wand-subtle-line); padding-top:24px; margin-top:26px; }
  .guide-detail-note { background:var(--wand-surface-raised); border:1px solid var(--wand-line); padding:14px; border-radius:10px; color:var(--wand-muted); font-size:12px; line-height:1.7; }
  .guide-detail-description { margin-top:22px; color:var(--wand-muted); font-size:13px; line-height:1.85; white-space:pre-wrap; }
  .guide-steps { margin:0; padding-left:21px; color:var(--wand-text); }
  .guide-steps li { padding:8px 0 18px; line-height:1.75; font-size:12px; }
  .guide-steps p { color:var(--wand-muted); white-space:pre-wrap; }
  .guide-step-description { white-space:pre-wrap; color:var(--wand-muted)!important; }
  .guide-story { margin:12px 0; background:var(--wand-surface); padding:9px 11px; border-radius:9px; }
  .guide-story summary, .guide-candidates summary { cursor:pointer; color:var(--wand-link); font-size:11px; }
  .guide-story p { white-space:pre-wrap; }
  .guide-objective-list { list-style:none; padding:0; display:grid; gap:10px; margin:14px 0 0; }
  .guide-objective-list>li { border:1px solid var(--wand-subtle-line); background:var(--wand-surface-raised); padding:12px 14px; border-radius:10px; }
  .guide-objective-text { margin:0 0 10px; color:var(--wand-text)!important; font-size:13px; white-space:pre-wrap; }
  .guide-objective-missing { margin:0 0 10px; font-size:11px; color:var(--wand-muted)!important; }
  .guide-objective-kind, .guide-objective-quantity { display:inline-block; margin:0 6px 4px 0; font-size:10px; border:1px solid var(--wand-line); border-radius:6px; padding:3px 7px; color:var(--wand-text); }
  .guide-objective-quantity { border-color:var(--wand-line); color:var(--wand-text); }
  .guide-text-source { font-size:10px; font-weight:normal; margin-left:8px; color:var(--wand-muted); }
  .guide-candidates { margin:10px 0 0; font-size:11px; }
  .guide-candidates ul { margin:8px 0; padding-left:18px; color:var(--wand-text); }
  .guide-candidates small, .guide-candidates p { color:var(--wand-muted); font-size:10px; }
  .guide-source-facts p { font-size:11px; color:var(--wand-muted); line-height:1.7; overflow-wrap:anywhere; }
  .guide-reward-candidates { margin:18px 0; }
  .guide-reward-candidates>summary { color:var(--wand-text); cursor:pointer; font-size:13px; font-weight:650; }
  .guide-reward-candidates .guide-source-tree { display:grid; gap:7px; }
  .guide-reward-candidates .guide-source-tree small { display:block; color:var(--wand-muted); font-size:10px; overflow-wrap:anywhere; }
  .guide-source-tree { background:var(--wand-surface-raised); border:1px solid var(--wand-subtle-line); border-radius:9px; padding:11px 13px; margin-top:9px; }
  .guide-source-tree summary { cursor:pointer; color:var(--wand-text); font-size:12px; }
  .guide-source-tree pre { margin:12px 0 2px; padding:11px; background:var(--wand-surface); border-radius:7px; color:var(--wand-text); font-size:10px; white-space:pre-wrap; overflow-wrap:anywhere; max-height:340px; overflow:auto; }
  .guide-mission-references { list-style:none; padding:0; display:grid; gap:8px; }
  .guide-mission-references li { background:var(--wand-surface-raised); border:1px solid var(--wand-subtle-line); border-radius:9px; padding:10px 12px; display:grid; gap:5px; color:var(--wand-text); font-size:12px; overflow-wrap:anywhere; }
  .guide-mission-reference-kind,.guide-mission-references small { color:var(--wand-muted); font-size:10px; }
  .guide-mission-references button { border:1px solid var(--wand-line); background:var(--wand-control); color:var(--wand-text); font:inherit; text-align:left; border-radius:7px; padding:8px 10px; overflow-wrap:anywhere; }
  .guide-mission-references button:hover,.guide-mission-references button:focus-visible { border-color:var(--wand-selected-line); }
  .guide-condition-crossrefs {margin:20px 0;}
  .guide-condition-crossrefs>summary {cursor:pointer;font-size:13px;font-weight:650;color:var(--wand-text);}
  .guide-condition-crossrefs .guide-source-tree {margin-top:4px;}
  .guide-condition-mention-list {padding-left:17px;margin:8px 0;color:var(--wand-text);}
  .guide-condition-mention-list li {background:transparent;border:0;padding:2px 0;font-size:11px;}
  .guide-source-rewards { color:var(--wand-text); font-size:12px; line-height:1.8; padding-left:18px; }
  .guide-verified { color:var(--wand-success); font-size:11px; }
  .guide-related p { font-size:11px; color:var(--wand-muted); line-height:1.7; }
  .guide-related ul { list-style:none; padding:0; display:grid; gap:7px; }
  .guide-related button { border:1px solid var(--wand-subtle-line); background:var(--wand-control); color:var(--wand-text); border-radius:8px; padding:9px 11px; width:100%; text-align:left; font-size:12px; }
  .guide-related button.chosen { border-color:var(--wand-selected-line); background:var(--wand-selected); }
  .guide-placeholder,.guide-waiting { text-align:center; color:var(--wand-muted); display:grid; place-content:center; gap:10px; min-height:300px; padding:30px; }
  .guide-placeholder span,.guide-waiting span { color:var(--wand-muted); font-size:48px; }
  .guide-placeholder h2,.guide-waiting h2 { color:var(--wand-muted); margin:0; font-size:20px; }
  .guide-placeholder p,.guide-waiting p { font-size:12px; line-height:1.8; max-width:420px; }
  @media (max-width:850px) { .guide-workspace { grid-template-columns:1fr; } .guide-detail { border-left:0; border-top:1px solid var(--wand-subtle-line); } .guide-hero { align-items:start; flex-direction:column; } }
  @media (max-width:570px) { .guide-stats { grid-template-columns:repeat(2,1fr); } .guide-file-inputs,.guide-facets { grid-template-columns:1fr; } .guide-page { padding-top:26px; } }
  .guide-public-entry{padding:16px 20px;border:1px solid var(--wand-line);border-radius:12px;background:var(--wand-surface-raised);color:var(--wand-text);margin-bottom:18px}
  .guide-public-entry p{color:var(--wand-text);margin:8px 0}
  .guide-public-entry a{color:var(--wand-link);font-weight:700;text-decoration:underline}
</style>
