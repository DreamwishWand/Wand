#!/usr/bin/env node
/**
 * Owner-private Steam v1.26.2 cooking-price provenance smoke.
 * Authenticates both original ZIPs. Generates synthetic MealData only.
 * Never reads player saves, prints game IDs/prices, or writes private records.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readOriginalPriceReleaseZip}
  from './smoke_private_stall_price_runtime.mjs';
import {openPrivateSrc02Archive} from '../../src/lib/acquisition/private-browser-bundle.mjs';
import {loadPrivateMealPricingView,compareMealIngredientStates}
  from '../../src/lib/acquisition/meal-price-evidence.mjs';

const R5_SHA='7914b88b4d7c546ee362a907d9a66691debcafc54caefb0815254edc10fa7fb8';
const SHA256=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw new TypeError('DB02_MEAL_PRICE_SMOKE_'+code);};
const requireValue=(yes,code)=>{if(!yes)fail(code);};
const varint=x=>{
  let v=BigInt(x),out=[];
  do{let c=Number(v&127n);v>>=7n;if(v)c|=128;out.push(c);}while(v);
  return out;
};
const sub=(field,data)=>[...varint(field*8+2),...varint(data.length),...data];
const fakeMealData=ids=>{
  const packed=ids.flatMap(varint);
  return Uint8Array.from(sub(1,sub(1,packed)));
};
function readLocalZip(path,expected){
  const contents=readFileSync(path);
  requireValue(contents.length>0&&contents.length<=2*1024*1024&&
    SHA256(contents)===expected,'UNTRUSTED_ZIP');
  return new Uint8Array(contents);
}
/** @returns {Promise<object>} Aggregate evidence ONLY. */
export async function runPrivateMealPriceSmoke(r5Path,staticPricePath,protoDbPath){
  const r5=readLocalZip(r5Path,R5_SHA);
  const priceZip=readFileSync(staticPricePath);
  const prices=readOriginalPriceReleaseZip(priceZip);
  const view=await loadPrivateMealPricingView({
    acquisitionArchiveBytes:r5,
    priceManifestBytes:prices.manifestBytes,
    priceFiles:prices.files,
    ...(protoDbPath===undefined?{}:{protoDbBytes:new Uint8Array(readFileSync(protoDbPath))})
  });
  requireValue(view.verifiedPrivateSources===true&&
    view.realizedSellPricesVerified===false&&
    view.nativePriceFormulaEvaluated===false&&
    view.publishable===false,'INVALID_EVIDENCE_BOUNDARY');

  const cacheLifecycle=view.sourceNativeDynamicCacheLifecyclePlan;
  requireValue(cacheLifecycle?.contract===
      'wand.db02.native-dynamic-cache-lifecycle@1'&&
    cacheLifecycle.sourceSnapshotLoaded===(protoDbPath!==undefined)&&
    cacheLifecycle.nativeOnBinarizeDirectlyDelegatesToCacheData===true&&
    cacheLifecycle.nativeCacheDataReplacesCachedDataField===true&&
    cacheLifecycle.nativeRuntimeCacheDataInvoked===null&&
    cacheLifecycle.nativeRuntimeCacheMatchesOriginalSnapshot===null&&
    cacheLifecycle.actualIngredientOrMealSellPrice===null&&
    cacheLifecycle.authorizedForDisplayAsSellPrice===false,
    'NATIVE_DYNAMIC_CACHE_LIFECYCLE_BOUNDARY');
  if(protoDbPath!==undefined){
    const hypotheticalEmpty=view.getHypotheticalNativeDynamicCacheRebuildPlan(0);
    const hypotheticalPositive=view.getHypotheticalNativeDynamicCacheRebuildPlan(100);
    requireValue(
      cacheLifecycle.originalSourceSerializedCacheRows===8549&&
      cacheLifecycle.originalSourceDataCachedByNativeRule===true&&
      hypotheticalEmpty.hypotheticalUncachedSellFormulaPathEligibleAfterRebuild===true&&
      hypotheticalPositive.hypotheticalUncachedSellFormulaPathEligibleAfterRebuild===false&&
      hypotheticalEmpty.nativeRuntimeCacheRowCount===null&&
      hypotheticalPositive.actualIngredientOrMealSellPrice===null,
      'NATIVE_DYNAMIC_CACHE_HYPOTHETICAL_BRANCHES');
  }else requireValue(
    cacheLifecycle.originalSourceSerializedCacheRows===null&&
    cacheLifecycle.originalSourceDataCachedByNativeRule===null&&
    view.getHypotheticalNativeDynamicCacheRebuildPlan(null).
      hypotheticalNativeDataCachedAfterRebuild===null,
    'NATIVE_DYNAMIC_CACHE_UNLOADED_STATE');

  let authenticatedNativeStarResults=0;
  if(protoDbPath!==undefined){
    requireValue(view.nativeStarSettingsVerified===true&&
      view.nativeCookingStarSettings?.verifiedPrivateOriginal===true&&
      view.nativeCookingStarSettings.formulaBodyVerified===false,
      'NATIVE_STAR_SOURCE_AUTHENTICATION');
    for(let star=1;star<=5;star++){
      const row=view.getSourceStarResult(star);
      requireValue(row?.starRating===star&&
        row.sellPriceIngredientPercentage>0&&
        row.actualSellPriceFormulaVerified===false&&
        row.roundingRuleVerified===false,
        'NATIVE_STAR_ROWS');
      authenticatedNativeStarResults++;
    }
    const cache=view.nativeDynamicPriceCache;
    requireValue(view.nativeDynamicCacheVerified===true&&
      cache?.originalSourceVerified===true&&
      cache.cacheRowCount===8549&&
      cache.purchaseOnlyRowCount===8068&&
      cache.sellOnlyRowCount===481&&
      cache.bothPurchaseAndSellRowCount===0&&
      cache.sellCurrencyAmountFieldsPresent===7&&
      cache.sellCurrencyAmountFieldsAbsent===474&&
      cache.sourcePurchaseFormulaReferenceCount===4&&
      cache.sourceSellFormulaReferenceCount===1&&
      cache.sourcePurchaseFormulaItemIds?.length===4&&
      cache.sourceSellFormulaItemIds?.length===1&&
      cache.formulaReferencesAuthenticated===true&&
      cache.formulaDefinitionsResolved===false&&
      cache.formulaCurrencyAndItemTypeEligibilityVerified===false&&
      cache.formulaEquationEvaluated===false&&
      Object.isFrozen(cache.sourceSellFormulaItemIds)&&
      Object.isFrozen(cache.sourcePurchaseFormulaItemIds)&&
      new Set(cache.sourceSellFormulaItemIds).size===1&&
      new Set(cache.sourcePurchaseFormulaItemIds).size===4&&
      cache.runtimeFormulaEvaluated===false&&
      cache.actualSellPricesVerified===false&&
      view.sourceNativeDynamicCacheGate?.cachedDataPresent===true&&
      view.sourceNativeDynamicCacheGate.serializedItemPricesCount===8549&&
      view.sourceNativeDynamicCacheGate.sourceDataCached===true&&
      view.sourceNativeDynamicCacheGate.runtimeDataCached===null&&
      view.sourceSellFormulaItemIds?.length===1&&
      view.sourcePurchaseFormulaItemIds?.length===4&&
      view.getSourceSellFormulaCandidatePlan(80000000)?.
        conditionalSelectionStatus==='unresolved_candidate_precedence'&&
      view.getSourceSellFormulaCandidatePlan(80000000)?.
        unresolvedCandidateDefinitionsCount===1&&
      view.nativeRuntimeDataCachedVerified===false,
      'DYNAMIC_PRICE_SOURCE_CENSUS');
  }else requireValue(view.nativeStarSettingsVerified===false&&
    view.nativeCookingStarSettings===null&&view.getSourceStarResult(1)===null&&
    view.nativeDynamicCacheVerified===false&&
    view.nativeDynamicPriceCache===null&&
    view.getSourceCachedDynamicPriceRow(31100053)===null&&
    view.sourceNativeDynamicCacheGate===null&&
    view.sourceSellFormulaItemIds===null&&
    view.sourcePurchaseFormulaItemIds===null&&
    view.getSourceSellFormulaCandidatePlan(80000000)===null,
    'STAR_AND_CACHE_SOURCE_ABSENCE_MISREPORTED');

  const originalArchive=openPrivateSrc02Archive(r5);
  const rawRecipes=await originalArchive.readFile('recipes.jsonl');
  const allRecipes=new TextDecoder().decode(rawRecipes).trim().split('\n').map(JSON.parse);
  const cooking=allRecipes.filter(r=>r.type==='cooking');
  const mealIds=new Set(cooking.map(r=>r.resultItemId));
  requireValue(cooking.length===625&&mealIds.size===618&&
    [...mealIds].every(x=>Number.isSafeInteger(x)&&
      Math.floor(x/100000)===303),'COOKING_CENSUS');

  const originalRows=new TextDecoder().decode(
    prices.files['static-item-prices.jsonl']).trim().split('\n').map(JSON.parse);
  const mealPurchases=originalRows.filter(
    r=>r.databaseKey==='Cooking_Meal_PriceDatabase');
  const bought=new Set(mealPurchases.map(r=>r.itemId));
  requireValue(mealPurchases.length===312&&bought.size===312&&
    [...bought].every(x=>mealIds.has(x))&&
    mealPurchases.every(x=>x.purchaseCostDefinitions.length>0&&
      x.sellValueDefinitions.length===0),'COOKING_PURCHASE_CANNOT_BECOME_SELL');

  const syntheticA=fakeMealData([31100001,30200001,31100001]);
  const syntheticB=fakeMealData([31100001,30200002,31100001]);
  let inspected=0,withStaticPurchaseRow=0,withoutStaticPurchaseRow=0;
  for(const mealId of mealIds){
    const a=view.inspect(mealId,syntheticA);
    requireValue(a.staticCookingRecipeIds.length>0&&
      a.state.ingredientsRecorded===true&&
      a.recordedIngredients.length===2&&
      a.nativeIngredientRoutingImplementationVerified===true&&
      a.sourceNativeDynamicCacheLifecyclePlan===cacheLifecycle&&
      a.nativePriceProviderTopologyVerified===true&&
      a.sourceSellFormulaCandidatePlan===
        (protoDbPath===undefined?null:a.sourceSellFormulaCandidatePlan)&&
      (protoDbPath===undefined||
        (a.sourceSellFormulaCandidatePlan?.
          conditionalFirstFormulaItemId===null&&
         a.sourceSellFormulaCandidatePlan?.
          unresolvedCandidateDefinitionsCount===1&&
         a.sourceSellFormulaCandidatePlan?.
          effectiveItemSellPrice===null))&&
      a.nativeSellFormulaRuntimeResolutionVerified===false&&
      a.nativeMealPriceProviderPlan.nativeClassEvidence==='MealItemData'&&
      a.nativeMealPriceProviderPlan.itemSpecificCalculatorMayBeCalled===true&&
      a.nativeMealPriceProviderPlan.actualUnitSellPrice===null&&
      a.sourceIngredientProviderPlans.length===2&&
      a.sourceIngredientStaticProviderSimulations.length===2&&
      a.sourceIngredientStaticProviderSimulations.every(rows=>
        rows.every(r=>r.actualSellPrice===null&&
          r.originalRuntimeProviderSelected===null))&&
      a.nativeStaticProviderResultsAreSourceConditionalOnly===true&&
      a.sourceIngredientProviderPlans.every(p=>
        p.itemSellPriceCalculatorInterfaceInNativeMetadata===false&&
        p.actualUnitSellPrice===null)&&
      a.nativeIngredientRuntimePricesVerified===false&&
      a.nativeLookupDefaultCannotReplaceUnknownSourcePrices===true&&
      a.nativeIngredientPriceRoute.ingredientSource==='recorded_ingredients_used'&&
      a.nativeIngredientPriceRoute.recordedIngredientIds.length===3&&
      a.nativeIngredientPriceRoute.recordedIngredientIds[0]===31100001&&
      a.nativeIngredientPriceRoute.recordedIngredientIds[1]===30200001&&
      a.nativeIngredientPriceRoute.recordedIngredientIds[2]===31100001&&
      a.nativeIngredientPriceRoute.nativeDefaultSoftSellIfLookupFails===1&&
      a.nativeIngredientPriceRoute.originalNativeIngredientLookupSucceeded===null&&
      a.sellPrice===null&&a.sellPriceComputed===false&&
      a.purchasePriceIsNotSellPrice===true&&
      a.cookingRecipeIngredientMatchVerified===false&&
      a.nativeImplementationBodyVerified===false&&
      a.publishable===false,'SOURCE_PRICE_CONFLATION');
    const n=a.purchasePriceSourceRows.length;
    requireValue((bought.has(mealId)&&n===1)||
      (!bought.has(mealId)&&n===0),'MEAL_PURCHASE_ROW_MISMATCH');
    if(n)withStaticPurchaseRow++;
    else withoutStaticPurchaseRow++;
    inspected++;
  }
  // Native per-instance SOURCE SellPrices census, never a cooking price formula.
  // Each inspected ItemState here has a single SYNTHETIC ingredient; these
  // contexts are not claimed to satisfy a game's cooking recipe.
  const fixedIngredients=new Map();
  for(const recipe of cooking){
    for(const ing of recipe.ingredients){
      if(ing.kind==='item'&&!fixedIngredients.has(ing.itemId))
        fixedIngredients.set(ing.itemId,recipe.resultItemId);
    }
  }
  requireValue(fixedIngredients.size===371,'STATIC_FIXED_INGREDIENT_CENSUS');
  let withConfiguredSoftSell=0,withoutConfiguredSoftSell=0;
  let cachedDynamicBuyIngredientRows=0,cachedDynamicSellIngredientRows=0;
  let fixedIngredientsWithNativeItemCalculator=0;
  let fixedIngredientsWithConditionalStaticProviderMatch=0;
  for(const [ingredientId,mealId] of fixedIngredients){
    const evidence=view.inspect(mealId,fakeMealData([ingredientId]));
    const source=evidence.sourceIngredientStaticSellEvidence;
    const priceProvider=view.getNativeSellPriceProviderPlan(ingredientId);
    const conditionalStatic=view.getSourceStaticSellProviderSimulations(ingredientId);
    requireValue(conditionalStatic.every(r=>
      r.itemId===ingredientId&&
      r.currencyId===80000000&&
      r.originalRuntimeProviderSelected===null&&
      r.actualSellPrice===null),
      'STATIC_NATIVE_PROVIDER_ORIGINAL_SOURCE_CONDITIONAL_ONLY');
    const conditionalMatch=conditionalStatic.filter(r=>
      r.conditionalNativeTryGetSellPriceSucceeded);
    if(conditionalMatch.length>0)fixedIngredientsWithConditionalStaticProviderMatch++;
    const originalClass=({302:'CropItemData',310:'FishItemData',
      311:'IngredientItemData'})[Math.floor(ingredientId/100000)];
    requireValue(originalClass!==undefined&&
      priceProvider.nativeClassEvidence===originalClass&&
      priceProvider.itemSellPriceCalculatorInterfaceInNativeMetadata===false&&
      priceProvider.runtimePriceProviderSelected===null&&
      priceProvider.actualUnitSellPrice===null&&
      priceProvider.defaultOneAppliesOnlyAfterRuntimeLookupFailure===true&&
      evidence.sourceIngredientProviderPlans.length===1&&
      evidence.sourceIngredientProviderPlans[0].nativeClassEvidence===originalClass,
      'NATIVE_ORIGINAL_FIXED_INGREDIENT_CLASS');
    if(priceProvider.itemSpecificCalculatorMayBeCalled)
      fixedIngredientsWithNativeItemCalculator++;
    requireValue(
      evidence.ingredientStaticPriceDatabaseOriginalVerified===true&&
      evidence.staticIngredientAmountsNotEffectiveSellValues===true&&
      source.ingredientRows.length===1&&
      source.ingredientRows[0].ingredientItemId===ingredientId&&
      source.inputSourceAuthenticated===false&&
      source.actualNativeIngredientPricesVerified===false&&
      source.mealSellPriceComputed===false&&
      source.realizedMealSellPrice===null,
      'INGREDIENT_SELL_SOURCE_BOUNDARY');
    if(protoDbPath!==undefined){
      const dynamic=evidence.sourceIngredientDynamicCacheEvidence;
      requireValue(evidence.nativeDynamicCacheSourceVerified===true&&
        evidence.dynamicCachedSellRowCannotProveEffectivePrice===true&&
        dynamic?.length===1&&dynamic[0].itemId===ingredientId&&
        dynamic[0].originalSourceAuthenticated===true&&
        dynamic[0].runtimeFormulaEvaluated===false&&
        dynamic[0].effectiveSellPriceVerified===false&&
        dynamic[0].sellPrice===null,
        'DYNAMIC_CACHE_EVIDENCE_NOT_AUTHENTICATED');
      if(dynamic[0].cachedPurchaseRowPresent)cachedDynamicBuyIngredientRows++;
      if(dynamic[0].cachedSellRowPresent)cachedDynamicSellIngredientRows++;
    }else requireValue(evidence.sourceIngredientDynamicCacheEvidence===null&&
      evidence.nativeDynamicCacheSourceVerified===false,
      'UNVERIFIED_CACHE_MISLABELED');
    if(source.ingredientsWithSingleConfiguredStaticAmount===1){
      requireValue(source.ingredientRows[0].sourceStaticSellOptions.length===1&&
        source.ingredientRows[0].sourceStaticSellOptions[0].currencyId===80000000,
        'NATIVE_SOFT_SELL_CURRENCY');
      requireValue(conditionalMatch.length===1&&
        conditionalMatch[0].sourceSellCostAmountFieldPresent===true&&
        conditionalMatch[0].conditionalNativeOutPrice===
          source.ingredientRows[0].configuredUnitSoftSellAmount,
        'STATIC_NATIVE_PROVIDER_SOURCE_VALUE_DISAGREEMENT');
      withConfiguredSoftSell++;
    }else{
      requireValue(source.ingredientsWithoutObservedStaticSoftAmount===1&&
        source.ingredientRows[0].configuredUnitSoftSellAmount===null,
        'UNKNOWN_INGREDIENT_SOURCE_STATUS');
      withoutConfiguredSoftSell++;
    }
  }
  requireValue(withConfiguredSoftSell===211&&
    withoutConfiguredSoftSell===160&&
    fixedIngredientsWithNativeItemCalculator===0,
    'FIXED_INGREDIENT_SELL_AND_TYPE_CENSUS');
  if(protoDbPath!==undefined)requireValue(
    cachedDynamicBuyIngredientRows===0&&cachedDynamicSellIngredientRows===0,
    'DYNAMIC_CACHE_FIXED_INGREDIENT_OVERLAP');

  const firstId=mealIds.values().next().value;
  const fallback=view.inspect(firstId,fakeMealData([]));
  requireValue(fallback.state.mealDataPresent===true&&
    fallback.state.ingredientsRecorded===false&&
    fallback.nativeIngredientPriceRoute.ingredientSource===
      'recipe_lowest_price_ingredients'&&
    fallback.nativeIngredientPriceRoute.fallbackSelectionRequiresNativeItemPrices===true&&
    fallback.nativeIngredientPriceRoute.recordedIngredientIds===null&&
    fallback.nativeIngredientPriceRoute.actualMealSellPrice===null&&
    fallback.sellPrice===null,'NATIVE_LOWEST_RECIPE_FALLBACK_UNVERIFIED');
  const left=view.inspect(firstId,syntheticA);
  const right=view.inspect(firstId,syntheticB);
  const comparison=compareMealIngredientStates(left,right);
  requireValue(comparison.differentIngredientComposition===true&&
    comparison.pricesMayDiffer===true&&
    comparison.pricesCompared===false&&
    comparison.actualSellPrices===null,'INGREDIENT_STATE_NOT_PRESERVED');
  requireValue(inspected===618&&withStaticPurchaseRow===312&&
    withoutStaticPurchaseRow===306,'SMOKE_CENSUS');
  return Object.freeze({
    schema:'wand.db02.private-meal-state-smoke@1',
    status:'EXACT_PRIVATE_MEAL_STATE_JS_PASS',
    platform:'Steam',gameVersion:'1.26.2',
    sourceManifestVerified:true,
    recipeDefinitions:cooking.length,
    uniqueMealResultItems:mealIds.size,
    inspectedItemIds:inspected,
    staticPurchaseRows:withStaticPurchaseRow,
    mealsWithoutStaticPurchaseRows:withoutStaticPurchaseRow,
    originalStaticMealSellPriceRows:0,
    uniqueFixedRecipeIngredients:fixedIngredients.size,
    fixedIngredientItemsWithConfiguredSoftSell:withConfiguredSoftSell,
    fixedIngredientItemsWithoutStaticSoftSell:withoutConfiguredSoftSell,
    fixedIngredientItemsWithNativeOwnCalculator:fixedIngredientsWithNativeItemCalculator,
    originalSourceDynamicCacheGateTrue:
      protoDbPath===undefined?null:view.sourceNativeDynamicCacheGate.sourceDataCached,
    fixedIngredientsWithConditionalStaticProviderMatch,
    conditionalStaticProviderMatchIsNotRuntimePrice:true,
    mealNativeItemCalculatorInterfaceSupported:true,
    threeStageNativeTryGetSellPriceTopologyVerified:true,
    nativeActualProviderSelected:false,
    nativeDynamicCacheRebuildCodeVerified:true,
    nativeDynamicCacheRebuildObservedInGame:false,
    cachedDynamicPurchaseOverlapWithFixedIngredients:
      protoDbPath===undefined?null:cachedDynamicBuyIngredientRows,
    cachedDynamicSellOverlapWithFixedIngredients:
      protoDbPath===undefined?null:cachedDynamicSellIngredientRows,
    nativeDynamicCacheRowsAuthenticated:
      protoDbPath===undefined?0:view.nativeDynamicPriceCache.cacheRowCount,
    nativeDynamicCachedSellRows:
      protoDbPath===undefined?0:view.nativeDynamicPriceCache.sellOnlyRowCount,
    authenticatedSellFormulaReferences:
      protoDbPath===undefined?0:view.sourceSellFormulaItemIds.length,
    authenticatedPurchaseFormulaReferences:
      protoDbPath===undefined?0:view.sourcePurchaseFormulaItemIds.length,
    nativeFormulaCurrencyAndTypePathVerified:true,
    actualFormulaCurrencyAndTypeMatchVerified:false,
    authenticatedNativeStarResults,
    salePriceComputed:false,
    serializedIngredientsRetained:true,
    nativeIngredientSelectionBranchVerified:true,
    nativeDefaultSoftSellPriceOnLookupFailure:1,
    nativeFallbackReturnsUnverifiedItemComposition:true,
    actualUserSaveRead:false,
    writable:false,publishable:false
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if((args.length!==4&&args.length!==6)||args[0]!=='--r5-zip'||
     args[2]!=='--price-zip'||(args.length===6&&args[4]!=='--protodb'))
    fail('USAGE');
  runPrivateMealPriceSmoke(args[1],args[3],args.length===6?args[5]:undefined)
    .then(row=>console.log(JSON.stringify(row,null,2)))
    .catch(err=>{console.error(String(err));process.exitCode=1;});
}
