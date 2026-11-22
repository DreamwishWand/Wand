import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeMealItemStateEvidence
} from '../src/lib/acquisition/meal-price-evidence.mjs';
import {
  DB02_NATIVE_MEAL_PRICE_ROUTE_CONTRACT,
  NATIVE_MEAL_SOFT_SELL_LOOKUP_DEFAULT,
  classifyNativeMealSellPriceRoute
} from '../src/lib/acquisition/native-meal-price-route.mjs';

const vint=n=>{
  let x=BigInt(n),out=[];
  do{let b=Number(x&127n);x>>=7n;if(x)b|=128;out.push(b);}while(x);
  return out;
};
const nested=(tag,data)=>[...vint(tag*8+2),...vint(data.length),...data];
const state=ids=>decodeMealItemStateEvidence(
  Uint8Array.from(nested(1,nested(1,ids.flatMap(vint))))
);
test('serialized nonempty meal state takes recorded ingredient IDs verbatim',()=>{
  const r=classifyNativeMealSellPriceRoute(
    state([31100053,30200045,31100053]));
  assert.equal(r.contract,DB02_NATIVE_MEAL_PRICE_ROUTE_CONTRACT);
  assert.equal(r.ingredientSource,'recorded_ingredients_used');
  assert.deepEqual(r.recordedIngredientIds,[31100053,30200045,31100053]);
  assert.equal(r.recordedIngredientCount,3);
  assert.equal(r.preservesRepeatedRecordedItemIds,true);
  assert.equal(r.missingOrEmptyMealStateInvokesLowestPriceRecipeFallback,false);
  assert.equal(r.nativeIngredientLookupState,null);
  assert.equal(r.nativeDefaultSoftSellIfLookupFails,1);
  assert.equal(NATIVE_MEAL_SOFT_SELL_LOOKUP_DEFAULT,1);
  assert.equal(r.actualMealSellPrice,null);
  assert.equal(r.fullMealPriceComputed,false);
  assert.ok(Object.isFrozen(r.recordedIngredientIds));
  assert.ok(Object.isFrozen(r));
});
test('empty MealData uses lowest-price recipe fallback, not zero-price ingredients',()=>{
  const decoded=decodeMealItemStateEvidence(Uint8Array.from(nested(1,[])));
  const r=classifyNativeMealSellPriceRoute(decoded);
  assert.equal(r.ingredientSource,'recipe_lowest_price_ingredients');
  assert.equal(r.recordedIngredientIds,null);
  assert.equal(r.recordedIngredientCount,0);
  assert.equal(r.fallbackSelectionRequiresNativeItemPrices,true);
  assert.equal(r.originalNativeIngredientPriceAmounts,null);
  assert.equal(r.originalRecipeMatched,false);
});
test('absent ItemState meal data also falls back to lowest native recipe prices',()=>{
  const decoded=decodeMealItemStateEvidence(Uint8Array.of(0x98,0x06,0x07));
  assert.equal(decoded.mealDataPresent,false);
  const r=classifyNativeMealSellPriceRoute(decoded);
  assert.equal(r.ingredientSource,'recipe_lowest_price_ingredients');
  assert.equal(r.missingOrEmptyMealStateInvokesLowestPriceRecipeFallback,true);
});
test('native conditional default does not equate to absent static or dynamic rows',()=>{
  const r=classifyNativeMealSellPriceRoute(state([31100053]));
  assert.equal(r.defaultRequiresActualNativeLookupFailure,true);
  assert.equal(r.absentStaticSellDefinitionNotEquivalentToNativeLookupFailure,true);
  assert.equal(r.absentDynamicCacheSellRowNotEquivalentToNativeLookupFailure,true);
  assert.equal(r.originalNativeIngredientLookupSucceeded,null);
  assert.equal(r.originalNativeIngredientPriceAmounts,null);
  assert.equal(r.publishable,false);
  assert.equal(r.writable,false);
});
test('native sell wrapper uses null base and max selectors, 0 and INT32_MAX',()=>{
  const r=classifyNativeMealSellPriceRoute(state([30200045]));
  assert.equal(r.wrapperBaseValueSelector,null);
  assert.equal(r.wrapperMaximumValueSelector,null);
  assert.equal(r.wrapperUnconfiguredBaseValue,0);
  assert.equal(r.wrapperUnconfiguredUpperBound,2147483647);
  assert.equal(r.wrapperBonusValueSelector,
    'CookingData.RecipeStarResult.SellPriceIngredientPercentage');
  assert.equal(r.ingredientAdjustmentEligibilityVerified,false);
});
test('reject spoofed or inconsistent ItemState contract and recorded flags',()=>{
  const good=state([31100053]);
  for(const invalid of [null,undefined,{},{
    ...good,contract:'wrong'
  },{...good,ingredientsRecorded:false},
  {...good,serializedIngredientIds:null},
  {...good,serializedIngredientIds:[0]},
  {...good,serializedIngredientIds:[2147483648]},
  {...good,serializedIngredientIds:new Array(33).fill(31100053)}]){
    assert.throws(()=>classifyNativeMealSellPriceRoute(invalid),
      /DB02_MEAL_NATIVE_ROUTE_/);
  }
});
