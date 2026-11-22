/** Local original Steam v1.26.2 dynamic cached price SOURCE only. */
export declare const DB02_PRIVATE_DYNAMIC_PRICE_CACHE_CONTRACT:
  'wand.db02.private-dynamic-price-cache@1';
export declare const DB02_DYNAMIC_PROTODB_SHA256:
  'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
export declare const DB02_DYNAMIC_SOURCE_BODY_SHA256:
  '2fb01bfd8bddb0efce6a58bcaba57338566bf63fdadaf52cda0989955af48858';
export declare const DB02_DYNAMIC_CACHE_BODY_SHA256:
  '6b97ccead7d8a134d7f2e0e58c82c47416126efa3fceefaefcec09d2fa15bd2e';
export interface NativeDynamicCacheItemLookup {
  readonly itemId:number;
  readonly cachedPurchaseRowPresent:boolean;
  readonly cachedSellRowPresent:boolean;
  readonly originalSourceAuthenticated:boolean;
  readonly serializedCacheOnly:true;
  readonly runtimeFormulaEvaluated:false;
  readonly effectiveSellPriceVerified:false;
  readonly sellPrice:null;
}
export interface NativeDynamicPriceCacheStructure {
  readonly cacheRowCount:number;
  readonly purchaseOnlyRowCount:number;
  readonly sellOnlyRowCount:number;
  readonly bothPurchaseAndSellRowCount:number;
  readonly sellCurrencyAmountFieldsPresent:number;
  readonly sellCurrencyAmountFieldsAbsent:number;
  readonly sourceAuthenticated:false;
  readonly runtimeFormulaEvaluated:false;
  readonly effectiveSellPricesVerified:false;
  lookup(itemId:number):NativeDynamicCacheItemLookup;
}
/** Structural parser accepts synthetic fixtures; its results are untrusted. */
export declare function parseDynamicPriceCacheStructure(
  cacheBytes:Uint8Array
):NativeDynamicPriceCacheStructure;
export interface VerifiedPrivateDynamicPriceCache {
  readonly contract:typeof DB02_PRIVATE_DYNAMIC_PRICE_CACHE_CONTRACT;
  readonly platform:'Steam';
  readonly gameVersion:'1.26.2';
  readonly sourceKey:'FormulaDynamicPriceDatabase';
  readonly sourceNativeClass:'Definitions.Shops.DynamicItemPriceDatase';
  readonly originalProtoSha256:typeof DB02_DYNAMIC_PROTODB_SHA256;
  readonly sourceBodySha256:typeof DB02_DYNAMIC_SOURCE_BODY_SHA256;
  readonly cachedPriceDataSha256:typeof DB02_DYNAMIC_CACHE_BODY_SHA256;
  readonly originalSourceVerified:true;
  readonly sourcePurchaseFormulaReferenceCount:4;
  readonly sourceSellFormulaReferenceCount:1;
  readonly cacheRowCount:8549;
  readonly purchaseOnlyRowCount:8068;
  readonly sellOnlyRowCount:481;
  readonly bothPurchaseAndSellRowCount:0;
  readonly sellCurrencyAmountFieldsPresent:7;
  readonly sellCurrencyAmountFieldsAbsent:474;
  lookup(itemId:number):NativeDynamicCacheItemLookup;
  readonly runtimeFormulaEvaluated:false;
  readonly actualSellPricesVerified:false;
  readonly saveWriterAuthorized:false;
  readonly publishable:false;
}
/** Authenticate complete owner-private Steam v1.26.2 protoDb.bin bytes. */
export declare function loadPrivateDynamicPriceCache(
  protoDbBytes:Uint8Array
):Promise<VerifiedPrivateDynamicPriceCache>;
