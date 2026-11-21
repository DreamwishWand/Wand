/** Read-only DB-05 decoded ProfileWorld.Stores bridge. No full-save Codec. */
export declare const WORLD_STORE_SAVE_CONTRACT: 'wand.db02.world-store-save-evidence@1';
export interface DecodedStoreSlotEvidence {
  readonly storeIndex:number;
  readonly displayIndex:number;
  readonly slotIndex:number;
  readonly itemId:number|null;
  readonly serializedAmount:number|null;
  readonly serializedInfiniteSentinel:boolean;
  readonly currencyId:number|null;
  readonly serializedIsAvailable:boolean|null;
  readonly liveAvailabilityVerified:false;
  readonly stockVerified:false;
  readonly salePrice:null;
  readonly priceVerified:false;
  readonly playerEligibilityVerified:false;
}
export interface DecodedWorldStoreEvidence {
  readonly storeIndex:number;
  readonly buildingItemId:number|null;
  readonly displayCount:number;
  readonly savedSlotCount:number;
  readonly exactStaticStallIdMatch:number|null;
  readonly staticSlotMappingVerified:false;
  readonly staticStallIdentityVerified:false;
  readonly currentInventoryVerified:false;
  readonly salePricesVerified:false;
  readonly displays:readonly Readonly<{
    displayIndex:number;
    displayItemId:number|null;
    slotCount:number;
    slots:readonly DecodedStoreSlotEvidence[];
    displayItemIsMerchandise:false;
  }>[];
  readonly slots:readonly DecodedStoreSlotEvidence[];
}
export interface DecodedWorldStoresInspection {
  readonly contract:typeof WORLD_STORE_SAVE_CONTRACT;
  readonly profilePath:'/World/Stores';
  readonly sourceNativeType:'StoreInfo';
  readonly sourceEvidence:'steam-1.26.1-IL2CPP-and-DB05-native-observed-paths';
  readonly fieldObserved:boolean;
  readonly status:'not_observed'|'observed_decoded_structure';
  readonly storeCount:number;
  readonly serializedSlotCount:number;
  readonly stores:readonly DecodedWorldStoreEvidence[];
  readonly strictCodecVerified:false;
  readonly nativeBuildCompatibilityVerified:false;
  readonly staticSlotMappingVerified:false;
  readonly liveInventoryVerified:false;
  readonly salePricesVerified:false;
  readonly saveWriterAuthorized:false;
  readonly publishable:false;
}
export declare function inspectDecodedWorldStores(
  db:{getStallStaticCatalog(stallId:number):null|{stallId:number}},
  decodedSave:unknown
):DecodedWorldStoresInspection;