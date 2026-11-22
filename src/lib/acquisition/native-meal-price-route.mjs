/**
 * DB-02 exact Steam/Switch v1.26.2 native *price lookup route*, not a quote.
 *
 * Original executables independently verify the same decision:
 * - if ItemState has nonempty MealData.IngredientsUsed, preserve these IDs
 *   as the ingredient list (even if the same Item ID appears multiple times);
 * - otherwise use the recipe-dependent GetLowestPriceIngredients fallback.
 * For either chosen ingredient source, native lookup uses
 * ItemPriceDatabases.GetSoftCurrencySellPrice(item, state=null, default=1).
 * 1 is returned ONLY when the live native lookup fails.
 * Neither static-price absence nor missing cache entry establishes failure.
 */
const DB02_MEAL_PRICE_EVIDENCE_CONTRACT='wand.db02.meal-price-evidence@1';

export const DB02_NATIVE_MEAL_PRICE_ROUTE_CONTRACT=
  'wand.db02.native-meal-price-route@1';
export const NATIVE_MEAL_SOFT_SELL_LOOKUP_DEFAULT=1;
const freeze=Object.freeze;
const fail=reason=>{throw new TypeError('DB02_MEAL_NATIVE_ROUTE_'+reason);};
const check=(ok,reason)=>{if(!ok)fail(reason);};
const validId=id=>Number.isSafeInteger(id)&&id>0&&id<=2147483647;
const PATH_RECORDED='recorded_ingredients_used';
const PATH_FALLBACK='recipe_lowest_price_ingredients';

/**
 * The caller must supply a decoded ItemState made by
 * decodeMealItemStateEvidence. The state alone cannot prove that the
 * candidate recipe actually matches, that native runtime lookup succeeds,
 * or that the cooking star bonus applies to any particular ingredient.
 */
export function classifyNativeMealSellPriceRoute(state){
  check(state!==null&&typeof state==='object'&&
    state.contract===DB02_MEAL_PRICE_EVIDENCE_CONTRACT&&
    typeof state.mealDataPresent==='boolean'&&
    typeof state.ingredientsRecorded==='boolean'&&
    state.nativeType==='Definitions.Items.ItemState'&&
    (state.serializedIngredientIds===null||
      Array.isArray(state.serializedIngredientIds)),
    'DECODED_ITEMSTATE_REQUIRED');
  const ids=state.serializedIngredientIds;
  check((state.mealDataPresent&&ids!==null)||
    (!state.mealDataPresent&&ids===null),
    'INCONSISTENT_MEAL_PRESENCE');
  check(ids===null||(ids.length<=32&&ids.every(validId)),
    'INVALID_SERIALIZED_INGREDIENTS');
  const useRecorded=ids!==null&&ids.length>0;
  check(state.ingredientsRecorded===useRecorded,
    'INCONSISTENT_RECORDED_FLAG');

  const source=useRecorded?PATH_RECORDED:PATH_FALLBACK;
  return freeze({
    contract:DB02_NATIVE_MEAL_PRICE_ROUTE_CONTRACT,
    ingredientSource:source,
    recordedIngredientIds:useRecorded?freeze([...ids]):null,
    recordedIngredientCount:useRecorded?ids.length:0,
    missingOrEmptyMealStateInvokesLowestPriceRecipeFallback:!useRecorded,
    fallbackSelectionRequiresNativeItemPrices:!useRecorded,
    preservesRepeatedRecordedItemIds:true,
    nativeIngredientLookupMethod:
      'ItemPriceDatabases.GetSoftCurrencySellPrice',
    nativeIngredientLookupState:null,
    nativeDefaultSoftSellIfLookupFails:NATIVE_MEAL_SOFT_SELL_LOOKUP_DEFAULT,
    defaultRequiresActualNativeLookupFailure:true,
    absentStaticSellDefinitionNotEquivalentToNativeLookupFailure:true,
    absentDynamicCacheSellRowNotEquivalentToNativeLookupFailure:true,
    wrapperMethod:'MealItemData.TotalIngredientsSellPrice',
    wrapperBaseValueSelector:null,
    wrapperMaximumValueSelector:null,
    wrapperUnconfiguredBaseValue:0,
    wrapperUnconfiguredUpperBound:2147483647,
    wrapperBonusValueSelector:
      'CookingData.RecipeStarResult.SellPriceIngredientPercentage',
    binaryRouteVerifiedSteam1262:true,
    binaryRouteVerifiedSwitch1262:true,
    sourceItemStateSerializedOnly:true,
    originalNativeIngredientLookupSucceeded:null,
    originalNativeIngredientPriceAmounts:null,
    originalRecipeMatched:false,
    ingredientAdjustmentEligibilityVerified:false,
    fullMealPriceComputed:false,
    actualMealSellPrice:null,
    publishable:false,
    writable:false
  });
}
