/** Signed int32 percentage contribution observed in Steam and Switch 1.26.2. */
export declare const DB02_MEAL_NATIVE_PERCENT_COMPONENT_CONTRACT:
  'wand.db02.native-percent-component@1';
export interface NativeIngredientPercentComponent {
  readonly contract:typeof DB02_MEAL_NATIVE_PERCENT_COMPONENT_CONTRACT;
  readonly inputIngredientValue:number;
  readonly percentage:number;
  readonly eligibleForAdjustment:boolean;
  readonly signed32MultiplicationResult:number;
  readonly adjustedValueBeforeEligibility:number;
  readonly contribution:number;
  readonly divisionRule:'truncate_toward_zero';
  readonly denominator:100;
  readonly nativeArithmeticShapeVerifiedOnSteam1262:true;
  readonly nativeArithmeticShapeVerifiedOnSwitch1262:true;
  readonly suppliedIngredientValueSourceVerified:false;
  readonly recipeIngredientEligibilityVerified:false;
  readonly runtimePriceDatabaseSelectionVerified:false;
  readonly baseBonusAndCapPathResolved:false;
  readonly finalMealPrice:null;
  readonly completeMealPriceFormulaVerified:false;
}
export declare function nativeIngredientPercentComponent32(
  ingredientValue:number,
  percentage:number,
  eligibleForAdjustment:boolean
):NativeIngredientPercentComponent;
