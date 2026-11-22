/** Source-only counterfactual; not effective game sale-price evidence. */
export declare const DB02_CONDITIONAL_INGREDIENT_FALLBACK_CONTRACT:
  'wand.db02.conditional-ingredient-soft-sell-fallback@1';
export interface ConditionalIngredientSoftSellFallback {
  readonly contract:typeof DB02_CONDITIONAL_INGREDIENT_FALLBACK_CONTRACT;
  readonly itemId:number;
  readonly sourceInputIndependentlyAuthenticatedByThisFunction:false;
  readonly originalSourceSnapshotCompletelyProvided:boolean;
  readonly originalSerializedPriceRowAbsent:boolean|null;
  readonly sourceSnapshotPositiveCacheGate:boolean|null;
  readonly originalNativeClassHasNoDirectSellCalculator:boolean;
  readonly originalNativeFallbackDefaultArgument:1;
  readonly originalNativeFailureRequiredForFallback:true;
  readonly hypotheticalOriginalSourcePathStatus:
    'incomplete_original_source_snapshot'|
    'original_price_row_present'|
    'native_item_type_or_calculator_not_supported'|
    'source_dynamic_cache_not_positive'|
    'conditional_default_one_if_live_conditions_match';
  readonly nativeConditionalFallbackValueOnlyIfAssumptionsHold:1|null;
  readonly conditionalOriginalSourcePathSupportsDefaultOne:boolean;
  readonly unverifiedLiveRuntimeAssumptions:readonly string[];
  readonly nativeRuntimeRegisteredProvidersVerified:false;
  readonly nativeRuntimeCacheUnchangedVerified:false;
  readonly nativeRuntimeItemClassVerified:false;
  readonly nativeRuntimeLookupFailedVerified:false;
  readonly actualNativeFallbackSelected:null;
  readonly actualUnitSellPrice:null;
  readonly authorizedForDisplayAsSalePrice:false;
  readonly publishable:false;
  readonly writable:false;
}
export declare function classifyConditionalIngredientSoftSellFallback(input:{
  itemId:number;
  sourceRowCoverage:import('./ingredient-source-row-coverage.mjs').IngredientSourceRowCoverage;
  nativeSellProviderPlan:import('./native-sell-provider-plan.mjs').NativeSellPriceProviderPlan;
  sourceDynamicCacheGate?:import('./native-serialized-sell-provider.mjs').NativeSerializedDynamicCacheGate|null;
}):ConditionalIngredientSoftSellFallback;
