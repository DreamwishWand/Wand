/** Native Steam v1.26.1 IL2CPP source-typed candidate; read-only bytes only. */
export declare const STALL_SAVE_EVIDENCE_CONTRACT: 'wand.db02.stall-save-evidence@1';
export interface SerializedTimestampEvidence {
  readonly seconds: string | null;
  readonly nanos: number | null;
}
export interface SavedSlotEvidence {
  readonly slotId: number | null;
  readonly itemId: number | null;
  readonly serializedItemAmount: number | null;
  readonly serializedInfiniteSentinel: boolean;
  readonly serializedMaxAmount: number | null;
  readonly serializedRegenDuration: SerializedTimestampEvidence | null;
  readonly stockVerified: false;
  readonly offerPrice: null;
  readonly priceVerified: false;
}
export interface SavedStallDataEvidence {
  readonly contract: typeof STALL_SAVE_EVIDENCE_CONTRACT;
  readonly sourceType: 'Definitions.Activities.StallData';
  readonly nativeFieldMapEvidence: 'Steam v1.26.1 IL2CPP';
  readonly compatibilityWithOtherGameVersions: 'not_proven';
  readonly shopDataPresent: boolean;
  readonly shop: null | Readonly<{
    lastRefreshTimestamp: SerializedTimestampEvidence | null;
    serializedRefreshCount: number | null;
    slotCount: number;
    slots: readonly SavedSlotEvidence[];
    liveAvailabilityVerified: false;
    retailPricesVerified: false;
    playerEntitlementVerified: false;
  }>;
  readonly savedStateOnly: true;
  readonly liveInventoryVerified: false;
  readonly salePricesVerified: false;
  readonly writable: false;
  readonly publishable: false;
}
export interface CrossCheckedSavedSlot extends SavedSlotEvidence {
  readonly staticSlotIdReference: number | null;
  readonly sourceSlotMappingVerified: false;
  readonly staticCandidateListed: boolean;
  readonly candidateRelationStatus: 'empty_or_unresolved' | 'listed_static_candidate' | 'not_listed_not_proof_invalid';
  readonly availableForPurchaseVerified: false;
}
export declare function decodeStallDataEvidence(bytes: Uint8Array): SavedStallDataEvidence;
export declare function inspectSavedStallShop(db: {
  getStallStaticCatalog(id: number): null | {contract: string; source: {
    kind: string;file:string;definitionId:number;platform:string;gameVersion:string
  };slots: readonly {candidates: readonly {itemId:number}[]}[]}
}, stallId: number, bytes: Uint8Array): Readonly<{
  contract: typeof STALL_SAVE_EVIDENCE_CONTRACT;
  stallId: number;
  staticCatalogContract: string;
  staticSource: {kind: string;file:string;definitionId:number;platform:string;gameVersion:string};
  decoded: Readonly<{shopDataPresent:boolean;serializedRefreshCount:number|null;
    lastRefreshTimestamp:SerializedTimestampEvidence|null}>;
  slots: readonly CrossCheckedSavedSlot[];
  slotCount: number;
  saveCodecVerified:false;
  sourceSlotMappingVerified:false;
  liveInventoryVerified:false;
  salePricesVerified:false;
  playerEntitlementVerified:false;
  writable:false;
  publishable:false;
}>;