/**
 * DB-02 Steam v1.26.2 original cooking member selector projection.
 *
 * Source CookingIngredientType (20014...) and IHasTags.Tags (20012...) are
 * DIFFERENT namespaces. Both are named "anyTag" in historical recipe JSON.
 * Verified candidates are only from three original source-native classes:
 * CropItemData, FishItemData and IngredientItemData. Nothing in this index
 * proves stock, runtime eligibility, player inventory or a finished recipe.
 */
import {
  hasPinnedNativeRecipeEvidence,
  type NativeRecipeIndex,type NativeRecipeIngredient
} from './public-native-recipes.ts';

export const DB02_PUBLIC_COOKING_MEMBERS_SCHEMA=
  'wand.db02.public-cooking-members@1' as const;
export const DB02_PUBLIC_COOKING_MEMBERS_FILE=
  'cooking-members-1.26.2.json' as const;
export const DB02_PUBLIC_COOKING_MEMBERS_BYTES=20065 as const;
export const DB02_PUBLIC_COOKING_MEMBERS_SHA=
  '8b54025011fb056e634fee16e45fb7db20fa720c4d6c090fb2696a93023ca46a' as const;
const ITEM_SHA='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2';
const ACTIVITY_SHA='2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296';
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const ITEM_ID=/^[1-9][0-9]{0,15}$/;
const TYPE_MIN=2001400000,TYPE_MAX=2001500000;
const TAG_MIN=2001200000,TAG_MAX=2001300000;
const FAMILIES=Object.freeze([
  ['CropItemData',302,11,30],
  ['FishItemData',310,10,14],
  ['IngredientItemData',311,8,13]
] as const);
const SCOPED=new WeakSet<object>();
const EMPTY_IDS=Object.freeze([]) as readonly string[];
const EMPTY_MEMBERS=Object.freeze([]) as readonly NativeCookingSelectorCandidate[];
const EMPTY_USES=Object.freeze([]) as readonly NativeRecipeIngredientCandidateUse[];
const EMPTY_OPTIONS=Object.freeze([]) as readonly NativeRecipeIngredientOptions[];
export type NativeCookingMemberClass=typeof FAMILIES[number][0];
export type NativeCookingSelectorKind='cooking_ingredient_type'|'item_tag';
export interface NativeCookingMember{
  readonly itemId:string;
  readonly nativeClass:NativeCookingMemberClass;
  readonly cookingIngredientTypeId:string;
  readonly tagIds:readonly string[];
  readonly sourceItemIdField:1;
  readonly originalClassFieldNumber:number;
  readonly originalTagFieldNumber:number;
  readonly sourceOriginalSha256:typeof ITEM_SHA;
  readonly sourceObservedOnly:true;
  readonly liveAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface NativeCookingSelectorCandidate{
  readonly itemId:string;
  readonly nativeClass:NativeCookingMemberClass;
  readonly selectorId:string;
  readonly matchedBy:NativeCookingSelectorKind;
  readonly originalSourceSha256:typeof ITEM_SHA;
  readonly observedMembershipOnly:true;
  readonly runtimeEligibilityVerified:false;
  readonly liveAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface NativeCookingMemberIndex {
  readonly schema:typeof DB02_PUBLIC_COOKING_MEMBERS_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly originalItemSha256:typeof ITEM_SHA;
  readonly originalActivitySha256:typeof ACTIVITY_SHA;
  readonly coverage:Readonly<{
    sourceActivityItemDefinitions:4050;
    observedCookingMembers:469;
    observedCropItems:165;
    observedFishItems:103;
    observedIngredientItems:201;
    observedTypeIds:13;
    observedTagIds:21;
    observedTypeMemberships:469;
    observedTagMemberships:580;
    recipeSelectorUses:238;
    recipeSelectorIdsReferenced:13;
    recipeSelectorIdsWithObservedMembers:13;
    recipeSelectorIdsWithoutObservedMembers:0;
    allCookingItemClassesCovered:false;
    liveAvailabilityVerified:false;
    playerOwnershipVerified:false;
    runtimeIngredientEligibilityVerified:false;
  }>;
  readonly members:readonly NativeCookingMember[];
  readonly recipeReferencedSelectors:readonly string[];
  getItemMember(itemId:string|number):NativeCookingMember|null;
  getSelectorCandidates(selectorId:string|number):readonly NativeCookingSelectorCandidate[];
  getSelectorCandidateItemIds(selectorId:string|number):readonly string[];
  getObservedSelectorIds(kind?:NativeCookingSelectorKind):readonly string[];
}
export interface NativeRecipeIngredientOptions{
  readonly recipeId:string;
  readonly resultItemId:string;
  readonly ingredientIndex:number;
  readonly originalIngredient:NativeRecipeIngredient;
  readonly selectorIds:readonly string[];
  readonly candidateItemIds:readonly string[];
  readonly resolution:'explicit_item'|'explicit_item_alternatives'|
    'observed_native_selector_candidates'|'no_observed_native_selector_members';
  readonly materialChoiceRequired:boolean;
  readonly memberClassCoverage:'three_observed_cooking_native_classes'|'not_applicable';
  readonly ingredientAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly playerChoiceVerified:false;
}
export interface NativeRecipeIngredientCandidateUse{
  readonly recipeId:string;
  readonly resultItemId:string;
  readonly ingredientIndex:number;
  readonly match:'fixed_recipe_item'|'recipe_item_alternative'|'native_selector_candidate';
  readonly matchedSelectorIds:readonly string[];
  readonly ingredientAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly candidateOnly:boolean;
}
export interface NativeCookingRecipeResolver{
  readonly schema:'wand.db02.native-cooking-recipe-resolver@1';
  readonly gameVersion:'1.26.2';
  readonly memberScope:'three_observed_cooking_native_classes';
  readonly sourceRecipeDefinitions:1943;
  readonly recipeSelectorUses:238;
  readonly recipeSelectorIdsResolved:13;
  readonly playerInventoryVerified:false;
  getRecipeIngredientOptions(
    recipeId:string|number
  ):readonly NativeRecipeIngredientOptions[]|null;
  getRecipeIngredientOption(
    recipeId:string|number,ingredientIndex:number
  ):NativeRecipeIngredientOptions|null;
  getItemRecipeUses(itemId:string|number):readonly NativeRecipeIngredientCandidateUse[];
}
function check(condition:unknown,code:string):asserts condition{
  if(!condition)throw new TypeError('DB02_PUBLIC_COOKING_'+code);
}
function object(raw:unknown):raw is Record<string,unknown>{
  return raw!==null&&typeof raw==='object'&&!Array.isArray(raw);
}
function numberId(value:unknown):number{
  const number=typeof value==='number'&&Number.isSafeInteger(value)
    ?value:typeof value==='string'&&ITEM_ID.test(value)?Number(value):NaN;
  check(Number.isSafeInteger(number)&&number>0&&String(number)===String(value),
    'INVALID_ITEM_ID');
  return number;
}
function id(value:unknown):string{return String(numberId(value));}
function checkKind(raw:unknown):NativeCookingSelectorKind {
  const n=numberId(raw);
  check(n>=TAG_MIN&&n<TAG_MAX||n>=TYPE_MIN&&n<TYPE_MAX,'INVALID_SELECTOR_ID');
  return n>=TYPE_MIN?'cooking_ingredient_type':'item_tag';
}
function add<T>(map:Map<string,T[]>,key:string,row:T):void{
  const prior=map.get(key);
  if(prior)prior.push(row);else map.set(key,[row]);
}
function frozenRows<T>(map:Map<string,T[]>):void{
  for(const rows of map.values())Object.freeze(rows);
}
function frozenIds(ids:Iterable<string>):readonly string[]{
  return Object.freeze([...new Set(ids)].sort((a,b)=>Number(a)-Number(b)));
}
function parse(raw:unknown):NativeCookingMemberIndex{
  check(object(raw)&&raw.schema===DB02_PUBLIC_COOKING_MEMBERS_SCHEMA&&
    object(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&object(raw.source)&&
    raw.source.activityItemFile==='ddv_Data/StreamingAssets/itemlist/ActivityItem.json'&&
    raw.source.activityItemSha256===ITEM_SHA&&
    raw.source.activityItemBytes===1339476&&
    raw.source.activityDataFile==='ddv_Data/StreamingAssets/itemlist/ActivityData.json'&&
    raw.source.activityDataSha256===ACTIVITY_SHA&&
    raw.source.activityDataBytes===260627&&
    object(raw.familyFields)&&
    JSON.stringify(raw.familyFields)===
      '{"0":["CropItemData",302,11,30],"1":["FishItemData",310,10,14],"2":["IngredientItemData",311,8,13]}'&&
    object(raw.coverage)&&
    Array.isArray(raw.recipeSelectors)&&raw.recipeSelectors.length===13&&
    Array.isArray(raw.members)&&raw.members.length===469,'SOURCE_SCHEMA');
  const c=raw.coverage;
  check(c.sourceActivityItemDefinitions===4050&&
    c.observedCookingMembers===469&&c.observedCropItems===165&&
    c.observedFishItems===103&&c.observedIngredientItems===201&&
    c.observedTypeIds===13&&c.observedTagIds===21&&
    c.observedTypeMemberships===469&&c.observedTagMemberships===580&&
    c.recipeSelectorUses===238&&c.recipeSelectorIdsReferenced===13&&
    c.recipeSelectorIdsWithObservedMembers===13&&
    c.recipeSelectorIdsWithoutObservedMembers===0&&
    c.allCookingItemClassesCovered===false&&
    c.liveAvailabilityVerified===false&&
    c.playerOwnershipVerified===false&&
    c.runtimeIngredientEligibilityVerified===false,'SOURCE_CENSUS');
  const members:NativeCookingMember[]=[];
  const byItem=new Map<string,NativeCookingMember>();
  const selectors=new Map<string,NativeCookingSelectorCandidate[]>();
  const types=new Set<string>(),tags=new Set<string>();
  const clsCount=[0,0,0];
  let last=0,tagRelations=0;
  for(const tuple of raw.members){
    check(Array.isArray(tuple)&&tuple.length===4&&
      typeof tuple[0]==='number'&&Number.isSafeInteger(tuple[0])&&
      tuple[0]>last,'MEMBER_ID_ORDER');
    last=tuple[0];
    const itemId=id(tuple[0]);
    const cls=tuple[1];
    check(typeof cls==='number'&&Number.isInteger(cls)&&cls>=0&&cls<=2,
      'MEMBER_CLASS');
    const spec=FAMILIES[cls];
    check(Math.floor(tuple[0]/100000)===spec[1],'MEMBER_FAMILY_ID');
    const typeId=id(tuple[2]);
    check(checkKind(tuple[2])==='cooking_ingredient_type','MEMBER_TYPE');
    check(Array.isArray(tuple[3])&&tuple[3].length<=64,'MEMBER_TAGS');
    const tagIds:string[]=[];
    let prior=0;
    for(const rawTag of tuple[3]){
      check(typeof rawTag==='number'&&rawTag>prior,'SORTED_UNIQUE_TAGS');
      check(checkKind(rawTag)==='item_tag','MEMBER_TAG_TYPE');
      tagIds.push(id(rawTag));
      tags.add(id(rawTag));
      prior=rawTag;
    }
    const member:NativeCookingMember=Object.freeze({
      itemId,nativeClass:spec[0],cookingIngredientTypeId:typeId,
      tagIds:Object.freeze(tagIds),
      sourceItemIdField:1 as const,originalClassFieldNumber:spec[2],
      originalTagFieldNumber:spec[3],
      sourceOriginalSha256:ITEM_SHA,sourceObservedOnly:true as const,
      liveAvailabilityVerified:false as const,playerOwnershipVerified:false as const
    });
    members.push(member);
    byItem.set(itemId,member);
    types.add(typeId);
    clsCount[cls]++;
    tagRelations+=tagIds.length;
    for(const [selector,matchedBy] of [
      [typeId,'cooking_ingredient_type'],
      ...tagIds.map(tag=>[tag,'item_tag'])
    ] as Array<[string,NativeCookingSelectorKind]>){
      add(selectors,selector,Object.freeze({
        itemId,nativeClass:spec[0],selectorId:selector,matchedBy,
        originalSourceSha256:ITEM_SHA,
        observedMembershipOnly:true as const,
        runtimeEligibilityVerified:false as const,
        liveAvailabilityVerified:false as const,
        playerOwnershipVerified:false as const
      }));
    }
  }
  check(clsCount[0]===165&&clsCount[1]===103&&clsCount[2]===201&&
    types.size===13&&tags.size===21&&tagRelations===580&&
    members.length===469&&byItem.size===469,'NATIVE_MEMBERSHIP_TOTALS');
  frozenRows(selectors);
  const candidateIds=new Map<string,readonly string[]>();
  for(const [key,rows] of selectors)candidateIds.set(key,frozenIds(rows.map(r=>r.itemId)));
  const recipeSelectors:string[]=[];
  let lastSelector=0;
  for(const rawId of raw.recipeSelectors){
    check(typeof rawId==='number'&&rawId>lastSelector,
      'SORTED_RECIPE_SELECTORS');
    checkKind(rawId);
    const key=id(rawId);
    check((selectors.get(key)?.length??0)>0,'UNRESOLVED_RECIPE_SELECTOR');
    recipeSelectors.push(key);
    lastSelector=rawId;
  }
  check(recipeSelectors.length===13,'RECIPE_SELECTOR_COUNT');
  const observedTypeIds=frozenIds(types);
  const observedTagIds=frozenIds(tags);
  const result:NativeCookingMemberIndex=Object.freeze({
    schema:DB02_PUBLIC_COOKING_MEMBERS_SCHEMA,gameVersion:'1.26.2' as const,
    originalItemSha256:ITEM_SHA,originalActivitySha256:ACTIVITY_SHA,
    coverage:Object.freeze({
      sourceActivityItemDefinitions:4050 as const,
      observedCookingMembers:469 as const,observedCropItems:165 as const,
      observedFishItems:103 as const,observedIngredientItems:201 as const,
      observedTypeIds:13 as const,observedTagIds:21 as const,
      observedTypeMemberships:469 as const,observedTagMemberships:580 as const,
      recipeSelectorUses:238 as const,recipeSelectorIdsReferenced:13 as const,
      recipeSelectorIdsWithObservedMembers:13 as const,
      recipeSelectorIdsWithoutObservedMembers:0 as const,
      allCookingItemClassesCovered:false as const,
      liveAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      runtimeIngredientEligibilityVerified:false as const
    }),
    members:Object.freeze(members),
    recipeReferencedSelectors:Object.freeze(recipeSelectors),
    getItemMember(rawId:string|number){
      return byItem.get(id(rawId))??null;
    },
    getSelectorCandidates(rawId:string|number){
      const selector=id(rawId);
      checkKind(selector);
      return selectors.get(selector)??EMPTY_MEMBERS;
    },
    getSelectorCandidateItemIds(rawId:string|number){
      const selector=id(rawId);
      checkKind(selector);
      return candidateIds.get(selector)??EMPTY_IDS;
    },
    getObservedSelectorIds(kind?:NativeCookingSelectorKind){
      check(kind===undefined||kind==='cooking_ingredient_type'||kind==='item_tag',
        'INVALID_SELECTOR_KIND');
      return kind===undefined?frozenIds([...types,...tags]):
        kind==='cooking_ingredient_type'?observedTypeIds:observedTagIds;
    }
  });
  SCOPED.add(result);
  return result;
}
export function hasPinnedNativeCookingMemberEvidence(
  value:unknown
):value is NativeCookingMemberIndex{
  return value!==null&&typeof value==='object'&&SCOPED.has(value);
}
export async function loadPinnedNativeCookingMembers(
  basePath='',fetcher:typeof fetch=fetch
):Promise<NativeCookingMemberIndex>{
  check(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  check(typeof fetcher==='function','FETCH_REQUIRED');
  const response=await fetcher(basePath+'/acquisition/public/'+
    DB02_PUBLIC_COOKING_MEMBERS_FILE);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB02_PUBLIC_COOKING_MEMBERS_BYTES,'BYTES');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  check(digest===DB02_PUBLIC_COOKING_MEMBERS_SHA,'SHA');
  return parse(JSON.parse(new TextDecoder().decode(bytes)));
}
function candidateOptions(
  recipeId:string,resultItemId:string,
  original:NativeRecipeIngredient,index:number,
  source:NativeCookingMemberIndex
):NativeRecipeIngredientOptions{
  const selectorIds:string[]=[],candidates:string[]=[];
  let resolution:NativeRecipeIngredientOptions['resolution'];
  if(original.kind==='item'){
    resolution='explicit_item';
    candidates.push(original.itemId);
  }else if(original.kind==='item_alternatives'){
    resolution='explicit_item_alternatives';
    candidates.push(...original.itemIds);
  }else{
    selectorIds.push(...original.kind==='any_tag'?[original.tagId]:original.tagIds);
    for(const selector of selectorIds){
      checkKind(selector);
      candidates.push(...source.getSelectorCandidateItemIds(selector));
    }
    resolution=candidates.length?
      'observed_native_selector_candidates':'no_observed_native_selector_members';
  }
  const requiresChoice=original.kind!=='item';
  return Object.freeze({
    recipeId,resultItemId,ingredientIndex:index,
    originalIngredient:original,
    selectorIds:frozenIds(selectorIds),candidateItemIds:frozenIds(candidates),
    resolution,materialChoiceRequired:requiresChoice,
    memberClassCoverage:selectorIds.length?
      'three_observed_cooking_native_classes' as const:'not_applicable' as const,
    ingredientAvailabilityVerified:false as const,
    playerOwnershipVerified:false as const,playerChoiceVerified:false as const
  });
}
/** Exact original ActivityData + ActivityItem pairing; no player Save required. */
export function joinNativeRecipeCookingMembers(
  recipes:NativeRecipeIndex,source:NativeCookingMemberIndex
):NativeCookingRecipeResolver{
  check(hasPinnedNativeRecipeEvidence(recipes)&&
    hasPinnedNativeCookingMemberEvidence(source)&&
    recipes.gameVersion==='1.26.2'&&source.gameVersion==='1.26.2'&&
    recipes.source.sha256===source.originalActivitySha256&&
    recipes.coverage.recipeDefinitions===1943&&
    source.coverage.observedCookingMembers===469,
    'PINNED_RECIPE_AND_MEMBER_REQUIRED');
  const selectors:number[]=[];
  const byRecipe=new Map<string,readonly NativeRecipeIngredientOptions[]>();
  const uses=new Map<string,NativeRecipeIngredientCandidateUse[]>();
  for(const recipe of recipes.recipes){
    const options=Object.freeze(recipe.ingredients.map((ingredient,index)=>
      candidateOptions(recipe.recipeId,recipe.resultItemId,ingredient,index,source)
    ));
    byRecipe.set(recipe.recipeId,options);
    for(const option of options){
      if(option.selectorIds.length){
        selectors.push(...option.selectorIds.map(Number));
      }
      for(const candidate of option.candidateItemIds){
        const use:NativeRecipeIngredientCandidateUse=Object.freeze({
          recipeId:recipe.recipeId,resultItemId:recipe.resultItemId,
          ingredientIndex:option.ingredientIndex,
          match:option.resolution==='explicit_item'?'fixed_recipe_item':
            option.resolution==='explicit_item_alternatives'?
              'recipe_item_alternative':'native_selector_candidate',
          matchedSelectorIds:option.selectorIds.filter(selector=>
            source.getSelectorCandidateItemIds(selector).includes(candidate)),
          ingredientAvailabilityVerified:false as const,
          playerOwnershipVerified:false as const,
          candidateOnly:option.materialChoiceRequired
        });
        add(uses,candidate,use);
      }
    }
  }
  const recipeSelectors=frozenIds(selectors.map(String));
  check(selectors.length===238&&recipeSelectors.length===13&&
    JSON.stringify(recipeSelectors)===
      JSON.stringify(source.recipeReferencedSelectors),
    'RECIPE_SELECTOR_SOURCE_MISMATCH');
  frozenRows(uses);
  return Object.freeze({
    schema:'wand.db02.native-cooking-recipe-resolver@1' as const,
    gameVersion:'1.26.2' as const,
    memberScope:'three_observed_cooking_native_classes' as const,
    sourceRecipeDefinitions:1943 as const,recipeSelectorUses:238 as const,
    recipeSelectorIdsResolved:13 as const,playerInventoryVerified:false as const,
    getRecipeIngredientOptions(rawId:string|number){
      return byRecipe.get(id(rawId))??null;
    },
    getRecipeIngredientOption(rawId:string|number,index:number){
      check(Number.isSafeInteger(index)&&index>=0&&index<=127,'INVALID_SLOT');
      return byRecipe.get(id(rawId))?.[index]??null;
    },
    getItemRecipeUses(rawId:string|number){
      return uses.get(id(rawId))??EMPTY_USES;
    }
  });
}
