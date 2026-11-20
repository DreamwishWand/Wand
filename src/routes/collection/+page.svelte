<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { loadCollectionRuntime, decodeCollectionRecord, collectionFacetLabel } from '$lib/collection/catalog.mjs';
  import {
    createCollectionState, readCollectionState, persistCollectionState, activeWorkspace,
    addWorkspace, setActiveWorkspace, renameWorkspace, removeWorkspace, setCollectionEntry,
    exportCollectionState, importCollectionState, collectionProgress
  } from '$lib/collection/state.mjs';
  import { CATEGORY_ORDER, categoryLabel, categorySummaries, filterItems } from '$lib/collection/taxonomy.mjs';

  const languages = [
    { id:'ja', label:'日本語' }, { id:'en', label:'English' }, { id:'fr', label:'Français' },
    { id:'it', label:'Italiano' }, { id:'de', label:'Deutsch' }, { id:'es-ES', label:'Español' },
    { id:'zh-CN', label:'简体中文' }, { id:'pt-BR', label:'Português' }
  ];
  const terminology:Record<string,string> = {
    'OWNERSHIP_AND_DISCOVERY':'所有・発見', 'OWNERSHIP_STOCK_AND_DISCOVERY':'所有・所持数・発見',
    'QUANTITY_STOCK':'所持数', 'RECIPE_UNLOCK':'レシピ解放',
    'UNLOCKED_LOCKED':'解放状況', 'UNLOCK_OR_AVAILABILITY':'利用可能・解放'
  };

  let index:any = null;
  let rawRows:any[] = [];
  let loadError = '';
  let loading = true;
  let storeError = '';
  let infoMessage = '';
  let state:any = createCollectionState();
  let locale = 'ja';
  let mode:'category'|'world'|'universe' = 'category';
  let selected = '';
  let search = '';
  let status:'all'|'owned'|'missing' = 'all';
  let expansion = '';
  let filtersOpen = false;
  let visible = 72;
  let selectedItemId:number|null = null;
  let importInput:HTMLInputElement;

  $: workspace = activeWorkspace(state);
  $: entries = workspace?.entries ?? {};
  $: records = index ? rawRows.map(row => decodeCollectionRecord(index,row,locale)) : [];
  $: summaries = categorySummaries(records,entries);
  $: facets = index
    ? mode === 'category' ? summaries.map(item => ({
        id:item.id,label:categoryLabel(locale,item.id),total:item.total,tracked:item.tracked
      }))
      : (mode === 'world' ? index.w : index.u).map((id:string) => ({
        id,
        label:collectionFacetLabel(index,mode,id,locale),
        total:records.filter(record => mode==='world'?record.worlds.includes(id):record.universes.includes(id)).length,
        tracked:records.filter(record => (mode==='world'?record.worlds.includes(id):record.universes.includes(id)) && entries[String(record.itemId)]?.status).length
      }))
    : [];
  $: selectionLabel = facets.find((item:any) => item.id===selected)?.label ?? '';
  $: filtered = filterItems(records,{
    query:search,category:mode==='category'?selected:'',world:mode==='world'?selected:'',
    universe:mode==='universe'?selected:'',expansion,state:status,entries
  }).sort((a:any,b:any)=>a.label.localeCompare(b.label,locale));
  $: selectedItem = selectedItemId===null ? null : records.find((item:any)=>item.itemId===selectedItemId) ?? null;
  $: selectedEntry = selectedItem ? entries[String(selectedItem.itemId)] ?? {} : {};
  $: overall = collectionProgress(records,entries);
  $: isBrowsing = Boolean(selected || search.trim() || status!=='all' || expansion);

  onMount(async () => {
    try {
      state = readCollectionState(localStorage);
    } catch (error) {
      storeError = '保存されたCollection記録を読み取れません。上書きを防ぐため編集を停止しました。';
    }
    try {
      const runtime = await loadCollectionRuntime(base);
      index = runtime.index;
      rawRows = runtime.rows;
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
    }
  });

  function commit(next:any) {
    if (storeError) return;
    try {
      const stored = persistCollectionState(localStorage,next);
      state = stored;
      infoMessage = 'このブラウザのローカル記録を更新しました。DDVのセーブファイルは変更していません。';
    } catch (error) {
      storeError = error instanceof Error ? error.message : 'ローカル保存に失敗しました。';
    }
  }
  function changeEntry(change:Record<string,unknown>) {
    if (!selectedItem || storeError) return;
    try { commit(setCollectionEntry(state,selectedItem.itemId,change)); }
    catch (error) { infoMessage = error instanceof Error ? error.message : String(error); }
  }
  function chooseMode(next:'category'|'world'|'universe') {
    mode=next;selected='';selectedItemId=null;visible=72;
  }
  function chooseFacet(id:string) {
    selected=id;selectedItemId=null;visible=72;
  }
  function clearScope() {
    selected='';search='';status='all';expansion='';selectedItemId=null;visible=72;
  }
  function newWorkspace() {
    const name=window.prompt('新しいローカル記録の名前（最大80文字）');
    if (!name?.trim()) return;
    try { commit(addWorkspace(state,name,'local-'+crypto.randomUUID()));selectedItemId=null; }
    catch (error) { infoMessage=error instanceof Error?error.message:String(error); }
  }
  function editWorkspaceName() {
    if (!workspace) return;
    const name=window.prompt('記録の名前',workspace.name);
    if (name?.trim()) commit(renameWorkspace(state,state.active,name));
  }
  function deleteWorkspace() {
    if (state.workspaces.length<2) return;
    if (!window.confirm('現在のローカル記録を削除しますか？この操作は元に戻せません。バックアップの書き出しを推奨します。'))return;
    commit(removeWorkspace(state,state.active));
    selectedItemId=null;
  }
  function downloadBackup() {
    const text=exportCollectionState(state);
    const objectUrl=URL.createObjectURL(new Blob([text],{type:'application/json'}));
    const anchor=document.createElement('a');
    anchor.href=objectUrl;
    anchor.download='dreamwish-wand-collection-backup.json';
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),2000);
  }
  async function restoreBackup(event:Event) {
    const el=event.currentTarget as HTMLInputElement;
    const file=el.files?.[0];
    if(!file)return;
    try {
      if(file.size>10000000)throw new Error('バックアップファイルが大きすぎます。');
      const restored=importCollectionState(await file.text());
      if(!window.confirm('現在のローカル記録をすべて置き換えます。先にバックアップを保存しましたか？'))return;
      commit(restored);selectedItemId=null;clearScope();
    }catch(error){infoMessage=error instanceof Error?error.message:'読み込みに失敗しました。';}
    finally{el.value='';}
  }
  function labelWorld(id:string) { return index?collectionFacetLabel(index,'world',id,locale):id; }
  function labelUniverse(id:string) { return index?collectionFacetLabel(index,'universe',id,locale):id; }
</script>

<svelte:head>
  <title>Collection | Dreamwish Wand</title>
  <meta name="description" content="Explore DDV items by category, world and universe, with optional local collection tracking."/>
</svelte:head>

<section class="collection-page">
  <header class="collection-head">
    <div>
      <div class="eyebrow">DREAMWISH WAND / DATABASE</div>
      <h1>Collection<span class="title-star">✦</span></h1>
      <p class="subtitle">ゲーム内のアイテムを見つけ、集めたものを記録する。</p>
    </div>
    <div class="collection-head-actions">
      <label class="language-picker">表示言語
        <select bind:value={locale} aria-label="アイテム表示言語">
          {#each languages as language}<option value={language.id}>{language.label}</option>{/each}
        </select>
      </label>
      <span class="source-pill">Nintendo Switch · v1.25.0</span>
    </div>
  </header>

  {#if storeError}<div class="error-banner" role="alert">{storeError}　ブラウザのデータは削除していません。</div>{/if}
  {#if infoMessage}<div class="info-banner" role="status">{infoMessage}<button type="button" on:click={()=>infoMessage=''} aria-label="通知を閉じる">×</button></div>{/if}

  <section class="personal-bar" aria-label="Personal Collection">
    <div class="personal-left">
      <span class="personal-symbol">✧</span>
      <div><strong>My Collection</strong><span>ローカル記録 · セーブファイル未接続</span></div>
      <select aria-label="ローカル記録を選択" value={state.active} on:change={(event)=>commit(setActiveWorkspace(state,(event.currentTarget as HTMLSelectElement).value))} disabled={Boolean(storeError)}>
        {#each state.workspaces as work}<option value={work.id}>{work.name}</option>{/each}
      </select>
    </div>
    <div class="personal-actions">
      <button type="button" title="記録を追加" disabled={Boolean(storeError)||state.workspaces.length>=5} on:click={newWorkspace}>＋ 新規</button>
      <button type="button" title="名前変更" disabled={Boolean(storeError)} on:click={editWorkspaceName}>名前変更</button>
      <button type="button" title="記録削除" disabled={Boolean(storeError)||state.workspaces.length<2} on:click={deleteWorkspace}>削除</button>
      <button type="button" disabled={Boolean(storeError)} on:click={downloadBackup}>バックアップ出力</button>
      <button type="button" disabled={Boolean(storeError)} on:click={()=>importInput.click()}>復元</button>
      <input bind:this={importInput} class="visually-hidden" type="file" accept=".json,application/json" aria-label="Collectionバックアップを選択" on:change={restoreBackup}/>
    </div>
  </section>

  {#if loading}
    <div class="loading-panel" role="status">検証済みCollectionデータを読み込み中…</div>
  {:else if loadError}
    <div class="error-banner" role="alert">データの検証または読み込みに失敗しました。{loadError}</div>
  {:else}
    <div class="summary-strip">
      <div><strong>{overall.total.toLocaleString(locale)}</strong><span>参照データ</span></div>
      <div><strong>{overall.owned.toLocaleString(locale)}</strong><span>所持・解放の手動記録</span></div>
      <div><strong>{overall.missing.toLocaleString(locale)}</strong><span>未所持の手動記録</span></div>
      <div><strong>{overall.unknown.toLocaleString(locale)}</strong><span>未記録</span></div>
    </div>
    <div class="collection-workspace">
      <div class="workspace-top">
        <div class="mode-tabs" role="group" aria-label="Collectionの分類">
          <button type="button" class:active={mode==='category'} aria-pressed={mode==='category'} on:click={()=>chooseMode('category')}>Category</button>
          <button type="button" class:active={mode==='world'} aria-pressed={mode==='world'} on:click={()=>chooseMode('world')}>World</button>
          <button type="button" class:active={mode==='universe'} aria-pressed={mode==='universe'} on:click={()=>chooseMode('universe')}>Universe</button>
        </div>
        <div class="toolbar">
          <label class="search-box">
            <span aria-hidden="true">⌕</span>
            <input type="search" aria-label="8言語のアイテム名とIDで検索" bind:value={search} on:input={()=>{visible=72;selectedItemId=null;}} placeholder="アイテム名・Item IDを検索"/>
          </label>
          <button type="button" class="subtle-button" aria-expanded={filtersOpen} on:click={()=>filtersOpen=!filtersOpen}>フィルター {filtersOpen?'▴':'▾'}</button>
        </div>
      </div>
      {#if filtersOpen}
        <div class="filter-panel">
          <fieldset><legend>収集状況（手動記録）</legend>
            {#each [{id:'all',name:'すべて'},{id:'owned',name:'所持 / 解放'},{id:'missing',name:'未所持'}] as option}
              <button type="button" class:chosen={status===option.id} aria-pressed={status===option.id} on:click={()=>{status=option.id as typeof status;visible=72;}}>{option.name}</button>
            {/each}
          </fieldset>
          <label class="filter-label">追加コンテンツ
            <select bind:value={expansion} on:change={()=>visible=72}>
              <option value="">すべて</option>
              {#each index.e as id}<option value={id}>{id}</option>{/each}
            </select>
          </label>
          <button type="button" class="subtle-button" on:click={clearScope}>条件を解除</button>
        </div>
      {/if}
      <div class="workspace-body">
        <div class="collection-results">
          {#if isBrowsing}
            <div class="results-heading">
              <div class="breadcrumbs">
                <button type="button" on:click={clearScope}>{mode==='category'?'Categories':mode==='world'?'Worlds':'Universes'}</button>
                {#if selected}<span> / {selectionLabel}</span>{/if}
              </div>
              <span class="result-count">{filtered.length.toLocaleString(locale)} 件</span>
            </div>
            {#if !filtered.length}
              <div class="empty-panel">条件に一致するアイテムはありません。未記録のアイテムは「未所持」として扱いません。</div>
            {:else}
              <div class="items-grid">
                {#each filtered.slice(0,visible) as item (item.itemId)}
                  <button type="button" class="item-card" class:current={selectedItemId===item.itemId}
                    on:click={()=>selectedItemId=item.itemId} aria-pressed={selectedItemId===item.itemId}>
                    <div class="item-icon"><span aria-hidden="true">✦</span></div>
                    <div class="item-card-copy"><strong>{item.label}</strong><span>{categoryLabel(locale,item.family)}</span></div>
                    {#if entries[String(item.itemId)]?.status==='owned'}<span class="state-dot owned" aria-label="所持">●</span>
                    {:else if entries[String(item.itemId)]?.status==='missing'}<span class="state-dot missing" aria-label="未所持">○</span>{/if}
                  </button>
                {/each}
              </div>
              {#if visible<filtered.length}
                <button class="more-button" type="button" on:click={()=>visible+=72}>さらに表示（残り {(filtered.length-visible).toLocaleString(locale)} 件）</button>
              {/if}
            {/if}
          {:else}
            <div class="section-lead">
              <h2>{mode==='category'?'カテゴリから探す':mode==='world'?'ワールドから探す':'ユニバースから探す'}</h2>
              <p>カテゴリを選ぶと、登録されているアイテムを確認できます。</p>
            </div>
            <div class="facet-grid">
              {#each facets as facet (facet.id)}
                <button type="button" class="facet-card" disabled={facet.total===0} on:click={()=>chooseFacet(facet.id)}>
                  <span class="facet-flourish" aria-hidden="true">✧</span>
                  <strong>{facet.label}</strong>
                  {#if facet.total>0}
                    <span>{facet.total.toLocaleString(locale)} items</span>
                    <small>{facet.tracked} 手動記録済み</small>
                  {:else}
                    <span>参照データ未対応</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        {#if selectedItem}
          <aside class="item-inspector" aria-label="アイテム情報">
            <div class="inspector-heading"><span>ITEM DETAILS</span><button type="button" on:click={()=>selectedItemId=null} aria-label="詳細を閉じる">×</button></div>
            <div class="inspector-art" aria-hidden="true">✦</div>
            <h2>{selectedItem.label}</h2>
            <p class="inspector-meta">{categoryLabel(locale,selectedItem.family)} · #{selectedItem.itemId}</p>
            <div class="inspector-section"><h3>分類</h3>
              <dl>
                <dt>個人状態の種類</dt><dd>{terminology[selectedItem.stateSemantic]??selectedItem.stateSemantic}</dd>
                <dt>ワールド</dt><dd>{selectedItem.worlds.map(labelWorld).join('、')||'—'}</dd>
                <dt>ユニバース</dt><dd>{selectedItem.universes.map(labelUniverse).join('、')||'—'}</dd>
                <dt>追加コンテンツ</dt><dd>{selectedItem.expansions.join(', ')||'—'}</dd>
              </dl>
            </div>
            <div class="inspector-section">
              <h3>手動Collection記録</h3>
              <p class="inspector-hint">ここでの変更はローカル記録のみです。実際のDDVセーブデータには書き込みません。</p>
              <div class="ownership-actions">
                <button type="button" disabled={Boolean(storeError)} class:active={selectedEntry.status==='owned'} on:click={()=>changeEntry({status:'owned'})}>所持 / 解放</button>
                <button type="button" disabled={Boolean(storeError)} class:active={selectedEntry.status==='missing'} on:click={()=>changeEntry({status:'missing'})}>未所持</button>
                <button type="button" disabled={Boolean(storeError)} class:active={!selectedEntry.status} on:click={()=>changeEntry({status:null})}>未記録</button>
              </div>
              {#if ['QUANTITY_STOCK','OWNERSHIP_STOCK_AND_DISCOVERY'].includes(selectedItem.stateSemantic)}
                <label class="numeric-field">手動所持数
                  <input type="number" min="0" max="999999" step="1" value={selectedEntry.quantity??''}
                    disabled={Boolean(storeError)}
                    on:change={(event)=>{
                      const value=(event.currentTarget as HTMLInputElement).value;
                      changeEntry({quantity:value===''?null:Number(value)});
                    }} placeholder="未記録"/>
                </label>
              {/if}
              {#if selectedItem.stateSemantic.includes('DISCOVERY')}
                <label class="check-row"><input type="checkbox" checked={selectedEntry.discovered===true}
                  disabled={Boolean(storeError)} on:change={(event)=>changeEntry({discovered:(event.currentTarget as HTMLInputElement).checked})}/> 発見済み</label>
              {/if}
              <label class="check-row"><input type="checkbox" checked={selectedEntry.favorite===true}
                disabled={Boolean(storeError)} on:change={(event)=>changeEntry({favorite:(event.currentTarget as HTMLInputElement).checked})}/> お気に入り</label>
            </div>
          </aside>
        {:else}
          <aside class="item-inspector empty-inspector"><div class="inspector-empty-symbol">✦</div><h2>Item Details</h2><p>アイテムを選択すると、データとローカル収集状況を確認できます。</p><p class="inspector-hint">データソース：Nintendo Switch DDV v1.25.0。セーブの読み込み・書き戻し、画像表示、個別詳細ページは未接続です。</p></aside>
        {/if}
      </div>
    </div>
  {/if}
</section>
