<script lang="ts">
  import {onMount,tick,untrack} from 'svelte';
  import ExploreQuickView from '$lib/explore/ExploreQuickView.svelte';
  import {loadExploreCatalog,loadExploreHistoricalArtwork} from '$lib/explore/catalog-cache';
  import {readExploreBrowseSnapshot,type ExploreBrowseSnapshot} from '$lib/explore/browse-snapshot';

  import {registerServiceToolbar} from '$lib/ui/service-toolbar';
  import {localSaveSession} from '$lib/ui/local-save-session';
  import {readRecordedOwnership,readSelectedOwnership} from '$lib/explore/ownership';
  import {CATEGORY_KEYS,categoriesOf,matchesScope,readDecorationScope,DECORATION_SCOPE_KEY,type DecorationScope,type ExploreCategory} from '$lib/explore/scope';
  import {exploreLabel,CATEGORY_ICONS} from '$lib/explore/copy';
  import type {ItemMasterTagLabel} from '$lib/items/public-item-master';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {base} from '$app/paths';
  import {goto,beforeNavigate} from '$app/navigation';
  import {catalogHandoff,catalogPlacementCandidate,worldIncoming,worldIncomingWords} from '$lib/world/world-incoming.ts';
  import ItemArtwork from '$lib/collection/ItemArtwork.svelte';
  import VirtualCatalogGrid from '$lib/explore/VirtualCatalogGrid.svelte';
  import {captureCatalogAnchor,restoreCatalogAnchor} from '$lib/explore/viewport-anchor';
  import {COLLECTION_UNIVERSE_TAG_NAMES} from '$lib/collection/universe-tag-names';
  import {FACETS,emptyFilters,groupItems,matches,isLargeUniverse,universeRank,type ExploreFilters,type Facet} from '$lib/explore/browse';
  import {seriesShelves,orderedSeriesDesigns,type SeriesShelf,type DesignTile,type ReleaseGroup} from '$lib/explore/series';
  import {collectionDb01FacetLabel,collectionDb01TagLabel,COLLECTION_DB01_COLOR_SWATCHES} from '$lib/collection/db01-native-facets';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
  import {emptyBoards,readBoards,createBoard,editBoard,toggleItem,deleteBoard,toggleFavorite,STORAGE_KEY,type ExploreItem,type BoardState} from '$lib/explore/model';
  let locale=$state<WandLanguage>('ja');
  let items=$state.raw<ExploreItem[]>([]);
  let images=$state.raw<Record<string,string>>({});
  let boards=$state.raw<BoardState>(emptyBoards());
  let storageRaw:string|null=null;
  let ready=$state(false),loading=$state(true),failed=$state(false),storageFailed=$state(false);
  let boardsOpen=$state(false),search=$state(''),favorites=$state(false),ownedOnly=$state(false),ownershipAvailable=$state(false);
  let ownedIds=$state.raw<ReadonlySet<number>>(new Set());
  let scope=$state<DecorationScope>('outdoor');
  const label=(key:string)=>exploreLabel(locale,key);
  let newName=$state(''),rename=$state(''),groupName=$state(''),selected=$state<ExploreItem|null>(null);
  const t=(ja:string,en:string)=>locale==='ja'?ja:en;
  const facets=FACETS.filter(k=>k!=='furnitureKind');
  let filters=$state<ExploreFilters>(emptyFilters()),filtersOpen=$state(false);
  let releases=$state.raw<ReleaseGroup[]>([]);
  let variantChoices=$state<Record<string,number>>({}),variantReview=$state<ExploreItem[]>([]),reviewDesign=$state<DesignTile|null>(null);
  let catalogWidth=$state(0),catalogNode=$state<HTMLDivElement>();
  let previousWidth=0,layoutEpoch=0;
  let sourceUniverses=$state.raw<{tagId:number;key:string;names:Record<string,string|null>}[]>([]);
  let sourceWorlds=$state.raw<readonly ItemMasterTagLabel[]>([]);
  let selectionMode=$state(false),selectedIds=$state<number[]>([]);
  let ownershipSettled=$state(false),restoreOwned=false;
  let pendingRestore=$state.raw<ExploreBrowseSnapshot|null>(null);
  let restoring=false,disposed=false;
  let focusReturnId:number|null=null;
  let navigationSnapshot:ExploreBrowseSnapshot|null=null;
  function captureBrowse():ExploreBrowseSnapshot{
    return {schema:1,scope,search,filters:$state.snapshot(filters),favorites,ownedOnly,boardsOpen,filtersOpen,
      selectionMode,selectedIds:[...selectedIds],selectedId:selected?.itemId??null,
      variantKey:reviewDesign?.key??null,variantIds:variantReview.map(i=>i.itemId),variantChoices:{...variantChoices},
      scrollY:window.scrollY,anchor:catalogNode?captureCatalogAnchor(catalogNode):null};
  }
  function applyBrowse(raw:unknown){
    const saved=readExploreBrowseSnapshot(raw);if(!saved)return;
    restoring=true;pendingRestore=saved;scope=saved.scope;search=saved.search;filters=saved.filters;
    favorites=saved.favorites;restoreOwned=saved.ownedOnly&&!ownershipSettled;ownedOnly=ownershipAvailable&&saved.ownedOnly;
    boardsOpen=saved.boardsOpen;filtersOpen=saved.filtersOpen;selectionMode=saved.selectionMode;
    selectedIds=saved.selectedIds;variantChoices=saved.variantChoices;
  }
  beforeNavigate(()=>{navigationSnapshot=captureBrowse();});
  export const snapshot={capture:()=>navigationSnapshot??captureBrowse(),restore:applyBrowse};
  $effect(()=>{
    const saved=pendingRestore;
    if(!saved||loading||!catalogWidth||saved.ownedOnly&&!ownershipSettled)return;
    const node=catalogNode;if(!node)return;
    untrack(()=>{
      const item=saved.selectedId===null?undefined:byId.get(saved.selectedId);
      if(item){
        const members=saved.variantIds.flatMap(id=>{const member=byId.get(id);return member?[member]:[];});
        const design=saved.variantKey&&members.some(i=>i.itemId===item.itemId)?{key:saved.variantKey,items:members}:undefined;
        showReview(item,design);
      }
      pendingRestore=null;
      const epoch=++layoutEpoch;
      void tick().then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(disposed||epoch!==layoutEpoch||!node.isConnected){restoring=false;return;}
        window.scrollTo({top:saved.scrollY,behavior:'instant'});
        if(saved.anchor)restoreCatalogAnchor(node,saved.anchor);
        restoring=false;
      })));
    });
  });
  const nameOf=(i:ExploreItem)=>i.names[locale]??i.names.en??t('名称未確認','Unnamed item');
  const byId=$derived(new Map(items.map(i=>[i.itemId,i])));
  const active=$derived(boards.boards.find(b=>b.id===boards.active)??null);
  const activeIds=$derived(new Set(active?.entries.map(e=>e.itemId)??[]));
  const boardCandidates=$derived((active?.entries??[]).map(e=>byId.get(e.itemId)).filter((i):i is ExploreItem=>!!i&&catalogPlacementCandidate(i)));
  const selectedCandidates=$derived(selectedIds.map(id=>byId.get(id)).filter((i):i is ExploreItem=>!!i&&catalogPlacementCandidate(i)));
  const incomingWords=$derived(worldIncomingWords[locale]);
  function sendCandidates(candidates:readonly ExploreItem[]){
   const handoff=catalogHandoff(candidates.filter(catalogPlacementCandidate).map(i=>({itemId:i.itemId,name:nameOf(i)})));
   if(!handoff)return;
   worldIncoming.set(handoff);void goto(base+'/world/');
  }
  const favoriteIds=$derived(new Set(boards.favorites));
  const universeNames=$derived(new Map([...sourceUniverses.map(u=>[String(u.tagId),{label:u.names[locale]??u.names.en??u.key,sort:u.names[locale]??u.names.en??u.key}] as const),...COLLECTION_UNIVERSE_TAG_NAMES.map(u=>[String(u.id),{label:u.names[locale],sort:locale==='ja'?u.jaReading:u.names[locale]}] as const)]));
  function universeName(key:string){return key==='none'?t('ユニバースなし','No universe'):key==='unknown'?t('ユニバース未確認','Universe unconfirmed'):universeNames.get(key)?.label??t('ユニバース未確認','Universe unconfirmed');}
  function sortUniverse(a:string,b:string){
    return universeRank(a)-universeRank(b)||(universeNames.get(a)?.sort??a).localeCompare(universeNames.get(b)?.sort??b,locale);
  }
  const allGroups=$derived(groupItems(items));
  const universeOptions=$derived([...new Set([...universeNames.keys(),...allGroups.keys()])].sort(sortUniverse));
  const scopedItems=$derived(items.filter(i=>matchesScope(i,scope)));
  const scopedUniverses=$derived(new Set(scopedItems.flatMap(i=>i.universes.length?i.universes.map(String):[i.universeStatus==='unresolved_source'?'unknown':'none'])));
  const scopeCategories=$derived(new Set(scopedItems.flatMap(categoriesOf)));
  const categoryOptions=$derived(CATEGORY_KEYS.filter(key=>scopeCategories.has(key)||filters.categories?.includes(key)));
  const worldOptions=$derived(sourceWorlds.map(w=>({key:w.key,label:w.names[locale]??w.names.en??w.key})));
  const worldName=(key:string)=>worldOptions.find(w=>w.key===key)?.label??key;
  const facetOptions=$derived.by(()=>{
    const sets:Record<Facet,Set<string>>={furnitureKind:new Set(),color:new Set(),furnitureStyle:new Set()};
    for(const item of items)for(const [key,value] of item.tags)sets[key]?.add(value);
    return Object.fromEntries(facets.map(key=>[key,[...sets[key]].sort()])) as Record<Facet,string[]>;
  });
  const filtered=$derived.by(()=>{
    const q=search.trim().toLocaleLowerCase();
    return scopedItems.filter(i=>matches(i,filters)&&(!favorites||favoriteIds.has(i.itemId))&&(!ownedOnly||ownedIds.has(i.itemId))&&(!q||nameOf(i).toLocaleLowerCase().includes(q)));
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
  function ordinaryDesigns(list:readonly ExploreItem[]):DesignTile[]{return list.map(item=>({key:'item:'+item.itemId,items:[item]}));}
  function universeDesigns(key:string,list:readonly ExploreItem[]):DesignTile[]{
    return isLargeUniverse(key)?orderedSeriesDesigns(visibleSeries.get(key)??[]):ordinaryDesigns(list);
  }
  const sections=$derived.by(():[string,DesignTile[]][]=>{
    return shelves.map(([key,list])=>[key,universeDesigns(key,list)]);
  });
  const total=$derived(sections.reduce((n,[,list])=>n+list.length,0));
  // Keep the scroll extent stable; all section geometry is computed from
  // a single measured catalog width, independently of card mounting.
  $effect.pre(()=>{
    const width=catalogWidth;
    const before=previousWidth;
    previousWidth=width;
    if(!width||!before||width===before||restoring)return;
    untrack(()=>{
      const node=catalogNode;
      const anchor=node?captureCatalogAnchor(node):null;
      const epoch=++layoutEpoch;
      if(anchor&&node)void tick().then(()=>{
        if(epoch===layoutEpoch&&node.isConnected)restoreCatalogAnchor(node,anchor);
      });
    });
  });
  function displayed(d:DesignTile){return d.items.find(i=>i.itemId===variantChoices[d.key])??d.items[0];}
  function showReview(i:ExploreItem,design?:DesignTile){
    focusReturnId=i.itemId;selected=i;reviewDesign=design??null;variantReview=design?.items??[i];
  }
  function closeReview(){
    selected=null;reviewDesign=null;variantReview=[];
    const id=focusReturnId;
    void tick().then(()=>{if(id!==null)catalogNode?.querySelector<HTMLButtonElement>('[data-item-id="'+id+'"] .item')?.focus({preventScroll:true});});
  }
  function reviewAttributes(i:ExploreItem){
    const tags=(facet:Facet)=>[...new Set(i.tags.filter(([key])=>key===facet).map(([,key])=>collectionDb01TagLabel(locale,key)))];
    const hint=i.sourcePlacement?.ordinaryScope?.scopeHint;
    return [
      {label:label('universe'),values:i.universes.map(id=>universeName(String(id)))},
      {label:collectionDb01FacetLabel(locale,'color'),values:tags('color')},
      {label:collectionDb01FacetLabel(locale,'furnitureStyle'),values:tags('furnitureStyle')},
      {label:label('category'),values:categoriesOf(i).map(key=>label(key))},
      {label:label('placementHint'),values:hint&&hint!=='unknown'?[label(hint)]:[]}
    ].filter(row=>row.values.length);
  }
  function pickVariant(d:DesignTile,i:ExploreItem){variantChoices={...variantChoices,[d.key]:i.itemId};showReview(i,d);}

  const filterCount=$derived((filters.categories?.length??0)+(filters.worlds?.length??0)+filters.universes.length+facets.reduce((n,k)=>n+filters.tags[k].length,0));
  function resetBrowse(){restoring=false;pendingRestore=null;layoutEpoch++;window.scrollTo({top:0,behavior:'instant'});}
  function setScope(next:DecorationScope){scope=next;try{localStorage.setItem(DECORATION_SCOPE_KEY,next);}catch{}resetBrowse();}
  function toggleCategory(key:ExploreCategory){const list=filters.categories??[];filters.categories=list.includes(key)?list.filter(x=>x!==key):[...list,key];resetBrowse();}
  function toggleWorld(key:string){const list=filters.worlds??[];filters.worlds=list.includes(key)?list.filter(x=>x!==key):[...list,key];resetBrowse();}
  function clearFilters(){filters=emptyFilters();resetBrowse();}
  function toggleSelection(){selectionMode=!selectionMode;selectedIds=[];}
  function toggleUniverse(key:string){filters.universes=filters.universes.includes(key)?filters.universes.filter(x=>x!==key):[...filters.universes,key];resetBrowse();}
  function toggleFacet(key:Facet,value:string){const list=filters.tags[key];filters.tags[key]=list.includes(value)?list.filter(x=>x!==value):[...list,value];resetBrowse();}
  function narrowRail(){return window.matchMedia('(max-width:780px)').matches;}
  function toggleBoards(){if(selected&&narrowRail()){closeReview();boardsOpen=true;}else boardsOpen=!boardsOpen;}
  function chooseItem(id:number){if(active)toggle(id);else{if(selected&&narrowRail())closeReview();boardsOpen=true;}}
  function save(next:BoardState){if(!ready||storageFailed)return;try{
    if(localStorage.getItem(STORAGE_KEY)!==storageRaw)throw Error('CONFLICT');
    const raw=JSON.stringify(next);localStorage.setItem(STORAGE_KEY,raw);storageRaw=raw;boards=next;
  }catch{storageFailed=true;}}
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
    const unregister=registerServiceToolbar(exploreToolbar);
    if(!pendingRestore)try{scope=readDecorationScope(localStorage.getItem(DECORATION_SCOPE_KEY));}catch{}
    let ownershipAbort:AbortController|undefined,ownershipRevision=-1;
    const unsubscribeSave=localSaveSession.subscribe(session=>{
      if(session.revision===ownershipRevision)return;
      ownershipRevision=session.revision;
      ownershipAbort?.abort();const controller=new AbortController();ownershipAbort=controller;
      ownershipAvailable=false;ownedOnly=false;ownedIds=new Set();ownershipSettled=false;
      const task=session.file?readSelectedOwnership(session.file,controller.signal):readRecordedOwnership();
      void task.then(result=>{if(!controller.signal.aborted){ownershipAvailable=result.available;ownedIds=result.ids;ownedOnly=result.available&&restoreOwned;restoreOwned=false;}}).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)ownershipSettled=true;});
    });
    try{storageRaw=localStorage.getItem(STORAGE_KEY);boards=readBoards(storageRaw);ready=true;}catch{storageFailed=true;}
    void loadExploreCatalog(base).then(d=>{
      if(disposed)return;
      items=d.items;sourceUniverses=d.universeTags;sourceWorlds=d.worldTags;releases=d.releases;loading=false;
    },()=>{if(!disposed){failed=true;loading=false;}});
    void loadExploreHistoricalArtwork(base).then(d=>{if(!disposed)images=d;}).catch(()=>{});
    const storageListener=(e:StorageEvent)=>{if(e.key===STORAGE_KEY){try{storageRaw=e.newValue;boards=readBoards(storageRaw);}catch{storageFailed=true;}}};
    window.addEventListener('storage',storageListener);
    return()=>{disposed=true;unwatch();unregister();unsubscribeSave();ownershipAbort?.abort();window.removeEventListener('storage',storageListener);};
  });
</script>
{#snippet exploreToolbar()}
  <div class="explore-service-toolbar" aria-label="Explore">
    <a class="icon-button back" href={base+'/decorate/'} aria-label="Decorate" title="Decorate"><WandIcon name="arrow" size={17}/></a>
    <div class="scope-switch" role="group" aria-label={label('category')}>
      {#each ['outdoor','indoor','all'] as choice}
        <button data-scope={choice} aria-label={label(choice)} title={label(choice)} aria-pressed={scope===choice} onclick={()=>setScope(choice as DecorationScope)}><WandIcon name={choice==='outdoor'?'plant':choice==='indoor'?'home':'grid'} size={17}/><span>{label(choice)}</span></button>
      {/each}
    </div>
    <input class="search" type="search" placeholder={label('search')} aria-label={label('search')} bind:value={search} oninput={resetBrowse}/>
    <button class="icon-button" aria-label={label('filters')} title={label('filters')} aria-expanded={filtersOpen} class:activeTab={filterCount>0} onclick={()=>filtersOpen=!filtersOpen}><WandIcon name="filter" size={20}/>{#if filterCount}<small>{filterCount}</small>{/if}</button>
    <button class="icon-button" aria-label={label('owned')} title={ownershipAvailable?label('owned'):label('noOwnership')} aria-pressed={ownedOnly} disabled={!ownershipAvailable} onclick={()=>{ownedOnly=!ownedOnly;resetBrowse();}}><WandIcon name="owned" size={20}/></button>
    <button class="icon-button" aria-label={label('favorites')} title={label('favorites')} aria-pressed={favorites} onclick={()=>{favorites=!favorites;resetBrowse();}}><WandIcon name="star" size={20}/></button>
    <button class="icon-button" aria-label={label('boards')} title={active?.name??label('boards')} aria-expanded={boardsOpen} class:activeTab={boardsOpen} onclick={toggleBoards}><WandIcon name="collection" size={20}/>{#if active}<span class="active-name">{active.name}</span>{/if}</button>
    {#if selectionMode}<button class="icon-button" aria-label={t('選択を追加','Add selected')} disabled={!active||!selectedIds.length||storageFailed} onclick={bulkAdd}><WandIcon name="plus" size={16}/>{selectedIds.length}</button>{#if selectedCandidates.length}<button class="icon-button" aria-label={incomingWords[1]} title={incomingWords[1]} onclick={()=>sendCandidates(selectedCandidates)}><WandIcon name="world" size={18}/>{selectedCandidates.length}</button>{/if}<button class="icon-button" aria-label={label('close')} onclick={toggleSelection}><WandIcon name="close" size={16}/></button>{/if}
    {#if filtersOpen}
      <section class="filter-panel" aria-label={label('filters')}>
        <div class="bar filter-heading"><strong>{label('filters')}</strong><span class="spacer"></span><button onclick={clearFilters}>{label('clear')}</button><button class="icon-button" aria-label={label('close')} onclick={()=>filtersOpen=false}><WandIcon name="close"/></button></div>
        <h3>{label('category')}</h3>
        <div class="category-chips">{#each categoryOptions as key}<button class="category-chip" aria-pressed={filters.categories?.includes(key)??false} onclick={()=>toggleCategory(key)}><WandIcon name={CATEGORY_ICONS[key]} size={24}/><span>{label(key)}</span></button>{/each}</div>
        <h3>{label('universe')}</h3>
        <div class="chips universe-chips">{#each universeOptions as key}<button data-universe-filter={key} title={universeName(key)} aria-pressed={filters.universes.includes(key)} class:no-match={!scopedUniverses.has(key)} onclick={()=>toggleUniverse(key)}>{universeName(key)}</button>{/each}</div>
        {#each facets as facet}
          {#if facetOptions[facet].length}<h3>{collectionDb01FacetLabel(locale,facet)}</h3><div class="chips">{#each facetOptions[facet] as key}
            <button aria-pressed={filters.tags[facet].includes(key)} title={collectionDb01TagLabel(locale,key)} aria-label={collectionDb01TagLabel(locale,key)} onclick={()=>toggleFacet(facet,key)}>{#if facet==='color'&&COLLECTION_DB01_COLOR_SWATCHES[key.replace(/^(?:F_|C_)/,'')]}<span class="swatch" style:background={COLLECTION_DB01_COLOR_SWATCHES[key.replace(/^(?:F_|C_)/,'')]}></span>{:else}{collectionDb01TagLabel(locale,key)}{/if}</button>
          {/each}</div>{/if}
        {/each}
        {#if worldOptions.length}<h3>{label('world')}</h3><div class="chips">{#each worldOptions as world}<button data-world-filter={world.key} aria-pressed={filters.worlds?.includes(world.key)??false} onclick={()=>toggleWorld(world.key)}><WandIcon name="world" size={18}/>{world.label}</button>{/each}</div>{/if}
      </section>
    {/if}
  </div>
{/snippet}
<svelte:head><title>Explore · Dreamwish Wand</title></svelte:head>
<section class="decorate">
  {#if storageFailed}<p role="alert">{t('保存できません。再読み込みしてください。','Storage unavailable. Reload before editing.')}</p>{/if}
  <div class="workspace" class:withBoards={boardsOpen} class:withReview={Boolean(selected)}>
  <div class="catalog" bind:this={catalogNode} bind:clientWidth={catalogWidth} data-explore-total={total}>
    {#if filterCount}
      <div class="active-filters">
        {#each filters.categories??[] as key}<button onclick={()=>toggleCategory(key)}>{label(key)} <WandIcon name="close" size={12}/></button>{/each}
        {#each filters.universes as key}<button onclick={()=>toggleUniverse(key)}>{universeName(key)} <WandIcon name="close" size={12}/></button>{/each}
        {#each facets as facet}{#each filters.tags[facet] as key}<button onclick={()=>toggleFacet(facet,key)}>{collectionDb01TagLabel(locale,key)} <WandIcon name="close" size={12}/></button>{/each}{/each}
        {#each filters.worlds??[] as key}<button onclick={()=>toggleWorld(key)}>{worldName(key)} <WandIcon name="close" size={12}/></button>{/each}
        <button aria-label={label('clear')} onclick={clearFilters}><WandIcon name="close" size={15}/></button>
      </div>
    {/if}
    {#if loading}<p>{t('読み込み中…','Loading…')}</p>{:else if failed}<p role="alert">{t('家具データを読み込めません。','Decoration catalog could not be loaded.')}</p>{:else}
      {#each sections as [key,designs] (key)}
        <section class="shelf" data-explore-universe={key}>
          <h2 class="universe-heading">{universeName(key)}</h2>
          <VirtualCatalogGrid items={designs} tile={designTile} width={catalogWidth}/>
        </section>
      {/each}
      {#if filtered.length===0}<p>{t('該当するアイテムがありません','No matching items')}</p>{/if}
    {/if}
  </div>
  {#if boardsOpen||selected}
  <div class="right-rail" class:hasReview={Boolean(selected)} class:hasBoards={boardsOpen}>
    {#if selected}
      {@const item=selected}
      {#snippet reviewActions()}
        <button disabled={!ready||storageFailed} aria-pressed={activeIds.has(item.itemId)} onclick={()=>chooseItem(item.itemId)}><WandIcon name={activeIds.has(item.itemId)?'check':'plus'} size={17}/>{label(activeIds.has(item.itemId)?'removeBoard':'addBoard')}</button>
        <button aria-label={label('favorites')} title={label('favorites')} aria-pressed={favoriteIds.has(item.itemId)} disabled={!ready||storageFailed} onclick={()=>save(toggleFavorite(boards,item.itemId))}><WandIcon name="star" size={17}/></button>
        {#if catalogPlacementCandidate(item)}<button onclick={()=>sendCandidates([item])}><WandIcon name="world" size={17}/>{incomingWords[0]}</button>{/if}
      {/snippet}
      {#snippet reviewVariants()}
        {#if variantReview.length>1}<div class="variant-grid">{#each variantReview as variant (variant.itemId)}<button aria-label={nameOf(variant)} title={nameOf(variant)} aria-pressed={item.itemId===variant.itemId} onclick={()=>{if(reviewDesign)pickVariant(reviewDesign,variant);}}><ItemArtwork itemId={variant.itemId} sourcePath={images[String(variant.itemId)]??null}/></button>{/each}</div>{/if}
      {/snippet}
      <ExploreQuickView {item} name={nameOf(item)} {locale} sourcePath={images[String(item.itemId)]??null} attributes={reviewAttributes(item)} owned={ownedIds.has(item.itemId)} actions={reviewActions} variants={reviewVariants} close={closeReview}/>
    {/if}
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
      <div class="bar"><button aria-pressed={selectionMode} onclick={toggleSelection}><WandIcon name="check" size={16}/> {label('select')}</button></div>
      <div class="bar"><h2>{active.name}</h2><input bind:value={rename} aria-label={t('新しい名前','New name')} placeholder={t('新しい名前','New name')}/><button disabled={!rename.trim()||storageFailed} onclick={changeName}>{t('名前変更','Rename')}</button><button disabled={storageFailed} onclick={removeBoard}>{t('削除','Delete')}</button></div>
      {#if boardCandidates.length}<button onclick={()=>sendCandidates(boardCandidates)}>{incomingWords[1]} · {boardCandidates.length}</button>{/if}
      {#key active.id}<label class="note">{t('メモ','Notes')}<textarea value={active.note} disabled={storageFailed} onchange={e=>{if(active)save(editBoard(boards,active.id,b=>({...b,note:e.currentTarget.value})));}}></textarea></label>{/key}
      <div class="bar"><input bind:value={groupName} aria-label={t('グループ名','Group name')} placeholder={t('グループ名','Group name')}/><button disabled={!groupName.trim()||storageFailed} onclick={addGroup}>{t('グループ作成','Add group')}</button></div>
      {#each [{id:null,name:t('未分類','Unsorted')},...active.groups] as group (group.id)}
        <div class="bar"><h3>{group.name}</h3>{#if group.id!==null}<button disabled={storageFailed} onclick={()=>removeGroup(group.id!)}>{t('グループ削除','Delete group')}</button>{/if}</div>
        <div class="tiles">
        {#each active.entries.filter(e=>e.groupId===group.id) as entry (entry.itemId)}
          {@const item=byId.get(entry.itemId)}
          <article class="tile">
            <span class="art"><ItemArtwork itemId={entry.itemId} sourcePath={images[String(entry.itemId)]??null}/></span>
            <span>{item?nameOf(item):t('アイテム情報なし','Item unavailable')}</span>{#if item&&catalogPlacementCandidate(item)}<button onclick={()=>sendCandidates([item])}>{incomingWords[0]}</button>{/if}
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
  {/if}
  </div>
  {#snippet designTile(design:DesignTile)}
    {@const item=displayed(design)}
    {@render itemTile(item,design)}
  {/snippet}
  {#snippet itemTile(item:ExploreItem,design?:DesignTile)}
    <article class="catalog-tile" data-item-id={item.itemId} class:inBoard={activeIds.has(item.itemId)}>
      <button class="item" aria-label={nameOf(item)} title={nameOf(item)} aria-pressed={selectionMode?selectedIds.includes(item.itemId):undefined} onclick={()=>selectionMode?selectItem(item.itemId):showReview(item,design)}><span class="art"><ItemArtwork itemId={item.itemId} sourcePath={images[String(item.itemId)]??null}/></span><span class="visually-hidden">{nameOf(item)}</span></button>
      <div class="tile-controls">
      <button class="tile-favorite" aria-label={t('お気に入り','Favorite')} aria-pressed={favoriteIds.has(item.itemId)} disabled={!ready||storageFailed} onclick={()=>save(toggleFavorite(boards,item.itemId))}><WandIcon name="star" size={16}/></button>
      {#if design&&design.items.length>1}
        <button class="variants-button" aria-label={t('色違いを選択','Choose variant')} title={t('色違いを選択','Choose variant')} onclick={()=>showReview(item,design)}><WandIcon name="palette" size={14}/>{design.items.length}</button>
      {/if}
      <button class="tile-add" aria-label={activeIds.has(item.itemId)?t('ボードから削除','Remove from board'):t('ボードに追加','Add to board')} aria-pressed={activeIds.has(item.itemId)} disabled={!ready||storageFailed} onclick={()=>chooseItem(item.itemId)}><WandIcon name={activeIds.has(item.itemId)?'check':'plus'} size={17}/></button>
      </div>
    </article>
  {/snippet}

</section>
<style>
  .decorate{padding:12px 16px;min-width:0;position:relative}
  .workspace{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
  .workspace.withBoards,.workspace.withReview{grid-template-columns:minmax(0,1fr) minmax(310px,35%)}
  .right-rail{min-width:0;position:sticky;top:calc(var(--shell-height,60px) + 12px);max-height:calc(100dvh - var(--shell-height,60px) - 24px);display:flex;flex-direction:column;gap:8px;overflow:hidden}
  .right-rail :global(.quick-view){flex:1 1 auto;min-height:0}
  .right-rail.hasReview.hasBoards{height:calc(100dvh - var(--shell-height,60px) - 24px)}
  .right-rail.hasReview.hasBoards :global(.quick-view){flex:0 1 62%;max-height:62%}
  .right-rail.hasReview.hasBoards .boards{flex:1 1 38%;min-height:0;overflow:auto}
  .catalog{min-width:0;overflow-anchor:none}
  .boards{min-width:0;max-height:calc(100dvh - var(--shell-height,60px) - 24px);overflow:auto;border-left:1px solid var(--wand-line);padding-left:12px}
  .boards .tiles{grid-template-columns:repeat(auto-fill,minmax(100px,1fr))}
  .board-header{justify-content:space-between}
  .back{font-size:12px;text-decoration:none}

  .bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  h1,h2,h3{font-size:1rem;margin:0 8px 0 0}
  button,input,select,textarea{background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:7px;padding:7px 9px;min-width:0}
  .activeTab,button[aria-pressed=true]{border-color:var(--wand-accent)} .item[aria-pressed=true]{outline:2px solid var(--wand-accent);outline-offset:-2px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(114px,1fr));gap:8px}
  .tile{display:flex;flex-direction:column;gap:4px;border:1px solid var(--wand-line);border-radius:9px;padding:5px;min-width:0;font-size:12px;overflow-wrap:anywhere}
  .item{padding:0;border:0;background:transparent;display:grid;gap:4px;text-align:center;width:100%;flex:1}
  .art{display:block;height:92px;min-width:0}.actions{display:flex;gap:4px;justify-content:space-between}.actions button{flex:1;padding:3px}
  .board-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:8px;margin-bottom:16px}
  .board-card{display:grid;gap:6px;overflow-wrap:anywhere}.cover{display:grid;grid-template-columns:repeat(2,1fr);min-height:94px;grid-auto-rows:47px}
  .cover span{min-height:0}.note{display:grid;gap:4px;margin:10px 0}.note textarea{min-height:70px;resize:vertical}
  .spacer{flex:1}.icon-button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:36px;min-height:36px;padding:5px;border:0;background:transparent;color:var(--wand-text);text-decoration:none;cursor:pointer}
  .icon-button:hover,.icon-button[aria-pressed=true],.icon-button[aria-expanded=true],.icon-button.activeTab{background:var(--wand-pill-bg);color:var(--wand-accent-strong)}
  .back :global(svg){transform:rotate(180deg)}
  .active-name{max-width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.78rem}
  .search{flex:1;min-width:54px;width:100%;box-sizing:border-box;height:35px;margin:0}
  .explore-service-toolbar{display:flex;align-items:center;gap:3px;width:100%;min-width:0;color:var(--wand-text)}
  .scope-switch{display:flex;gap:2px;flex:none}
  .scope-switch button{display:flex;align-items:center;justify-content:center;gap:3px;padding:5px;height:35px;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:7px;color:var(--wand-text)}
  .scope-switch button[aria-pressed=true]{background:var(--wand-accent-strong);color:var(--wand-accent-contrast)}
  .scope-switch span{font-size:12px;white-space:nowrap}
  .explore-service-toolbar .icon-button:disabled{opacity:.35;cursor:not-allowed}
  .filter-panel{position:fixed;top:var(--shell-height,60px);left:8px;z-index:75;width:min(720px,calc(100vw - 16px));box-sizing:border-box;background:var(--wand-menu);color:var(--wand-text);border:1px solid var(--wand-line);padding:12px;border-radius:10px;max-height:calc(100dvh - var(--shell-height,60px) - 16px);overflow:auto;box-shadow:0 12px 35px #0005}
  .filter-panel h3{margin:9px 0 3px;font-size:.85rem;border-top:1px solid var(--wand-line);padding-top:8px}
  .filter-heading{margin-bottom:4px}
  .category-chips{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:5px}
  .category-chip{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;padding:6px 2px}
  .category-chip[aria-pressed=true]{background:var(--wand-accent-strong);color:var(--wand-accent-contrast)}
  .chips .no-match:not([aria-pressed=true]){opacity:.45}
  .active-filters{position:sticky;top:var(--shell-height,60px);z-index:12;display:flex;flex-wrap:wrap;gap:4px;padding:3px 0;background:var(--wand-bg)}
  .active-filters button{font-size:.75rem;display:flex;align-items:center;gap:3px;padding:3px 6px}
  @media(max-width:1500px){.scope-switch span{display:none}.explore-service-toolbar .active-name{max-width:75px}}
  @media(max-width:1250px){.explore-service-toolbar .active-name{display:none}}
  @media(max-width:600px){.explore-service-toolbar .back{display:none}.explore-service-toolbar .icon-button{min-width:29px;padding:3px}.scope-switch button{padding:4px}.explore-service-toolbar{gap:2px}}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.chips button{display:inline-flex;align-items:center;gap:5px;font-size:.78rem}.chips button[aria-pressed=true]{background:var(--wand-accent-strong);color:var(--wand-accent-contrast)}
  .swatch{width:16px;height:16px;border-radius:50%;border:1px solid var(--wand-line)}
  .shelf{margin:0 0 14px;min-width:0}
  .universe-heading{margin:0 0 4px;padding:4px 0;font-size:1rem;font-weight:650}
  .catalog-tile{box-sizing:border-box;height:100%;display:grid;grid-template-rows:minmax(0,1fr) 25px;position:relative;min-width:0;aspect-ratio:1;border:1px solid var(--wand-line);border-radius:8px;background:var(--wand-visual-bg);overflow:hidden}
  .catalog-tile.inBoard{border-color:var(--wand-accent);box-shadow:inset 0 0 0 1px var(--wand-accent)}
  .catalog-tile .item{width:100%;height:100%;min-height:0;padding:3px;grid-template-rows:minmax(0,1fr);overflow:hidden}.catalog-tile .art{height:100%;min-height:0;overflow:hidden}
  .tile-controls{display:flex;align-items:center;justify-content:space-between;gap:1px;min-width:0;padding:0 2px;box-sizing:border-box}
  .variants-button{display:flex;align-items:center;justify-content:center;gap:1px;font-size:10px;background:var(--wand-menu);padding:1px;border:0;border-radius:5px;cursor:pointer;min-width:0;max-width:34px;height:23px}
  .variant-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:8px 0;max-height:180px;overflow:auto}.variant-grid button{height:46px;padding:2px}.variant-grid button[aria-pressed=true]{outline:2px solid var(--wand-accent)}
  .tile-add,.tile-favorite{display:grid;place-items:center;width:23px;height:23px;flex:0 0 23px;padding:1px;border:0;background:var(--wand-menu);border-radius:5px;cursor:pointer}
  .tile-add{margin-left:auto}.tile-favorite{opacity:0}
  .tile-add[aria-pressed=true],.tile-favorite[aria-pressed=true]{background:var(--wand-accent-strong);color:var(--wand-accent-contrast);opacity:1}
  .catalog-tile:hover .tile-favorite,.catalog-tile:focus-within .tile-favorite{opacity:1}
  .visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  @media(pointer:coarse){.tile-favorite{opacity:1}}
  @media(max-width:780px){
    .workspace.withBoards,.workspace.withReview{grid-template-columns:minmax(0,1fr);padding-bottom:58dvh}
    .right-rail{position:fixed;z-index:42;inset:auto 0 0;max-height:58dvh;width:100%;background:var(--wand-menu);box-shadow:0 -4px 24px #0005;border-radius:12px 12px 0 0;overflow:auto;gap:0}
    .right-rail.hasReview :global(.quick-view){max-height:58dvh;flex:1 1 auto;border-radius:12px 12px 0 0}
    .right-rail.hasReview.hasBoards{height:auto}
    .right-rail.hasReview.hasBoards :global(.quick-view){flex:1 1 auto;max-height:58dvh}
    .right-rail.hasReview.hasBoards .boards{display:none}
    .boards{padding:12px;max-height:58dvh;border-left:0;box-sizing:border-box}
    .active-name{display:none}
  }
  @media(max-width:600px){.decorate{padding:8px}.tiles{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}.art{height:70px}}
</style>
