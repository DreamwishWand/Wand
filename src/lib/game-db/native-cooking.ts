/**
 * DB-00 Item-ID overlay for DB-02 SHA-pinned original cooking selectors.
 *
 * Native CookingIngredientType (20014...) is not an IHasTags Tag (20012...).
 * Member candidates are observations in three original item classes, not
 * claims of cooking eligibility, inventory, recipe unlocks or Collection UI.
 */
import {canonicalId} from './model.ts';
import type {SharedGameDatabase} from './integrated.ts';
import type {Db00SourceJoinedReader,Db00SourceJoinedItem} from './source-join.ts';
import {
  hasPinnedNativeRecipeEvidence,
  type NativeRecipeIndex,type NativeRecipe
} from '../acquisition/public-native-recipes.ts';
import {
  hasPinnedNativeCookingMemberEvidence,
  joinNativeRecipeCookingMembers,
  DB02_PUBLIC_COOKING_MEMBERS_SCHEMA,
  type NativeCookingMemberIndex,type NativeCookingMember,
  type NativeCookingSelectorCandidate,type NativeCookingSelectorKind,
  type NativeRecipeIngredientOptions,type NativeRecipeIngredientCandidateUse
} from '../acquisition/public-cooking-members.ts';

export const DB00_COOKING_INGREDIENT_CONTRACT=
  'wand.game-db.cooking-ingredient-candidates@1' as const;
const LOCALES=new Set<string>(['en','fr','it','de','es-ES','ja','zh-CN','pt-BR']);
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB00_COOKING_'+reason);
}
export interface Db00CookingMemberItem{
  readonly itemId:string;
  readonly item:Db00SourceJoinedItem;
  readonly nativeMember:NativeCookingMember|null;
  readonly originalSourceObservationOnly:true;
  readonly runtimeIngredientEligibilityVerified:false;
  readonly liveAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface Db00CookingSelectorMember{
  readonly originalSelectorCandidate:NativeCookingSelectorCandidate;
  readonly ingredient:Db00CookingMemberItem;
  readonly observedMembershipOnly:true;
  readonly playerInventoryVerified:false;
}
export interface Db00CookingIngredientOption{
  readonly sourceOption:NativeRecipeIngredientOptions;
  readonly candidates:readonly Db00CookingMemberItem[];
  readonly candidateCount:number;
  readonly playerChoiceVerified:false;
  readonly runtimeIngredientEligibilityVerified:false;
}
export interface Db00CookingRecipe{
  readonly recipe:NativeRecipe;
  readonly result:Db00SourceJoinedItem;
  readonly ingredients:readonly Db00CookingIngredientOption[];
  readonly originalRecipeAndMembersOnly:true;
  readonly recipeUnlockedVerified:false;
  readonly playerCanCookVerified:false;
  readonly playerInventoryVerified:false;
}
export interface Db00CookingItemUse{
  readonly originalUse:NativeRecipeIngredientCandidateUse;
  readonly recipeResult:Db00SourceJoinedItem;
  readonly candidateOnly:boolean;
  readonly playerInventoryVerified:false;
}
export interface Db00CookingMemberPage{
  readonly scope:'three_original_cooking_item_classes_only';
  readonly total:469;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00CookingMemberItem[];
  readonly runtimeIngredientEligibilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00CookingIngredientReader{
  readonly contract:typeof DB00_COOKING_INGREDIENT_CONTRACT;
  readonly snapshotId:string;
  readonly observedMemberIds:469;
  readonly originalRecipeSelectorUses:238;
  readonly recipeReferencedSelectorIds:13;
  readonly observedClasses:readonly ['CropItemData','FishItemData','IngredientItemData'];
  readonly playerInventoryVerified:false;
  readonly runtimeIngredientEligibilityVerified:false;
  getMember(itemId:string|number):Db00CookingMemberItem;
  /** Exact native selector ID, not its display name or guessed category. */
  getSelectorCandidates(selectorId:string|number):
    readonly Db00CookingSelectorMember[];
  getRecipe(recipeId:string|number):Db00CookingRecipe|null;
  getItemRecipeUses(itemId:string|number):readonly Db00CookingItemUse[];
  listRecipeReferencedSelectors():readonly string[];
  listObservedSelectors(kind?:NativeCookingSelectorKind):readonly string[];
  pageMembers(page?:Readonly<{offset?:number;limit?:number}>):
    Db00CookingMemberPage;
}

export function createDb00CookingIngredientReader(
  database:SharedGameDatabase,
  joined:Db00SourceJoinedReader,
  recipes:NativeRecipeIndex,
  members:NativeCookingMemberIndex
):Db00CookingIngredientReader{
  check(database?.contract==='wand.game-db.shared@1' &&
    database.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    database.itemCount===13202 &&
    database.target.platform==='Steam' &&
    database.target.gameVersion==='1.26.2' &&
    joined?.contract==='wand.game-db.source-join@1' &&
    joined.snapshotId===database.snapshotId,
    'CURRENT_ITEMLIST_REQUIRED');
  check(hasPinnedNativeRecipeEvidence(recipes) &&
    hasPinnedNativeCookingMemberEvidence(members) &&
    members.schema===DB02_PUBLIC_COOKING_MEMBERS_SCHEMA &&
    recipes.gameVersion==='1.26.2' &&
    members.gameVersion==='1.26.2' &&
    recipes.coverage.recipeDefinitions===1943 &&
    recipes.coverage.cookingRecipes===625 &&
    recipes.coverage.recipeUnlockedVerified===false &&
    recipes.source.sha256===members.originalActivitySha256 &&
    members.coverage.sourceActivityItemDefinitions===4050 &&
    members.coverage.observedCookingMembers===469 &&
    members.coverage.observedCropItems===165 &&
    members.coverage.observedFishItems===103 &&
    members.coverage.observedIngredientItems===201 &&
    members.coverage.observedTypeIds===13 &&
    members.coverage.observedTagIds===21 &&
    members.coverage.observedTypeMemberships===469 &&
    members.coverage.observedTagMemberships===580 &&
    members.coverage.recipeSelectorUses===238 &&
    members.coverage.recipeSelectorIdsReferenced===13 &&
    members.coverage.recipeSelectorIdsWithObservedMembers===13 &&
    members.coverage.recipeSelectorIdsWithoutObservedMembers===0 &&
    members.coverage.allCookingItemClassesCovered===false &&
    members.coverage.runtimeIngredientEligibilityVerified===false &&
    members.coverage.playerOwnershipVerified===false &&
    members.members.length===469 &&
    members.recipeReferencedSelectors.length===13,
    'PINNED_DB02_RECIPE_AND_MEMBERS_REQUIRED');
  const resolved=joinNativeRecipeCookingMembers(recipes,members);
  check(resolved.schema==='wand.db02.native-cooking-recipe-resolver@1' &&
    resolved.memberScope==='three_observed_cooking_native_classes' &&
    resolved.sourceRecipeDefinitions===1943 &&
    resolved.recipeSelectorUses===238 &&
    resolved.recipeSelectorIdsResolved===13 &&
    resolved.playerInventoryVerified===false,
    'CURRENT_RECIPE_RESOLVER_REQUIRED');

  function getMember(id:string|number):Db00CookingMemberItem{
    const itemId=canonicalId(id);
    const item=joined.getItem(itemId);
    const nativeMember=members.getItemMember(itemId);
    check(item.itemId===itemId&&
      item.playerOwnershipVerified===false &&
      item.currentlyAvailableVerified===false &&
      (nativeMember===null||(
        nativeMember.itemId===itemId &&
        nativeMember.sourceObservedOnly===true &&
        nativeMember.playerOwnershipVerified===false &&
        nativeMember.liveAvailabilityVerified===false)),
      'ITEM_MEMBER_SOURCE_MISMATCH');
    return Object.freeze({
      itemId,item,nativeMember,
      originalSourceObservationOnly:true as const,
      runtimeIngredientEligibilityVerified:false as const,
      liveAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      collectionUiMembershipVerified:false as const
    });
  }
  function getSelectorCandidates(selectorId:string|number):
    readonly Db00CookingSelectorMember[]{
    const candidates=members.getSelectorCandidates(canonicalId(selectorId));
    return Object.freeze(candidates.map(candidate=>{
      const ingredient=getMember(candidate.itemId);
      check(ingredient.nativeMember!==null &&
        candidate.observedMembershipOnly===true &&
        candidate.runtimeEligibilityVerified===false,
        'NATIVE_SELECTOR_MEMBER_MISMATCH');
      return Object.freeze({
        originalSelectorCandidate:candidate,
        ingredient,observedMembershipOnly:true as const,
        playerInventoryVerified:false as const
      });
    }));
  }
  function getRecipe(recipeId:string|number):Db00CookingRecipe|null{
    const recipe=recipes.getRecipe(canonicalId(recipeId));
    if(!recipe||recipe.kind!=='cooking')return null;
    const rawOptions=resolved.getRecipeIngredientOptions(recipe.recipeId);
    check(rawOptions!==null &&
      rawOptions.length===recipe.ingredients.length,
      'COOKING_RECIPE_OPTION_COUNT_MISMATCH');
    const ingredients=Object.freeze(rawOptions.map(option=>{
      check(option.recipeId===recipe.recipeId &&
        option.resultItemId===recipe.resultItemId &&
        option.ingredientAvailabilityVerified===false &&
        option.playerOwnershipVerified===false &&
        option.playerChoiceVerified===false,
        'SOURCE_RECIPE_OPTION_IDENTITY');
      const candidates=Object.freeze(option.candidateItemIds.map(getMember));
      check(candidates.every(row=>row.item.itemId===row.itemId) &&
        (option.selectorIds.length===0 ||
          candidates.every(row=>row.nativeMember!==null)) &&
        option.candidateItemIds.length===candidates.length,
        'SOURCE_SELECTOR_CANDIDATE_IDENTITY');
      return Object.freeze({
        sourceOption:option,candidates,candidateCount:candidates.length,
        playerChoiceVerified:false as const,
        runtimeIngredientEligibilityVerified:false as const
      });
    }));
    const result=joined.getItem(recipe.resultItemId);
    return Object.freeze({
      recipe,result,ingredients,
      originalRecipeAndMembersOnly:true as const,
      recipeUnlockedVerified:false as const,
      playerCanCookVerified:false as const,
      playerInventoryVerified:false as const
    });
  }
  function getItemRecipeUses(id:string|number):readonly Db00CookingItemUse[]{
    const itemId=canonicalId(id);
    const uses=resolved.getItemRecipeUses(itemId).filter(use=>
      recipes.getRecipe(use.recipeId)?.kind==='cooking');
    return Object.freeze(uses.map(use=>{
      const recipe=recipes.getRecipe(use.recipeId);
      check(recipe!==null&&recipe.resultItemId===use.resultItemId &&
        recipe.ingredients[use.ingredientIndex]!==undefined &&
        use.ingredientAvailabilityVerified===false &&
        use.playerOwnershipVerified===false,
        'ITEM_RECIPE_REVERSE_MISMATCH');
      const recipeResult=joined.getItem(use.resultItemId);
      check(recipeResult.itemId===use.resultItemId,'RECIPE_RESULT_ID_MISMATCH');
      return Object.freeze({
        originalUse:use,recipeResult,candidateOnly:use.candidateOnly,
        playerInventoryVerified:false as const
      });
    }));
  }
  function pageMembers(
    page:Readonly<{offset?:number;limit?:number}>={}
  ):Db00CookingMemberPage{
    check(page!==null&&typeof page==='object'&&!Array.isArray(page),
      'INVALID_PAGE');
    const offset=page.offset??0,limit=page.limit??72;
    check(Number.isSafeInteger(offset)&&offset>=0 &&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,'INVALID_PAGE');
    const rows=Object.freeze(members.members.slice(offset,offset+limit)
      .map(m=>getMember(m.itemId)));
    const next=offset+rows.length;
    return Object.freeze({
      scope:'three_original_cooking_item_classes_only' as const,
      total:469 as const,offset,
      nextOffset:next<469?next:null,items:rows,
      runtimeIngredientEligibilityVerified:false as const,
      playerOwnershipVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_COOKING_INGREDIENT_CONTRACT,
    snapshotId:database.snapshotId,observedMemberIds:469 as const,
    originalRecipeSelectorUses:238 as const,
    recipeReferencedSelectorIds:13 as const,
    observedClasses:Object.freeze([
      'CropItemData','FishItemData','IngredientItemData'
    ] as const),
    playerInventoryVerified:false as const,
    runtimeIngredientEligibilityVerified:false as const,
    getMember,getSelectorCandidates,getRecipe,getItemRecipeUses,
    listRecipeReferencedSelectors:()=>
      members.recipeReferencedSelectors,
    listObservedSelectors:(kind?:NativeCookingSelectorKind)=>
      members.getObservedSelectorIds(kind),
    pageMembers
  });
}
