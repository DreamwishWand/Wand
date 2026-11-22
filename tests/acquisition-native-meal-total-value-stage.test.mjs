import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB02_NATIVE_TOTAL_VALUE_STAGE_CONTRACT,
  nativeIngredientTotalValueStage
} from '../src/lib/acquisition/native-meal-total-value-stage.mjs';
const component=(value,percentage=100,eligibleForAdjustment=true)=>
  ({value,percentage,eligibleForAdjustment});

test('base and each adjusted component are summed then bounded ONCE',()=>{
  const row=nativeIngredientTotalValueStage({
    baseValue:10,upperBound:40,
    ingredients:[component(21,120),component(10,130)]
  });
  assert.equal(row.contract,DB02_NATIVE_TOTAL_VALUE_STAGE_CONTRACT);
  assert.deepEqual(row.components.map(x=>x.contribution),[25,13]);
  assert.deepEqual(row.components.map(x=>x.signed32RunningTotal),[35,48]);
  assert.equal(row.totalBeforeBound,48);
  assert.equal(row.arithmeticResult,40);
  assert.equal(row.boundApplied,true);
  assert.equal(row.nativeInstanceMealPrice,null);
  assert.equal(row.originalIngredientValuesVerified,false);
  assert.equal(row.originalEligibilityRulesVerified,false);
  assert.equal(row.completeMealSellPriceFormulaVerified,false);
  assert.ok(Object.isFrozen(row));
  assert.ok(Object.isFrozen(row.components));
  assert.ok(Object.isFrozen(row.components[0]));
});

test('unadjusted entry contributes original value even with non-100 factor',()=>{
  const row=nativeIngredientTotalValueStage({
    ingredients:[component(33,160,false),component(11,120,true)]
  });
  assert.equal(row.totalBeforeBound,46);
  assert.equal(row.arithmeticResult,46);
  assert.equal(row.suppliedBaseValue,0);
  assert.equal(row.suppliedUpperBound,2147483647);
  assert.equal(row.boundDefaultIsInt32Max,true);
});

test('native rounds PER component before summation, not after',()=>{
  const row=nativeIngredientTotalValueStage({
    ingredients:[component(1,150),component(1,150)]
  });
  assert.deepEqual(row.components.map(x=>x.contribution),[1,1]);
  assert.equal(row.arithmeticResult,2);
  assert.notEqual(row.arithmeticResult,Math.trunc((1+1)*150/100));
});

test('native addition wraps signed 32-bit before final cap test',()=>{
  const row=nativeIngredientTotalValueStage({
    baseValue:2147483647,ingredients:[component(1,100)]
  });
  assert.equal(row.totalBeforeBound,-2147483648);
  assert.equal(row.arithmeticResult,-2147483648);
  assert.equal(row.boundApplied,false);
  assert.equal(row.accumulationSigned32Wrapping,true);
});

test('native signed compare allows negative caps and empty entries',()=>{
  assert.equal(nativeIngredientTotalValueStage({
    baseValue:8,upperBound:-1,ingredients:[]
  }).arithmeticResult,-1);
  assert.equal(nativeIngredientTotalValueStage({
    baseValue:-2,upperBound:0,ingredients:[]
  }).arithmeticResult,-2);
});

test('native base value and cap are untrusted until callbacks are resolved',()=>{
  const row=nativeIngredientTotalValueStage({ingredients:[]});
  assert.equal(row.arithmeticResult,0);
  assert.equal(row.originalBaseValueVerified,false);
  assert.equal(row.originalUpperBoundVerified,false);
  assert.equal(row.nativePriceDatabaseSelectionVerified,false);
  assert.equal(row.canPublishAsSalePrice,false);
});

test('reject non-int32 caller base, cap and invalid ingredients',()=>{
  for(const baseValue of [NaN,'0',1.1,2147483648,-2147483649,Infinity])
    assert.throws(()=>nativeIngredientTotalValueStage({
      baseValue,ingredients:[]
    }),/DB02_MEAL_TOTAL_STAGE_INVALID_BASE_VALUE/);
  for(const upperBound of [-2147483649,2147483648,0.5,NaN,'99'])
    assert.throws(()=>nativeIngredientTotalValueStage({
      upperBound,ingredients:[]
    }),/DB02_MEAL_TOTAL_STAGE_INVALID_UPPER_BOUND/);
  for(const ingredients of [undefined,null,{},'x',[null],[{}],
    new Array(33).fill(component(1))])
    assert.throws(()=>nativeIngredientTotalValueStage({
      ingredients
    }),/DB02_MEAL_(?:TOTAL_STAGE|PERCENT)_/);
});

test('32-ingredient synthetic boundary does not infer any game recipe',()=>{
  const row=nativeIngredientTotalValueStage({
    ingredients:new Array(32).fill(0).map(()=>component(1,120))
  });
  assert.equal(row.components.length,32);
  assert.equal(row.arithmeticResult,32);
  assert.equal(row.originalEligibilityRulesVerified,false);
});
