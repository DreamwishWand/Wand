/**
 * DB-02 native dynamic-price cache lifecycle, Steam original v1.26.2.
 *
 * In original SHA-pinned GameAssembly.dll, IProtobufOnBinarize.OnBinarize
 * tail-jumps to DynamicItemPriceDatase.CacheData; CacheData constructs
 * a NEW ItemPriceDatabase and stores it into CachedData. This is evidence
 * of a mutation PATH, never evidence that it ran during gameplay.
 *
 * Source and hypothetical rebuilt snapshots are kept separate. No item
 * prices are inferred, and no original game records are bundled.
 */
export const DB02_NATIVE_DYNAMIC_CACHE_LIFECYCLE_CONTRACT=
  'wand.db02.native-dynamic-cache-lifecycle@1';
const freeze=Object.freeze;
const fail=reason=>{throw new TypeError('DB02_NATIVE_DYNAMIC_CACHE_LIFECYCLE_'+reason);};
const requireValid=(condition,code)=>{if(!condition)fail(code);};
const safeRows=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000;

const ASSUMPTIONS=freeze([
  'native_OnBinarize_actually_invoked',
  'CacheData_completes_without_exception',
  'rebuild_has_the_hypothetically_supplied_row_count',
  'the_same_dynamic_provider_instance_is_selected_after_rebuild'
]);

/**
 * A pure lifecycle projection. The optional hypothetical number is NOT a
 * measured runtime cache size and must not be rendered as one.
 *
 * @param {{
 *   sourceCacheGate?:object|null,
 *   hypotheticalRebuiltItemPriceRows?:number|null
 * }} input
 */
export function classifyNativeDynamicCacheLifecycle(input={}){
  requireValid(input&&typeof input==='object'&&!Array.isArray(input),
    'INVALID_INPUT');
  const {sourceCacheGate=null,hypotheticalRebuiltItemPriceRows=null}=input;
  requireValid(sourceCacheGate===null||(
    sourceCacheGate&&typeof sourceCacheGate==='object'&&
    sourceCacheGate.contract==='wand.db02.dynamic-source-cache-gate@1'&&
    sourceCacheGate.nativeGateVerifiedSteam1262===true&&
    sourceCacheGate.staticSnapshotOnly===true&&
    typeof sourceCacheGate.cachedDataPresent==='boolean'&&
    safeRows(sourceCacheGate.serializedItemPricesCount)&&
    typeof sourceCacheGate.sourceDataCached==='boolean'&&
    sourceCacheGate.sourceDataCached===(
      sourceCacheGate.cachedDataPresent&&
      sourceCacheGate.serializedItemPricesCount>0)
  ),'INVALID_SOURCE_GATE');
  requireValid(hypotheticalRebuiltItemPriceRows===null||(
    safeRows(hypotheticalRebuiltItemPriceRows)&&
    sourceCacheGate!==null),'INVALID_HYPOTHETICAL_REBUILD');
  const originalLoaded=sourceCacheGate!==null;
  const scenarioProvided=hypotheticalRebuiltItemPriceRows!==null;
  const hypotheticalCached=scenarioProvided?
    hypotheticalRebuiltItemPriceRows>0:null;
  return freeze({
    contract:DB02_NATIVE_DYNAMIC_CACHE_LIFECYCLE_CONTRACT,
    platform:'Steam',gameVersion:'1.26.2',
    sourceSnapshotLoaded:originalLoaded,
    originalSourceSerializedCacheRows:sourceCacheGate?.
      serializedItemPricesCount??null,
    originalSourceDataCachedByNativeRule:sourceCacheGate?.
      sourceDataCached??null,
    sourceInputIndependentlyAuthenticatedByThisFunction:false,
    nativeOnBinarizeDirectlyDelegatesToCacheData:true,
    nativeCacheDataAllocatesFreshItemPriceDatabase:true,
    nativeCacheDataReplacesCachedDataField:true,
    nativeCacheDataTraversesOriginalFormulaReferences:true,
    nativeCacheDataEvaluatesSellFormulaEligibility:true,
    nativeCacheDataCallsSellFormulaCalculator:true,
    // Direct E8/E9 transfer census of the full original Steam IL2CPP
    // executable section, independently pinned by the local audit.
    // Interface calls are indirect and are NOT counted.
    originalNativeInitCallsProtoDatabaseConstructor:true,
    originalNativeReInitCallsProtoDatabaseConstructor:true,
    originalNativeProtoDatabaseConstructorTailCallsRefresh:true,
    originalNativeProtoDatabaseRefreshCallsLoadBinary:true,
    originalNativeLoadBinaryResolvesSerializedType:true,
    originalNativeExportForBuildCallsSaveBinary:true,
    originalNativeSaveBinaryChecksProtoDescMessageRuntimeType:true,
    originalNativeSaveBinaryHasConditionalInterfaceSlotDispatch:true,
    originalSaveBinaryDispatchedInterfaceIdentityVerified:false,
    originalNativeTrySellPriceUsesProtoDatabaseEnumerator:true,
    originalNativeDirectTransfersToOnBinarize:0,
    originalNativeDirectTransfersToCacheData:1,
    originalDirectTransferCensusExcludesInterfaceDispatch:true,
    nativeOnBinarizeInvokedByLoadBinaryVerified:false,
    nativeOnBinarizeInvokedByExportForBuildVerified:false,
    nativeActualProtoDatabasePopulationOrderVerified:false,
    nativeRuntimeProtoDatabaseReloadOccurred:null,
    conditionalSourceRowContentsAreNotImmutableAfterRebuild:true,
    hypotheticalRebuildSpecified:scenarioProvided,
    hypotheticalRebuiltItemPriceRows:
      hypotheticalRebuiltItemPriceRows,
    hypotheticalNativeDataCachedAfterRebuild:hypotheticalCached,
    hypotheticalUncachedSellFormulaPathEligibleAfterRebuild:
      hypotheticalCached===null?null:!hypotheticalCached,
    hypotheticalProviderQueryMayUseDifferentRowsAfterRebuild:
      scenarioProvided?true:null,
    unverifiedRuntimeRebuildAssumptions:ASSUMPTIONS,
    nativeRuntimeOnBinarizeInvoked:null,
    nativeRuntimeCacheDataInvoked:null,
    nativeRuntimeCacheRowCount:null,
    nativeRuntimeCacheMatchesOriginalSnapshot:null,
    nativeRuntimeUncachedFormulaBranchTaken:null,
    nativeRuntimeSelectedPriceProvider:null,
    actualIngredientOrMealSellPrice:null,
    authorizedForDisplayAsSellPrice:false,
    publishable:false,writable:false
  });
}
