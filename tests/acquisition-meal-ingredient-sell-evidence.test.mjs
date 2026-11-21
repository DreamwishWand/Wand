import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectConfiguredIngredientSellEvidence,
  SOURCE_SOFT_CURRENCY_ID,
  DB02_MEAL_INGREDIENT_SELL_EVIDENCE_CONTRACT
} from '../src/lib/acquisition/meal-ingredient-sell-evidence.mjs';

const HASH='a'.repeat(64);
const cost=(currencyId,amount)=>({
  currencyId,amount,amountFieldPresent:amount!==null,
  nativeWireSha256:HASH
});
const row=(itemId,db,sells=[],buys=[])=>({
  itemId,databaseKey:db,
  sellValueDefinitions:sells,purchaseCostDefinitions:buys
});
const amounts=[{itemId:31100053,count:2},{itemId:30200045,count:1}];

test('per-instance counts and SOURCE sell values retain true semantics',()=>{
  const result=collectConfiguredIngredientSellEvidence(amounts,id=>
    id===31100053?[row(id,'Ingredient_DB',[cost(80000000,25)],
      [cost(80000000,1000)])]:[]);
  assert.equal(result.contract,DB02_MEAL_INGREDIENT_SELL_EVIDENCE_CONTRACT);
  assert.equal(result.currencyId,SOURCE_SOFT_CURRENCY_ID);
  assert.equal(result.totalIngredientUnits,3);
  assert.equal(result.ingredientsWithSingleConfiguredStaticAmount,1);
  assert.equal(result.ingredientsWithoutObservedStaticSoftAmount,1);
  assert.equal(result.unitsWithoutSingleConfiguredStaticAmount,1);
  assert.equal(result.fullIngredientValuesKnownFromStaticSources,false);
  assert.equal(result.ingredientRows[0].configuredUnitSoftSellAmount,25);
  assert.equal(result.ingredientRows[0].quantity,2);
  assert.equal(result.ingredientRows[0].sourceStaticSellOptions[0].sourceConfiguredOnly,true);
  assert.equal(result.ingredientRows[1].configuredUnitSoftSellAmount,null);
  assert.equal(result.ingredientRows[1].noObservedStaticPriceDoesNotMeanUnsellable,true);
  assert.equal(result.inputSourceAuthenticated,false);
  assert.equal(result.actualNativeIngredientPricesVerified,false);
  assert.equal(result.mealSellPriceComputed,false);
  assert.equal(result.realizedMealSellPrice,null);
  assert.ok(Object.isFrozen(result.ingredientRows[0].sourceStaticSellOptions));
});
test('buy-only rows must not be reused as sell prices',()=>{
  const result=collectConfiguredIngredientSellEvidence([{itemId:30200045,count:1}],
    id=>[row(id,'PurchaseOnly',[],[cost(80000000,500)])]);
  assert.equal(result.ingredientsWithoutObservedStaticSoftAmount,1);
  assert.equal(result.ingredientRows[0].sourceStaticPriceDatabaseKeys[0],'PurchaseOnly');
  assert.deepEqual(result.ingredientRows[0].sourceStaticSellOptions,[]);
});
test('zero is a true serialized amount; omitted amount is unknown',()=>{
  const zero=collectConfiguredIngredientSellEvidence([{itemId:30200045,count:1}],
    id=>[row(id,'Native',[cost(80000000,0)])]);
  assert.equal(zero.ingredientRows[0].configuredUnitSoftSellAmount,0);
  assert.equal(zero.ingredientsWithSingleConfiguredStaticAmount,1);
  const absent=collectConfiguredIngredientSellEvidence([{itemId:30200045,count:1}],
    id=>[row(id,'Native',[cost(80000000,null)])]);
  assert.equal(absent.ingredientRows[0].configuredUnitSoftSellAmount,null);
  assert.equal(absent.ingredientsWithAmbiguousOrMissingAmount,1);
});
test('other currency is not soft-currency sell evidence',()=>{
  const result=collectConfiguredIngredientSellEvidence([{itemId:31000014,count:1}],
    id=>[row(id,'Fish',[cost(80000001,900)])]);
  assert.equal(result.ingredientRows[0].otherCurrencyStaticSellOptions,1);
  assert.deepEqual(result.ingredientRows[0].sourceStaticSellOptions,[]);
});
test('multiple source sell definitions cannot be selected by guessing',()=>{
  const result=collectConfiguredIngredientSellEvidence([{itemId:30200045,count:1}],
    id=>[row(id,'A',[cost(80000000,100)]),row(id,'B',[cost(80000000,120)])]);
  assert.equal(result.ingredientsWithAmbiguousOrMissingAmount,1);
  assert.equal(result.ingredientRows[0].configuredUnitSoftSellAmount,null);
  assert.equal(result.ingredientRows[0].runtimePriceDatabaseSelectionVerified,false);
});
test('missing all source rows does not mean a zero-cost or unsellable meal',()=>{
  const result=collectConfiguredIngredientSellEvidence([],()=>[]);
  assert.equal(result.fullIngredientValuesKnownFromStaticSources,false);
  assert.equal(result.realizedMealSellPrice,null);
});
test('duplicate item ids, unsafe amounts and invalid native costs fail closed',()=>{
  const errors=[
    ()=>collectConfiguredIngredientSellEvidence([{itemId:1,count:1},{itemId:1,count:1}],()=>[]),
    ()=>collectConfiguredIngredientSellEvidence([{itemId:1,count:0}],()=>[]),
    ()=>collectConfiguredIngredientSellEvidence([{itemId:1,count:33}],()=>[]),
    ()=>collectConfiguredIngredientSellEvidence([{itemId:1,count:1}],()=>[
      row(2,'Bad',[cost(80000000,1)])]),
    ()=>collectConfiguredIngredientSellEvidence([{itemId:1,count:1}],()=>[
      row(1,'Bad',[{...cost(80000000,1),amountFieldPresent:false}])]),
    ()=>collectConfiguredIngredientSellEvidence([{itemId:1,count:1}],()=>[
      row(1,'Bad',[cost(80000000,-1)])]),
    ()=>collectConfiguredIngredientSellEvidence([{itemId:1,count:1}],()=>[
      row(1,'Bad',[cost(80000000,1),cost(80000000,2)])]),
    ()=>collectConfiguredIngredientSellEvidence([{itemId:1,count:1}],()=>[
      row(1,'Bad',[{...cost(80000000,1),nativeWireSha256:'fake'}])])
  ];
  for(const call of errors)assert.throws(call,/DB02_MEAL_INGREDIENT_SELL_/);
});
