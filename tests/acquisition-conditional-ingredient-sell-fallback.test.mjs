import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyConditionalIngredientSoftSellFallback as conditional}
  from '../src/lib/acquisition/conditional-ingredient-sell-fallback.mjs';
import {classifyIngredientSerializedPriceRowCoverage as sourceCoverage}
  from '../src/lib/acquisition/ingredient-source-row-coverage.mjs';
import {classifyNativeSerializedDynamicCache as cacheGate}
  from '../src/lib/acquisition/native-serialized-sell-provider.mjs';
import {nativeSellPriceProviderPlan as providerPlan}
  from '../src/lib/acquisition/native-sell-provider-plan.mjs';

const lookup=(itemId,buy=false,sell=false)=>({
  itemId,serializedCacheOnly:true,originalSourceAuthenticated:true,
  cachedPurchaseRowPresent:buy,cachedSellRowPresent:sell
});
const gate=(count=8549)=>cacheGate({
  cachedDataPresent:true,serializedItemPricesCount:count
});
function result(itemId,{
  staticRows=[],dynamicLoaded=true,dynamicBuy=false,
  dynamicSell=false,dynamicRows=8549
}={}){
  return conditional({
    itemId,nativeSellProviderPlan:providerPlan(itemId),
    sourceRowCoverage:sourceCoverage({
      itemId,staticRows,
      dynamicCacheLookup:dynamicLoaded?
        lookup(itemId,dynamicBuy,dynamicSell):null
    }),
    sourceDynamicCacheGate:dynamicLoaded?gate(dynamicRows):null
  });
}

test('missing original ingredient row conditionally reaches default one',()=>{
  for(const itemId of [30200045,31000014,31100053]){
    const r=result(itemId);
    assert.equal(r.hypotheticalOriginalSourcePathStatus,
      'conditional_default_one_if_live_conditions_match');
    assert.equal(r.originalSerializedPriceRowAbsent,true);
    assert.equal(r.originalNativeClassHasNoDirectSellCalculator,true);
    assert.equal(r.nativeConditionalFallbackValueOnlyIfAssumptionsHold,1);
    assert.equal(r.originalNativeFallbackDefaultArgument,1);
    assert.equal(r.nativeRuntimeLookupFailedVerified,false);
    assert.equal(r.actualNativeFallbackSelected,null);
    assert.equal(r.actualUnitSellPrice,null);
    assert.equal(r.authorizedForDisplayAsSalePrice,false);
    assert.equal(r.publishable,false);
    assert.ok(r.unverifiedLiveRuntimeAssumptions.length>=5);
    assert.ok(Object.isFrozen(r.unverifiedLiveRuntimeAssumptions));
    assert.ok(Object.isFrozen(r));
  }
});
test('source price row exists even if source sell costs are omitted',()=>{
  const itemId=31100053;
  const r=result(itemId,{staticRows:[{
    itemId,databaseKey:'NativePriceData',purchaseCostDefinitions:[],
    sellValueDefinitions:[{currencyId:80000000,amountFieldPresent:false}]
  }]});
  assert.equal(r.hypotheticalOriginalSourcePathStatus,
    'original_price_row_present');
  assert.equal(r.nativeConditionalFallbackValueOnlyIfAssumptionsHold,null);
  assert.equal(r.actualUnitSellPrice,null);
});
test('dynamic source missing cannot prove full absence',()=>{
  const r=result(31000014,{dynamicLoaded:false});
  assert.equal(r.hypotheticalOriginalSourcePathStatus,
    'incomplete_original_source_snapshot');
  assert.equal(r.originalSerializedPriceRowAbsent,null);
  assert.equal(r.nativeConditionalFallbackValueOnlyIfAssumptionsHold,null);
});
test('the source cache may be present but no longer positive',()=>{
  const r=result(31000014,{dynamicRows:0});
  assert.equal(r.hypotheticalOriginalSourcePathStatus,
    'source_dynamic_cache_not_positive');
  assert.equal(r.nativeConditionalFallbackValueOnlyIfAssumptionsHold,null);
});
test('a meal direct calculator prevents ingredient-only inference',()=>{
  const r=result(30300005);
  assert.equal(r.hypotheticalOriginalSourcePathStatus,
    'native_item_type_or_calculator_not_supported');
  assert.equal(r.actualUnitSellPrice,null);
});
test('input evidence for a different item is rejected',()=>{
  assert.throws(()=>conditional({
    itemId:31100053,
    nativeSellProviderPlan:providerPlan(31000014),
    sourceRowCoverage:sourceCoverage({
      itemId:31100053,staticRows:[],
      dynamicCacheLookup:lookup(31100053)
    }),
    sourceDynamicCacheGate:gate()
  }),/DB02_CONDITIONAL_INGREDIENT_FALLBACK_INVALID_SOURCE_EVIDENCE/);
});
