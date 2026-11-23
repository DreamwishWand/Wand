/**
 * DB-01 original ItemType/Tag facets joined to all published DB-00 native Items.
 *
 * Unlike CollectionSet candidates, this searches the COMPLETE 13,202-item
 * source-native category census. A source World/Universe Tag is NOT a proven
 * in-game CollectionArea, acquisition world, DLC entitlement or ownership.
 * No original assets are published or uploaded by this owner-local reader.
 */
import {DB01_LOCALES,type Db01Locale} from './index.ts';
import {
  DB01_NATIVE_FILTER_CONTRACT,DB01_NATIVE_ITEM_CLASSES,
  type Db01NativeFacetFilterClient,type Db01NativeFilterQuery,
  type Db01NativeClass,
} from './native-facet-filters.ts';
import {DB01_TAG_FACETS,type Db01TagFacet} from './classification.ts';
import type {PublicSharedGameSources} from '../game-db/public-sources.ts';
import type {Db00SourceJoinedItem} from '../game-db/source-join.ts';

export const DB01_PUBLISHED_NATIVE_FACETS=
  'wand.db01.published-native-facet-join@1' as const;
const CURRENT_VERSION='1.26.2';
const SNAPSHOT='steam-1.26.2-native-itemlist-v1';
const SHA=/^[a-f0-9]{64}$/;
const LANGUAGES=new Set<string>(DB01_LOCALES);
const CATEGORIES=new Set<string>(DB01_NATIVE_ITEM_CLASSES);
const FACETS=new Set<string>(DB01_TAG_FACETS);
const id=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const positivePage=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const object=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  (Object.getPrototypeOf(v)===Object.prototype||
    Object.getPrototypeOf(v)===null);
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB01_PUBLISHED_NATIVE_'+reason);
}
function normalized(v:string){return v.normalize('NFKC').toLocaleLowerCase().trim();}

export interface Db01PublishedNativeSelection{
  readonly locale:Db01Locale;
  /** Source-native category/subtype/Tag filters, NOT Collection UI filters. */
  readonly native:Omit<Db01NativeFilterQuery,'offset'|'limit'>;
  /** Exact published current-version names or numeric Item ID prefix. */
  readonly searchText?:string;
}
export interface Db01PublishedNativeRow{
  readonly itemId:number;
  readonly joined:Db00SourceJoinedItem;
  readonly locale:Db01Locale;
  readonly currentExactName:string|null;
  readonly originalNativeFacetMatched:true;
  readonly gameUiCollectionMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db01PublishedNativePage{
  readonly scope:'original_native_item_candidates';
  readonly items:readonly Db01PublishedNativeRow[];
  /** Count after public-only ID and exact published name intersection. */
  readonly totalPublishedMatches:number;
  /** Original native facet candidates, before published/name intersection. */
  readonly totalOriginalNativeMatches:number;
  readonly outsidePublishedItemCount:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly hasMore:boolean;
  readonly snapshotId:typeof SNAPSHOT;
  readonly locale:Db01Locale;
  readonly publicationAuthorized:false;
  readonly gameUiCollectionMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db01PublishedNativeFacetReader{
  readonly contract:typeof DB01_PUBLISHED_NATIVE_FACETS;
  readonly snapshotId:typeof SNAPSHOT;
  readonly publicationAuthorized:false;
  search(selection:Db01PublishedNativeSelection,
    page?:Readonly<{offset?:number;limit?:number}>):
    Promise<Db01PublishedNativePage>;
}

/** Copy and constrain caller-owned mutable filters before any asynchronous read. */
function safeNative(raw:unknown):Omit<Db01NativeFilterQuery,'offset'|'limit'>{
  check(object(raw)&&
    Object.keys(raw).every(x=>['nativeCategories','subtypes','facets'].includes(x)),
    'INVALID_NATIVE_QUERY');
  const categories=raw.nativeCategories;
  if(categories!==undefined)
    check(Array.isArray(categories)&&categories.length<=4&&
      categories.every(x=>typeof x==='string'&&CATEGORIES.has(x)),
      'INVALID_CATEGORIES');
  const subtypes=raw.subtypes;
  if(subtypes!==undefined)
    check(Array.isArray(subtypes)&&subtypes.length<=256&&
      subtypes.every(x=>object(x)&&
        Object.keys(x).every(k=>k==='nativeCategory'||k==='subtypeCode')&&
        typeof x.nativeCategory==='string'&&CATEGORIES.has(x.nativeCategory)&&
        positivePage(x.subtypeCode)),
      'INVALID_SUBTYPES');
  const facets=raw.facets;
  if(facets!==undefined){
    check(object(facets)&&Object.keys(facets).every(x=>FACETS.has(x)),
      'INVALID_FACETS');
    for(const values of Object.values(facets))
      check(Array.isArray(values)&&values.length<=256&&values.every(id),
        'INVALID_FACET_IDS');
  }
  check(categories!==undefined||subtypes!==undefined||
    (facets!==undefined&&Object.keys(facets).length>0),
    'NATIVE_FILTER_REQUIRED');
  const copiedFacets:Partial<Record<Db01TagFacet,readonly number[]>>={};
  if(facets!==undefined){
    for(const [key,values] of Object.entries(facets))
      copiedFacets[key as Db01TagFacet]=Object.freeze([...(values as number[])]);
  }
  const copy={
    ...(categories===undefined?{}:{nativeCategories:
      Object.freeze([...(categories as Db01NativeClass[])])}),
    ...(subtypes===undefined?{}:{subtypes:Object.freeze(
      (subtypes as {nativeCategory:Db01NativeClass;subtypeCode:number}[]).map(x=>
        Object.freeze({nativeCategory:x.nativeCategory,subtypeCode:x.subtypeCode})))}),
    ...(facets===undefined?{}:{facets:Object.freeze(copiedFacets)}),
  };
  return Object.freeze(copy);
}

export function joinDb01NativeFacetsWithPublishedDb00(
  native:Db01NativeFacetFilterClient,
  published:PublicSharedGameSources,
  /** Caller-owned independent SHA pin; do not reuse native.source as trust. */
  expectedOriginalItemsSha256:string,
):Db01PublishedNativeFacetReader{
  const origin=native?.source;
  check(native?.contract===DB01_NATIVE_FILTER_CONTRACT&&
    origin?.gameVersion===CURRENT_VERSION&&
    SHA.test(expectedOriginalItemsSha256)&&
    origin.sourceItemsSha256===expectedOriginalItemsSha256&&
    SHA.test(origin.sourceSqliteSha256)&&
    SHA.test(origin.sourceIl2cppDumpSha256)&&
    typeof native.search==='function'&&typeof native.getCoverage==='function'&&
    published?.schema==='wand.game-db.public-sources@1'&&
    published.snapshotId===SNAPSHOT&&
    published.database?.target.platform==='Steam'&&
    published.database.target.gameVersion===CURRENT_VERSION&&
    published.database.target.buildId===null&&
    published.database.itemCount===13202&&
    published.hasPrivateGameSource===false&&
    published.playerOwnershipVerified===false&&
    typeof published.getItems==='function',
    'CURRENT_PINNED_READERS_REQUIRED');

  type Census=Readonly<{
    rows:readonly Db01PublishedNativeRow[];
    originalTotal:number;
    outside:number;
  }>;
  let lastKey:string|null=null;
  let last:Promise<Census>|null=null;

  async function build(
    locale:Db01Locale,nativeFilter:Omit<Db01NativeFilterQuery,'offset'|'limit'>,
    needle:string,
  ):Promise<Census>{
    const coverage=await native.getCoverage();
    check(coverage.completeSourceNativeItemScan===true&&
      coverage.fullNativeDefinitions===13202&&
      coverage.gameVersion===CURRENT_VERSION&&
      coverage.sourceItemsSha256===expectedOriginalItemsSha256&&
      coverage.gameUiFilterVerified===false&&
      coverage.worldAvailabilityVerified===false,
      'INCOMPLETE_NATIVE_SOURCE_CENSUS');
    const rows:Db01PublishedNativeRow[]=[];
    let traversed=0,total:number|null=null,outside=0,previous=0;
    do{
      const next=await native.search({...nativeFilter,offset:traversed,limit:1000});
      check(next.originalNativeMatchesOnly===true&&
        next.gameUiFilterVerified===false&&
        next.worldAvailabilityVerified===false&&
        next.dlcEntitlementVerified===false&&
        positivePage(next.total)&&next.total<=coverage.fullNativeDefinitions&&
        (total===null||next.total===total)&&
        Array.isArray(next.itemIds)&&
        next.itemIds.length===Math.min(1000,next.total-traversed)&&
        next.hasMore===(traversed+next.itemIds.length<next.total),
        'NATIVE_PAGE_MISMATCH');
      total=next.total;
      const joined=published.getItems(next.itemIds);
      check(Array.isArray(joined)&&joined.length===next.itemIds.length,
        'PUBLIC_JOIN_LENGTH');
      for(let i=0;i<next.itemIds.length;i++){
        const itemId=next.itemIds[i],row=joined[i];
        check(id(itemId)&&itemId>previous&&row?.itemId===String(itemId)&&
          row.currentlyAvailableVerified===false&&
          row.playerOwnershipVerified===false&&
          ((row.catalog===null&&
            row.catalogStatus==='outside_published_item_scope')||
           (row.catalog!==null&&
            row.catalogStatus==='current_published_item'&&
            row.catalog.id===row.itemId)),
          'NATIVE_PUBLIC_ID_OR_STATE_CONFLICT');
        previous=itemId;
        if(row.catalog===null){outside++;continue;}
        const label=row.catalog.names[locale]??null;
        if(needle&& !String(itemId).startsWith(needle)&&
          !(label!==null&&normalized(label).includes(needle)))continue;
        rows.push(Object.freeze({
          itemId,joined:row,locale,currentExactName:label,
          originalNativeFacetMatched:true as const,
          gameUiCollectionMembershipVerified:false as const,
          worldAvailabilityVerified:false as const,
          dlcEntitlementVerified:false as const,
          playerOwnershipVerified:false as const,
        }));
      }
      traversed+=next.itemIds.length;
    }while(total!==null&&traversed<total);
    check(total!==null&&rows.length+outside<=total,'SOURCE_COVERAGE_MISMATCH');
    return Object.freeze({rows:Object.freeze(rows),originalTotal:total,outside});
  }

  async function search(selection:Db01PublishedNativeSelection,
    page:Readonly<{offset?:number;limit?:number}>={}):
    Promise<Db01PublishedNativePage>{
    check(object(selection)&&
      Object.keys(selection).every(k=>
        ['locale','native','searchText'].includes(k))&&
      typeof selection.locale==='string'&&LANGUAGES.has(selection.locale),
      'INVALID_SELECTION');
    check(object(page)&&positivePage(page.offset??0)&&
      (page.offset??0)<=1_000_000&&positivePage(page.limit??72)&&
      (page.limit??72)>=1&&(page.limit??72)<=500,
      'INVALID_PAGE');
    const filter=safeNative(selection.native);
    check(selection.searchText===undefined||
      typeof selection.searchText==='string'&&
      selection.searchText.trim().length<=150&&
      ![...selection.searchText].some(ch=>
        ch.charCodeAt(0)<32||ch.charCodeAt(0)===127),
      'INVALID_SEARCH_TEXT');
    const locale=selection.locale as Db01Locale;
    const needle=normalized(selection.searchText??'');
    const key=JSON.stringify({locale,native:filter,needle});
    check(key.length<=32768,'QUERY_TOO_LARGE');
    if(lastKey!==key||!last){
      const task=build(locale,filter,needle).catch(error=>{
        if(lastKey===key){lastKey=null;last=null;}
        throw error;
      });
      lastKey=key;last=task;
    }
    const census=await last;
    const offset=page.offset??0,limit=page.limit??72;
    const items=Object.freeze(census.rows.slice(offset,offset+limit));
    const nextOffset=offset+items.length;
    return Object.freeze({
      scope:'original_native_item_candidates' as const,
      items,totalPublishedMatches:census.rows.length,
      totalOriginalNativeMatches:census.originalTotal,
      outsidePublishedItemCount:census.outside,
      offset,nextOffset:nextOffset<census.rows.length?nextOffset:null,
      hasMore:nextOffset<census.rows.length,snapshotId:SNAPSHOT,locale,
      publicationAuthorized:false as const,
      gameUiCollectionMembershipVerified:false as const,
      worldAvailabilityVerified:false as const,
      dlcEntitlementVerified:false as const,
      playerOwnershipVerified:false as const,
    });
  }
  return Object.freeze({
    contract:DB01_PUBLISHED_NATIVE_FACETS,snapshotId:SNAPSHOT,
    publicationAuthorized:false as const,search,
  });
}
