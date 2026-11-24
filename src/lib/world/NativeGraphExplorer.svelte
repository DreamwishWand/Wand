<script lang="ts">
  import {onDestroy} from 'svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import SaveGridPathAudit from './SaveGridPathAudit.svelte';
  import type {SourceGridNavigationRequest} from './native-grid-navigation.ts';

  export let onOpenSourceGrid:((selection:SourceGridNavigationRequest)=>void)|undefined=undefined;
  import type {
    Db04GraphBrowserCatalog, Db04GraphBrowserPage,
    Db04GraphScope, Db04GraphOption
  } from './native-graph-browser.ts';

  let worker:Worker|null=null;
  let requestId=0;
  let fileInput:HTMLInputElement|null=null;
  let loading=false;
  let searching=false;
  let errorMessage='';
  let catalog:Db04GraphBrowserCatalog|null=null;
  let verifiedGraphFile:File|null=null;
  let page:Db04GraphBrowserPage|null=null;
  let scope:Db04GraphScope='world';
  let scopeId='';
  let gridSearch='';
  let exactItemId='';
  let pageOffset=0;
  let relatedGridRef='';
  let relatedSourceGrids:readonly Db04GraphOption[]=[];
  let unlinkedGridSearch='';
  let unlinkedSourceGrids:readonly Db04GraphOption[]=[];
  let unlinkedGridMatches:readonly Db04GraphOption[]=[];

  $: filteredGrids=(catalog?.sourceGrids??[])
    .filter(g=>gridSearch===''||
      g.label.toLocaleLowerCase().includes(gridSearch.toLocaleLowerCase())||
      g.id.toLocaleLowerCase().includes(gridSearch.toLocaleLowerCase())||
      g.gridDataPath?.toLocaleLowerCase().includes(
        gridSearch.toLocaleLowerCase()))
    .slice(0,300);
  $: exactGridPathCandidates=scope==='grid'&&
    gridSearch.trim().startsWith('GridData/')?
    (catalog?.sourceGrids??[]).filter(g=>
      g.gridDataPath===gridSearch.trim()):[];
  let options:readonly Db04GraphOption[]=[];
  $: options=scope==='world'?
    catalog?.sourceWorlds??[]:scope==='area'?
    catalog?.sourceAreas??[]:scope==='grid'?filteredGrids:[];
  $: activeOption=options.find(option=>option.id===scopeId);
  // Only source-exact World/Area → Grid references. An empty Grid is still
  // browseable, even when no original default GridObject row exists.
  // Do not infer membership through path names or Realm descendants.
  $: unlinkedSourceGrids=(catalog?.sourceGrids??[])
    .filter(grid=>grid.worldId===null);
  $: unlinkedGridMatches=scope==='unlinked_world'
    ? unlinkedSourceGrids.filter(grid=>{
        const needle=unlinkedGridSearch.trim().toLocaleLowerCase();
        return needle===''||
          grid.id.toLocaleLowerCase().includes(needle)||
          grid.layoutId.toLocaleLowerCase().includes(needle)||
          grid.gridDataPath?.toLocaleLowerCase().includes(needle);
      })
    : [];
  $: relatedSourceGrids=scope==='unlinked_world'
    ? unlinkedGridMatches.slice(0,300)
    : activeOption&&(scope==='world'||scope==='area')
      ? (catalog?.sourceGrids??[]).filter(grid=>
          scope==='world'?grid.worldId===activeOption.id:
            grid.areaRefId===activeOption.id)
      : [];
  $: if(!relatedSourceGrids.some(grid=>grid.id===relatedGridRef))
    relatedGridRef=relatedSourceGrids[0]?.id??'';
  $: canQuery=catalog!==null&&(scope==='unlinked_world'||Boolean(scopeId));

  function stop(){
    requestId++;
    worker?.terminate();
    worker=null;
    searching=false;
    loading=false;
  }
  function clear(){
    stop();
    catalog=null;page=null;
    verifiedGraphFile=null;
    scope='world';scopeId='';
    gridSearch='';unlinkedGridSearch='';exactItemId='';pageOffset=0;
    errorMessage='';
    if(fileInput)fileInput.value='';
  }
  onDestroy(stop);

  function query(offset=0){
    // A 'loaded' Worker reply can run before Svelte's next reactive flush.
    // Evaluate the up-to-date state directly, so the first result appears.
    if(!worker||!catalog||(scope!=='unlinked_world'&&!scopeId))return;
    const chosen=exactItemId.trim();
    if(chosen!==''&&!/^[1-9][0-9]{0,19}$/.test(chosen)){
      errorMessage='Item IDは正の整数で指定してください。';
      return;
    }
    errorMessage='';
    pageOffset=offset;
    searching=true;
    const id=++requestId;
    worker.postMessage({command:'query',requestId:id,
      query:{scope,scopeId:scope==='unlinked_world'?null:scopeId,
        exactItemId:chosen,offset,limit:100}});
  }
  function chooseScope(event:Event){
    // Svelte DOM change handlers can run before bind:value flushes.
    scope=(event.currentTarget as HTMLSelectElement).value as Db04GraphScope;
    scopeId=scope==='world'?catalog?.sourceWorlds[0]?.id??'':
      scope==='area'?catalog?.sourceAreas[0]?.id??'':
      scope==='grid'?filteredGrids[0]?.id??'':'';
    page=null;pageOffset=0;
    query();
  }
  function chooseGridSearch(event:Event){
    if(scope!=='grid')return;
    // The DOM input value precedes bind:value and reactive recomputation.
    const needle=(event.currentTarget as HTMLInputElement)
      .value.toLocaleLowerCase();
    const matches=(catalog?.sourceGrids??[])
      .filter(g=>g.label.toLocaleLowerCase().includes(needle)||
        g.id.toLocaleLowerCase().includes(needle)||
        g.gridDataPath?.toLocaleLowerCase().includes(needle))
      .slice(0,300);
    if(!matches.some(g=>g.id===scopeId)){
      scopeId=matches[0]?.id??'';
      page=null;pageOffset=0;
    }
  }
  function navigateGrid(){
    if(!catalog||scope!=='grid'||!activeOption||
      activeOption.nativeGridId===null||
      activeOption.gridDataPath===null)return;
    onOpenSourceGrid?.({
      sourceGameVersion:catalog.sourceGameVersion,
      sourceWorldManifestSha256:catalog.sourceWorldManifestSha256,
      layoutId:activeOption.layoutId,
      nativeGridId:activeOption.nativeGridId,
      gridDataPath:activeOption.gridDataPath,
      sourceDefaultObjectCount:activeOption.sourceDefaultInstances??undefined
    });
  }
  // Drill down only through an exact GridRef ID already present in the
  // constructor-verified original graph. This is not a Save Grid identity,
  // World-coordinate transform, or placement authorization.
  function inspectSourceGridRef(gridRefId:string){
    const originalGrid=catalog?.sourceGrids.find(grid=>grid.id===gridRefId);
    if(!originalGrid||originalGrid.nativeGridId===null||
      originalGrid.gridDataPath===null){
      errorMessage='このGrid参照は読み込んだ部分的な原本グラフで確認できません。';
      return;
    }
    scope='grid';
    // The full native composite ID is unique even when GridDataPath is shared.
    gridSearch=originalGrid.id;
    scopeId=originalGrid.id;
    page=null;pageOffset=0;
    query();
  }
  function chooseUnlinkedGridSearch(event:Event){
    unlinkedGridSearch=(event.currentTarget as HTMLInputElement).value;
  }
  function chooseRelatedGrid(event:Event){
    relatedGridRef=(event.currentTarget as HTMLSelectElement).value;
  }
  function chooseSourceOption(event:Event){
    scopeId=(event.currentTarget as HTMLSelectElement).value;
    page=null;pageOffset=0;
    query();
  }
  async function loadFile(event:Event){
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];
    clear();
    if(!file)return;
    if(!file.name.toLowerCase().endsWith('.json')||
      file.size<1||file.size>16*1024*1024){
      errorMessage='参照グラフZIPを展開し、中のJSONファイル（16 MiB以下）を選択してください。';
      return;
    }
    loading=true;
    const owned=new Worker(
      new URL('./native-graph-preview.worker.ts',import.meta.url),
      {type:'module'});
    worker=owned;
    owned.onmessage=(event:MessageEvent)=>{
      if(owned!==worker||event.data?.requestId!==requestId)return;
      const data=event.data;
      if(data.kind==='error'){
        errorMessage='原本参照グラフを読み込めませんでした：'+
          String(data.message??'形式が不正です');
        loading=false;searching=false;
        return;
      }
      if(data.kind==='loaded'){
        loading=false;
        catalog=data.catalog as Db04GraphBrowserCatalog;
        verifiedGraphFile=file;
        scope='world';
        scopeId=catalog.sourceWorlds[0]?.id??'';
        page=null;pageOffset=0;
        query();
      }else if(data.kind==='page'){
        searching=false;
        page=data.page as Db04GraphBrowserPage;
      }
    };
    owned.onerror=()=>{
      if(owned!==worker)return;
      errorMessage='原本参照グラフのWorkerを起動できませんでした。';
      loading=false;searching=false;
    };
    owned.onmessageerror=()=>{
      if(owned!==worker)return;
      errorMessage='原本参照グラフの応答を読み取れませんでした。';
      loading=false;searching=false;
    };
    const id=++requestId;
    owned.postMessage({command:'load',requestId:id,file});
    input.value='';
  }
</script>

<section class="graph-panel" aria-label="原本ワールド参照グラフ">
  <div class="graph-top">
    <h2>原本ワールド参照</h2>
    <div class="graph-file">
      <label class="graph-pick"><WandIcon name="folder" size={17}/>
        JSONを開く
        <input type="file" accept=".json,application/json"
          bind:this={fileInput} on:change={loadFile} disabled={loading}/>
      </label>
      <button type="button" on:click={clear} disabled={!worker}
        aria-label="原本参照グラフを破棄" title="読み込み内容を破棄">
        <WandIcon name="close" size={17}/>
      </button>
    </div>
  </div>
  <p class="graph-note">非公開のDB-04参照グラフZIPを展開し、JSONを選択してください。
    原本のID・初期配置のみを端末内で検索します。購入権限、セーブ配置、配置可否は判定しません。</p>
  {#if loading}<p role="status" class="graph-note">読み込み中…</p>{/if}
  {#if errorMessage}<p role="alert" class="graph-error">{errorMessage}</p>{/if}
  {#if catalog}
    <div class="graph-controls">
      <label>参照対象
        <select bind:value={scope} on:change={chooseScope}>
          <option value="world">World（{catalog.sourceWorlds.length}）</option>
          <option value="area">Area（{catalog.sourceAreas.length}）</option>
          <option value="grid">Grid（{catalog.sourceGrids.length}）</option>
          <option value="unlinked_world">World未特定のGridObject</option>
        </select>
      </label>
      {#if scope==='grid'}
        <label>Gridを絞り込む
          <input type="search" bind:value={gridSearch}
            on:input={chooseGridSearch}
            placeholder="GridDataPath・Layoutパス・Grid ID"/>
        </label>
      {/if}
      {#if scope==='unlinked_world'}
        <label>Worldリンク未確認Gridを検索
          <input type="search" bind:value={unlinkedGridSearch}
            on:input={chooseUnlinkedGridSearch}
            placeholder="原本Layout・GridDataPath・Grid ID"/>
        </label>
      {/if}
      {#if scope!=='unlinked_world'}
        <label class="graph-select">原本ID
          <select bind:value={scopeId} on:change={chooseSourceOption}
            disabled={options.length===0}>
            {#each options as option (option.id)}
              <option value={option.id}>{option.label}</option>
            {/each}
          </select>
        </label>
      {/if}
      <label>Item ID
        <input type="search" inputmode="numeric"
          bind:value={exactItemId} placeholder="すべて"/>
      </label>
      <button type="button" class="graph-search"
        disabled={!canQuery||searching}
        on:click={()=>query()}>
        <WandIcon name="search" size={17}/>検索
      </button>
    </div>
    {#if scope==='grid'&&catalog.sourceGrids.length>300}
      <p class="graph-note">Gridは最大300候補を表示。パスで絞り込めます。</p>
    {/if}
    {#if scope==='grid'&&gridSearch.trim().startsWith('GridData/')}
      <p class="graph-note" role="status">
        {#if exactGridPathCandidates.length}
          GridDataPath完全一致：{exactGridPathCandidates.length}件の原本Grid参照候補。
          セーブの数値Grid IDや配置先との同一性は未確認です。
        {:else}
          この部分的原本レイアウト参照に、完全一致するGridDataPathはありません。
          セーブファイルが不正という意味ではありません。
        {/if}
      </p>
    {/if}
    {#if scope==='grid'&&activeOption?.nativeGridId!==null&&
      activeOption?.gridDataPath&&onOpenSourceGrid}
      <button type="button" class="graph-open-terrain"
        on:click={navigateGrid}>
        <WandIcon name="world" size={17}/>地形ビューに表示
      </button>
    {/if}
    {#if activeOption}
      <p class="graph-note source-link">
        {#if activeOption.gridDataPath}GridDataPath: {activeOption.gridDataPath}{/if}
        {#if activeOption.worldId} · World: {activeOption.worldId}{/if}
        {#if activeOption.areaRefId} · Area: {activeOption.areaRefId}{/if}
        {#if activeOption.nativeParentWorldId} · 親Realm: {activeOption.nativeParentWorldId}{/if}
        {#if activeOption.nativeUniverseTagItemId} · Universe Tag ID: {activeOption.nativeUniverseTagItemId}{/if}
      </p>
    {/if}
    {#if scope==='unlinked_world'&&unlinkedGridMatches.length>300}
      <p class="graph-note">Worldリンク未確認Grid {unlinkedGridMatches.length}件中、最初の300件を表示しています。検索で絞り込めます。</p>
    {/if}
    {#if scope==='unlinked_world'&&unlinkedGridMatches.length===0}
      <p class="graph-note">この部分的な原本参照に、一致するWorldリンク未確認Gridはありません。</p>
    {/if}
    {#if relatedSourceGrids.length>0}
      <div class="graph-related-grids">
        <label>{scope==='unlinked_world'
          ? `Worldリンク未確認の原本Grid（${unlinkedGridMatches.length}）`
          : `原本に直接紐付くGrid（${relatedSourceGrids.length}）`}
          <select aria-label="原本関連Grid" bind:value={relatedGridRef}
            on:change={chooseRelatedGrid}>
            {#each relatedSourceGrids as grid (grid.id)}
              <option value={grid.id}>
                Grid {grid.nativeGridId} · {grid.layoutId} · 初期配置 {grid.sourceDefaultInstances??'不明'}件
              </option>
            {/each}
          </select>
        </label>
        <button type="button" disabled={!relatedGridRef}
          on:click={()=>inspectSourceGridRef(relatedGridRef)}>
          <WandIcon name="world" size={17}/>Gridを開く
        </button>
      </div>
    {/if}
    {#if searching}<p role="status" class="graph-note">検索中…</p>{/if}
    {#if page}
      <div class="graph-result-head">
        <strong>原本の初期配置 {page.originalSourceReferenceRows.toLocaleString()}件
          · {page.originalSourceInstances.toLocaleString()}個</strong>
        <span>Item ID {page.distinctItemIds.toLocaleString()}種類</span>
      </div>
      {#if page.rows.length}
        <div class="graph-table-wrap">
          <table>
            <thead><tr><th>Item ID</th><th>個数</th><th>Grid</th><th>World / Area</th></tr></thead>
            <tbody>
              {#each page.rows as row,i (`${page.offset+i}:${row.gridRefId}:${row.itemId}`)}
                <tr>
                  <td>{row.itemId}</td>
                  <td>{row.sourceDefaultInstances}</td>
                  <td class="graph-path">
                    <button type="button" class="graph-grid-link"
                      aria-label={`原本Grid ${row.gridRefId}を表示`}
                      on:click={()=>inspectSourceGridRef(row.gridRefId)}>
                      <WandIcon name="world" size={14}/>{row.gridRefId}
                    </button>
                  </td>
                  <td class="graph-path">{row.sourceWorldId??'未特定'}
                    {#if row.sourceAreaRefId}<small>{row.sourceAreaRefId}</small>{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="graph-note">この条件の初期配置レコードはありません。</p>
      {/if}
      <div class="graph-paging">
        <span>{page.rows.length? page.offset+1:0}–{page.offset+page.rows.length}
          / {page.originalSourceReferenceRows.toLocaleString()}</span>
        <button type="button" disabled={searching||page.offset===0}
          on:click={()=>query(Math.max(0,pageOffset-100))}>前へ</button>
        <button type="button" disabled={searching||!page.hasNextPage}
          on:click={()=>{if(typeof page?.nextOffset==='number')query(page.nextOffset);}}>
          次へ
        </button>
      </div>
    {/if}
    {#if verifiedGraphFile}
      <SaveGridPathAudit originalGraphFile={verifiedGraphFile}/>
    {/if}
    <p class="graph-note">Steam {catalog.sourceGameVersion} · 部分的な原本参照です。
      JSONの自己整合性は検査しますが、配布者の真正性は証明しません。
      データはアップロード・永続保存されません。</p>
  {/if}
</section>

<style>
  .graph-panel{margin:14px 0;padding:16px;background:var(--wand-surface);border:1px solid var(--wand-subtle-line);border-radius:12px}
  .graph-top,.graph-file,.graph-controls,.graph-result-head,.graph-paging{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .graph-top,.graph-result-head{justify-content:space-between}
  h2{margin:0;font-size:16px}
  .graph-file{margin-left:auto}
  .graph-pick{display:flex;gap:7px;align-items:center;position:relative;overflow:hidden;cursor:pointer}
  .graph-pick input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}
  button,.graph-pick{background:var(--wand-control);border:1px solid var(--wand-subtle-line);border-radius:8px;padding:8px 11px;color:var(--wand-text);font:inherit;font-size:12px}
  button{display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
  button:disabled{opacity:.55;cursor:default}
  .graph-note{color:var(--wand-muted);font-size:12px;line-height:1.6;margin:10px 0 0}
  .graph-error{font-size:12px;color:var(--wand-danger)}
  .graph-controls{align-items:end;margin-top:16px}
  .graph-controls label{display:grid;gap:5px;min-width:118px;max-width:100%;font-size:12px;color:var(--wand-text)}
  .graph-controls .graph-select{flex:1;min-width:190px}
  select,input[type=search]{box-sizing:border-box;min-width:0;max-width:100%;width:100%;padding:8px;background:var(--wand-control);color:var(--wand-text);border:1px solid var(--wand-subtle-line);border-radius:8px;font:inherit}
  .source-link{overflow-wrap:anywhere}
  .graph-search{min-height:36px}
  .graph-open-terrain{margin-top:10px}
  .graph-related-grids{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-top:10px}
  .graph-related-grids label{display:grid;gap:5px;min-width:0;
    flex:1 1 260px;color:var(--wand-text);font-size:12px}
  .graph-related-grids select{width:100%;min-width:0}
  .graph-result-head{margin-top:16px;font-size:12px;color:var(--wand-text)}
  .graph-result-head span{color:var(--wand-muted)}
  .graph-table-wrap{overflow:auto;margin-top:9px;max-height:440px}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th,td{text-align:left;vertical-align:top;padding:9px 10px;border-bottom:1px solid var(--wand-subtle-line)}
  th{position:sticky;top:0;background:var(--wand-surface-raised);color:var(--wand-text)}
  td:first-child{white-space:nowrap;font-weight:600}
  .graph-path{max-width:340px;overflow-wrap:anywhere;color:var(--wand-text)}
  .graph-grid-link{padding:0;background:transparent;border:0;max-width:100%;
    display:inline-flex;gap:5px;align-items:center;text-align:left;
    white-space:normal;overflow-wrap:anywhere;color:var(--wand-link);font-size:12px}
  .graph-grid-link:hover{text-decoration:underline}
  small{display:block;color:var(--wand-muted);font-size:11px}
  .graph-paging{justify-content:flex-end;margin-top:10px;font-size:12px}
  .graph-paging span{margin-right:auto;color:var(--wand-muted)}
  @media(max-width:680px){
    .graph-controls label{flex:1 1 100%}
    .graph-top{align-items:start}
    .graph-table-wrap{max-height:340px}
  }
</style>
