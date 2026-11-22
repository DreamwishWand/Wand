/** Binary-backed Steam/Switch v1.26.2 meal price source routing only. */
import type {SerializedMealStateEvidence} from './meal-price-evidence.mjs';
export declare const DB02_NATIVE_MEAL_PRICE_ROUTE_CONTRACT:
  'wand.db02.native-meal-price-route@1';
export declare const NATIVE_MEAL_SOFT_SELL_LOOKUP_DEFAULT:1;
export interface NativeMealSellPriceRoute {
  readonly contract:typeof DB02_NATIVE_MEAL_PRICE_ROUTE_CONTRACT;
  readonly ingredientSource:'recorded_ingredients_used'|'recipe_lowest_price_ingredients';
  readonly recordedIngredientIds:readonly number[]|null;
  readonly recordedIngredientCount:number;
  readonly missingOrEmptyMealStateInvokesLowestPriceRecipeFallback:boolean;
  readonly fallbackSelectionRequiresNativeItemPrices:boolean;
  readonly preservesRepeatedRecordedItemIds:true;
  readonly nativeIngredientLookupMethod:'ItemPriceDatabases.GetSoftCurrencySellPrice';
  readonly nativeIngredientLookupState:null;
  readonly nativeDefaultSoftSellIfLookupFails:1;
  readonly defaultRequiresActualNativeLookupFailure:true;
  readonly absentStaticSellDefinitionNotEquivalentToNativeLookupFailure:true;
  readonly absentDynamicCacheSellRowNotEquivalentToNativeLookupFailure:true;
  readonly wrapperMethod:'MealItemData.TotalIngredientsSellPrice';
  readonly wrapperBaseValueSelector:null;
  readonly wrapperMaximumValueSelector:null;
  readonly wrapperUnconfiguredBaseValue:0;
  readonly wrapperUnconfiguredUpperBound:2147483647;
  readonly wrapperBonusValueSelector:'CookingData.RecipeStarResult.SellPriceIngredientPercentage';
  readonly binaryRouteVerifiedSteam1262:true;
  readonly binaryRouteVerifiedSwitch1262:true;
  readonly sourceItemStateSerializedOnly:true;
  readonly originalNativeIngredientLookupSucceeded:null;
  readonly originalNativeIngredientPriceAmounts:null;
  readonly originalRecipeMatched:false;
  readonly ingredientAdjustmentEligibilityVerified:false;
  readonly fullMealPriceComputed:false;
  readonly actualMealSellPrice:null;
  readonly publishable:false;
  readonly writable:false;
}
export declare function classifyNativeMealSellPriceRoute(
  state:SerializedMealStateEvidence
):NativeMealSellPriceRoute;
