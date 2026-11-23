/**
 * DB-00 owner-local CollectionArea candidate search for 6,746 original
 * Steam 1.26.2 Furniture items.
 *
 * Uses DB-01's verified original native HasTag/Set predicates and original
 * source-positive area query. Never changes DB-00's public ItemList, fetches
 * private data from a public origin, or claims Collection screen membership.
 */
import {canonicalId} from './model.ts';
import type {Db00SourceJoinedItem} from './source-join.ts';
import type {
  Db00LocalFurnitureAreaReader,Db00LocalFurnitureItemAreaEvidence
} from './local-furniture-areas.ts';
import {
  DB01_FURNITURE_NATIVE_AREA_PREDICATES,
  DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS,
  DB01_FURNITURE_ORIGINAL_UNASSIGNED_POSITIVE_AREA_COUNT,
  type Db01FurniturePositiveAreaSourceClient,
  type Db01FurniturePositiveAreaCoverage,
  type Db01FurnitureOriginalPositiveAreas,
  type Db01SourcePositiveCollectionAreaCode,
} from '../items/furniture-positive-areas.ts';

export const DB00_LOCAL_FURNITURE_AREA_FACETS=
  'wand.game-db.local-furniture-positive-area-facets@1' as const;
type AreaCode=Db01SourcePositiveCollectionAreaCode|0;
const POSITIVE=Object.freeze([1,2,3,4,5,4097] as const);
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB00_LOCAL_FURNITURE_FACET_'+reason);
}
export interface Db00LocalFurnitureAreaFacetItem {
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  readonly original:Db00LocalFurnitureItemAreaEvidence;
  readonly positiveAreas:Db01FurnitureOriginalPositiveAreas;
  /** First source-positive area is known; final Collection UI area is not. */
  readonly firstProvenAreaCode:Db01SourcePositiveCollectionAreaCode|null;
  readonly sourcePositiveOnly:true;
  readonly gameUiCollectionMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db00LocalFurnitureAreaFacetPage{
  readonly snapshotId:string;
  /** [0] = all original Furniture, NOT original native AllAreas predicate. */
  readonly areaCodes:readonly AreaCode[];
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00LocalFurnitureAreaFacetItem[];
  readonly originalPositiveAreaNativeSourceOnly:true;
  readonly allAreasMeansUnfilteredSourceItems:boolean;
  readonly areaDefaultNativePredicateEvaluated:false;
  readonly actualCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db00LocalFurnitureAreaFacetCoverage {
  readonly snapshotId:string;
  readonly source:Readonly<Db01FurniturePositiveAreaCoverage>;
  readonly sourceFurnitureDefinitions:6746;
  readonly positiveSourceMatches:6303;
  readonly noPositiveSourceTagItems:443;
  readonly areaCounts:Readonly<Record<Db01SourcePositiveCollectionAreaCode,number>>;
  readonly sourceNativeHasTagVerified:true;
  readonly nativeAllAreasDefaultVerified:false;
  readonly nativeCollectionUiMembershipVerified:false;
}
export interface Db00LocalFurnitureAreaFacetRequest{
  readonly areaCodes:readonly AreaCode[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00LocalFurnitureAreaFacetReader{
  readonly contract:typeof DB00_LOCAL_FURNITURE_AREA_FACETS;
  readonly snapshotId:string;
  readonly gameVersion:'1.26.2';
  readonly ownerLocalOnly:true;
  readonly publicationAuthorized:false;
  readonly nativeCollectionUiMembershipVerified:false;
  getCoverage():Promise<Db00LocalFurnitureAreaFacetCoverage>;
  getItem(itemId:string|number):Promise<Db00LocalFurnitureAreaFacetItem|null>;
  search(query:Db00LocalFurnitureAreaFacetRequest):
    Promise<Db00LocalFurnitureAreaFacetPage>;
}

/**
 * Reuses a DB-00 pinned-furniture source bridge, and a DB-01 native-positive
 * index built from the same owner-local SHA-verified originals.
 */
export function createDb00LocalFurnitureAreaFacetReader(
  native:Db00LocalFurnitureAreaReader,
  areaIndex:Db01FurniturePositiveAreaSourceClient,
):Db00LocalFurnitureAreaFacetReader{
  check(native?.contract==='wand.game-db.local-original-furniture-area-tags@1' &&
    native.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    native.ownerLocalOnly===true &&
    native.publicationAuthorized===false &&
    native.sourceFurnitureDefinitions===6746 &&
    native.positiveOriginalAreaTagsEvaluated===6 &&
    native.runtimeCollectionAreaMembershipVerified===false &&
    typeof native.getItem==='function' &&
    typeof native.getItems==='function',
    'EXACT_DB00_PRIVATE_FURNITURE_READER_REQUIRED');
  check(areaIndex?.contract===DB01_FURNITURE_NATIVE_AREA_PREDICATES &&
    areaIndex.gameVersion==='1.26.2' &&
    typeof areaIndex.getItem==='function' &&
    typeof areaIndex.getCoverage==='function' &&
    typeof areaIndex.search==='function',
    'EXACT_DB01_ORIGINAL_POSITIVE_AREA_INDEX_REQUIRED');

  let coverageTask:Promise<Db00LocalFurnitureAreaFacetCoverage>|null=null;
  function getCoverage():Promise<Db00LocalFurnitureAreaFacetCoverage>{
    if(coverageTask)return coverageTask;
    coverageTask=(async()=>{
      const source=await areaIndex.getCoverage();
      const counts=source?.sourceItemsByPositiveArea;
      check(source?.gameVersion==='1.26.2' &&
        source.originalFurnitureCount===6746 &&
        source.anyPositiveAreaTagItems===6303 &&
        source.withoutPositiveAreaTagItems===443 &&
        source.originalStaticAreaConfigVerified===true &&
        source.originalPositiveHasTagPredicatesVerified===true &&
        source.allAreasNativeDefaultTagVerified===false &&
        source.nativeGameUiAreaMembershipVerified===false &&
        counts!==null&&typeof counts==='object' &&
        POSITIVE.every(code=>
          counts[code]===DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS[code]) &&
        POSITIVE.reduce((total,code)=>total+counts[code],0)===6303 &&
        6746-6303===DB01_FURNITURE_ORIGINAL_UNASSIGNED_POSITIVE_AREA_COUNT,
        'ORIGINAL_POSITIVE_AREA_CENSUS_MISMATCH');
      return Object.freeze({
        snapshotId:native.snapshotId,source,
        sourceFurnitureDefinitions:6746 as const,
        positiveSourceMatches:6303 as const,
        noPositiveSourceTagItems:443 as const,
        areaCounts:Object.freeze(Object.fromEntries(POSITIVE.map(code=>
          [code,counts[code]]
        ))) as Readonly<Record<Db01SourcePositiveCollectionAreaCode,number>>,
        sourceNativeHasTagVerified:true as const,
        nativeAllAreasDefaultVerified:false as const,
        nativeCollectionUiMembershipVerified:false as const
      });
    })().catch(error=>{coverageTask=null;throw error;});
    return coverageTask;
  }

  function verifyRow(
    original:Db00LocalFurnitureItemAreaEvidence,
    matched:Readonly<Db01FurnitureOriginalPositiveAreas>|null,
  ):Db00LocalFurnitureAreaFacetItem{
    check(matched!==null &&
      original.sourceStatus==='verified_original_furniture' &&
      original.furniture!==null &&
      matched.itemId===Number(original.itemId) &&
      matched.originalNativeFurnitureClass===
        original.furniture.original.originalNativeClass &&
      matched.positiveNativeHasTagPredicatesVerified===true &&
      matched.originalAllAreasDefaultHasTagEvaluated===false &&
      matched.originalAreaConfigsFullSequenceVerified===false &&
      matched.actualCollectionUiMembershipVerified===false &&
      matched.gameWorldAvailabilityVerified===false &&
      matched.playerEntitlementVerified===false &&
      original.gameUiCollectionMembershipVerified===false &&
      original.allAreasNativeDefaultInputResolved===false &&
      original.positiveNativeAreaTagConfigsEvaluated===6,
      'ORIGINAL_SOURCE_ITEM_OR_UI_STATUS_MISMATCH');
    const verifiedCodes=original.positiveSourceTagMatches.map(row=>
      row.area.areaCode
    );
    check(verifiedCodes.length===matched.matches.length &&
      verifiedCodes.every((code,i)=>
        code===matched.matches[i].areaCode &&
        original.positiveSourceTagMatches[i].area.original.gameplayTagId===
          matched.matches[i].gameplayTagId &&
        matched.matches[i].matchingSource==='original_native_has_tag' &&
        matched.matches[i].gameUiMembershipVerified===false) &&
      matched.matchedPositiveAreaCodes.length===verifiedCodes.length &&
      matched.matchedPositiveAreaCodes.every((code,i)=>
        code===verifiedCodes[i]) &&
      matched.firstProvenAreaCode===(verifiedCodes[0]??null) &&
      matched.firstSelectedAreaGameplayTagId===
        (original.positiveSourceTagMatches[0]?.area.original.gameplayTagId??null),
      'DB01_DB00_POSITIVE_AREA_ROW_MISMATCH');
    return Object.freeze({
      itemId:original.itemId,shared:original.shared,original,
      positiveAreas:matched,
      firstProvenAreaCode:matched.firstProvenAreaCode,
      sourcePositiveOnly:true as const,
      gameUiCollectionMembershipVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const
    });
  }
  async function getItem(raw:string|number):
    Promise<Db00LocalFurnitureAreaFacetItem|null>{
    const itemId=canonicalId(raw);
    const [original,matched]=await Promise.all([
      native.getItem(itemId),areaIndex.getItem(Number(itemId))
    ]);
    if(original.sourceStatus==='not_in_original_furniture'){
      check(matched===null&&original.furniture===null,
        'MISSING_FURNITURE_SOURCE_MISMATCH');
      return null;
    }
    return verifyRow(original,matched);
  }
  async function search(query:Db00LocalFurnitureAreaFacetRequest):
    Promise<Db00LocalFurnitureAreaFacetPage>{
    check(query!==null&&typeof query==='object'&&!Array.isArray(query)&&
      Array.isArray(query.areaCodes)&&query.areaCodes.length>=1&&
      query.areaCodes.length<=6&&
      query.areaCodes.every(code=>code===0||POSITIVE.includes(
        code as Db01SourcePositiveCollectionAreaCode
      )) &&
      new Set(query.areaCodes).size===query.areaCodes.length &&
      (!query.areaCodes.includes(0)||query.areaCodes.length===1),
      'INVALID_AREA_SELECTION');
    const offset=query.offset??0,limit=query.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0 &&
      Number.isSafeInteger(limit)&&limit>0&&limit<=200,
      'INVALID_PAGE');
    await getCoverage();
    const source=await areaIndex.search({
      areaCodes:query.areaCodes,offset,limit
    });
    const all=query.areaCodes.length===1&&query.areaCodes[0]===0;
    check(source.originalPositiveAreaNativeSourceOnly===true &&
      source.allAreasMeansUnfilteredSourceItems===all &&
      source.areaDefaultNativePredicateEvaluated===false &&
      source.actualCollectionUiMembershipVerified===false &&
      source.playerOwnershipVerified===false &&
      source.dlcEntitlementVerified===false &&
      Number.isSafeInteger(source.total) &&
      source.total>=0 && source.total<=6746 &&
      (all?source.total===6746:true) &&
      Array.isArray(source.itemIds) &&
      source.itemIds.length<=limit &&
      (source.total<=offset||source.itemIds.length>0) &&
      source.itemIds.length<=Math.max(0,source.total-offset) &&
      source.itemIds.every(id=>Number.isSafeInteger(id)&&id>0) &&
      source.itemIds.every((id,i)=>i===0||source.itemIds[i-1]<id) &&
      source.hasMore===(source.total>offset+source.itemIds.length),
      'SOURCE_AREA_PAGE_MISMATCH');
    const originals=await native.getItems(source.itemIds);
    const matches=await Promise.all(source.itemIds.map(id=>
      areaIndex.getItem(id)));
    check(originals.length===source.itemIds.length &&
      matches.length===source.itemIds.length,
      'ORIGINAL_ITEM_PAGE_CENSUS_MISMATCH');
    const items=Object.freeze(originals.map((original,i)=>{
      const item=verifyRow(original,matches[i]);
      check(item.itemId===String(source.itemIds[i]) &&
        (all||item.positiveAreas.matchedPositiveAreaCodes.some(code=>
          query.areaCodes.includes(code))),
        'UNMATCHED_SOURCE_AREA_FILTER_ITEM');
      return item;
    }));
    const next=offset+items.length;
    return Object.freeze({
      snapshotId:native.snapshotId,
      areaCodes:Object.freeze([...query.areaCodes]),
      total:source.total,offset,
      nextOffset:next<source.total?next:null,
      items,originalPositiveAreaNativeSourceOnly:true as const,
      allAreasMeansUnfilteredSourceItems:all,
      areaDefaultNativePredicateEvaluated:false as const,
      actualCollectionUiMembershipVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const,
    });
  }
  return Object.freeze({
    contract:DB00_LOCAL_FURNITURE_AREA_FACETS,
    snapshotId:native.snapshotId,
    gameVersion:'1.26.2' as const,
    ownerLocalOnly:true as const,
    publicationAuthorized:false as const,
    nativeCollectionUiMembershipVerified:false as const,
    getCoverage,getItem,search
  });
}
