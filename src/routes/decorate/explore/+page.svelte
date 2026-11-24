<script lang="ts">
  import {onMount,tick} from 'svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {base} from '$app/paths';
  import ItemArtwork from '$lib/collection/ItemArtwork.svelte';
  import {COLLECTION_UNIVERSE_TAG_NAMES} from '$lib/collection/universe-tag-names';
  import {FAMILIES,FACETS,emptyFilters,groupItems,matches,compareItems,isLargeUniverse,universeRank,type ExploreFilters,type Facet,type Family} from '$lib/explore/browse';
  import {seriesShelves,designTiles,type SeriesShelf,type DesignTile,type ReleaseGroup} from '$lib/explore/series';
  import {collectionDb01FacetLabel,collectionDb01TagLabel,COLLECTION_DB01_COLOR_SWATCHES} from '$lib/collection/db01-native-facets';
  import {collectionTopCategoryLabel} from '$lib/collection/category-hierarchy';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
  import {emptyBoards,readBoards,createBoard,editBoard,toggleItem,deleteBoard,toggleFavorite,STORAGE_KEY,type ExploreItem,type BoardState} from '$lib/explore/model';
  let locale=$state<WandLanguage>('ja');
  let items=$state.raw<ExploreItem[]>([]);
  let images=$state.raw<Record<string,string>>({});
  let boards=$state.raw<BoardState>(emptyBoards());
  let storageRaw:string|null=null;
  let ready=$state(false),loading=$state(true),failed=$state(false),storageFailed=$state(false);
  let boardsOpen=$state(false),searchOpen=$state(false),searchInput=$state<HTMLInputElement>(),search=$state(''),favorites=$state(false);
  let newName=$state(''),rename=$state(''),groupName=$state(''),selected=$state<ExploreItem|null>(null);
  const t=(ja:string,en:string)=>locale==='ja'?ja:en;
  const facets=FACETS;
  let filters=$state<ExploreFilters>(emptyFilters()),filtersOpen=$state(false),focused=$state<string|null>(null),focusedSeries=$state<string|null>(null),allGrid=$state(false);
  let releases=$state.raw<ReleaseGroup[]>([]);
  let variantChoices=$state<Record<string,number>>({}),variantReview=$state<ExploreItem[]>([]);
  let sourceUniverses=$state.raw<{tagId:number;key:string;names:Record<string,string|null>}[]>([]);
  let selectionMode=$state(false),selectedIds=$state<number[]>([]);
  const nameOf=(i:ExploreItem)=>i.names[locale]??i.names.en??t('名称未確認','Unnamed item');
  const byId=$derived(new Map(items.map(i=>[i.itemId,i])));
  const active=$derived(boards.boards.find(b=>b.id===boards.active)??null);
  const activeIds=$derived(new Set(active?.entries.map(e=>e.itemId)??[]));
  const favoriteIds=$derived(new Set(boards.favorites));
  const universeNames=$derived(new Map([...sourceUniverses.map(u=>[String(u.tagId),{label:u.names[locale]??u.names.en??u.key,sort:u.names[locale]??u.names.en??u.key}] as const),...COLLECTION_UNIVERSE_TAG_NAMES.map(u=>[String(u.id),{label:u.names[locale],sort:locale==='ja'?u.jaReading:u.names[locale]}] as const)]));
  function universeName(key:string){return key==='none'?t('ユニバースなし','No universe'):key==='unknown'?t('ユニバース未確認','Universe unconfirmed'):universeNames.get(key)?.label??t('ユニバース未確認','Universe unconfirmed');}
  function sortUniverse(a:string,b:string){
    return universeRank(a)-universeRank(b)||(universeNames.get(a)?.sort??a).localeCompare(universeNames.get(b)?.sort??b,locale);
  }
  const allGroups=$derived(groupItems(items));
  const universeOptions=$derived([...allGroups.keys()].sort(sortUniverse));
  const facetOptions=$derived.by(()=>{
    const sets:Record<Facet,Set<string>>={furnitureKind:new Set(),color:new Set(),furnitureStyle:new Set()};
    for(const item of items)for(const [key,value] of item.tags)sets[key]?.add(value);
    return Object.fromEntries(facets.map(key=>[key,[...sets[key]].sort()])) as Record<Facet,string[]>;
  });
  const filtered=$derived.by(()=>{
    const q=search.trim().toLocaleLowerCase();
    return items.filter(i=>matches(i,filters)&&(!favorites||favoriteIds.has(i.itemId))&&(!q||nameOf(i).toLocaleLowerCase().includes(q)));
  });
  const grouped=$derived(groupItems(filtered,filters.universes));
  const shelves=$derived([...grouped.entries()].sort(([a],[b])=>sortUniverse(a,b)));
  // Build the series index once against the full catalog. Filters select
  // members but never change their stable group identity.
  const fullSeries=$derived(new Map([...allGroups].filter(([key])=>isLargeUniverse(key)).map(([key,list])=>[key,seriesShelves(list,releases)] as const)));
  const visibleSeries=$derived.by(()=>{
    const result=new Map<string,SeriesShelf[]>();
    for(const [key,groups] of fullSeries){
      const allowed=new Set((grouped.get(key)??[]).map(i=>i.itemId));
      result.set(key,groups.map(g=>({...g,items:g.items.filter(i=>allowed.has(i.itemId))})).filter(g=>g.items.length));
    }
    return result;
  });
  const focusedGroups=$derived(focused!==null?visibleSeries.get(focused)??[]:[]);
  const focusedGroup=$derived(focusedGroups.find(g=>g.key===focusedSeries));
  const gridItems=$derived(focused!==null?(focusedSeries!==null?focusedGroup?.items??[]:grouped.get(focused)??[]):[...filtered].sort(compareItems));
  const gridDesigns=$derived(focused!==null&&isLargeUniverse(focused)?designTiles(gridItems):gridItems.map(i=>({key:'item:'+i.itemId,items:[i]})));
  function seriesName(g:SeriesShelf){
    const label=g.names?.[locale]??g.names?.en??g.label;
    if(g.kind==='unclassified')return t('未分類','Unclassified')+' · '+collectionTopCategoryLabel(locale,g.label as Family);
    const style=g.styleKeys?.map(k=>collectionDb01TagLabel(locale,k)).join(' · ');
    if(g.kind==='style')return t('スタイル候補','Style matches')+' · '+(style??'');
    return label?(style?label+' · '+style:label):style??nameOf(g.items[0]);
  }
  function displayed(d:DesignTile){return d.items.find(i=>i.itemId===variantChoices[d.key])??d.items[0];}
  function showReview(i:ExploreItem,variants:ExploreItem[]=[i]){selected=i;variantReview=variants;}
  function pickVariant(d:DesignTile,i:ExploreItem){variantChoices={...variantChoices,[d.key]:i.itemId};showReview(i,d.items);}

  const filterCount=$derived(filters.families.length+filters.universes.length+facets.reduce((n,k)=>n+filters.tags[k].length,0));
  function resetBrowse(){focused=null;focusedSeries=null;}
  function toggleFamily(key:Family){filters.families=filters.families.includes(key)?filters.families.filter(x=>x!==key):[...filters.families,key];resetBrowse();}
  function toggleUniverse(key:string){filters.universes=filters.universes.includes(key)?filters.universes.filter(x=>x!==key):[...filters.universes,key];resetBrowse();}
  function toggleFacet(key:Facet,value:string){const list=filters.tags[key];filters.tags[key]=list.includes(value)?list.filter(x=>x!==value):[...list,value];resetBrowse();}
  function showUniverse(key:string,series:string|null=null){focused=key;focusedSeries=series;allGrid=false;}
  function goBack(){if(focusedSeries!==null){focusedSeries=null;}else{focused=null;allGrid=false;}}
  function chooseItem(id:number){if(active)toggle(id);else boardsOpen=true;}
  function save(next:BoardState){if(!ready||storageFailed)return;try{
    if(localStorage.getItem(STORAGE_KEY)!==storageRaw)throw Error('CONFLICT');
    const raw=JSON.stringify(next);localStorage.setItem(STORAGE_KEY,raw);storageRaw=raw;boards=next;
  }catch{storageFailed=true;}}
  async function toggleSearch(){searchOpen=!searchOpen;if(searchOpen){await tick();searchInput?.focus();}else{search='';resetBrowse();}}
  function selectItem(id:number){selectedIds=selectedIds.includes(id)?selectedIds.filter(v=>v!==id):[...selectedIds,id];}
  function bulkAdd(){if(!active)return;const ids=new Set(active.entries.map(e=>e.itemId));save(editBoard(boards,active.id,b=>({...b,entries:[...b.entries,...selectedIds.filter(id=>!ids.has(id)).map(itemId=>({itemId,groupId:null}))]})));selectedIds=[];selectionMode=false;}
  function reorderItem(id:number,step:number){if(!active)return;save(editBoard(boards,active.id,b=>{
    const entries=[...b.entries],i=entries.findIndex(e=>e.itemId===id);if(i<0)return b;
    let j=i+step;while(j>=0&&j<entries.length&&entries[j].groupId!==entries[i].groupId)j+=step;
    if(j<0||j>=entries.length)return b;[entries[i],entries[j]]=[entries[j],entries[i]];return {...b,entries};
  }));}
  function pickBoard(id:string){save({...boards,active:id});}
  function addBoard(){if(!newName.trim())return;save(createBoard(boards,crypto.randomUUID(),newName));newName='';boardsOpen=true;}
  function removeBoard(){if(active&&confirm(t('このムードボードを削除しますか？','Delete this moodboard?')))save(deleteBoard(boards,active.id));}
  function changeName(){if(active&&rename.trim())save(editBoard(boards,active.id,b=>({...b,name:rename.trim()})));rename='';}
  function addGroup(){if(active&&groupName.trim())save(editBoard(boards,active.id,b=>({...b,groups:[...b.groups,{id:crypto.randomUUID(),name:groupName.trim()}]})));groupName='';}
  function removeGroup(id:string){if(active&&confirm(t('グループを削除してアイテムを未分類に戻しますか？','Delete group and move its items to Unsorted?')))save(editBoard(boards,active.id,b=>({...b,groups:b.groups.filter(g=>g.id!==id),entries:b.entries.map(e=>e.groupId===id?{...e,groupId:null}:e)})));}
  function moveItem(id:number,groupId:string){if(active)save(editBoard(boards,active.id,b=>({...b,entries:b.entries.map(e=>e.itemId===id?{...e,groupId:groupId||null}:e)})));}
  function toggle(id:number){if(active)save(toggleItem(boards,active.id,id));}
  onMount(()=>{
    const unwatch=watchWandLanguage(v=>locale=v);
    try{storageRaw=localStorage.getItem(STORAGE_KEY);boards=readBoards(storageRaw);ready=true;}catch{storageFailed=true;}
    const w=new Worker(new URL('../../../lib/explore/catalog.worker.ts',import.meta.url),{type:'module'});
    w.onmessage=(e:MessageEvent<{items?:ExploreItem[];universeTags?:typeof sourceUniverses;releases?:ReleaseGroup[];error?:boolean}>)=>{if(e.data.items){items=e.data.items;sourceUniverses=e.data.universeTags??[];releases=e.data.releases??[];}else failed=true;loading=false;};
    w.onerror=()=>{failed=true;loading=false;};
    w.postMessage({base});
    void fetch(base+'/ddv/collection/item-images-r39.json').then(r=>r.ok?r.json():null).then(d=>{if(d?.schema==='wand.collection.item-images.r39@1'&&d.items)images=d.items;}).catch(()=>{});
    const storageListener=(e:StorageEvent)=>{if(e.key===STORAGE_KEY){try{storageRaw=e.newValue;boards=readBoards(storageRaw);}catch{storageFailed=true;}}};
    window.addEventListener('storage',storageListener);
    return()=>{w.terminate();unwatch();window.removeEventListener('storage',storageListener);};
  });
</script>
<svelte:head><title>Explore · Dreamwish Wand</title></svelte:head>
<section class="decorate">
  <header class="bar toolbar">
    <a class="back icon-button" href={base+'/decorate/'} aria-label="Decorate" title="Decorate"><WandIcon name="arrow" size={18}/></a>
    <h1>Explore</h1>
    <span class="spacer"></span>
    <button class="icon-button" aria-label={t('検索','Search')} title={t('検索','Search')} aria-expanded={searchOpen} onclick={toggleSearch}><WandIcon name="search" size={20}/></button>
    <button class="icon-button" aria-label={t('フィルター','Filters')} title={t('フィルター','Filters')} aria-expanded={filtersOpen} class:activeTab={filterCount>0} onclick={()=>filtersOpen=!filtersOpen}><WandIcon name="filter" size={20}/>{#if filterCount}<small>{filterCount}</small>{/if}</button>
    <button class="icon-button" aria-label={t('お気に入り','Favorites')} title={t('お気に入り','Favorites')} aria-pressed={favorites} onclick={()=>{favorites=!favorites;resetBrowse();}}><WandIcon name="star" size={20}/></button>
    <button class="icon-button" aria-label={t('全件表示','All items')} title={t('全件表示','All items')} aria-pressed={allGrid} onclick={()=>{allGrid=!allGrid;focused=null;focusedSeries=null;}}><WandIcon name="grid" size={20}/></button>
    <button class="icon-button" aria-label={t('ムードボード','Moodboards')} title={active?.name??'Moodboards'} aria-expanded={boardsOpen} class:activeTab={boardsOpen} onclick={()=>boardsOpen=!boardsOpen}><WandIcon name="collection" size={20}/>{#if active}<span class="active-name">{active.name}</span>{/if}</button>
  </header>
  {#if searchOpen}<input class="search" bind:this={searchInput} type="search" placeholder={t('家具を検索','Search decorations')} aria-label={t('家具を検索','Search decorations')} bind:value={search} oninput={resetBrowse}/>{/if}
  {#if storageFailed}<p role="alert">{t('保存できません。再読み込みしてください。','Storage unavailable. Reload before editing.')}</p>{/if}
  <div class="workspace" class:withBoards={boardsOpen}>
  <div class="catalog">
    {#if filtersOpen}
    <section class="filter-panel" aria-label={t('フィルター','Filters')}>
      <div class="bar"><strong>{t('フィルター','Filters')}</strong><span class="spacer"></span><button onclick={()=>{filters=emptyFilters();resetBrowse();}}>{t('クリア','Clear')}</button><button class="icon-button" aria-label={t('閉じる','Close')} onclick={()=>filtersOpen=false}><WandIcon name="close"/></button></div>
      <details open><summary>{t('カテゴリー','Category')}</summary><div class="chips">{#each FAMILIES as key}<button aria-pressed={filters.families.includes(key)} onclick={()=>toggleFamily(key)}>{collectionTopCategoryLabel(locale,key)}</button>{/each}</div></details>
      <details><summary>{t('ユニバース','Universe')}</summary><div class="chips">{#each universeOptions as key}<button aria-pressed={filters.universes.includes(key)} onclick={()=>toggleUniverse(key)}>{universeName(key)}</button>{/each}</div></details>
      {#each facets as facet}
        {#if facetOptions[facet].length}<details open={facet==='color'}><summary>{collectionDb01FacetLabel(locale,facet)}</summary><div class="chips">{#each facetOptions[facet] as key}
          <button aria-pressed={filters.tags[facet].includes(key)} onclick={()=>toggleFacet(facet,key)}>{#if facet==='color'&&COLLECTION_DB01_COLOR_SWATCHES[key.replace(/^(?:F_|C_)/,'')]}<span class="swatch" style:background={COLLECTION_DB01_COLOR_SWATCHES[key.replace(/^(?:F_|C_)/,'')]}></span>{/if}{collectionDb01TagLabel(locale,key)}</button>
        {/each}</div></details>{/if}
      {/each}
    </section>
    {/if}
    {#if selectionMode}<div class="bar"><button disabled={!active||!selectedIds.length||storageFailed} onclick={bulkAdd}>{t('選択を追加','Add selected')} ({selectedIds.length})</button><button onclick={()=>{selectionMode=false;selectedIds=[];}}>{t('解除','Cancel')}</button></div>{/if}
    {#if loading}<p>{t('読み込み中…','Loading…')}</p>{:else if failed}<p role="alert">{t('家具データを読み込めません。','Decoration catalog could not be loaded.')}</p>{:else}
      {#if focused!==null||allGrid}
        <div class="shelf-heading"><button class="icon-button back" aria-label={t('戻る','Back')} onclick={goBack}><WandIcon name="arrow"/></button><h2>{focused!==null?universeName(focused):t('すべて','All items')}{#if focusedGroup} · {seriesName(focusedGroup)}{/if}</h2><span class="spacer"></span><button class="icon-button" aria-label={t('複数選択','Multi-select')} aria-pressed={selectionMode} onclick={()=>{selectionMode=!selectionMode;selectedIds=[];}}><WandIcon name="check"/></button></div>
        {#if focused!==null&&isLargeUniverse(focused)&&focusedSeries===null}
          {@render seriesList(focused,focusedGroups)}
        {:else}
          <div class="tiles">{#each gridDesigns as design (design.key)}{@render designTile(design)}{/each}</div>
        {/if}
      {:else}
        {#each shelves as [key,list] (key)}
          <section class="shelf" class:large-universe={isLargeUniverse(key)}>
            <div class="shelf-heading"><button class="universe-heading" onclick={()=>showUniverse(key)}>{universeName(key)} <span aria-hidden="true">›</span></button></div>
            {#if isLargeUniverse(key)}
              {@render seriesList(key,visibleSeries.get(key)??[])}
            {:else}
              <div class="tiles shelf-items">
                {#each list as item (item.itemId)}{@render itemTile(item)}{/each}
              </div>
            {/if}
          </section>
        {/each}
      {/if}
      {#if filtered.length===0}<p>{t('該当するアイテムがありません','No matching items')}</p>{/if}
    {/if}
  </div>
  {#if boardsOpen}
  <aside class="boards" aria-label="Moodboards">
    <div class="bar board-header"><h2>Moodboards</h2><button aria-label={t('閉じる','Close')} onclick={()=>boardsOpen=false}><WandIcon name="close" size={18}/></button></div>
    <div class="bar"><input bind:value={newName} placeholder={t('新しいボード名','New moodboard name')} aria-label={t('新しいボード名','New moodboard name')}/><button disabled={!newName.trim()||!ready||storageFailed} onclick={addBoard}>{t('作成','Create')}</button></div>
    <div class="board-list">
      {#each boards.boards as b (b.id)}
        <button class="board-card" class:activeTab={b.id===active?.id} onclick={()=>pickBoard(b.id)}>
          <span class="cover">{#each b.entries.slice(0,4) as entry (entry.itemId)}<span><ItemArtwork itemId={entry.itemId} sourcePath={images[String(entry.itemId)]??null}/></span>{/each}</span>
          <strong>{b.name}</strong>
        </button>
      {/each}
    </div>
    {#if active}
      <div class="bar"><h2>{active.name}</h2><input bind:value={rename} aria-label={t('新しい名前','New name')} placeholder={t('新しい名前','New name')}/><button disabled={!rename.trim()||storageFailed} onclick={changeName}>{t('名前変更','Rename')}</button><button disabled={storageFailed} onclick={removeBoard}>{t('削除','Delete')}</button></div>
      {#key active.id}<label class="note">{t('メモ','Notes')}<textarea value={active.note} disabled={storageFailed} onchange={e=>{if(active)save(editBoard(boards,active.id,b=>({...b,note:e.currentTarget.value})));}}></textarea></label>{/key}
      <div class="bar"><input bind:value={groupName} aria-label={t('グループ名','Group name')} placeholder={t('グループ名','Group name')}/><button disabled={!groupName.trim()||storageFailed} onclick={addGroup}>{t('グループ作成','Add group')}</button></div>
      {#each [{id:null,name:t('未分類','Unsorted')},...active.groups] as group (group.id)}
        <div class="bar"><h3>{group.name}</h3>{#if group.id!==null}<button disabled={storageFailed} onclick={()=>removeGroup(group.id!)}>{t('グループ削除','Delete group')}</button>{/if}</div>
        <div class="tiles">
        {#each active.entries.filter(e=>e.groupId===group.id) as entry (entry.itemId)}
          {@const item=byId.get(entry.itemId)}
          <article class="tile">
            <span class="art"><ItemArtwork itemId={entry.itemId} sourcePath={images[String(entry.itemId)]??null}/></span>
            <span>{item?nameOf(item):t('アイテム情報なし','Item unavailable')}</span>
            <select aria-label={t('グループ移動','Move to group')} value={entry.groupId??''} disabled={storageFailed} onchange={e=>moveItem(entry.itemId,e.currentTarget.value)}><option value="">{t('未分類','Unsorted')}</option>{#each active.groups as g (g.id)}<option value={g.id}>{g.name}</option>{/each}</select>
            <div class="actions"><button disabled={storageFailed} aria-label={t('前へ','Move earlier')} onclick={()=>reorderItem(entry.itemId,-1)}>↑</button><button disabled={storageFailed} aria-label={t('後へ','Move later')} onclick={()=>reorderItem(entry.itemId,1)}>↓</button><button disabled={storageFailed} onclick={()=>toggle(entry.itemId)}>{t('取り除く','Remove')}</button></div>
          </article>
        {/each}
        </div>
      {/each}
    {/if}
  </aside>
  {/if}
  </div>
  {#snippet seriesList(universe:string,groups:SeriesShelf[])}
    {#each groups as group (group.key)}
      {@render seriesRow(universe,group)}
    {/each}
  {/snippet}
  {#snippet seriesRow(universe:string,group:SeriesShelf)}
    {@const designs=designTiles(group.items)}
    <section class="shelf-row" data-series-kind={group.kind}>
      <div class="shelf-heading"><button class="category-heading" onclick={()=>showUniverse(universe,group.key)}>{seriesName(group)} <span aria-hidden="true">›</span></button></div>
      <div class="tiles shelf-items">
        {#each designs as design (design.key)}{@render designTile(design)}{/each}
      </div>
    </section>
  {/snippet}
  {#snippet designTile(design:DesignTile)}
    {@const item=displayed(design)}
    {@render itemTile(item,design)}
  {/snippet}
  {#snippet itemTile(item:ExploreItem,design?:DesignTile)}
    <article class="catalog-tile" class:inBoard={activeIds.has(item.itemId)}>
      <button class="item" aria-label={nameOf(item)} title={nameOf(item)} aria-pressed={selectionMode?selectedIds.includes(item.itemId):undefined} onclick={()=>selectionMode?selectItem(item.itemId):showReview(item,design?.items??[item])}><span class="art"><ItemArtwork itemId={item.itemId} sourcePath={images[String(item.itemId)]??null}/></span><span class="visually-hidden">{nameOf(item)}</span></button>
      <button class="tile-favorite" aria-label={t('お気に入り','Favorite')} aria-pressed={favoriteIds.has(item.itemId)} disabled={!ready||storageFailed} onclick={()=>save(toggleFavorite(boards,item.itemId))}><WandIcon name="star" size={16}/></button>
      {#if design&&design.items.length>1}
        <button class="variants-button" aria-label={t('色違いを選択','Choose variant')} title={t('色違いを選択','Choose variant')} onclick={()=>showReview(item,design.items)}><WandIcon name="palette" size={14}/>{design.items.length}</button>
      {/if}
      <button class="tile-add" aria-label={activeIds.has(item.itemId)?t('ボードから削除','Remove from board'):t('ボードに追加','Add to board')} aria-pressed={activeIds.has(item.itemId)} disabled={!ready||storageFailed} onclick={()=>chooseItem(item.itemId)}><WandIcon name={activeIds.has(item.itemId)?'check':'plus'} size={17}/></button>
    </article>
  {/snippet}
  {#if selected}
    <aside class="review" aria-label={t('アイテム詳細','Item details')}>
      <button onclick={()=>selected=null}>{t('閉じる','Close')}</button>
      <div class="large"><ItemArtwork itemId={selected.itemId} sourcePath={images[String(selected.itemId)]??null} large/></div>
      <h2>{nameOf(selected)}</h2>
      {#if variantReview.length>1}<div class="variant-grid">{#each variantReview as variant (variant.itemId)}<button aria-label={nameOf(variant)} title={nameOf(variant)} aria-pressed={selected.itemId===variant.itemId} onclick={()=>{const d=designTiles(variantReview)[0];if(d)pickVariant(d,variant);}}><ItemArtwork itemId={variant.itemId} sourcePath={images[String(variant.itemId)]??null}/></button>{/each}</div>{/if}
      <button disabled={!active||storageFailed} onclick={()=>selected&&toggle(selected.itemId)}>{active?.entries.some(e=>e.itemId===selected?.itemId)?t('ボードから削除','Remove from board'):t('ボードへ追加','Add to board')}</button>
    </aside>
  {/if}
</section>
<style>
  .decorate{padding:12px 16px;min-width:0;position:relative}
  .workspace{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
  .workspace.withBoards{grid-template-columns:minmax(0,1fr) minmax(300px,35%)}
  .catalog{min-width:0}
  .boards{min-width:0;position:sticky;top:calc(var(--shell-height,60px) + 12px);max-height:calc(100dvh - var(--shell-height,60px) - 24px);overflow:auto;border-left:1px solid var(--wand-line);padding-left:12px}
  .boards .tiles{grid-template-columns:repeat(auto-fill,minmax(100px,1fr))}
  .board-header{justify-content:space-between}
  .back{font-size:12px;text-decoration:none}
  header button{display:inline-flex;align-items:center;gap:6px}
  @media(max-width:780px){.workspace.withBoards{grid-template-columns:minmax(0,1fr)}.boards{position:fixed;z-index:42;right:0;top:var(--shell-height,60px);bottom:0;width:min(420px,100vw);max-height:none;background:var(--wand-menu);padding:12px;box-shadow:0 0 24px #0008}}

  .bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  h1,h2,h3{font-size:1rem;margin:0 8px 0 0}
  button,input,select,textarea{background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:7px;padding:7px 9px;min-width:0}
  .activeTab,button[aria-pressed=true]{border-color:var(--wand-accent)} .item[aria-pressed=true]{outline:2px solid var(--wand-accent);outline-offset:-2px}
  .filters input[type=search]{flex:1;min-width:140px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(114px,1fr));gap:8px}
  .tile{display:flex;flex-direction:column;gap:4px;border:1px solid var(--wand-line);border-radius:9px;padding:5px;min-width:0;font-size:12px;overflow-wrap:anywhere}
  .item{padding:0;border:0;background:transparent;display:grid;gap:4px;text-align:center;width:100%;flex:1}
  .art{display:block;height:92px;min-width:0}.actions{display:flex;gap:4px;justify-content:space-between}.actions button{flex:1;padding:3px}
  .board-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:8px;margin-bottom:16px}
  .board-card{display:grid;gap:6px;overflow-wrap:anywhere}.cover{display:grid;grid-template-columns:repeat(2,1fr);min-height:94px;grid-auto-rows:47px}
  .cover span{min-height:0}.note{display:grid;gap:4px;margin:10px 0}.note textarea{min-height:70px;resize:vertical}
  .review{position:fixed;right:12px;bottom:12px;z-index:40;padding:12px;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:12px;max-width:min(310px,95vw);box-shadow:0 8px 30px #0008}
  .large{height:170px}
  .toolbar{gap:4px;border-bottom:1px solid var(--wand-line);padding-bottom:8px;margin-bottom:10px}
  .spacer{flex:1}.icon-button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:36px;min-height:36px;padding:5px;border:0;background:transparent;color:var(--wand-text);text-decoration:none;cursor:pointer}
  .icon-button:hover,.icon-button[aria-pressed=true],.icon-button[aria-expanded=true],.icon-button.activeTab{background:var(--wand-pill-bg);color:var(--wand-accent-strong)}
  .back :global(svg){transform:rotate(180deg)}
  .active-name{max-width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.78rem}
  .search{width:100%;box-sizing:border-box;margin-bottom:10px}
  .filter-panel{background:var(--wand-menu);border:1px solid var(--wand-line);padding:12px;border-radius:10px;margin-bottom:12px;max-height:55vh;overflow:auto}
  .filter-panel details{border-top:1px solid var(--wand-line);padding:8px 0}.filter-panel summary{cursor:pointer;font-size:.85rem}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.chips button{display:inline-flex;align-items:center;gap:5px;font-size:.78rem}.chips button[aria-pressed=true]{background:var(--wand-accent-strong);color:var(--wand-accent-contrast)}
  .swatch{width:16px;height:16px;border-radius:50%;border:1px solid var(--wand-line)}
  .shelf-row{padding-left:12px;margin:0 0 8px;border-left:2px solid var(--wand-line);min-width:0}
  .category-heading{background:none;border:0;font-size:.85rem;font-weight:600;padding:3px 0;color:var(--wand-muted);cursor:pointer;text-align:left}
  .large-universe{border-top:1px solid var(--wand-line);padding-top:10px}
  .shelf{margin:0 0 14px;min-width:0}.shelf-heading{display:flex;align-items:center;gap:5px;margin-bottom:4px}
  .universe-heading{background:none;border:0;padding:4px 0;font-size:1rem;font-weight:650;cursor:pointer;text-align:left}
  .universe-heading span{color:var(--wand-muted);margin-left:4px}
  .shelf-items{padding:3px 0 7px;min-width:0}
  .catalog .tiles{grid-template-columns:repeat(auto-fill,minmax(min(100%,94px),1fr));gap:6px}
  /* Off-screen sections keep their place in the single page. No item limits,
     independent scroll containers, or mandatory expansion clicks. */
  .shelf-items{content-visibility:auto;contain-intrinsic-size:auto 400px}
  .catalog-tile{position:relative;min-width:0;aspect-ratio:1;border:1px solid var(--wand-line);border-radius:8px;background:var(--wand-visual-bg);overflow:hidden}
  .catalog-tile.inBoard{border-color:var(--wand-accent);box-shadow:inset 0 0 0 1px var(--wand-accent)}
  .catalog-tile .item{width:100%;height:100%;padding:6px}.catalog-tile .art{height:100%;min-height:0}
  .variants-button{position:absolute;right:3px;bottom:3px;display:flex;align-items:center;gap:2px;font-size:10px;background:var(--wand-menu);padding:3px;border:0;border-radius:5px;cursor:pointer}
  .variant-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:8px 0;max-height:180px;overflow:auto}.variant-grid button{height:46px;padding:2px}.variant-grid button[aria-pressed=true]{outline:2px solid var(--wand-accent)}
  .tile-add,.tile-favorite{position:absolute;display:grid;place-items:center;width:27px;height:27px;padding:2px;border:0;background:var(--wand-menu);border-radius:6px;cursor:pointer}
  .tile-add{right:3px;top:3px}.tile-favorite{left:3px;bottom:3px;opacity:0}
  .tile-add[aria-pressed=true],.tile-favorite[aria-pressed=true]{background:var(--wand-accent-strong);color:var(--wand-accent-contrast);opacity:1}
  .catalog-tile:hover .tile-favorite,.catalog-tile:focus-within .tile-favorite{opacity:1}
  .visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  @media(pointer:coarse){.tile-favorite{opacity:1}}
  @media(max-width:780px){.boards{top:auto;bottom:0;left:0;right:0;width:100%;box-sizing:border-box;max-height:58dvh;border-left:0;border-top:1px solid var(--wand-line);border-radius:12px 12px 0 0}.workspace.withBoards{padding-bottom:58dvh}.active-name{display:none}}
  @media(max-width:600px){.decorate{padding:8px}.tiles{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}.art{height:70px}.catalog .tiles{grid-template-columns:repeat(auto-fill,minmax(min(100%,78px),1fr))}.toolbar h1{margin:0}.toolbar .icon-button{min-width:32px}}
</style>
