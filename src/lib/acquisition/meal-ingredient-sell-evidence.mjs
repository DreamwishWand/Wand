/**
 * DB-02: structural, LOCAL-ONLY static ingredient SellPrices evidence.
 * Caller-supplied rows are NOT authenticated by this pure classifier.
 * A serialized static ItemPriceDatabase.SellPrices entry is NOT the actual
 * current soft-currency sell value used by MealItemData.GetSellPrice.
 */
export const DB02_MEAL_INGREDIENT_SELL_EVIDENCE_CONTRACT=
  'wand.db02.meal-ingredient-sell-evidence@1';
export const SOURCE_SOFT_CURRENCY_ID=80000000;
const fail=x=>{throw new TypeError('DB02_MEAL_INGREDIENT_SELL_'+x);};
const check=(yes,code)=>{if(!yes)fail(code);};
const positive=x=>Number.isSafeInteger(x)&&x>0&&x<=2147483647;
const money=x=>Number.isSafeInteger(x)&&x>=0&&x<=2147483647;
const isHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const freeze=Object.freeze;

/**
 * Query original static price candidates for *recorded ingredient instances*.
 * No native database selection, formula, fallback, or dynamic price is inferred.
 *
 * @param {readonly {itemId:number,count:number}[]} ingredientAmounts
 * @param {(itemId:number)=>readonly object[]} getStaticPriceDefinitions
 */
export function collectConfiguredIngredientSellEvidence(
  ingredientAmounts,getStaticPriceDefinitions
){
  check(Array.isArray(ingredientAmounts)&&ingredientAmounts.length<=32&&
    typeof getStaticPriceDefinitions==='function','INVALID_INPUT');
  const seen=new Set();
  let priced=0,missing=0,ambiguous=0,unpricedUnits=0,totalUnits=0;
  const entries=ingredientAmounts.map(input=>{
    check(input&&positive(input.itemId)&&positive(input.count)&&
      input.count<=32&&!seen.has(input.itemId),'INVALID_INGREDIENT');
    seen.add(input.itemId);
    totalUnits+=input.count;
    check(totalUnits<=32,'TOO_MANY_INGREDIENT_UNITS');
    const rows=getStaticPriceDefinitions(input.itemId);
    check(Array.isArray(rows)&&rows.length<=16,'INVALID_STATIC_PRICE_ROWS');
    const seenDatabases=new Set(),options=[];
    let otherCurrencies=0;
    for(const row of rows){
      check(row&&row.itemId===input.itemId&&
        typeof row.databaseKey==='string'&&row.databaseKey.length>0&&
        row.databaseKey.length<=256&&!seenDatabases.has(row.databaseKey)&&
        Array.isArray(row.sellValueDefinitions)&&
        Array.isArray(row.purchaseCostDefinitions)&&
        row.sellValueDefinitions.length<=64,'INVALID_STATIC_PRICE_ROW');
      seenDatabases.add(row.databaseKey);
      const currencies=new Set();
      for(const cost of row.sellValueDefinitions){
        check(cost&&positive(cost.currencyId)&&
          !currencies.has(cost.currencyId)&&
          typeof cost.amountFieldPresent==='boolean'&&
          (cost.amountFieldPresent?money(cost.amount):cost.amount===null)&&
          isHash(cost.nativeWireSha256),'INVALID_SELL_CURRENCY_COST');
        currencies.add(cost.currencyId);
        if(cost.currencyId===SOURCE_SOFT_CURRENCY_ID){
          options.push(freeze({
            databaseKey:row.databaseKey,currencyId:cost.currencyId,
            configuredUnitAmount:cost.amount,
            amountFieldPresent:cost.amountFieldPresent,
            sourceWireSha256:cost.nativeWireSha256,
            sourceConfiguredOnly:true,
            runtimeSelected:false,effectiveValueVerified:false
          }));
        }else otherCurrencies++;
      }
    }
    const hasSingle=options.length===1&&options[0].amountFieldPresent;
    const status=options.length===0?'no_observed_static_soft_sell_definition':
      hasSingle?'one_configured_static_soft_sell_value':
      'ambiguous_or_missing_amount_static_soft_sell';
    if(hasSingle)priced++;
    else if(options.length===0)missing++;
    else ambiguous++;
    if(!hasSingle)unpricedUnits+=input.count;
    return freeze({
      ingredientItemId:input.itemId,
      quantity:input.count,
      sourceStaticPriceDatabaseKeys:freeze([...seenDatabases].sort()),
      sourceStaticSellOptions:freeze(options),
      otherCurrencyStaticSellOptions:otherCurrencies,
      configuredUnitSoftSellAmount:hasSingle?
        options[0].configuredUnitAmount:null,
      status,
      actualIngredientSellValueVerified:false,
      runtimePriceDatabaseSelectionVerified:false,
      fallbackRuleVerified:false,
      dynamicPriceEvaluationVerified:false,
      noObservedStaticPriceDoesNotMeanUnsellable:true
    });
  });
  return freeze({
    contract:DB02_MEAL_INGREDIENT_SELL_EVIDENCE_CONTRACT,
    currencyId:SOURCE_SOFT_CURRENCY_ID,
    ingredientRows:freeze(entries),
    totalIngredientUnits:totalUnits,
    ingredientsWithSingleConfiguredStaticAmount:priced,
    ingredientsWithoutObservedStaticSoftAmount:missing,
    ingredientsWithAmbiguousOrMissingAmount:ambiguous,
    unitsWithoutSingleConfiguredStaticAmount:unpricedUnits,
    inputSourceAuthenticated:false,
    fullIngredientValuesKnownFromStaticSources:
      entries.length>0&&priced===entries.length,
    // Even full static row coverage cannot prove runtime sale prices.
    actualNativeIngredientPricesVerified:false,
    mealSellPriceComputed:false,
    realizedMealSellPrice:null,
    publishable:false
  });
}
