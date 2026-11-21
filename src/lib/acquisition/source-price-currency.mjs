/**
 * Pure classification of already-supplied STATIC native purchase price options.
 * This does NOT authenticate input, resolve runtime shop database selection,
 * verify a transaction, stock, unlock, discount, or assign a sell price.
 *
 * Only the independently SHA-authenticated DB-02 private loaders may promote
 * results to "source-configured original evidence".
 */
export const DB02_SOURCE_CURRENCY_MATCH_CONTRACT='wand.db02.source-currency-candidates@1';
const fail=code=>{throw new TypeError('DB02_SOURCE_CURRENCY_'+code);};
const check=(ok,code)=>{if(!ok)fail(code);};
const positive=x=>Number.isSafeInteger(x)&&x>0&&x<=2147483647;
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0&&x<=2147483647;
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const literal=x=>typeof x==='string'&&x.length>0&&x.length<=256;
const empty=Object.freeze([]);

/**
 * A ShopSlot.CurrencyId can agree with a static ItemPrices.Prices.CurrencyId,
 * but this is not proof a given ShopSlot selects that database or is offering
 * the item for sale. Return all matching and alternative currency definitions
 * separately. SellPrices are intentionally excluded.
 */
export function compareConfiguredPurchaseCurrencies(priceRows,shopCurrencyIds){
  check(Array.isArray(priceRows)&&priceRows.length<=16&&
    Array.isArray(shopCurrencyIds)&&shopCurrencyIds.length>0&&
    shopCurrencyIds.length<=512,'INVALID_INPUT');
  check(shopCurrencyIds.every(positive),'INVALID_SHOP_CURRENCY');
  const ids=Object.freeze([...new Set(shopCurrencyIds)].sort((a,b)=>a-b));
  const currencies=new Set(ids);
  const seenDatabases=new Set(),matching=[],others=[];
  for(const row of priceRows){
    check(row&&literal(row.databaseKey)&&!seenDatabases.has(row.databaseKey)&&
      Array.isArray(row.purchaseCostDefinitions)&&
      Array.isArray(row.sellValueDefinitions)&&row.purchaseCostDefinitions.length<=64,
      'INVALID_PRICE_DEFINITION');
    seenDatabases.add(row.databaseKey);
    const seenCurrencies=new Set();
    for(const price of row.purchaseCostDefinitions){
      check(price&&positive(price.currencyId)&&!seenCurrencies.has(price.currencyId)&&
        typeof price.amountFieldPresent==='boolean'&&
        (price.amountFieldPresent?nonnegative(price.amount):price.amount===null)&&
        hex(price.nativeWireSha256),'INVALID_PRICE_CURRENCY');
      seenCurrencies.add(price.currencyId);
      const candidate=Object.freeze({databaseKey:row.databaseKey,currencyId:price.currencyId,
        configuredAmount:price.amount,
        amountFieldPresent:price.amountFieldPresent,
        sourceWireSha256:price.nativeWireSha256,
        sourceConfiguredOnly:true,effectivePriceVerified:false});
      if(currencies.has(price.currencyId))matching.push(candidate);
      else others.push(candidate);
    }
  }
  return Object.freeze({
    contract:DB02_SOURCE_CURRENCY_MATCH_CONTRACT,
    shopConfiguredCurrencyIds:ids,
    sourceConfiguredMatchingPurchaseCosts:Object.freeze(matching),
    sourceConfiguredOtherCurrencyPurchaseCosts:Object.freeze(others),
    matchCount:matching.length,otherCurrencyOptionCount:others.length,
    inputSourceAuthenticated:false, // Caller must separately authenticate original ZIPs.
    shopSpecificDatabaseSelectionVerified:false,currentShopOfferVerified:false,
    effectiveTransactionPriceVerified:false,liveStockVerified:false,
    // Empty match is inconclusive, NEVER "free" or "not sold".
    priceAbsenceMeansFree:false,
    sellPricesExcluded:true
  });
}
