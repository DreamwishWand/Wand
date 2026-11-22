/**
 * DB-01 private Collection source matches + DB-00 current PUBLISHED Item-ID
 * reader. Read-only, browser-local composition: NEVER publish this joined data.
 *
 * The source index may include definitions outside the 13,202 public native
 * Item records. Their names, ID and source references are NOT returned as
 * public Collection items. An original source Set/category is not verified
 * game-screen membership, and DB-02/03 evidence never implies ownership.
 *
 * Reuses the current DB-01 source index and the DB-00/02/03 shared join:
 * no source rescans, duplicate classification engines or new JS runtime.
 */
import {DB01_LOCALES,type Db01Locale} from './index.ts';
import {
  DB01_SOURCE_MENU_INDEX_SCHEMA,
  type Db01OriginalSourceMenuQueryClient,
  type Db01OriginalSourceMenuQuery,
  type Db01OriginalSourceMenuSearchItem,
} from './collection-source-index.ts';
import {
  DB00_SOURCE_JOIN_CONTRACT,
  type Db00SourceJoinedReader,type Db00SourceJoinedItem,
} from '../game-db/source-join.ts';

export const DB01_DB00_COLLECTION_RESULTS_CONTRACT=
  'wand.db01.db00-current-collection-source-results@1' as const;
const CURRENT_GAME_VERSION='1.26.2';
const CURRENT_PUBLIC_SNAPSHOT='steam-1.26.2-native-itemlist-v1';
const SHA=/^[0-9a-f]{64}$/;
const LOCALES=new Set<string>(DB01_LOCALES);
const validId=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
function requireValue(value:unknown,why:string):asserts value {
  if(!value)throw new TypeError('DB01_DB00_COLLECTION_RESULTS_'+why);
}
export type Db01Db00OriginalSourceSearchQuery=
  Omit<Db01OriginalSourceMenuQuery,'offset'|'limit'>;
export interface Db01Db00CollectionResultItem {
  readonly itemId:number;
  readonly currentExactName:string|null;
  readonly currentExactNameVerified:boolean;
  readonly locale:Db01Locale;
  /** Same canonical current Item ID in DB-00's published subset. */
  readonly joined:Db00SourceJoinedItem;
  /** DB-01 native CollectionSet associations, not actual UI membership. */
  readonly originalSource:Db01OriginalSourceMenuSearchItem;
  /** Whether the two independent current readers have identical locale names. */
  readonly currentNameAgreement:'identical'|'source_missing'|'published_missing'|'different';
  readonly originalCategoryIsGameUiVerified:false;
  readonly acquisitionWorldVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db01Db00CollectionResultsPage {
  readonly items:readonly Db01Db00CollectionResultItem[];
  readonly totalPublishedMatches:number;
  readonly totalOriginalSourceCandidates:number;
  /** Source-matched definition IDs not covered by the current public DB-00 release.
   * These are NOT silently projected as published items.
   */
  readonly unpublishedSourceDefinitionCount:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly hasMore:boolean;
  readonly snapshotId:typeof CURRENT_PUBLIC_SNAPSHOT;
  readonly locale:Db01Locale;
  readonly privateSourceJoin:true;
  readonly publicationAuthorized:false;
  readonly originalCategoryIsGameUiVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01Db00CollectionResultsReader {
  readonly contract:typeof DB01_DB00_COLLECTION_RESULTS_CONTRACT;
  readonly target:Readonly<{
    platform:'Steam';gameVersion:typeof CURRENT_GAME_VERSION;
    snapshotId:typeof CURRENT_PUBLIC_SNAPSHOT;
    privateSourceSha256:string;
    publicationAuthorized:false;
  }>;
  search(query?:Db01Db00OriginalSourceSearchQuery,
    page?:Readonly<{offset?:number;limit?:number}>):
    Promise<Db01Db00CollectionResultsPage>;
}

export function joinDb01OriginalCollectionWithPublishedDb00(
  source:Db01OriginalSourceMenuQueryClient,
  publicJoined:Db00SourceJoinedReader,
  /** Caller-owned independent SHA pin: never copy it from source.source. */
  expectedOriginalSourceItemsSha256:string,
):Db01Db00CollectionResultsReader {
  requireValue(source?.schema===DB01_SOURCE_MENU_INDEX_SCHEMA&&
    source.source.gameVersion===CURRENT_GAME_VERSION&&
    SHA.test(expectedOriginalSourceItemsSha256)&&
    source.source.sourceItemsSha256===expectedOriginalSourceItemsSha256&&
    typeof source.search==='function'&&
    publicJoined?.contract===DB00_SOURCE_JOIN_CONTRACT&&
    publicJoined.snapshotId===CURRENT_PUBLIC_SNAPSHOT&&
    typeof publicJoined.getItems==='function',
    'PINNED_CURRENT_PRIVATE_AND_PUBLISHED_READERS_REQUIRED');
  const target=Object.freeze({
    platform:'Steam' as const,gameVersion:CURRENT_GAME_VERSION,
    snapshotId:CURRENT_PUBLIC_SNAPSHOT,
    privateSourceSha256:source.source.sourceItemsSha256,
    publicationAuthorized:false as const,
  });
  type Census=Readonly<{
    rows:readonly Db01Db00CollectionResultItem[];
    totalOriginal:number;
    unpublished:number;
  }>;
  // The browser can ask for another page on every scroll. A single complete
  // source intersection is reused while the exact selection is unchanged.
  // Keep only the latest selection to bound RAM and never cache a failed scan.
  let cachedKey:string|null=null;
  let cachedCensus:Promise<Census>|null=null;

  /** Canonical, bounded data-only query snapshot. Never retain caller-owned
   * mutable filter arrays while an asynchronous source scan is in flight.
   * Reject functions, NaN, cyclic structures and prototype-bearing objects
   * rather than allowing distinct queries to collide under JSON.stringify.
   */
  function canonicalize(value:unknown,depth=0):unknown{
    requireValue(depth<=8,'QUERY_DEPTH');
    if(value===null||typeof value==='string'||typeof value==='boolean')
      return value;
    if(typeof value==='number'){
      requireValue(Number.isSafeInteger(value),'NON_JSON_QUERY_NUMBER');
      return value;
    }
    if(Array.isArray(value)){
      requireValue(value.length<=4096,'QUERY_ARRAY_TOO_LARGE');
      return value.map(entry=>{
        requireValue(entry!==undefined,'UNDEFINED_ARRAY_FILTER');
        return canonicalize(entry,depth+1);
      });
    }
    requireValue(typeof value==='object' &&
      (Object.getPrototypeOf(value)===Object.prototype ||
        Object.getPrototypeOf(value)===null),
      'NON_JSON_QUERY_FIELD');
    const objectValue=value as Record<string,unknown>;
    const keys=Object.keys(objectValue).sort();
    requireValue(keys.length<=128,'QUERY_TOO_MANY_FIELDS');
    const result:Record<string,unknown>={};
    for(const key of keys){
      requireValue(key!=='__proto__'&&key!=='constructor'&&key!=='prototype',
        'UNTRUSTED_QUERY_PROPERTY');
      if(objectValue[key]!==undefined)
        result[key]=canonicalize(objectValue[key],depth+1);
    }
    return result;
  }

  async function buildCensus(
    query:Db01Db00OriginalSourceSearchQuery,
    locale:Db01Locale,
  ):Promise<Census>{
    const collected:Db01Db00CollectionResultItem[]=[];
    let totalOriginal:number|null=null;
    let traversed=0,unpublished=0,previousId=0;
    // A complete count requires examining every original source candidate,
    // not just the first original-source page: public DB-00 covers a subset.
    // DB-01 owns its source index; DB-00 owns its public Item ID index.
    do {
      const sourcePage=await source.search({...query,locale,offset:traversed,limit:1000});
      requireValue(sourcePage.sourceOnly===true&&
        sourcePage.gameRuntimeMembershipVerified===false&&
        sourcePage.worldAvailabilityVerified===false&&
        sourcePage.dlcOwnershipVerified===false&&
        sourcePage.locale===locale&&
        Number.isSafeInteger(sourcePage.total)&&sourcePage.total>=0&&
        sourcePage.total<=1_000_000&&
        (totalOriginal===null||sourcePage.total===totalOriginal)&&
        Array.isArray(sourcePage.items)&&Array.isArray(sourcePage.itemIds)&&
        sourcePage.items.length===sourcePage.itemIds.length&&
        sourcePage.items.length<=1000&&
        sourcePage.items.length===Math.min(1000,sourcePage.total-traversed)&&
        sourcePage.hasMore===(
          traversed+sourcePage.items.length<sourcePage.total),
        'ORIGINAL_SOURCE_PAGE_CORRUPTED');
      totalOriginal=sourcePage.total;
      const joined=publicJoined.getItems(sourcePage.itemIds);
      requireValue(Array.isArray(joined)&&joined.length===sourcePage.items.length,
        'PUBLISHED_ID_BATCH_COUNT');
      for(let k=0;k<sourcePage.items.length;k++){
        const original=sourcePage.items[k],row=joined[k];
        requireValue(validId(original.itemId)&&original.itemId>previousId&&
          sourcePage.itemIds[k]===original.itemId&&
          original.locale===locale&&
          original.gameRuntimeMembershipVerified===false&&
          original.worldAvailabilityVerified===false&&
          original.currentExactNameVerified===(original.currentExactName!==null)&&
          Array.isArray(original.matchedSourceLinks)&&
          original.matchedSourceLinks.length>0&&
          original.matchedSourceLinks.every((link:Db01OriginalSourceMenuSearchItem['matchedSourceLinks'][number])=>
            link.gameRuntimeMembershipVerified===false&&
            link.worldAvailabilityVerified===false)&&
          row?.itemId===String(original.itemId)&&
          ((row.catalog===null&&
            row.catalogStatus==='outside_published_item_scope')||
           (row.catalog!==null&&
            row.catalogStatus==='current_published_item'))&&
          row.currentlyAvailableVerified===false&&
          row.playerOwnershipVerified===false,
          'ORIGINAL_PUBLISHED_ID_OR_EVIDENCE_CONFLICT');
        previousId=original.itemId;
        if(row.catalog===null){
          unpublished++;
          continue;
        }
        requireValue(row.catalog.id===row.itemId&&
          (row.catalog.nativeCategory===null||
            row.catalog.nativeCategory===original.nativeCategory),
          'PUBLISHED_NATIVE_ITEM_IDENTITY_MISMATCH');
        const publicName=row.catalog.names[locale]??null;
        const exactName=original.currentExactName;
        const agreement:Db01Db00CollectionResultItem['currentNameAgreement']=
          exactName===null?'source_missing':
          publicName===null?'published_missing':
          publicName===exactName?'identical':'different';
        collected.push(Object.freeze({
          itemId:original.itemId,currentExactName:exactName,
          currentExactNameVerified:original.currentExactNameVerified,
          locale,joined:row,originalSource:original,
          currentNameAgreement:agreement,
          originalCategoryIsGameUiVerified:false as const,
          acquisitionWorldVerified:false as const,
          playerOwnershipVerified:false as const,
        }));
      }
      traversed+=sourcePage.items.length;
    }while(totalOriginal!==null&&traversed<totalOriginal);
    requireValue(totalOriginal!==null&&
      collected.length+unpublished===totalOriginal,
      'ORIGINAL_PUBLISHED_COVERAGE_MISMATCH');
    return Object.freeze({
      rows:Object.freeze(collected),
      totalOriginal,
      unpublished,
    });
  }
  function census(query:Db01Db00OriginalSourceSearchQuery,
    locale:Db01Locale):Promise<Census>{
    const snapshot=canonicalize({...query,locale}) as Db01Db00OriginalSourceSearchQuery;
    const key=JSON.stringify(snapshot);
    requireValue(key.length<=32768,'QUERY_TOO_LARGE');
    if(cachedKey===key&&cachedCensus)return cachedCensus;
    const task=buildCensus(snapshot,locale).catch(error=>{
      if(cachedKey===key){
        cachedKey=null;
        cachedCensus=null;
      }
      throw error;
    });
    cachedKey=key;
    cachedCensus=task;
    return task;
  }

  async function search(
    query:Db01Db00OriginalSourceSearchQuery={},
    page:Readonly<{offset?:number;limit?:number}>={},
  ):Promise<Db01Db00CollectionResultsPage>{
    requireValue(query!==null&&typeof query==='object'&&!Array.isArray(query)&&
      !Object.hasOwn(query,'offset')&&!Object.hasOwn(query,'limit'),
      'INVALID_SOURCE_QUERY_PAGINATION');
    requireValue(page!==null&&typeof page==='object'&&!Array.isArray(page),
      'INVALID_PAGE');
    const offset=page.offset??0,limit=page.limit??72;
    requireValue(Number.isSafeInteger(offset)&&offset>=0&&offset<=1_000_000&&
      Number.isSafeInteger(limit)&&limit>=1&&limit<=500,
      'INVALID_PAGE_RANGE');
    const locale=query.locale===undefined?'en':query.locale;
    requireValue(typeof locale==='string'&&LOCALES.has(locale),
      'UNSUPPORTED_SOURCE_LOCALE');
    const result=await census(query,locale as Db01Locale);
    const items=Object.freeze(result.rows.slice(offset,offset+limit));
    const nextOffset=offset+items.length;
    return Object.freeze({
      items,
      totalPublishedMatches:result.rows.length,
      totalOriginalSourceCandidates:result.totalOriginal,
      unpublishedSourceDefinitionCount:result.unpublished,
      offset,nextOffset:nextOffset<result.rows.length?nextOffset:null,
      hasMore:nextOffset<result.rows.length,snapshotId:CURRENT_PUBLIC_SNAPSHOT,
      locale,privateSourceJoin:true as const,
      publicationAuthorized:false as const,
      originalCategoryIsGameUiVerified:false as const,
      worldAvailabilityVerified:false as const,
      dlcEntitlementVerified:false as const,
    });
  }
  return Object.freeze({
    contract:DB01_DB00_COLLECTION_RESULTS_CONTRACT,
    target,search,
  });
}
