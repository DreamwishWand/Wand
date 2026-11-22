/** Steam/Switch 1.26.2 pure native serialized price-provider *source* simulator. */
export declare const DB02_SERIALIZED_SELL_PROVIDER_CONTRACT:
  'wand.db02.serialized-sell-provider-simulation@1';
export declare const DB02_DYNAMIC_CACHE_GATE_CONTRACT:
  'wand.db02.dynamic-source-cache-gate@1';
export interface NativeSerializedDynamicCacheGate {
  readonly contract:typeof DB02_DYNAMIC_CACHE_GATE_CONTRACT;
  readonly cachedDataPresent:boolean;
  readonly serializedItemPricesCount:number;
  readonly sourceDataCached:boolean;
  readonly nativeDataCachedRule:'cached_data_nonnull_and_item_prices_count_positive';
  readonly nativeGateVerifiedSteam1262:true;
  readonly nativeGateVerifiedSwitch1262:true;
  readonly runtimeDataCached:null;
  readonly uncachedFormulaBypassedAtRuntime:null;
  readonly staticSnapshotOnly:true;
  readonly originalLiveCacheSelected:false;
  readonly publishable:false;
}
export interface NativeSerializedCurrencyCost {
  readonly currencyId:number;
  readonly amount:number|null;
  readonly amountFieldPresent:boolean;
}
export interface NativeSerializedItemPrices {
  readonly databaseKey:string;
  readonly itemId:number;
  readonly sellValueDefinitions:readonly NativeSerializedCurrencyCost[];
}
export interface NativeSerializedProviderSimulation {
  readonly contract:typeof DB02_SERIALIZED_SELL_PROVIDER_CONTRACT;
  readonly providerKind:'static'|'dynamic';
  readonly itemId:number;
  readonly currencyId:number;
  readonly sourcePriceDatabaseKey:string|null;
  readonly cachedDataPresent:boolean|null;
  readonly sourceItemPriceRowPresent:boolean;
  readonly sourceSellCostCurrencyMatched:boolean;
  readonly sourceSellCostAmountFieldPresent:boolean|null;
  readonly conditionalNativeTryGetSellPriceSucceeded:boolean;
  readonly conditionalNativeOutPrice:number;
  readonly outParameterIsNotProofOfSuccess:boolean;
  readonly fallbackOutOneOnlyWhenDatabaseObjectExists:true;
  readonly nullDynamicCacheOutZero:boolean;
  readonly missingSerializedInt32AmountDefaultsToZero:boolean;
  readonly conditionalOnCallerSuppliedSourceRow:true;
  readonly originalRuntimeProviderRegistered:null;
  readonly originalRuntimeProviderSelected:null;
  readonly actualRuntimePriceLookupSucceeded:null;
  readonly actualSellPrice:null;
  readonly nativeStaticAndDynamicMethodBodiesVerifiedSteam1262:true;
  readonly nativeStaticAndDynamicMethodBodiesVerifiedSwitch1262:true;
  readonly sourceSnapshotNotRuntimeState:true;
  readonly publishable:false;
  readonly writable:false;
}
export declare function classifyNativeSerializedDynamicCache(input:{
  cachedDataPresent:boolean;
  serializedItemPricesCount:number;
}):NativeSerializedDynamicCacheGate;
export declare function simulateNativeSerializedSellProvider(input:{
  providerKind:'static'|'dynamic';
  itemId:number;
  currencyId:number;
  sourcePriceRow?:NativeSerializedItemPrices|null;
  cachedDataPresent?:boolean;
}):NativeSerializedProviderSimulation;
