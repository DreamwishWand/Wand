/**
 * DB-02: native per-instance cooking ingredients and sell-price provenance.
 * The same Meal Item ID may carry different MealData.IngredientsUsed.
 * This module never executes the proprietary MealItemData.GetSellPrice method,
 * invents sell values or equates Cooking_Meal purchase prices with sale values.
 *
 * Wire layout: Steam IL2CPP ItemState.MealData=field 1 (message);
 * MealData.IngredientsUsed=field 1 (repeated int32; packed OR unpacked).
 */
import {loadPrivateSrc02BrowserBundle,CURRENT_STEAM_1262_CONDITION_SHA256}
  from './private-browser-bundle.mjs';
import {loadPrivateShopPriceView} from './private-shop-prices.mjs';
import {loadPrivateCookingStarSettings} from './private-cooking-star-settings.mjs';
import {collectConfiguredIngredientSellEvidence} from './meal-ingredient-sell-evidence.mjs';
import {loadPrivateDynamicPriceCache} from './private-dynamic-price-cache.mjs';
import {classifyNativeMealSellPriceRoute} from './native-meal-price-route.mjs';
import {nativeSellPriceProviderPlan} from './native-sell-provider-plan.mjs';
import {classifyNativeSerializedDynamicCache,simulateNativeSerializedSellProvider}
  from './native-serialized-sell-provider.mjs';
import {classifyConditionalNativeSellFormulaCandidates}
  from './native-sell-formula-candidates.mjs';
import {classifyIngredientSerializedPriceRowCoverage}
  from './ingredient-source-row-coverage.mjs';

export const DB02_MEAL_PRICE_VIEW_CONTRACT='wand.db02.private-meal-pricing-view@1';
export const DB02_MEAL_PRICE_EVIDENCE_CONTRACT='wand.db02.meal-price-evidence@1';
const SRC02_R5_SHA='ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c';
const STATIC_PRICE_SHA='641f1b5c5268f136de7bf345f372f06bde923ce0f1f24871225a97913091e975';
const MAX_BYTES=4096,MAX_INGREDIENTS=32;
const EMPTY=Object.freeze([]);
const fail=code=>{throw new TypeError('DB02_MEAL_PRICE_'+code);};
const check=(test,code)=>{if(!test)fail(code);};
const validId=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const frozen=Object.freeze;

function readVarint(bytes,at,end){
  let value=0n;
  for(let i=0;i<10&&at<end;i++){
    const b=bytes[at++];
    if(i===9&&b>1)fail('VARINT_OVERFLOW');
    value|=BigInt(b&127)<<BigInt(i*7);
    if(!(b&128)){
      if(i&&b===0)fail('NONCANONICAL_VARINT');
      return [value,at];
    }
  }
  fail('TRUNCATED_VARINT');
}
function scan(bytes,start,end,process){
  let at=start,fields=0;
  while(at<end){
    if(++fields>512)fail('TOO_MANY_FIELDS');
    const [tag,next]=readVarint(bytes,at,end);
    at=next;
    const field=Number(tag>>3n),kind=Number(tag&7n);
    check(field>0&&field<=536870911&&[0,1,2,5].includes(kind),
      'INVALID_WIRE_TAG');
    let val;
    if(kind===0)[val,at]=readVarint(bytes,at,end);
    else if(kind===2){
      const [length,p]=readVarint(bytes,at,end);
      check(length<=BigInt(end-p),'TRUNCATED_MESSAGE');
      at=p+Number(length);val=[p,at];
    }else{
      const length=kind===1?8:4;
      check(end-at>=length,'TRUNCATED_FIXED');
      val=[at,at+length];at+=length;
    }
    process(field,kind,val);
  }
  check(at===end,'INCOMPLETE_MESSAGE');
}
function positiveNativeId(raw){
  check(raw<=2147483647n&&raw>0n,'INVALID_INGREDIENT_ID');
  return Number(raw);
}
function listMealIngredients(bytes,start,end){
  const used=[];
  scan(bytes,start,end,(field,kind,value)=>{
    if(field===1){
      if(kind===0)used.push(positiveNativeId(value));
      else if(kind===2){
        let at=value[0];
        while(at<value[1]){
          const [v,next]=readVarint(bytes,at,value[1]);
          used.push(positiveNativeId(v));at=next;
          check(used.length<=MAX_INGREDIENTS,'TOO_MANY_INGREDIENTS');
        }
      }else fail('INGREDIENT_FIELD_WIRE_KIND');
      check(used.length<=MAX_INGREDIENTS,'TOO_MANY_INGREDIENTS');
    }else if(field===2){
      // SceneRestriction is a nullable native wrapper and is NOT a price.
      check(kind===2,'SCENE_RESTRICTION_WIRE_KIND');
    }
  });
  return used;
}
/**
 * Accept the exact ItemState protobuf SUBMESSAGE, not a whole player save.
 * Does not try to locate it in an encrypted/compressed profile.
 */
export function decodeMealItemStateEvidence(bytes){
  check(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=MAX_BYTES,
    'INVALID_BYTES');
  let mealRange=null,otherState=false;
  scan(bytes,0,bytes.length,(field,kind,value)=>{
    if(field===1){
      check(kind===2&&!mealRange,'MEAL_STATE_WIRE_KIND_OR_DUPLICATE');
      mealRange=value;
    }else if(field>=2&&field<=6)otherState=true;
  });
  check(!otherState,'MIXED_ONEOF_STATES');
  const ingredientIds=mealRange?listMealIngredients(bytes,...mealRange):null;
  const totals=new Map();
  for(const id of ingredientIds??[])totals.set(id,(totals.get(id)??0)+1);
  const ingredientAmounts=frozen([...totals.entries()]
    .sort((a,b)=>a[0]-b[0])
    .map(([itemId,count])=>frozen({itemId,count})));
  return frozen({
    contract:DB02_MEAL_PRICE_EVIDENCE_CONTRACT,
    nativeType:'Definitions.Items.ItemState',
    nativeMealFieldNumber:1,
    nativeIngredientsUsedFieldNumber:1,
    mealDataPresent:mealRange!==null,
    ingredientsRecorded:ingredientIds!==null&&ingredientIds.length>0,
    serializedIngredientIds:ingredientIds===null?null:frozen(ingredientIds),
    ingredientAmounts,
    distinctIngredientCount:ingredientAmounts.length,
    sourceStateOnly:true,
    saveCodecVerified:false,
    nativeBuildCompatibilityVerified:false,
    salePrice:null,retailPrice:null,salePriceComputed:false,
    publishable:false,writable:false
  });
}
/**
 * Works only with TWO independently SHA-verified private source views.
 * A static Cooking_Meal_PriceDatabase "Prices" row is PURCHASE evidence.
 * Never derive a state-dependent SELL price from that row.
 */
function inspectAuthenticatedMeal({acquisitionBundle,shopPriceView,nativeCache,mealItemId,itemStateBytes}){
  check(validId(mealItemId)&&Math.floor(mealItemId/100000)===303,
    'MEAL_ITEM_ID_REQUIRED');
  const state=decodeMealItemStateEvidence(itemStateBytes);
  const nativeIngredientPriceRoute=classifyNativeMealSellPriceRoute(state);
  const nativeMealPriceProviderPlan=nativeSellPriceProviderPlan(mealItemId);
  const linked=acquisitionBundle.getItem(mealItemId);
  const cookingRecipes=(linked?.madeBy??[]).filter(
    row=>row.type==='cooking'&&row.resultItemId===mealItemId);
  const priceDefinitions=shopPriceView.getSourceItemPriceDefinitions(mealItemId);
  check(priceDefinitions.every(row=>
    row.databaseKey==='Cooking_Meal_PriceDatabase'&&
    row.currentShopPriceVerified===false&&
    row.sellValueDefinitions.length===0),
    'UNEXPECTED_MEAL_PRICE_DEFINITIONS');
  const ingredientAmounts=state.ingredientAmounts;
  const sourceIngredientProviderPlans=frozen(ingredientAmounts.map(x=>
    nativeSellPriceProviderPlan(x.itemId)));
  const sourceIngredientStaticSellEvidence=collectConfiguredIngredientSellEvidence(
    ingredientAmounts,id=>shopPriceView.getSourceItemPriceDefinitions(id));
  const sourceIngredientStaticProviderSimulations=frozen(ingredientAmounts.map(x=>
    frozen(shopPriceView.getSourceItemPriceDefinitions(x.itemId).map(row=>
      simulateNativeSerializedSellProvider({providerKind:'static',
        itemId:x.itemId,currencyId:80000000,sourcePriceRow:row})))));
  const sourceIngredientSerializedPriceRowCoverage=frozen(ingredientAmounts.map(x=>
    classifyIngredientSerializedPriceRowCoverage({
      itemId:x.itemId,
      staticRows:shopPriceView.getSourceItemPriceDefinitions(x.itemId),
      dynamicCacheLookup:nativeCache?.lookup(x.itemId)??null
    })));
  const sourceSellFormulaCandidatePlan=nativeCache===null?null:
    classifyConditionalNativeSellFormulaCandidates({
      formulaItemIds:nativeCache.sourceSellFormulaItemIds,
      forCurrencyId:80000000
    });
  const sourceIngredientDynamicCacheEvidence=nativeCache===null?null:
    frozen(ingredientAmounts.map(x=>nativeCache.lookup(x.itemId)));
  return frozen({
    contract:DB02_MEAL_PRICE_EVIDENCE_CONTRACT,
    mealItemId,platform:'Steam',gameVersion:'1.26.2',
    state,
    nativeIngredientPriceRoute,
    nativeMealPriceProviderPlan,
    sourceIngredientProviderPlans,
    nativePriceProviderTopologyVerified:true,
    nativeIngredientRoutingImplementationVerified:true,
    nativeIngredientRuntimePricesVerified:false,
    nativeLookupDefaultCannotReplaceUnknownSourcePrices:true,
    staticCookingRecipeIds:frozen(cookingRecipes.map(r=>r.recipeId).sort((a,b)=>a-b)),
    cookingRecipeCoverage:'partial_native_extraction',
    recordedIngredients:ingredientAmounts,
    sourceIngredientStaticSellEvidence,
    sourceIngredientStaticProviderSimulations,
    sourceIngredientSerializedPriceRowCoverage,
    originalSourceRowAbsenceIsNotRuntimePriceFailure:true,
    nativeStaticProviderResultsAreSourceConditionalOnly:true,
    sourceIngredientDynamicCacheEvidence,
    sourceSellFormulaCandidatePlan,
    nativeSellFormulaRuntimeResolutionVerified:false,
    nativeDynamicCacheSourceVerified:nativeCache!==null,
    dynamicCachedSellRowCannotProveEffectivePrice:true,
    ingredientStaticPriceDatabaseOriginalVerified:true,
    staticIngredientAmountsNotEffectiveSellValues:true,
    cookingRecipeIngredientMatchVerified:false,
    stateDependentSellPriceMethod:'MealItemData.GetSellPrice(ItemState,Item)',
    ingredientSellPriceMethod:'MealItemData.TotalIngredientsSellPrice(RecipeItemData,IEnumerable)',
    cookingStarAdjustmentField:'CookingData.RecipeStarResult.SellPriceIngredientPercentage',
    nativeImplementationBodyVerified:false,
    requiresActualSerializedIngredients:true,
    hasSerializedIngredients:state.ingredientsRecorded,
    purchasePriceSourceRows:frozen(priceDefinitions),
    purchasePriceIsNotSellPrice:true,
    // An absent SellPrices row does NOT mean a meal can be sold for zero.
    missingStaticSellValueMeansZero:false,
    sellPrice:null,sellPriceComputed:false,
    playerStateVerified:false,saveCodecVerified:false,
    publishable:false,writable:false
  });
}
/**
 * Authenticates original PRIVATE ZIP bytes independently before exposing
 * an offline-only per-instance meal-price evidence facade. No spoofable
 * caller-provided \u0027verified\u0027 view objects are trusted.
 */
export async function loadPrivateMealPricingView({
  acquisitionArchiveBytes,priceManifestBytes,priceFiles,protoDbBytes
}={}){
  const acquisitionBundle=await loadPrivateSrc02BrowserBundle(
    acquisitionArchiveBytes,{
      platform:'Steam',gameVersion:'1.26.2',
      manifestSha256:SRC02_R5_SHA,
      src01ManifestSha256:'1ebf71a19792bb2293a710cec533b1471e4e4f2c0e695a9d413bbcfc305022f6',
      currentConditionSha256:CURRENT_STEAM_1262_CONDITION_SHA256
    });
  const shopPriceView=await loadPrivateShopPriceView({
    manifestBytes:priceManifestBytes,files:priceFiles
  });
  const [nativeStars,nativeCache]=protoDbBytes===undefined?[null,null]:
    await Promise.all([
      loadPrivateCookingStarSettings(protoDbBytes),
      loadPrivateDynamicPriceCache(protoDbBytes)
    ]);
  check(acquisitionBundle?.verified===true&&
    acquisitionBundle.manifestSha256===SRC02_R5_SHA&&
    acquisitionBundle.source?.platform==='Steam'&&
    acquisitionBundle.source?.gameVersion==='1.26.2'&&
    acquisitionBundle.counts?.cooking===625&&
    shopPriceView?.verified===true&&
    shopPriceView.sourceManifestSha256===STATIC_PRICE_SHA&&
    shopPriceView.src02R5ManifestSha256===SRC02_R5_SHA,
    'ORIGINAL_SOURCE_CONTEXT_REQUIRED');
  const sourceNativeDynamicCacheGate=nativeCache===null?null:
    classifyNativeSerializedDynamicCache({cachedDataPresent:true,
      serializedItemPricesCount:nativeCache.cacheRowCount});
  return frozen({
    contract:DB02_MEAL_PRICE_VIEW_CONTRACT,
    platform:'Steam',gameVersion:'1.26.2',
    verifiedPrivateSources:true,
    currentOffersVerified:false,realizedSellPricesVerified:false,
    nativePriceFormulaEvaluated:false,publishable:false,writable:false,
    nativeStarSettingsVerified:nativeStars!==null,
    nativeCookingStarSettings:nativeStars,
    nativeDynamicCacheVerified:nativeCache!==null,
    nativeDynamicPriceCache:nativeCache,
    sourceSellFormulaItemIds:nativeCache?.sourceSellFormulaItemIds??null,
    sourcePurchaseFormulaItemIds:nativeCache?.sourcePurchaseFormulaItemIds??null,
    getSourceSellFormulaCandidatePlan:forCurrencyId=>{
      check(validId(forCurrencyId),'INVALID_FORMULA_CURRENCY_ID');
      return nativeCache===null?null:
        classifyConditionalNativeSellFormulaCandidates({
          formulaItemIds:nativeCache.sourceSellFormulaItemIds,forCurrencyId
        });
    },
    sourceNativeDynamicCacheGate,
    nativeRuntimeDataCachedVerified:false,
    getSourceStaticSellProviderSimulations:itemId=>{
      check(validId(itemId),'INVALID_STATIC_PROVIDER_ITEM_ID');
      return frozen(shopPriceView.getSourceItemPriceDefinitions(itemId).map(row=>
        simulateNativeSerializedSellProvider({providerKind:'static',
          itemId,currencyId:80000000,sourcePriceRow:row})));
    },
    getNativeSellPriceProviderPlan:itemId=>nativeSellPriceProviderPlan(itemId),
    getSourceIngredientPriceRowCoverage:itemId=>{
      check(validId(itemId),'INVALID_SOURCE_ROW_ITEM_ID');
      return classifyIngredientSerializedPriceRowCoverage({
        itemId,
        staticRows:shopPriceView.getSourceItemPriceDefinitions(itemId),
        dynamicCacheLookup:nativeCache?.lookup(itemId)??null
      });
    },
    getSourceCachedDynamicPriceRow:itemId=>{
      check(validId(itemId),'INVALID_DYNAMIC_ITEM_ID');
      return nativeCache?.lookup(itemId)??null;
    },
    getSourceStarResult:star=>{
      check(Number.isSafeInteger(star)&&star>=1&&star<=5,'INVALID_STAR_RATING');
      return nativeStars?.getStarResult(star)??null;
    },
    inspect:(mealItemId,itemStateBytes)=>inspectAuthenticatedMeal({
      acquisitionBundle,shopPriceView,nativeCache,mealItemId,itemStateBytes
    })
  });
}

/** Compare two serialized meal instances without inventing either sale price. */
export function compareMealIngredientStates(left,right){
  check(left?.contract===DB02_MEAL_PRICE_EVIDENCE_CONTRACT&&
    right?.contract===DB02_MEAL_PRICE_EVIDENCE_CONTRACT&&
    validId(left.mealItemId)&&left.mealItemId===right.mealItemId&&
    Array.isArray(left.recordedIngredients)&&Array.isArray(right.recordedIngredients),
    'SAME_MEAL_CONTEXT_REQUIRED');
  const x=left.recordedIngredients,y=right.recordedIngredients;
  const same=x.length===y.length&&x.every((a,i)=>
    a.itemId===y[i].itemId&&a.count===y[i].count);
  return frozen({mealItemId:left.mealItemId,
    sameSerializedIngredientMultiset:same,
    differentIngredientComposition:!same,
    ingredientDifferenceCouldAffectPrice:!same,
    pricesMayDiffer:true,priceEqualityVerified:false,pricesCompared:false,
    actualSellPrices:null,publishable:false});
}
