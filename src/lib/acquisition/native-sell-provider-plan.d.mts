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
/** Original serialized Steam 1.26.2 protoDb.bin only; never a live sell quote. */
export interface NativeSerializedProviderSourceEvidence {
  readonly originalProtoDbSha256:string;
  readonly originalSourceGameVersion:'Steam 1.26.2';
  readonly staticProviderDefinitions:10;
  readonly dynamicProviderDefinitions:1;
  readonly serializedItemPriceRowCount:9537;
  readonly distinctSourceItemIds:9537;
  readonly sourceCrossProviderItemIdCollisions:0;
  readonly sourceSellItemCurrencyRecords:1192;
  readonly sourceCrossProviderSellCurrencyKeyCollisions:0;
  readonly sourceSellAmountsWithField:718;
  readonly sourceSellAmountsWithoutField:474;
  readonly sourceProviderPrecedenceCanChangeOriginalSerializedRowOwner:false;
  readonly nativeRuntimeProviderRegistrationOrderVerified:false;
  readonly nativeRuntimeRegisteredProviderSetVerified:false;
  readonly nativeRuntimeCacheUnchangedVerified:false;
  readonly observedEffectiveSellPrices:false;
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
  readonly serializedSteam1262ProviderSourceEvidence:NativeSerializedProviderSourceEvidence;
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
