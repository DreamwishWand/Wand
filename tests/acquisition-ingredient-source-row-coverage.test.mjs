import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyIngredientSerializedPriceRowCoverage as classify,
  DB02_INGREDIENT_SOURCE_ROW_COVERAGE_CONTRACT as CONTRACT
} from '../src/lib/acquisition/ingredient-source-row-coverage.mjs';

const itemId=31100053;
const staticRow={itemId,databaseKey:'Cooking_Ingredient_PriceDatabase',
  purchaseCostDefinitions:[],sellValueDefinitions:[]};
const dynamic=(buy=false,sell=false)=>({
  itemId,serializedCacheOnly:true,originalSourceAuthenticated:true,
  cachedPurchaseRowPresent:buy,cachedSellRowPresent:sell
});

test('exact snapshot missing from both providers is not missing wire Amount',()=>{
  const r=classify({itemId,staticRows:[],dynamicCacheLookup:dynamic()});
  assert.equal(r.contract,CONTRACT);
  assert.equal(r.sourceRowAbsentAcrossStaticAndDynamicSnapshots,true);
  assert.equal(r.sourceRecordStatus,'no_serialized_source_price_row');
  assert.equal(r.noPriceRowIsNotAnOmittedAmountField,true);
  assert.equal(r.rowAbsenceDoesNotProveRuntimeLookupFailure,true);
  assert.equal(r.rowAbsenceDoesNotProveUnsellable,true);
  assert.equal(r.actualIngredientSellPrice,null);
  assert.equal(r.publishable,false);
  assert.ok(Object.isFrozen(r));
});

test('static ItemPrices row is present even when it has no sell values',()=>{
  const r=classify({itemId,staticRows:[staticRow],
    dynamicCacheLookup:dynamic()});
  assert.equal(r.sourceRowAbsentAcrossStaticAndDynamicSnapshots,false);
  assert.equal(r.sourceRecordStatus,'static_source_row_present');
  assert.equal(r.staticSourceRowCount,1);
  assert.equal(r.actualIngredientSellPrice,null);
});

test('dynamic source cache is checked independently of static rows',()=>{
  const buy=classify({itemId,staticRows:[],
    dynamicCacheLookup:dynamic(true,false)});
  assert.equal(buy.sourceRecordStatus,'dynamic_source_row_present');
  assert.equal(buy.dynamicSourcePurchaseRowPresent,true);
  assert.equal(buy.dynamicSourceSellRowPresent,false);
  assert.equal(buy.sourceRowAbsentAcrossStaticAndDynamicSnapshots,false);
});

test('without original dynamic source no global source-row absence is asserted',()=>{
  const r=classify({itemId,staticRows:[]});
  assert.equal(r.sourceRecordStatus,'dynamic_source_not_supplied');
  assert.equal(r.sourceRowAbsentAcrossStaticAndDynamicSnapshots,null);
  assert.equal(r.dynamicSourcePurchaseRowPresent,null);
  assert.equal(r.dynamicSourceSellRowPresent,null);
  assert.equal(r.sourceInputIndependentlyAuthenticatedByThisFunction,false);
});

test('collisions and forged input shapes fail closed',()=>{
  assert.throws(()=>classify({itemId,staticRows:[staticRow],
    dynamicCacheLookup:dynamic(true,false)}),/ORIGINAL_SOURCE_PROVIDER_ITEM_COLLISION/);
  for(const bad of [
    {itemId,staticRows:[staticRow,staticRow]},
    {itemId,staticRows:[{...staticRow,itemId:1}]},
    {itemId,staticRows:[],dynamicCacheLookup:{...dynamic(),itemId:1}},
    {itemId,staticRows:[],dynamicCacheLookup:{...dynamic(),originalSourceAuthenticated:false}},
    {itemId:'31100053',staticRows:[]}
  ])assert.throws(()=>classify(bad),/DB02_INGREDIENT_SOURCE_ROW_/);
});
