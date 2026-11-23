/**
 * Replay of the verified Steam 1.26.2 CollectionsUIConfig.GetAreaConfigs
 * and GetAreaTags control-flow with explicit, externally evaluated inputs.
 *
 * The original game calls IHasTags.HasTag(config.GameplayTag), NOT merely
 * direct source Tag ID membership. Callers must supply the actual boolean
 * results for ALL seven config entries (including the zero-tag default).
 * In particular, a DB-01 source World Tag by itself is NOT sufficient.
 *
 * Critter location requires a resolved ProfileWorld village/scene item ID,
 * not a static Item→World guess. Inputs intentionally do not include DLC
 * purchase or inventory state; the verified native path is onlyPurchased=false.
 * No returned item→area classification is asserted as runtime-validated.
 */
import {
  DB01_COLLECTION_AREA_SOURCE_CONFIGS,
  type Db01OriginalCollectionAreaSourceConfig,
} from './collection-area-source-config.ts';

export const DB01_ORIGINAL_COLLECTION_AREA_ROUTING=
  'wand.db01.collection-area-routing-steam-1262@1' as const;
export const DB01_COLLECTION_AREA_GAMEASSEMBLY_SHA256=
  'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653' as const;

/** The caller has *already* applied native IHasTags.HasTag to each config.
 * An absent/partial map is NOT interpreted as false. Only exact full
 * evaluations can represent the original Enumerable.Where result.
 */
export type Db01NativeAreaHasTagsEvidence=
  | Readonly<{kind:'no_native_has_tags_interface'}>
  | Readonly<{
      kind:'native_has_tag_evaluated';
      /** Keys are CollectionArea numeric codes, not Tag IDs. Includes 0. */
      matchesByArea:Readonly<Record<number,boolean>>;
    }>;

/** CritterItemData.LocationTypeOneofCase.Location=6 is a special route.
 * A null sceneItemId means a VERIFIED unsuccessful world/scene lookup,
 * not a missing/unread save. Unknown values must not be converted to null.
 */
export type Db01NativeAreaCritterLocationEvidence=
  | Readonly<{kind:'not_location_critter'}>
  | Readonly<{
      kind:'location_critter';
      resolvedVillageSceneItemId:number|null;
    }>;

export interface Db01NativeAreaRoutingInput{
  readonly itemId:number;
  readonly gameVersion:'1.26.2';
  readonly critter:Db01NativeAreaCritterLocationEvidence;
  readonly hasTags:Db01NativeAreaHasTagsEvidence;
}

export interface Db01NativeAreaConfigResult{
  readonly itemId:number;
  readonly areaConfigs:readonly Db01OriginalCollectionAreaSourceConfig[];
  readonly matchedAreaCodes:readonly number[];
  /** The source of the selected IEnumerable<CollectionAreaConfig>.
   * Not a verification that the caller's input was sourced from real runtime.
   */
  readonly methodBranch:'critter_village_scene'|'native_has_tags'|'no_match';
  readonly onlyPurchased:false;
  readonly staticSourceConfigVerified:true;
  readonly nativeRoutingAlgorithmReplayed:true;
  readonly nativeItemToGameUiAreaMembershipVerified:false;
  readonly gameWorldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
}

/** Original GetAreaTags uses only the FIRST returned config.
 * If none exists it falls back to DreamlightValley (code 1). The default
 * AllAreas config has GameplayTagID=0, so a hypothetical match contributes
 * no tag. Return of a fallback does NOT prove the item belongs to the
 * in-game Dreamlight Valley Collection page.
 */
export interface Db01NativeAreaTagsResult extends Db01NativeAreaConfigResult{
  readonly firstMatchedAreaCode:number|null;
  readonly selectedAreaCode:number;
  readonly tagIds:readonly number[];
  readonly usedDreamlightValleyFallback:boolean;
}

const configs=DB01_COLLECTION_AREA_SOURCE_CONFIGS;
const areaCodes=new Set<number>(configs.map(x=>x.areaCode));
const noOwn=(obj:object,key:PropertyKey)=>Object.prototype.hasOwnProperty.call(obj,key);
const validId=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>0;

function requireInput(input:Db01NativeAreaRoutingInput):void{
  if(!input||typeof input!=='object'||!validId(input.itemId)||
    input.gameVersion!=='1.26.2'){
    throw new Error('DB01_NATIVE_AREA_INPUT_OR_VERSION_INVALID');
  }
  const {critter,hasTags}=input;
  if(!critter||typeof critter!=='object'||(
    critter.kind!=='not_location_critter'&&
    critter.kind!=='location_critter')){
    throw new Error('DB01_NATIVE_AREA_CRITTER_STATE_REQUIRED');
  }
  if(critter.kind==='location_critter'&&
    critter.resolvedVillageSceneItemId!==null&&
    !validId(critter.resolvedVillageSceneItemId)){
    throw new Error('DB01_NATIVE_AREA_RESOLVED_SCENE_REQUIRED');
  }
  if(!hasTags||typeof hasTags!=='object'||(
    hasTags.kind!=='no_native_has_tags_interface'&&
    hasTags.kind!=='native_has_tag_evaluated')){
    throw new Error('DB01_NATIVE_AREA_HAS_TAGS_STATE_REQUIRED');
  }
  if(hasTags.kind==='native_has_tag_evaluated'){
    const results=hasTags.matchesByArea;
    if(!results||typeof results!=='object'||
      Reflect.ownKeys(results).length!==areaCodes.size||
      configs.some(x=>!noOwn(results,x.areaCode)||
        typeof results[x.areaCode]!=='boolean')){
      throw new Error('DB01_NATIVE_AREA_INCOMPLETE_HAS_TAG_EVALUATION');
    }
  }
}

/** Exact native filter order:
 * 1. If Critter.Location=6 and its resolved scene belongs to a config,
 *    use ONLY that scene-matching result (even if tag matches differ).
 * 2. Otherwise attempt IHasTags and evaluate configs in serialized order.
 * 3. If the interface is unavailable, return an empty enumerable.
 *
 * GetAreaConfigs itself does not apply the ItemLocationException list.
 */
export function resolveOriginalNativeAreaConfigs(
  input:Db01NativeAreaRoutingInput,
):Readonly<Db01NativeAreaConfigResult>{
  requireInput(input);
  const {critter,hasTags}=input;
  let selected:readonly Db01OriginalCollectionAreaSourceConfig[]=[];
  let branch:Db01NativeAreaConfigResult['methodBranch']='no_match';
  if(critter.kind==='location_critter'&&
    critter.resolvedVillageSceneItemId!==null){
    selected=configs.filter(x=>
      x.villageItemId!==0&&
      x.villageItemId===critter.resolvedVillageSceneItemId);
    if(selected.length>0)branch='critter_village_scene';
  }
  if(selected.length===0&&hasTags.kind==='native_has_tag_evaluated'){
    selected=configs.filter(x=>hasTags.matchesByArea[x.areaCode]===true);
    if(selected.length>0)branch='native_has_tags';
  }
  return Object.freeze({
    itemId:input.itemId,
    areaConfigs:Object.freeze([...selected]),
    matchedAreaCodes:Object.freeze(selected.map(x=>x.areaCode)),
    methodBranch:branch,
    onlyPurchased:false,
    staticSourceConfigVerified:true,
    nativeRoutingAlgorithmReplayed:true,
    nativeItemToGameUiAreaMembershipVerified:false,
    gameWorldAvailabilityVerified:false,
    dlcEntitlementVerified:false,
  });
}

export function resolveOriginalNativeAreaTags(
  input:Db01NativeAreaRoutingInput,
):Readonly<Db01NativeAreaTagsResult>{
  const configsResult=resolveOriginalNativeAreaConfigs(input);
  const first=configsResult.areaConfigs[0]??null;
  const selected=first??configs.find(x=>x.areaCode===1)!;
  if(!selected)throw new Error('DB01_NATIVE_AREA_DREAMLIGHT_FALLBACK_MISSING');
  return Object.freeze({
    ...configsResult,
    firstMatchedAreaCode:first?.areaCode??null,
    selectedAreaCode:selected.areaCode,
    tagIds:Object.freeze(
      selected.gameplayTagId>0?[selected.gameplayTagId]:[]),
    usedDreamlightValleyFallback:first===null,
  });
}
