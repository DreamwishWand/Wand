/**
 * DB-02 exact-source ItemPrices row coverage for cooking ingredients.
 *
 * This pure classifier takes caller-supplied snapshots; it does NOT
 * authenticate them. The private meal view supplies independently pinned
 * original Steam 1.26.2 static and dynamic snapshots.
 *
 * Crucial: no ItemPrices ROW is a different condition from a row whose
 * matching soft-currency Amount field is omitted. Neither is proof of an
 * actual runtime lookup failure, unsellability or unit price.
 */
export const DB02_INGREDIENT_SOURCE_ROW_COVERAGE_CONTRACT=
  'wand.db02.ingredient-source-row-coverage@1';
const fail=reason=>{throw new TypeError('DB02_INGREDIENT_SOURCE_ROW_'+reason);};
const check=(ok,code)=>{if(!ok)fail(code);};
const positive=x=>Number.isSafeInteger(x)&&x>0&&x<=2147483647;
const freeze=Object.freeze;

/** @param {{
 *   itemId:number,
 *   staticRows:readonly object[],
 *   dynamicCacheLookup?:object|null
 * }} input
 */
export function classifyIngredientSerializedPriceRowCoverage(input={}){
  check(input!==null&&typeof input==='object'&&!Array.isArray(input),
    'INVALID_INPUT');
  const {itemId,staticRows,dynamicCacheLookup=null}=input;
  check(positive(itemId)&&Array.isArray(staticRows)&&staticRows.length<=1,
    'INVALID_SOURCE_STATIC_ROWS');
  for(const row of staticRows){
    check(row&&typeof row==='object'&&!Array.isArray(row)&&
      row.itemId===itemId&&typeof row.databaseKey==='string'&&
      row.databaseKey.length>0&&Array.isArray(row.sellValueDefinitions)&&
      Array.isArray(row.purchaseCostDefinitions),
      'INVALID_STATIC_ROW');
  }
  check(dynamicCacheLookup===null||(
    dynamicCacheLookup&&typeof dynamicCacheLookup==='object'&&
    !Array.isArray(dynamicCacheLookup)&&
    dynamicCacheLookup.itemId===itemId&&
    dynamicCacheLookup.serializedCacheOnly===true&&
    dynamicCacheLookup.originalSourceAuthenticated===true&&
    typeof dynamicCacheLookup.cachedPurchaseRowPresent==='boolean'&&
    typeof dynamicCacheLookup.cachedSellRowPresent==='boolean'
  ),'INVALID_DYNAMIC_CACHE_LOOKUP');
  const checked=dynamicCacheLookup!==null;
  const cacheRow=checked&&(
    dynamicCacheLookup.cachedPurchaseRowPresent||
    dynamicCacheLookup.cachedSellRowPresent);
  check(!(staticRows.length===1&&cacheRow),
    'ORIGINAL_SOURCE_PROVIDER_ITEM_COLLISION');
  const noRow=checked?staticRows.length===0&&!cacheRow:null;
  const status=staticRows.length>0?'static_source_row_present':
    !checked?'dynamic_source_not_supplied':
    cacheRow?'dynamic_source_row_present':'no_serialized_source_price_row';
  return freeze({
    contract:DB02_INGREDIENT_SOURCE_ROW_COVERAGE_CONTRACT,
    itemId,
    staticSourceRowCount:staticRows.length,
    dynamicSourceSnapshotProvided:checked,
    dynamicSourcePurchaseRowPresent:checked?
      dynamicCacheLookup.cachedPurchaseRowPresent:null,
    dynamicSourceSellRowPresent:checked?
      dynamicCacheLookup.cachedSellRowPresent:null,
    sourceRowAbsentAcrossStaticAndDynamicSnapshots:noRow,
    sourceRecordStatus:status,
    sourceInputIndependentlyAuthenticatedByThisFunction:false,
    noPriceRowIsNotAnOmittedAmountField:true,
    rowAbsenceDoesNotProveRuntimeLookupFailure:true,
    rowAbsenceDoesNotProveUnsellable:true,
    runtimeRegisteredProviderSetVerified:false,
    runtimeDynamicCacheUnmodifiedVerified:false,
    actualIngredientSellPrice:null,
    publishable:false,writable:false
  });
}
