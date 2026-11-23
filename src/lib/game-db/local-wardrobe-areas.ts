/**
 * DB-00 owner-local, source-native CollectionArea candidates for original
 * Clothing, Trimming and Makeup (Steam v1.26.2).
 *
 * DB-01 owns 256-shard SHA verification of the 2,475 original IHasTags /
 * IHasSet source definitions. This adapter only joins source-positive areas
 * to DB-00 public Item ID/names, preserving exact Tag vs Set inheritance.
 *
 * These are NOT game Collection UI memberships, purchases, DLC entitlements,
 * current area unlocks or Save ownership. Area code 0 is unfiltered browse,
 * never an inferred native AllAreas match.
 */
import {canonicalId} from './model.ts';
import type {Db00SourceJoinedItem} from './source-join.ts';
import type {Db00OriginalCollectionArea}
  from './collection-area-sources.ts';
import type {PublicSharedGameSources} from './public-sources.ts';
import {
  DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA,
  DB01_WARDROBE_CATEGORY_SPECS,
  DB01_WARDROBE_POSITIVE_AREA_CENSUS,
  DB01_WARDROBE_TAG_SHA256,
  type Db01WardrobeOriginalClient,type Db01WardrobeOriginalItem,
  type Db01WardrobeOriginalCoverage,type Db01WardrobeOriginalCategory,
  type Db01WardrobePositiveAreaCode
} from '../items/wardrobe-native-has-tag.ts';
import {
  evaluateOriginalNativeHasTag,
  type Db01OriginalHasTagResult
} from '../items/native-has-tag.ts';

export const DB00_LOCAL_WARDROBE_AREAS=
  'wand.game-db.local-original-wardrobe-area-tags@1' as const;
type AreaCode=Db01WardrobePositiveAreaCode|0;
const CODE=Object.freeze([1,2,3,4,5,4097] as const);
const CATEGORIES=Object.freeze(['Clothing','Trimming','Makeup'] as const);
const ID_BATCH_MAX=200;
function check(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('DB00_WARDROBE_AREA_'+code);
}
export interface Db00WardrobePositiveAreaMatch{
  readonly area:Db00OriginalCollectionArea;
  readonly sourceHasTag:Readonly<Db01OriginalHasTagResult>;
  readonly sourceMatchBranch:'item_tags'|'set_item_tags';
  readonly positiveNativeMatchVerified:true;
  readonly nativeGameUiMembershipVerified:false;
}
export interface Db00LocalWardrobeItem{
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  readonly original:Readonly<Db01WardrobeOriginalItem>;
  readonly nativeCategory:Db01WardrobeOriginalCategory;
  readonly positiveSourceAreaMatches:readonly Db00WardrobePositiveAreaMatch[];
  readonly firstProvenPositiveAreaCode:Db01WardrobePositiveAreaCode|null;
  readonly originalHasTagsAndIHasSetVerified:true;
  readonly nativeAllAreasDefaultEvaluated:false;
  readonly actualCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly currentAvailabilityVerified:false;
}
export interface Db00WardrobeAreaQuery{
  /** [0] means all original wardrobe definitions, not native AllAreas. */
  readonly areaCodes?:readonly AreaCode[];
  readonly nativeCategories?:readonly Db01WardrobeOriginalCategory[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00WardrobeAreaPage{
  readonly snapshotId:string;
  readonly areaCodes:readonly AreaCode[];
  readonly nativeCategories:readonly Db01WardrobeOriginalCategory[];
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00LocalWardrobeItem[];
  readonly originalTagMatchesOnly:true;
  readonly nativeAllAreasDefaultEvaluated:false;
  readonly actualCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db00WardrobeAreaCoverage {
  readonly snapshotId:string;
  readonly source:Readonly<Db01WardrobeOriginalCoverage>;
  readonly originalWardrobeDefinitions:2475;
  readonly clothing:2041;
  readonly trimming:365;
  readonly makeup:69;
  readonly withPositiveNativeArea:2406;
  readonly withoutPositiveNativeArea:69;
  readonly countsByArea:Readonly<Record<Db01WardrobePositiveAreaCode,number>>;
  readonly originalTagMatchingVerified:true;
  readonly nativeAllAreasDefaultEvaluated:false;
  readonly actualCollectionUiMembershipVerified:false;
}
export interface Db00LocalWardrobeAreaReader{
  readonly contract:typeof DB00_LOCAL_WARDROBE_AREAS;
  readonly snapshotId:string;
  readonly ownerLocalOnly:true;
  readonly publicationAuthorized:false;
  readonly originalWardrobeDefinitions:2475;
  readonly originalNativePositiveAreas:6;
  readonly nativeCollectionUiMembershipVerified:false;
  getCoverage():Promise<Db00WardrobeAreaCoverage>;
  getItem(itemId:string|number):Promise<Db00LocalWardrobeItem|null>;
  getItems(itemIds:readonly (string|number)[]):
    Promise<readonly (Db00LocalWardrobeItem|null)[]>;
  search(query?:Db00WardrobeAreaQuery):Promise<Db00WardrobeAreaPage>;
}
export function joinDb00LocalWardrobeCollectionAreas(
  publicData:PublicSharedGameSources,
  wardrobe:Db01WardrobeOriginalClient
):Db00LocalWardrobeAreaReader {
  const db=publicData?.database;
  const areas=publicData?.originalCollectionAreas;
  check(publicData?.schema==='wand.game-db.public-sources@1' &&
    publicData.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    db?.contract==='wand.game-db.shared@1' &&
    db.itemCount===13202&&db.target.platform==='Steam' &&
    db.target.gameVersion==='1.26.2' &&
    publicData.hasPrivateGameSource===false &&
    publicData.playerOwnershipVerified===false &&
    typeof publicData.getItem==='function' &&
    areas?.contract==='wand.game-db.original-collection-area-reference@1' &&
    areas.originalTagSha256===DB01_WARDROBE_TAG_SHA256 &&
    areas.sourceConfigCount===7&&
    areas.orderedAreas.length===7 &&
    areas.gameUiItemMembershipVerified===false,
    'VERIFIED_PUBLIC_ITEM_AND_AREA_SOURCE_REQUIRED');
  check(wardrobe?.schema===DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA &&
    wardrobe.gameVersion==='1.26.2' &&
    typeof wardrobe.getItem==='function' &&
    typeof wardrobe.getItems==='function' &&
    typeof wardrobe.getCoverage==='function' &&
    typeof wardrobe.search==='function' &&
    typeof wardrobe.hasTag==='function',
    'PINNED_PRIVATE_WARDROBE_SOURCE_REQUIRED');

  const positives=areas.orderedAreas.filter(a=>a.original.gameplayTagId>0);
  const byCode=new Map<number,Db00OriginalCollectionArea>(
    positives.map(row=>[row.areaCode,row])
  );
  check(positives.length===6&&
    positives.every((row,index)=>row.areaCode===CODE[index]&&
      row.original.gameplayTagId>0&&
      row.originalConfigVerified===true&&
      row.sourceTagCandidateOnly===true&&
      row.gameUiItemMembershipVerified===false) &&
    areas.orderedAreas[6].areaCode===0 &&
    areas.orderedAreas[6].original.gameplayTagId===0 &&
    byCode.size===6,
    'SOURCE_POSITIVE_AREA_CONFIG_SEQUENCE_MISMATCH');

  let coverageTask:Promise<Db00WardrobeAreaCoverage>|null=null;
  function getCoverage():Promise<Db00WardrobeAreaCoverage>{
    if(coverageTask)return coverageTask;
    coverageTask=(async()=>{
      const source=await wardrobe.getCoverage();
      const counts=source?.positiveAreaByCode;
      const family=source?.originalCategoryCounts;
      check(source?.sourceDefinitionCount===2475&&
        source.sourceResolvedSetItemReferences===2405&&
        source.sourceWithoutSetReference===70&&
        source.positiveAreaItems===2406 &&
        source.sourceUnassignedPositiveAreaItems===69&&
        family?.Clothing===DB01_WARDROBE_CATEGORY_SPECS.Clothing.count&&
        family?.Trimming===DB01_WARDROBE_CATEGORY_SPECS.Trimming.count&&
        family?.Makeup===DB01_WARDROBE_CATEGORY_SPECS.Makeup.count&&
        counts!==null&&typeof counts==='object'&&
        CODE.every(code=>
          counts[code]===DB01_WARDROBE_POSITIVE_AREA_CENSUS[code]) &&
        CODE.reduce((sum,code)=>sum+counts[code],0)===2406 &&
        source.sourceVerifiedPositiveAreaPredicates===true &&
        source.originalAllAreasDefaultHasTagEvaluated===false &&
        source.runtimeCollectionUiMembershipVerified===false,
        'ORIGINAL_WARDROBE_AREA_CENSUS_DRIFT');
      return Object.freeze({
        snapshotId:publicData.snapshotId,source,
        originalWardrobeDefinitions:2475 as const,
        clothing:2041 as const,
        trimming:365 as const,
        makeup:69 as const,
        withPositiveNativeArea:2406 as const,
        withoutPositiveNativeArea:69 as const,
        countsByArea:Object.freeze(Object.fromEntries(
          CODE.map(code=>[code,counts[code]])
        )) as Readonly<Record<Db01WardrobePositiveAreaCode,number>>,
        originalTagMatchingVerified:true as const,
        nativeAllAreasDefaultEvaluated:false as const,
        actualCollectionUiMembershipVerified:false as const
      });
    })().catch(err=>{coverageTask=null;throw err;});
    return coverageTask;
  }
  function verifyRow(
    itemId:string,
    original:Readonly<Db01WardrobeOriginalItem>|null
  ):Db00LocalWardrobeItem|null{
    if(!original)return null;
    const row=original.original,input=original.input;
    const sourceSpec=DB01_WARDROBE_CATEGORY_SPECS[row.nativeCategory];
    check(sourceSpec!==undefined&&
      row.itemId===Number(itemId)&&input.itemId===Number(itemId)&&
      input.gameVersion==='1.26.2'&&
      row.originalNativeClass===sourceSpec.originalNativeClass&&
      row.tagsFieldNumber===sourceSpec.tagsFieldNumber &&
      input.nativeTags===row.nativeTags &&
      input.setLookup===row.setLookup &&
      row.setLookup.kind==='has_set' &&
      row.nativeHasTagSchemaVerified===true &&
      row.gameUiCollectionMembershipVerified===false &&
      row.dlcEntitlementVerified===false &&
      original.sourceShardHashVerified===true &&
      original.gameUiCollectionMembershipVerified===false &&
      original.worldAvailabilityVerified===false &&
      original.dlcEntitlementVerified===false &&
      Array.isArray(original.positiveAreaCodes)&&
      original.positiveAreaCodes.length<=1,
      'WRONG_ORIGINAL_WARDROBE_ITEM_CLASS_OR_STATE');
    const matches:Db00WardrobePositiveAreaMatch[]=[];
    for(const area of positives){
      const native=evaluateOriginalNativeHasTag(
        input,area.original.gameplayTagId
      );
      check(native.itemId===Number(itemId)&&
        native.requestedTagId===area.original.gameplayTagId&&
        native.nativeHasTagAlgorithmVerified===true&&
        native.gameCollectionAreaMembershipVerified===false&&
        native.dlcEntitlementVerified===false,
        'ORIGINAL_SOURCE_HAS_TAG_INVALID');
      if(native.matches){
        check(native.matchingSource==='item_tags'||
          native.matchingSource==='set_item_tags',
          'UNKNOWN_ORIGINAL_SOURCE_TAG_MATCH');
        matches.push(Object.freeze({
          area,sourceHasTag:native,
          sourceMatchBranch:native.matchingSource,
          positiveNativeMatchVerified:true as const,
          nativeGameUiMembershipVerified:false as const
        }));
      }
    }
    check(matches.length===original.positiveAreaCodes.length &&
      matches.every((m,i)=>m.area.areaCode===original.positiveAreaCodes[i]),
      'ORIGINAL_AREA_SOURCE_TAG_MISMATCH');
    const shared=publicData.getItem(itemId);
    check(shared.itemId===itemId&&
      shared.currentlyAvailableVerified===false&&
      shared.playerOwnershipVerified===false,
      'SHARED_ITEM_ID_OR_PLAYER_STATE_MISMATCH');
    return Object.freeze({
      itemId,shared,original,
      nativeCategory:row.nativeCategory,
      positiveSourceAreaMatches:Object.freeze(matches),
      firstProvenPositiveAreaCode:
        (matches[0]?.area.areaCode??null) as Db01WardrobePositiveAreaCode|null,
      originalHasTagsAndIHasSetVerified:true as const,
      nativeAllAreasDefaultEvaluated:false as const,
      actualCollectionUiMembershipVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const,
      currentAvailabilityVerified:false as const
    });
  }
  async function getItems(ids:readonly (string|number)[]):
    Promise<readonly (Db00LocalWardrobeItem|null)[]>{
    check(Array.isArray(ids)&&ids.length<=ID_BATCH_MAX,
      'INVALID_BATCH');
    const itemIds=ids.map(canonicalId);
    const native=await wardrobe.getItems(itemIds.map(Number));
    check(native.length===itemIds.length,'NATIVE_ITEM_BATCH_MISMATCH');
    return Object.freeze(itemIds.map((id,index)=>verifyRow(id,native[index])));
  }
  async function getItem(raw:string|number):
    Promise<Db00LocalWardrobeItem|null>{
    const itemId=canonicalId(raw);
    return verifyRow(itemId,await wardrobe.getItem(Number(itemId)));
  }
  async function search(query:Db00WardrobeAreaQuery={}):
    Promise<Db00WardrobeAreaPage>{
    check(query!==null&&typeof query==='object'&&!Array.isArray(query),
      'INVALID_REQUEST');
    const areaCodes=query.areaCodes??[0];
    const nativeCategories=query.nativeCategories??CATEGORIES;
    check(Array.isArray(areaCodes)&&areaCodes.length>0&&
      areaCodes.length<=6&&
      areaCodes.every(code=>code===0||byCode.has(code))&&
      new Set(areaCodes).size===areaCodes.length &&
      (!areaCodes.includes(0)||areaCodes.length===1),
      'INVALID_AREA_CODES');
    check(Array.isArray(nativeCategories)&&nativeCategories.length<=3&&
      nativeCategories.every(name=>CATEGORIES.includes(name))&&
      new Set(nativeCategories).size===nativeCategories.length,
      'INVALID_NATIVE_CATEGORIES');
    const offset=query.offset??0,limit=query.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0 &&
      Number.isSafeInteger(limit)&&limit>0&&limit<=ID_BATCH_MAX,
      'INVALID_PAGE');
    const coverage=await getCoverage();
    const result=await wardrobe.search({areaCodes,nativeCategories,offset,limit});
    const all=areaCodes.length===1&&areaCodes[0]===0;
    check(result.sourceNativeHasTagMatchesOnly===true&&
      result.actualCollectionUiMembershipVerified===false &&
      result.allAreasDefaultNativePredicateEvaluated===false &&
      result.playerEntitlementVerified===false&&
      Number.isSafeInteger(result.total)&&
      result.total>=0&&result.total<=coverage.originalWardrobeDefinitions&&
      (nativeCategories.length===3&&all?
        result.total===2475:true) &&
      Array.isArray(result.itemIds)&&
      result.itemIds.length<=limit &&
      (result.total<=offset||result.itemIds.length>0) &&
      result.itemIds.length<=Math.max(0,result.total-offset)&&
      result.itemIds.every(id=>Number.isSafeInteger(id)&&id>0)&&
      result.itemIds.every((id,i)=>i===0||result.itemIds[i-1]<id)&&
      result.hasMore===(result.total>offset+result.itemIds.length),
      'ORIGINAL_WARDROBE_PAGE_MISMATCH');
    const rows=await getItems(result.itemIds);
    const allowed=new Set<string>(nativeCategories);
    const items=Object.freeze(rows.map(row=>{
      check(row!==null&&allowed.has(row.nativeCategory)&&
        (all||row.positiveSourceAreaMatches.some(m=>
          areaCodes.includes(m.area.areaCode))) &&
        row.actualCollectionUiMembershipVerified===false,
        'ORIGINAL_WARDROBE_PAGE_ITEM_MISMATCH');
      return row;
    }));
    const next=offset+items.length;
    return Object.freeze({
      snapshotId:publicData.snapshotId,
      areaCodes:Object.freeze([...areaCodes]),
      nativeCategories:Object.freeze([...nativeCategories]),
      total:result.total,offset,
      nextOffset:next<result.total?next:null,
      items,originalTagMatchesOnly:true as const,
      nativeAllAreasDefaultEvaluated:false as const,
      actualCollectionUiMembershipVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_LOCAL_WARDROBE_AREAS,
    snapshotId:publicData.snapshotId,
    ownerLocalOnly:true as const,
    publicationAuthorized:false as const,
    originalWardrobeDefinitions:2475 as const,
    originalNativePositiveAreas:6 as const,
    nativeCollectionUiMembershipVerified:false as const,
    getCoverage,getItem,getItems,search
  });
}
