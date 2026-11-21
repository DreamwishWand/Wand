/** Private read-only StoreInfo-to-Collection ID join. Not ownership evidence. */
export declare const WORLD_STORE_COLLECTION_CONTRACT: 'wand.db02.saved-store-collection@1';
export type SavedStoreCatalogClassification = 'catalog_item_candidate' |
  'unresolved_in_partial_catalog' | 'not_in_exact_catalog';
export interface SavedStoreCollectionItem {
  readonly itemId: string;
  readonly catalogClassification: SavedStoreCatalogClassification;
  readonly nameStatus: 'verified' | 'unverified' | 'unresolved';
  readonly names: Readonly<Record<string,string>>;
  readonly nativeCategory: string | null;
  readonly category: string | null;
  readonly savedDisplayReferenceCount: number;
  readonly savedDisplayReferences: readonly Readonly<{
    storeIndex: number; displayIndex: number; slotIndex: number;
  }>[];
  readonly playerOwnedVerified: false;
  readonly collectionUnlockedVerified: false;
  readonly acquiredFromShopVerified: false;
  readonly currentOfferVerified: false;
  readonly salePrice: null;
  readonly priceVerified: false;
  readonly publishable: false;
}
export interface SavedWorldStoreCollectionEvidence {
  readonly contract: typeof WORLD_STORE_COLLECTION_CONTRACT;
  readonly snapshotId: string;
  readonly source: Readonly<{platform:string;gameVersion:string}>;
  readonly saveSourceVersionCompatibilityVerified: false;
  readonly externalManifestPinCheckedByThisFunction: false;
  readonly status: 'observed_decoded_structure' | 'not_observed';
  readonly saveStoresFieldObserved: boolean;
  readonly savedStoreCount: number;
  readonly savedDisplaySlotCount: number;
  readonly savedSlotsWithoutItem: number;
  readonly savedItemReferenceCount: number;
  readonly distinctItemCount: number;
  readonly matchedCatalogItemCount: number;
  readonly unresolvedCatalogItemCount: number;
  readonly items: readonly SavedStoreCollectionItem[];
  readonly privateSource: true;
  readonly publishable: false;
  readonly ownerCollectionVerified: false;
  readonly liveOffersVerified: false;
  readonly salePricesVerified: false;
  readonly strictCodecVerified: false;
  readonly saveWriterAuthorized: false;
}
export declare function inspectSavedWorldStoreCollection(
  join: {
    contract: 'wand.db02.db00-candidate-join@1';
    snapshotId: string;
    acquisitionSource: {platform:string;gameVersion:string};
    catalogCoverageComplete: boolean;
    privateSource: true;
    publishable: false;
    lookup(value: string): {
      itemId: string;
      classification: SavedStoreCatalogClassification;
      catalogItem: null | {
        id: string;nameStatus:'verified'|'unverified';
        names:Readonly<Record<string,string>>;
        nativeCategory?:string|null;category?:string|null;
      };
    };
    getStallStaticCatalog(id: number): unknown;
  },
  decodedSave: unknown
): SavedWorldStoreCollectionEvidence;