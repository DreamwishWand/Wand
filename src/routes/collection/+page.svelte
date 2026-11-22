<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { base } from '$app/paths';
  import ItemArtwork from '$lib/collection/ItemArtwork.svelte';
  import SavedStorePreview from '$lib/collection/SavedStorePreview.svelte';
  import { CollectionRuntime, type CollectionState, type CollectionItem, type CollectionFacet, type CollectionProgress, type CollectionFilter } from '$lib/collection/runtime';
  import { collectionFamilyLabel } from '$lib/collection/copy';

  const languages = [
    { id:'ja',label:'日本語' },{ id:'en',label:'English' },{ id:'fr',label:'Français' },
    { id:'it',label:'Italiano' },{ id:'de',label:'Deutsch' },{ id:'es-ES',label:'Español' },
    { id:'zh-CN',label:'简体中文' },{ id:'pt-BR',label:'Português' }
  ];
  const terminology:Record<string,string> = {
    OWNERSHIP_AND_DISCOVERY:'所有・発見',
    OWNERSHIP_STOCK_AND_DISCOVERY:'所有・所持数・発見',
    QUANTITY_STOCK:'所持数',
    RECIPE_UNLOCK:'レシピ解放',
    UNLOCKED_LOCKED:'解放状況',
    UNLOCK_OR_AVAILABILITY:'利用可能・解放',
    UNVERIFIED:'セーブ状態未検証'
  };
  const defaultState:CollectionState={
    schema:'wand.collection.local@1',active:'local-1',
    workspaces:[{id:'local-1',name:'My Collection',entries:{}}]
  };
  let runtime:CollectionRuntime|null=null;
  let state:CollectionState=defaultState;
  let facets:CollectionFacet[]=[];
  let filtered:CollectionItem[]=[];
  let totalMatches=0;
  let overall:CollectionProgress={owned:0,missing:0,unknown:0,discovered:0,total:0};
  let loadError='';
  let loading=true;
  let storeError='';
  let infoMessage='';
  let busy=false;
  let locale='ja';
  let worldFilter='';
  let universeFilter='';
  let selected='';
  let search='';
  let status:'all'|'owned'|'missing'|'unknown'='all';
  let nameStatus:'all'|'verified'|'unverified'='all';
  let expansion='';
  let filtersOpen=false;
  let visible=72;
  let selectionMode=false;
  let selectedIds:number[]=[];
  let selectedItemId:number|null=null;
  let importInput:HTMLInputElement;
  let localCatalogInput:HTMLInputElement;
  let gameImageMap:Record<string,string>={};
  let mobileInspector=false;
  let inspectorClose:HTMLButtonElement;
  let inspectorTrigger:HTMLElement|null=null;

  $: workspace=state.workspaces.find(x=>x.id===state.active)??state.workspaces[0];
  $: entries=workspace?.entries??{};
  $: selectionLabel=facets.find(x=>x.id===selected)?.label??'';
  $: visibleItems=filtered;
  // The Rust engine owns category identity and ordering, including future
  // DB-00 additions. Do not maintain a second Svelte category registry.
  $: groupedItems=[...new Set([...facets.map(x=>x.id),...visibleItems.map(x=>x.family)])]
    .map(id=>({id,items:visibleItems.filter(x=>x.family===id)}))
    .filter(group=>group.items.length);
  $: selectedItem=selectedItemId!==null && runtime?runtime.item(selectedItemId,locale):null;
  $: selectedEntry=selectedItem?entries[String(selectedItem.itemId)]??{}:{};
  $: isBrowsing=Boolean(selected||search.trim()||status!=='all'||nameStatus!=='all'||expansion||worldFilter||universeFilter);

  function categoryLabel(lang:string,id:string):string {
    const special:Record<string,Record<string,string>>={
      ja:{Memories:'思い出','Quest Puzzles':'クエストのパズル',Exhibition:'展示','Source Activity Items':'その他のアイテム（詳細分類未確認）'},
      en:{Memories:'Memories','Quest Puzzles':'Quest Puzzles',Exhibition:'Exhibition','Source Activity Items':'Other items (unclassified)'},
      fr:{Memories:'Souvenirs','Quest Puzzles':'Énigmes de quête',Exhibition:'Exposition','Source Activity Items':'Autres objets (non classés)'},
      it:{Memories:'Ricordi','Quest Puzzles':'Enigmi delle missioni',Exhibition:'Esposizione','Source Activity Items':'Altri oggetti (non classificati)'},
      de:{Memories:'Erinnerungen','Quest Puzzles':'Quest-Rätsel',Exhibition:'Ausstellung','Source Activity Items':'Andere Gegenstände (unklassifiziert)'},
      'es-ES':{Memories:'Recuerdos','Quest Puzzles':'Puzles de misiones',Exhibition:'Exposición','Source Activity Items':'Otros objetos (sin clasificar)'},
      'zh-CN':{Memories:'回忆','Quest Puzzles':'任务谜题',Exhibition:'展览','Source Activity Items':'其他物品（未分类）'},
      'pt-BR':{Memories:'Memórias','Quest Puzzles':'Quebra-cabeças de missões',Exhibition:'Exposição','Source Activity Items':'Outros itens (sem classificação)'}
    };
    return special[lang]?.[id]??collectionFamilyLabel(lang,id)??id;
  }
  function labelFacet(kind:'world'|'universe',id:string):string {
    if(!runtime)return id;
    const meta=runtime.metadata;
    const list=kind==='world'?meta.worlds:meta.universes;
    const labels=kind==='world'?meta.worldLabels:meta.universeLabels;
    const i=list.indexOf(id);
    const lang=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'].indexOf(locale);
    return i<0?id:labels[i]?.[lang<0?0:lang]??labels[i]?.[0]??id;
  }
  function labelWorld(id:string):string{return labelFacet('world',id);}
  function labelUniverse(id:string):string{return labelFacet('universe',id);}
  function currentFilter(offset:number,limit:number):CollectionFilter {
    return {
      locale,search,category:selected,
      world:worldFilter,universe:universeFilter,
      expansion,status,nameStatus,offset,limit
    };
  }
  function refresh():void {
    if(!runtime)return;
    try{
      facets=runtime.facets('category',locale);
      const collected:CollectionItem[]=[];
      let next=0;
      let total=0;
      do{
        const page=runtime.query(currentFilter(next,Math.min(200,visible-next)));
        total=page.total;
        collected.push(...page.items);
        next+=page.items.length;
        if(page.items.length===0)break;
      }while(next<Math.min(total,visible));
      filtered=collected;
      totalMatches=total;
      overall=runtime.progress;
      state=runtime.state;
    }catch(error){storeError=error instanceof Error?error.message:String(error);}
  }
  function resetView():void{visible=72;selectedIds=[];selectedItemId=null;refresh();}
  function observeMore(node:HTMLElement) {
    if(typeof IntersectionObserver==='undefined')return {destroy:()=>{}};
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(x=>x.isIntersecting)&&visible<totalMatches&&!busy){
        visible+=72;refresh();
      }
    },{rootMargin:'400px'});
    observer.observe(node);
    return {destroy:()=>observer.disconnect()};
  }
  async function commit(action:()=>Promise<void>,repair=false):Promise<void>{
    if(!runtime||busy||(storeError&&!repair))return;
    busy=true;
    try{
      await action();
      storeError='';
      refresh();
      infoMessage='ブラウザ内のCollection記録を更新しました。DDVセーブファイルは変更していません。';
    }catch(error){storeError=error instanceof Error?error.message:String(error);}
    finally{busy=false;}
  }
  async function reloadLatestRecord():Promise<void> {
    if (!runtime || busy) return;
    busy=true;
    try {
      await runtime.reloadLatest();
      storeError='';
      selectedItemId=null;
      selectedIds=[];
      selectionMode=false;
      refresh();
      if (!storeError) infoMessage='ほかのタブで保存された最新のローカル記録を読み込みました。';
    } catch (error) {
      storeError=error instanceof Error?error.message:String(error);
    } finally {
      busy=false;
    }
  }
  function changeEntry(change:Record<string,unknown>):void{
    if(selectedItem&&runtime)void commit(()=>runtime!.setEntry(selectedItem!.itemId,change));
  }
  function toggleItemStatus(id:number):void{
    if(!runtime)return;
    const current=entries[String(id)]?.status;
    void commit(()=>runtime!.setEntry(id,{status:current==='owned'?'missing':'owned'}));
  }
  async function showItem(id:number,event:MouseEvent):Promise<void>{
    inspectorTrigger=event.currentTarget as HTMLElement;
    selectedItemId=id;
    if(mobileInspector){await tick();inspectorClose?.focus({preventScroll:true});}
  }
  async function closeItem():Promise<void>{
    selectedItemId=null;await tick();
    if(inspectorTrigger?.isConnected)inspectorTrigger.focus({preventScroll:true});
    inspectorTrigger=null;
  }
  function toggleSelected(id:number):void{
    selectedIds=selectedIds.includes(id)?selectedIds.filter(x=>x!==id):[...selectedIds,id];
  }
  function applyBulk(next:'owned'|'missing'|null):void{
    if(!runtime||!selectedIds.length)return;
    const ids=[...selectedIds];
    void commit(async()=>{
      await runtime!.setBulk(ids,next??'unknown');
      selectedIds=[];selectionMode=false;
    });
  }
  function applyFilteredBulk(next:'owned'|'missing'|'unknown'):void {
    if(!runtime||busy||storeError||totalMatches===0)return;
    const count=totalMatches;
    const label=next==='owned'?'所持 / 解放':next==='missing'?'未所持':'未記録';
    if(!window.confirm(`現在の条件に一致する全${count.toLocaleString(locale)}件を「${label}」に変更します。画面に未表示のアイテムも対象です。実行しますか？`))return;
    const filter=currentFilter(0,1);
    void commit(async()=>{
      await runtime!.setBulkMatching(filter,next);
      selectedIds=[];
      selectionMode=false;
    });
  }
  function chooseFacet(id:string):void{selected=id;resetView();}
  function clearScope():void{selected='';search='';status='all';nameStatus='all';expansion='';worldFilter='';universeFilter='';resetView();}
  function changeWorkspace(id:string):void{
    if(!runtime)return;
    void commit(async()=>{await runtime!.workspace('select',id);selectedItemId=null;selectedIds=[];});
  }
  function newWorkspace():void{
    if(!runtime)return;
    const name=window.prompt('新しいローカル記録の名前（最大80文字）');
    if(name?.trim())void commit(()=>runtime!.workspace('add','local-'+crypto.randomUUID(),name));
  }
  function editWorkspaceName():void{
    if(!runtime||!workspace)return;
    const name=window.prompt('記録の名前',workspace.name);
    if(name?.trim())void commit(()=>runtime!.workspace('rename',workspace.id,name));
  }
  function deleteWorkspace():void{
    if(!runtime||state.workspaces.length<2)return;
    if(!window.confirm('現在の記録を削除します。先にバックアップを保存しましたか？'))return;
    void commit(()=>runtime!.workspace('delete',state.active));
  }
  async function useOwnerLocalCatalog(event:Event):Promise<void> {
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];
    if(!file||busy)return;
    busy=true;
    let loaded:CollectionRuntime|null=null;
    try {
      loaded=await CollectionRuntime.openOwnerLocalDb01(file);
      runtime?.close();
      runtime=loaded;
      loaded=null;
      loadError='';
      storeError='';
      clearScope();
      infoMessage='Steam v1.26.2の'+runtime.progress.total.toLocaleString('ja')+'件へローカルで切り替えました。ゲームデータは送信・保存していません。';
    } catch(error) {
      loaded?.close();
      infoMessage='ローカルカタログを読み込めませんでした：'+(error instanceof Error?error.message:String(error));
    } finally {
      busy=false;
      input.value='';
    }
  }
  async function usePublicCatalog():Promise<void>{
    if(busy)return;
    busy=true;
    let loaded:CollectionRuntime|null=null;
    try {
      loaded=await CollectionRuntime.open(base);
      runtime?.close();
      runtime=loaded;
      loaded=null;
      loadError='';
      storeError='';
      clearScope();
      infoMessage='公開されている検証済みCollection参照データに戻しました。';
    }catch(error){
      loaded?.close();
      infoMessage='公開カタログの読込に失敗しました：'+(error instanceof Error?error.message:String(error));
    }finally{busy=false;}
  }
  function downloadBackup():void{
    if(!runtime)return;
    const data=runtime.exportBackup();
    const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
    const a=document.createElement('a');
    a.href=url;a.download='dreamwish-wand-collection-backup.json';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  async function restoreBackup(event:Event):Promise<void>{
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];
    if(!file||!runtime)return;
    try{
      if(file.size>10_000_000)throw new Error('COLLECTION_BACKUP_TOO_LARGE');
      const data=await file.text();
      if(!window.confirm('現在のローカル記録をすべて置き換えます。先にバックアップを保存しましたか？'))return;
      await commit(()=>runtime!.restore(data),true);
      selectedItemId=null;clearScope();
    }catch(error){infoMessage=error instanceof Error?error.message:String(error);}
    finally{input.value='';}
  }
  onMount(()=>{
    let alive=true;
    const media=window.matchMedia('(max-width: 820px)');
    mobileInspector=media.matches;
    const changed=(e:MediaQueryListEvent)=>{mobileInspector=e.matches;};
    media.addEventListener('change',changed);
    void(async()=>{
      try{
        const loaded=await CollectionRuntime.open(base);
        if(!alive){loaded.close();return;}
        runtime=loaded;
        refresh();
        try{
          const response=await fetch(base+'/ddv/collection/item-images-r39.json');
          if(response.ok){
            const images=await response.json();
            if(images.schema==='wand.collection.item-images.r39@1'&&images.items&&typeof images.items==='object')
              gameImageMap=images.items;
          }
        }catch{}
      }catch(error){if(alive)loadError=error instanceof Error?error.message:String(error);}
      finally{if(alive)loading=false;}
    })();
    return()=>{alive=false;media.removeEventListener('change',changed);runtime?.close();};
  });
  function lookupSavedCollectionId(itemId:number):void {
    if(!Number.isSafeInteger(itemId)||itemId<=0||!runtime)return;
    selected='';worldFilter='';universeFilter='';expansion='';
    status='all';nameStatus='all';search=String(itemId);
    filtersOpen=false;resetView();
    infoMessage='セーブに保存されたItem ID '+itemId+'の公開カタログ参照を表示しています。所持・解放判定ではありません。';
    document.querySelector('.collection-workspace')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function historicalLookup(itemId:number):{itemId:number;label:string;family:string}|null{
    if(!runtime)return null;
    try{
      const item=runtime.item(itemId,locale);
      return {itemId:item.itemId,label:item.label,family:item.family};
    }catch{return null;}
  }
</script>

<svelte:window on:keydown={(event:KeyboardEvent)=>{ if(event.key==='Escape' && mobileInspector && selectedItemId!==null) void closeItem(); }} />

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
        <select value={locale} aria-label="アイテム表示言語"
          on:change={(event)=>{locale=(event.currentTarget as HTMLSelectElement).value;refresh();}}>
          {#each languages as language}<option value={language.id}>{language.label}</option>{/each}
        </select>
      </label>
      {#if runtime?.isOwnerLocal || (runtime && runtime.metadata.snapshot!=='steam-1.26.2-native-itemlist-v1')}
        <button type="button" class="subtle-button" disabled={busy||loading}
          on:click={()=>runtime?.isOwnerLocal?void usePublicCatalog():localCatalogInput.click()}>
          {runtime?.isOwnerLocal?'公開データに戻す':'v1.26.2 データをローカルで開く'}
        </button>
      {/if}
      <input bind:this={localCatalogInput} class="visually-hidden" type="file"
        accept=".json,application/json" aria-label="Steam v1.26.2のオーナーローカルカタログ"
        on:change={useOwnerLocalCatalog}/>
      <span class="source-pill">
        {#if runtime}
          {runtime.metadata.platform}{#if runtime.metadata.version} · v{runtime.metadata.version}{/if}
          {#if runtime.isOwnerLocal} · ローカル{/if}
        {:else}
          データを確認中
        {/if}
      </span>
    </div>
  </header>

  {#if runtime?.isOwnerLocal || runtime?.metadata.nameCoverage}
    <div class="info-banner" role="status">
      Steam v1.26.2：{overall.total.toLocaleString(locale)} /
      {(runtime.ownerLocalCoverage??runtime.metadata.nameCoverage)?.itemDefinitions.toLocaleString(locale)}件のItemListデータを表示中。
      8言語の正式名称を確認済み：
      {(runtime.ownerLocalCoverage??runtime.metadata.nameCoverage)?.nameVerified.toLocaleString(locale)}件。
      {#if overall.total===(runtime.ownerLocalCoverage??runtime.metadata.nameCoverage)?.itemDefinitions}
        名称未確認：
        {(runtime.ownerLocalCoverage??runtime.metadata.nameCoverage)?.nameUnverified.toLocaleString(locale)}件。
        名称は推測せず「名称未確認」と表示します。
      {:else}
        名称未確認の
        {(runtime.ownerLocalCoverage??runtime.metadata.nameCoverage)?.nameUnverified.toLocaleString(locale)}件は、この旧版ファイルには含まれません。
      {/if}
      大分類のみ原本由来です。詳細カテゴリ・ワールド・ユニバース・セーブ上の所有状態は未検証です。
      {#if runtime.isOwnerLocal}選択したゲームデータはサーバーへ送信・保存されません。{/if}
    </div>
  {/if}
  {#if storeError}
    <div class="error-banner" role="alert">
      {#if storeError==='COLLECTION_STORAGE_CONFLICT'}
        別のタブでCollectionの記録が更新されました。古い記録による上書きを防止しています。
        <button type="button" disabled={busy} on:click={()=>void reloadLatestRecord()}>最新の記録を読み直す</button>
        <small>COLLECTION_STORAGE_CONFLICT</small>
      {:else}
        {storeError}　ブラウザのデータは削除していません。
      {/if}
    </div>
  {/if}
  {#if infoMessage}<div class="info-banner" role="status">{infoMessage}<button type="button" on:click={()=>infoMessage=''} aria-label="通知を閉じる">×</button></div>{/if}

  <section class="personal-bar" aria-label="Personal Collection">
    <div class="personal-left">
      <span class="personal-symbol">✧</span>
      <div><strong>My Collection</strong><span>ローカル記録 · セーブファイル未接続</span></div>
      <select aria-label="ローカル記録を選択" value={state.active} on:change={(event)=>changeWorkspace((event.currentTarget as HTMLSelectElement).value)} disabled={Boolean(storeError)}>
        {#each state.workspaces as work}<option value={work.id}>{work.name}</option>{/each}
      </select>
    </div>
    <div class="personal-actions">
      <button type="button" title="記録を追加" disabled={Boolean(storeError)||state.workspaces.length>=5} on:click={newWorkspace}>＋ 新規</button>
      <button type="button" title="名前変更" disabled={Boolean(storeError)} on:click={editWorkspaceName}>名前変更</button>
      <button type="button" title="記録削除" disabled={Boolean(storeError)||state.workspaces.length<2} on:click={deleteWorkspace}>削除</button>
      <button type="button" disabled={Boolean(storeError)} on:click={downloadBackup}>バックアップ出力</button>
      <button type="button" on:click={()=>importInput.click()}>復元</button>
      <input bind:this={importInput} class="visually-hidden" type="file" accept=".json,application/json" aria-label="Collectionバックアップを選択" on:change={restoreBackup}/>
    </div>
  </section>

  {#if loading}
    <div class="loading-panel" role="status">検証済みCollectionデータを読み込み中…</div>
  {:else if loadError}
    <div class="error-banner" role="alert">データの検証または読み込みに失敗しました。{loadError}</div>
  {:else}
    <SavedStorePreview resolveHistorical={historicalLookup} {locale} {gameImageMap}
      on:lookupItem={(event:CustomEvent<number>)=>lookupSavedCollectionId(event.detail)} />
    <div class="summary-strip">
      <div><strong>{overall.total.toLocaleString(locale)}</strong><span>参照データ</span></div>
      <div><strong>{overall.owned.toLocaleString(locale)} / {overall.total.toLocaleString(locale)}</strong><span>所持・解放の手動記録 / 参照件数</span></div>
      <div><strong>{overall.missing.toLocaleString(locale)}</strong><span>未所持の手動記録</span></div>
      <div><strong>{overall.unknown.toLocaleString(locale)}</strong><span>未記録</span></div>
    </div>
    <div class="collection-workspace">
      <div class="workspace-top">
        <div class="toolbar">
          <label class="search-box">
            <span aria-hidden="true">⌕</span>
            <input type="search" aria-label="8言語のアイテム名で検索" bind:value={search} on:input={resetView} placeholder="アイテム名を検索"/>
          </label>
          <button type="button" class="subtle-button" aria-expanded={filtersOpen} on:click={()=>filtersOpen=!filtersOpen}>フィルター {filtersOpen?'▴':'▾'}</button>
        </div>
      </div>
      {#if filtersOpen}
        <div class="filter-panel">
          <label class="filter-label">ワールド
            <select aria-label="ワールドで絞り込み" bind:value={worldFilter} on:change={resetView}>
              <option value="">すべて</option>
              {#each runtime?.metadata.worlds??[] as id}<option value={id}>{labelWorld(id)}</option>{/each}
            </select>
          </label>
          <label class="filter-label">ユニバース
            <select aria-label="ユニバースで絞り込み" bind:value={universeFilter} on:change={resetView}>
              <option value="">すべて</option>
              {#each runtime?.metadata.universes??[] as id}<option value={id}>{labelUniverse(id)}</option>{/each}
            </select>
          </label>
          {#if (runtime?.isOwnerLocal || runtime?.metadata.nameCoverage) && overall.total===(runtime.ownerLocalCoverage??runtime.metadata.nameCoverage)?.itemDefinitions}
            <fieldset><legend>正式名称の確認状況</legend>
              {#each [{id:'all',name:'すべて'},{id:'verified',name:'名称確認済み'},{id:'unverified',name:'名称未確認'}] as option}
                <button type="button" class:chosen={nameStatus===option.id} aria-pressed={nameStatus===option.id}
                  on:click={()=>{nameStatus=option.id as typeof nameStatus;resetView();}}>{option.name}</button>
              {/each}
            </fieldset>
          {/if}
          <fieldset><legend>収集状況（手動記録）</legend>
            {#each [{id:'all',name:'すべて'},{id:'owned',name:'所持 / 解放'},{id:'missing',name:'未所持'}] as option}
              <button type="button" class:chosen={status===option.id} aria-pressed={status===option.id} on:click={()=>{status=option.id as typeof status;resetView();}}>{option.name}</button>
            {/each}
          </fieldset>
          <label class="filter-label">追加コンテンツ
            <select bind:value={expansion} on:change={resetView}>
              <option value="">すべて</option>
              {#each runtime?.metadata.expansions??[] as id}<option value={id}>{id}</option>{/each}
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
                <button type="button" on:click={clearScope}>Categories</button>
                {#if selected}<span> / {selectionLabel}</span>{/if}
              </div>
              <div class="result-actions">
                <span class="result-count">{totalMatches.toLocaleString(locale)} 件{#if selected} · 所持記録 {(facets.find((facet:any)=>facet.id===selected)?.owned??0).toLocaleString(locale)} / {(facets.find((facet:any)=>facet.id===selected)?.total??0).toLocaleString(locale)}{/if}</span>
                <button type="button" class="subtle-button" disabled={Boolean(storeError)} aria-pressed={selectionMode}
                  on:click={()=>{selectionMode=!selectionMode;selectedIds=[];selectedItemId=null;}}>{selectionMode?'選択を終了':'複数選択'}</button>
              </div>
            </div>
            {#if selectionMode && filtered.length}
              <div class="bulk-actions" role="group" aria-label="Collectionの一括記録">
                <span>{selectedIds.length} 件選択</span>
                <button type="button" on:click={()=>selectedIds=[...new Set<number>(visibleItems.map((item:any)=>Number(item.itemId)))]}>表示中を選択</button>
                <button type="button" on:click={()=>selectedIds=[]} disabled={!selectedIds.length}>選択解除</button>
                <button type="button" on:click={()=>applyBulk('owned')} disabled={!selectedIds.length}>所持 / 解放</button>
                <button type="button" on:click={()=>applyBulk('missing')} disabled={!selectedIds.length}>未所持</button>
                <button type="button" on:click={()=>applyBulk(null)} disabled={!selectedIds.length}>未記録</button>
                <span class="bulk-all-separator" aria-hidden="true">｜</span>
                <span>条件一致の全{totalMatches.toLocaleString(locale)}件：</span>
                <button type="button" disabled={busy||Boolean(storeError)} on:click={()=>applyFilteredBulk('owned')}>全件を所持 / 解放</button>
                <button type="button" disabled={busy||Boolean(storeError)} on:click={()=>applyFilteredBulk('missing')}>全件を未所持</button>
                <button type="button" disabled={busy||Boolean(storeError)} on:click={()=>applyFilteredBulk('unknown')}>全件を未記録</button>
              </div>
            {/if}
            {#if !totalMatches}
              <div class="empty-panel">条件に一致するアイテムはありません。未記録のアイテムは「未所持」として扱いません。</div>
            {:else}
              {#each groupedItems as group (group.id)}
                {#if !selected || search.trim()}
                  <h3 class="result-group-title">{categoryLabel(locale,group.id)} <span>{group.items.length}</span></h3>
                {/if}
                <div class="items-grid">
                  {#each group.items as item (item.itemId)}
                    <div class="item-card" class:current={selectedItemId===item.itemId} class:bulk-selected={selectedIds.includes(item.itemId)}>
                      <button type="button" class="item-card-body"
                        on:click={(event)=>selectionMode?toggleSelected(item.itemId):void showItem(item.itemId,event)}
                        aria-pressed={selectionMode?selectedIds.includes(item.itemId):selectedItemId===item.itemId}
                        aria-label={selectionMode?`${item.label} を選択`:`${item.label} の詳細`}>
                        <span class="item-icon" aria-hidden="true">{#if selectionMode}{selectedIds.includes(item.itemId)?'☑':'☐'}{:else}<ItemArtwork itemId={item.itemId} sourcePath={gameImageMap[String(item.itemId)]??null} />{/if}</span>
                        <span class="item-card-copy"><strong>{item.label}</strong><span>{categoryLabel(locale,item.family)}{#if !item.nameVerified} · 名称未確認{/if}</span></span>
                      </button>
                      <button type="button" class="item-state-toggle" disabled={Boolean(storeError)||selectionMode}
                        class:owned={entries[String(item.itemId)]?.status==='owned'}
                        on:click={()=>toggleItemStatus(item.itemId)}
                        aria-label={entries[String(item.itemId)]?.status==='owned'?`${item.label} を未所持にする`:`${item.label} を所持済みにする`}
                        title={entries[String(item.itemId)]?.status==='owned'?'所持済み：押すと未所持':'押すと所持済みに記録'}>
                        {entries[String(item.itemId)]?.status==='owned'?'✓':'＋'}
                      </button>
                    </div>
                  {/each}
                </div>
              {/each}
              {#if visible<totalMatches}
                <div class="more-button" use:observeMore aria-label="スクロールで続きを自動読み込み">読み込み中…</div>
              {/if}
            {/if}
          {:else}
            <div class="section-lead">
              <h2>カテゴリから探す</h2>
              <p>カテゴリを選ぶと、登録されているアイテムを確認できます。</p>
            </div>
            <div class="facet-grid">
              {#each facets as facet (facet.id)}
                <button type="button" class="facet-card" disabled={facet.total===0} on:click={()=>chooseFacet(facet.id)}>
                  <span class="facet-flourish" aria-hidden="true">✧</span>
                  <strong>{categoryLabel(locale,facet.id)}</strong>
                  {#if facet.total>0}
                    <span>{facet.total.toLocaleString(locale)} items</span>
                    <small aria-label="手動所持記録数／対象総数">{facet.owned.toLocaleString(locale)} / {facet.total.toLocaleString(locale)} 所持記録</small>
                  {:else}
                    <span>参照データ未対応</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        {#if selectedItem}
          <aside class="item-inspector" role={mobileInspector?"dialog":undefined} aria-modal={mobileInspector?"true":undefined} aria-label="アイテム情報">
            <div class="inspector-heading"><span>ITEM DETAILS</span><button type="button" bind:this={inspectorClose} on:click={closeItem} aria-label="詳細を閉じる">×</button></div>
            <div class="inspector-art"><ItemArtwork itemId={selectedItem.itemId} alt={selectedItem.label} sourcePath={gameImageMap[String(selectedItem.itemId)]??null} large /></div>
            <h2>{selectedItem.label}</h2>
            {#if !selectedItem.nameVerified}<p class="inspector-hint">このItem IDの正式名称はSteam v1.26.2原本の8言語データでは確認できませんでした。名称や分類を推測せず、Item IDに紐づくローカル記録だけを表示しています。</p>{/if}
            <p class="inspector-meta">{categoryLabel(locale,selectedItem.family)}</p>
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
          <aside class="item-inspector empty-inspector"><div class="inspector-empty-symbol">✦</div><h2>Item Details</h2><p>アイテムを選択すると、データとローカル収集状況を確認できます。</p><p class="inspector-hint">参照データ：{runtime?.metadata.platform??'公開ゲームDB'}{#if runtime?.metadata.version}{' · DDV v'}{runtime.metadata.version}{/if}。一部の画像には別バージョンのゲーム由来素材を使用しており、データとの同一性は保証されません。セーブ内の一部情報は上部で読み取り専用プレビューできますが、Collectionへの自動反映・セーブへの書き戻し・個別詳細ページは未接続です。</p></aside>
        {/if}
      </div>
    </div>
  {/if}
</section>
