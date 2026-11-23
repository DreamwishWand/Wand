/**
 * Version-pinned ORIGINAL positive CollectionArea predicates for Furniture.
 *
 * The same-version GameAssembly.dll CollectionsUIConfig.GetAreaConfigs
 * (0x70D01C0) uses IHasTags.HasTag for non-Critter items. Original
 * ItemDataExtensions.HasTag (0x41088E0) searches direct IHasTags.Tags and
 * inherited IHasSet.SetItemData.Tags. The original seven serialized
 * CollectionAreaConfigs have six positive GameplayTagIDs and a final
 * AllAreas config with GameplayTagID=0.
 *
 * For Furniture (all seven native subtypes implement IHasTags), the six
 * positive areas can therefore be evaluated from the exact source Tag/Set
 * index. AllAreas uses a native static default Item when ID=0, and its
 * HasTag result has NOT yet been independently recovered. Do not replace
 * that unknown with false. Any positive match precedes AllAreas in the
 * original serialized array, so first positive match and GetAreaTags are
 * determinable even though the final config is unresolved.
 *
 * This API does NOT reconstruct CollectionGroup filtering, Collection
 * screen visibility, entitlement, ownership, or final game UI membership.
 * It uses a caller-supplied SHA-verified PRIVATE source client; no original
 * files or item lists are bundled with production TypeScript.
 */
import {
  DB01_COLLECTION_AREA_SOURCE_CONFIGS,
  type Db01OriginalCollectionAreaSourceConfig,
} from './collection-area-source-config.ts';
import {
  DB01_VERIFIED_FURNITURE_TAG_BRIDGE,
  type Db01VerifiedFurnitureTagClient,
} from './furniture-tag-bridge.ts';

export const DB01_FURNITURE_NATIVE_AREA_PREDICATES=
  'wand.db01.furniture-collection-positive-areas-steam-1262@1' as const;

export type Db01SourcePositiveCollectionAreaCode=1|2|3|4|5|4097;
export interface Db01FurniturePositiveAreaMatch{
  readonly areaCode:Db01SourcePositiveCollectionAreaCode;
  readonly originalAreaName:string;
  readonly gameplayTagId:number;
  readonly matchingSource:'original_native_has_tag';
  readonly gameUiMembershipVerified:false;
}
export interface Db01FurnitureOriginalPositiveAreas{
  readonly itemId:number;
  readonly originalNativeFurnitureClass:string;
  /** All six positive native CollectionAreaConfig entries, in their
   * exact original Unity serialized order. Does NOT include code=0.
   */
  readonly matches:readonly Readonly<Db01FurniturePositiveAreaMatch>[];
  readonly matchedPositiveAreaCodes:
    readonly Db01SourcePositiveCollectionAreaCode[];
  /** Original GetAreaTags FIRST area is certain when non-null because
   * AllAreas occurs after all six positive configurations.
   */
  readonly firstProvenAreaCode:Db01SourcePositiveCollectionAreaCode|null;
  /** null means it is unresolved, NOT native DreamlightValley by default.
   * The runtime can select area=0 or the DreamlightValley fallback.
   */
  readonly firstSelectedAreaGameplayTagId:number|null;
  readonly positiveNativeHasTagPredicatesVerified:true;
  readonly originalAllAreasDefaultHasTagEvaluated:false;
  readonly originalAreaConfigsFullSequenceVerified:false;
  readonly actualCollectionUiMembershipVerified:false;
  readonly gameWorldAvailabilityVerified:false;
  readonly playerEntitlementVerified:false;
}
export interface Db01FurniturePositiveAreaSearch{
  /** Original CollectionArea enum positive codes. 0 means AllAreas:
   * no filter, not that the original IHasTags default matched.
   * Mixing 0 with other codes is forbidden.
   */
  readonly areaCodes:readonly (Db01SourcePositiveCollectionAreaCode|0)[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db01FurniturePositiveAreaSearchResult{
  readonly areaCodes:readonly (Db01SourcePositiveCollectionAreaCode|0)[];
  readonly itemIds:readonly number[];
  readonly total:number;
  readonly hasMore:boolean;
  readonly originalPositiveAreaNativeSourceOnly:true;
  readonly allAreasMeansUnfilteredSourceItems:boolean;
  readonly areaDefaultNativePredicateEvaluated:false;
  readonly actualCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01FurniturePositiveAreaCoverage{
  readonly gameVersion:'1.26.2';
  readonly originalFurnitureCount:6746;
  /** Original source items with at least one positive native area tag. */
  readonly anyPositiveAreaTagItems:number;
  /** Unknown for AllAreas/native fallback, NOT DreamlightValley. */
  readonly withoutPositiveAreaTagItems:number;
  /** Multi-area items are counted in every matching positive area. */
  readonly sourceItemsByPositiveArea:Readonly<Record<number,number>>;
  readonly originalStaticAreaConfigVerified:true;
  readonly originalPositiveHasTagPredicatesVerified:true;
  readonly allAreasNativeDefaultTagVerified:false;
  readonly nativeGameUiAreaMembershipVerified:false;
}
export interface Db01FurniturePositiveAreaSourceClient{
  readonly contract:typeof DB01_FURNITURE_NATIVE_AREA_PREDICATES;
  readonly gameVersion:'1.26.2';
  getItem(id:number):Promise<Readonly<Db01FurnitureOriginalPositiveAreas>|null>;
  getCoverage():Promise<Readonly<Db01FurniturePositiveAreaCoverage>>;
  search(selection:Db01FurniturePositiveAreaSearch):
    Promise<Readonly<Db01FurniturePositiveAreaSearchResult>>;
}

/** Recounted from the original 6,746-frame Furniture.json, 727-frame
 * Set.json and 409-frame Tag.json, with all seven original protobuf class
 * layouts and native IHasSet semantics. Six native positive area codes are
 * pairwise disjoint for Steam 1.26.2 Furniture source records.
 */
export const DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS=Object.freeze({
  1:4315,2:434,3:422,4:431,5:478,4097:223,
} as const);
export const DB01_FURNITURE_ORIGINAL_UNASSIGNED_POSITIVE_AREA_COUNT=443 as const;

const positiveConfigs=Object.freeze(
  DB01_COLLECTION_AREA_SOURCE_CONFIGS.filter(c=>c.gameplayTagId>0));
const areaConfigByCode=new Map<number,Db01OriginalCollectionAreaSourceConfig>(
  positiveConfigs.map(c=>[c.areaCode,c] as const));
const nativeCode=(v:unknown):v is Db01SourcePositiveCollectionAreaCode=>
  typeof v==='number'&&areaConfigByCode.has(v);
const positiveId=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nonnegative=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function check(value:unknown,why:string):asserts value{
  if(!value)throw new TypeError('DB01_FURNITURE_POSITIVE_AREA_'+why);
}
check(positiveConfigs.length===6&&
  DB01_COLLECTION_AREA_SOURCE_CONFIGS.length===7&&
  DB01_COLLECTION_AREA_SOURCE_CONFIGS[6].areaCode===0&&
  DB01_COLLECTION_AREA_SOURCE_CONFIGS[6].gameplayTagId===0&&
  areaConfigByCode.size===6&&
  positiveConfigs.every(c=>c.villageItemId>0&&c.gameplayTagId>0),
  'PINNED_ORIGINAL_AREA_CONFIG_ORDER');

function checkedSelection(
  query:Db01FurniturePositiveAreaSearch,
):Readonly<{
  codes:readonly (Db01SourcePositiveCollectionAreaCode|0)[];
  offset:number;
  limit:number;
}>{
  check(query!==null&&typeof query==='object'&&!Array.isArray(query)&&
    Array.isArray(query.areaCodes)&&query.areaCodes.length>=1&&
    query.areaCodes.length<=6&&
    query.areaCodes.every(c=>c===0||nativeCode(c))&&
    new Set(query.areaCodes).size===query.areaCodes.length&&
    (!query.areaCodes.includes(0)||query.areaCodes.length===1),
    'INVALID_OR_AMBIGUOUS_ORIGINAL_AREA_CODES');
  const offset=query.offset??0,limit=query.limit??100;
  check(nonnegative(offset)&&offset<=1_000_000&&
    nonnegative(limit)&&limit<=1000,'INVALID_PAGING');
  return Object.freeze({codes:Object.freeze([...query.areaCodes]),
    offset,limit});
}

export function createDb01FurniturePositiveAreaSourceClient(
  furniture:Db01VerifiedFurnitureTagClient,
):Db01FurniturePositiveAreaSourceClient{
  check(furniture?.contract===DB01_VERIFIED_FURNITURE_TAG_BRIDGE&&
    typeof furniture.getItem==='function'&&
    typeof furniture.getCoverage==='function'&&
    typeof furniture.search==='function',
    'PINNED_NATIVE_FURNITURE_BRIDGE_REQUIRED');

  async function getItem(id:number):
    Promise<Readonly<Db01FurnitureOriginalPositiveAreas>|null>{
    check(positiveId(id),'INVALID_FURNITURE_ITEM_ID');
    const source=await furniture.getItem(id);
    if(source===null)return null;
    check(source.itemId===id&&
      source.originalFurnitureSourceVerified===true&&
      source.nativeHasTagSemanticsVerified===true&&
      source.collectionUiMembershipVerified===false&&
      source.worldAvailabilityVerified===false&&
      source.dlcEntitlementVerified===false,
      'SOURCE_NATIVE_HAS_TAG_EVIDENCE_REQUIRED');
    const originalMatches=new Set(source.nativeHasTagIds);
    const matched=positiveConfigs
      .filter(c=>originalMatches.has(c.gameplayTagId))
      .map(c=>Object.freeze({
        areaCode:c.areaCode as Db01SourcePositiveCollectionAreaCode,
        originalAreaName:c.enumName,
        gameplayTagId:c.gameplayTagId,
        matchingSource:'original_native_has_tag' as const,
        gameUiMembershipVerified:false as const,
      }));
    const first=matched[0]??null;
    return Object.freeze({
      itemId:id,originalNativeFurnitureClass:source.originalNativeClass,
      matches:Object.freeze(matched),
      matchedPositiveAreaCodes:Object.freeze(matched.map(c=>c.areaCode)),
      firstProvenAreaCode:first?.areaCode??null,
      firstSelectedAreaGameplayTagId:first?.gameplayTagId??null,
      positiveNativeHasTagPredicatesVerified:true,
      originalAllAreasDefaultHasTagEvaluated:false,
      originalAreaConfigsFullSequenceVerified:false,
      actualCollectionUiMembershipVerified:false,
      gameWorldAvailabilityVerified:false,
      playerEntitlementVerified:false,
    });
  }

  let coverageTask:Promise<Readonly<Db01FurniturePositiveAreaCoverage>>|null=null;
  async function coverage():Promise<Readonly<Db01FurniturePositiveAreaCoverage>>{
    if(coverageTask)return coverageTask;
    coverageTask=(async()=>{
      const base=await furniture.getCoverage();
      check(base.gameVersion==='1.26.2'&&
        base.sourceFurnitureItems===6746&&
        base.nativeHasTagSourceCompletelyIndexed===true&&
        base.gameCollectionAreaMembershipVerified===false,
        'INCOMPLETE_PRIVATE_FURNITURE_SOURCE');
      const areas=await Promise.all(positiveConfigs.map(c=>
        furniture.search({tagIds:[c.gameplayTagId],limit:0})));
      check(areas.every(x=>
        x.originalNativeHasTagSourceOnly===true&&
        x.gameCollectionAreaMembershipVerified===false&&
        nonnegative(x.total)&&x.total<=6746),
        'UNVERIFIED_POSITIVE_AREA_TAG_SEARCH');
      const all=await furniture.search({
        tagIds:positiveConfigs.map(c=>c.gameplayTagId),
        tagMatch:'any',limit:0,
      });
      check(all.originalNativeHasTagSourceOnly===true&&
        all.gameCollectionAreaMembershipVerified===false&&
        all.total===6303&&
        areas.reduce((sum,x)=>sum+x.total,0)===all.total&&
        positiveConfigs.every((c,i)=>
          areas[i].total===
            DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS[
              c.areaCode as Db01SourcePositiveCollectionAreaCode])&&
        6746-all.total===
          DB01_FURNITURE_ORIGINAL_UNASSIGNED_POSITIVE_AREA_COUNT,
        'ORIGINAL_SOURCE_POSITIVE_AREA_CENSUS_DRIFT');
      return Object.freeze({
        gameVersion:'1.26.2',
        originalFurnitureCount:6746,
        anyPositiveAreaTagItems:all.total,
        withoutPositiveAreaTagItems:6746-all.total,
        sourceItemsByPositiveArea:Object.freeze(Object.fromEntries(
          positiveConfigs.map((c,i)=>[c.areaCode,areas[i].total]))),
        originalStaticAreaConfigVerified:true,
        originalPositiveHasTagPredicatesVerified:true,
        allAreasNativeDefaultTagVerified:false,
        nativeGameUiAreaMembershipVerified:false,
      });
    })().catch(error=>{coverageTask=null;throw error;});
    return coverageTask;
  }
  async function search(
    query:Db01FurniturePositiveAreaSearch,
  ):Promise<Readonly<Db01FurniturePositiveAreaSearchResult>>{
    const q=checkedSelection(query);
    const all=q.codes.length===1&&q.codes[0]===0;
    const ids=all?[]:q.codes.map(c=>areaConfigByCode.get(c)!.gameplayTagId);
    const result=await furniture.search({
      tagIds:ids,tagMatch:'any',offset:q.offset,limit:q.limit,
    });
    check(result.originalNativeHasTagSourceOnly===true&&
      result.gameCollectionAreaMembershipVerified===false&&
      result.playerOwnershipVerified===false&&
      result.dlcEntitlementVerified===false,
      'UNVERIFIED_SOURCE_SEARCH');
    return Object.freeze({
      areaCodes:q.codes,
      itemIds:result.itemIds,
      total:result.total,
      hasMore:result.hasMore,
      originalPositiveAreaNativeSourceOnly:true,
      allAreasMeansUnfilteredSourceItems:all,
      areaDefaultNativePredicateEvaluated:false,
      actualCollectionUiMembershipVerified:false,
      playerOwnershipVerified:false,
      dlcEntitlementVerified:false,
    });
  }
  return Object.freeze({
    contract:DB01_FURNITURE_NATIVE_AREA_PREDICATES,
    gameVersion:'1.26.2',getItem,getCoverage:coverage,search,
  });
}
