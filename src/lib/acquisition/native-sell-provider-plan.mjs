/**
 * Exact Steam and Switch v1.26.2 TryGetSellPrice provider topology.
 * Provenance: both original IL2CPP metadata sets + independently SHA-pinned
 * GameAssembly.dll and NSO0 executable code. This is a route map, NOT a
 * numeric price solver.
 */
export const DB02_NATIVE_SELL_PROVIDER_PLAN_CONTRACT=
  'wand.db02.native-sell-provider-plan@1';
const fail=code=>{throw new TypeError('DB02_NATIVE_SELL_PROVIDER_'+code);};
const check=(ok,code)=>{if(!ok)fail(code);};
const freeze=Object.freeze;
const knownFamilies=freeze({
  302:freeze({nativeClass:'CropItemData',calculator:false}),
  303:freeze({nativeClass:'MealItemData',calculator:true}),
  310:freeze({nativeClass:'FishItemData',calculator:false}),
  311:freeze({nativeClass:'IngredientItemData',calculator:false})
});
const stages=freeze([
  freeze({
    stage:'item_specific_calculator',
    nativeInterface:'IItemSellPriceCalculator',
    initialCurrencyMethod:'CanCalculateForCurrency',
    priceMethod:'GetSellPrice(ItemState,Item)',
    condition:'item_implements_interface_and_accepts_currency',
    returnRule:'first_success'
  }),
  freeze({
    stage:'uncached_sell_formula',
    nativeInterface:null,
    initialCurrencyMethod:null,
    priceMethod:'SellPriceFormulaItemData.GetItemSellPrice',
    condition:'dynamic_sell_cache_not_populated_and_formula_returns_price',
    returnRule:'first_success'
  }),
  freeze({
    stage:'registered_item_price_databases',
    nativeInterface:'IItemPriceDatabase',
    initialCurrencyMethod:null,
    priceMethod:'TryGetSellPrice(Item,Item,out int)',
    condition:'prior_stages_did_not_resolve_and_registered_provider_succeeds',
    returnRule:'first_success'
  })
]);

/**
 * Item family determines only the explicit class metadata for four classes.
 * Other item families remain UNKNOWN; this is not proof they are unsellable.
 * Static source rows and cache absence are NOT evidence of provider failure.
 */
export function nativeSellPriceProviderPlan(itemId){
  check(Number.isSafeInteger(itemId)&&itemId>0&&itemId<=2147483647,
    'INVALID_ITEM_ID');
  const family=Math.floor(itemId/100000);
  const member=knownFamilies[family]??null;
  return freeze({
    contract:DB02_NATIVE_SELL_PROVIDER_PLAN_CONTRACT,
    itemId,
    nativeClassEvidence:member?.nativeClass??null,
    nativeClassFromItemFamilyOnly:true,
    itemSellPriceCalculatorInterfaceInNativeMetadata:member?.calculator??null,
    itemSpecificCalculatorMayBeCalled:member?.calculator??null,
    currencyAcceptanceAtRuntime:null,
    priceProviderStages:stages,
    registeredPriceDatabaseImplementations:freeze([
      'ItemPriceDatabase','DynamicItemPriceDatase'
    ]),
    registeredDatabaseIterationOrderVerified:false,
    runtimeDynamicCacheState:null,
    nativeTrySellPriceFailureOutput:0,
    nativeTrySellPriceFailureReturnsFalse:true,
    outerGetSellPriceDefaultOnFailure:1,
    zeroOutParameterIsNotEffectiveSellPrice:true,
    defaultOneAppliesOnlyAfterRuntimeLookupFailure:true,
    missingConfiguredStaticRowIsNotRuntimeFailure:true,
    noDynamicCacheEntryIsNotRuntimeFailure:true,
    nativeTopologyVerifiedSteam1262:true,
    nativeTopologyVerifiedSwitch1262:true,
    runtimePriceProviderSelected:null,
    liveNativeTrySellPriceSucceeded:null,
    actualUnitSellPrice:null,
    runtimeResolutionVerified:false,
    originalBinaryDataBundled:false,
    publishable:false
  });
}
