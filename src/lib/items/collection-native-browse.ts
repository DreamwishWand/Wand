/**
 * DB-01 owner-local Collection browse read model.
 *
 * One typed call surface for native Collection areas (names only), categories,
 * source Sets and published DB-00 Item IDs with DB-02/03 evidence.
 * No unverified area/Item association or runtime UI visibility is inferred.
 *
 * Input source readers must already be independently SHA verified. This
 * deliberately neither downloads nor publishes private original data.
 * Run the 39k-definition source index behind a Worker in UI integrations.
 */
import {DB01_LOCALES,type Db01Locale} from './index.ts';
import {
  DB01_COLLECTION_UI_AXES,DB01_ORIGINAL_COLLECTION_AREAS,
  DB01_ORIGINAL_COLLECTION_SUBMENUS,
  type Db01CollectionNativeUiAxesClient,
  type Db01CollectionNativeAreaOption,
  type Db01CollectionNativeCategoryOption,
  type Db01CollectionNativeSourceSet,
  type Db01CollectionUnmatchedUiLabel,
} from './collection-ui-axes.ts';
import {
  DB01_SOURCE_MENU_INDEX_SCHEMA,
  type Db01OriginalSourceMenuQueryClient,
  type Db01OriginalSourceMenuOption,
  type Db01OriginalSourceSubmenuOption,
  type Db01OriginalSourceMenuQuery,
} from './collection-source-index.ts';
import {
  DB01_DB00_COLLECTION_RESULTS_CONTRACT,
  type Db01Db00CollectionResultsReader,
  type Db01Db00CollectionResultsPage,
} from './db00-source-results.ts';

export const DB01_COLLECTION_NATIVE_BROWSE_CONTRACT=
  'wand.db01.collection-native-browse@1' as const;

export interface Db01CollectionBrowseCategory{
  readonly original:Readonly<Db01CollectionNativeCategoryOption>;
  /** Count across the original static source predicates, not live UI items. */
  readonly sourceCandidateItemCount:number;
  readonly sourceCandidateCountVerified:true;
  readonly gameRuntimeCategoryVisibleVerified:false;
}
export interface Db01CollectionBrowseSet{
  readonly original:Readonly<Db01CollectionNativeSourceSet>;
  readonly sourceCandidateItemCount:number;
  readonly directlyListedSourceItemCount:number;
  readonly positivePredicateSourceItemCount:number;
  readonly gameRuntimeSetVisibleVerified:false;
}
export interface Db01CollectionBrowseNavigation{
  readonly locale:Db01Locale;
  readonly categories:readonly Db01CollectionBrowseCategory[];
  /** Game-original labels only: cannot be used as a proven world filter. */
  readonly areaLabelsOnly:readonly Readonly<Db01CollectionNativeAreaOption>[];
  readonly unboundNativeTabLabels:readonly Readonly<Db01CollectionUnmatchedUiLabel>[];
  readonly collectionAreaToItemMembershipVerified:false;
  readonly collectionCategoryToRuntimeTabBindingVerified:false;
  readonly publicationAuthorized:false;
}
export interface Db01CollectionBrowseSelection{
  readonly locale:Db01Locale;
  /** Omitted = all original source Sets. */
  readonly submenuCode?:number;
  /** Only valid with a submenuCode, verified against original source Set IDs. */
  readonly setId?:number;
  readonly searchText?:string;
  readonly listingEvidence?:Db01OriginalSourceMenuQuery['listingEvidence'];
  readonly nativeCategories?:Db01OriginalSourceMenuQuery['nativeCategories'];
  readonly native?:Db01OriginalSourceMenuQuery['native'];
}
export interface Db01CollectionNativeBrowseClient{
  readonly contract:typeof DB01_COLLECTION_NATIVE_BROWSE_CONTRACT;
  readonly publicationAuthorized:false;
  readonly gameUiMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  /** Native 20 categories + 7 original area *labels*, no world filter. */
  getNavigation(locale:Db01Locale):Promise<Db01CollectionBrowseNavigation>;
  /** Original source Set order, exact 8-locale names and candidate counts. */
  getSets(locale:Db01Locale,submenuCode:number):
    Promise<readonly Db01CollectionBrowseSet[]>;
  /** Current published Item IDs only, plus original source and DB-02/03 links. */
  search(selection:Db01CollectionBrowseSelection,
    page?:Readonly<{offset?:number;limit?:number}>):
    Promise<Db01Db00CollectionResultsPage>;
}

const LANGUAGES=new Set<string>(DB01_LOCALES);
const SHA=/^[a-f0-9]{64}$/;
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB01_COLLECTION_BROWSE_'+reason);
}
function validLocale(value:unknown):asserts value is Db01Locale{
  check(typeof value==='string'&&LANGUAGES.has(value),'INVALID_LOCALE');
}
const validId=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
function validPage(page:Readonly<{offset?:number;limit?:number}>):void{
  check(page!==null&&typeof page==='object'&&!Array.isArray(page)&&
    Number.isSafeInteger(page.offset??0)&&(page.offset??0)>=0&&
    (page.offset??0)<=1_000_000&&
    Number.isSafeInteger(page.limit??72)&&(page.limit??72)>=1&&
    (page.limit??72)<=500,'INVALID_PAGE');
}

export function createDb01CollectionNativeBrowseClient(
  axes:Db01CollectionNativeUiAxesClient,
  index:Db01OriginalSourceMenuQueryClient,
  results:Db01Db00CollectionResultsReader,
):Db01CollectionNativeBrowseClient{
  const meta=axes?.source,origin=index?.source,joined=results?.target;
  check(axes?.contract===DB01_COLLECTION_UI_AXES&&
    index?.schema===DB01_SOURCE_MENU_INDEX_SCHEMA&&
    results?.contract===DB01_DB00_COLLECTION_RESULTS_CONTRACT&&
    meta?.gameVersion==='1.26.2'&&
    meta.originalCollectionSetDefinitions===305&&
    meta.nativeCollectionSubMenuDefinitions===20&&
    meta.nativeCollectionAreaDefinitions===7&&
    meta.actualGameUiMembershipVerified===false&&
    meta.worldAvailabilityVerified===false&&
    SHA.test(meta.sourceItemsSha256)&&
    SHA.test(meta.sourceCollectionSetSha256)&&
    SHA.test(meta.privateLocaleOverlaySha256)&&
    origin.gameVersion===meta.gameVersion&&
    origin.sourceItemsSha256===meta.sourceItemsSha256&&
    joined.gameVersion===meta.gameVersion&&
    joined.privateSourceSha256===meta.sourceItemsSha256&&
    joined.snapshotId==='steam-1.26.2-native-itemlist-v1'&&
    joined.publicationAuthorized===false&&
    typeof axes.getAreaOptions==='function'&&
    typeof axes.getCategoryOptions==='function'&&
    typeof axes.getCategorySourceSets==='function'&&
    typeof axes.getUnmatchedTabLabels==='function'&&
    typeof index.getSubmenus==='function'&&
    typeof index.getCollectionSets==='function'&&
    typeof results.search==='function','CURRENT_VERIFIED_SOURCE_COMPOSITION_REQUIRED');

  type SourceIndex=Readonly<{
    byCode:ReadonlyMap<number,Db01OriginalSourceSubmenuOption>;
    bySet:ReadonlyMap<number,Db01OriginalSourceMenuOption>;
  }>;
  let cached:Promise<SourceIndex>|null=null;
  function sourceIndex():Promise<SourceIndex>{
    if(cached)return cached;
    cached=(async()=>{
      const [categories,sets]=await Promise.all([
        index.getSubmenus(),index.getCollectionSets(),
      ]);
      check(Array.isArray(categories)&&categories.length===18&&
        Array.isArray(sets)&&sets.length===305,
        'SOURCE_INDEX_COUNTS');
      const byCode=new Map<number,Db01OriginalSourceSubmenuOption>();
      const bySet=new Map<number,Db01OriginalSourceMenuOption>();
      const originalCodes=new Map(DB01_ORIGINAL_COLLECTION_SUBMENUS.map(x=>[
        x.code,x.enumName,
      ] as const));
      for(const category of categories){
        check(Number.isSafeInteger(category.submenuCode)&&
          originalCodes.get(category.submenuCode)===category.submenu&&
          category.sourceSetCount>0&&
          category.gameRuntimeMembershipVerified===false&&
          !byCode.has(category.submenuCode),'ORIGINAL_CATEGORY_CENSUS');
        byCode.set(category.submenuCode,category);
      }
      for(const entry of sets){
        const menu=entry.sourceMenu;
        check(validId(menu.setId)&&!bySet.has(menu.setId)&&
          byCode.has(menu.submenuCode)&&
          byCode.get(menu.submenuCode)!.submenu===menu.submenu&&
          menu.gameUiVisibilityVerified===false&&
          entry.gameRuntimeMembershipVerified===false&&
          Number.isSafeInteger(entry.distinctCandidateItemIds)&&
          entry.distinctCandidateItemIds>=0&&
          Number.isSafeInteger(entry.directListedItemIds)&&
          entry.directListedItemIds>=0&&
          Number.isSafeInteger(entry.dynamicPredicateItemIds)&&
          entry.dynamicPredicateItemIds>=0,
          'ORIGINAL_SET_INDEX_IDENTITY');
        bySet.set(menu.setId,entry);
      }
      check([...byCode.values()].reduce((s,entry)=>s+entry.sourceSetCount,0)===305&&
        [...byCode].every(([code,category])=>
          sets.filter(set=>set.sourceMenu.submenuCode===code).length===
            category.sourceSetCount)&&
        !byCode.has(17)&&!byCode.has(19),
        'ORIGINAL_CATEGORY_SET_COUNTS');
      return Object.freeze({byCode,bySet});
    })().catch(error=>{cached=null;throw error;});
    return cached;
  }

  const navigations=new Map<Db01Locale,Promise<Db01CollectionBrowseNavigation>>();
  async function getNavigation(locale:Db01Locale):Promise<Db01CollectionBrowseNavigation>{
    validLocale(locale);
    const previous=navigations.get(locale);
    if(previous)return previous;
    const task=(async()=>{
      const [source,areas,categories,unbound]=await Promise.all([
        sourceIndex(),axes.getAreaOptions(locale),
        axes.getCategoryOptions(locale),axes.getUnmatchedTabLabels(locale),
      ]);
      check(areas.length===7&&categories.length===20&&
        unbound.length===1&&
        unbound[0].originalLocDbKey==='tab_title_critters'&&
        unbound[0].collectionSubMenuEnumAssociation===null,
        'ORIGINAL_LOCALIZED_UI_AXES');
      check(areas.every((area,i)=>
          area.areaCode===DB01_ORIGINAL_COLLECTION_AREAS[i].code&&
          area.originalEnumName===DB01_ORIGINAL_COLLECTION_AREAS[i].enumName&&
          area.locale===locale&&
          area.currentOriginalLocDbNameVerified===true&&
          area.codeToRuntimeLabelBindingVerified===false&&
          area.itemWorldAvailabilityVerified===false),
        'ORIGINAL_AREA_LABELS');
      const normalized=categories.map((category,i)=>{
        const spec=DB01_ORIGINAL_COLLECTION_SUBMENUS[i];
        const indexed=source.byCode.get(category.submenuCode);
        check(category.locale===locale&&
          category.submenuCode===spec.code&&
          category.originalEnumName===spec.enumName&&
          category.originalCollectionSetCount===(indexed?.sourceSetCount??0)&&
          category.currentOriginalLocDbNameVerified===true&&
          category.codeToRuntimeLabelBindingVerified===false&&
          category.runtimeCategoryVisibleVerified===false&&
          category.itemGameUiMembershipVerified===false,
          'ORIGINAL_LOCALIZED_CATEGORY_CENSUS');
        return Object.freeze({
          original:category,
          sourceCandidateItemCount:indexed?.distinctCandidateItemIds??0,
          sourceCandidateCountVerified:true as const,
          gameRuntimeCategoryVisibleVerified:false as const,
        });
      });
      return Object.freeze({
        locale,categories:Object.freeze(normalized),
        areaLabelsOnly:Object.freeze([...areas]),
        unboundNativeTabLabels:Object.freeze([...unbound]),
        collectionAreaToItemMembershipVerified:false as const,
        collectionCategoryToRuntimeTabBindingVerified:false as const,
        publicationAuthorized:false as const,
      });
    })();
    navigations.set(locale,task);
    try{return await task;}
    catch(error){if(navigations.get(locale)===task)navigations.delete(locale);throw error;}
  }

  const localeSets=new Map<string,Promise<readonly Db01CollectionBrowseSet[]>>();
  async function getSets(locale:Db01Locale,submenuCode:number):
    Promise<readonly Db01CollectionBrowseSet[]>{
    validLocale(locale);
    check(Number.isSafeInteger(submenuCode)&&
      DB01_ORIGINAL_COLLECTION_SUBMENUS.some(x=>x.code===submenuCode),
      'UNKNOWN_ORIGINAL_SUBMENU');
    const key=locale+':'+submenuCode;
    const existing=localeSets.get(key);
    if(existing)return existing;
    const task=(async()=>{
      const [source,nav,rows]=await Promise.all([
        sourceIndex(),getNavigation(locale),
        axes.getCategorySourceSets(locale,submenuCode),
      ]);
      const category=nav.categories.find(c=>c.original.submenuCode===submenuCode);
      check(category&&rows.length===category.original.originalCollectionSetCount,
        'CATEGORY_SOURCE_SET_COUNT');
      const seen=new Set<number>();
      const entries=rows.map(row=>{
        const entry=source.bySet.get(row.setId);
        const menu=entry?.sourceMenu;
        check(validId(row.setId)&&!seen.has(row.setId)&&
          row.locale===locale&&
          row.submenuCode===submenuCode&&
          row.nativeCollectionSubMenuAssociationVerified===true&&
          row.sourceCategoryIsGameScreenMembershipVerified===false&&
          row.nativeCollectionAreaCode===null&&
          row.currentOriginalLocDbLabelVerified===
            (row.currentExactSetName!==null)&&
          menu&&menu.submenuCode===submenuCode&&
          menu.setKey===row.nativeSetKey&&
          menu.sortPriority===row.originalSetSortPriority&&
          menu.groupCount===row.sourceGroupCount&&
          menu.directListedItemCount===row.sourceDirectItemCount&&
          menu.dynamicSelectorsUnresolved===row.originalStaticSelectorCount&&
          menu.collectionLabelKey===row.collectionLabelKey&&
          entry.directListedItemIds===row.sourceDirectItemCount,
          'ORIGINAL_SET_LOCALE_OR_INDEX_MISMATCH');
        seen.add(row.setId);
        return Object.freeze({
          original:row,
          sourceCandidateItemCount:entry.distinctCandidateItemIds,
          directlyListedSourceItemCount:entry.directListedItemIds,
          positivePredicateSourceItemCount:entry.dynamicPredicateItemIds,
          gameRuntimeSetVisibleVerified:false as const,
        });
      });
      check(entries.every((item,i)=>i===0||
        item.original.originalSetSortPriority>=entries[i-1].original.originalSetSortPriority),
        'ORIGINAL_SET_ORDER');
      return Object.freeze(entries);
    })();
    localeSets.set(key,task);
    try{return await task;}
    catch(error){if(localeSets.get(key)===task)localeSets.delete(key);throw error;}
  }

  async function search(selection:Db01CollectionBrowseSelection,
    page:Readonly<{offset?:number;limit?:number}>={}):
    Promise<Db01Db00CollectionResultsPage>{
    check(selection!==null&&typeof selection==='object'&&!Array.isArray(selection),
      'INVALID_SELECTION');
    validLocale(selection.locale);
    validPage(page);
    const code=selection.submenuCode;
    const setId=selection.setId;
    if(setId!==undefined){
      check(validId(setId)&&code!==undefined,
        'SET_REQUIRES_NATIVE_CATEGORY');
    }
    if(code!==undefined)
      check(Number.isSafeInteger(code)&&
        DB01_ORIGINAL_COLLECTION_SUBMENUS.some(x=>x.code===code),
        'UNKNOWN_ORIGINAL_SUBMENU');
    // We don't yet have a source-verified Item -> CollectionArea map; an
    // area-based filter must not sneak through this browser entrypoint.
    const unknown=Object.keys(selection).filter(k=>![
      'locale','submenuCode','setId','searchText','listingEvidence',
      'nativeCategories','native',
    ].includes(k));
    check(unknown.length===0,'UNSUPPORTED_FILTER_DIMENSION');
    if(code!==undefined){
      const sets=await getSets(selection.locale,code);
      if(setId!==undefined){
        check(sets.some(set=>set.original.setId===setId),
          'SET_NOT_IN_SELECTED_CATEGORY');
      }
      // Original enum members 17 and 19 carry zero source Set definitions.
      // Their runtime screen behavior is unknown; an empty source-only search
      // is not proof that the actual game hides these categories.
      if(sets.length===0){
        check(setId===undefined,'EMPTY_CATEGORY_SET');
        check(selection.searchText===undefined||
          typeof selection.searchText==='string'&&
            selection.searchText.trim().length<=150,
          'INVALID_SEARCH_TEXT');
        check(selection.listingEvidence===undefined||
          ['any','direct','predicate'].includes(selection.listingEvidence),
          'INVALID_LISTING_EVIDENCE');
        const offset=page.offset??0;
        return Object.freeze({
          items:Object.freeze([]),totalPublishedMatches:0,
          totalOriginalSourceCandidates:0,unpublishedSourceDefinitionCount:0,
          offset,nextOffset:null,hasMore:false,
          snapshotId:results.target.snapshotId,
          locale:selection.locale,privateSourceJoin:true as const,
          publicationAuthorized:false as const,
          originalCategoryIsGameUiVerified:false as const,
          worldAvailabilityVerified:false as const,
          dlcEntitlementVerified:false as const,
        });
      }
    }
    return results.search({
      locale:selection.locale,
      ...(code===undefined?{}:{submenuCodes:[code]}),
      ...(setId===undefined?{}:{collectionSetIds:[setId]}),
      ...(selection.searchText===undefined?{}:{searchText:selection.searchText}),
      ...(selection.listingEvidence===undefined?{}:{
        listingEvidence:selection.listingEvidence,
      }),
      ...(selection.nativeCategories===undefined?{}:{
        nativeCategories:selection.nativeCategories,
      }),
      ...(selection.native===undefined?{}:{native:selection.native}),
    },page);
  }
  return Object.freeze({
    contract:DB01_COLLECTION_NATIVE_BROWSE_CONTRACT,
    publicationAuthorized:false as const,
    gameUiMembershipVerified:false as const,
    worldAvailabilityVerified:false as const,
    getNavigation,getSets,search,
  });
}
