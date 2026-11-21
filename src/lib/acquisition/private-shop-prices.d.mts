/** Owner-private Steam v1.26.2 static source prices; no live offers. */
export declare const DB02_PRIVATE_SHOP_PRICES_CONTRACT:'wand.db02.private-shop-prices@1';
export declare const DB02_PRIVATE_SHOP_PRICE_RELEASE_SHA256:string;
export declare const DB02_PRIVATE_SHOP_SOURCE_SHA256:string;

export interface StaticCurrencyCost {
  readonly currencyId:number;
  readonly amount:number|null;
  readonly amountFieldPresent:boolean;
  readonly nativeWireSha256:string;
}
export interface StaticItemPriceDefinition {
  readonly databaseKey:string;
  readonly itemId:number;
  readonly purchaseCostDefinitions:readonly StaticCurrencyCost[];
  readonly sellValueDefinitions:readonly StaticCurrencyCost[];
  readonly indexWithinDatabase:number;
  readonly nativeWireSha256:string;
  readonly currentShopPriceVerified:false;
  readonly currentPurchaseEligibilityVerified:false;
}
export interface StaticShopSlot {
  readonly index:number;
  readonly currencyId:number|null;
  readonly fatigueSourceSha256:string|null;
  readonly nativeWireSha256:string;
}
export interface StaticShopConfiguration {
  readonly shopKey:string;
  readonly slots:readonly StaticShopSlot[];
  readonly slotCount:number;
  readonly refreshCost:StaticCurrencyCost|null;
  readonly refreshBaseIncrease:number|null;
  readonly refreshIncreasePercent:number|null;
  readonly refreshIncreaseCap:number|null;
  readonly supportsDailySellCap:number|null;
  readonly isDispenser:number|null;
  readonly restrictItemsToCurrentScene:number|null;
  readonly currentOffersVerified:false;
  readonly stockVerified:false;
  readonly nativeWireSha256:string;
  readonly sourceEntryIndex:number;
}
export interface StaticStallShopRelation {
  readonly stallId:number;
  readonly shopKey:string;
  readonly nativeShopSlotCount:number;
  readonly nativeSlotCountMatchesStallLoot:true;
  readonly offerItemMappingVerified:false;
}
export interface PrivateShopPriceView {
  readonly contract:typeof DB02_PRIVATE_SHOP_PRICES_CONTRACT;
  readonly verified:true;
  readonly privateSource:true;
  readonly publishable:false;
  readonly platform:'Steam';
  readonly gameVersion:'1.26.2';
  readonly sourceManifestSha256:string;
  readonly src02R5ManifestSha256:string;
  readonly counts:Readonly<Record<string,number>>;
  readonly offersVerified:false;
  readonly stockVerified:false;
  readonly effectivePriceVerified:false;
  readonly dynamicPricesEvaluated:false;
  readonly ownershipVerified:false;
  listSourceStallShopRelations():readonly StaticStallShopRelation[];
  getSourceItemPriceDefinitions(itemId:number):readonly StaticItemPriceDefinition[];
  getSourceShopConfiguration(shopKey:string):StaticShopConfiguration|null;
  getSourceStallShopConfiguration(stallId:number):
    Readonly<{stall:StaticStallShopRelation;shop:StaticShopConfiguration}>|null;
}
/** Input exact byte buffers from an owner-private release, never public Pages assets. */
export declare function loadPrivateShopPriceView(input:{
  manifestBytes:Uint8Array|ArrayBuffer;
  files:Readonly<Record<string,Uint8Array|ArrayBuffer>>;
}):Promise<PrivateShopPriceView>;
