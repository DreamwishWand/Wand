export interface SaveCrossCatalogDb01Client {
  readonly source: Readonly<{
    privateOnly: true;
    gameVersion: string;
    nativeSourceManifestSha256: string;
  }>;
  getItem(id: number): Promise<Readonly<{
    itemId: number;
    catalogDomain: 'item' | 'definition_unclassified';
    [key: string]: unknown;
  }> | null>;
}
export interface SaveCrossCatalogDb04Catalog {
  readonly manifest: Readonly<{
    schema: 'wand.db04.world@1';
    status: 'partial_game_native_evidence';
    gameVersion: string;
  }>;
  readonly objects: ReadonlyMap<string, Readonly<{ itemId: number; [key: string]: unknown }>>;
  readonly scenes: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly grids: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}
export interface SaveCatalogLinkRule {
  readonly id: string;
  readonly catalog: 'item'|'scene'|'grid_source';
  readonly path: string;
  readonly extraction: 'integer_value'|'canonical_map_key'|'exact_source_path';
  readonly note: string;
}
export interface SaveCatalogLinkSource {
  readonly itemCatalogGameVersion: string;
  readonly worldCatalogGameVersion: string;
  readonly sourceVersionLabelsEqual: boolean;
  readonly sourceAndSaveJointlyVerified: false;
  readonly crossCatalogProvenanceVerified: false;
  readonly catalogCoverageComplete: false;
  readonly gameExecutableAttested: false;
  readonly writerAuthorized: false;
  readonly ownershipVerified: false;
  readonly exportAuthorized: false;
}
export interface SaveCatalogLinkAuditFamily {
  readonly id: string;
  readonly catalog: 'item'|'scene'|'grid_source';
  readonly path: string;
  readonly observed: number;
  readonly matched: number;
  readonly db01Matches: number;
  readonly db04Matches: number;
  readonly bothCatalogsMatch: number;
  readonly unclassifiedDefinitions: number;
  readonly unresolvedInPartialCatalog: number;
  readonly notLookedUp: number;
  readonly zeroSentinels: number;
  readonly malformed: number;
  readonly typeIssues: number;
  readonly sampled: boolean;
  readonly status: 'observed_type_issue' | 'sampled_inconclusive' |
    'not_observed' | 'partial_catalog_unresolved' |
    'zero_sentinels_only' | 'catalog_id_candidates';
  readonly catalogCoverageComplete: false;
  readonly sourceAndSaveJointlyVerified: false;
  readonly writerAuthorized: false;
}
export interface SaveCrossCatalogAudit {
  readonly contract: 'wand.db05.db01-db04-redacted-audit@1';
  readonly status: 'observed_type_issue'|'partial_catalog_unresolved'|'inconclusive'|'catalog_id_candidates';
  readonly families: readonly SaveCatalogLinkAuditFamily[];
  readonly examinedFamilies: number;
  readonly distinctItemIdsExamined: number;
  readonly distinctItemIdsUnexamined: number;
  readonly source: SaveCatalogLinkSource;
  readonly sourceMismatchObserved: boolean;
  readonly compatibilityBasis: 'exact_item_id_and_exact_native_source_path_only';
  readonly allExistingItemsVerified: false;
  readonly sourceAndSaveJointlyVerified: false;
  readonly catalogCoverageComplete: false;
  readonly worldPositionVerified: false;
  readonly placementPermissionVerified: false;
  readonly ownershipVerified: false;
  readonly writerAuthorized: false;
  readonly exportAuthorized: false;
}
export interface SaveSourceCatalogBridge {
  readonly contract: 'wand.db05.db01-db04-readonly-link@1';
  readonly source: SaveCatalogLinkSource;
  /** Explicit local caller-only lookup. Not part of redacted audit output. */
  lookupItem(id: number): Promise<Readonly<{
    itemId: number;
    db01Item: Awaited<ReturnType<SaveCrossCatalogDb01Client['getItem']>>;
    db04WorldObject: Readonly<{itemId:number;[key:string]:unknown}> | null;
    classification: 'both_partial_catalogs_candidate' |
      'db01_id_candidate' | 'db04_world_object_candidate' |
      'unresolved_in_partial_catalogs';
    nativeDefinitionClass: 'item'|'definition_unclassified'|null;
    sourceVersionLabelsEqual: boolean;
    sourceAndSaveJointlyVerified: false;
    crossCatalogProvenanceVerified: false;
    ownershipVerified: false;
    writerAuthorized: false;
    exportAuthorized: false;
  }>>;
  auditSave(decoded: unknown, options?: Readonly<{
    maxPerFamily?: number;
    maxDistinctItemLookups?: number;
  }>): Promise<SaveCrossCatalogAudit>;
}
export const SAVE_CROSS_CATALOG_CONTRACT: 'wand.db05.db01-db04-readonly-link@1';
export const SAVE_CROSS_CATALOG_AUDIT_CONTRACT: 'wand.db05.db01-db04-redacted-audit@1';
export function getSaveCatalogLinkRules(): Readonly<{
  schema: 'wand.db05.db01-db04-join-rules@1';
  families: readonly SaveCatalogLinkRule[];
}>;
export function createSaveSourceCatalogBridge(db01: SaveCrossCatalogDb01Client, db04: SaveCrossCatalogDb04Catalog): SaveSourceCatalogBridge;
