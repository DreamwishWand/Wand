import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyNativeDynamicCacheLifecycle as classify,
  DB02_NATIVE_DYNAMIC_CACHE_LIFECYCLE_CONTRACT as CONTRACT
} from '../src/lib/acquisition/native-dynamic-cache-lifecycle.mjs';
import {classifyNativeSerializedDynamicCache}
  from '../src/lib/acquisition/native-serialized-sell-provider.mjs';

const source=(rows=8549)=>classifyNativeSerializedDynamicCache({
  cachedDataPresent:true,serializedItemPricesCount:rows
});

test('original cached source is positive but runtime rebuild is unobserved',()=>{
  const plan=classify({sourceCacheGate:source()});
  assert.equal(plan.contract,CONTRACT);
  assert.equal(plan.originalSourceSerializedCacheRows,8549);
  assert.equal(plan.originalSourceDataCachedByNativeRule,true);
  assert.equal(plan.nativeOnBinarizeDirectlyDelegatesToCacheData,true);
  assert.equal(plan.nativeCacheDataAllocatesFreshItemPriceDatabase,true);
  assert.equal(plan.nativeCacheDataReplacesCachedDataField,true);
  assert.equal(plan.nativeCacheDataCallsSellFormulaCalculator,true);
  assert.equal(plan.hypotheticalRebuiltItemPriceRows,null);
  assert.equal(plan.nativeRuntimeCacheDataInvoked,null);
  assert.equal(plan.nativeRuntimeCacheMatchesOriginalSnapshot,null);
  assert.equal(plan.actualIngredientOrMealSellPrice,null);
  assert.equal(plan.authorizedForDisplayAsSellPrice,false);
  assert.equal(plan.publishable,false);
  assert.ok(Object.isFrozen(plan.unverifiedRuntimeRebuildAssumptions));
  assert.ok(Object.isFrozen(plan));
});
test('hypothetically rebuilt empty cache makes uncached formula route eligible',()=>{
  const plan=classify({sourceCacheGate:source(),
    hypotheticalRebuiltItemPriceRows:0});
  assert.equal(plan.originalSourceDataCachedByNativeRule,true);
  assert.equal(plan.hypotheticalNativeDataCachedAfterRebuild,false);
  assert.equal(plan.hypotheticalUncachedSellFormulaPathEligibleAfterRebuild,true);
  assert.equal(plan.hypotheticalProviderQueryMayUseDifferentRowsAfterRebuild,true);
  assert.equal(plan.nativeRuntimeUncachedFormulaBranchTaken,null);
  assert.equal(plan.actualIngredientOrMealSellPrice,null);
});
test('hypothetically rebuilt positive cache still may change item price rows',()=>{
  const plan=classify({sourceCacheGate:source(),
    hypotheticalRebuiltItemPriceRows:29});
  assert.equal(plan.hypotheticalNativeDataCachedAfterRebuild,true);
  assert.equal(plan.hypotheticalUncachedSellFormulaPathEligibleAfterRebuild,false);
  assert.equal(plan.conditionalSourceRowContentsAreNotImmutableAfterRebuild,true);
  assert.equal(plan.nativeRuntimeCacheMatchesOriginalSnapshot,null);
});
test('absence of original cache bytes preserves UNKNOWN, cannot project rebuild',()=>{
  const plan=classify();
  assert.equal(plan.sourceSnapshotLoaded,false);
  assert.equal(plan.originalSourceDataCachedByNativeRule,null);
  assert.equal(plan.hypotheticalRebuiltItemPriceRows,null);
  assert.equal(plan.hypotheticalUncachedSellFormulaPathEligibleAfterRebuild,null);
  assert.throws(()=>classify({hypotheticalRebuiltItemPriceRows:0}),
    /DB02_NATIVE_DYNAMIC_CACHE_LIFECYCLE_INVALID_HYPOTHETICAL_REBUILD/);
});
test('malformed or inconsistent source cache gates fail closed',()=>{
  const gate=source();
  for(const input of [
    null, [], {sourceCacheGate:{...gate,sourceDataCached:false}},
    {sourceCacheGate:{...gate,contract:'forged'}},
    {sourceCacheGate:{...gate,staticSnapshotOnly:false}},
    {sourceCacheGate:gate,hypotheticalRebuiltItemPriceRows:-1},
    {sourceCacheGate:gate,hypotheticalRebuiltItemPriceRows:1.4},
    {sourceCacheGate:gate,hypotheticalRebuiltItemPriceRows:100001}
  ])assert.throws(()=>classify(input),/DB02_NATIVE_DYNAMIC_CACHE_LIFECYCLE_/);
});
