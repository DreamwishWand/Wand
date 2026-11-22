<script lang="ts">
  import { onDestroy,tick } from 'svelte';
  import {autoAppend} from '$lib/ui/auto-append';
  import NativeGraphExplorer from '$lib/world/NativeGraphExplorer.svelte';
  import type {OriginalItemAnchorFindResult, GlobalOriginalItemAnchorResult}
    from '$lib/world/native-item-anchor-finder.ts';
  import {matchSourceGridToLocalTerrain,
    type SourceGridNavigationRequest}
    from '$lib/world/native-grid-navigation.ts';

  type GridOption = {
    gridIdNative: number;
    gridDataPath: string;
    knownGridData: boolean;
    sizeX: number | null;
    sizeY: number | null;
    anchorSizeX: number | null;
    anchorSizeY: number | null;
    tessellationFactor: number | null;
    anchorDomainStatus: string;
    defaultObjectCount: number;
  };
  type LayoutOption = {
    viewKey: string; label: string; layoutId: string;
    kind: 'gridCollection' | 'villageArea';
    regionKey: string;
    villageLayoutId?: string; nativeAreaTypeCode?: number;
    nativeAreaTypeName?: string | null;
    missingReferencedLayout?: boolean;
    grids: GridOption[];
  };
  type RegionCoverage = {
    regionKey: string;
    villageLayoutCount: number; realmLayoutCount: number; offGridLayoutCount: number; areaReferenceCount: number;
    resolvedAreaReferenceCount: number; missingAreaLayoutReferenceCount: number;
    nativeGridReferenceCount: number; presentNativeGridReferenceCount: number;
    missingNativeGridReferenceCount: number; sourceDefaultAnchorCount: number;
    separateAreaReferenceCount: number; resolvedSeparateAreaReferenceCount: number;
    missingSeparateAreaReferenceCount: number;
    worldCoordinatesVerified: false; placementLegalityVerified: false;
  };
  type Anchor = {
    layoutObjectId: string;
    gridObjectIdNative: number;
    itemId: number;
    x: number; y: number;
    orientationCode: number;
    orientationName: string | null;
  };
  type PageResult = {
    status: string; rect?: {x:number;y:number;width:number;height:number};
    defaultObjectAnchors?: Anchor[];
    viewAnchorCount?: number; matchingNativeDefaultAnchorCount?: number;
    totalNativeDefaultObjectAnchors?: number;
    hasNextPage?: boolean; nextOffset?: number | null; pageOffset?: number;
    gridDataPath?: string;
  };
  type ViewResult = {
    page: PageResult; markers: Array<{x:number;y:number;count:number}>;
    terrainStatus: string | null; terrainRows?: number[][] | null;
  };

  let worker: Worker | null = null;
  let requestId = 0;
  let loading = false;
  let errorMessage = '';
  let infoMessage = '';
  let version = '';
  let platform = '';
  let integrity = '';
  let manifestFilesVerified = 0;
  let layouts: LayoutOption[] = [];
  let regions: RegionCoverage[] = [];
  let selectedRegion = '';
  let selectedViewKey = '';
  let selectedGridId = '';
  let x = 0; let y = 0; let width = 16; let height = 16;
  let offset = 0;
  let displayedAnchors: Anchor[] = [];
  let viewing = false;
  let viewport: ViewResult | null = null;
  let selectedCell: {x:number;y:number} | null = null;
  let fileInput: HTMLInputElement | null = null;
  let terrainPanel:HTMLDivElement|null=null;
  let terrainLinkNotice='';
  let anchorItemSearch='';
  let anchorFindResult:OriginalItemAnchorFindResult|null=null;
  let anchorFindMessage='';
  let findingAnchor=false;
  let globalItemSearch='';
  let globalFindResult:GlobalOriginalItemAnchorResult|null=null;
  let globalFindMessage='';
  let findingGlobal=false;

  $: regionKeys = [...new Set(layouts.map(a => a.regionKey))].sort();
  $: filteredLayouts = selectedRegion
    ? layouts.filter(a => a.regionKey === selectedRegion) : layouts;
  $: selectedRegionCoverage = regions.find(a => a.regionKey === selectedRegion);
  $: selectedLayout = layouts.find(a => a.viewKey === selectedViewKey);
  $: gridOptions = selectedLayout?.grids ?? [];
  $: selectedGrid = gridOptions.find(a => String(a.gridIdNative) === selectedGridId);
  $: markersByCell = new Map((viewport?.markers ?? []).map(a => [`${a.x}:${a.y}`, a.count]));
  $: cells = viewport?.page?.rect && viewport.page.status === 'source_native_default_layout_anchors_only'
    ? Array.from({length:viewport.page.rect.width * viewport.page.rect.height}, (_, index) => {
        const rect = viewport!.page.rect!;
        const cx = rect.x + index % rect.width;
        const cy = rect.y + Math.floor(index / rect.width);
        const value = viewport?.terrainRows?.[Math.floor(index / rect.width)]?.[index % rect.width];
        return {x:cx,y:cy,count:markersByCell.get(`${cx}:${cy}`) ?? 0,
          nativeFloorValue:value};
      }) : [];
  $: selectedPointCount = selectedCell
    ? markersByCell.get(`${selectedCell.x}:${selectedCell.y}`) ?? 0 : 0;
  $: selectedFloorValue = selectedCell
    ? cells.find(c => c.x === selectedCell?.x && c.y === selectedCell?.y)?.nativeFloorValue
    : undefined;

  // Deterministic source-value palette for inspection, NOT gameplay terrain
  // colors, collision status, occupancy or object placement permission.
  function floorTint(nativeValue: number | undefined): string | undefined {
    if (!Number.isSafeInteger(nativeValue) || nativeValue === undefined) return undefined;
    if (nativeValue === 0) return '#34313f';
    // Native GridFloorType flag names only. These are illustrative UI
    // colors and never implement traversal, water access or item permission.
    if ((nativeValue & 512) !== 0) return '#346d96'; // Water
    if ((nativeValue & 256) !== 0) return '#397d79'; // Shore
    if ((nativeValue & 4) !== 0) return '#53865a'; // Meadow
    if ((nativeValue & 2048) !== 0) return '#7f697f'; // Wall
    if ((nativeValue & 1024) !== 0) return '#706b7a'; // Floor
    const hue = (Math.imul(nativeValue, 2654435761) >>> 0) % 360;
    return `hsl(${hue} 29% 39%)`;
  }

  function stop() {
    requestId++;
    worker?.terminate();
    worker = null;
    loading = false;
    viewing = false;
    findingAnchor=false;
    findingGlobal=false;
  }
  function resetGlobalFind(clearInput=true){
    globalFindResult=null;
    globalFindMessage='';
    findingGlobal=false;
    if(clearInput)globalItemSearch='';
  }
  function findGlobalOriginalItem(matchIndex=0){
    const input=globalItemSearch.trim();
    if(!/^[1-9][0-9]{0,15}$/.test(input)||
       !Number.isSafeInteger(Number(input))){
      globalFindResult=null;
      globalFindMessage='原本Item IDは正の整数で入力してください。';
      return;
    }
    if(!worker||!version){
      globalFindMessage='先に原本ZIPを読み込んでください。';
      globalFindResult=null;
      return;
    }
    findingGlobal=true;
    globalFindMessage='';
    const id=++requestId;
    worker.postMessage({command:'find-global-anchor',requestId:id,
      itemId:Number(input),matchIndex});
  }
  function stepGlobalOriginalItem(direction:-1|1){
    const result=globalFindResult;
    if(result?.status!=='found'||result.matchedIndex===null||
       result.matchingOriginalDefaultObjectCount<2)return;
    const count=result.matchingOriginalDefaultObjectCount;
    findGlobalOriginalItem((result.matchedIndex+direction+count)%count);
  }
  function resetAnchorFind(clearInput=true) {
    anchorFindResult=null;
    anchorFindMessage='';
    findingAnchor=false;
    if(clearInput)anchorItemSearch='';
  }
  function findNativeItemAnchor(matchIndex=0){
    const selected=layouts.find(row=>row.viewKey===selectedViewKey);
    const grid=selected?.grids.find(row=>
      String(row.gridIdNative)===selectedGridId);
    const query=anchorItemSearch.trim();
    if(!/^[1-9][0-9]{0,15}$/.test(query)||
       !Number.isSafeInteger(Number(query))){
      anchorFindMessage='原本Item IDは正の整数で入力してください。';
      anchorFindResult=null;
      return;
    }
    if(!worker||!selected||!grid||!grid.knownGridData){
      anchorFindMessage='このGridの原本データが読み込まれていません。';
      anchorFindResult=null;
      return;
    }
    findingAnchor=true;
    anchorFindMessage='';
    const id=++requestId;
    worker.postMessage({
      command:'find-anchor',requestId:id,
      viewKey:selected.viewKey,gridIdNative:grid.gridIdNative,
      itemId:Number(query),matchIndex
    });
  }
  function findNextNativeItemAnchor(){
    const match=anchorFindResult;
    if(match?.status!=='found'||match.matchingOriginalDefaultObjectCount<=1||
      match.matchedIndex===null)return;
    findNativeItemAnchor((match.matchedIndex+1)%
      match.matchingOriginalDefaultObjectCount);
  }
  function clearAll() {
    stop();
    version = '';
    platform = '';
    layouts = [];
    regions = [];
    selectedRegion = '';
    selectedViewKey = '';
    selectedGridId = '';
    viewport = null;
    displayedAnchors = [];
    selectedCell = null;
    integrity = '';
    manifestFilesVerified = 0;
    errorMessage = '';
    infoMessage = 'ブラウザ内のWorldデータを破棄しました。';
    terrainLinkNotice='';
    resetAnchorFind();
    resetGlobalFind();
    if (fileInput) fileInput.value = '';
  }
  onDestroy(stop);

  function requestWindow(reset = true) {
    // Resolve against current selections synchronously: Svelte's reactive
    // derived variables may not update until after an event handler returns.
    const chosen = layouts.find(a => a.viewKey === selectedViewKey)?.grids
      .find(g => String(g.gridIdNative) === selectedGridId);
    if (!worker || !chosen || !chosen.knownGridData ||
        !Number.isSafeInteger(chosen.anchorSizeX) ||
        !Number.isSafeInteger(chosen.anchorSizeY) ||
        chosen.anchorSizeX! < 1 || chosen.anchorSizeY! < 1) {
      viewport = null;
      displayedAnchors = [];
      return;
    }
    if (chosen.anchorDomainStatus === 'tessellation_coordinate_relation_unverified') {
      viewport = null;
      displayedAnchors = [];
      errorMessage = 'この原本バージョン・係数の初期配置座標範囲は未検証です。';
      return;
    }
    const sx = chosen.anchorSizeX!, sy = chosen.anchorSizeY!;
    x = Math.min(Math.max(0, Number.isSafeInteger(x) ? x : 0), sx - 1);
    y = Math.min(Math.max(0, Number.isSafeInteger(y) ? y : 0), sy - 1);
    width = Math.min(Math.max(1, Number.isSafeInteger(width) ? width : 16), 32, sx - x);
    height = Math.min(Math.max(1, Number.isSafeInteger(height) ? height : 16), 32, sy - y);
    if (reset){offset = 0;displayedAnchors = [];selectedCell = null;}
    viewing = true;
    errorMessage = '';
    const id = ++requestId;
    worker.postMessage({
      command:'view', requestId:id,
      viewKey:selectedViewKey, gridIdNative:chosen.gridIdNative,
      rect:{x,y,width,height}, offset,
    });
  }
  async function navigateToOriginalTerrain(selection:SourceGridNavigationRequest){
    // These source ZIPs are independently loaded and self-consistent only.
    // Match the exact original layout + Grid.ID + GridDataPath; no saved
    // Grid ID, player position or placement legality is inferred.
    const resolved=matchSourceGridToLocalTerrain(selection,{
      gameVersion:version||null,platform:platform||null,layouts
    });
    if(resolved.status!=='ready'||!resolved.viewKey||
      resolved.nativeGridId===null){
      terrainLinkNotice=resolved.status==='zip_not_loaded'
        ? '先に下の「非公開DB-04 ZIP」を開いてください。'
        : resolved.status==='source_version_mismatch'
        ? '原本参照グラフと地形ZIPのバージョンが一致しません。'
        : resolved.status==='ambiguous_terrain_view'
        ? '一致する原本地形ビューが複数あるため、自動選択できません。'
        : 'この部分的な地形ZIPには該当するGridが収録されていません。';
      return;
    }
    terrainLinkNotice='';
    const view=layouts.find(row=>row.viewKey===resolved.viewKey);
    if(!view)return;
    selectedRegion=view.regionKey;
    selectedViewKey=view.viewKey;
    selectedGridId=String(resolved.nativeGridId);
    resetAnchorFind();
    x=0;y=0;width=16;height=16;
    viewport=null;
    requestWindow();
    await tick();
    terrainPanel?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function changeRegion() {
    const first = layouts.find(a => !selectedRegion || a.regionKey === selectedRegion);
    selectedViewKey = first?.viewKey ?? '';
    changeLayout();
  }
  function changeLayout() {
    resetAnchorFind();
    resetGlobalFind();
    const grids = layouts.find(a => a.viewKey === selectedViewKey)?.grids ?? [];
    selectedGridId = grids.length ? String(grids[0].gridIdNative) : '';
    x = 0; y = 0; width = 16; height = 16;
    viewport = null;
    requestWindow();
  }
  function changeGrid() {
    resetAnchorFind();
    resetGlobalFind();
    x = 0; y = 0; width = 16; height = 16;
    viewport = null;
    requestWindow();
  }
  function appendNextPage() {
    const next=viewport?.page.nextOffset;
    if(viewing||!viewport?.page.hasNextPage||typeof next!=='number'||!Number.isSafeInteger(next)||next<=offset)return;
    offset=next;
    requestWindow(false);
  }
  async function readZip(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    stop();
    layouts = [];
    regions = [];
    selectedRegion = '';
    viewport = null;
    displayedAnchors = [];
    version = '';
    errorMessage = '';
    infoMessage = '';
    terrainLinkNotice='';
    resetAnchorFind();
    resetGlobalFind();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip') ||
        file.size < 22 || file.size > 96 * 1024 * 1024) {
      errorMessage = 'DB-04の非公開スナップショットZIP（96 MiB以下）を選択してください。';
      input.value = '';
      return;
    }
    loading = true;
    const id = ++requestId;
    const owned = new Worker(
      new URL('../../../lib/world/world-preview.worker.ts', import.meta.url),
      { type:'module' });
    worker = owned;
    owned.onmessage = (message:MessageEvent) => {
      if (owned !== worker || message.data?.requestId !== requestId) return;
      const result = message.data;
      if (result.kind === 'error') {
        errorMessage = String(result.message || 'Worldデータの読込に失敗しました。');
        loading = false;
        viewing = false;
        findingAnchor=false;
        findingGlobal=false;
        return;
      }
      if (result.kind === 'loaded') {
        loading = false;
        version = String(result.gameVersion);
        platform = String(result.platform);
        integrity = String(result.integrity);
        manifestFilesVerified = Number(result.manifestFilesVerified);
        layouts = result.layouts as LayoutOption[];
        regions = Array.isArray(result.regionCoverage)
          ? result.regionCoverage as RegionCoverage[] : [];
        selectedRegion = '';
        selectedViewKey = layouts[0]?.viewKey ?? '';
        selectedGridId = layouts[0]?.grids[0] ?
          String(layouts[0].grids[0].gridIdNative) : '';
        infoMessage = 'ローカルZIP内のマニフェスト整合性を確認しました。原本の真正性までは証明していません。';
        if (selectedGridId) requestWindow();
        return;
      }
      if (result.kind==='global-anchor-found'){
        findingGlobal=false;
        const match=result.result as GlobalOriginalItemAnchorResult;
        if(match.contract!=='wand.db04.global-original-item-anchor-finder@1'||
          match.itemId!==Number(globalItemSearch.trim())){
          globalFindResult=null;
          globalFindMessage='原本検索結果と入力値が一致しません。';
          return;
        }
        globalFindResult=match;
        if(match.status==='found'&&match.sourceLayoutId&&
           match.nativeGridId!==null&&match.gridDataPath&&
           match.sourceAnchorX!==null&&match.sourceAnchorY!==null){
          const candidates=layouts.filter(view=>
            view.kind==='gridCollection'&&
            view.layoutId===match.sourceLayoutId&&
            view.grids.some(grid=>grid.gridIdNative===match.nativeGridId&&
              grid.gridDataPath===match.gridDataPath&&grid.knownGridData));
          if(candidates.length!==1){
            globalFindMessage='原本参照に一致する地形ビューが一意に特定できません。';
            return;
          }
          const view=candidates[0];
          const grid=view.grids.find(grid=>
            grid.gridIdNative===match.nativeGridId&&
            grid.gridDataPath===match.gridDataPath)!;
          if(!grid.anchorSizeX||!grid.anchorSizeY){
            globalFindMessage='この原本Gridの座標範囲は未検証です。';
            return;
          }
          selectedRegion=view.regionKey;
          selectedViewKey=view.viewKey;
          selectedGridId=String(grid.gridIdNative);
          resetAnchorFind();
          const cx=match.sourceAnchorX,cy=match.sourceAnchorY;
          x=Math.max(0,Math.min(grid.anchorSizeX-1,cx-Math.floor(width/2)));
          y=Math.max(0,Math.min(grid.anchorSizeY-1,cy-Math.floor(height/2)));
          viewport=null;
          globalFindMessage='原本初期配置 '+String(match.matchedIndex!+1)+
            ' / '+String(match.matchingOriginalDefaultObjectCount)+
            '件 · GridObject '+String(match.gridObjectIdNative)+
            ' · ('+cx+', '+cy+')。'+
            (match.unverifiedOriginalDefaultObjectCount>0
              ?'他に座標未検証の原本記録'+match.unverifiedOriginalDefaultObjectCount+'件。':'');
          requestWindow();
          selectedCell={x:cx,y:cy};
          void tick().then(()=>terrainPanel?.scrollIntoView({
            behavior:'smooth',block:'start'}));
        }else{
          globalFindMessage=match.status==='not_in_partial_original_source'
            ?'この部分的な原本ZIPに指定Item IDの初期配置はありません。'
            :match.status==='source_game_version_unverified'
            ?'このゲームバージョン・プラットフォームの原本座標は未検証です。'
            :match.status==='source_anchor_domain_unverified'
            ?'該当する原本Gridの座標範囲は未検証です。'
            :'この番号の原本初期配置候補はありません。';
        }
        return;
      }
      if (result.kind==='anchor-found') {
        findingAnchor=false;
        const found=result.result as OriginalItemAnchorFindResult;
        if(found.contract!=='wand.db04.native-item-anchor-finder@1'||
          found.sourceLayoutId!==layouts.find(row=>
            row.viewKey===selectedViewKey)?.layoutId||
          String(found.nativeGridId)!==selectedGridId||
          found.itemId!==Number(anchorItemSearch.trim())){
          anchorFindResult=null;
          anchorFindMessage='原本検索結果が現在の選択と一致しません。';
          return;
        }
        anchorFindResult=found;
        if(found.status==='found'&&
          typeof found.sourceAnchorX==='number'&&
          typeof found.sourceAnchorY==='number'){
          const chosen=layouts.find(row=>row.viewKey===selectedViewKey)
            ?.grids.find(row=>String(row.gridIdNative)===selectedGridId);
          if(!chosen||!chosen.anchorSizeX||!chosen.anchorSizeY)return;
          const cx=found.sourceAnchorX,cy=found.sourceAnchorY;
          x=Math.max(0,Math.min(chosen.anchorSizeX-1,
            cx-Math.floor(width/2)));
          y=Math.max(0,Math.min(chosen.anchorSizeY-1,
            cy-Math.floor(height/2)));
          anchorFindMessage='原本初期配置 '+String(found.matchedIndex!+1)+
            ' / '+String(found.matchingOriginalDefaultObjectCount)+
            '件。Gridローカル座標（'+cx+', '+cy+'）を表示します。';
          requestWindow();
          selectedCell={x:cx,y:cy};
        }else{
          anchorFindMessage=found.status==='not_in_source_grid'
            ? 'この部分的な原本Gridには、指定Item IDの初期配置はありません。'
            : found.status==='source_game_version_unverified'
            ? 'このゲームバージョンの原本アンカー検索は未検証です。'
            : found.status==='original_anchor_domain_unverified'
            ? 'このGridの原本アンカー座標範囲は未検証です。'
            : found.status==='original_grid_not_in_source'
            ? 'このGridはローカル原本ZIPに収録されていません。'
            : '指定番号の原本初期配置候補はありません。';
        }
        return;
      }
      if (result.kind === 'view') {
        viewing = false;
        if(result.page?.status==='source_native_default_layout_anchors_only'){
          const nextRecords=Array.isArray(result.page.defaultObjectAnchors)?result.page.defaultObjectAnchors as Anchor[]:[];
          displayedAnchors=offset===0?nextRecords:[...displayedAnchors,...nextRecords];
        }
        viewport = {
          page:result.page, markers:result.markers,
          terrainStatus:result.terrainStatus, terrainRows:result.terrainRows,
        };
      }
    };
    owned.onerror = (error) => {
      error.preventDefault();
      if (owned !== worker) return;
      errorMessage = '専用WorkerでWorldデータを読み込めませんでした。';
      loading = false;
      viewing = false;
    };
    owned.onmessageerror = () => {
      if (owned !== worker) return;
      errorMessage = 'Worldデータの応答を読み取れませんでした。';
      loading = false;
      viewing = false;
    };
    owned.postMessage({command:'load', requestId:id, file});
    input.value = '';
  }
</script>

<svelte:head>
  <title>World Source Preview（開発用） | Dreamwish Wand</title>
  <meta name="robots" content="noindex, nofollow" />
  <meta name="description" content="Private DB-04 world-source ZIP preview, processed locally in your browser. Read-only original default anchors, not save editing." />
</svelte:head>

<section class="world-preview">
  <header>
    <p class="eyebrow">DEVELOPMENT · DB-04 WORLD</p>
    <h1>World Source Preview</h1>
    <p>元のゲームの初期配置レコードを、グリッド内のX/Y座標として確認する読み取り専用ページです。ワールド全体の配置座標、占有セル、移動可否は判定しません。</p>
  </header>

  <NativeGraphExplorer onOpenSourceGrid={navigateToOriginalTerrain} />
  {#if terrainLinkNotice}
    <p class="note" role="status">{terrainLinkNotice}</p>
  {/if}

  <div class="world-panel">
    <div class="world-toolbar">
      <label>非公開DB-04 ZIPを開く
        <input type="file" accept=".zip,application/zip"
          bind:this={fileInput} on:change={readZip} disabled={loading} />
      </label>
      <button type="button" on:click={clearAll} disabled={!worker && !version}>読み込み内容を破棄</button>
    </div>
    <p class="note">ZIPは端末内のWeb Workerで処理され、アップロード・永続保存されません。マニフェストのSHA-256一致は自己整合性の確認であり、ゲーム原本の真正性やソースの網羅性を証明しません。セーブファイルは扱いません。</p>
    {#if loading}<p role="status">ローカルZIPを検査しています…</p>{/if}
    {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
    {#if infoMessage}<p class="note" role="status">{infoMessage}</p>{/if}
  </div>

  {#if version}
    <div class="world-stats">
      <div><small>原本内の宣言バージョン</small><strong>{platform} {version}</strong></div>
      <div><small>SHA-256一致</small><strong>{manifestFilesVerified}ファイル</strong></div>
      <div><small>原本地域・RealmとAreaType参照</small><strong>{regionKeys.length}地域 · {regions.reduce((sum, entry) => sum + entry.areaReferenceCount, 0)}件</strong></div>
      <div><small>参照可能な原本ビュー</small><strong>{layouts.length}件</strong></div>
      <div><small>配置可否の検証</small><strong>未対応</strong></div>
    </div>
    {#if integrity !== 'manifest_sha256_self_consistent_not_original_source_authenticated'}
      <p class="error">未対応の検証状態です。</p>
    {/if}
    <div class="world-panel">
      <div class="anchor-find-row">
        <label>すべての原本GridからItem IDを探す
          <input type="search" inputmode="numeric"
            bind:value={globalItemSearch}
            on:input={()=>resetGlobalFind(false)}
            on:keydown={event=>{
              if(event.key==='Enter'&&!findingGlobal&&!viewing){
                event.preventDefault();
                findGlobalOriginalItem();
              }
            }}
            placeholder="原本全GridのItem ID"/>
        </label>
        <button type="button" disabled={!worker||findingGlobal||viewing}
          on:click={()=>findGlobalOriginalItem()}>
          原本全Gridを検索
        </button>
        {#if globalFindResult?.status==='found'&&
          globalFindResult.matchingOriginalDefaultObjectCount>1}
          <button type="button" disabled={findingGlobal||viewing}
            on:click={()=>stepGlobalOriginalItem(-1)}>前の候補</button>
          <button type="button" disabled={findingGlobal||viewing}
            on:click={()=>stepGlobalOriginalItem(1)}>次の候補</button>
        {/if}
      </div>
      {#if globalFindMessage}
        <p class="note" role="status">{globalFindMessage}
          原本の初期配置のみを検索しています。セーブの位置や配置可否は判定しません。</p>
      {/if}
    </div>
    <div class="world-panel" bind:this={terrainPanel}>
      <div class="selector-row">
        <label>原本地域
          <select bind:value={selectedRegion} on:change={changeRegion}>
            <option value="">すべての地域</option>
            {#each regionKeys as region}
              <option value={region}>{region}</option>
            {/each}
          </select>
        </label>
        <label>原本GridCollection / Realm / OffGrid / Village Area
          <select bind:value={selectedViewKey} on:change={changeLayout}>
            {#each filteredLayouts as layout}
              <option value={layout.viewKey}>{layout.label}</option>
            {/each}
          </select>
        </label>
        <label>Grid.IDと原本GridDataパス
          <select bind:value={selectedGridId} on:change={changeGrid}>
            {#each gridOptions as grid}
              <option value={String(grid.gridIdNative)}>
                {grid.gridIdNative} · {grid.gridDataPath} {grid.knownGridData ? '' : '（原本未収録）'}
              </option>
            {/each}
          </select>
        </label>
      </div>
      {#if selectedRegionCoverage}
        <p class="note">このZIPに含まれる原本参照：
          {#if selectedRegionCoverage.realmLayoutCount > 0}
            Realmレイアウト {selectedRegionCoverage.realmLayoutCount}件、
          {:else if selectedRegionCoverage.offGridLayoutCount > 0}
            OffGridレイアウト {selectedRegionCoverage.offGridLayoutCount}件、
          {:else}
            AreaType {selectedRegionCoverage.areaReferenceCount}件
            （対応レイアウト {selectedRegionCoverage.resolvedAreaReferenceCount}件・未収録 {selectedRegionCoverage.missingAreaLayoutReferenceCount}件）、
          {/if}
          グリッド {selectedRegionCoverage.presentNativeGridReferenceCount}/{selectedRegionCoverage.nativeGridReferenceCount}件、
          初期配置アンカー {selectedRegionCoverage.sourceDefaultAnchorCount}件。
          {#if selectedRegionCoverage.separateAreaReferenceCount > 0}
            別地域への原本参照 {selectedRegionCoverage.separateAreaReferenceCount}件
            （収録 {selectedRegionCoverage.resolvedSeparateAreaReferenceCount}件・未収録 {selectedRegionCoverage.missingSeparateAreaReferenceCount}件）。
          {/if}
          収録件数はゲーム全体の網羅性・配置可否を示しません。</p>
      {/if}
      {#if selectedLayout?.kind === 'villageArea'}
        <p class="note">VillageのAreaType {selectedLayout.nativeAreaTypeCode}
          （{selectedLayout.nativeAreaTypeName ?? '名前未収録'}）から
          {selectedLayout.layoutId} への原本参照を追跡しています。
          {selectedLayout.missingReferencedLayout ? '参照先レイアウトは原本ZIPに未収録です。' : ''}
          ワールド座標への変換は行いません。</p>
      {/if}
      {#if selectedGrid}
        <p class="note">選択Grid内の初期配置記録：{selectedGrid.defaultObjectCount ?? '不明'}件。
          地形データ：{selectedGrid.knownGridData ? '原本レコードあり' : '参照先未収録'}。
          地形GridDataの寸法：{selectedGrid.sizeX ?? '?'} × {selectedGrid.sizeY ?? '?'}。
          {#if selectedGrid.anchorDomainStatus === 'steam1262_original_factor_two_anchor_envelope'}
            原本GridのTessellationFactor：{selectedGrid.tessellationFactor}。
            原本アンカーX/Yの観測上の範囲：
            {selectedGrid.anchorSizeX} × {selectedGrid.anchorSizeY}。
            地形とアンカーの座標変換は未検証です。
          {/if}
        </p>
        <div class="anchor-find-row">
          <label>原本Item ID
            <input type="search" inputmode="numeric"
              bind:value={anchorItemSearch}
              on:input={()=>resetAnchorFind(false)}
              placeholder="原本初期配置のItem ID"/>
          </label>
          <button type="button" on:click={()=>findNativeItemAnchor()}
            disabled={!worker||findingAnchor||viewing||!selectedGrid.knownGridData}>
            原本初期配置を探す
          </button>
          {#if anchorFindResult?.status==='found'&&
            anchorFindResult.matchingOriginalDefaultObjectCount>1}
            <button type="button" on:click={findNextNativeItemAnchor}
              disabled={findingAnchor||viewing}>次の一致</button>
          {/if}
        </div>
        {#if anchorFindMessage}
          <p class="note" role="status">{anchorFindMessage}
            検索位置はセーブの座標・配置可否を意味しません。</p>
        {/if}
        <div class="coord-row">
          <label>X <input type="number" min="0" bind:value={x} /></label>
          <label>Y <input type="number" min="0" bind:value={y} /></label>
          <label>幅 <input type="number" min="1" max="32" bind:value={width} /></label>
          <label>高さ <input type="number" min="1" max="32" bind:value={height} /></label>
          <button type="button" on:click={() => requestWindow()} disabled={viewing}>表示範囲を更新</button>
        </div>
      {/if}
    </div>

    {#if viewing}<p class="note" role="status">グリッドの原本座標を集計しています…</p>{/if}
    {#if viewport?.page.status === 'source_native_default_layout_anchors_only'}
      <div class="world-panel">
        <div class="view-head">
          <h2>初期配置アンカーの座標</h2>
          <span>{viewport.page.matchingNativeDefaultAnchorCount ?? 0}件（表示範囲内）</span>
        </div>
        <p class="note">
          点と数字は原本に記録された初期配置のX/Yアンカー件数です。オブジェクトが占有する範囲ではありません。
          地形：{viewport.terrainStatus === 'source_corroborated_grid_local_preview'
            ? `Steam v${version} 原本グリッドローカル値（配置可否は未検証）`
            : viewport.terrainStatus === 'native_terrain_not_projected_to_source_anchor_coordinates'
              ? '初期配置アンカーと地形セルの座標対応が未検証のため、地形は重ねていません'
              : '未検証・表示不可'}。
          {#if viewport.terrainStatus === 'source_corroborated_grid_local_preview'}
            セルの色は原本のマスク値を識別するための便宜的な色です。
          {/if}
        </p>
        <div class="map-scroll">
          <div class="grid-view" style={'grid-template-columns: repeat(' + width + ', 24px)'}>
            {#each cells as cell (`${cell.x}:${cell.y}`)}
              <button type="button" class:has-anchor={cell.count > 0}
                class:current={selectedCell?.x === cell.x && selectedCell?.y === cell.y}
                style:background-color={floorTint(cell.nativeFloorValue)}
                on:click={() => selectedCell = {x:cell.x,y:cell.y}}
                title={`Grid local (${cell.x},${cell.y}); source anchors: ${cell.count}; native floor mask: ${cell.nativeFloorValue ?? 'unverified'}`}
                aria-label={`座標${cell.x},${cell.y}：アンカー${cell.count}件`}>
                {cell.count > 0 ? Math.min(cell.count, 99) : ''}
              </button>
            {/each}
          </div>
        </div>
        {#if selectedCell}
          <p class="note">座標（{selectedCell.x}, {selectedCell.y}）の初期配置アンカー：{selectedPointCount}件。
            地形マスク：{selectedFloorValue ?? '未検証'}。
            ページ一覧に全件が含まれるとは限りません。</p>
        {/if}
      </div>

      <div class="world-panel">
        <div class="view-head"><h2>原本の初期配置レコード</h2><span>{displayedAnchors.length.toLocaleString()}件表示</span></div>
        <p class="note">この一覧は現在のセーブや編集対象ではありません。レコードIDと原本X/Y、向きを参照できます。</p>
        <div class="record-list">
          {#each displayedAnchors as record (record.layoutObjectId)}
            <div class="record">
              <strong>Item {record.itemId}</strong>
              <span>GridObject {record.gridObjectIdNative}</span>
              <span>X {record.x} · Y {record.y}</span>
              <span>Orientation {record.orientationCode} {record.orientationName ?? ''}</span>
            </div>
          {/each}
          {#if displayedAnchors.length === 0}
            <p class="note">この範囲・ページに初期配置アンカーの記録はありません。占有セルが存在しないという意味ではありません。</p>
          {/if}
        </div>
        {#if viewport.page.hasNextPage}
          <div class="paging auto-sentinel" use:autoAppend={{hasMore:()=>Boolean(viewport?.page.hasNextPage)&&!viewing&&!errorMessage&&typeof viewport?.page.nextOffset==='number'&&viewport.page.nextOffset>offset,load:appendNextPage}}
            role="status" aria-label="スクロールで初期配置レコードを追加表示"></div>
        {/if}
      </div>
    {:else if viewport}
      <div class="world-panel error">このレイアウトは部分的な原本データです：{viewport.page.status}</div>
    {/if}
  {/if}
</section>

<style>
  .world-preview { width:min(1180px,100%); margin:0 auto; padding:48px clamp(18px,4vw,56px) 76px; }
  header h1 {font-size:clamp(30px,5vw,50px);letter-spacing:-.05em;margin:10px 0;}
  header p:not(.eyebrow) {max-width:820px;color:#aea0c0;line-height:1.8;font-size:14px;}
  .world-panel {margin:20px 0;padding:22px;background:#1c1728;border:1px solid #ffffff22;border-radius:15px;}
  .world-toolbar,.selector-row,.coord-row,.anchor-find-row,.view-head,.paging {display:flex;align-items:end;gap:14px;flex-wrap:wrap;}
  .anchor-find-row {margin-top:14px;}
  .anchor-find-row label {flex:1 1 220px;min-width:0;}
  .anchor-find-row input[type=search] {background:#292039;color:#eee7f6;border:1px solid #ffffff31;border-radius:8px;padding:9px 10px;max-width:100%;width:100%;font:inherit;}
  .world-toolbar {justify-content:space-between;}
  .world-toolbar label {flex:1 1 240px;min-width:0;max-width:100%;}
  .world-toolbar input[type=file] {display:block;width:100%;min-width:0;max-width:100%;}
  .selector-row {align-items:stretch;}
  .selector-row label {flex:1;min-width:200px;}
  label {display:grid;gap:9px;color:#d7c7e8;font-size:12px;}
  select,input[type=number],input[type=file] {background:#292039;color:#eee7f6;border:1px solid #ffffff31;border-radius:8px;padding:9px 10px;max-width:100%;font:inherit;}
  select {width:100%;min-width:0;}
  input[type=number] {width:75px;}
  button {border-radius:8px;background:#403254;border:1px solid #ffffff24;padding:9px 12px;color:#eaddf6;font:inherit;font-size:12px;}
  button:not(:disabled):hover {background:#55406e;}
  .world-stats {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:20px;}
  .world-stats div {border-radius:12px;padding:15px;background:#241b31;display:grid;gap:8px;}
  .world-stats small {font-size:11px;color:#a999bb;}
  .world-stats strong {font-size:14px;}
  .note {font-size:12px;color:#b8aac8;line-height:1.8;margin:12px 0 0;}
  .error {font-size:13px;color:#ffbbba;line-height:1.8;}
  .view-head {align-items:center;justify-content:space-between;}
  .view-head h2 {font-size:17px;margin:0;}
  .view-head span {font-size:12px;color:#a99bb8;}
  .map-scroll {overflow:auto;max-width:100%;margin-top:20px;padding-bottom:10px;}
  .grid-view {display:grid;gap:2px;width:max-content;border:1px solid #ffffff24;padding:4px;background:#16121f;}
  .grid-view button {height:24px;width:24px;padding:0;border:1px solid #ffffff10;border-radius:2px;background:#2d2837;color:#e8dafa;font-size:9px;line-height:1;}
  .grid-view button.has-anchor {color:white;border:2px solid #ecd1ff;box-shadow:inset 0 0 0 1px #2a2134;font-weight:700;}
  .grid-view button.current {outline:2px solid #fff;outline-offset:1px;}
  .record-list {display:grid;gap:6px;margin-top:14px;}
  .record {display:grid;grid-template-columns:minmax(115px,1fr) repeat(3,minmax(95px,1fr));gap:12px;padding:12px 10px;background:#ffffff08;border-radius:7px;font-size:12px;overflow-wrap:anywhere;}
  .record span {color:#bbaacb;}
  .paging {justify-content:space-between;margin-top:18px;}
  @media(max-width:700px){
    .world-stats {grid-template-columns:repeat(2,minmax(0,1fr));}
    .record {grid-template-columns:repeat(2,minmax(0,1fr));}
  }
</style>
