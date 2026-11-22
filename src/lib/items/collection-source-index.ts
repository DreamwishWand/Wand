/** Original-game CollectionSubMenu/CollectionSet query index for DB-01.
 *
 * This is a read composition of the existing SHA-checked private catalog and
 * three already proven positive source-predicate overlays (262 selectors).
 * Native game screen membership/visibility/unlocks remain UNVERIFIED.
 * The original v1.26.2 CollectionSubMenu enum is not a DLC/world filter.
 */
import {DB01_LOCALES,type Db01CatalogClient,type Db01Item,type Db01Locale} from './index.ts';
import type {
  Db01SharedItemClient,Db01SharedItem,
  Db01StaticPredicate,
} from './shared-view.ts';
import type {Db01OriginalCollectionMenu} from './collection-menu.ts';
import type {
  Db01NativeFacetFilterClient,Db01NativeFilterQuery,
} from './native-facet-filters.ts';

export const DB01_SOURCE_MENU_INDEX_SCHEMA='wand.db01.collection-source-menu-index@1' as const;
export type Db01SourceMenuEvidence='original_explicit_item_list'|
  'original_static_collection_predicate';
export interface Db01SourceMenuLink{
  readonly collectionSetId:number;
  readonly submenuCode:number;
  readonly submenu:string;
  readonly originalSetKey:string;
  readonly collectionLabelKey:string|null;
  readonly groupIndexes:readonly number[];
  /** Original explicit references and static predicate groups remain independently queryable. */
  readonly directGroupIndexes:readonly number[];
  readonly predicateGroupIndexes:readonly number[];
  readonly directOriginalListing:boolean;
  readonly sourcePredicateMatches:number;
  readonly evidence:readonly Db01SourceMenuEvidence[];
  readonly gameRuntimeMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
}
export interface Db01OriginalSourceMenuOption{
  readonly sourceMenu:Readonly<Db01OriginalCollectionMenu>;
  readonly distinctCandidateItemIds:number;
  readonly directListedItemIds:number;
  readonly dynamicPredicateItemIds:number;
  readonly gameRuntimeMembershipVerified:false;
}
export interface Db01OriginalSourceSubmenuOption{
  readonly submenu:string;
  readonly submenuCode:number;
  readonly sourceSetCount:number;
  readonly distinctCandidateItemIds:number;
  readonly gameRuntimeMembershipVerified:false;
}
/** Original CollectionSet groups are source indexes, not translated UI subcategories. */
export interface Db01OriginalSourceGroupSelection{
  readonly collectionSetId:number;
  readonly groupIndex:number;
}
export interface Db01OriginalSourceGroupOption extends Db01OriginalSourceGroupSelection{
  readonly originalSetKey:string;
  readonly submenu:string;
  readonly distinctCandidateItemIds:number;
  readonly directListedItemIds:number;
  readonly staticPredicateItemIds:number;
  readonly gameRuntimeMembershipVerified:false;
}
export type Db01SourceListingEvidence='any'|'direct'|'predicate';
export interface Db01OriginalSourceMenuQuery{
  /** OR within a dimension; AND between set, submenu, native category, facet filters. */
  readonly collectionSetIds?:readonly number[];
  readonly submenuCodes?:readonly number[];
  /** OR across exact (CollectionSet ID, source group index) pairs. */
  readonly sourceGroups?:readonly Db01OriginalSourceGroupSelection[];
  /** Direct original listings and positive static source selectors are never conflated. */
  readonly listingEvidence?:Db01SourceListingEvidence;
  readonly nativeCategories?:readonly string[];
  /** Reuses the existing source-exact native ItemType and Tag filter engine. */
  readonly native?:Omit<Db01NativeFilterQuery,'offset'|'limit'>;
  /** Optional substring in an original current-version Item name OR Item ID.
   * No historical/unverified translations and no fallback to another locale.
   */
  readonly searchText?:string;
  /** Exact current LocDB language for both filtering and returned labels.
   * English is used if not specified, never as a fallback for a null name.
   */
  readonly locale?:Db01Locale;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db01OriginalSourceMenuSearchItem {
  readonly itemId:number;
  readonly nativeCategory:string;
  readonly locale:Db01Locale;
  /** Null means no verified exact name for this Item ID in this locale. */
  readonly currentExactName:string|null;
  readonly currentExactNameVerified:boolean;
  /** Original source links that satisfy ALL selected source filters only.
   * Preserves direct vs positive static predicate evidence.
   */
  readonly matchedSourceLinks:readonly Readonly<Db01SourceMenuLink>[];
  readonly gameRuntimeMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
}
export interface Db01OriginalSourceMenuQueryResult{
  readonly total:number;
  readonly itemIds:readonly number[];
  /** Exact current names and matching original source evidence for this page. */
  readonly items:readonly Readonly<Db01OriginalSourceMenuSearchItem>[];
  readonly locale:Db01Locale;
  readonly hasMore:boolean;
  readonly sourceOnly:true;
  readonly gameRuntimeMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcOwnershipVerified:false;
}
export interface Db01OriginalSourceMenuCoverage{
  readonly gameVersion:string;
  readonly sourceItemsSha256:string;
  readonly catalogDefinitions:number;
  readonly catalogCategories:number;
  readonly originalCollectionSetDefinitions:number;
  readonly originalCollectionSubmenus:number;
  readonly originalSourceGroups:number;
  readonly originalDynamicSelectorsInterpreted:number;
  readonly directListedItemIds:number;
  readonly sourceMatchedDistinctItemIds:number;
  readonly staticPredicateDistinctItemIds:number;
  readonly suppressedPredicateOccurrences:number;
  readonly completeCurrentSourceScan:true;
  readonly gameRuntimeMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcOwnershipVerified:false;
}
export interface Db01OriginalSourceMenuQueryClient{
  readonly schema:typeof DB01_SOURCE_MENU_INDEX_SCHEMA;
  readonly source:Readonly<Pick<Db01OriginalSourceMenuCoverage,
    'gameVersion'|'sourceItemsSha256'>>;
  getCoverage():Promise<Readonly<Db01OriginalSourceMenuCoverage>>;
  getCollectionSets():Promise<readonly Readonly<Db01OriginalSourceMenuOption>[]>;
  getSubmenus():Promise<readonly Readonly<Db01OriginalSourceSubmenuOption>[]>;
  /** Includes empty source groups, never invents display category labels. */
  getSourceGroups(collectionSetId:number):
    Promise<readonly Readonly<Db01OriginalSourceGroupOption>[]>;
  /** Null = unknown Item ID in catalog. Empty = known, no original CollectionSet link. */
  getItemLinks(id:number):Promise<readonly Readonly<Db01SourceMenuLink>[]|null>;
  search(query?:Db01OriginalSourceMenuQuery):
    Promise<Readonly<Db01OriginalSourceMenuQueryResult>>;
}
const id=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nonneg=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function check(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('DB01_SOURCE_MENU_'+code);
}
type MutableLink={
  setId:number;groups:Set<number>;directGroups:Set<number>;
  predicateGroups:Set<number>;predicates:number;
};
type IndexedItem={
  nativeCategory:string;
  /** Source-validated current names, retained only for matched source rows. */
  names:Readonly<Db01Item['names']>|null;
  links:readonly Readonly<Db01SourceMenuLink>[];
};
type Index={
  byId:ReadonlyMap<number,IndexedItem>;
  setOptions:readonly Readonly<Db01OriginalSourceMenuOption>[];
  submenuOptions:readonly Readonly<Db01OriginalSourceSubmenuOption>[];
  groupOptions:ReadonlyMap<number,readonly Readonly<Db01OriginalSourceGroupOption>[]>;
  sortedMatchedIds:readonly number[];
  coverage:Readonly<Db01OriginalSourceMenuCoverage>;
};

export function createDb01OriginalSourceMenuQuery(
  catalog:Db01CatalogClient,
  shared:Db01SharedItemClient,
  native?:Db01NativeFacetFilterClient,
):Db01OriginalSourceMenuQueryClient{
  const base=catalog?.source,view=shared?.source;
  check(base?.privateOnly===true&&base.fullCorpusParsed===true&&
    typeof catalog.getCategories==='function'&&
    typeof catalog.getCategory==='function'&&
    typeof shared.getItems==='function'&&
    typeof shared.getSourceMenus==='function'&&
    base.platform==='Steam'&&id(base.definitions)&&
    view?.platform===base.platform&&view.gameVersion===base.gameVersion&&
    view.sourceItemsSha256===base.sourceItemsSha256&&
    view.definitions===base.definitions,
    'PRIVATE_SOURCE_IDENTITY');
  const prior=shared.getCoverage();
  check(prior.sourceDynamicSelectorsTotal!==null&&
    prior.sourceDynamicSelectorsTotal===prior.sourceDynamicSelectorsResolved&&
    prior.sourceCollectionSetDefinitions!==null&&
    prior.directListedIds!==null&&
    prior.sourceDynamicSelectorsTotal>0&&
    prior.sourceCollectionSetDefinitions>0,
    'INCOMPLETE_COLLECTION_SOURCE_OVERLAYS');
  if(native){
    check(native.source.gameVersion===base.gameVersion&&
      native.source.sourceItemsSha256===base.sourceItemsSha256&&
      typeof native.search==='function','NATIVE_FILTER_SOURCE_MISMATCH');
  }
  const source=Object.freeze({
    gameVersion:base.gameVersion,sourceItemsSha256:base.sourceItemsSha256,
  });
  const categories=Object.freeze([...catalog.getCategories()]);
  check(categories.length>0&&new Set(categories).size===categories.length&&
    categories.every(v=>typeof v==='string'&&
      /^[A-Za-z][A-Za-z0-9]*$/.test(v)),'SOURCE_CATEGORIES');

  async function build():Promise<Index>{
    const sourceMenus=await shared.getSourceMenus();
    check(sourceMenus&&sourceMenus.length===prior.sourceCollectionSetDefinitions,
      'ORIGINAL_COLLECTIONSET_COUNT');
    const menus=new Map<number,Readonly<Db01OriginalCollectionMenu>>();
    for(const menu of sourceMenus){
      check(id(menu.setId)&&nonneg(menu.submenuCode)&&
        typeof menu.submenu==='string'&&menu.submenu.length>0&&
        !menus.has(menu.setId)&&
        menu.gameUiVisibilityVerified===false,
        'ORIGINAL_SET_ID_OR_SUBMENU');
      menus.set(menu.setId,menu);
    }
    const byId=new Map<number,IndexedItem>();
    const perSet=new Map<number,{all:Set<number>;direct:Set<number>;dynamic:Set<number>}>();
    const perSubmenu=new Map<number,Set<number>>();
    const perGroup=new Map<string,{all:Set<number>;direct:Set<number>;predicate:Set<number>}>();
    const submenuNames=new Map<number,string>();
    let suppressed=0,defined=0,directUnique=0,dynamicUnique=0;
    for(const menu of sourceMenus){
      perSet.set(menu.setId,{all:new Set(),direct:new Set(),dynamic:new Set()});
      check(nonneg(menu.groupCount)&&menu.groupCount<=4096,'INVALID_SOURCE_GROUP_COUNT');
      for(let n=0;n<menu.groupCount;n++)
        perGroup.set(menu.setId+':'+n,{
          all:new Set(),direct:new Set(),predicate:new Set(),
        });
      perSubmenu.set(menu.submenuCode,perSubmenu.get(menu.submenuCode)??new Set());
      const older=submenuNames.get(menu.submenuCode);
      check(older===undefined||older===menu.submenu,'CONFLICTING_NATIVE_SUBMENU');
      submenuNames.set(menu.submenuCode,menu.submenu);
    }
    // Enumerate catalog-owned categories rather than guessing Item ID ranges.
    // Only four category shards run in parallel; source clients own SHA checks.
    const rows: {itemId:number;nativeCategory:string;
      names:Readonly<Db01Item['names']>}[]=[];
    let next=0;
    await Promise.all(Array.from({length:Math.min(4,categories.length)},async()=>{
      while(next<categories.length){
        const category=categories[next++];
        const chunk=await catalog.getCategory(category);
        for(const record of chunk){
          check(record.nativeCategory===category&&id(record.itemId),
            'CATALOG_NATIVE_IDENTITY');
          check(record.names&&DB01_LOCALES.every(locale=>
            Object.hasOwn(record.names,locale)&&
            (record.names[locale]===null||
              (typeof record.names[locale]==='string'&&
               record.names[locale].trim().length>0))),
            'CATALOG_CURRENT_EXACT_NAMES');
          rows.push({itemId:record.itemId,nativeCategory:category,
            names:record.names});
        }
      }
    }));
    rows.sort((a,b)=>a.itemId-b.itemId);
    check(rows.length===base.definitions,'CATALOG_FULL_SCAN_COUNT');
    for(let i=1;i<rows.length;i++)
      check(rows[i].itemId!==rows[i-1].itemId,'DUPLICATE_CANONICAL_ID');

    for(let offset=0;offset<rows.length;offset+=4096){
      const part=rows.slice(offset,offset+4096);
      const result=await shared.getItems(part.map(x=>x.itemId));
      check(result.length===part.length,'BATCH_LENGTH');
      for(let j=0;j<part.length;j++){
        const sourceRow=part[j],item=result[j] as Readonly<Db01SharedItem>|null;
        check(item&&item.itemId===sourceRow.itemId&&
          item.nativeCategory===sourceRow.nativeCategory,
          'SOURCE_ITEM_IDENTITY');
        defined++;
        const verifiedItemId=item.itemId;
        const matches=new Map<number,MutableLink>();
        function entry(setId:number,group:number):MutableLink{
          const menu=menus.get(setId);
          check(menu&&nonneg(group)&&group<menu.groupCount,
            'UNKNOWN_OR_INVALID_COLLECTION_GROUP');
          let record=matches.get(setId);
          if(!record){
            record={setId,groups:new Set(),directGroups:new Set(),
              predicateGroups:new Set(),predicates:0};
            matches.set(setId,record);
          }
          record.groups.add(group);
          perGroup.get(setId+':'+group)!.all.add(verifiedItemId);
          return record;
        }
        const direct=item.collection.direct;
        check(direct!==null,'DIRECT_ORIGINAL_MISSING');
        for(const ref of direct){
          const set=menus.get(ref.setId);
          check(set&&ref.submenu===set.submenu&&
            ref.submenuCode===set.submenuCode&&ref.setKey===set.setKey,
            'DIRECT_COLLECTION_SOURCE_MISMATCH');
          entry(ref.setId,ref.groupIndex).directGroups.add(ref.groupIndex);
          perGroup.get(ref.setId+':'+ref.groupIndex)!.direct.add(item.itemId);
        }
        for(const candidate of item.collection.candidates){
          const set=menus.get(candidate.collectionSetId);
          check(set&&candidate.sourceMenu?.setId===set.setId&&
            candidate.sourceMenu.submenuCode===set.submenuCode&&
            candidate.sourceMenu.setKey===set.setKey,
            'DYNAMIC_COLLECTION_SOURCE_MISMATCH');
          const group=entry(candidate.collectionSetId,candidate.groupIndex);
          group.predicates++;
          group.predicateGroups.add(candidate.groupIndex);
          perGroup.get(candidate.collectionSetId+':'+candidate.groupIndex)!
            .predicate.add(item.itemId);
        }
        // Suppressed original candidates NEVER authorize a source menu link,
        // although the shared view preserves the excluded source evidence.
        suppressed+=item.collection.suppressed.length;
        const links=[...matches.values()].map((v):Readonly<Db01SourceMenuLink>=>{
          const menu=menus.get(v.setId)!;
          const seen=perSet.get(v.setId)!;
          seen.all.add(item.itemId);
          perSubmenu.get(menu.submenuCode)!.add(item.itemId);
          if(v.directGroups.size)seen.direct.add(item.itemId);
          if(v.predicates)seen.dynamic.add(item.itemId);
          return Object.freeze({
            collectionSetId:v.setId,submenuCode:menu.submenuCode,
            submenu:menu.submenu,originalSetKey:menu.setKey,
            collectionLabelKey:menu.collectionLabelKey,
            groupIndexes:Object.freeze([...v.groups].sort((a,b)=>a-b)),
            directGroupIndexes:Object.freeze([...v.directGroups].sort((a,b)=>a-b)),
            predicateGroupIndexes:Object.freeze([...v.predicateGroups].sort((a,b)=>a-b)),
            directOriginalListing:v.directGroups.size>0,
            sourcePredicateMatches:v.predicates,
            evidence:Object.freeze([
              ...(v.directGroups.size?['original_explicit_item_list' as const]:[]),
              ...(v.predicates?['original_static_collection_predicate' as const]:[]),
            ]),
            gameRuntimeMembershipVerified:false as const,
            worldAvailabilityVerified:false as const,
          });
        }).sort((a,b)=>a.collectionSetId-b.collectionSetId);
        if(links.some(v=>v.directOriginalListing))directUnique++;
        if(links.some(v=>v.sourcePredicateMatches>0))dynamicUnique++;
        byId.set(item.itemId,{nativeCategory:item.nativeCategory,
          // The current catalog already verified the original locale shard.
          // Snapshot matched names so callers cannot mutate the search index.
          names:links.length?Object.freeze({...sourceRow.names}):null,
          links:Object.freeze(links)});
      }
    }
    check(defined===base.definitions,'INCOMPLETE_SOURCE_SCAN');
    const options=sourceMenus.map(menu=>{
      const group=perSet.get(menu.setId)!;
      check(group.direct.size===menu.directListedItemCount,
        'DIRECT_ORIGINAL_LISTING_CENSUS');
      return Object.freeze({
        sourceMenu:menu,distinctCandidateItemIds:group.all.size,
        directListedItemIds:group.direct.size,
        dynamicPredicateItemIds:group.dynamic.size,
        gameRuntimeMembershipVerified:false as const,
      });
    });
    const submenus=[...perSubmenu.entries()].map(([code,ids])=>
      Object.freeze({
        submenu:submenuNames.get(code)!,submenuCode:code,
        sourceSetCount:sourceMenus.filter(s=>s.submenuCode===code).length,
        distinctCandidateItemIds:ids.size,
        gameRuntimeMembershipVerified:false as const,
      })).sort((a,b)=>a.submenuCode-b.submenuCode);
    const groupOptions=new Map<number,readonly Readonly<Db01OriginalSourceGroupOption>[]>();
    for(const menu of sourceMenus){
      groupOptions.set(menu.setId,Object.freeze(Array.from(
        {length:menu.groupCount},(_,groupIndex)=>Object.freeze({
          collectionSetId:menu.setId,groupIndex,
          originalSetKey:menu.setKey,submenu:menu.submenu,
          distinctCandidateItemIds:perGroup.get(menu.setId+':'+groupIndex)!.all.size,
          directListedItemIds:perGroup.get(menu.setId+':'+groupIndex)!.direct.size,
          staticPredicateItemIds:perGroup.get(menu.setId+':'+groupIndex)!.predicate.size,
          gameRuntimeMembershipVerified:false as const,
        })
      )));
    }
    const matchedIds=[...byId].filter(([,item])=>item.links.length>0)
      .map(([itemId])=>itemId).sort((a,b)=>a-b);
    check(sourceMenus.length===options.length&&
      submenus.reduce((s,v)=>s+v.sourceSetCount,0)===sourceMenus.length,
      'MENU_COVERAGE');
    const coverage=Object.freeze({
      ...source,catalogDefinitions:defined,catalogCategories:categories.length,
      originalCollectionSetDefinitions:options.length,
      originalCollectionSubmenus:submenus.length,
      originalSourceGroups:perGroup.size,
      originalDynamicSelectorsInterpreted:prior.sourceDynamicSelectorsResolved,
      directListedItemIds:directUnique,
      sourceMatchedDistinctItemIds:matchedIds.length,
      staticPredicateDistinctItemIds:dynamicUnique,
      suppressedPredicateOccurrences:suppressed,
      completeCurrentSourceScan:true as const,
      gameRuntimeMembershipVerified:false as const,
      worldAvailabilityVerified:false as const,
      dlcOwnershipVerified:false as const,
    });
    check(coverage.directListedItemIds===prior.directListedIds,
      'DIRECT_ITEM_ID_COVERAGE');
    return {
      byId,
      setOptions:Object.freeze(options),submenuOptions:Object.freeze(submenus),
      groupOptions,
      sortedMatchedIds:Object.freeze(matchedIds),coverage,
    };
  }
  let promise:Promise<Index>|null=null;
  function index():Promise<Index>{
    if(!promise)promise=build().catch(e=>{promise=null;throw e;});
    return promise;
  }
  function verifiedQuery(query:Db01OriginalSourceMenuQuery){
    check(query!==null&&typeof query==='object'&&!Array.isArray(query),'QUERY');
    const locale=query.locale??'en';
    check(typeof locale==='string'&&
      (DB01_LOCALES as readonly string[]).includes(locale),
      'QUERY_LOCALE');
    const rawText=query.searchText??'';
    check(typeof rawText==='string'&&rawText.trim().length<=150&&
      ![...rawText].some(ch=>ch.charCodeAt(0)<32||ch.charCodeAt(0)===127),
      'QUERY_SEARCH_TEXT');
    const needle=rawText.trim().toLocaleLowerCase(locale);
    const sets=query.collectionSetIds??[];
    const subs=query.submenuCodes??[];
    const nativeCategories=query.nativeCategories??[];
    const sourceGroups=query.sourceGroups??[];
    const listingEvidence=query.listingEvidence??'any';
    check(listingEvidence==='any'||listingEvidence==='direct'||
      listingEvidence==='predicate','QUERY_EVIDENCE');
    check(Array.isArray(sets)&&sets.length<=305&&sets.every(id)&&
      Array.isArray(subs)&&subs.length<=64&&subs.every(nonneg)&&
      Array.isArray(nativeCategories)&&nativeCategories.length<=categories.length&&
      nativeCategories.every(c=>categories.includes(c))&&
      Array.isArray(sourceGroups)&&sourceGroups.length<=4096&&
      sourceGroups.every(g=>g!==null&&typeof g==='object'&&
        id(g.collectionSetId)&&nonneg(g.groupIndex)),
      'QUERY_DIMENSIONS');
    const offset=query.offset??0,limit=query.limit??100;
    check(nonneg(offset)&&offset<=1_000_000&&nonneg(limit)&&limit<=1000,
      'QUERY_PAGINATION');
    check(query.native===undefined||native!==undefined,
      'NATIVE_TAG_FACETS_NOT_CONNECTED');
    return {sets:new Set(sets),submenus:new Set(subs),
      groups:new Set(sourceGroups.map(g=>g.collectionSetId+':'+g.groupIndex)),
      listingEvidence,cats:new Set(nativeCategories),offset,limit,
      locale:locale as Db01Locale,needle};
  }
  async function search(
    raw:Db01OriginalSourceMenuQuery={},
  ):Promise<Readonly<Db01OriginalSourceMenuQueryResult>>{
    const q=verifiedQuery(raw);
    const i=await index();
    for(const setId of q.sets)
      check(i.setOptions.some(v=>v.sourceMenu.setId===setId),
        'UNKNOWN_COLLECTION_SET');
    for(const submenu of q.submenus)
      check(i.submenuOptions.some(v=>v.submenuCode===submenu),
        'UNKNOWN_SUBMENU');
    for(const group of q.groups)
      check([...i.groupOptions.values()].some(options=>
        options.some(v=>v.collectionSetId+':'+v.groupIndex===group)),
        'UNKNOWN_SOURCE_GROUP');
    let nativeIds:Set<number>|null=null;
    if(raw.native){
      nativeIds=new Set<number>();
      let skip=0;
      while(true){
        const page=await native!.search({...raw.native,offset:skip,limit:1000});
        for(const id of page.itemIds)nativeIds.add(id);
        skip+=page.itemIds.length;
        check(skip<=base.definitions,'INVALID_NATIVE_SOURCE_PAGINATION');
        if(!page.hasMore)break;
        check(page.itemIds.length===1000,'INVALID_NATIVE_PAGE_SIZE');
      }
    }
    let total=0;
    const selected:number[]=[];
    const selectedRows:Db01OriginalSourceMenuSearchItem[]=[];
    for(const id of i.sortedMatchedIds){
      const item=i.byId.get(id)!;
      if(q.cats.size&&!q.cats.has(item.nativeCategory))continue;
      if(nativeIds&&!nativeIds.has(id))continue;
      const linked=item.links.filter(l=>{
        const groups=q.listingEvidence==='direct'?l.directGroupIndexes:
          q.listingEvidence==='predicate'?l.predicateGroupIndexes:l.groupIndexes;
        return groups.length>0&&
          (!q.sets.size||q.sets.has(l.collectionSetId))&&
          (!q.submenus.size||q.submenus.has(l.submenuCode))&&
          (!q.groups.size||groups.some(g=>
            q.groups.has(l.collectionSetId+':'+g)));
      });
      if(!linked.length)continue;
      check(item.names!==null,'MATCHED_SOURCE_ITEM_NAMES_MISSING');
      const currentExactName=item.names[q.locale];
      if(q.needle&&!String(id).includes(q.needle)&&
        !(currentExactName!==null&&
          currentExactName.toLocaleLowerCase(q.locale).includes(q.needle)))
        continue;
      if(total>=q.offset&&selected.length<q.limit){
        selected.push(id);
        selectedRows.push(Object.freeze({
          itemId:id,nativeCategory:item.nativeCategory,
          locale:q.locale,currentExactName,
          currentExactNameVerified:currentExactName!==null,
          matchedSourceLinks:Object.freeze(linked),
          gameRuntimeMembershipVerified:false as const,
          worldAvailabilityVerified:false as const,
        }));
      }
      total++;
    }
    return Object.freeze({
      total,itemIds:Object.freeze(selected),items:Object.freeze(selectedRows),
      locale:q.locale,
      hasMore:total>q.offset+selected.length,
      sourceOnly:true as const,
      gameRuntimeMembershipVerified:false as const,
      worldAvailabilityVerified:false as const,
      dlcOwnershipVerified:false as const,
    });
  }
  async function getSourceGroups(collectionSetId:number){
    check(id(collectionSetId),'COLLECTION_SET_ID');
    const groups=(await index()).groupOptions.get(collectionSetId);
    check(groups,'UNKNOWN_COLLECTION_SET');
    return groups;
  }
  async function getItemLinks(itemId:number){
    check(id(itemId),'ITEM_ID');
    const data=(await index()).byId.get(itemId);
    return data?data.links:null;
  }
  return Object.freeze({
    schema:DB01_SOURCE_MENU_INDEX_SCHEMA,source,
    getCoverage:async()=>(await index()).coverage,
    getCollectionSets:async()=>(await index()).setOptions,
    getSubmenus:async()=>(await index()).submenuOptions,
    getSourceGroups,getItemLinks,search,
  });
}
