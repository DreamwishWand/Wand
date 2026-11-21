import type { StaticStallCatalog } from './stall-catalog.mjs';
export const ACQUISITION_DB00_JOIN_CONTRACT: 'wand.db02.db00-candidate-join@1';
export type AcquisitionClassification = 'catalog_item_candidate' | 'not_in_exact_catalog' | 'unresolved_in_partial_catalog';
export interface Db02CatalogLookup {
  readonly itemId: string;
  readonly catalogItem: Readonly<Record<string, unknown>> | null;
  readonly classification: AcquisitionClassification;
  readonly acquisition: Readonly<Record<string, unknown>> | null;
  readonly acquisitionLinksVerifiedFromNativeData: boolean;
  readonly currentAvailabilityVerified: false;
  readonly shopOfferVerified: false;
  readonly ownedOrUnlocked: 'unknown';
  readonly publishable: false;
}
export interface Db02CatalogJoin {
  readonly contract: 'wand.db02.db00-candidate-join@1';
  readonly snapshotId: string;
  readonly acquisitionSource: { platform: string; gameVersion: string };
  readonly catalogCoverageComplete: boolean;
  readonly acquisitionCoverageComplete: false;
  readonly privateSource: true;
  readonly publishable: false;
  readonly liveStockVerified: false;
  readonly pricesVerified: false;
  readonly eligibilityVerified: false;
  lookup(value: number | string): Db02CatalogLookup;
  getRecipe(id: number): Readonly<Record<string, unknown>> | null;
  getConditionGate(digest: string): Readonly<Record<string, unknown>> | null;
  getConditionDefinition(id: number): Readonly<Record<string, unknown>> | null;
  getRecipeCondition(id: number): Readonly<Record<string, unknown>> | null;
  getAcquisitionCondition(pathId: string): Readonly<Record<string, unknown>> | null;
  getLootGroupCondition(tableId: number, groupIndex: number): Readonly<Record<string, unknown>> | null;
  getPossibleStallsForItem(id: number): ReadonlyArray<Record<string, unknown>>;
  getPossibleStallSlotsForItem(id: number): ReadonlyArray<Record<string, unknown>>;
  getStallStaticCatalog(id: number): StaticStallCatalog | null;
  getStallsByShopDataKey(key: string): ReadonlyArray<StaticStallCatalog>;
  listStallStaticCatalogs(): ReadonlyArray<StaticStallCatalog>;
}
/** Requires a deeply immutable, privately loaded SRC-02 bundle. For verified
 * external provenance in Node, use loadPinnedAcquisitionCatalogJoin. */
export interface VerifiedAcquisitionBundle {
  readonly verified: true;
  readonly privateSource: true;
  readonly manifestSha256: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly recipes: readonly Record<string, unknown>[];
  readonly relatedItems: readonly Record<string, unknown>[];
}
export function createAcquisitionCatalogJoin(snapshot: Record<string, unknown>, bundle: VerifiedAcquisitionBundle): Db02CatalogJoin;