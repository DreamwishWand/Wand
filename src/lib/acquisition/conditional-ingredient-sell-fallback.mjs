/**
 * DB-02 Steam 1.26.2 source-snapshot counterfactual, NOT a price lookup.
 *
 * The game's ingredient helpers pass default=1 to
 * ItemPriceDatabases.GetSoftCurrencySellPrice, which calls
 * TryGetSellPrice and returns that default ONLY when lookup fails.
 *
 * A missing original serialized source row does not prove live failure.
 * This module explains exactly which UNVERIFIED runtime conditions would
 * make the native default path apply, and never exposes an actual price.
 */
export const DB02_CONDITIONAL_INGREDIENT_FALLBACK_CONTRACT=
  'wand.db02.conditional-ingredient-soft-sell-fallback@1';
const fail=code=>{throw new TypeError('DB02_CONDITIONAL_INGREDIENT_FALLBACK_'+code);};
const check=(ok,code)=>{if(!ok)fail(code);};
const validId=x=>Number.isSafeInteger(x)&&x>0&&x<=2147483647;
const freeze=Object.freeze;
const ASSUMPTIONS=freeze([
  'runtime_item_class_identity_matches_original_il2cpp',
  'runtime_registered_price_provider_set_matches_original_11',
  'runtime_registered_provider_item_rows_match_original_source',
  'runtime_dynamic_cache_matches_original_positive_8549_row_snapshot',
  'runtime_has_no_unobserved_sell_price_override'
]);
const STATUS=freeze({
  incomplete:'incomplete_original_source_snapshot',
  present:'original_price_row_present',
  type:'native_item_type_or_calculator_not_supported',
  cached:'source_dynamic_cache_not_positive',
  eligible:'conditional_default_one_if_live_conditions_match'
});

/**
 * All objects supplied here are *untrusted inputs* unless the calling
 * private loader independently SHA-authenticated them first.
 *
 * @param {{
 *  itemId:number,
 *  sourceRowCoverage:object,
 *  nativeSellProviderPlan:object,
 *  sourceDynamicCacheGate?:object|null
 * }} input
 */
export function classifyConditionalIngredientSoftSellFallback(input={}){
  check(input!==null&&typeof input==='object'&&!Array.isArray(input),
    'INVALID_INPUT');
  const {itemId,sourceRowCoverage,nativeSellProviderPlan,
    sourceDynamicCacheGate=null}=input;
  check(validId(itemId)&&sourceRowCoverage!==null&&
    typeof sourceRowCoverage==='object'&&
    sourceRowCoverage.contract==='wand.db02.ingredient-source-row-coverage@1'&&
    sourceRowCoverage.itemId===itemId&&
    nativeSellProviderPlan!==null&&
    typeof nativeSellProviderPlan==='object'&&
    nativeSellProviderPlan.contract==='wand.db02.native-sell-provider-plan@1'&&
    nativeSellProviderPlan.itemId===itemId,
    'INVALID_SOURCE_EVIDENCE');
  check(sourceDynamicCacheGate===null||(
    typeof sourceDynamicCacheGate==='object'&&
    sourceDynamicCacheGate.contract==='wand.db02.dynamic-source-cache-gate@1'&&
    sourceDynamicCacheGate.nativeGateVerifiedSteam1262===true&&
    typeof sourceDynamicCacheGate.sourceDataCached==='boolean'&&
    sourceDynamicCacheGate.staticSnapshotOnly===true),
    'INVALID_CACHE_EVIDENCE');
  const originalSnapshotComplete=
    sourceRowCoverage.dynamicSourceSnapshotProvided===true&&
    sourceDynamicCacheGate!==null;
  const rowAbsent=originalSnapshotComplete&&
    sourceRowCoverage.sourceRecordStatus==='no_serialized_source_price_row'&&
    sourceRowCoverage.sourceRowAbsentAcrossStaticAndDynamicSnapshots===true&&
    sourceRowCoverage.staticSourceRowCount===0&&
    sourceRowCoverage.dynamicSourcePurchaseRowPresent===false&&
    sourceRowCoverage.dynamicSourceSellRowPresent===false;
  check(!originalSnapshotComplete||
    sourceRowCoverage.sourceRecordStatus!=='no_serialized_source_price_row'||
    rowAbsent,'SOURCE_ROW_STATE_CONTRADICTION');
  const nativeClassKnownWithoutCalculator=
    nativeSellProviderPlan.nativeTopologyVerifiedSteam1262===true&&
    nativeSellProviderPlan.itemSellPriceCalculatorInterfaceInNativeMetadata===false&&
    ['CropItemData','FishItemData','IngredientItemData']
      .includes(nativeSellProviderPlan.nativeClassEvidence)&&
    Math.floor(itemId/100000)===
      ({CropItemData:302,FishItemData:310,IngredientItemData:311}
       [nativeSellProviderPlan.nativeClassEvidence]);
  const nativeCacheBypassesFormula=
    sourceDynamicCacheGate?.sourceDataCached===true&&
    sourceDynamicCacheGate.cachedDataPresent===true&&
    sourceDynamicCacheGate.serializedItemPricesCount===8549;
  const conditional=rowAbsent&&nativeClassKnownWithoutCalculator&&
    nativeCacheBypassesFormula;
  const status=!originalSnapshotComplete?STATUS.incomplete:
    !rowAbsent?STATUS.present:
    !nativeClassKnownWithoutCalculator?STATUS.type:
    !nativeCacheBypassesFormula?STATUS.cached:STATUS.eligible;
  return freeze({
    contract:DB02_CONDITIONAL_INGREDIENT_FALLBACK_CONTRACT,
    itemId,
    sourceInputIndependentlyAuthenticatedByThisFunction:false,
    originalSourceSnapshotCompletelyProvided:originalSnapshotComplete,
    originalSerializedPriceRowAbsent:originalSnapshotComplete?
      rowAbsent:null,
    sourceSnapshotPositiveCacheGate:sourceDynamicCacheGate?.sourceDataCached??null,
    originalNativeClassHasNoDirectSellCalculator:nativeClassKnownWithoutCalculator,
    originalNativeFallbackDefaultArgument:1,
    originalNativeFailureRequiredForFallback:true,
    hypotheticalOriginalSourcePathStatus:status,
    nativeConditionalFallbackValueOnlyIfAssumptionsHold:conditional?1:null,
    conditionalOriginalSourcePathSupportsDefaultOne:conditional,
    unverifiedLiveRuntimeAssumptions:ASSUMPTIONS,
    nativeRuntimeRegisteredProvidersVerified:false,
    nativeRuntimeCacheUnchangedVerified:false,
    nativeRuntimeItemClassVerified:false,
    nativeRuntimeLookupFailedVerified:false,
    actualNativeFallbackSelected:null,
    actualUnitSellPrice:null,
    authorizedForDisplayAsSalePrice:false,
    publishable:false,writable:false
  });
}
