/** Original Steam and Switch 1.26.2 native TryGetSellPrice route topology. */
export declare const DB02_NATIVE_SELL_PROVIDER_PLAN_CONTRACT:
  'wand.db02.native-sell-provider-plan@1';
export interface NativeSellPriceProviderStage {
  readonly stage:'item_specific_calculator'|'uncached_sell_formula'|'registered_item_price_databases';
  readonly nativeInterface:'IItemSellPriceCalculator'|'IItemPriceDatabase'|null;
  readonly initialCurrencyMethod:'CanCalculateForCurrency'|null;
  readonly priceMethod:string;
  readonly condition:string;
  readonly returnRule:'first_success';
}
export interface NativeSellPriceProviderPlan {
  readonly contract:typeof DB02_NATIVE_SELL_PROVIDER_PLAN_CONTRACT;
  readonly itemId:number;
  readonly nativeClassEvidence:'CropItemData'|'MealItemData'|'FishItemData'|'IngredientItemData'|null;
  readonly nativeClassFromItemFamilyOnly:true;
  readonly itemSellPriceCalculatorInterfaceInNativeMetadata:boolean|null;
  readonly itemSpecificCalculatorMayBeCalled:boolean|null;
  readonly currencyAcceptanceAtRuntime:null;
  readonly priceProviderStages:readonly NativeSellPriceProviderStage[];
  readonly knownIItemPriceDatabaseNativeTypes:readonly ['ItemPriceDatabase','DynamicItemPriceDatase'];
  readonly registeredDatabaseIterationOrderVerified:false;
  readonly runtimeDynamicCacheState:null;
  readonly nativeTrySellPriceFailureOutput:0;
  readonly nativeTrySellPriceFailureReturnsFalse:true;
  readonly outerGetSellPriceDeclaredDefaultArgument:1;
  readonly zeroOutParameterIsNotEffectiveSellPrice:true;
  readonly defaultOneAppliesOnlyAfterRuntimeLookupFailure:true;
  readonly missingConfiguredStaticRowIsNotRuntimeFailure:true;
  readonly noDynamicCacheEntryIsNotRuntimeFailure:true;
  readonly nativeTopologyVerifiedSteam1262:true;
  readonly nativeTopologyVerifiedSwitch1262:true;
  readonly runtimePriceProviderSelected:null;
  readonly liveNativeTrySellPriceSucceeded:null;
  readonly actualUnitSellPrice:null;
  readonly runtimeResolutionVerified:false;
  readonly originalBinaryDataBundled:false;
  readonly publishable:false;
}
export declare function nativeSellPriceProviderPlan(itemId:number):NativeSellPriceProviderPlan;
