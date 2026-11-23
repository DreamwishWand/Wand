/**
 * Steam 1.26.2 ORIGINAL Unity scene-main CollectionAreaConfig metadata.
 *
 * Source is the SHA-pinned UnityFS scene-main_scenes_all.bundle, not a
 * CollectionSet field or an inferred DLC/world classifier. Config order,
 * GameplayTagID, VillageItemID and sprite subobject were decoded from the
 * serialized CollectionsUIConfig component and joined to SHA-pinned original
 * Tag.json and Scene.json.
 *
 * A matching item tag is NOT sufficient to certify runtime CollectionArea:
 * GetAreaConfigs also handles Critter location, world scene, first-match
 * precedence, exceptions and native fallback. No save profile, DLC purchase
 * or player ownership is known from this static file.
 */
import {DB01_ORIGINAL_COLLECTION_AREAS} from './collection-ui-axes.ts';

export const DB01_COLLECTION_AREA_STATIC_SOURCE=
  'wand.db01.original-collection-area-static@1' as const;
export const DB01_COLLECTION_AREA_UNITYFS_SHA256=
  '7e53e4c03a539f7b4484cb106382ed590c77570ced0232ae40af245954d2974f' as const;
export const DB01_COLLECTION_AREA_SERIALIZED_CAB_SHA256=
  '423016b54020bdedefe868d30e8c7eeadc453e9e5c0e16410d32400ce1bc7fdb' as const;
export const DB01_COLLECTION_AREA_ORIGINAL_TAG_SHA256=
  'bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4' as const;
export const DB01_COLLECTION_AREA_ORIGINAL_SCENE_SHA256=
  'd8fc56cfc282323df94461e360c26aaf98a884f01b7bd83cabf967ac2cd397d5' as const;

export const DB01_COLLECTION_AREA_SOURCE_CONFIGS=Object.freeze([
  Object.freeze({areaCode:1,enumName:'DreamlightValley',
    gameplayTagId:2001200028,tagNativeKey:'IsDreamlightValley',
    villageItemId:1540000000,villageNativeKey:'Village!Village04',
    iconSubObject:'icon_menu_dreamlight'}),
  Object.freeze({areaCode:2,enumName:'EternityIsle',
    gameplayTagId:2001200029,tagNativeKey:'IsEternityIsle',
    villageItemId:1540000101,villageNativeKey:'Village!Expansion01',
    iconSubObject:'icon_eternity_isle'}),
  Object.freeze({areaCode:3,enumName:'StorybookVale',
    gameplayTagId:2001200030,tagNativeKey:'IsStorybookVale',
    villageItemId:1540000119,villageNativeKey:'Village!Expansion02',
    iconSubObject:'icon_map_travel_theBind'}),
  Object.freeze({areaCode:4,enumName:'WishblossomRanch',
    gameplayTagId:2001200040,tagNativeKey:'IsWishBlossomMountains',
    villageItemId:1540000162,villageNativeKey:'Village!Expansion03',
    iconSubObject:'icon_map_travel_dlc3_biome01'}),
  Object.freeze({areaCode:5,enumName:'SeaOfSecrets',
    gameplayTagId:2001200066,tagNativeKey:'isSeaOfSecrets',
    villageItemId:1540000209,villageNativeKey:'Village!Expansion04',
    iconSubObject:'icon_keepsake_sea'}),
  Object.freeze({areaCode:4097,enumName:'Honeywood',
    gameplayTagId:2001200067,tagNativeKey:'isHoneywood',
    villageItemId:1540000210,villageNativeKey:'Village!VillageWinnieDLC',
    iconSubObject:'icon_map_travel_mini1_honeywood'}),
  Object.freeze({areaCode:0,enumName:'AllAreas',
    gameplayTagId:0,tagNativeKey:null,
    villageItemId:0,villageNativeKey:null,
    iconSubObject:'icon_map_castle'}),
] as const);

export const DB01_COLLECTION_ITEM_LOCATION_EXCEPTION_IDS=Object.freeze([
  31700022,31700021,31700032,31700033,31600011,
] as const);
/** Only exact serialized exception IDs. Their runtime effects remain unknown. */

export type Db01OriginalCollectionAreaSourceConfig=
  (typeof DB01_COLLECTION_AREA_SOURCE_CONFIGS)[number];

export interface Db01OriginalCollectionAreaSourceSnapshot {
  readonly contract:typeof DB01_COLLECTION_AREA_STATIC_SOURCE;
  readonly platform:'Steam';
  readonly gameVersion:'1.26.2';
  readonly originalUnityFsSha256:typeof DB01_COLLECTION_AREA_UNITYFS_SHA256;
  readonly sourceConfigCount:7;
  readonly nativeCollectionAreaConfigVerified:true;
  readonly nativeItemToGameUiAreaMembershipVerified:false;
  readonly gameWorldAvailabilityVerified:false;
  readonly playerPurchaseEntitlementVerified:false;
  readonly playerOwnershipVerified:false;
  readonly itemLocationExceptionMeaningVerified:false;
  readonly configs:typeof DB01_COLLECTION_AREA_SOURCE_CONFIGS;
  readonly originalItemLocationExceptionIds:
    typeof DB01_COLLECTION_ITEM_LOCATION_EXCEPTION_IDS;
}

export const DB01_ORIGINAL_COLLECTION_AREA_SOURCE:
  Db01OriginalCollectionAreaSourceSnapshot=Object.freeze({
    contract:DB01_COLLECTION_AREA_STATIC_SOURCE,
    platform:'Steam',gameVersion:'1.26.2',
    originalUnityFsSha256:DB01_COLLECTION_AREA_UNITYFS_SHA256,
    sourceConfigCount:7,
    nativeCollectionAreaConfigVerified:true,
    nativeItemToGameUiAreaMembershipVerified:false,
    gameWorldAvailabilityVerified:false,
    playerPurchaseEntitlementVerified:false,
    playerOwnershipVerified:false,
    itemLocationExceptionMeaningVerified:false,
    configs:DB01_COLLECTION_AREA_SOURCE_CONFIGS,
    originalItemLocationExceptionIds:DB01_COLLECTION_ITEM_LOCATION_EXCEPTION_IDS,
  });

const byArea=new Map<number,Db01OriginalCollectionAreaSourceConfig>();
const byTag=new Map<number,Db01OriginalCollectionAreaSourceConfig>();
for(const entry of DB01_COLLECTION_AREA_SOURCE_CONFIGS){
  if(byArea.has(entry.areaCode)||entry.gameplayTagId!==0&&
    byTag.has(entry.gameplayTagId)){
    throw new Error('DB01_DUPLICATE_ORIGINAL_COLLECTION_AREA_CONFIG');
  }
  byArea.set(entry.areaCode,entry);
  if(entry.gameplayTagId)byTag.set(entry.gameplayTagId,entry);
}
if(byArea.size!==DB01_ORIGINAL_COLLECTION_AREAS.length||
  DB01_ORIGINAL_COLLECTION_AREAS.some(
    area=>byArea.get(area.code)?.enumName!==area.enumName)){
  throw new Error('DB01_ORIGINAL_COLLECTION_AREA_ENUM_MISMATCH');
}

/** Exact static source config; no claim that any given Item belongs to it. */
export function getOriginalCollectionAreaConfig(
  areaCode:number,
):Db01OriginalCollectionAreaSourceConfig{
  if(!Number.isSafeInteger(areaCode)||!byArea.has(areaCode)){
    throw new Error('DB01_UNSUPPORTED_ORIGINAL_COLLECTION_AREA_CODE');
  }
  return byArea.get(areaCode)!;
}

/** Native source Tag -> serialized config. NOT Item -> runtime UI membership. */
export function findOriginalCollectionAreaConfigByTag(
  gameplayTagId:number,
):Db01OriginalCollectionAreaSourceConfig|null{
  if(!Number.isSafeInteger(gameplayTagId)||gameplayTagId<=0){
    throw new Error('DB01_INVALID_ORIGINAL_COLLECTION_AREA_TAG_ID');
  }
  return byTag.get(gameplayTagId)??null;
}
