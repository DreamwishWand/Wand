export interface Db00SaveLookup {
  readonly itemId: string;
  readonly classification: 'catalog_item_candidate' | 'not_in_exact_catalog' | 'unresolved_in_partial_catalog';
  readonly catalogItem: Readonly<Record<string, unknown>> | null;
  readonly savedReferenceVerified: false;
  readonly ownershipVerified: false;
  readonly writerAuthorized: false;
}
export interface Db00SaveJoin {
  readonly contract: 'wand.db05.db00-candidate-join@1';
  readonly snapshotId: string;
  readonly buildCandidate: string;
  readonly catalogCoverageComplete: boolean;
  readonly sourceAndSaveJointlyVerified: false;
  readonly savedReferencesVerified: false;
  readonly ownershipVerified: false;
  readonly writerAuthorized: false;
  lookup(value: number | string): Db00SaveLookup;
}
export const SAVE_CATALOG_JOIN_CONTRACT: 'wand.db05.db00-candidate-join@1';
export function createSaveCatalogJoin(
  snapshot: Record<string, unknown>,
  declaredBuild: Partial<import('./registry.mjs').SaveBuildIdentity>
): Db00SaveJoin;
