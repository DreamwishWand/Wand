import test from 'node:test';
import assert from 'node:assert/strict';
import {compareConfiguredPurchaseCurrencies,DB02_SOURCE_CURRENCY_MATCH_CONTRACT}
  from '../src/lib/acquisition/source-price-currency.mjs';
const sha='a'.repeat(64);
const purchase=(currencyId,amount,amountFieldPresent=true)=>({
  currencyId,amount,amountFieldPresent,nativeWireSha256:sha
});
const row=(purchaseCostDefinitions,sellValueDefinitions=[])=>({
  databaseKey:'SyntheticPrices',purchaseCostDefinitions,sellValueDefinitions
});
test('source-configured matching currency is not a live purchase price',()=>{
  const result=compareConfiguredPurchaseCurrencies(
    [row([purchase(80000000,25),purchase(80100000,4)],
      [purchase(80000000,1)])],[80000000,80000000]);
  assert.equal(result.contract,DB02_SOURCE_CURRENCY_MATCH_CONTRACT);
  assert.deepEqual(result.shopConfiguredCurrencyIds,[80000000]);
  assert.equal(result.matchCount,1);
  assert.equal(result.sourceConfiguredMatchingPurchaseCosts[0].configuredAmount,25);
  assert.equal(result.sourceConfiguredOtherCurrencyPurchaseCosts[0].currencyId,80100000);
  assert.equal(result.otherCurrencyOptionCount,1);
  assert.equal(result.shopSpecificDatabaseSelectionVerified,false);
  assert.equal(result.effectiveTransactionPriceVerified,false);
  assert.equal(result.currentShopOfferVerified,false);
  assert.equal(result.sellPricesExcluded,true);
  assert.equal(result.inputSourceAuthenticated,false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.sourceConfiguredMatchingPurchaseCosts));
  assert.ok(Object.isFrozen(result.sourceConfiguredMatchingPurchaseCosts[0]));
});
test('missing field is unknown, explicit zero is only a configured value',()=>{
  const missing=compareConfiguredPurchaseCurrencies(
    [row([purchase(80000000,null,false)])],[80000000]);
  assert.equal(missing.matchCount,1);
  assert.equal(missing.sourceConfiguredMatchingPurchaseCosts[0].configuredAmount,null);
  assert.equal(missing.sourceConfiguredMatchingPurchaseCosts[0].amountFieldPresent,false);
  const zero=compareConfiguredPurchaseCurrencies(
    [row([purchase(80000000,0,true)])],[80000000]);
  assert.equal(zero.sourceConfiguredMatchingPurchaseCosts[0].configuredAmount,0);
  assert.equal(zero.priceAbsenceMeansFree,false);
  assert.equal(zero.effectiveTransactionPriceVerified,false);
});
test('unmatched source candidate never means free, unsold or unavailable',()=>{
  const none=compareConfiguredPurchaseCurrencies([], [80000000]);
  assert.equal(none.matchCount,0);
  assert.equal(none.priceAbsenceMeansFree,false);
  const mismatch=compareConfiguredPurchaseCurrencies(
    [row([purchase(80100000,4)])],[80000000]);
  assert.equal(mismatch.matchCount,0);
  assert.equal(mismatch.otherCurrencyOptionCount,1);
  assert.equal(mismatch.currentShopOfferVerified,false);
});
test('multiple distinct databases remain independent, never selected by shop currency',()=>{
  const comparison=compareConfiguredPurchaseCurrencies([
    {databaseKey:'A',purchaseCostDefinitions:[purchase(80000000,10)],sellValueDefinitions:[]},
    {databaseKey:'B',purchaseCostDefinitions:[purchase(80000000,20)],sellValueDefinitions:[]}
  ],[80000000]);
  assert.equal(comparison.matchCount,2);
  assert.deepEqual(comparison.sourceConfiguredMatchingPurchaseCosts.map(x=>x.databaseKey),['A','B']);
  assert.equal(comparison.shopSpecificDatabaseSelectionVerified,false);
});
test('invalid and ambiguous source amounts fail closed',()=>{
  const bad=[
    [row([purchase(80000000,-1)])],
    [row([purchase(80000000,null,true)])],
    [row([purchase(80000000,3,false)])],
    [row([purchase(80000000,10),purchase(80000000,20)])],
    [{databaseKey:'A',purchaseCostDefinitions:[],sellValueDefinitions:[]},
     {databaseKey:'A',purchaseCostDefinitions:[],sellValueDefinitions:[]}],
    [row([{currencyId:80000000,amount:1,amountFieldPresent:true,nativeWireSha256:'wrong'}])]
  ];
  for(const rows of bad) assert.throws(
    ()=>compareConfiguredPurchaseCurrencies(rows,[80000000]),/DB02_SOURCE_CURRENCY_/);
  assert.throws(()=>compareConfiguredPurchaseCurrencies([],[]),/INVALID_INPUT/);
  assert.throws(()=>compareConfiguredPurchaseCurrencies([],[null]),/INVALID_SHOP_CURRENCY/);
});
