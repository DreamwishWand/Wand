/** Original Steam/Switch 1.26.2 arithmetic stage, NOT a meal sell price. */
export declare const DB02_NATIVE_TOTAL_VALUE_STAGE_CONTRACT:
  'wand.db02.native-ingredient-total-value-stage@1';
export interface SuppliedNativeIngredientComponent {
  readonly value:number;
  readonly percentage:number;
  readonly eligibleForAdjustment:boolean;
}
export interface NativeIngredientTotalComponent {
  readonly inputIngredientValue:number;
  readonly percentage:number;
  readonly eligibleForAdjustment:boolean;
  readonly contribution:number;
  readonly signed32RunningTotal:number;
}
export interface NativeIngredientTotalStage {
  readonly contract:typeof DB02_NATIVE_TOTAL_VALUE_STAGE_CONTRACT;
  readonly suppliedBaseValue:number;
  readonly suppliedUpperBound:number;
  readonly boundDefaultIsInt32Max:boolean;
  readonly components:readonly NativeIngredientTotalComponent[];
  readonly totalBeforeBound:number;
  readonly arithmeticResult:number;
  readonly boundApplied:boolean;
  readonly accumulationSigned32Wrapping:true;
  readonly adjustmentPerIngredientBeforeAccumulation:true;
  readonly boundAppliedOnceAfterAccumulation:true;
  readonly nativeArithmeticStructureVerifiedSteam1262:true;
  readonly nativeArithmeticStructureVerifiedSwitch1262:true;
  readonly originalIngredientValuesVerified:false;
  readonly originalEligibilityRulesVerified:false;
  readonly originalBaseValueVerified:false;
  readonly originalUpperBoundVerified:false;
  readonly nativePriceDatabaseSelectionVerified:false;
  readonly nativeInstanceMealPrice:null;
  readonly completeMealSellPriceFormulaVerified:false;
  readonly canPublishAsSalePrice:false;
}
/** All numeric values and eligibility flags must be supplied by the caller. */
export declare function nativeIngredientTotalValueStage(input:{
  baseValue?:number;
  upperBound?:number;
  ingredients:readonly SuppliedNativeIngredientComponent[];
}):NativeIngredientTotalStage;
