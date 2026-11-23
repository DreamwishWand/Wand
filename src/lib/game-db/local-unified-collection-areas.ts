/**
 * DB-00 owner-local cross-service browse of the original Steam v1.26.2
 * 9,221 Furniture / Clothing / Trimming / Makeup positive CollectionArea
 * source tags.
 *
 * DB-01 owns both private SHA-pinned source readers and the merge-sorted
 * 9,221-ID query. This adapter never duplicates their tag interpretation
 * or changes public ItemList membership. No private file is fetched here.
 *
 * A source-positive Tag is NOT proof of Collection screen membership,
 * area unlock, DLC purchase or Save/player ownership. Native AllAreas
 * default evaluation remains unknown; area code 0 means unfiltered source.
 */
import {canonicalId} from './model.ts';
import type {Db00SourceJoinedItem} from './source-join.ts';
import type {
  Db00OriginalCollectionArea
} from './collection-area-sources.ts';
import type {PublicSharedGameSources} from './public-sources.ts';
import {
  DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_TOTAL,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_MATCHED,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_UNRESOLVED,
  type Db01UnifiedPositiveAreaClient,
  type Db01UnifiedPositiveAreaItem,
  type Db01UnifiedPositiveAreaCoverage,
  type Db01NativePositiveAreaCategory,
  type Db01NativePositiveAreaCode
} from '../items/native-positive-area-unified.ts';

export const DB00_LOCAL_UNIFIED_COLLECTION_AREAS=
  'wand.game-db.local-unified-collection-area-candidates@1' as const;
type Code=Db01NativePositiveAreaCode|0;
const CODES=Object.freeze([1,2,3,4,5,4097] as const);
const CLASSES=Object.freeze(['Furniture','Clothing','Trimming','Makeup'] as const);
const MAX_PAGE=120;
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB00_UNIFIED_COLLECTION_AREAS_'+reason);
}
export interface Db00LocalUnifiedCollectionAreaItem {
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  readonly original:Readonly<Db01UnifiedPositiveAreaItem>;
  readonly nativeCategory:Db01NativePositiveAreaCategory;
  /** Original seven-config reference; six source-positive areas only. */
  readonly positiveAreaSources:readonly Db00OriginalCollectionArea[];
  readonly firstProvenPositiveAreaCode:Db01NativePositiveAreaCode|null;
  /** A zero-match item is UNRESOLVED, not assigned to the base valley. */
  readonly positiveAreaUnresolved:boolean;
  readonly sourceNativeHasTagVerified:true;
  readonly nativeAllAreasDefaultPredicateVerified:false;
  readonly actualCollectionUiMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db00LocalUnifiedCollectionAreaCoverage{
  readonly snapshotId:string;
  readonly original:Readonly<Db01UnifiedPositiveAreaCoverage>;
  readonly sourceDefinitions:9221;
  readonly sourcePositiveMatches:8709;
  readonly unresolvedPositiveAreaItems:512;
  readonly originalCategories:Readonly<Record<Db01NativePositiveAreaCategory,number>>;
  readonly positiveSourceAreaCounts:Readonly<Record<Db01NativePositiveAreaCode,number>>;
  readonly sourceHasTagVerified:true;
  readonly nativeAllAreasDefaultPredicateVerified:false;
  readonly actualCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00LocalUnifiedCollectionAreaQuery {
  /** Empty array means no categories; omitted means all four. */
  readonly nativeCategories?:readonly Db01NativePositiveAreaCategory[];
  /** [0] is unfiltered source rows, not native default AllAreas predicate. */
  readonly areaCodes?:readonly Code[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00LocalUnifiedCollectionAreaPage{
  readonly snapshotId:string;
  readonly nativeCategories:readonly Db01NativePositiveAreaCategory[];
  readonly areaCodes:readonly Code[];
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00LocalUnifiedCollectionAreaItem[];
  readonly sourcePositiveNativeHasTagOnly:true;
  readonly allAreasMeansUnfilteredOriginalSource:boolean;
  readonly nativeAllAreasDefaultPredicateVerified:false;
  readonly actualCollectionUiMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db00LocalUnifiedCollectionAreaReader{
  readonly contract:typeof DB00_LOCAL_UNIFIED_COLLECTION_AREAS;
  readonly snapshotId:string;
  readonly gameVersion:'1.26.2';
  readonly sourceDefinitions:9221;
  readonly sourcePositiveMatches:8709;
  readonly unresolvedPositiveAreaItems:512;
  readonly ownerLocalOnly:true;
  readonly publicationAuthorized:false;
  readonly actualCollectionUiMembershipVerified:false;
  getCoverage():Promise<Db00LocalUnifiedCollectionAreaCoverage>;
  getItem(itemId:string|number):
    Promise<Db00LocalUnifiedCollectionAreaItem|null>;
  search(query?:Db00LocalUnifiedCollectionAreaQuery):
    Promise<Db00LocalUnifiedCollectionAreaPage>;
}

/**
 * Requires caller-supplied DB-01 source client (which authenticates private
 * shards). Do not expose the native reader or original source bytes in JSON.
 * The public catalogue and original area configs come from DB-00.
 */
export function joinDb00LocalUnifiedCollectionAreas(
  publicData:PublicSharedGameSources,
  source:Db01UnifiedPositiveAreaClient
):Db00LocalUnifiedCollectionAreaReader{
  const db=publicData?.database;
  const areas=publicData?.originalCollectionAreas;
  check(publicData?.schema==='wand.game-db.public-sources@1' &&
    publicData.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    db?.contract==='wand.game-db.shared@1' &&
    db.itemCount===13202&&db.target.platform==='Steam'&&
    db.target.gameVersion==='1.26.2' &&
    publicData.hasPrivateGameSource===false &&
    publicData.playerOwnershipVerified===false &&
    typeof publicData.getItem==='function' &&
    areas?.contract==='wand.game-db.original-collection-area-reference@1' &&
    areas.platform==='Steam'&&areas.gameVersion==='1.26.2' &&
    areas.sourceConfigCount===7&&areas.orderedAreas.length===7&&
    areas.gameUiItemMembershipVerified===false &&
    source?.schema===DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA &&
    source.gameVersion==='1.26.2' &&
    typeof source.getCoverage==='function'&&
    typeof source.getItem==='function'&&
    typeof source.search==='function',
    'CURRENT_DB00_AND_DB01_LOCAL_SOURCE_REQUIRED');
  const positives=areas.orderedAreas.filter(
    row=>row.original.gameplayTagId>0
  );
  check(positives.length===6 &&
    positives.every((row,i)=>row.areaCode===CODES[i] &&
      row.originalConfigVerified===true &&
      row.sourceTagCandidateOnly===true &&
      row.gameUiItemMembershipVerified===false &&
      row.original.gameplayTagId>0) &&
    areas.orderedAreas[6].areaCode===0 &&
    areas.orderedAreas[6].original.gameplayTagId===0,
    'ORIGINAL_COLLECTION_AREA_CONFIG_ORDER');
  const byCode=new Map<number,Db00OriginalCollectionArea>(
    positives.map(row=>[row.areaCode,row])
  );
  check(byCode.size===6,'DUPLICATE_ORIGINAL_SOURCE_AREA');

  let coverageTask:Promise<Db00LocalUnifiedCollectionAreaCoverage>|null=null;
  function getCoverage():Promise<Db00LocalUnifiedCollectionAreaCoverage>{
    if(coverageTask)return coverageTask;
    coverageTask=(async()=>{
      const original=await source.getCoverage();
      const counts=original?.positiveAreaByCode;
      const category=original?.originalNativeCategoryCounts;
      check(original?.gameVersion==='1.26.2'&&
        original.sourceDefinitionCount===DB01_NATIVE_POSITIVE_AREA_SOURCE_TOTAL&&
        original.positiveAreaItems===DB01_NATIVE_POSITIVE_AREA_SOURCE_MATCHED&&
        original.unresolvedPositiveAreaItems===
          DB01_NATIVE_POSITIVE_AREA_SOURCE_UNRESOLVED&&
        original.verifiedOriginalNativeHasTagSource===true&&
        original.gameCollectionUiMembershipVerified===false&&
        original.allAreasNativeDefaultPredicateVerified===false&&
        original.dlcEntitlementVerified===false&&
        category!==null&&typeof category==='object'&&
        CLASSES.every(c=>
          category[c]===DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS[c])&&
        counts!==null&&typeof counts==='object'&&
        CODES.every(c=>
          counts[c]===DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS[c])&&
        CODES.reduce((sum,c)=>sum+counts[c],0)===8709&&
        CLASSES.reduce((sum,c)=>sum+category[c],0)===9221,
        'ORIGINAL_UNIFIED_NATIVE_AREA_CENSUS');
      return Object.freeze({
        snapshotId:publicData.snapshotId,original,
        sourceDefinitions:9221 as const,
        sourcePositiveMatches:8709 as const,
        unresolvedPositiveAreaItems:512 as const,
        originalCategories:DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS,
        positiveSourceAreaCounts:DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS,
        sourceHasTagVerified:true as const,
        nativeAllAreasDefaultPredicateVerified:false as const,
        actualCollectionUiMembershipVerified:false as const,
        playerOwnershipVerified:false as const
      });
    })().catch(error=>{coverageTask=null;throw error;});
    return coverageTask;
  }
  function joinOne(
    id:string,
    original:Readonly<Db01UnifiedPositiveAreaItem>|null
  ):Db00LocalUnifiedCollectionAreaItem|null{
    if(original===null)return null;
    check(original.itemId===Number(id) &&
      CLASSES.includes(original.originalNativeCategory) &&
      typeof original.originalNativeClass==='string'&&
      original.originalNativeClass.length>0&&
      original.sourceOriginalIHasTagsAndSetSemanticsVerified===true &&
      original.allAreasNativeDefaultPredicateVerified===false &&
      original.gameCollectionUiMembershipVerified===false &&
      original.worldAvailabilityVerified===false &&
      original.dlcEntitlementVerified===false &&
      original.playerOwnershipVerified===false &&
      Array.isArray(original.positiveAreaCodes)&&
      original.positiveAreaCodes.length<=1&&
      original.positiveAreaCodes.every(code=>byCode.has(code)) &&
      original.firstProvenPositiveAreaCode===
        (original.positiveAreaCodes[0]??null),
      'ORIGINAL_SOURCE_ITEM_AND_AREA_MISMATCH');
    const shared=publicData.getItem(id);
    check(shared.itemId===id&&
      shared.currentlyAvailableVerified===false &&
      shared.playerOwnershipVerified===false,
      'SHARED_ITEM_ID_OR_PLAYER_STATUS_MISMATCH');
    return Object.freeze({
      itemId:id,shared,original,
      nativeCategory:original.originalNativeCategory,
      positiveAreaSources:Object.freeze(
        original.positiveAreaCodes.map(code=>byCode.get(code)!)
      ),
      firstProvenPositiveAreaCode:original.firstProvenPositiveAreaCode,
      positiveAreaUnresolved:original.positiveAreaCodes.length===0,
      sourceNativeHasTagVerified:true as const,
      nativeAllAreasDefaultPredicateVerified:false as const,
      actualCollectionUiMembershipVerified:false as const,
      worldAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const
    });
  }
  async function getItem(raw:string|number):
    Promise<Db00LocalUnifiedCollectionAreaItem|null>{
    const id=canonicalId(raw);
    return joinOne(id,await source.getItem(Number(id)));
  }
  function validateQuery(raw:Db00LocalUnifiedCollectionAreaQuery){
    check(raw!==null&&typeof raw==='object'&&!Array.isArray(raw),
      'INVALID_QUERY');
    const nativeCategories=raw.nativeCategories??CLASSES;
    const areaCodes=raw.areaCodes??[0];
    check(Array.isArray(nativeCategories)&&nativeCategories.length<=4 &&
      nativeCategories.every(c=>CLASSES.includes(c)) &&
      new Set(nativeCategories).size===nativeCategories.length,
      'INVALID_CATEGORY_SELECTION');
    check(Array.isArray(areaCodes)&&areaCodes.length>=1&&
      areaCodes.length<=6&&
      areaCodes.every(code=>code===0||byCode.has(code))&&
      new Set(areaCodes).size===areaCodes.length&&
      (!areaCodes.includes(0)||areaCodes.length===1),
      'INVALID_OR_AMBIGUOUS_AREA_CODES');
    const offset=raw.offset??0,limit=raw.limit??80;
    check(Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=MAX_PAGE,
      'INVALID_PAGE');
    return {nativeCategories,areaCodes,offset,limit};
  }
  async function search(query:Db00LocalUnifiedCollectionAreaQuery={}):
    Promise<Db00LocalUnifiedCollectionAreaPage>{
    const q=validateQuery(query);
    const coverage=await getCoverage();
    const sourcePage=await source.search(q);
    const all=q.areaCodes.length===1&&q.areaCodes[0]===0;
    check(Number.isSafeInteger(sourcePage?.total)&&
      sourcePage.total>=0&&
      sourcePage.total<=coverage.sourceDefinitions &&
      Array.isArray(sourcePage.itemIds)&&
      sourcePage.itemIds.length<=q.limit&&
      sourcePage.itemIds.length<=Math.max(0,sourcePage.total-q.offset)&&
      (sourcePage.total<=q.offset||sourcePage.itemIds.length>0)&&
      sourcePage.itemIds.every((id,i)=>
        Number.isSafeInteger(id)&&id>0 &&
        (i===0||id>sourcePage.itemIds[i-1]))&&
      sourcePage.hasMore===(sourcePage.total>q.offset+sourcePage.itemIds.length)&&
      sourcePage.sourcePositiveNativeHasTagOnly===true&&
      sourcePage.allAreasMeansUnfilteredOriginalSource===all&&
      sourcePage.gameCollectionUiMembershipVerified===false&&
      sourcePage.allAreasNativeDefaultPredicateVerified===false&&
      sourcePage.worldAvailabilityVerified===false&&
      sourcePage.playerOwnershipVerified===false&&
      sourcePage.dlcEntitlementVerified===false&&
      (q.nativeCategories.length!==0||sourcePage.total===0) &&
      (!all||q.nativeCategories.length!==4||sourcePage.total===9221),
      'SOURCE_UNIFIED_PAGE_CONTRACT_MISMATCH');
    // Bounded, concurrently authenticated original source queries: no
    // fabricated Item membership from numeric ID ranges or area defaults.
    const rows=await Promise.all(sourcePage.itemIds.map(id=>
      source.getItem(id)
    ));
    const allowedCategories=new Set<string>(q.nativeCategories);
    const items=Object.freeze(rows.map((row,i)=>{
      const item=joinOne(String(sourcePage.itemIds[i]),row);
      check(item!==null&&
        allowedCategories.has(item.nativeCategory)&&
        (all||item.positiveAreaSources.some(area=>
          q.areaCodes.includes(area.areaCode))),
        'UNIFIED_ITEM_FILTER_OR_ID_MISMATCH');
      return item;
    }));
    const next=q.offset+items.length;
    return Object.freeze({
      snapshotId:publicData.snapshotId,
      nativeCategories:Object.freeze([...q.nativeCategories]),
      areaCodes:Object.freeze([...q.areaCodes]),
      total:sourcePage.total,offset:q.offset,
      nextOffset:next<sourcePage.total?next:null,items,
      sourcePositiveNativeHasTagOnly:true as const,
      allAreasMeansUnfilteredOriginalSource:all,
      nativeAllAreasDefaultPredicateVerified:false as const,
      actualCollectionUiMembershipVerified:false as const,
      worldAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_LOCAL_UNIFIED_COLLECTION_AREAS,
    snapshotId:publicData.snapshotId,
    gameVersion:'1.26.2' as const,
    sourceDefinitions:9221 as const,
    sourcePositiveMatches:8709 as const,
    unresolvedPositiveAreaItems:512 as const,
    ownerLocalOnly:true as const,
    publicationAuthorized:false as const,
    actualCollectionUiMembershipVerified:false as const,
    getCoverage,getItem,search
  });
}
