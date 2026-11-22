import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeSellPriceProviderPlan,
  DB02_NATIVE_SELL_PROVIDER_PLAN_CONTRACT
} from '../src/lib/acquisition/native-sell-provider-plan.mjs';

test('game native 1.26.2 ingredient classes omit custom sell calculator',()=>{
  for(const [id,klass] of [
    [30200001,'CropItemData'],[31000001,'FishItemData'],
    [31100053,'IngredientItemData']
  ]){
    const row=nativeSellPriceProviderPlan(id);
    assert.equal(row.contract,DB02_NATIVE_SELL_PROVIDER_PLAN_CONTRACT);
    assert.equal(row.nativeClassEvidence,klass);
    assert.equal(row.itemSellPriceCalculatorInterfaceInNativeMetadata,false);
    assert.equal(row.itemSpecificCalculatorMayBeCalled,false);
    assert.equal(row.liveNativeTrySellPriceSucceeded,null);
    assert.equal(row.actualUnitSellPrice,null);
    assert.equal(row.runtimeResolutionVerified,false);
    assert.ok(Object.isFrozen(row));
  }
});
test('meal items implement custom price calculator but currency gating is runtime',()=>{
  const row=nativeSellPriceProviderPlan(30300005);
  assert.equal(row.nativeClassEvidence,'MealItemData');
  assert.equal(row.itemSellPriceCalculatorInterfaceInNativeMetadata,true);
  assert.equal(row.itemSpecificCalculatorMayBeCalled,true);
  assert.equal(row.currencyAcceptanceAtRuntime,null);
  assert.equal(row.runtimePriceProviderSelected,null);
  assert.equal(row.actualUnitSellPrice,null);
});
test('unknown item classes are unknown, not mistaken for no calculator',()=>{
  const row=nativeSellPriceProviderPlan(30400005);
  assert.equal(row.nativeClassEvidence,null);
  assert.equal(row.itemSellPriceCalculatorInterfaceInNativeMetadata,null);
  assert.equal(row.itemSpecificCalculatorMayBeCalled,null);
  assert.equal(row.liveNativeTrySellPriceSucceeded,null);
  assert.equal(row.publishable,false);
});
test('native provider priority is item calculator, uncached formula, registered DBs',()=>{
  const stages=nativeSellPriceProviderPlan(31100053).priceProviderStages;
  assert.deepEqual(stages.map(x=>x.stage),[
    'item_specific_calculator',
    'uncached_sell_formula',
    'registered_item_price_databases'
  ]);
  assert.deepEqual(stages.map(x=>x.returnRule),[
    'first_success','first_success','first_success'
  ]);
  assert.equal(stages[0].nativeInterface,'IItemSellPriceCalculator');
  assert.equal(stages[1].priceMethod,
    'SellPriceFormulaItemData.GetItemSellPrice');
  assert.equal(stages[2].nativeInterface,'IItemPriceDatabase');
  assert.equal(stages[2].priceMethod,'TryGetSellPrice(Item,Item,out int)');
  assert.ok(Object.isFrozen(stages));
  for(const stage of stages)assert.ok(Object.isFrozen(stage));
});
test('uncached formulas and registered DB enumeration are not runtime proven',()=>{
  const row=nativeSellPriceProviderPlan(31100053);
  assert.deepEqual(row.knownIItemPriceDatabaseNativeTypes,[
    'ItemPriceDatabase','DynamicItemPriceDatase'
  ]);
  assert.equal(row.registeredDatabaseIterationOrderVerified,false);
  assert.equal(row.runtimeDynamicCacheState,null);
  assert.equal(row.missingConfiguredStaticRowIsNotRuntimeFailure,true);
  assert.equal(row.noDynamicCacheEntryIsNotRuntimeFailure,true);
});
test('TryGetSellPrice false has out=0 while GetSellPrice may use caller default=1',()=>{
  const row=nativeSellPriceProviderPlan(31000001);
  assert.equal(row.nativeTrySellPriceFailureReturnsFalse,true);
  assert.equal(row.nativeTrySellPriceFailureOutput,0);
  assert.equal(row.outerGetSellPriceDeclaredDefaultArgument,1);
  assert.equal(row.defaultOneAppliesOnlyAfterRuntimeLookupFailure,true);
  assert.equal(row.zeroOutParameterIsNotEffectiveSellPrice,true);
  assert.equal(row.actualUnitSellPrice,null);
  assert.equal(row.nativeTopologyVerifiedSteam1262,true);
  assert.equal(row.nativeTopologyVerifiedSwitch1262,true);
});
test('only positive int32 native item IDs are accepted',()=>{
  for(const bad of [undefined,null,0,-1,1.3,NaN,Infinity,
    -2147483648,2147483648,'31100053',{},[]]){
    assert.throws(()=>nativeSellPriceProviderPlan(bad),
      /DB02_NATIVE_SELL_PROVIDER_INVALID_ITEM_ID/);
  }
});

test('original provider source rows are disjoint; live registration remains unknown',()=>{
  const a=nativeSellPriceProviderPlan(30300005);
  const b=nativeSellPriceProviderPlan(31100053);
  const source=a.serializedSteam1262ProviderSourceEvidence;
  assert.strictEqual(source,b.serializedSteam1262ProviderSourceEvidence);
  assert.equal(source.staticProviderDefinitions,10);
  assert.equal(source.dynamicProviderDefinitions,1);
  assert.equal(source.serializedItemPriceRowCount,9537);
  assert.equal(source.distinctSourceItemIds,9537);
  assert.equal(source.sourceCrossProviderItemIdCollisions,0);
  assert.equal(source.sourceSellItemCurrencyRecords,1192);
  assert.equal(source.sourceCrossProviderSellCurrencyKeyCollisions,0);
  assert.equal(source.sourceSellAmountsWithField,718);
  assert.equal(source.sourceSellAmountsWithoutField,474);
  assert.equal(source.sourceProviderPrecedenceCanChangeOriginalSerializedRowOwner,false);
  assert.equal(source.nativeRuntimeProviderRegistrationOrderVerified,false);
  assert.equal(source.nativeRuntimeRegisteredProviderSetVerified,false);
  assert.equal(source.nativeRuntimeCacheUnchangedVerified,false);
  assert.equal(source.observedEffectiveSellPrices,false);
  assert.equal(a.actualUnitSellPrice,null);
  assert.equal(a.registeredDatabaseIterationOrderVerified,false);
  assert.ok(Object.isFrozen(source));
});
