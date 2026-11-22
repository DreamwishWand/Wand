import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB02_DYNAMIC_CACHE_GATE_CONTRACT,
  DB02_SERIALIZED_SELL_PROVIDER_CONTRACT,
  classifyNativeSerializedDynamicCache,
  simulateNativeSerializedSellProvider
} from '../src/lib/acquisition/native-serialized-sell-provider.mjs';
const row=(id,prices)=>({
  databaseKey:'Synthetic_Provider',itemId:id,sellValueDefinitions:prices
});
const cost=(currencyId,amount)=>({
  currencyId,amount,amountFieldPresent:amount!==null
});
const run=(providerKind,sourcePriceRow=null,opts={})=>
  simulateNativeSerializedSellProvider({
    providerKind,itemId:31100053,currencyId:80000000,
    sourcePriceRow,...opts
  });

test('native source cache gate requires CachedData plus positive ItemPrices count',()=>{
  for(const [present,count,cached] of [
    [false,0,false],[true,0,false],[true,8549,true],[true,1,true]]){
    const result=classifyNativeSerializedDynamicCache({
      cachedDataPresent:present,serializedItemPricesCount:count
    });
    assert.equal(result.contract,DB02_DYNAMIC_CACHE_GATE_CONTRACT);
    assert.equal(result.sourceDataCached,cached);
    assert.equal(result.runtimeDataCached,null);
    assert.equal(result.uncachedFormulaBypassedAtRuntime,null);
    assert.equal(result.nativeGateVerifiedSteam1262,true);
    assert.equal(result.nativeGateVerifiedSwitch1262,true);
    assert.ok(Object.isFrozen(result));
  }
});
test('native static provider missing ItemPrices row returns false out 1',()=>{
  const r=run('static');
  assert.equal(r.contract,DB02_SERIALIZED_SELL_PROVIDER_CONTRACT);
  assert.equal(r.conditionalNativeTryGetSellPriceSucceeded,false);
  assert.equal(r.conditionalNativeOutPrice,1);
  assert.equal(r.outParameterIsNotProofOfSuccess,true);
  assert.equal(r.actualSellPrice,null);
});
test('native dynamic provider with null CachedData returns false out 0',()=>{
  const r=run('dynamic',null,{cachedDataPresent:false});
  assert.equal(r.conditionalNativeTryGetSellPriceSucceeded,false);
  assert.equal(r.conditionalNativeOutPrice,0);
  assert.equal(r.nullDynamicCacheOutZero,true);
  assert.equal(r.actualRuntimePriceLookupSucceeded,null);
});
test('non-null dynamic provider without item or currency returns false out 1',()=>{
  const empty=run('dynamic',null,{cachedDataPresent:true});
  const different=run('dynamic',row(31100053,[cost(12345,20)]));
  for(const r of [empty,different]){
    assert.equal(r.conditionalNativeTryGetSellPriceSucceeded,false);
    assert.equal(r.conditionalNativeOutPrice,1);
    assert.equal(r.sourceSellCostCurrencyMatched,false);
  }
});
test('both native providers match SellPrices currency Id, not purchase Prices',()=>{
  const supplied=row(31100053,[cost(80000000,72)]);
  supplied.purchaseCostDefinitions=[cost(80000000,999)];
  for(const providerKind of ['static','dynamic']){
    const r=run(providerKind,supplied);
    assert.equal(r.conditionalNativeTryGetSellPriceSucceeded,true);
    assert.equal(r.conditionalNativeOutPrice,72);
    assert.equal(r.sourceSellCostAmountFieldPresent,true);
    assert.equal(r.sourcePriceDatabaseKey,'Synthetic_Provider');
    assert.equal(r.actualSellPrice,null);
    assert.equal(r.originalRuntimeProviderSelected,null);
    assert.equal(r.conditionalOnCallerSuppliedSourceRow,true);
    assert.ok(Object.isFrozen(r));
  }
});
test('serialized CurrencyCost.Amount absent means proto scalar default zero, not failure',()=>{
  const r=run('static',row(31100053,[cost(80000000,null)]));
  assert.equal(r.conditionalNativeTryGetSellPriceSucceeded,true);
  assert.equal(r.conditionalNativeOutPrice,0);
  assert.equal(r.sourceSellCostAmountFieldPresent,false);
  assert.equal(r.missingSerializedInt32AmountDefaultsToZero,true);
  assert.equal(r.actualSellPrice,null);
});
test('zero sell cost is a successful matched row, unlike failure out zero',()=>{
  const r=run('dynamic',row(31100053,[cost(80000000,0)]));
  const f=run('dynamic',null,{cachedDataPresent:false});
  assert.equal(r.conditionalNativeTryGetSellPriceSucceeded,true);
  assert.equal(f.conditionalNativeTryGetSellPriceSucceeded,false);
  assert.equal(r.conditionalNativeOutPrice,0);
  assert.equal(f.conditionalNativeOutPrice,0);
  assert.equal(r.actualSellPrice,null);
});
test('reject malformed original source structure, currency collision and spoofed inputs',()=>{
  for(const invalid of [
    {providerKind:'other',itemId:31100053,currencyId:80000000},
    {providerKind:'static',itemId:0,currencyId:80000000},
    {providerKind:'static',itemId:31100053,currencyId:0},
    {providerKind:'static',itemId:31100053,currencyId:80000000,cachedDataPresent:false},
    {providerKind:'dynamic',itemId:31100053,currencyId:80000000,cachedDataPresent:false,
      sourcePriceRow:row(31100053,[])},
    {providerKind:'static',itemId:31100053,currencyId:80000000,
      sourcePriceRow:row(31100054,[])},
    {providerKind:'static',itemId:31100053,currencyId:80000000,
      sourcePriceRow:row(31100053,[cost(80000000,3),cost(80000000,4)])},
    {providerKind:'static',itemId:31100053,currencyId:80000000,
      sourcePriceRow:row(31100053,[{...cost(80000000,5),amountFieldPresent:false}])}
  ])assert.throws(()=>simulateNativeSerializedSellProvider(invalid),
    /DB02_SERIALIZED_SELL_PROVIDER_/);
  for(const invalid of [
    {cachedDataPresent:false,serializedItemPricesCount:2},
    {cachedDataPresent:true,serializedItemPricesCount:-1},
    {cachedDataPresent:'true',serializedItemPricesCount:1},
    {cachedDataPresent:true,serializedItemPricesCount:100001}
  ])assert.throws(()=>classifyNativeSerializedDynamicCache(invalid),
    /DB02_SERIALIZED_SELL_PROVIDER_/);
});
