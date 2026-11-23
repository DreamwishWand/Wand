/**
 * DB-00 read-only static Collection-area source config and native Tag mapping.
 *
 * The SHA-pinned Steam 1.26.2 CollectionsUIConfig proves the ordered seven
 * original area configurations. It does not implement GetAreaConfigs:
 * native Critter location, first-match precedence, exceptions, scene state
 * and save/player data can change the UI result for a particular Item.
 */
import {
  DB01_ORIGINAL_COLLECTION_AREA_SOURCE,
  DB01_COLLECTION_AREA_STATIC_SOURCE,
  DB01_COLLECTION_AREA_UNITYFS_SHA256,
  DB01_COLLECTION_AREA_ORIGINAL_TAG_SHA256,
  DB01_COLLECTION_AREA_ORIGINAL_SCENE_SHA256,
  DB01_COLLECTION_ITEM_LOCATION_EXCEPTION_IDS,
  getOriginalCollectionAreaConfig,
  findOriginalCollectionAreaConfigByTag,
  type Db01OriginalCollectionAreaSourceConfig
} from '../items/collection-area-source-config.ts';
import {DB04_WORLD_TAGS,type Db04WorldTag} from '../world/native-item-scope.ts';
import {canonicalId} from './model.ts';

export const DB00_COLLECTION_AREA_SOURCE_CONTRACT=
  'wand.game-db.original-collection-area-reference@1' as const;
const SHA=/^[0-9a-f]{64}$/;
const AREA_CODES=Object.freeze([1,2,3,4,5,4097,0] as const);
type SourceAreaCode=typeof AREA_CODES[number];
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB00_COLLECTION_AREA_'+reason);
}
/** One exact source configuration; never a computed Item->CollectionArea result. */
export interface Db00OriginalCollectionArea{
  readonly areaCode:SourceAreaCode;
  readonly original:Db01OriginalCollectionAreaSourceConfig;
  readonly worldTag:Db04WorldTag|null;
  readonly nativeSceneItemId:number|null;
  readonly originalConfigVerified:true;
  readonly sourceTagCandidateOnly:true;
  readonly gameUiItemMembershipVerified:false;
  readonly playerWorldUnlockedVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db00OriginalCollectionAreaReader{
  readonly contract:typeof DB00_COLLECTION_AREA_SOURCE_CONTRACT;
  readonly platform:'Steam';
  readonly gameVersion:'1.26.2';
  readonly sourceConfigCount:7;
  readonly orderedAreas:readonly Db00OriginalCollectionArea[];
  readonly originalTagSha256:typeof DB01_COLLECTION_AREA_ORIGINAL_TAG_SHA256;
  readonly originalUnityFsSha256:typeof DB01_COLLECTION_AREA_UNITYFS_SHA256;
  readonly originalSceneSha256:typeof DB01_COLLECTION_AREA_ORIGINAL_SCENE_SHA256;
  readonly originalItemLocationExceptionIds:
    typeof DB01_COLLECTION_ITEM_LOCATION_EXCEPTION_IDS;
  readonly gameUiItemMembershipVerified:false;
  getArea(code:number):Db00OriginalCollectionArea;
  getAreaByNativeWorldTag(tag:Db04WorldTag):Db00OriginalCollectionArea;
  getAreaByNativeTagId(tagId:number):Db00OriginalCollectionArea|null;
  /** Exception list is original metadata, not understood runtime behavior. */
  isOriginalLocationException(itemId:number|string):boolean;
}
/** Pure public static wiring: zero files fetched and no original asset bytes. */
export function createDb00OriginalCollectionAreaReader():
  Db00OriginalCollectionAreaReader{
  const snapshot=DB01_ORIGINAL_COLLECTION_AREA_SOURCE;
  check(snapshot.contract===DB01_COLLECTION_AREA_STATIC_SOURCE &&
    snapshot.platform==='Steam'&&snapshot.gameVersion==='1.26.2'&&
    snapshot.sourceConfigCount===7&&
    snapshot.nativeCollectionAreaConfigVerified===true&&
    snapshot.nativeItemToGameUiAreaMembershipVerified===false&&
    snapshot.gameWorldAvailabilityVerified===false&&
    snapshot.playerPurchaseEntitlementVerified===false&&
    snapshot.playerOwnershipVerified===false&&
    snapshot.itemLocationExceptionMeaningVerified===false&&
    SHA.test(snapshot.originalUnityFsSha256)&&
    SHA.test(DB01_COLLECTION_AREA_ORIGINAL_TAG_SHA256)&&
    SHA.test(DB01_COLLECTION_AREA_ORIGINAL_SCENE_SHA256)&&
    snapshot.configs.length===7&&
    snapshot.originalItemLocationExceptionIds.length===5,
    'EXACT_DB01_STATIC_COLLECTION_CONFIG_REQUIRED');
  const worldTags=new Set<string>(DB04_WORLD_TAGS);
  const seenCodes=new Set<number>(),seenTags=new Set<string>();
  const areas=snapshot.configs.map((original,i):Db00OriginalCollectionArea=>{
    const code=AREA_CODES[i];
    check(original.areaCode===code &&
      original===getOriginalCollectionAreaConfig(code) &&
      !seenCodes.has(code),'AREA_CONFIG_ORDER_OR_ID_MISMATCH');
    seenCodes.add(code);
    const worldTag=original.tagNativeKey;
    if(worldTag!==null){
      check(worldTags.has(worldTag) &&
        !seenTags.has(worldTag) &&
        Number.isSafeInteger(original.gameplayTagId) &&
        original.gameplayTagId>0 &&
        findOriginalCollectionAreaConfigByTag(original.gameplayTagId)===original &&
        Number.isSafeInteger(original.villageItemId) &&
        original.villageItemId>0 &&
        typeof original.villageNativeKey==='string' &&
        original.villageNativeKey.startsWith('Village!'),
        'NATIVE_WORLD_TAG_OR_SCENE_MISMATCH');
      seenTags.add(worldTag);
    }else{
      check(code===0&&original.gameplayTagId===0 &&
        original.villageItemId===0 &&
        original.villageNativeKey===null,
        'ALL_AREAS_MUST_NOT_HAVE_NATIVE_TAG');
    }
    return Object.freeze({
      areaCode:code,original,
      worldTag:worldTag as Db04WorldTag|null,
      nativeSceneItemId:original.villageItemId===0?
        null:original.villageItemId,
      originalConfigVerified:true as const,
      sourceTagCandidateOnly:true as const,
      gameUiItemMembershipVerified:false as const,
      playerWorldUnlockedVerified:false as const,
      dlcEntitlementVerified:false as const
    });
  });
  check(seenCodes.size===7&&seenTags.size===6 &&
    [...worldTags].every(tag=>seenTags.has(tag)),
    'DB01_DB04_WORLD_TAG_COVERAGE_MISMATCH');
  const codeMap=new Map<number,Db00OriginalCollectionArea>(
    areas.map(area=>[area.areaCode,area])
  );
  const tagMap=new Map(areas.filter(area=>area.worldTag!==null)
    .map(area=>[area.worldTag!,area]));
  const nativeIdMap=new Map<number,Db00OriginalCollectionArea>(
    areas.filter(area=>area.original.gameplayTagId>0)
      .map(area=>[area.original.gameplayTagId,area])
  );
  const exceptions=new Set<string>(
    snapshot.originalItemLocationExceptionIds.map(id=>canonicalId(id))
  );
  check(exceptions.size===5,'LOCATION_EXCEPTION_CENSUS');
  return Object.freeze({
    contract:DB00_COLLECTION_AREA_SOURCE_CONTRACT,
    platform:'Steam' as const,gameVersion:'1.26.2' as const,
    sourceConfigCount:7 as const,orderedAreas:Object.freeze(areas),
    originalTagSha256:DB01_COLLECTION_AREA_ORIGINAL_TAG_SHA256,
    originalUnityFsSha256:DB01_COLLECTION_AREA_UNITYFS_SHA256,
    originalSceneSha256:DB01_COLLECTION_AREA_ORIGINAL_SCENE_SHA256,
    originalItemLocationExceptionIds:DB01_COLLECTION_ITEM_LOCATION_EXCEPTION_IDS,
    gameUiItemMembershipVerified:false as const,
    getArea(code:number){
      check(Number.isSafeInteger(code)&&codeMap.has(code),
        'UNSUPPORTED_AREA_CODE');
      return codeMap.get(code)!;
    },
    getAreaByNativeWorldTag(tag:Db04WorldTag){
      check(worldTags.has(tag),'UNKNOWN_WORLD_TAG');
      return tagMap.get(tag)!;
    },
    getAreaByNativeTagId(tagId:number){
      check(Number.isSafeInteger(tagId)&&tagId>0,'INVALID_NATIVE_TAG_ID');
      return nativeIdMap.get(tagId)??null;
    },
    isOriginalLocationException(itemId:number|string){
      return exceptions.has(canonicalId(itemId));
    }
  });
}
