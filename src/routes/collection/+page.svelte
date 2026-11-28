<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { base } from '$app/paths';
  import {itemEntityHref,itemPageCopy} from '$lib/items/entity-item-url';
  import {isWandLanguage} from '$lib/ui/preferences';
  import CollectionSourceMarks from '$lib/collection/CollectionSourceMarks.svelte';
  import ItemArtwork from '$lib/collection/ItemArtwork.svelte';
  import MemoryCandidateArtwork from '$lib/collection/MemoryCandidateArtwork.svelte';
  import {getMemorySources} from '$lib/media/memory-media';
  import {maskPreviewEligible} from '$lib/media/memory-mask-preview-evidence';
  import {knownMemoryBits,completeMemoryBits,memoryPieceCount} from '$lib/media/memory-piece-state';
  import {memoryPieceCopy} from '$lib/collection/memory-piece-copy';
  import {localSaveSession} from '$lib/ui/local-save-session';
  import CurrentItemFacts from '$lib/collection/CurrentItemFacts.svelte';
  import ItemMasterDetails from '$lib/collection/ItemMasterDetails.svelte';
  import {
    loadCollectionDb01Facets,collectionDb01Groups,collectionDb01Matches,
    collectionDb01FacetLabel,collectionDb01TagLabel,COLLECTION_DB01_COLOR_SWATCHES,
    type CollectionDb01Index,type CollectionDb01Facet,type CollectionDb01Group
  } from '$lib/collection/db01-native-facets';
  import {COLLECTION_UNIVERSE_UNTAGGED,COLLECTION_UNIVERSE_UNRESOLVED,collectionUniverseIds,sortedCollectionUniverseOptions,
    groupCollectionUniverseItems,collectionUniverseDisplayLabel}
    from '$lib/collection/browse-layout.ts';
  import {COLLECTION_UNIVERSE_TAG_BY_ID,COLLECTION_UNIVERSE_TAG_NAMES}
    from '$lib/collection/universe-tag-names.ts';
  import {collectionSubcategories,collectionFurnitureKindLabel,type CollectionSubcategory} from '$lib/collection/subcategories.ts';
  import {makeCollectionBrowseOrder,collectionUniverseRootSection,type CollectionBrowseOrder} from '$lib/collection/semantic-browse.ts';
  import {loadCompleteCollection} from '$lib/collection/db01-complete-catalog.ts';
  import {COLLECTION_TOP_CATEGORIES} from '$lib/collection/category-hierarchy.ts';
  import {buildWorldBrowseIndex,countOwnedInWorldScope,type WorldBrowseScope} from '$lib/collection/world-browse-index.ts';
  import {collectionTopCategory,collectionTopCategoryLabel,collectionTopCategoryRank,
    collectionTopCategoryCards,type CollectionTopCategory} from '$lib/collection/category-hierarchy.ts';
  import {collectionNativeSubtypeLabel}
    from '$lib/collection/native-subtype-labels.ts';
  import AcquisitionEvidence from '$lib/collection/AcquisitionEvidence.svelte';
  import {loadCurrentCollectionAcquisition,type CollectionAcquisitionIndex} from '$lib/collection/current-acquisition.ts';
  import {DB02_ACQUISITION_CATEGORY_ORDER,type GameNativeItemCategory}
    from '$lib/acquisition/game-native-item-categories.ts';
  import {collectionDb01AcquisitionLabel,collectionDb01AcquisitionHeading}
    from '$lib/collection/db01-browse-labels.ts';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {watchWandLanguage} from '$lib/ui/preferences';
  import {editHistory,type HistoryDescription} from '$lib/ui/edit-history';
  import SavedStorePreview from '$lib/collection/SavedStorePreview.svelte';
  import { CollectionRuntime, type CollectionState, type CollectionItem, type CollectionFacet, type CollectionProgress, type CollectionFilter } from '$lib/collection/runtime';
  import { collectionFamilyLabel } from '$lib/collection/copy';
  import {collectionInterfaceCopy} from '$lib/collection/interface-copy.ts';
  import {collectionScopeOptions,collectionItemScopeLabels,COLLECTION_WORLD_NAVIGATION,type CollectionScopeOption} from '$lib/collection/scope-options';
  import {collectionItemFromLink,collectionItemIdFromSearch}
    from '$lib/collection/item-permalink.ts';

  let memoryPreviewRequested=false;
  let showMemoryPieces=false;
  $: memoryCopy=memoryPieceCopy(locale);
  $: selectedMemory=selectedItem?getMemorySources(selectedItem.itemId):null;
  $: selectedMemoryBits=selectedMemory?knownMemoryBits(selectedEntry,selectedMemory.numberOfShards,Boolean($localSaveSession.file)):0;
  $: selectedMemoryEligible=selectedMemory?maskPreviewEligible(selectedMemory.mask.sha256,selectedMemory.numberOfShards):false;
  const categoryPictogram:Record<string,string>={
    Furniture:'chair',Landscaping:'plant','Roads & Fences':'mountain',
    'Wallpaper & Flooring':'home',Buildings:'home','Environment Effects':'sun',
    Clothing:'shirt',Appearance:'character','Touch of Magic':'sparkles',
    'Photo Mode':'camera',Tools:'hammer',Upgrades:'hammer',Characters:'character',
    Companions:'butterfly',Critters:'butterfly',Mounts:'world',
    Crafting:'hammer',Meals:'cooking',Ingredients:'plant',Foraging:'plant',
    'Photo Gallery':'camera','Adventure Companions':'butterfly',
    Fish:'fish',Gems:'gem',Timebending:'sparkles',Memories:'book',
    'Board Game':'puzzle',Snippets:'puzzle','Lorekeeper Tales':'book',
    'Quest Puzzles':'puzzle',Exhibition:'gallery','Source Activity Items':'hammer',
    'Source Seed':'plant','Source Crop':'plant','Source Meal':'cooking',
    'Source Flower':'plant','Source Fish':'fish','Source Ingredient':'plant',
    'Source Consumable':'sparkles','Source Mineral':'gem',
    'Source Crafting Material':'hammer'
  };
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
  let detachHistory:()=>void=()=>{};
  let state:CollectionState=defaultState;
  let facets:CollectionFacet[]=[];
  let worldScopeOptions:readonly CollectionScopeOption[]=[];
  let universeScopeOptions:readonly CollectionScopeOption[]=[];
  let scopeRuntimeCache:CollectionRuntime|null=null;
  let scopeLocaleCache='';
  let filtered:CollectionItem[]=[];
  let totalMatches=0;
  let overall:CollectionProgress={owned:0,missing:0,unknown:0,discovered:0,total:0};
  let loadError='';
  let loading=true;
  let storeError='';
  let saveReadInProgress=false;
  let historySaveReadLock=false;
  let saveReadTarget:{runtime:CollectionRuntime;workspaceId:string}|null=null;
  let infoMessage='';
  let busy=false;
  let locale='ja';
  $: copy=collectionInterfaceCopy(locale);
  $: entityCopy=itemPageCopy(locale);
  type CollectionViewAxis='world'|'universe';
  let viewAxis:CollectionViewAxis='world';
  let universeSearch='';
  let bypassCategoryGroups=false;
  let scopedCategoryFacets:CollectionFacet[]=[];
  let categoryUniverseFacets:CollectionFacet[]=[];
  // DB-01 only supplies native source Tags for optional searching. World,
  // Collection and ownership axes continue to use the independent DB-00/Save
  // evidence and are never inferred from these Tags.
  let sourceIndex:CollectionDb01Index|null=null;
  let worldBrowseIndex:ReadonlyMap<string,WorldBrowseScope>=new Map();
  let worldScopedItemCount:number|null=null;
  let rootCounts:ReadonlyMap<CollectionTopCategory,number>=new Map();
  let rootOwned:ReadonlyMap<CollectionTopCategory,number>=new Map();
  let rootProgressTotals:ReadonlyMap<CollectionTopCategory,number>=new Map();
  let sourceLoad:Promise<void>|null=null;
  let sourceLoadError=false;
  let sourceUniverseOptions:{key:string;count:number}[]=[];
  let sourceWorldOptions:{key:string;count:number}[]=[];
  let acquisitionIndex:CollectionAcquisitionIndex|null=null;
  let acquisitionLoad:Promise<void>|null=null;
  let acquisitionLoadError=false;
  let acquisitionFilter:GameNativeItemCategory|''='';
  let sourceGeneration=0;
  let sourceFacetGroups:readonly CollectionDb01Group[]=[];
  let sourceChoices:Partial<Record<CollectionDb01Facet,string>>={};
  let sourceAllMatching:CollectionItem[]=[];
  let sourceTopCategory:CollectionTopCategory|null=null;
  let sourceActivityType:number|null=null;
  let sourceNativeSubtype:string|null=null;
  let sourceUniverseSelection:string|null=null;
  let sourceActivityTypeCards:{
    code:number;nativeName:string|null;total:number;owned:number
  }[]=[];
  let sourceNativeSubtypeCards:{
    key:string;nativeType:string;code:number;nativeName:string|null;
    total:number;owned:number
  }[]=[];
  let sourceGroupsCacheKey='';
  let scopedSubcategories:readonly CollectionSubcategory[]=[];
  let browseOrder:CollectionBrowseOrder|null=null;
  let browseOrderSource:CollectionDb01Index|null=null;
  let browseOrderKey='';
  let universeSections:{facet:CollectionFacet;items:CollectionItem[]}[]=[];
  let worldFilter='';
  let universeFilter='';
  let selected='';
  let browsingAllItems=false;
  let search='';
  let status:'all'|'owned'|'missing'|'unknown'='all';
  let favoriteOnly=false;
  let nameStatus:'all'|'verified'|'unverified'='all';
  let expansion='';
  let filtersOpen=false;
  let visible=72;
  let selectionMode=false;
  let selectedIds:number[]=[];
  let selectedItemId:number|null=null;
  let legacyLinkedItemId:number|null=null;
  let importInput:HTMLInputElement;
  let workspaceOptions:HTMLDetailsElement;
  let localCatalogInput:HTMLInputElement;
  let gameImageMap:Record<string,string>={};
  // Ephemeral projection of saved GridObject references. Never put these
  // observations in the manual Collection state or IndexedDB backup.
  let savedGridByItem:Record<string,{fullGridReferences:number;diffModifiedReferences:number}>={};
  let savedDb04ByItem:Record<string,{sourceDefault:number;effectiveSaved:number;
    savedOnlyIdentity:number;removedDefaultIdentity:number}>={};
  let mobileInspector=false;
  let inspectorClose:HTMLButtonElement;
  let inspectorTrigger:HTMLElement|null=null;
  // SvelteKit history-entry snapshot, not a second Collection record store.
  // Only browsing state is captured; the Rust/IndexedDB workspace is reloaded.
  function captureBrowse(){
    return {catalog:runtime?.metadata.snapshot??null,viewAxis,universeSearch,bypassCategoryGroups,worldFilter,universeFilter,selected,
      browsingAllItems,search,status,favoriteOnly,nameStatus,expansion,filtersOpen,visible,
      sourceChoices:{...sourceChoices},sourceTopCategory,sourceActivityType,sourceNativeSubtype,
      sourceUniverseSelection,acquisitionFilter,selectedItemId,showMemoryPieces,
      scrollY:typeof window==='undefined'?0:window.scrollY};
  }
  type BrowseSnapshot=ReturnType<typeof captureBrowse>;
  let pendingBrowseRestore:BrowseSnapshot|null=null;
  export const snapshot={
    capture:captureBrowse,
    restore:(value:BrowseSnapshot)=>{pendingBrowseRestore=value;if(runtime)void restoreBrowse();}
  };
  async function restoreBrowse(){
    const value=pendingBrowseRestore,activeRuntime=runtime;
    if(!value||!activeRuntime)return;
    if(sourceLoad)await sourceLoad;
    if(acquisitionLoad)await acquisitionLoad;
    if(runtime!==activeRuntime||pendingBrowseRestore!==value)return;
    pendingBrowseRestore=null;
    // Never restore filters from a different verified catalog (including an owner-local catalog).
    if(value.catalog!==activeRuntime.metadata.snapshot){restoreAddressSelection();return;}
    ({viewAxis,universeSearch,bypassCategoryGroups,worldFilter,universeFilter,selected,
      browsingAllItems,search,status,favoriteOnly,nameStatus,expansion,filtersOpen,visible,
      sourceChoices,sourceTopCategory,sourceActivityType,sourceNativeSubtype,
      sourceUniverseSelection,acquisitionFilter,selectedItemId,showMemoryPieces}=value);
    refresh();await tick();
    if(runtime===activeRuntime)window.scrollTo(0,value.scrollY);
  }

  $: topCategoryCards=sourceIndex?.rootsByItem
    ?COLLECTION_TOP_CATEGORIES.map(({id,icon})=>({id,icon,total:rootCounts.get(id)??0,owned:rootOwned.get(id)??0}))
    :collectionTopCategoryCards([
      ...sourceNativeSubtypeCards,
      ...sourceActivityTypeCards.map(row=>({...row,key:'ActivityItem:'+row.code}))
    ]);
  $: workspace=state.workspaces.find(x=>x.id===state.active)??state.workspaces[0];
  $: entries=workspace?.entries??{};
  $: selectionLabel=sourceNativeSubtype!==null
    ?collectionFurnitureKindLabel(locale,sourceNativeSubtype,sourceIndex)??nativeSubtypeLabel(locale,sourceNativeSubtype,
        sourceIndex?.nativeSubtypeNames.get(sourceNativeSubtype)??null)
    :sourceActivityType!==null
      ?sourceActivityTypeLabel(locale,sourceActivityType,
          sourceIndex?.activityTypeNames.get(sourceActivityType)??null)
      :sourceTopCategory!==null?collectionTopCategoryLabel(locale,sourceTopCategory):facets.find(x=>x.id===selected)?.label??'';
  // Render each Rust/WASM query result in its original order. Grouping all
  // visible rows by category would move existing cards when another page is
  // appended, producing scroll jumps and misleading partial group counts.
  $: visibleItems=filtered;
  $: selectedItem=selectedItemId!==null && runtime?runtime.item(selectedItemId,locale):null;
  $: selectedScopeLabels=collectionItemScopeLabels(selectedItem,worldScopeOptions,universeScopeOptions);
  $: selectedEntry=selectedItem?entries[String(selectedItem.itemId)]??{}:{};
  $: selectedGridRefs=selectedItem?savedGridByItem[String(selectedItem.itemId)]??null:null;
  $: selectedDb04Refs=selectedItem?savedDb04ByItem[String(selectedItem.itemId)]??null:null;
  $: universeChoices=(sourceIndex
    ?sortedCollectionUniverseOptions(sourceIndex,locale,
        key=>sourceIndex?.universeLabelsById?.get(Number(key))?.[locale]??collectionUniverseDisplayLabel(locale,key),
        locale==='ja'?'ユニバース未設定':'No source universe tag')
    :universeScopeOptions).filter(option=>
      option.label.toLocaleLowerCase(locale).includes(universeSearch.trim().toLocaleLowerCase(locale)));
  $: landingUniverse=viewAxis==='universe'&&!universeFilter&&
    sourceUniverseSelection===null&&!sourceChoices.disneyUniverse&&
    !selected&&sourceActivityType===null&&sourceNativeSubtype===null&&
    !search.trim()&&status==='all'&&!favoriteOnly&&!expansion&&!acquisitionFilter;
  $: landingWorld=viewAxis==='world'&&!selected&&sourceActivityType===null&&
    sourceNativeSubtype===null&&
    !browsingAllItems&&!search.trim()&&status==='all'&&!favoriteOnly&&
    nameStatus==='all'&&!expansion&&!acquisitionFilter&&
    Object.keys(sourceChoices).every(key=>key==='worldContextTag');
  // Each category may use a different proven subgroup axis. Only Furniture
  // and Clothing currently have a verified Universe-based browse path.
  // Biome/subtype families go directly to items until exact source groups land.
  $: universeSectionView=viewAxis==='universe'&&Boolean(
    sourceUniverseSelection!==null||universeFilter)&&!selected&&
    sourceActivityType===null&&sourceNativeSubtype===null&&
    !search.trim()&&status==='all'&&
    !favoriteOnly&&!expansion&&!acquisitionFilter;
  $: isBrowsing=Boolean(browsingAllItems||selected||sourceUniverseSelection!==null||
    sourceActivityType!==null||sourceNativeSubtype!==null||sourceTopCategory!==null||
    search.trim()||status!=='all'||favoriteOnly||
    nameStatus!=='all'||expansion||worldFilter||universeFilter||
    Object.keys(sourceChoices).length||acquisitionFilter||viewAxis==='universe');

  // Display the original Steam ActivityItemType subtype rather than the
  // generic "unclassified" Activity bucket; this does not assert CollectionSet
  // membership, world availability or player entitlement.
  const nativeActivityLabels:Record<string,Record<string,string>>={
    ja:{'Source Crop':'作物','Source Meal':'料理','Source Seed':'種','Source Flower':'花','Source Fish':'魚','Source Ingredient':'食材','Source Consumable':'消耗品','Source Mineral':'鉱物','Source Crafting Material':'クラフト素材'},
    en:{'Source Crop':'Crops','Source Meal':'Meals','Source Seed':'Seeds','Source Flower':'Flowers','Source Fish':'Fish','Source Ingredient':'Ingredients','Source Consumable':'Consumables','Source Mineral':'Minerals','Source Crafting Material':'Crafting Materials'},
    fr:{'Source Crop':'Cultures','Source Meal':'Plats','Source Seed':'Graines','Source Flower':'Fleurs','Source Fish':'Poissons','Source Ingredient':'Ingrédients','Source Consumable':'Consommables','Source Mineral':'Minéraux','Source Crafting Material':'Matériaux de fabrication'},
    it:{'Source Crop':'Colture','Source Meal':'Piatti','Source Seed':'Semi','Source Flower':'Fiori','Source Fish':'Pesci','Source Ingredient':'Ingredienti','Source Consumable':'Consumabili','Source Mineral':'Minerali','Source Crafting Material':'Materiali da creazione'},
    de:{'Source Crop':'Feldfrüchte','Source Meal':'Gerichte','Source Seed':'Saatgut','Source Flower':'Blumen','Source Fish':'Fische','Source Ingredient':'Zutaten','Source Consumable':'Verbrauchsgegenstände','Source Mineral':'Mineralien','Source Crafting Material':'Herstellungsmaterialien'},
    'es-ES':{'Source Crop':'Cultivos','Source Meal':'Platos','Source Seed':'Semillas','Source Flower':'Flores','Source Fish':'Peces','Source Ingredient':'Ingredientes','Source Consumable':'Consumibles','Source Mineral':'Minerales','Source Crafting Material':'Materiales de fabricación'},
    'zh-CN':{'Source Crop':'农作物','Source Meal':'餐食','Source Seed':'种子','Source Flower':'花卉','Source Fish':'鱼类','Source Ingredient':'食材','Source Consumable':'消耗品','Source Mineral':'矿物','Source Crafting Material':'制作材料'},
    'pt-BR':{'Source Crop':'Plantações','Source Meal':'Refeições','Source Seed':'Sementes','Source Flower':'Flores','Source Fish':'Peixes','Source Ingredient':'Ingredientes','Source Consumable':'Consumíveis','Source Mineral':'Minerais','Source Crafting Material':'Materiais de criação'}
  };
  const sourceActivityLegacyNames:Record<number,string>={
    2:'Source Crop',3:'Source Meal',4:'Source Seed',8:'Source Flower',
    10:'Source Fish',11:'Source Ingredient',15:'Source Consumable',
    16:'Source Mineral',17:'Source Crafting Material'
  };
  const sourceActivityLegacyFamilies=new Set([
    'Source Activity Items',...Object.values(sourceActivityLegacyNames)
  ]);
  // Exact original Steam v1.26.2 ActivityItemType values, independently
  // recovered from DB-01's SHA-pinned Item-ID master. These are Wand UI
  // translations of source types, NOT claims about native Collection menus.
  const sourceActivityVerifiedNames:Readonly<Record<number,string>>={
    0:'Default',12:'RequestItem',13:'Ephemeral',14:'LootPresent',
    18:'BuffElixir',19:'Manual'
  };
  const sourceActivityNewLabels:Record<string,Record<number,string>>={
    ja:{0:'デフォルト',12:'依頼アイテム',13:'一時オブジェクト',
      14:'報酬プレゼント',18:'強化エリクサー',19:'マニュアル'},
    en:{0:'Default',12:'Request items',13:'Ephemeral objects',
      14:'Loot presents',18:'Buff elixirs',19:'Manuals'},
    fr:{0:'Par défaut',12:'Objets de requête',13:'Objets temporaires',
      14:'Cadeaux de butin',18:'Élixirs de renforcement',19:'Manuels'},
    it:{0:'Predefiniti',12:'Oggetti delle richieste',13:'Oggetti temporanei',
      14:'Regali premio',18:'Elisir potenzianti',19:'Manuali'},
    de:{0:'Standard',12:'Auftragsgegenstände',13:'Temporäre Objekte',
      14:'Beutegeschenke',18:'Stärkungselixiere',19:'Handbücher'},
    'es-ES':{0:'Predeterminados',12:'Objetos de solicitud',13:'Objetos temporales',
      14:'Regalos de botín',18:'Elixires de mejora',19:'Manuales'},
    'zh-CN':{0:'默认',12:'委托物品',13:'临时物件',
      14:'奖励礼物',18:'强化药剂',19:'手册'},
    'pt-BR':{0:'Padrão',12:'Itens de pedido',13:'Objetos temporários',
      14:'Presentes de recompensa',18:'Elixires de fortalecimento',19:'Manuais'}
  };
  /** Source-exact IL2CPP ItemType is an independent browse axis, never an
   * invented CollectionSet category. Preserve the original enum fallback. */
  function sourceActivityTypeLabel(lang:string,code:number,native:string|null):string{
    const legacy=sourceActivityLegacyNames[code];
    if(legacy)return nativeActivityLabels[lang]?.[legacy]??nativeActivityLabels.en[legacy];
    if(native&&sourceActivityVerifiedNames[code]===native)
      return (sourceActivityNewLabels[lang]??sourceActivityNewLabels.en)[code];
    return native?.replace(/([a-z])([A-Z])/g,'$1 $2') ??
      (lang==='ja'?'その他のアクティビティアイテム':'Other activity items');
  }
  function nativeSubtypeLabel(lang:string,key:string,nativeName:string|null):string{
    if(key.startsWith('ActivityItem:'))
      return sourceActivityTypeLabel(lang,Number(key.split(':')[1]),nativeName);
    return collectionNativeSubtypeLabel(lang,key,nativeName);
  }
  function displayItemCategory(item:CollectionItem):string {
    const original=sourceIndex?.nativeSubtypeByItem.get(item.itemId);
    if(original)return nativeSubtypeLabel(locale,
      original.nativeType+':'+original.code,original.nativeName);
    const native=item.family==='Source Activity Items'
      ?sourceIndex?.activityTypesByItem.get(item.itemId):null;
    return native
      ?sourceActivityTypeLabel(locale,native.code,native.nativeName)
      :categoryLabel(locale,item.family);
  }
  function categoryLabel(lang:string,id:string):string {
    const special:Record<string,Record<string,string>>={
      ja:{Memories:'思い出','Quest Puzzles':'クエストのパズル',
        Exhibition:'展示','Photo Gallery':'フォトギャラリー',
        'Adventure Companions':'冒険の仲間','Source Activity Items':'その他のアイテム（詳細分類未確認）'},
      en:{Memories:'Memories','Quest Puzzles':'Quest Puzzles',
        Exhibition:'Exhibition','Photo Gallery':'Photo Gallery',
        'Adventure Companions':'Adventure Companions','Source Activity Items':'Other items (unclassified)'},
      fr:{Memories:'Souvenirs','Quest Puzzles':'Énigmes de quête',Exhibition:'Exposition','Source Activity Items':'Autres objets (non classés)'},
      it:{Memories:'Ricordi','Quest Puzzles':'Enigmi delle missioni',Exhibition:'Esposizione','Source Activity Items':'Altri oggetti (non classificati)'},
      de:{Memories:'Erinnerungen','Quest Puzzles':'Quest-Rätsel',Exhibition:'Ausstellung','Source Activity Items':'Andere Gegenstände (unklassifiziert)'},
      'es-ES':{Memories:'Recuerdos','Quest Puzzles':'Puzles de misiones',Exhibition:'Exposición','Source Activity Items':'Otros objetos (sin clasificar)'},
      'zh-CN':{Memories:'回忆','Quest Puzzles':'任务谜题',Exhibition:'展览','Source Activity Items':'其他物品（未分类）'},
      'pt-BR':{Memories:'Memórias','Quest Puzzles':'Quebra-cabeças de missões',Exhibition:'Exposição','Source Activity Items':'Outros itens (sem classificação)'}
    };
    return nativeActivityLabels[lang]?.[id]??special[lang]?.[id]??collectionFamilyLabel(lang,id)??id;
  }
  function currentFilter(offset:number,limit:number):CollectionFilter {
    return {
      locale,search,category:selected,
      world:worldFilter,universe:universeFilter,
      expansion,status,favoriteOnly,nameStatus,offset,limit
    };
  }
  function refresh(navigationOnly=false):void {
    if(!runtime)return;
    try{
      // Switching a world never mutates the active profile. Reuse global
      // metrics on navigation; normal refresh after edits/import still reads WASM.
      const reuseGlobal=navigationOnly&&scopeRuntimeCache===runtime&&scopeLocaleCache===locale;
      if(!reuseGlobal)state=runtime.state;
      const activeEntries=(state.workspaces.find(row=>row.id===state.active)??state.workspaces[0])?.entries??{};
      if(!reuseGlobal)facets=runtime.facets('category',locale);
      // Source Tag associations are not CollectionArea membership. The
      // runtime only exposes these options when the catalog explicitly carries
      // reviewed, source-validated per-item scope evidence.
      if(scopeRuntimeCache!==runtime||scopeLocaleCache!==locale){
        const provenance=runtime.metadata.verifiedScopeMembership;
        worldScopeOptions=collectionScopeOptions(runtime.metadata,'world',
          provenance?.world?runtime.facets('world',locale):[],locale);
        universeScopeOptions=collectionScopeOptions(runtime.metadata,'universe',
          provenance?.universe?runtime.facets('universe',locale):[],locale);
        // Counts of catalog members are static across user manual edits.
        // Do not scan 13k source facets on every infinite-scroll page.
        scopeRuntimeCache=runtime;
        scopeLocaleCache=locale;
      }
      if(worldFilter&&!worldScopeOptions.some(x=>x.id===worldFilter))worldFilter='';
      if(universeFilter&&!universeScopeOptions.some(x=>x.id===universeFilter))universeFilter='';
      // Source-authenticated scope facets drive category cards. Do not reuse
      // unfiltered A/B when a world or universe was selected.
      const scopeFilter:CollectionFilter={
        ...currentFilter(0,1),category:'',search:'',status:'all',
        nameStatus:'all',favoriteOnly:false,expansion:'',
        world:viewAxis==='world'?worldFilter:'',
        universe:viewAxis==='universe'?universeFilter:'',
      };
      const countCategory=(id:string,universe=scopeFilter.universe):CollectionFacet|null=>{
        const filter={...scopeFilter,category:id,universe};
        const total=runtime!.query(filter).total;
        if(!total)return null;
        const owned=runtime!.query({...filter,status:'owned'}).total;
        return {id,label:facets.find(x=>x.id===id)?.label??id,total,owned};
      };
      scopedCategoryFacets=(worldFilter||universeFilter)
        ? facets.flatMap(facet=>{const scoped=countCategory(facet.id);return scoped?[scoped]:[];})
        : facets;
      // Show the original item-type cards scoped by exact DB-01 world tags.
      // These tags are not game CollectionArea or availability evidence.
      const tag=viewAxis==='world'?sourceChoices.worldContextTag:'';
      const worldScope=sourceIndex?worldBrowseIndex.get(tag??''):undefined;
      const worldIds=tag?worldScope?.itemIds??[]:null;
      worldScopedItemCount=worldIds?.length??null;
      rootCounts=worldScope?.rootCounts??new Map();
      rootProgressTotals=worldScope?.progressTotals??new Map();
      scopedSubcategories=sourceIndex?.rootsByItem&&sourceTopCategory!==null
        ?collectionSubcategories(sourceIndex,sourceTopCategory,worldScope):[];
      const completeNative=!!sourceIndex&&sourceIndex.nativeSubtypeByItem.size===sourceIndex.sourceItemCount;
      // The category-only path needs no individual runtime.item() calls.
      // Native membership and totals were built once from the exact source index.
      if(worldIds&&!completeNative){
        const familyCounts=new Map<string,{total:number;owned:number}>();
        for(const id of worldIds){
          const item=runtime!.item(id,locale);
          const count=familyCounts.get(item.family)??{total:0,owned:0};
          count.total++;count.owned+=activeEntries[String(id)]?.status==='owned'?1:0;
          familyCounts.set(item.family,count);
        }
        scopedCategoryFacets=facets.flatMap(facet=>{
          const count=familyCounts.get(facet.id);
          return count?[{...facet,...count}]:[];
        });
      }
      const ownedCounts=sourceIndex&&worldScope
        ?countOwnedInWorldScope(sourceIndex,worldScope,activeEntries):null;
      rootOwned=ownedCounts?.root??new Map();
      sourceActivityTypeCards=sourceIndex&&worldScope
        ?[...worldScope.activityCounts].sort((a,b)=>a[0]-b[0]).map(([code,total])=>({
          code,nativeName:sourceIndex!.activityTypeNames.get(code)??null,total,
          owned:ownedCounts?.activity.get(code)??0
        })): [];
      const nativeOrder=['Furniture','Clothing','Trimming'];
      sourceNativeSubtypeCards=sourceIndex&&worldScope&&completeNative
        ?[...worldScope.nativeCounts.entries()]
          .filter(([key])=>!key.startsWith('ActivityItem:'))
          .sort((a,b)=>{
            const [typeA,codeA]=a[0].split(':'),[typeB,codeB]=b[0].split(':');
            return nativeOrder.indexOf(typeA)-nativeOrder.indexOf(typeB)||
              Number(codeA)-Number(codeB);
          })
          .map(([key,total])=>{
            const [nativeType,codeText]=key.split(':');
            return {key,nativeType,code:Number(codeText),
              nativeName:sourceIndex!.nativeSubtypeNames.get(key)??null,total,
              owned:ownedCounts?.native.get(key)??0};
          })
        :[];
      const universeCategoryIds=new Set(['Furniture','Clothing']);
      categoryUniverseFacets=viewAxis==='world'&&universeCategoryIds.has(selected)
        ? universeScopeOptions.flatMap(option=>{
            const subgroup=countCategory(selected,option.id);
            return subgroup?[{...subgroup,id:option.id,label:option.label}]:[];
          })
        : [];
      universeSections=viewAxis==='universe'&&universeFilter&&!selected&&!sourceIndex
        ?scopedCategoryFacets.map(facet=>({
            facet,items:runtime!.query({...scopeFilter,category:facet.id,limit:8}).items
          })):[];
      if(sourceIndex&&filtersOpen){
        const key=(sourceNativeSubtype!==null?'native-'+sourceNativeSubtype:
          sourceActivityType!==null?'activity-'+sourceActivityType:
          selected||sourceTopCategory||'all')+'|'+worldFilter+'|'+universeFilter+
          '|'+(sourceChoices.worldContextTag??'')+'|'+(sourceUniverseSelection??'');
        if(key!==sourceGroupsCacheKey){
          const ids=sourceNativeSubtype!==null
            ?scopedSubcategories.find(group=>group.key===sourceNativeSubtype)?.ids??sourceIndex.itemsByNativeSubtype.get(sourceNativeSubtype)??[]
            :sourceActivityType!==null
              ?sourceIndex.itemsByActivityType.get(sourceActivityType)??[]
              :selected?queryAllCollectionRows({
                ...currentFilter(0,200),status:'all',search:'',
                favoriteOnly:false,nameStatus:'all',expansion:''
              }).map(row=>row.itemId):sourceTopCategory!==null
                ?sourceIndex.itemsByRoot?.get(sourceTopCategory)??[...sourceIndex.itemsByNativeSubtype].flatMap(([key,ids])=>
                  collectionTopCategory(key)===sourceTopCategory?[...ids]:[])
                :worldScope?.itemIds??[...sourceIndex.byItem.keys()];
          sourceFacetGroups=collectionDb01Groups(sourceIndex,ids);
          sourceGroupsCacheKey=key;
        }
      }else if(!filtersOpen){
        sourceFacetGroups=[];sourceGroupsCacheKey='';
      }
      // Compute the navigation predicate from current input values, not a
      // stale Svelte reactive value during the synchronous click handler.
      const categoryOverview=viewAxis==='world'&&!selected&&
        sourceActivityType===null&&sourceNativeSubtype===null&&!browsingAllItems&&
        !search.trim()&&status==='all'&&!favoriteOnly&&nameStatus==='all'&&
        !expansion&&!acquisitionFilter&&Object.keys(sourceChoices).every(key=>key==='worldContextTag');
      const universeOverview=viewAxis==='universe'&&!universeFilter&&sourceUniverseSelection===null&&
        !sourceChoices.disneyUniverse&&!selected&&sourceActivityType===null&&sourceNativeSubtype===null&&
        !search.trim()&&status==='all'&&!favoriteOnly&&!expansion&&!acquisitionFilter;
      if(categoryOverview||universeOverview){
        sourceAllMatching=[];filtered=[];totalMatches=0;if(!reuseGlobal)overall=runtime.progress;
        return;
      }
      if((sourceTopCategory!==null||sourceActivityType!==null||sourceNativeSubtype!==null||
          sourceUniverseSelection!==null||
          Object.keys(sourceChoices).length||acquisitionFilter)&&
         (sourceIndex||acquisitionIndex)){
        // An original submenu can contain 6k+ Item IDs. Repeating the
        // general 13k-row sorted Rust query 67 times blocks UI clicks.
        // Resolve source-linked IDs through Rust's O(1) Item-ID lookup.
        // For multilingual text search, retain the existing Rust predicate.
        const universeIds=sourceUniverseSelection&&sourceIndex
          ?collectionUniverseIds(sourceIndex,sourceUniverseSelection):null;
        const universeIdSet=universeIds?new Set(universeIds):null;
        const acquisitionIds=acquisitionFilter&&acquisitionIndex
          ?acquisitionIndex.listItemIds(acquisitionFilter).map(Number):null;
        const activityIds=sourceActivityType===null?null:
          sourceIndex?.itemsByActivityType.get(sourceActivityType)??[];
        const nativeIds=sourceNativeSubtype===null?null:
          scopedSubcategories.find(group=>group.key===sourceNativeSubtype)?.ids??
          sourceIndex?.itemsByNativeSubtype.get(sourceNativeSubtype)??[];
        const nativeIdSet=nativeIds?new Set(nativeIds):null;
        const topIds=sourceTopCategory===null?null:
          sourceIndex?.itemsByRoot?.get(sourceTopCategory)??
          [...(sourceIndex?.itemsByNativeSubtype??[])].flatMap(([key,ids])=>
            collectionTopCategory(key)===sourceTopCategory?[...ids]:[]);
        const candidateIds=[universeIds,acquisitionIds,activityIds,nativeIds,topIds,worldIds]
          .reduce<readonly number[]|null>((shortest,ids)=>
            ids===null?shortest:
            shortest===null||ids.length<shortest.length?ids:shortest,null);
        const searchRows=search.trim()
          ?queryAllCollectionRows(currentFilter(0,200)):null;
        const candidates=searchRows??
          (candidateIds?candidateIds.flatMap(id=>{
            try{return [runtime!.item(id,locale)];}catch{return [];}
          }):queryAllCollectionRows(currentFilter(0,200)));
        const orderKey=locale+'|'+(sourceUniverseSelection!==null?'universe':'world')+'|'+(tag??'');
        if(sourceIndex&&(browseOrderSource!==sourceIndex||browseOrderKey!==orderKey)){
          browseOrder=makeCollectionBrowseOrder(sourceIndex,locale,sourceUniverseSelection!==null,tag??'');
          browseOrderSource=sourceIndex;browseOrderKey=orderKey;
        }
        sourceAllMatching=candidates.filter(item=>
          (sourceTopCategory===null||(()=>{
            const native=sourceIndex?.nativeSubtypeByItem.get(item.itemId);
            return sourceIndex?.rootsByItem
              ?sourceIndex.rootsByItem.get(item.itemId)===sourceTopCategory
              :!!native&&collectionTopCategory(native.nativeType+':'+native.code)===sourceTopCategory;
          })())&&
          (!universeIdSet||universeIdSet.has(item.itemId))&&
          (sourceActivityType===null||
            sourceIndex?.activityTypesByItem.get(item.itemId)?.code===sourceActivityType)&&
          (!nativeIdSet||nativeIdSet.has(item.itemId))&&
          (!acquisitionFilter||
            (acquisitionIndex?.getItem(item.itemId).categories.includes(acquisitionFilter)??false))&&
          (selected===''||item.family===selected)&&
          (status==='all'||item.status===status)&&
          (!favoriteOnly||item.favorite===true)&&
          (nameStatus==='all'||(nameStatus==='verified')===item.nameVerified)&&
          (!expansion||item.expansions.includes(expansion))&&
          (!worldFilter||item.worlds.includes(worldFilter))&&
          (!universeFilter||item.universes.includes(universeFilter))&&
          Object.entries(sourceChoices).every(([facet,key])=>
            sourceIndex!==null&&(facet==='disneyUniverse'
              ?sourceIndex.universesByItem.get(item.itemId)?.includes(key)===true
              :collectionDb01Matches(
                sourceIndex,item.itemId,facet as CollectionDb01Facet,key))))
          .sort(sourceIndex?.rootsByItem&&browseOrder
            ?browseOrder.compare
            :(a,b)=>sourceUniverseSelection!==null?a.itemId-b.itemId:
              Number(b.nameVerified)-Number(a.nameVerified)||a.label.localeCompare(b.label,locale)||a.itemId-b.itemId);
        if(viewAxis==='universe'&&sourceUniverseSelection!==null&&!selected&&
          sourceActivityType===null&&!search.trim()&&status==='all'&&
          !favoriteOnly&&!expansion&&!acquisitionFilter){
          rebuildSourceUniverseSections();
        }
        filtered=sourceAllMatching.slice(0,visible);
        totalMatches=sourceAllMatching.length;
        overall=runtime.progress;state=runtime.state;
        return;
      }
      sourceAllMatching=[];
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
  function rebuildSourceUniverseSections():void{
    const groups=groupCollectionUniverseItems(sourceAllMatching,item=>{
      const native=sourceIndex?.nativeSubtypeByItem.get(item.itemId);
      if(native){
        const semantic=sourceIndex?collectionUniverseRootSection(sourceIndex,item.itemId):null;
        const id=semantic?.root??collectionTopCategory(native.nativeType+':'+native.code);
        if(id===null)return {id:'unresolved',label:locale==='ja'?'分類未確定':'Unclassified',rank:999};
        const part=semantic?.part;
        return {id:part?part:id,
          label:part?collectionTopCategoryLabel(locale,id)+' · '+(collectionFurnitureKindLabel(locale,part,sourceIndex)??''):collectionTopCategoryLabel(locale,id),
          rank:collectionTopCategoryRank(id)*10+(semantic?.rankOffset??0)};
      }
      const activity=sourceIndex?.activityTypesByItem.get(item.itemId);
      const id=activity?'activity-'+activity.code:item.family;
      return {id,
        label:activity?sourceActivityTypeLabel(locale,activity.code,activity.nativeName):
          categoryLabel(locale,item.family),
        rank:activity?100+activity.code:Math.max(0,facets.findIndex(f=>f.id===item.family))
      };
    },visible,sourceIndex?.rootsByItem&&browseOrder?browseOrder.compare:undefined);
    universeSections=groups.map(section=>({
      facet:{id:section.id,label:section.label,total:section.total,owned:0},
      items:[...section.items]
    }));
  }
  function queryAllCollectionRows(filter:CollectionFilter):CollectionItem[]{
    if(!runtime)return [];
    const result:CollectionItem[]=[];
    let offset=0;
    for(;;){
      const next=runtime.query({...filter,offset,limit:200});
      result.push(...next.items);
      offset+=next.items.length;
      if(offset>=next.total||next.items.length===0)break;
    }
    return result;
  }
  function canUseDb01SourceFacets():boolean{
    return Boolean(runtime&&!runtime.isOwnerLocal&&
      (runtime.metadata.snapshot==='steam-1.26.2-native-itemlist-v1'||runtime.metadata.snapshot.endsWith('-collection-source-v3')));
  }
  /** A catalog swap must invalidate pending source index requests. In
   * particular, never show public category candidates in an owner-local
   * catalog, or keep stale filters when switching back to public data. */
  function discardSourceIndex():void{
    sourceGeneration++;
    sourceIndex=null;
    worldBrowseIndex=new Map();worldScopedItemCount=null;rootCounts=new Map();
    sourceLoad=null;
    sourceLoadError=false;
    sourceUniverseOptions=[];
    sourceWorldOptions=[];
    acquisitionIndex=null;
    acquisitionLoad=null;
    acquisitionLoadError=false;
    acquisitionFilter='';
    sourceFacetGroups=[];
    sourceGroupsCacheKey='';
    sourceChoices={};
    sourceTopCategory=null;sourceActivityType=null;sourceNativeSubtype=null;
    sourceUniverseSelection=null;
    sourceActivityTypeCards=[];
    sourceNativeSubtypeCards=[];
  }
  function ensureSourceIndex():void{
    if(!canUseDb01SourceFacets()||sourceIndex||sourceLoad)return;
    sourceLoadError=false;
    const generation=sourceGeneration;
    const task=(runtime?.metadata.snapshot.endsWith('-collection-source-v3')
      ?loadCompleteCollection(base).then(catalog=>catalog.index):loadCollectionDb01Facets(base)).then(index=>{
      if(generation!==sourceGeneration||!canUseDb01SourceFacets())return;
      sourceIndex=index;worldBrowseIndex=buildWorldBrowseIndex(index);sourceGroupsCacheKey='';
      ensureAcquisitionIndex();
      const sourceGroups=collectionDb01Groups(index,[...index.byItem.keys()]);
      sourceUniverseOptions=COLLECTION_UNIVERSE_TAG_NAMES.map(row=>({
        key:String(row.id),
        count:index.itemsByUniverseTagId.get(row.id)?.length??0
      }));
      sourceWorldOptions=sourceGroups
        .find(group=>group.facet==='worldContextTag')?.options.map(x=>({...x}))??[];
      // Source-native category cards become visible on the initial overview.
      // Refresh does not change saved user progress.
      refresh();
    }).catch(()=>{ // Optional browse facets never block Collection startup.
      if(generation!==sourceGeneration)return;
      sourceIndex=null;
      sourceLoadError=canUseDb01SourceFacets();
    }).finally(()=>{if(sourceLoad===task)sourceLoad=null;});
    sourceLoad=task;
  }
  function ensureAcquisitionIndex():void{
    if(!canUseDb01SourceFacets()||acquisitionIndex||acquisitionLoad)return;
    acquisitionLoadError=false;
    const generation=sourceGeneration;
    const task=loadCompleteCollection(base).then(catalog=>loadCurrentCollectionAcquisition(catalog.master)).then(index=>{
      if(generation!==sourceGeneration||!canUseDb01SourceFacets())return;
      acquisitionIndex=index;if(acquisitionFilter)refresh();
    }).catch(()=>{
      if(generation===sourceGeneration)acquisitionLoadError=canUseDb01SourceFacets();
    }).finally(()=>{if(acquisitionLoad===task)acquisitionLoad=null;});
    acquisitionLoad=task;
  }
  function selectAcquisition(value:string):void{
    if(!acquisitionIndex)return;
    if(value!==''&&!DB02_ACQUISITION_CATEGORY_ORDER.some(x=>x===value))return;
    acquisitionFilter=value as GameNativeItemCategory|'';
    resetView();
  }
  function selectSourceTag(facet:CollectionDb01Facet,key:string):void{
    const next={...sourceChoices};
    if(key)next[facet]=key;
    else delete next[facet];
    sourceChoices=next;
    resetView();
  }
  function updateItemAddress(id:number|null,mode:'push'|'replace'):void{
    const url=new URL(window.location.href);
    if(id===null||url.searchParams.get('item')!==String(id))url.searchParams.delete('pose');
    if(id===null)url.searchParams.delete('item');
    else url.searchParams.set('item',String(id));
    if(url.href===window.location.href)return;
    if(mode==='push')window.history.pushState(window.history.state,'',url);
    else window.history.replaceState(window.history.state,'',url);
  }
  /** Only a canonical ID confirmed by the active Rust item index may open
   * the inspector. Source-area tags/CollectionSet candidates are not needed. */
  function restoreAddressSelection():void{
    const params=new URLSearchParams(window.location.search);
    if(!params.has('item')){selectedItemId=null;return;}
    if(!runtime)return;
    const item=collectionItemFromLink(runtime,window.location.search,locale);
    if(!item){
      selectedItemId=null;
      updateItemAddress(null,'replace');
      infoMessage='指定されたItem IDは現在のCollectionデータにありません。';
      return;
    }
    // Linked Items may be outside the currently visible category, filter or
    // first 72 cards. Resolve against the complete native Rust Item index.
    if(!filtered.some(row=>row.itemId===item.itemId)){
      selected='';search=String(item.itemId);status='all';
      favoriteOnly=false;nameStatus='all';expansion='';
      worldFilter='';universeFilter='';
      visible=72;refresh();
    }
    selectionMode=false;selectedIds=[];
    selectedItemId=item.itemId;
    if(mobileInspector)void tick().then(()=>inspectorClose?.focus({preventScroll:true}));
  }
  function resetView(navigationOnly:boolean|Event=false):void{
    if(selectedItemId!==null)updateItemAddress(null,'replace');
    visible=72;selectedIds=[];selectedItemId=null;refresh(navigationOnly===true);
  }
  /** Scroll only requests the next page from Rust. Re-querying 0..visible
   * after every intersection creates quadratic decoding and DOM churn for
   * the 13k+ item catalog. Edits/filter changes still use full refresh().
   */
  function appendNextPage():void {
    if(!runtime||busy||loading||storeError||filtered.length>=totalMatches)return;
    if((sourceTopCategory!==null||sourceActivityType!==null||sourceNativeSubtype!==null||
          sourceUniverseSelection!==null||
          Object.keys(sourceChoices).length||acquisitionFilter)&&
         (sourceIndex||acquisitionIndex)){
      const next=Math.min(sourceAllMatching.length,filtered.length+72);
      filtered=sourceAllMatching.slice(0,next);
      visible=next;
      if(viewAxis==='universe'&&sourceUniverseSelection!==null&&!selected&&
        sourceActivityType===null&&!search.trim()&&status==='all'&&
        !favoriteOnly&&!expansion&&!acquisitionFilter)
        rebuildSourceUniverseSections();
      return;
    }
    try{
      const offset=filtered.length;
      const page=runtime.query(currentFilter(offset,72));
      if(page.total!==totalMatches){
        // The source filter changed outside the observer: rebuild its current
        // view rather than stitching together incompatible result sets.
        refresh();
        return;
      }
      if(page.items.length===0)throw new Error('COLLECTION_PAGINATION_EMPTY_PAGE');
      filtered=[...filtered,...page.items];
      visible=filtered.length;
    }catch(error){storeError=error instanceof Error?error.message:String(error);}
  }
  function observeMore(node:HTMLElement) {
    if(typeof IntersectionObserver==='undefined')return {destroy:()=>{}};
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(x=>x.isIntersecting)&&visible<totalMatches&&!busy)
        appendNextPage();
    },{rootMargin:'400px'});
    observer.observe(node);
    return {destroy:()=>observer.disconnect()};
  }
  async function commit(action:()=>Promise<void>,description:HistoryDescription,repair=false):Promise<void>{
    if(!runtime||busy||editHistory.isTraveling()||(storeError&&!repair))return;
    const before=runtime.state;
    busy=true;editHistory.beginCollectionEdit();
    try{
      await action();
      editHistory.recordCollection(before,runtime.state,description);
      storeError='';
      refresh();
      infoMessage='ブラウザ内のCollection記録を更新しました。DDVセーブファイルは変更していません。';
    }catch(error){storeError=error instanceof Error?error.message:String(error);}
    finally{busy=false;editHistory.endCollectionEdit();}
  }
  function describeEntry(itemId:number,patch:Record<string,unknown>):HistoryDescription{
    const item=runtime?.item(itemId,locale);
    const previous=entries[String(itemId)]??{};
    const key=Object.keys(patch)[0];
    const oldValue=(previous as Record<string,unknown>)[key];
    const nextValue=patch[key];
    const displayed=(value:unknown):string=>{
      if(key==='status')return value==='owned'?'所持':value==='missing'?'未所持':'未記録';
      if(key==='discovered'||key==='favorite')return value===true?'あり':'なし';
      return value===undefined||value===null?'—':String(value);
    };
    const label=key==='status'?'所持状態':key==='quantity'?'所持数':
      key==='discovered'?'発見':key==='favorite'?'お気に入り':'記録';
    return {title:item?.label??String(itemId),change:`${label}: ${displayed(oldValue)} → ${displayed(nextValue)}`};
  }
  async function reloadLatestRecord():Promise<void> {
    if (!runtime || busy) return;
    busy=true;
    try {
      await runtime.reloadLatest();
      editHistory.reconcileCollection(runtime.state);
      storeError='';
      selectedItemId=null;
      updateItemAddress(null,'replace');
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
    if(selectedItem&&runtime){
      const id=selectedItem.itemId;
      void commit(()=>runtime!.setEntry(id,change),describeEntry(id,change));
    }
  }
  function setMemoryPieces(bits:number):void{
    if(!selectedItem||!selectedMemory||!runtime||busy||storeError)return;
    const id=selectedItem.itemId;
    const total=selectedMemory.numberOfShards,full=completeMemoryBits(total);
    if(!Number.isInteger(bits)||bits<0||bits>full)return;
    if(!selectedMemoryEligible&&bits!==0&&bits!==full)return;
    if(bits===0&&selectedMemoryBits!==0&&!window.confirm(memoryCopy.confirmClear))return;
    const previous=selectedMemoryBits;
    if(bits===previous)return;
    void commit(()=>runtime!.setEntry(id,{memoryPieces:bits}),{
      title:selectedItem.label,change:(previous===null?'?':memoryPieceCount(previous))+'/'+total+' → '+memoryPieceCount(bits)+'/'+total
    });
  }
  function toggleMemoryPiece(bit:number):void{
    if(!selectedMemoryEligible||memoryPreviewRequested||selectedMemoryBits===null)return;
    setMemoryPieces(selectedMemoryBits^bit);
  }
  function toggleItemStatus(id:number):void{
    if(!runtime)return;
    const current=entries[String(id)]?.status;
    const patch={status:current==='owned'?'missing' as const:'owned' as const};
    void commit(()=>runtime!.setEntry(id,patch),describeEntry(id,patch));
  }
  async function showItem(id:number,event:MouseEvent):Promise<void>{
    inspectorTrigger=event.currentTarget as HTMLElement;
    selectedItemId=id;
    updateItemAddress(id,'push');
    if(mobileInspector){await tick();inspectorClose?.focus({preventScroll:true});}
  }
  async function closeItem():Promise<void>{
    selectedItemId=null;
    updateItemAddress(null,'push');
    await tick();
    if(inspectorTrigger?.isConnected)inspectorTrigger.focus({preventScroll:true});
    inspectorTrigger=null;
  }
  async function copySelectedItemLink():Promise<void>{
    if(selectedItemId===null)return;
    try{
      const url=new URL(itemEntityHref(base,selectedItemId),window.location.href);
      await navigator.clipboard.writeText(url.href);
      infoMessage='アイテムへのリンクをコピーしました。';
    }catch{
      infoMessage='コピーできませんでした。ブラウザのアドレスをコピーしてください。';
    }
  }
  function toggleSelectionMode():void{
    selectionMode=!selectionMode;
    selectedIds=[];
    if(selectedItemId!==null){
      selectedItemId=null;
      updateItemAddress(null,'replace');
    }
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
    },{title:`一括更新（${ids.length}件）`,change:`所持状態 → ${next==='owned'?'所持':next==='missing'?'未所持':'未記録'}`});
  }
  function applyFilteredBulk(next:'owned'|'missing'|'unknown'):void {
    if(!runtime||busy||storeError||totalMatches===0)return;
    const count=totalMatches;
    const label=next==='owned'?'所持 / 解放':next==='missing'?'未所持':'未記録';
    if(!window.confirm(`現在の条件に一致する全${count.toLocaleString(locale)}件を「${label}」に変更します。画面に未表示のアイテムも対象です。実行しますか？`))return;
    const filter=currentFilter(0,1);
    void commit(async()=>{
      if((sourceTopCategory!==null||sourceActivityType!==null||sourceNativeSubtype!==null||
          sourceUniverseSelection!==null||
          Object.keys(sourceChoices).length||acquisitionFilter)&&
         (sourceIndex||acquisitionIndex)){
        // Rust's bulk_matching predicate does not know DB-01 menu candidates or Tags.
        // Applying it would silently edit items outside the chosen Tag.
        await runtime!.setBulk(sourceAllMatching.map(item=>item.itemId),next);
      }else{
        await runtime!.setBulkMatching(filter,next);
      }
      selectedIds=[];
      selectionMode=false;
    },{title:`条件に一致する${count}件`,change:`所持状態 → ${label}`});
  }
  function browseEveryItem():void{
    sourceTopCategory=null;
    browsingAllItems=true;
    viewAxis='world';
    selected='';sourceActivityType=null;sourceNativeSubtype=null;sourceUniverseSelection=null;
    worldFilter='';universeFilter='';
    search='';status='all';favoriteOnly=false;nameStatus='all';expansion='';
    sourceChoices={};acquisitionFilter='';bypassCategoryGroups=true;
    sourceFacetGroups=[];sourceGroupsCacheKey='';
    resetView();
  }
  function browseCurrentScopeItems():void{
    if(sourceTopCategory!==null){
      browsingAllItems=true;sourceActivityType=null;sourceNativeSubtype=null;
      selected='';search='';status='all';favoriteOnly=false;nameStatus='all';expansion='';
      sourceFacetGroups=[];sourceGroupsCacheKey='';resetView();return;
    }
    if(viewAxis!=='world'||(!worldFilter&&!sourceChoices.worldContextTag)){
      browseEveryItem();return;
    }
    browsingAllItems=true;selected='';sourceActivityType=null;sourceNativeSubtype=null;
    search='';status='all';favoriteOnly=false;nameStatus='all';expansion='';
    sourceFacetGroups=[];sourceGroupsCacheKey='';resetView();
  }
  function chooseTopCategory(id:CollectionTopCategory):void{
    if(!topCategoryCards.some(card=>card.id===id&&card.total>0))return;
    sourceTopCategory=id;sourceActivityType=null;sourceNativeSubtype=null;
    selected='';browsingAllItems=true;search='';status='all';favoriteOnly=false;
    nameStatus='all';expansion='';acquisitionFilter='';
    sourceChoices=sourceChoices.worldContextTag?{worldContextTag:sourceChoices.worldContextTag}:{};
    sourceFacetGroups=[];sourceGroupsCacheKey='';resetView();
  }
  function chooseActivityType(code:number):void{
    if(!sourceIndex?.itemsByActivityType.has(code))return;
    sourceNativeSubtype=null;
    sourceActivityType=code;
    selected='';browsingAllItems=false;
    sourceChoices=viewAxis==='world'&&sourceChoices.worldContextTag
      ?{worldContextTag:sourceChoices.worldContextTag}:{};
    sourceFacetGroups=[];sourceGroupsCacheKey='';
    bypassCategoryGroups=true;
    resetView();
  }
  function chooseNativeSubtype(key:string):void{
    if(!sourceIndex?.itemsByNativeSubtype.has(key)&&!scopedSubcategories.some(group=>group.key===key))return;
    sourceActivityType=null;
    sourceNativeSubtype=key;
    selected='';browsingAllItems=false;
    sourceChoices=viewAxis==='world'&&sourceChoices.worldContextTag
      ?{worldContextTag:sourceChoices.worldContextTag}:{};
    sourceFacetGroups=[];sourceGroupsCacheKey='';
    bypassCategoryGroups=true;
    resetView();
  }
  function chooseFacet(id:string):void{
    sourceTopCategory=null;
    sourceActivityType=null;sourceNativeSubtype=null;
    selected=id;bypassCategoryGroups=true;browsingAllItems=false;
    sourceChoices=viewAxis==='world'&&sourceChoices.worldContextTag
      ?{worldContextTag:sourceChoices.worldContextTag}:
      viewAxis==='universe'&&sourceUniverseSelection&&
        sourceUniverseSelection!==COLLECTION_UNIVERSE_UNTAGGED&&sourceUniverseSelection!==COLLECTION_UNIVERSE_UNRESOLVED
        &&!COLLECTION_UNIVERSE_TAG_BY_ID.has(Number(sourceUniverseSelection))
        ?{disneyUniverse:sourceUniverseSelection}:{};
    sourceFacetGroups=[];sourceGroupsCacheKey='';
    resetView();ensureSourceIndex();
  }
  function changeViewAxis(axis:CollectionViewAxis):void{
    if(viewAxis===axis)return;
    sourceTopCategory=null;
    viewAxis=axis;selected='';sourceActivityType=null;sourceNativeSubtype=null;
    sourceUniverseSelection=null;browsingAllItems=false;
    worldFilter='';universeFilter='';universeSearch='';
    sourceChoices={};sourceFacetGroups=[];sourceGroupsCacheKey='';
    bypassCategoryGroups=false;search='';status='all';favoriteOnly=false;
    nameStatus='all';expansion='';resetView();
  }
  function chooseWorld(id:string):void{
    sourceTopCategory=null;
    selected='';sourceActivityType=null;sourceNativeSubtype=null;sourceUniverseSelection=null;
    universeFilter='';bypassCategoryGroups=false;browsingAllItems=false;
    const fromSource=sourceIndex&&sourceWorldOptions.some(option=>option.key===id);
    worldFilter=fromSource?'':id;
    sourceChoices=fromSource?{worldContextTag:id}:{};
    sourceFacetGroups=[];sourceGroupsCacheKey='';resetView(true);
  }
  function chooseUniverse(id:string):void{
    sourceTopCategory=null;
    selected='';sourceActivityType=null;sourceNativeSubtype=null;bypassCategoryGroups=false;browsingAllItems=false;
    worldFilter='';
    sourceUniverseSelection=sourceIndex&&id?id:null;
    universeFilter=sourceIndex?'':id;
    sourceChoices=sourceIndex&&id&&id!==COLLECTION_UNIVERSE_UNTAGGED&&id!==COLLECTION_UNIVERSE_UNRESOLVED&&
      !COLLECTION_UNIVERSE_TAG_BY_ID.has(Number(id))
      ?{disneyUniverse:id}:{};
    sourceFacetGroups=[];sourceGroupsCacheKey='';resetView();
  }
  function returnToCategory():void{
    sourceTopCategory=null;
    browsingAllItems=false;selected='';sourceActivityType=null;sourceNativeSubtype=null;
    sourceChoices=viewAxis==='world'&&sourceChoices.worldContextTag
      ?{worldContextTag:sourceChoices.worldContextTag}:
      viewAxis==='universe'&&sourceUniverseSelection&&
        sourceUniverseSelection!==COLLECTION_UNIVERSE_UNTAGGED&&sourceUniverseSelection!==COLLECTION_UNIVERSE_UNRESOLVED
        &&!COLLECTION_UNIVERSE_TAG_BY_ID.has(Number(sourceUniverseSelection))
        ?{disneyUniverse:sourceUniverseSelection}:{};
    sourceFacetGroups=[];sourceGroupsCacheKey='';
    bypassCategoryGroups=false;search='';status='all';favoriteOnly=false;
    nameStatus='all';expansion='';resetView();
  }
  function returnToSubgroups():void{
    universeFilter='';bypassCategoryGroups=false;resetView();
  }
  function clearScope():void{
    sourceTopCategory=null;
    browsingAllItems=false;selected='';sourceActivityType=null;sourceNativeSubtype=null;
    sourceUniverseSelection=null;
    search='';status='all';favoriteOnly=false;nameStatus='all';
    expansion='';worldFilter='';universeFilter='';universeSearch='';
    bypassCategoryGroups=false;sourceChoices={};acquisitionFilter='';
    sourceFacetGroups=[];sourceGroupsCacheKey='';resetView();
  }
  function changeWorkspace(id:string):void{
    if(!runtime||busy||saveReadInProgress)return;
    const target=state.workspaces.find(x=>x.id===id)?.name??id;
    void commit(async()=>{await runtime!.workspace('select',id);selectedItemId=null;updateItemAddress(null,'replace');selectedIds=[];},
      {title:'記録を切り替え',change:`${workspace.name} → ${target}`});
  }
  function newWorkspace():void{
    if(!runtime||busy||saveReadInProgress)return;
    const name=window.prompt('新しいローカル記録の名前（最大80文字）');
    if(name?.trim())void commit(()=>runtime!.workspace('add','local-'+crypto.randomUUID(),name),
      {title:'記録を作成',change:name.trim()});
  }
  function editWorkspaceName():void{
    if(!runtime||!workspace||busy||saveReadInProgress)return;
    const name=window.prompt('記録の名前',workspace.name);
    if(name?.trim())void commit(()=>runtime!.workspace('rename',workspace.id,name),
      {title:'記録名を変更',change:`${workspace.name} → ${name.trim()}`});
  }
  function deleteWorkspace():void{
    if(!runtime||busy||saveReadInProgress||state.workspaces.length<2)return;
    if(!window.confirm('現在の記録を削除します。先にバックアップを保存しましたか？'))return;
    void commit(()=>runtime!.workspace('delete',state.active),
      {title:'記録を削除',change:workspace.name});
  }
  async function useOwnerLocalCatalog(event:Event):Promise<void> {
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];
    if(!file||busy||saveReadInProgress)return;
    busy=true;
    let loaded:CollectionRuntime|null=null;
    try {
      loaded=await CollectionRuntime.openOwnerLocalDb01(file);
      discardSourceIndex();
      detachHistory();runtime?.close();
      runtime=loaded;
      detachHistory=editHistory.attachCollection(runtime);
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
    if(busy||saveReadInProgress)return;
    busy=true;
    let loaded:CollectionRuntime|null=null;
    try {
      loaded=await CollectionRuntime.open(base);
      discardSourceIndex();
      detachHistory();runtime?.close();
      runtime=loaded;
      detachHistory=editHistory.attachCollection(runtime);
      loaded=null;
      loadError='';
      storeError='';
      clearScope();
      ensureSourceIndex();
      infoMessage='公開されている検証済みCollection参照データに戻しました。';
    }catch(error){
      loaded?.close();
      infoMessage='公開カタログの読込に失敗しました：'+(error instanceof Error?error.message:String(error));
    }finally{busy=false;}
  }
  function downloadBackup():void{
    if(!runtime||busy||storeError||saveReadInProgress)return;
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
    if(!file||!runtime||busy||saveReadInProgress)return;
    try{
      if(file.size>10_000_000)throw new Error('COLLECTION_BACKUP_TOO_LARGE');
      const data=await file.text();
      if(!window.confirm('現在のローカル記録をすべて置き換えます。先にバックアップを保存しましたか？'))return;
      await commit(()=>runtime!.restore(data),{title:'バックアップを復元',change:'Collection記録を置き換え'},true);
      selectedItemId=null;clearScope();
    }catch(error){infoMessage=error instanceof Error?error.message:String(error);}
    finally{input.value='';}
  }
  onMount(()=>{
    memoryPreviewRequested=new URLSearchParams(window.location.search).get('memoryPreview')==='1';
    legacyLinkedItemId=collectionItemIdFromSearch(window.location.search);
    const toggleHeaderFilters=()=>{
      filtersOpen=!filtersOpen;
      if(filtersOpen){ensureSourceIndex();ensureAcquisitionIndex();refresh();}
    };
    window.addEventListener('wand:collection-filters',toggleHeaderFilters);
    const handleHeaderBackup=()=>downloadBackup();
    window.addEventListener('wand:collection-backup',handleHeaderBackup);
    const onHistoryRestored=()=>{selectedItemId=null;updateItemAddress(null,'replace');selectedIds=[];selectionMode=false;refresh();};
    const onCollectionPopState=()=>restoreAddressSelection();
    window.addEventListener('popstate',onCollectionPopState);
    window.addEventListener('wand:collection-history-restored',onHistoryRestored);
    const unwatchLanguage=watchWandLanguage(next=>{
      if(locale!==next){locale=next;refresh();}
    });
    let alive=true;
    const media=window.matchMedia('(max-width: 820px)');
    mobileInspector=media.matches;
    const changed=(e:MediaQueryListEvent)=>{mobileInspector=e.matches;};
    media.addEventListener('change',changed);
    void(async()=>{
      try{
        const loaded=await CollectionRuntime.open(base);
        if(!alive){loaded.close();return;}
        discardSourceIndex();
        runtime=loaded;
        detachHistory=editHistory.attachCollection(loaded);
        refresh();
        ensureSourceIndex();
        if(pendingBrowseRestore)await restoreBrowse();else restoreAddressSelection();
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
    return()=>{alive=false;pendingBrowseRestore=null;if(historySaveReadLock){historySaveReadLock=false;editHistory.endCollectionEdit();}detachHistory();unwatchLanguage();window.removeEventListener('popstate',onCollectionPopState);window.removeEventListener('wand:collection-history-restored',onHistoryRestored);window.removeEventListener('wand:collection-backup',handleHeaderBackup);window.removeEventListener('wand:collection-filters',toggleHeaderFilters);media.removeEventListener('change',changed);runtime?.close();};
  });
  function beginSaveRead():void {
    // Preserve the active workspace and runtime at file selection, not at
    // Worker completion. Do not let an asynchronous save update another record.
    saveReadTarget=runtime&&!busy&&!storeError?{runtime,workspaceId:state.active}:null;
    saveReadInProgress=true;
    if(!historySaveReadLock){editHistory.beginCollectionEdit();historySaveReadLock=true;}
    window.dispatchEvent(new CustomEvent('wand:collection-busy',{detail:true}));
  }
  function finishSaveRead():void {
    saveReadInProgress=false;
    saveReadTarget=null;
    if(historySaveReadLock){historySaveReadLock=false;editHistory.endCollectionEdit();}
    window.dispatchEvent(new CustomEvent('wand:collection-busy',{detail:false}));
  }
  /** Native save history and positive-stock ownership are applied together
   * in one IndexedDB transaction, overriding matching manual entries only. */
  async function importSaveProfile(event:CustomEvent<{
    discovered:{itemId:number;discovered:boolean}[];
    positiveOwned:{itemId:number;role:string}[];
  }>):Promise<void> {
    if(!saveReadTarget||saveReadTarget.runtime!==runtime||
       saveReadTarget.workspaceId!==state.active){
      infoMessage='セーブの読み取り中に対象のローカル記録が変更されたため、自動反映を中止しました。セーブを再選択してください。';
      return;
    }
    if(!runtime||busy||storeError){
      infoMessage='Collectionの保存処理が実行できないため、セーブの状態は反映していません。競合がある場合は最新の記録を読み込んでからセーブを再選択してください。';
      return;
    }
    const projection=event.detail;
    if(!Array.isArray(projection?.discovered)||
       !Array.isArray(projection?.positiveOwned)||
       (!projection.discovered.length&&!projection.positiveOwned.length))return;
    busy=true;editHistory.beginCollectionEdit();
    const before=runtime.state;
    try{
      const applied=await runtime.applyMappedSaveProfile(projection);
      editHistory.recordCollection(before,runtime.state,{
        title:'セーブの状態を反映',
        change:`発見 ${applied.discovery}件・所持 ${applied.ownership}件`
      });
      storeError='';
      refresh();
      infoMessage=`セーブの発見履歴 ${applied.discovery.toLocaleString(locale)}件、正の数量で確認した所持 ${applied.ownership.toLocaleString(locale)}件をローカル記録へ反映しました。数量0・未収録ID・矛盾するIDは手動記録を維持します。元のセーブには書き込みません。`;
    }catch(error){
      storeError=error instanceof Error?error.message:String(error);
      infoMessage='セーブの状態は反映されませんでした。既存の手動記録は維持しています。';
    }finally{busy=false;editHistory.endCollectionEdit();}
  }
  function receiveDb04Join(event:CustomEvent<{entries:{
    itemId:number;sourceDefault:number;effectiveSaved:number;
    savedOnlyIdentity:number;removedDefaultIdentity:number;
  }[]}|null>):void{
    const refs:Record<string,{sourceDefault:number;effectiveSaved:number;
      savedOnlyIdentity:number;removedDefaultIdentity:number}>={};
    for(const row of event.detail?.entries??[])refs[String(row.itemId)]={
      sourceDefault:row.sourceDefault,effectiveSaved:row.effectiveSaved,
      savedOnlyIdentity:row.savedOnlyIdentity,removedDefaultIdentity:row.removedDefaultIdentity
    };
    savedDb04ByItem=refs;
  }
  function receiveSavedGridReferences(event:CustomEvent<{
    entries:{itemId:number;fullGridReferences:number;diffModifiedReferences:number}[];
  }|null>):void {
    const rows=event.detail?.entries??[];
    const projection:Record<string,{fullGridReferences:number;diffModifiedReferences:number}>={};
    for(const row of rows)projection[String(row.itemId)]={
      fullGridReferences:row.fullGridReferences,
      diffModifiedReferences:row.diffModifiedReferences
    };
    savedGridByItem=projection;
  }
  function lookupSavedCollectionId(itemId:number):void {
    if(!Number.isSafeInteger(itemId)||itemId<=0||!runtime)return;
    sourceTopCategory=null;sourceActivityType=null;sourceNativeSubtype=null;sourceUniverseSelection=null;
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
  <!-- Global toolbar owns save loading, backup and restore. Inputs stay mounted. -->
  <input bind:this={localCatalogInput} class="visually-hidden" type="file"
    accept=".json,application/json" aria-label="Steam v1.26.2のオーナーローカルカタログ"
    on:change={useOwnerLocalCatalog}/>
  <input bind:this={importInput} class="visually-hidden" type="file"
    accept=".json,application/json" aria-label="Collectionバックアップを選択"
    on:change={restoreBackup}/>

  {#if storeError}
    <div class="error-banner" role="alert">
      {#if storeError==='COLLECTION_STORAGE_CONFLICT'}
        {copy.storageConflict}
        <button type="button" disabled={busy} on:click={()=>void reloadLatestRecord()}>{copy.reloadRecord}</button>
        <small>COLLECTION_STORAGE_CONFLICT</small>
      {:else}
        {storeError} {copy.storageKept}
      {/if}
    </div>
  {/if}
  {#if infoMessage}<div class="info-banner" role="status">{infoMessage}<button type="button" on:click={()=>infoMessage=''} aria-label={copy.noticeClose}>×</button></div>{/if}

  {#if loading}
    <div class="loading-panel" role="status">{copy.loading}</div>
  {:else if loadError}
    <div class="error-banner" role="alert">{copy.failed}{loadError}</div>
  {:else}
    <SavedStorePreview headless resolveHistorical={historicalLookup} {locale} {gameImageMap} collectionCommitBusy={busy}
      on:lookupItem={(event:CustomEvent<number>)=>lookupSavedCollectionId(event.detail)}
      on:saveProfile={importSaveProfile}
      on:saveReadStarted={beginSaveRead}
      on:saveReadFinished={finishSaveRead}
      on:saveReadError={(event:CustomEvent<string>)=>infoMessage=event.detail}
      on:gridReferences={receiveSavedGridReferences}
      on:db04Join={receiveDb04Join} />

    <div class="collection-workspace">
      <div class="workspace-top">
        <div class="collection-record-switcher" role="group" aria-label={copy.record}>
          <select aria-label={copy.selectRecord} value={state.active}
            disabled={Boolean(storeError)||busy||saveReadInProgress}
            on:change={(event)=>changeWorkspace((event.currentTarget as HTMLSelectElement).value)}>
            {#each state.workspaces as work}<option value={work.id}>{work.name}</option>{/each}
          </select>
          <details class="collection-record-menu" bind:this={workspaceOptions}>
            <summary aria-label={copy.manageRecord} title={copy.manageRecord}><WandIcon name="ellipsis" size={21}/></summary>
            <div class="collection-record-actions" role="group" aria-label={copy.manageRecord}>
              <button type="button" disabled={Boolean(storeError)||busy||saveReadInProgress||state.workspaces.length>=5}
                on:click={()=>{workspaceOptions.open=false;newWorkspace();}}>
                <WandIcon name="plus" size={16}/>{copy.newRecord}
              </button>
              <button type="button" disabled={Boolean(storeError)||busy||saveReadInProgress}
                on:click={()=>{workspaceOptions.open=false;editWorkspaceName();}}>
                <WandIcon name="edit" size={16}/>{copy.renameRecord}
              </button>
              <button type="button" disabled={Boolean(storeError)||busy||saveReadInProgress||state.workspaces.length<2}
                on:click={()=>{workspaceOptions.open=false;deleteWorkspace();}}>
                <WandIcon name="trash" size={16}/>{copy.deleteRecord}
              </button>
              {#if runtime?.isOwnerLocal || (runtime && !canUseDb01SourceFacets())}
                <button type="button" disabled={busy||loading||saveReadInProgress}
                  on:click={()=>{workspaceOptions.open=false;runtime?.isOwnerLocal?void usePublicCatalog():localCatalogInput.click();}}>
                  <WandIcon name="folder" size={16}/>{runtime?.isOwnerLocal?copy.publicData:copy.openCatalog}
                </button>
              {/if}
            </div>
          </details>
        </div>
        <div class="toolbar">
          <label class="search-box">
            <span aria-hidden="true"><WandIcon name="search" size={19}/></span>
            <input type="search" aria-label={copy.searchLabel} bind:value={search} on:input={resetView} placeholder={copy.searchPlaceholder}/>
          </label>
          <button type="button" class="collection-favorites-filter" class:active={favoriteOnly}
            aria-label={copy.favoritesOnly} title={copy.favoritesOnly}
            aria-pressed={favoriteOnly} disabled={Boolean(storeError)||busy}
            on:click={()=>{favoriteOnly=!favoriteOnly;resetView();}}>
            <WandIcon name="star" size={19}/>
          </button>
          <button type="button" class="subtle-button" aria-expanded={filtersOpen}
            on:click={()=>{filtersOpen=!filtersOpen;if(filtersOpen){ensureSourceIndex();ensureAcquisitionIndex();refresh();}}}>
            {copy.filters} {filtersOpen?'▴':'▾'}
          </button>
        </div>
      </div>
      <div class="collection-scope-toolbar" role="group" aria-label={copy.scope}>
        <div class="collection-axis-switch" role="group" aria-label={copy.scope}>
          <button type="button" class:chosen={viewAxis==='world'}
            aria-pressed={viewAxis==='world'} on:click={()=>changeViewAxis('world')}>{copy.worldView}</button>
          <button type="button" class:chosen={viewAxis==='universe'}
            aria-pressed={viewAxis==='universe'} on:click={()=>changeViewAxis('universe')}>{copy.universeView}</button>
        </div>
        {#if viewAxis==='world'}
          <div class="collection-world-switcher" role="group" aria-label={copy.world}>
            <div class="collection-scope-scroll">
              <button type="button" class:chosen={!worldFilter&&!sourceChoices.worldContextTag}
                aria-pressed={!worldFilter&&!sourceChoices.worldContextTag}
                on:click={()=>chooseWorld('')}>{copy.all}</button>
              {#each COLLECTION_WORLD_NAVIGATION as world (world.id)}
                {#if worldScopeOptions.some(option=>option.id===world.id)||
                  sourceWorldOptions.some(option=>option.key===world.id)}
                  <button type="button"
                    class:chosen={worldFilter===world.id||sourceChoices.worldContextTag===world.id}
                    aria-pressed={worldFilter===world.id||sourceChoices.worldContextTag===world.id}
                    title={sourceWorldOptions.some(option=>option.key===world.id)
                      ?(locale==='ja'
                        ?'原本のワールド関連タグで検索。コレクション所属や入手場所は未検証です。'
                        :'Original world-context tag only; Collection membership and acquisition area are unverified.')
                      :undefined}
                    on:click={()=>chooseWorld(world.id)}>
                    {worldScopeOptions.find(option=>option.id===world.id)?.label??world.label}
                  </button>
                {:else}
                  <button type="button" disabled title={copy.worldScopeUnavailable}>{world.label}</button>
                {/if}
              {/each}
              {#each worldScopeOptions.filter(option=>!COLLECTION_WORLD_NAVIGATION.some(world=>world.id===option.id)) as option (option.id)}
                <button type="button" class:chosen={worldFilter===option.id}
                  aria-pressed={worldFilter===option.id} on:click={()=>chooseWorld(option.id)}>{option.label}</button>
              {/each}
            </div>
          </div>
        {:else if universeFilter||sourceUniverseSelection!==null}
          <button type="button" class="collection-back-axis" on:click={()=>chooseUniverse('')}>
            <WandIcon name="chevron-left" size={16}/>{copy.universeList}
          </button>
          <span class="collection-axis-selected">
            {sourceUniverseSelection!==null
              ?sortedCollectionUniverseOptions(sourceIndex!,locale,
                key=>sourceIndex?.universeLabelsById?.get(Number(key))?.[locale]??collectionUniverseDisplayLabel(locale,key),
                locale==='ja'?'ユニバース未設定':'No source universe tag')
                  .find(option=>option.id===sourceUniverseSelection)?.label??''
              :universeScopeOptions.find(x=>x.id===universeFilter)?.label??''}
          </span>
        {/if}
      </div>
      {#if filtersOpen}
        <div class="filter-panel">
          <fieldset><legend>{copy.manualStatus}</legend>
            {#each [{id:'all',name:copy.all},{id:'owned',name:copy.owned},{id:'missing',name:copy.missing},{id:'unknown',name:copy.unrecorded}] as option}
              <button type="button" class:chosen={status===option.id} aria-pressed={status===option.id} on:click={()=>{status=option.id as typeof status;resetView();}}>{option.name}</button>
            {/each}
          </fieldset>
          {#if sourceTopCategory!==null&&scopedSubcategories.length>1}
            <label class="filter-label">{locale==='ja'?'種類':collectionDb01FacetLabel(locale,sourceTopCategory==='clothing'?'clothingSlot':'furnitureKind')}
              <select value={sourceNativeSubtype??''} on:change={event=>{
                sourceNativeSubtype=event.currentTarget.value||null;
                sourceGroupsCacheKey='';resetView();
              }}>
                <option value="">{copy.all}</option>
                {#each scopedSubcategories as group (group.key)}
                  <option value={group.key}>{collectionFurnitureKindLabel(locale,group.key,sourceIndex)??nativeSubtypeLabel(locale,group.key,group.nativeName)}</option>
                {/each}
              </select>
            </label>
          {/if}
          <label class="filter-label">{copy.expansions}
            <select bind:value={expansion} on:change={resetView}>
              <option value="">{copy.all}</option>
              {#each runtime?.metadata.expansions??[] as id}<option value={id}>{id}</option>{/each}
            </select>
          </label>
          {#if sourceFacetGroups.length}
            <div class="collection-native-tag-panel" role="group"
              aria-label={locale==='ja'?'ゲーム原本のタグ':'Source tags'}
              title={locale==='ja'?'元のゲームのタグ。Collection所属やワールドでの入手可能性を確定する情報ではありません。':'Original source tags, not verified Collection membership or availability.'}>
              {#each sourceFacetGroups as group (group.facet)}
                <fieldset>
                  <legend>{collectionDb01FacetLabel(locale,group.facet)}</legend>
                  {#if group.options.length>22}
                    <select aria-label={collectionDb01FacetLabel(locale,group.facet)}
                      value={sourceChoices[group.facet]??''}
                      on:change={(e)=>selectSourceTag(group.facet,(e.currentTarget as HTMLSelectElement).value)}>
                      <option value="">{copy.all}</option>
                      {#each group.options as option (option.key)}
                        <option value={option.key}>{collectionDb01TagLabel(locale,option.key)} ({option.count})</option>
                      {/each}
                    </select>
                  {:else}
                    <div class="collection-native-tag-options">
                      <button type="button" class:chosen={!sourceChoices[group.facet]}
                        on:click={()=>selectSourceTag(group.facet,'')}>{copy.all}</button>
                      {#each group.options as option (option.key)}
                        <button type="button"
                          class:chosen={sourceChoices[group.facet]===option.key}
                          aria-pressed={sourceChoices[group.facet]===option.key}
                          on:click={()=>selectSourceTag(group.facet,option.key)}>
                          {#if group.facet==='color'&&COLLECTION_DB01_COLOR_SWATCHES[option.key]}
                            <span class="collection-native-color" aria-hidden="true"
                              style:background={COLLECTION_DB01_COLOR_SWATCHES[option.key]}></span>
                          {/if}
                          {collectionDb01TagLabel(locale,option.key)}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </fieldset>
              {/each}
            </div>
          {/if}
          {#if runtime&&!runtime.isOwnerLocal&&(runtime.metadata.snapshot==='steam-1.26.2-native-itemlist-v1'||runtime.metadata.snapshot.endsWith('-collection-source-v3'))}
            <fieldset class="collection-db01-acquisition">
              <legend>{collectionDb01AcquisitionHeading(locale)}</legend>
              {#if acquisitionIndex}
                <select aria-label={collectionDb01AcquisitionHeading(locale)}
                  value={acquisitionFilter}
                  on:change={(event)=>selectAcquisition((event.currentTarget as HTMLSelectElement).value)}>
                  <option value="">{copy.all}</option>
                  {#each DB02_ACQUISITION_CATEGORY_ORDER as category}
                    <option value={category}>{collectionDb01AcquisitionLabel(locale,category)}</option>
                  {/each}
                </select>
              {:else if acquisitionLoadError}
                <button type="button" class="subtle-button" on:click={ensureAcquisitionIndex}>
                  {locale==='ja'?'再試行':'Retry'}
                </button>
              {:else}
                <span>{copy.loading}</span>
              {/if}
            </fieldset>
          {/if}
          <button type="button" class="subtle-button" on:click={clearScope}>{copy.clear}</button>
        </div>
      {/if}
      <div class="workspace-body" class:has-inspector={Boolean(selectedItem)}>
        <div class="collection-results">
          {#if landingUniverse}
            <div class="section-lead"><h2>{copy.universeList}</h2></div>
            {#if universeScopeOptions.length||sourceUniverseOptions.length}
              <label class="collection-universe-search">
                <WandIcon name="search" size={17}/>
                <input type="search" bind:value={universeSearch}
                  aria-label={copy.universeSearch} placeholder={copy.universeSearch}/>
              </label>
              <div class="collection-universe-grid">
                {#each universeChoices as option (option.id)}
                  <button type="button" class="collection-universe-card" on:click={()=>chooseUniverse(option.id)}>
                    <span class="collection-universe-art" aria-hidden="true"><WandIcon name="gallery" size={29}/></span>
                    <strong>{option.label}</strong>
                  </button>
                {/each}
              </div>
              {#if sourceUniverseOptions.length}
                <p class="collection-axis-notice">
                  {locale==='ja'
                    ?'ゲーム原本の作品タグによる検索です。コレクション所属や入手可能なワールドを示すものではありません。'
                    :'Source Disney universe tags: not Collection membership or acquisition worlds.'}
                </p>
              {/if}
              {#if universeChoices.length===0}<p class="collection-axis-notice">{copy.noItems}</p>{/if}
            {:else if sourceLoad}
              <p class="collection-axis-notice" role="status">{copy.loading}</p>
            {:else}
              <p class="collection-axis-notice">{copy.universeDataUnavailable}</p>
            {/if}
          {:else if universeSectionView}
            <div class="results-heading">
              <div class="breadcrumbs"><button type="button" on:click={()=>chooseUniverse('')}>{copy.universeList}</button>
                <span> / {sourceUniverseSelection!==null
                  ?sortedCollectionUniverseOptions(sourceIndex!,locale,
                    key=>sourceIndex?.universeLabelsById?.get(Number(key))?.[locale]??collectionUniverseDisplayLabel(locale,key),
                    locale==='ja'?'ユニバース未設定':'No source universe tag')
                    .find(option=>option.id===sourceUniverseSelection)?.label??''
                  :universeScopeOptions.find(x=>x.id===universeFilter)?.label??''}</span>
              </div>
            </div>
            {#if !totalMatches}
              <div class="empty-panel" role="status"><p>{copy.noItems}</p></div>
            {/if}
            {#each universeSections as section (section.facet.id)}
              <section class="collection-universe-section">
                <div class="collection-universe-section-head">
                  <h2>{section.facet.label}</h2>
                  <span>{section.facet.total.toLocaleString(locale)} {copy.countUnit}</span>
                </div>
                <div class="items-grid">
                  {#each section.items as item (item.itemId)}
                    <div class="item-card" data-item-id={item.itemId}>
                      <button type="button" class="item-card-body" on:click={(event)=>void showItem(item.itemId,event)}
                        aria-label={`${item.label}${copy.itemDetails}`}>
                        <span class="item-icon" aria-hidden="true">
                          {#if getMemorySources(item.itemId)!==null}<MemoryCandidateArtwork itemId={item.itemId} entry={entries[String(item.itemId)]} showPieces={showMemoryPieces} saveSelected={Boolean($localSaveSession.file)} unknownLabel={memoryCopy.unknown} unavailableLabel={memoryCopy.unavailable} flags={memoryPreviewRequested?$localSaveSession.memoryFlags:undefined} sourcePath={gameImageMap[String(item.itemId)]??null}/>{:else}<ItemArtwork itemId={item.itemId} sourcePath={gameImageMap[String(item.itemId)]??null}/>{/if}
                        </span>
                        <span class="item-card-copy"><strong title={item.label}>{item.label}</strong>
                          <CollectionSourceMarks index={acquisitionIndex} itemId={item.itemId} {locale}/>
                        </span>
                      </button>
                      <button type="button" class="item-state-toggle"
                        disabled={Boolean(storeError)} class:owned={entries[String(item.itemId)]?.status==='owned'}
                        on:click={()=>toggleItemStatus(item.itemId)}
                        aria-label={entries[String(item.itemId)]?.status==='owned'?
                          `${item.label}${copy.markMissing}`:`${item.label}${copy.markOwned}`}>
                        <WandIcon name={entries[String(item.itemId)]?.status==='owned'?'check':'plus'} size={20}/>
                      </button>
                    </div>
                  {/each}
                </div>
              </section>
            {/each}
            {#if sourceUniverseSelection!==null&&visible<totalMatches}
              <div class="more-button" use:observeMore aria-label={copy.loadMore}
                role="status"><WandIcon name="sparkles" size={18}/></div>
            {/if}
          {:else if isBrowsing&&!landingWorld}
            <div class="results-heading">
              <div class="breadcrumbs">
                <button type="button" on:click={returnToCategory}>{viewAxis==='universe'?copy.universeList:copy.categories}</button>
                {#if sourceTopCategory!==null}
                   <span> / </span><button type="button" on:click={()=>chooseTopCategory(sourceTopCategory!)}>{collectionTopCategoryLabel(locale,sourceTopCategory)}</button>
                 {/if}
                 {#if selected||sourceActivityType!==null||sourceNativeSubtype!==null}<span> / {selectionLabel}</span>{/if}
                {#if viewAxis==='universe'&&sourceUniverseSelection!==null}
                  <span> / {sourceUniverseSelection===COLLECTION_UNIVERSE_UNTAGGED
                    ?(locale==='ja'?'ユニバース未設定':'No source universe tag')
                    :collectionUniverseDisplayLabel(locale,sourceUniverseSelection)}</span>
                {/if}
                {#if selected&&universeFilter&&viewAxis==='world'}
                  <button type="button" on:click={returnToSubgroups}>{copy.universeList}</button>
                {/if}
              </div>
              <div class="result-actions">
                <span class="result-count">{totalMatches.toLocaleString(locale)} {copy.countUnit}</span>
                <button type="button" class="subtle-button" disabled={Boolean(storeError)} aria-pressed={selectionMode}
                  on:click={toggleSelectionMode}>{selectionMode?copy.finishSelect:copy.selectMultiple}</button>
              </div>
            </div>
            {#if selectionMode && filtered.length}
              <div class="bulk-actions" role="group" aria-label={copy.bulk}>
                <span>{selectedIds.length} {copy.selectedUnit}</span>
                <button type="button" on:click={()=>selectedIds=[...new Set<number>(visibleItems.map((item:any)=>Number(item.itemId)))]}>{copy.selectVisible}</button>
                <button type="button" on:click={()=>selectedIds=[]} disabled={!selectedIds.length}>{copy.clearSelected}</button>
                <button type="button" on:click={()=>applyBulk('owned')} disabled={!selectedIds.length}>{copy.owned}</button>
                <button type="button" on:click={()=>applyBulk('missing')} disabled={!selectedIds.length}>{copy.missing}</button>
                <button type="button" on:click={()=>applyBulk(null)} disabled={!selectedIds.length}>{copy.unrecorded}</button>
                <span class="bulk-all-separator" aria-hidden="true">｜</span>
                <span>{copy.allMatching} {totalMatches.toLocaleString(locale)} {copy.countUnit}:</span>
                <button type="button" disabled={busy||Boolean(storeError)} on:click={()=>applyFilteredBulk('owned')}>{copy.allOwned}</button>
                <button type="button" disabled={busy||Boolean(storeError)} on:click={()=>applyFilteredBulk('missing')}>{copy.allMissing}</button>
                <button type="button" disabled={busy||Boolean(storeError)} on:click={()=>applyFilteredBulk('unknown')}>{copy.allUnrecorded}</button>
              </div>
            {/if}
            {#if !totalMatches}
              <div class="empty-panel" role="status">
                <p>{copy.noItems}</p>
                <button type="button" class="subtle-button" on:click={clearScope}>{copy.clear}</button>
              </div>
            {:else}
              <div class="items-grid">
                  {#each visibleItems as item,idx (item.itemId)}
                    {@const heading=browseOrder?.group(item.itemId,sourceTopCategory)}
                    {@const newHeading=idx===0||heading?.key!==browseOrder?.group(visibleItems[idx-1].itemId,sourceTopCategory)?.key}
                    {#if viewAxis==='world'&&heading&&newHeading}
                      <h3 class="collection-item-universe-heading">{heading.label}</h3>
                    {/if}
                    <div class="item-card" data-item-id={item.itemId} class:current={selectedItemId===item.itemId} class:bulk-selected={selectedIds.includes(item.itemId)}>
                      <button type="button" class="item-card-body"
                        on:click={(event)=>selectionMode?toggleSelected(item.itemId):void showItem(item.itemId,event)}
                        aria-pressed={selectionMode?selectedIds.includes(item.itemId):selectedItemId===item.itemId}
                        aria-label={selectionMode?`${item.label}${copy.itemSelect}`:`${item.label}${copy.itemDetails}`}>
                        <span class="item-icon" aria-hidden="true">{#if selectionMode}{selectedIds.includes(item.itemId)?'☑':'☐'}{:else}{#if getMemorySources(item.itemId)!==null}<MemoryCandidateArtwork itemId={item.itemId} entry={entries[String(item.itemId)]} showPieces={showMemoryPieces} saveSelected={Boolean($localSaveSession.file)} unknownLabel={memoryCopy.unknown} unavailableLabel={memoryCopy.unavailable} flags={memoryPreviewRequested?$localSaveSession.memoryFlags:undefined} sourcePath={gameImageMap[String(item.itemId)]??null}/>{:else}<ItemArtwork itemId={item.itemId} sourcePath={gameImageMap[String(item.itemId)]??null}/>{/if}{/if}</span>
                        <span class="item-card-copy"><strong title={item.label}>{item.label}</strong>
                          <CollectionSourceMarks index={acquisitionIndex} itemId={item.itemId} {locale}/>
                        </span>
                      </button>
                      <button type="button" class="item-state-toggle" disabled={Boolean(storeError)||selectionMode}
                        class:owned={entries[String(item.itemId)]?.status==='owned'}
                        on:click={()=>toggleItemStatus(item.itemId)}
                        aria-label={entries[String(item.itemId)]?.status==='owned'?`${item.label}${copy.markMissing}`:`${item.label}${copy.markOwned}`}
                        title={entries[String(item.itemId)]?.status==='owned'?copy.ownedTip:copy.missingTip}>
                        <WandIcon name={entries[String(item.itemId)]?.status==='owned'?'check':'plus'} size={20}/>
                      </button>
                    </div>
                  {/each}
              </div>
              {#if visible<totalMatches}
                <div class="more-button" use:observeMore aria-label={copy.loadMore} role="status"><WandIcon name="sparkles" size={18}/></div>
              {/if}
            {/if}
          {:else}
            <div class="section-lead collection-categories-heading">
              {#if sourceTopCategory!==null}
                <div class="breadcrumbs"><button type="button" on:click={returnToCategory}>{copy.categories}</button>
                  <span> / {collectionTopCategoryLabel(locale,sourceTopCategory)}</span></div>
              {:else}<h2>{copy.categories}</h2>{/if}
              <button type="button" class="subtle-button" on:click={browseCurrentScopeItems}>
                {copy.showAllItems} ({(sourceTopCategory!==null
                  ?topCategoryCards.find(card=>card.id===sourceTopCategory)?.total??0
                  :sourceChoices.worldContextTag||worldFilter
                    ?worldScopedItemCount??scopedCategoryFacets.reduce((sum,facet)=>sum+facet.total,0)
                    :overall.total).toLocaleString(locale)})
              </button>
            </div>
            {#if sourceLoadError}
              <div class="collection-source-category-footer" role="alert">
                <span>{locale==='ja'
                  ?'詳細分類を読み込めませんでした。既存の分類で閲覧できます。'
                  :'Detailed categories could not be loaded. Default categories are available.'}</span>
                <button type="button" class="subtle-button" on:click={ensureSourceIndex}>
                  {locale==='ja'?'再試行':'Retry'}
                </button>
              </div>
            {/if}
            <div class="facet-grid collection-detail-category-grid"
              aria-label={locale==='ja'?'アイテムの詳細カテゴリー':'Detailed item categories'}>
              {#if sourceIndex&&sourceIndex.nativeSubtypeByItem.size===sourceIndex.sourceItemCount&&sourceTopCategory===null}
                {#each topCategoryCards.filter(group=>!(worldFilter||sourceChoices.worldContextTag)||group.total>0) as group (group.id)}
                  {@const denominator=sourceIndex?.rootsByItem?(rootProgressTotals.get(group.id)??0):group.total}
                  <button type="button" class="facet-card collection-top-category"
                    data-top-category={group.id} disabled={group.total===0}
                    on:click={()=>chooseTopCategory(group.id)}>
                    <span class="facet-flourish" aria-hidden="true"><WandIcon name={group.icon} size={22}/></span>
                    <strong>{collectionTopCategoryLabel(locale,group.id)}</strong>
                    <span class="collection-category-progress" data-progress-owned={group.owned} data-progress-total={denominator}>
                      {denominator?group.owned.toLocaleString(locale)+' / '+denominator.toLocaleString(locale):'—'}
                      {#if denominator}<span class="collection-category-percent">{Math.floor(group.owned*100/denominator)}%</span>{/if}
                    </span>
                  </button>
                {/each}
              {:else if sourceIndex?.rootsByItem}
                {#each scopedSubcategories as group (group.key)}
                  <button type="button" class="facet-card collection-native-subtype"
                    data-native-subtype={group.key} on:click={()=>chooseNativeSubtype(group.key)}>
                    <span class="facet-flourish" aria-hidden="true"><WandIcon name={categoryPictogram[group.nativeType]??'collection'} size={22}/></span>
                    <strong>{collectionFurnitureKindLabel(locale,group.key,sourceIndex)??nativeSubtypeLabel(locale,group.key,group.nativeName)}</strong>
                    <span>{group.total.toLocaleString(locale)} {copy.countUnit}</span>
                  </button>
                {/each}
              {:else if sourceIndex&&sourceIndex.nativeSubtypeByItem.size===sourceIndex.sourceItemCount}
                {#each sourceNativeSubtypeCards.filter(type=>collectionTopCategory(type.key)===sourceTopCategory) as type (type.key)}
                  <button type="button" class="facet-card collection-native-subtype"
                    data-native-subtype={type.key}
                    on:click={()=>chooseNativeSubtype(type.key)}>
                    <span class="facet-flourish" aria-hidden="true">
                      <WandIcon name={categoryPictogram[
                        type.nativeType==='Trimming'?'Wallpaper & Flooring':type.nativeType
                      ]??'collection'} size={22}/>
                    </span>
                    <strong>{nativeSubtypeLabel(locale,type.key,type.nativeName)}</strong>
                    <span>{type.total.toLocaleString(locale)} {copy.countUnit}</span>
                  </button>
                {/each}
              {:else}
                {#each scopedCategoryFacets.filter(facet=>
                  facet.total>0&&!(sourceActivityTypeCards.length&&
                    sourceActivityLegacyFamilies.has(facet.id))) as facet (facet.id)}
                  <button type="button" class="facet-card"
                    on:click={()=>chooseFacet(facet.id)}>
                    <span class="facet-flourish" aria-hidden="true">
                      <WandIcon name={categoryPictogram[facet.id]??'collection'} size={22}/>
                    </span>
                    <strong>{categoryLabel(locale,facet.id)}</strong>
                    <span>{facet.total.toLocaleString(locale)} {copy.countUnit}</span>
                  </button>
                {/each}
              {/if}
              {#each sourceActivityTypeCards.filter(type=>!sourceIndex?.rootsByItem&&((!sourceIndex||sourceIndex.nativeSubtypeByItem.size!==sourceIndex.sourceItemCount)||
                (sourceTopCategory!==null&&collectionTopCategory('ActivityItem:'+type.code)===sourceTopCategory))) as type (type.code)}
                <button type="button" class="facet-card collection-native-activity"
                  data-source-type={type.code}
                  on:click={()=>chooseActivityType(type.code)}>
                  <span class="facet-flourish" aria-hidden="true">
                    <WandIcon name={categoryPictogram[sourceActivityLegacyNames[type.code]??'']??'collection'} size={22}/>
                  </span>
                  <strong>{sourceActivityTypeLabel(locale,type.code,type.nativeName)}</strong>
                  <span>{type.total.toLocaleString(locale)} {copy.countUnit}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        {#if selectedItem}
          <aside class="item-inspector" role={mobileInspector?"dialog":undefined} aria-modal={mobileInspector?"true":undefined} aria-label={copy.itemInfo}>
            <div class="inspector-heading">
              <span class="visually-hidden">{copy.itemInfo}</span>
              <div class="inspector-header-actions">
                <button type="button" aria-label={copy.copyLink}
                  title={copy.copyLink} on:click={copySelectedItemLink}>
                  <WandIcon name="link" size={17}/>
                </button>
                <button type="button" bind:this={inspectorClose}
                  on:click={closeItem} aria-label={copy.closeDetails}>×</button>
              </div>
            </div>
            <div class="inspector-art">{#if getMemorySources(selectedItem.itemId)!==null}<MemoryCandidateArtwork itemId={selectedItem.itemId} entry={selectedEntry} showPieces={showMemoryPieces} saveSelected={Boolean($localSaveSession.file)} unknownLabel={memoryCopy.unknown} unavailableLabel={memoryCopy.unavailable} editable={!memoryPreviewRequested} disabled={busy||Boolean(storeError)} onPiece={toggleMemoryPiece} flags={memoryPreviewRequested?$localSaveSession.memoryFlags:undefined} alt={selectedItem.label} sourcePath={gameImageMap[String(selectedItem.itemId)]??null} large/>{:else}<ItemArtwork itemId={selectedItem.itemId} alt={selectedItem.label} sourcePath={gameImageMap[String(selectedItem.itemId)]??null} large />{/if}</div>
            <h2>{selectedItem.label}</h2>
            <p class="inspector-meta">{displayItemCategory(selectedItem)}</p>
            {#if runtime&&!runtime.isOwnerLocal&&!busy&&!saveReadInProgress}<a class="item-page-link" href={itemEntityHref(base,selectedItem.itemId,isWandLanguage(locale)?locale:undefined)}>{entityCopy.page}<WandIcon name="link" size={16}/></a>{/if}
            {#if selectedMemory}
              <div class="memory-piece-toolbar">
                <strong>{selectedMemoryBits===null?'?':memoryPieceCount(selectedMemoryBits)} / {selectedMemory.numberOfShards}</strong>
                <label><input type="checkbox" bind:checked={showMemoryPieces}/>{memoryCopy.split}</label>
                {#if memoryPreviewRequested}
                  <a class="memory-comparison-link" href={base+'/media/memory-preview/'}>{locale==='ja'?'詳細比較（開発用）':'Detailed comparison (development)'}</a>
                  <small>{locale==='ja'?'セーブのビット対応は未検証です。':'Saved-flag mapping is unverified.'}</small>
                {:else}
                  <button type="button" disabled={busy||Boolean(storeError)||selectedMemoryBits===completeMemoryBits(selectedMemory.numberOfShards)} on:click={()=>setMemoryPieces(completeMemoryBits(selectedMemory!.numberOfShards))}>{memoryCopy.all}</button>
                  <button type="button" disabled={busy||Boolean(storeError)||selectedMemoryBits===0} on:click={()=>setMemoryPieces(0)}>{memoryCopy.clear}</button>
                  {#if selectedMemoryBits===null}<small>{memoryCopy.unknown}</small>
                  {:else if !selectedMemoryEligible}<small>{memoryCopy.unverified}</small>
                  {:else if selectedMemoryBits!==completeMemoryBits(selectedMemory.numberOfShards)||showMemoryPieces}
                    <div class="memory-piece-buttons" role="group" aria-label={memoryCopy.select}>
                      {#each Array.from({length:selectedMemory.numberOfShards},(_,i)=>i) as i}
                        <button type="button" disabled={busy||Boolean(storeError)} aria-label={memoryCopy.piece+' '+(i+1)} aria-pressed={(selectedMemoryBits&(1<<i))!==0} on:click={()=>toggleMemoryPiece(1<<i)}>{i+1}</button>
                      {/each}
                    </div>
                  {/if}
                {/if}
              </div>
            {/if}
            <div class="inspector-section">
              <h3>{copy.collectionRecord}</h3>
              {#if !selectedMemory}<div class="ownership-actions">
                <button type="button" disabled={Boolean(storeError)} class:active={selectedEntry.status==='owned'} on:click={()=>changeEntry({status:'owned'})}>{copy.owned}</button>
                <button type="button" disabled={Boolean(storeError)} class:active={selectedEntry.status==='missing'} on:click={()=>changeEntry({status:'missing'})}>{copy.missing}</button>
                <button type="button" disabled={Boolean(storeError)} class:active={!selectedEntry.status} on:click={()=>changeEntry({status:null})}>{copy.unrecorded}</button>
              </div>{/if}
              {#if ['QUANTITY_STOCK','OWNERSHIP_STOCK_AND_DISCOVERY'].includes(selectedItem.stateSemantic)}
                <label class="numeric-field">{copy.manualQuantity}
                  <input type="number" min="0" max="999999" step="1" value={selectedEntry.quantity??''}
                    disabled={Boolean(storeError)}
                    on:change={(event)=>{
                      const value=(event.currentTarget as HTMLInputElement).value;
                      changeEntry({quantity:value===''?null:Number(value)});
                    }} placeholder={copy.unrecorded}/>
                </label>
              {/if}
              {#if selectedItem.stateSemantic.includes('DISCOVERY') || selectedEntry.discovered!==undefined}
                <label class="check-row"><input type="checkbox" checked={selectedEntry.discovered===true}
                  disabled={Boolean(storeError)} on:change={(event)=>changeEntry({discovered:(event.currentTarget as HTMLInputElement).checked})}/> {copy.discovered}</label>
              {/if}
              <label class="check-row"><input type="checkbox" checked={selectedEntry.favorite===true}
                disabled={Boolean(storeError)} on:change={(event)=>changeEntry({favorite:(event.currentTarget as HTMLInputElement).checked})}/> {copy.favorite}</label>
            </div>
            {#if runtime&&!runtime.isOwnerLocal&&(runtime.metadata.snapshot==='steam-1.26.2-native-itemlist-v1'||runtime.metadata.snapshot.endsWith('-collection-source-v3'))}
              {#key selectedItem.itemId}
                <!-- Preserve existing pose permalinks during migration. -->
                {#if legacyLinkedItemId===selectedItem.itemId}<ItemMasterDetails itemId={selectedItem.itemId} {locale}/>{/if}
                <CurrentItemFacts itemId={selectedItem.itemId} {locale} compact/>
              {/key}
            {/if}
            {#if selectedScopeLabels.worlds.length || selectedScopeLabels.universes.length}
              <section class="inspector-details">
                <h3>{copy.details}</h3>
                <dl>
                  {#if selectedScopeLabels.worlds.length}
                    <dt>{copy.world}</dt><dd>{selectedScopeLabels.worlds.join('、')}</dd>
                  {/if}
                  {#if selectedScopeLabels.universes.length}
                    <dt>{copy.universe}</dt><dd>{selectedScopeLabels.universes.join('、')}</dd>
                  {/if}
                </dl>
              </section>
            {/if}
            {#if runtime&&!runtime.isOwnerLocal&&(runtime.metadata.snapshot==='steam-1.26.2-native-itemlist-v1'||runtime.metadata.snapshot.endsWith('-collection-source-v3'))}
              <AcquisitionEvidence itemId={selectedItem.itemId} {locale}/>
            {/if}
          </aside>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .item-page-link{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 8px;margin:8px 0;border:1px solid var(--wand-line);border-radius:7px;background:var(--wand-card);color:var(--wand-text);text-decoration:none;font-weight:600}
  .inspector-details h3{font-size:14px;margin:0 0 8px}
  /* Image-first Collection tiles. Shared shell theme remains authoritative. */
  .memory-piece-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin:6px 0;font-size:12px}
  .memory-piece-toolbar label{display:flex;align-items:center;gap:4px}
  .memory-piece-buttons{display:flex;flex-wrap:wrap;gap:3px;width:100%}
  .memory-piece-buttons button[aria-pressed="true"]{background:#367aa5;color:white}
  .memory-piece-toolbar small{width:100%}
  .memory-comparison-link{display:inline-block;padding:6px 8px;text-decoration:underline}
  .items-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,114px),1fr));gap:6px;align-items:stretch}
  .item-card{position:relative;display:flex;min-width:0;min-height:0;padding:5px;gap:0;align-items:stretch;border-radius:7px;
    background:var(--wand-card);border-color:var(--wand-line);color:var(--wand-text)}
  .item-card-body{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:3px;width:100%;text-align:center;padding:0;min-width:0}
  .item-icon{width:100%;height:76px;min-width:0;min-height:0;grid-template:minmax(0,1fr)/minmax(0,1fr);overflow:hidden;border-radius:4px;background:transparent;padding:3px;box-sizing:border-box}
  .inspector-art{grid-template:minmax(0,1fr)/minmax(0,1fr);min-width:0;min-height:0}
  .item-card-copy{width:100%;display:block;min-height:30px;flex:0}
  .item-card-copy :global(.collection-source-marks){margin-top:3px}
  .item-card-copy strong{font-size:11px;line-height:1.25;white-space:normal;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .item-state-toggle{position:absolute;right:4px;top:4px;width:24px;height:24px;z-index:1;border-radius:5px;background:var(--wand-menu);color:var(--wand-text);border-color:var(--wand-line)}
  .item-state-toggle.owned{background:var(--wand-accent,#37855d);color:var(--wand-accent-contrast,#fff)}
  .item-card.current,.item-card.bulk-selected{border-color:var(--wand-accent)}
  .collection-category-progress{display:flex;align-items:center;justify-content:space-between;gap:5px;width:100%;font-variant-numeric:tabular-nums}
  .collection-category-percent{color:var(--wand-text);font-weight:600}
  .collection-item-universe-heading{grid-column:1/-1;font-size:12px;font-weight:600;margin:8px 0 0;line-height:1.3;color:inherit}
  .collection-universe-section-head{margin-bottom:5px}
  @media(max-width:540px){.items-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,94px),1fr));gap:4px}.item-icon{height:64px}.item-card{padding:4px}.item-card-copy strong{font-size:10px}.item-state-toggle{width:22px;height:22px}}
</style>
