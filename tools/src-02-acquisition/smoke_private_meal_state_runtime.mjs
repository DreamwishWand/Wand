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
  }else requireValue(view.nativeStarSettingsVerified===false&&
    view.nativeCookingStarSettings===null&&view.getSourceStarResult(1)===null,
    'STAR_SETTINGS_ABSENCE_MISREPORTED');

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
  const firstId=mealIds.values().next().value;
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
    authenticatedNativeStarResults,
    salePriceComputed:false,
    serializedIngredientsRetained:true,
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
