/**
 * DB-02 native ORIGINAL Steam/Switch v1.26.2 ingredient percentage component.
 * Both native binaries use a signed int32 multiplication followed by
 * truncation toward zero after division by 100. The original recipe selection
 * conditions, ingredient value resolution, default price database routing,
 * base amounts and caps are separate work. THIS IS NOT A MEAL SELL PRICE.
 *
 * This pure operation accepts caller numbers; it never certifies their source.
 */
export const DB02_MEAL_NATIVE_PERCENT_COMPONENT_CONTRACT=
  'wand.db02.native-percent-component@1';
const fail=code=>{throw new TypeError('DB02_MEAL_PERCENT_'+code);};
const check=(ok,code)=>{if(!ok)fail(code);};
const int32=x=>Number.isInteger(x)&&x>=-2147483648&&x<=2147483647;
export function nativeIngredientPercentComponent32(
  ingredientValue,percentage,eligibleForAdjustment
){
  check(int32(ingredientValue),'INT32_VALUE_REQUIRED');
  check(Number.isInteger(percentage)&&percentage>=0&&percentage<=10000,
    'PERCENTAGE_RANGE');
  check(typeof eligibleForAdjustment==='boolean','ELIGIBILITY_REQUIRED');
  // x86 IMUL 32-bit and ARM64 MUL W-register both discard high 32 bits.
  const wrappedSignedProduct=Math.imul(ingredientValue,percentage);
  const adjustedValue=Math.trunc(wrappedSignedProduct/100);
  const contribution=eligibleForAdjustment?adjustedValue:ingredientValue;
  return Object.freeze({
    contract:DB02_MEAL_NATIVE_PERCENT_COMPONENT_CONTRACT,
    inputIngredientValue:ingredientValue,
    percentage,
    eligibleForAdjustment,
    signed32MultiplicationResult:wrappedSignedProduct,
    adjustedValueBeforeEligibility:adjustedValue,
    contribution,
    divisionRule:'truncate_toward_zero',
    denominator:100,
    nativeArithmeticShapeVerifiedOnSteam1262:true,
    nativeArithmeticShapeVerifiedOnSwitch1262:true,
    suppliedIngredientValueSourceVerified:false,
    recipeIngredientEligibilityVerified:false,
    runtimePriceDatabaseSelectionVerified:false,
    baseBonusAndCapPathResolved:false,
    finalMealPrice:null,
    completeMealPriceFormulaVerified:false
  });
}
