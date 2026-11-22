/** Per-instance meal ingredients and state-dependent sell-price evidence. */
import type {StaticItemPriceDefinition} from './private-shop-prices.mjs';
import type {ConfiguredIngredientSellEvidence} from './meal-ingredient-sell-evidence.mjs';
import type {VerifiedPrivateDynamicPriceCache,NativeDynamicCacheItemLookup} from './private-dynamic-price-cache.mjs';
import type {VerifiedPrivateCookingStarSettings,NativeCookingStarResult} from './private-cooking-star-settings.mjs';
export declare const DB02_MEAL_PRICE_EVIDENCE_CONTRACT:
  'wand.db02.meal-price-evidence@1';
export interface MealIngredientAmount {
  readonly itemId:number;readonly count:number;
}
export interface SerializedMealStateEvidence {
  readonly contract:typeof DB02_MEAL_PRICE_EVIDENCE_CONTRACT;
  readonly nativeType:'Definitions.Items.ItemState';
  readonly nativeMealFieldNumber:1;
  readonly nativeIngredientsUsedFieldNumber:1;
  readonly mealDataPresent:boolean;
  readonly ingredientsRecorded:boolean;
  readonly serializedIngredientIds:readonly number[]|null;
  readonly ingredientAmounts:readonly MealIngredientAmount[];
  readonly distinctIngredientCount:number;
  readonly sourceStateOnly:true;
  readonly saveCodecVerified:false;
  readonly nativeBuildCompatibilityVerified:false;
  readonly salePrice:null;
  readonly retailPrice:null;
  readonly salePriceComputed:false;
  readonly publishable:false;
  readonly writable:false;
}
export interface PrivateMealPriceEvidence {
  readonly contract:typeof DB02_MEAL_PRICE_EVIDENCE_CONTRACT;
  readonly mealItemId:number;
  readonly platform:'Steam';
  readonly gameVersion:'1.26.2';
  readonly state:SerializedMealStateEvidence;
  readonly staticCookingRecipeIds:readonly number[];
  readonly cookingRecipeCoverage:'partial_native_extraction';
  readonly recordedIngredients:readonly MealIngredientAmount[];
  readonly sourceIngredientStaticSellEvidence:ConfiguredIngredientSellEvidence;
  readonly sourceIngredientDynamicCacheEvidence:readonly NativeDynamicCacheItemLookup[]|null;
  readonly nativeDynamicCacheSourceVerified:boolean;
  readonly dynamicCachedSellRowCannotProveEffectivePrice:true;
  readonly ingredientStaticPriceDatabaseOriginalVerified:true;
  readonly staticIngredientAmountsNotEffectiveSellValues:true;
  readonly cookingRecipeIngredientMatchVerified:false;
  readonly stateDependentSellPriceMethod:'MealItemData.GetSellPrice(ItemState,Item)';
  readonly ingredientSellPriceMethod:'MealItemData.TotalIngredientsSellPrice(RecipeItemData,IEnumerable)';
  readonly cookingStarAdjustmentField:'CookingData.RecipeStarResult.SellPriceIngredientPercentage';
  readonly nativeImplementationBodyVerified:false;
  readonly requiresActualSerializedIngredients:true;
  readonly hasSerializedIngredients:boolean;
  readonly purchasePriceSourceRows:readonly StaticItemPriceDefinition[];
  readonly purchasePriceIsNotSellPrice:true;
  readonly missingStaticSellValueMeansZero:false;
  readonly sellPrice:null;
  readonly sellPriceComputed:false;
  readonly playerStateVerified:false;
  readonly saveCodecVerified:false;
  readonly publishable:false;
  readonly writable:false;
}
export declare function decodeMealItemStateEvidence(
  bytes:Uint8Array
):SerializedMealStateEvidence;
export declare const DB02_MEAL_PRICE_VIEW_CONTRACT:
  'wand.db02.private-meal-pricing-view@1';
export interface PrivateMealPricingView {
  readonly contract:typeof DB02_MEAL_PRICE_VIEW_CONTRACT;
  readonly platform:'Steam';
  readonly gameVersion:'1.26.2';
  readonly verifiedPrivateSources:true;
  readonly currentOffersVerified:false;
  readonly realizedSellPricesVerified:false;
  readonly nativePriceFormulaEvaluated:false;
  readonly nativeStarSettingsVerified:boolean;
  readonly nativeCookingStarSettings:VerifiedPrivateCookingStarSettings|null;
  readonly nativeDynamicCacheVerified:boolean;
  readonly nativeDynamicPriceCache:VerifiedPrivateDynamicPriceCache|null;
  getSourceCachedDynamicPriceRow(itemId:number):NativeDynamicCacheItemLookup|null;
  getSourceStarResult(star:number):NativeCookingStarResult|null;
  readonly publishable:false;
  readonly writable:false;
  inspect(mealItemId:number,itemStateBytes:Uint8Array):PrivateMealPriceEvidence;
}
export declare function loadPrivateMealPricingView(input:{
  acquisitionArchiveBytes:Uint8Array;
  priceManifestBytes:Uint8Array|ArrayBuffer;
  priceFiles:Readonly<Record<string,Uint8Array|ArrayBuffer>>;
  protoDbBytes?:Uint8Array;
}):Promise<PrivateMealPricingView>;
export declare function compareMealIngredientStates(
  left:PrivateMealPriceEvidence,right:PrivateMealPriceEvidence
):Readonly<{
  mealItemId:number;
  sameSerializedIngredientMultiset:boolean;
  differentIngredientComposition:boolean;
  ingredientDifferenceCouldAffectPrice:boolean;
  pricesMayDiffer:true;
  priceEqualityVerified:false;
  pricesCompared:false;
  actualSellPrices:null;
  publishable:false;
}>;
