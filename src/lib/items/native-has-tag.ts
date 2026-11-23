/**
 * Original Steam 1.26.2 ItemDataExtensions.HasTag(IHasTags, Item).
 *
 * Decompiled from the owner-local SHA-pinned GameAssembly.dll, with the
 * original IL2CPP IHasTags + IHasSet + SetItemData declarations verified.
 *
 * HasTag first searches the object's IHasTags.Tags (RepeatedField<int>).
 * On failure, if the object implements IHasSet, it retrieves its SetItem
 * definition from ItemDatabase as SetItemData, then searches that Set's Tags.
 * SetItemData.Tags has original protobuf field 6. No recursive traversal,
 * ItemType heuristic, or UI/world inference is performed.
 *
 * These pure functions REPLAY the verified algorithm. Consumers must supply
 * full SHA-verified original record input; this module does not claim that
 * any arbitrary caller-supplied list or Item ID is runtime verified.
 */
import {
  DB01_COLLECTION_AREA_SOURCE_CONFIGS,
} from './collection-area-source-config.ts';
import type {
  Db01NativeAreaHasTagsEvidence,
} from './collection-area-native-routing.ts';

export const DB01_ORIGINAL_HAS_TAG_CONTRACT=
  'wand.db01.native-has-tag-steam-1262@1' as const;

export const DB01_HAS_TAG_ORIGINAL_SET_SHA256=
  '3682f4888244a9a460d08300a00cc873307c9ad3553fb929aaca135efb38708f' as const;
export const DB01_HAS_TAG_GAMEASSEMBLY_SHA256=
  'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653' as const;
export const DB01_HAS_TAG_IL2CPP_SHA256=
  '0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08' as const;

/** Complete SetItemData lookup, already performed against original Set data.
 * 'missing' is allowed ONLY when an actual ItemDatabase lookup was negative,
 * not when a lazy/private asset has not been loaded.
 */
export type Db01NativeHasSetLookup=
  | Readonly<{kind:'not_ihas_set'}>
  | Readonly<{
      kind:'has_set';
      setItemId:number;
      definition:
        | Readonly<{kind:'missing_original_set_definition'}>
        | Readonly<{
            kind:'original_set_definition';
            itemId:number;
            /** SetItemData.Tags (native field 6); must be source verified. */
            nativeTags:readonly number[];
          }>;
    }>;

export interface Db01OriginalHasTagItem{
  readonly itemId:number;
  readonly gameVersion:'1.26.2';
  /** IHasTags.Tags from the *exact* owning class field, not a union of
   * arbitrary repeated fields of the protobuf item record. */
  readonly nativeTags:readonly number[];
  readonly setLookup:Db01NativeHasSetLookup;
}

export interface Db01OriginalHasTagResult{
  readonly itemId:number;
  readonly requestedTagId:number;
  readonly matches:boolean;
  readonly matchingSource:'item_tags'|'set_item_tags'|'not_found';
  readonly nativeHasTagAlgorithmVerified:true;
  /** This bit cannot be set from only the algorithm or public TypeScript. */
  readonly runtimeInputVerified:false;
  readonly gameCollectionAreaMembershipVerified:false;
  readonly dlcEntitlementVerified:false;
}

const nonnegative=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const positive=(v:unknown):v is number=>nonnegative(v)&&v>0;

function validateTags(value:unknown,what:string):asserts value is readonly number[]{
  if(!Array.isArray(value)||value.length>10000||
    value.some(tag=>!nonnegative(tag))||
    new Set(value).size!==value.length){
    throw new Error('DB01_ORIGINAL_HAS_TAG_INVALID_'+what);
  }
}
export function validateOriginalHasTagItem(
  input:Db01OriginalHasTagItem,
):void{
  if(!input||typeof input!=='object'||!positive(input.itemId)||
    input.gameVersion!=='1.26.2'){
    throw new Error('DB01_ORIGINAL_HAS_TAG_INPUT_VERSION_OR_ID');
  }
  validateTags(input.nativeTags,'ITEM_TAGS');
  const set=input.setLookup;
  if(!set||typeof set!=='object'||(
    set.kind!=='not_ihas_set'&&set.kind!=='has_set')){
    throw new Error('DB01_ORIGINAL_HAS_TAG_SET_LOOKUP_REQUIRED');
  }
  if(set.kind==='has_set'){
    if(!nonnegative(set.setItemId)||!set.definition||
      typeof set.definition!=='object'){
      throw new Error('DB01_ORIGINAL_HAS_TAG_SET_REFERENCE_INVALID');
    }
    if(set.definition.kind==='original_set_definition'){
      if(!positive(set.definition.itemId)||
        set.definition.itemId!==set.setItemId){
        throw new Error('DB01_ORIGINAL_HAS_TAG_SET_IDENTITY_MISMATCH');
      }
      validateTags(set.definition.nativeTags,'SET_TAGS');
    }else if(set.definition.kind!=='missing_original_set_definition'){
      throw new Error('DB01_ORIGINAL_HAS_TAG_SET_LOOKUP_INCOMPLETE');
    }
  }
}

/** Replays exactly the direct-tag OR IHasSet.SetItemData.Tags membership
 * branches. True matches are sufficient for a native HasTag predicate;
 * absence is conclusive only because the caller supplied a COMPLETE Set
 * lookup, including an explicit verified missing-definition result.
 */
export function evaluateOriginalNativeHasTag(
  item:Db01OriginalHasTagItem,tagId:number,
):Readonly<Db01OriginalHasTagResult>{
  validateOriginalHasTagItem(item);
  if(!nonnegative(tagId)){
    throw new Error('DB01_ORIGINAL_HAS_TAG_REQUESTED_TAG_ID');
  }
  let source:Db01OriginalHasTagResult['matchingSource']='not_found';
  if(item.nativeTags.includes(tagId)){
    source='item_tags';
  }else if(item.setLookup.kind==='has_set'&&
    item.setLookup.definition.kind==='original_set_definition'&&
    item.setLookup.definition.nativeTags.includes(tagId)){
    source='set_item_tags';
  }
  return Object.freeze({
    itemId:item.itemId,requestedTagId:tagId,
    matches:source!=='not_found',
    matchingSource:source,
    nativeHasTagAlgorithmVerified:true,
    runtimeInputVerified:false,
    gameCollectionAreaMembershipVerified:false,
    dlcEntitlementVerified:false,
  });
}

/** Infer only non-zero *source gameplay-tag* matches. The area=0 config
 * does not have a positive GameplayTagID, and its native getter uses a
 * separate static default Item. That value must be verified independently.
 * A null AllAreas result may NEVER be coerced to false.
 */
export interface Db01OriginalPositiveAreaTagEvidence{
  readonly itemId:number;
  readonly byPositiveAreaCode:Readonly<Record<number,boolean>>;
  readonly allAreasNativeDefaultItemMatch:null;
  readonly nativeRoutingFullyEvaluated:false;
  readonly nativeItemToCollectionAreaMembershipVerified:false;
}
export function evaluateOriginalPositiveAreaTags(
  item:Db01OriginalHasTagItem,
):Readonly<Db01OriginalPositiveAreaTagEvidence>{
  validateOriginalHasTagItem(item);
  const rows=DB01_COLLECTION_AREA_SOURCE_CONFIGS
    .filter(config=>config.gameplayTagId>0)
    .map(config=>[config.areaCode,
      evaluateOriginalNativeHasTag(item,config.gameplayTagId).matches] as const);
  return Object.freeze({
    itemId:item.itemId,
    byPositiveAreaCode:Object.freeze(Object.fromEntries(rows)),
    allAreasNativeDefaultItemMatch:null,
    nativeRoutingFullyEvaluated:false,
    nativeItemToCollectionAreaMembershipVerified:false,
  });
}

/** Bridge to GetAreaConfigs ONLY when the exact native default Item
 * returned by CollectionAreaConfig.GameplayTag has also been resolved from
 * version-correct IL2CPP static metadata. Do not guess that it is zero.
 */
export function completeOriginalAreaHasTagEvidence(
  partial:Readonly<Db01OriginalPositiveAreaTagEvidence>,
  allAreasDefaultMatch:boolean,
):Db01NativeAreaHasTagsEvidence{
  if(!partial||
    partial.nativeRoutingFullyEvaluated!==false||
    partial.allAreasNativeDefaultItemMatch!==null||
    !Number.isSafeInteger(partial.itemId)||partial.itemId<=0||
    typeof allAreasDefaultMatch!=='boolean'){
    throw new Error('DB01_ORIGINAL_HAS_TAG_INVALID_DEFAULT_EVIDENCE');
  }
  const codes=DB01_COLLECTION_AREA_SOURCE_CONFIGS
    .filter(config=>config.gameplayTagId>0)
    .map(config=>config.areaCode);
  const matches=partial.byPositiveAreaCode;
  if(!matches||Reflect.ownKeys(matches).length!==codes.length||
    codes.some(code=>!Object.prototype.hasOwnProperty.call(matches,code)||
      typeof matches[code]!=='boolean')){
    throw new Error('DB01_ORIGINAL_HAS_TAG_INCOMPLETE_AREA_EVIDENCE');
  }
  return Object.freeze({
    kind:'native_has_tag_evaluated',
    matchesByArea:Object.freeze({...matches,0:allAreasDefaultMatch}),
  });
}
