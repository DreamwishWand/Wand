/** Read-only source configured sell candidates; never an effective meal price. */
export declare const DB02_MEAL_INGREDIENT_SELL_EVIDENCE_CONTRACT:
  'wand.db02.meal-ingredient-sell-evidence@1';
export declare const SOURCE_SOFT_CURRENCY_ID:80000000;
export interface ConfiguredIngredientSellOption {
  readonly databaseKey:string;
  readonly currencyId:number;
  readonly configuredUnitAmount:number|null;
  readonly amountFieldPresent:boolean;
  readonly sourceWireSha256:string;
  readonly sourceConfiguredOnly:true;
  readonly runtimeSelected:false;
  readonly effectiveValueVerified:false;
}
export interface ConfiguredIngredientSellRow {
  readonly ingredientItemId:number;
  readonly quantity:number;
  readonly sourceStaticPriceDatabaseKeys:readonly string[];
  readonly sourceStaticSellOptions:readonly ConfiguredIngredientSellOption[];
  readonly otherCurrencyStaticSellOptions:number;
  readonly configuredUnitSoftSellAmount:number|null;
  readonly status:
    'no_observed_static_soft_sell_definition'|
    'one_configured_static_soft_sell_value'|
    'ambiguous_or_missing_amount_static_soft_sell';
  readonly actualIngredientSellValueVerified:false;
  readonly runtimePriceDatabaseSelectionVerified:false;
  readonly fallbackRuleVerified:false;
  readonly dynamicPriceEvaluationVerified:false;
  readonly noObservedStaticPriceDoesNotMeanUnsellable:true;
}
export interface ConfiguredIngredientSellEvidence {
  readonly contract:typeof DB02_MEAL_INGREDIENT_SELL_EVIDENCE_CONTRACT;
  readonly currencyId:typeof SOURCE_SOFT_CURRENCY_ID;
  readonly ingredientRows:readonly ConfiguredIngredientSellRow[];
  readonly totalIngredientUnits:number;
  readonly ingredientsWithSingleConfiguredStaticAmount:number;
  readonly ingredientsWithoutObservedStaticSoftAmount:number;
  readonly ingredientsWithAmbiguousOrMissingAmount:number;
  readonly unitsWithoutSingleConfiguredStaticAmount:number;
  readonly inputSourceAuthenticated:false;
  readonly fullIngredientValuesKnownFromStaticSources:boolean;
  readonly actualNativeIngredientPricesVerified:false;
  readonly mealSellPriceComputed:false;
  readonly realizedMealSellPrice:null;
  readonly publishable:false;
}
export declare function collectConfiguredIngredientSellEvidence(
  ingredientAmounts:readonly Readonly<{itemId:number;count:number}>[],
  getStaticPriceDefinitions:(itemId:number)=>readonly Readonly<{
    itemId:number;
    databaseKey:string;
    sellValueDefinitions:readonly Readonly<{
      currencyId:number;
      amountFieldPresent:boolean;
      amount:number|null;
      nativeWireSha256:string;
    }>[];
    purchaseCostDefinitions:readonly unknown[];
  }>[]
):ConfiguredIngredientSellEvidence;
