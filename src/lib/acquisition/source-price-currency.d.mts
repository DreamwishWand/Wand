/**
 * Pure, unauthenticated classification of static purchase-cost currency IDs.
 * Call only after a separate source verification for trusted game data.
 */
export declare const DB02_SOURCE_CURRENCY_MATCH_CONTRACT:
  'wand.db02.source-currency-candidates@1';
export interface SourceConfiguredCurrencyCost {
  readonly databaseKey:string;
  readonly currencyId:number;
  readonly configuredAmount:number|null;
  readonly amountFieldPresent:boolean;
  readonly sourceWireSha256:string;
  readonly sourceConfiguredOnly:true;
  readonly effectivePriceVerified:false;
}
export interface ConfiguredCurrencyComparison {
  readonly contract:typeof DB02_SOURCE_CURRENCY_MATCH_CONTRACT;
  readonly shopConfiguredCurrencyIds:readonly number[];
  readonly sourceConfiguredMatchingPurchaseCosts:readonly SourceConfiguredCurrencyCost[];
  readonly sourceConfiguredOtherCurrencyPurchaseCosts:readonly SourceConfiguredCurrencyCost[];
  readonly matchCount:number;
  readonly otherCurrencyOptionCount:number;
  readonly inputSourceAuthenticated:false;
  readonly shopSpecificDatabaseSelectionVerified:false;
  readonly currentShopOfferVerified:false;
  readonly effectiveTransactionPriceVerified:false;
  readonly liveStockVerified:false;
  readonly priceAbsenceMeansFree:false;
  readonly sellPricesExcluded:true;
}
export declare function compareConfiguredPurchaseCurrencies(
  priceRows:readonly {
    databaseKey:string;
    purchaseCostDefinitions:readonly Readonly<{
      currencyId:number;
      amount:number|null;
      amountFieldPresent:boolean;
      nativeWireSha256:string;
    }>[];
    sellValueDefinitions:readonly unknown[];
  }[],
  shopCurrencyIds:readonly number[]
):ConfiguredCurrencyComparison;
