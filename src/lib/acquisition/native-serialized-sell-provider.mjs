/**
 * DB-02 pure simulation of the original Steam / Switch v1.26.2 serialized
 * IItemPriceDatabase provider bodies; NOT live registry or sale-price data.
 *
 * ItemPriceDatabase.TryGetSellPrice and
 * DynamicItemPriceDatase.TryGetSellPrice:
 * - an ItemPrices row for the Item ID must be found;
 * - SellPrices (not purchase Prices) must have a matching CurrencyCost.Id;
 * - a matching CurrencyCost yields true and its int32 Amount;
 * - no match returns false, but the out-argument is 1 if a DB exists;
 * - a dynamic provider with CachedData=null returns false with out=0.
 *
 * These values are *conditional*, evaluated against caller supplied rows.
 * No result is an observed runtime registered provider or actual sale quote.
 */
export const DB02_SERIALIZED_SELL_PROVIDER_CONTRACT=
  'wand.db02.serialized-sell-provider-simulation@1';
export const DB02_DYNAMIC_CACHE_GATE_CONTRACT=
  'wand.db02.dynamic-source-cache-gate@1';
const freeze=Object.freeze;
const fail=s=>{throw new TypeError('DB02_SERIALIZED_SELL_PROVIDER_'+s);};
const must=(condition,code)=>{if(!condition)fail(code);};
const intId=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const intAmount=n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647;

/**
 * Native DataCached checks CachedData != null and its ItemPrices.Count > 0.
 * When supplied with an authenticated *serialized* source, this classifies
 * that source snapshot, not mutable in-memory runtime state.
 */
export function classifyNativeSerializedDynamicCache({
  cachedDataPresent,serializedItemPricesCount
}={}){
  must(typeof cachedDataPresent==='boolean'&&
    Number.isSafeInteger(serializedItemPricesCount)&&
    serializedItemPricesCount>=0&&serializedItemPricesCount<=100000,
    'INVALID_CACHE_SOURCE');
  must(cachedDataPresent||serializedItemPricesCount===0,
    'NULL_CACHE_HAS_ROWS');
  const sourceDataCached=cachedDataPresent&&serializedItemPricesCount>0;
  return freeze({
    contract:DB02_DYNAMIC_CACHE_GATE_CONTRACT,
    cachedDataPresent,serializedItemPricesCount,sourceDataCached,
    nativeDataCachedRule:'cached_data_nonnull_and_item_prices_count_positive',
    nativeGateVerifiedSteam1262:true,
    nativeGateVerifiedSwitch1262:true,
    runtimeDataCached:null,
    uncachedFormulaBypassedAtRuntime:null,
    staticSnapshotOnly:true,
    originalLiveCacheSelected:false,
    publishable:false
  });
}
/**
 * Inspects an individually supplied ItemPrices entry. A static row from
 * getSourceItemPriceDefinitions must be supplied *with* its database context.
 * Runtime registered provider selection is not performed here.
 */
export function simulateNativeSerializedSellProvider({
  providerKind,itemId,currencyId,sourcePriceRow=null,cachedDataPresent=true
}={}){
  must(providerKind==='static'||providerKind==='dynamic',
    'UNKNOWN_PROVIDER');
  must(intId(itemId)&&intId(currencyId),
    'INVALID_ITEM_OR_CURRENCY');
  must(typeof cachedDataPresent==='boolean'&&
    (providerKind==='dynamic'||cachedDataPresent===true),
    'INVALID_CACHED_DATA_STATE');
  const nullDynamic=providerKind==='dynamic'&&!cachedDataPresent;
  must(sourcePriceRow===null||(
    sourcePriceRow!==null&&typeof sourcePriceRow==='object'&&
    !Array.isArray(sourcePriceRow)&&
    sourcePriceRow.itemId===itemId&&
    typeof sourcePriceRow.databaseKey==='string'&&
    sourcePriceRow.databaseKey.length>0&&
    sourcePriceRow.databaseKey.length<=256&&
    Array.isArray(sourcePriceRow.sellValueDefinitions)&&
    sourcePriceRow.sellValueDefinitions.length<=64
  ),'INVALID_SOURCE_PRICE_ROW');
  must(!nullDynamic||sourcePriceRow===null,
    'NULL_DYNAMIC_CACHE_WITH_ROW');
  const list=sourcePriceRow?.sellValueDefinitions??[];
  const currencies=new Set();
  for(const cost of list){
    must(cost!==null&&typeof cost==='object'&&
      intId(cost.currencyId)&&!currencies.has(cost.currencyId)&&
      typeof cost.amountFieldPresent==='boolean'&&
      (cost.amountFieldPresent?intAmount(cost.amount):cost.amount===null),
      'INVALID_SOURCE_SELL_COST');
    currencies.add(cost.currencyId);
  }
  const matched=nullDynamic?null:list.find(cost=>cost.currencyId===currencyId)??null;
  const wouldReturnSuccess=matched!==null;
  // Serialized int32 protobuf fields are zero when absent. The native code
  // reads CurrencyCost.Amount as int32 even when no Amount wire field exists.
  const conditionalOutPrice=nullDynamic?0:
    wouldReturnSuccess?(matched.amountFieldPresent?matched.amount:0):1;
  return freeze({
    contract:DB02_SERIALIZED_SELL_PROVIDER_CONTRACT,
    providerKind,itemId,currencyId,
    sourcePriceDatabaseKey:sourcePriceRow?.databaseKey??null,
    cachedDataPresent:providerKind==='static'?null:cachedDataPresent,
    sourceItemPriceRowPresent:sourcePriceRow!==null,
    sourceSellCostCurrencyMatched:wouldReturnSuccess,
    sourceSellCostAmountFieldPresent:matched?.amountFieldPresent??null,
    conditionalNativeTryGetSellPriceSucceeded:wouldReturnSuccess,
    conditionalNativeOutPrice:conditionalOutPrice,
    outParameterIsNotProofOfSuccess:!wouldReturnSuccess,
    fallbackOutOneOnlyWhenDatabaseObjectExists:true,
    nullDynamicCacheOutZero:nullDynamic,
    missingSerializedInt32AmountDefaultsToZero:
      wouldReturnSuccess&&!matched.amountFieldPresent,
    conditionalOnCallerSuppliedSourceRow:true,
    originalRuntimeProviderRegistered:null,
    originalRuntimeProviderSelected:null,
    actualRuntimePriceLookupSucceeded:null,
    actualSellPrice:null,
    nativeStaticAndDynamicMethodBodiesVerifiedSteam1262:true,
    nativeStaticAndDynamicMethodBodiesVerifiedSwitch1262:true,
    sourceSnapshotNotRuntimeState:true,
    publishable:false,
    writable:false
  });
}
