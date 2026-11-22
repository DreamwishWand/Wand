import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeIngredientPercentComponent32,
  DB02_MEAL_NATIVE_PERCENT_COMPONENT_CONTRACT
} from '../src/lib/acquisition/native-meal-percent-component.mjs';

test('Steam/Switch integer divide by 100 truncates per component',()=>{
  const a=nativeIngredientPercentComponent32(21,120,true);
  assert.equal(a.contract,DB02_MEAL_NATIVE_PERCENT_COMPONENT_CONTRACT);
  assert.equal(a.contribution,25);
  assert.equal(a.adjustedValueBeforeEligibility,25);
  assert.equal(a.signed32MultiplicationResult,2520);
  assert.equal(a.denominator,100);
  assert.equal(a.divisionRule,'truncate_toward_zero');
  assert.equal(a.completeMealPriceFormulaVerified,false);
  assert.equal(a.finalMealPrice,null);
  assert.ok(Object.isFrozen(a));
});
test('ineligible component preserves source value, not a guessed price bonus',()=>{
  const a=nativeIngredientPercentComponent32(33,160,false);
  assert.equal(a.adjustedValueBeforeEligibility,52);
  assert.equal(a.contribution,33);
  assert.equal(a.recipeIngredientEligibilityVerified,false);
  assert.equal(a.runtimePriceDatabaseSelectionVerified,false);
});
test('negative products truncate toward zero, not floor',()=>{
  assert.equal(nativeIngredientPercentComponent32(-1,150,true).contribution,-1);
  assert.equal(nativeIngredientPercentComponent32(-101,150,true).contribution,-151);
});
test('native multiplication wraps signed 32-bit before divide',()=>{
  const n=2147483647,p=160;
  const r=nativeIngredientPercentComponent32(n,p,true);
  assert.equal(r.signed32MultiplicationResult,Math.imul(n,p));
  assert.equal(r.contribution,Math.trunc(Math.imul(n,p)/100));
  assert.notEqual(r.contribution,Math.trunc((n*p)/100));
});
test('zero, tiny and five native percentage tiers are deterministic',()=>{
  const tiers=[120,130,140,150,160];
  for(const pct of tiers){
    assert.equal(nativeIngredientPercentComponent32(1,pct,true).contribution,1);
    assert.equal(nativeIngredientPercentComponent32(99,pct,true).contribution,
      Math.trunc(99*pct/100));
  }
  assert.equal(nativeIngredientPercentComponent32(0,160,true).contribution,0);
});
test('numeric and eligibility validation is fail closed',()=>{
  for(const v of [1.2,NaN,Infinity,'12',2147483648,-2147483649]){
    assert.throws(()=>nativeIngredientPercentComponent32(v,120,true),
      /DB02_MEAL_PERCENT_INT32_VALUE_REQUIRED/);
  }
  for(const pct of [-1,10001,120.5,null,'120']){
    assert.throws(()=>nativeIngredientPercentComponent32(22,pct,true),
      /DB02_MEAL_PERCENT_PERCENTAGE_RANGE/);
  }
  assert.throws(()=>nativeIngredientPercentComponent32(22,120,null),
    /DB02_MEAL_PERCENT_ELIGIBILITY_REQUIRED/);
});
