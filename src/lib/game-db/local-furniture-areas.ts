/**
 * DB-00 OWNER-LOCAL bridge for DB-01's original Furniture HasTag evidence.
 *
 * Seven original Furniture protobuf subclasses must not be decoded as one:
 * DB-01 verifies each Tags field, and only FurnitureItemData implements
 * IHasSet to inherit SetItemData.Tags. This bridge reuses those results.
 *
 * A positive original HasTag predicate is NOT a native CollectionArea UI
 * selection. The AllAreas default, menu branch, DLC unlock, runtime scene
 * and Save state remain unresolved; the browser public DB is never mutated.
 */
import {canonicalId} from './model.ts';
import type {PublicSharedGameSources} from './public-sources.ts';
import type {Db00SourceJoinedItem} from './source-join.ts';
import type {Db00OriginalCollectionArea}
  from './collection-area-sources.ts';
import {
  DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA,
  DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
  DB01_ORIGINAL_FURNITURE_SET_SHA256,
  DB01_ORIGINAL_FURNITURE_TAG_SHA256,
  DB01_ORIGINAL_FURNITURE_IL2CPP_SHA256,
  DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS,
  type Db01OriginalFurnitureHasTagClient,
  type Db01OriginalFurnitureHasTagItem,
  type Db01OriginalFurnitureSubtype,
} from '../items/furniture-native-has-tag.ts';
import {
  evaluateOriginalNativeHasTag,
  type Db01OriginalHasTagResult,
} from '../items/native-has-tag.ts';

export const DB00_LOCAL_FURNITURE_AREAS=
  'wand.game-db.local-original-furniture-area-tags@1' as const;
function ensure(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB00_FURNITURE_AREA_'+reason);
}
export interface Db00LocalFurnitureAreaTag{
  readonly area:Db00OriginalCollectionArea;
  readonly originalHasTag:Readonly<Db01OriginalHasTagResult>;
  readonly positiveSourceMatch:true;
  readonly sourceMatchingBranch:'item_tags'|'set_item_tags';
  readonly runtimeCollectionAreaMembershipVerified:false;
}
export interface Db00LocalFurnitureItemAreaEvidence{
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  readonly furniture:Readonly<Db01OriginalFurnitureHasTagItem>|null;
  readonly sourceStatus:'verified_original_furniture'|'not_in_original_furniture';
  readonly positiveSourceTagMatches:readonly Db00LocalFurnitureAreaTag[];
  readonly positiveNativeAreaTagConfigsEvaluated:6;
  /** Original AllAreas uses a default Item not attested by these six Tags. */
  readonly allAreasNativeDefaultInputResolved:false;
  readonly completeNativeGetAreaConfigsEvaluation:false;
  readonly sourceCandidatesOnly:true;
  readonly gameUiCollectionMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00LocalFurnitureAreaReader{
  readonly contract:typeof DB00_LOCAL_FURNITURE_AREAS;
  readonly snapshotId:string;
  readonly ownerLocalOnly:true;
  readonly publicationAuthorized:false;
  readonly sourceFurnitureDefinitions:6746;
  readonly positiveOriginalAreaTagsEvaluated:6;
  readonly runtimeCollectionAreaMembershipVerified:false;
  getItem(itemId:number|string):Promise<Db00LocalFurnitureItemAreaEvidence>;
  getItems(itemIds:readonly (number|string)[]):
    Promise<readonly Db00LocalFurnitureItemAreaEvidence[]>;
}

export function joinLocalFurnitureCollectionAreaSources(
  publicData:PublicSharedGameSources,
  furnitureSource:Db01OriginalFurnitureHasTagClient,
):Db00LocalFurnitureAreaReader{
  const areas=publicData?.originalCollectionAreas;
  const source=furnitureSource?.source;
  ensure(publicData?.schema==='wand.game-db.public-sources@1' &&
    publicData.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    publicData.database?.itemCount===13202 &&
    publicData.database.target.gameVersion==='1.26.2' &&
    publicData.database.target.platform==='Steam' &&
    publicData.hasPrivateGameSource===false &&
    publicData.playerOwnershipVerified===false &&
    areas?.contract==='wand.game-db.original-collection-area-reference@1' &&
    areas.originalTagSha256===DB01_ORIGINAL_FURNITURE_TAG_SHA256 &&
    areas.sourceConfigCount===7 && areas.orderedAreas.length===7 &&
    areas.gameUiItemMembershipVerified===false &&
    typeof publicData.getItem==='function',
    'EXACT_PUBLIC_ITEM_AND_AREA_CONFIG_REQUIRED');
  ensure(furnitureSource?.schema===DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA &&
    source?.gameVersion==='1.26.2' &&
    source.sourceFurnitureSha256===DB01_ORIGINAL_FURNITURE_SOURCE_SHA256 &&
    source.sourceSetSha256===DB01_ORIGINAL_FURNITURE_SET_SHA256 &&
    source.sourceTagSha256===DB01_ORIGINAL_FURNITURE_TAG_SHA256 &&
    source.sourceIl2cppDumpSha256===DB01_ORIGINAL_FURNITURE_IL2CPP_SHA256 &&
    Object.keys(source.originalNativeClassCounts).length===7 &&
    Object.entries(DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS).every(
      ([name,definition])=>
        source.originalNativeClassCounts[name as Db01OriginalFurnitureSubtype]===
          definition.count
    ) &&
    typeof furnitureSource.getItem==='function' &&
    typeof furnitureSource.getItems==='function' &&
    typeof furnitureSource.hasTag==='function',
    'PINNED_ORIGINAL_FURNITURE_SOURCE_REQUIRED');
  const positive=areas.orderedAreas.filter(a=>a.original.gameplayTagId>0);
  ensure(positive.length===6 &&
    positive.every(a=>a.worldTag!==null&&
      a.originalConfigVerified===true&&
      a.sourceTagCandidateOnly===true&&
      a.gameUiItemMembershipVerified===false) &&
    areas.orderedAreas.some(a=>a.areaCode===0&&a.worldTag===null&&
      a.original.gameplayTagId===0),
    'EXACT_POSITIVE_AREA_TAG_CONFIGS_REQUIRED');

  function joinOriginal(
    itemId:string,
    original:Readonly<Db01OriginalFurnitureHasTagItem>|null,
  ):Db00LocalFurnitureItemAreaEvidence{
    const shared=publicData.getItem(itemId);
    const positiveSourceTagMatches:Db00LocalFurnitureAreaTag[]=[];
    if(original!==null){
      const row=original.original,input=original.input;
      const nativeSpec=DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS[
        row.originalNativeClass
      ];
      ensure(!!nativeSpec &&
        original.gameVersion==='1.26.2' &&
        original.sourceShardHashVerified===true &&
        original.gameUiCollectionMembershipVerified===false &&
        row.itemId===Number(itemId) &&
        input.itemId===Number(itemId) &&
        input.gameVersion==='1.26.2' &&
        input.nativeTags===row.nativeTags &&
        input.setLookup===row.setLookup &&
        row.tagsFieldNumber===nativeSpec.tagsFieldNumber &&
        row.nativeHasTagSchemaVerified===true &&
        row.gameUiCollectionMembershipVerified===false &&
        row.dlcEntitlementVerified===false &&
        (nativeSpec.hasSet?
          input.setLookup.kind==='has_set':
          input.setLookup.kind==='not_ihas_set'),
        'ORIGINAL_FURNITURE_ITEM_OR_CLASS_MISMATCH');
      for(const area of positive){
        const matched=evaluateOriginalNativeHasTag(
          input,area.original.gameplayTagId
        );
        ensure(matched.itemId===Number(itemId) &&
          matched.requestedTagId===area.original.gameplayTagId &&
          matched.nativeHasTagAlgorithmVerified===true &&
          matched.runtimeInputVerified===false &&
          matched.gameCollectionAreaMembershipVerified===false &&
          matched.dlcEntitlementVerified===false &&
          matched.matches===(matched.matchingSource!=='not_found'),
          'ORIGINAL_HAS_TAG_RESULT_INVALID');
        if(matched.matches){
          ensure(matched.matchingSource==='item_tags'||
            matched.matchingSource==='set_item_tags',
            'UNKNOWN_TAG_MATCH_SOURCE');
          positiveSourceTagMatches.push(Object.freeze({
            area,originalHasTag:matched,positiveSourceMatch:true as const,
            sourceMatchingBranch:matched.matchingSource,
            runtimeCollectionAreaMembershipVerified:false as const,
          }));
        }
      }
    }
    ensure(shared.itemId===itemId &&
      shared.playerOwnershipVerified===false &&
      shared.currentlyAvailableVerified===false,
      'PUBLIC_ITEM_ID_OR_PLAYER_STATE_MISMATCH');
    return Object.freeze({
      itemId,shared,furniture:original,
      sourceStatus:original===null?
        'not_in_original_furniture' as const:
        'verified_original_furniture' as const,
      positiveSourceTagMatches:Object.freeze(positiveSourceTagMatches),
      positiveNativeAreaTagConfigsEvaluated:6 as const,
      allAreasNativeDefaultInputResolved:false as const,
      completeNativeGetAreaConfigsEvaluation:false as const,
      sourceCandidatesOnly:true as const,
      gameUiCollectionMembershipVerified:false as const,
      worldAvailabilityVerified:false as const,
      dlcEntitlementVerified:false as const,
      playerOwnershipVerified:false as const
    });
  }
  async function getItem(id:number|string):
    Promise<Db00LocalFurnitureItemAreaEvidence>{
    const itemId=canonicalId(id);
    return joinOriginal(itemId,await furnitureSource.getItem(Number(itemId)));
  }
  return Object.freeze({
    contract:DB00_LOCAL_FURNITURE_AREAS,
    snapshotId:publicData.snapshotId,
    ownerLocalOnly:true as const,
    publicationAuthorized:false as const,
    sourceFurnitureDefinitions:6746 as const,
    positiveOriginalAreaTagsEvaluated:6 as const,
    runtimeCollectionAreaMembershipVerified:false as const,
    getItem,
    async getItems(ids:readonly (number|string)[]){
      ensure(Array.isArray(ids)&&ids.length<=256,'INVALID_ID_BATCH');
      const itemIds=ids.map(canonicalId);
      // DB-01 verifies source shards and catalog identities in one bounded
      // batch, instead of issuing hundreds of per-ID catalog lookups.
      const native=await furnitureSource.getItems(itemIds.map(Number));
      ensure(native.length===itemIds.length,
        'ORIGINAL_FURNITURE_BATCH_SIZE_MISMATCH');
      return Object.freeze(itemIds.map((itemId,index)=>
        joinOriginal(itemId,native[index])));
    },
  });
}
