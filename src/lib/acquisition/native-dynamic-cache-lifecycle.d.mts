/** Native Steam 1.26.2 cache rebuild mechanism; source-only and hypothetical. */
export declare const DB02_NATIVE_DYNAMIC_CACHE_LIFECYCLE_CONTRACT:
  'wand.db02.native-dynamic-cache-lifecycle@1';

export interface NativeDynamicCacheLifecycle {
  readonly contract:typeof DB02_NATIVE_DYNAMIC_CACHE_LIFECYCLE_CONTRACT;
  readonly platform:'Steam';
  readonly gameVersion:'1.26.2';
  readonly sourceSnapshotLoaded:boolean;
  readonly originalSourceSerializedCacheRows:number|null;
  readonly originalSourceDataCachedByNativeRule:boolean|null;
  readonly sourceInputIndependentlyAuthenticatedByThisFunction:false;
  readonly nativeOnBinarizeDirectlyDelegatesToCacheData:true;
  readonly nativeCacheDataAllocatesFreshItemPriceDatabase:true;
  readonly nativeCacheDataReplacesCachedDataField:true;
  readonly nativeCacheDataTraversesOriginalFormulaReferences:true;
  readonly nativeCacheDataEvaluatesSellFormulaEligibility:true;
  readonly nativeCacheDataCallsSellFormulaCalculator:true;
  readonly originalNativeInitCallsProtoDatabaseConstructor:true;
  readonly originalNativeReInitCallsProtoDatabaseConstructor:true;
  readonly originalNativeProtoDatabaseConstructorTailCallsRefresh:true;
  readonly originalNativeProtoDatabaseRefreshCallsLoadBinary:true;
  readonly originalNativeLoadBinaryResolvesSerializedType:true;
  readonly originalNativeExportForBuildCallsSaveBinary:true;
  readonly originalNativeSaveBinaryChecksProtoDescMessageRuntimeType:true;
  readonly originalNativeSaveBinaryHasConditionalInterfaceSlotDispatch:true;
  readonly originalSaveBinaryDispatchedInterfaceIdentityVerified:false;
  readonly originalNativeTrySellPriceUsesProtoDatabaseEnumerator:true;
  readonly originalNativeDirectTransfersToOnBinarize:0;
  readonly originalNativeDirectTransfersToCacheData:1;
  readonly originalDirectTransferCensusExcludesInterfaceDispatch:true;
  readonly nativeOnBinarizeInvokedByLoadBinaryVerified:false;
  readonly nativeOnBinarizeInvokedByExportForBuildVerified:false;
  readonly nativeActualProtoDatabasePopulationOrderVerified:false;
  readonly nativeRuntimeProtoDatabaseReloadOccurred:null;
  readonly conditionalSourceRowContentsAreNotImmutableAfterRebuild:true;
  readonly hypotheticalRebuildSpecified:boolean;
  readonly hypotheticalRebuiltItemPriceRows:number|null;
  readonly hypotheticalNativeDataCachedAfterRebuild:boolean|null;
  readonly hypotheticalUncachedSellFormulaPathEligibleAfterRebuild:boolean|null;
  readonly hypotheticalProviderQueryMayUseDifferentRowsAfterRebuild:true|null;
  readonly unverifiedRuntimeRebuildAssumptions:readonly string[];
  readonly nativeRuntimeOnBinarizeInvoked:null;
  readonly nativeRuntimeCacheDataInvoked:null;
  readonly nativeRuntimeCacheRowCount:null;
  readonly nativeRuntimeCacheMatchesOriginalSnapshot:null;
  readonly nativeRuntimeUncachedFormulaBranchTaken:null;
  readonly nativeRuntimeSelectedPriceProvider:null;
  readonly actualIngredientOrMealSellPrice:null;
  readonly authorizedForDisplayAsSellPrice:false;
  readonly publishable:false;
  readonly writable:false;
}
export declare function classifyNativeDynamicCacheLifecycle(input?:{
  sourceCacheGate?:import('./native-serialized-sell-provider.mjs')
    .NativeSerializedDynamicCacheGate|null;
  hypotheticalRebuiltItemPriceRows?:number|null;
}):NativeDynamicCacheLifecycle;
