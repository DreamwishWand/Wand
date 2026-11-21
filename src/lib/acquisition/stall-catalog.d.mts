/** Native static stall candidates, NOT live merchandise, stock or prices. */
export const STATIC_STALL_CATALOG_CONTRACT: 'wand.db02.static-stall-catalog@1';
export interface StaticAmountEvidence {
  readonly itemId: number;
  readonly amount: number | null;
  readonly amountVerified: boolean;
}
export interface StaticStallUpgradeEvidence {
  readonly level: number | null;
  readonly requiredPlayerLevel: number | null;
  readonly benefitType: string | null;
  readonly benefitDigest: string | null;
  readonly cost: StaticAmountEvidence | null;
  readonly costAmountVerified: boolean;
}
export interface StaticStallCostEvidence {
  readonly unlockWithItemId: number | null;
  readonly unlockAtLevel: number | null;
  readonly unlockCosts: ReadonlyArray<StaticAmountEvidence>;
  readonly upgrades: ReadonlyArray<StaticStallUpgradeEvidence>;
  readonly unlockSatisfied: 'unknown';
  readonly upgradesPurchased: 'unknown';
  readonly costsAreBuildingNotSalePrices: true;
}
export interface StaticStallItemCandidate {
  readonly itemId: number;
  readonly candidateGroupIndexes: ReadonlyArray<number>;
  readonly hasCondition: boolean;
  readonly status: 'static_candidate_not_verified_for_sale';
}
export interface StaticStallSlotEvidence {
  readonly slotIndex: number;
  readonly lootTableId: number;
  readonly candidateCount: number;
  readonly candidates: ReadonlyArray<StaticStallItemCandidate>;
  readonly hasDynamicTypeFilters: boolean;
  readonly hasConditionalFilter: boolean;
  readonly enumeratedCandidatesExhaustive: false;
  readonly currentSlotItemId: null;
  readonly currentSlotStock: null;
  readonly currentSalePrice: null;
  readonly sourceStatus: 'static_loot_table_candidates_only';
}
export interface StaticStallCatalog {
  readonly contract: 'wand.db02.static-stall-catalog@1';
  readonly stallId: number;
  readonly nameKey: string;
  readonly shopDataKey: string;
  readonly source: Readonly<{kind: 'game_native';file: 'itemlist/Building.json';
    definitionId:number;platform:string;gameVersion:string}>;
  readonly slotCount: number;
  readonly slots: ReadonlyArray<StaticStallSlotEvidence>;
  readonly candidateItemIds: ReadonlyArray<number>;
  readonly distinctCandidateCount: number;
  readonly slotsWithDynamicTypeFilters: number;
  readonly hasDynamicTypeFilters: boolean;
  readonly hasConditionalFilter: boolean;
  readonly buildingCosts: StaticStallCostEvidence;
  readonly currentInventoryVerified: false;
  readonly currentSalePricesVerified: false;
  readonly playerUnlockEvaluated: false;
  readonly completeShopCatalogVerified: false;
  readonly status: 'static_candidates_not_live_inventory';
  readonly publishable: false;
}
export interface StaticStallCatalogIndex {
  readonly contract: 'wand.db02.static-stall-catalog@1';
  readonly source: Readonly<{platform:string;gameVersion:string}>;
  readonly catalogCount: number;
  getStallStaticCatalog(id:number):StaticStallCatalog|null;
  getStallsByShopDataKey(key:string):ReadonlyArray<StaticStallCatalog>;
  listStallStaticCatalogs():ReadonlyArray<StaticStallCatalog>;
}
export function createStaticStallCatalogIndex(input:{
  manifest:{schema:string;platform:string;gameVersion:string};
  stallSources?:ReadonlyArray<Record<string, any>>;
  lootTables?:ReadonlyArray<Record<string, any>>;
}):StaticStallCatalogIndex;