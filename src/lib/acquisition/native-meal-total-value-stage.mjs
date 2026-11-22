/**
 * DB-02 independently observed Steam/Switch v1.26.2 TotalIngredientsValue
 * accumulator stage. This models ONLY caller-supplied arithmetic inputs.
 *
 * Native evidence: Steam 0x3E1E25C/0x3E1E2F9/0x3E1E625/0x3E1E6B4;
 * Switch 0x4A3EED4/0x4A3EEAC/0x4A3F044/0x4A3F264.
 *
 * The game resolves actual values, recipe component eligibility, bonus
 * and upper bound using other native APIs. Never use this as a sale quote.
 */
import {nativeIngredientPercentComponent32} from './native-meal-percent-component.mjs';

export const DB02_NATIVE_TOTAL_VALUE_STAGE_CONTRACT=
  'wand.db02.native-ingredient-total-value-stage@1';
const fail=why=>{throw new TypeError('DB02_MEAL_TOTAL_STAGE_'+why);};
const check=(yes,why)=>{if(!yes)fail(why);};
const int32=x=>Number.isInteger(x)&&x>=-2147483648&&x<=2147483647;
const frozen=Object.freeze;

/**
 * Emulate the verified arithmetic stage, NOT item price source resolution.
 * Upper bound is applied only ONCE after signed-int32 accumulation.
 * All base values, percentages, eligibility flags and limits are caller-given.
 */
export function nativeIngredientTotalValueStage({
  baseValue=0,upperBound=2147483647,ingredients
}={}){
  check(int32(baseValue),'INVALID_BASE_VALUE');
  check(int32(upperBound),'INVALID_UPPER_BOUND');
  check(Array.isArray(ingredients)&&ingredients.length<=32,
    'INVALID_INGREDIENT_COLLECTION');
  let accumulator=baseValue;
  const components=[];
  for(const entry of ingredients){
    check(entry!==null&&typeof entry==='object'&&
      !Array.isArray(entry),'INVALID_INGREDIENT_ENTRY');
    const part=nativeIngredientPercentComponent32(
      entry.value,entry.percentage,entry.eligibleForAdjustment);
    accumulator=(accumulator+part.contribution)|0;
    components.push(frozen({
      inputIngredientValue:part.inputIngredientValue,
      percentage:part.percentage,
      eligibleForAdjustment:part.eligibleForAdjustment,
      contribution:part.contribution,
      signed32RunningTotal:accumulator
    }));
  }
  const totalBeforeBound=accumulator;
  const arithmeticResult=totalBeforeBound>upperBound?upperBound:totalBeforeBound;
  return frozen({
    contract:DB02_NATIVE_TOTAL_VALUE_STAGE_CONTRACT,
    suppliedBaseValue:baseValue,
    suppliedUpperBound:upperBound,
    boundDefaultIsInt32Max:upperBound===2147483647,
    components:frozen(components),
    totalBeforeBound,
    arithmeticResult,
    boundApplied:arithmeticResult!==totalBeforeBound,
    accumulationSigned32Wrapping:true,
    adjustmentPerIngredientBeforeAccumulation:true,
    boundAppliedOnceAfterAccumulation:true,
    nativeArithmeticStructureVerifiedSteam1262:true,
    nativeArithmeticStructureVerifiedSwitch1262:true,
    originalIngredientValuesVerified:false,
    originalEligibilityRulesVerified:false,
    originalBaseValueVerified:false,
    originalUpperBoundVerified:false,
    nativePriceDatabaseSelectionVerified:false,
    nativeInstanceMealPrice:null,
    completeMealSellPriceFormulaVerified:false,
    canPublishAsSalePrice:false
  });
}
