/** DB-05 browser presentation adapter. No source values or private ID keys escape. */
import {
  getSaveReferenceRelations, probeSaveReferences, probeUnifiedSaveStructure,
  inspectDecodedSave
} from './registry.mjs';

export const SAVE_DIAGNOSTIC_VIEW_CONTRACT = 'wand.db05.browser-readonly-diagnostics@1';
const knownStatus = new Set([
  'observed_consistent','inconclusive','observed_anomaly','invalid_root',
  'shape_candidate','sampled_candidate','shape_conflict','not_observed',
  'sampled_inconclusive','insufficient_evidence'
]);
const sourceKinds = new Set(['catalog_id_candidates','partial_catalog_unresolved','observed_type_issue','zero_sentinels_only']);
const validInteger = value => Number.isSafeInteger(value) && value >= 0;
function count(value) { return validInteger(value) ? value : 0; }
const frozen = value => Object.freeze(value);
const safeStatus = (status, allowed=knownStatus) =>
  allowed.has(status) ? status : 'inconclusive';

const labels = Object.freeze({
  container_key_identity: 'コンテナID整合性',
  grid_key_identity: '通常グリッドID整合性',
  diff_grid_key_identity: '差分グリッドID整合性',
  grid_object_key_identity: '配置物ID整合性',
  diff_object_key_identity: '差分配置物ID整合性',
  placed_storage_to_container: '配置チェスト参照',
  modified_storage_to_container: '差分チェスト参照',
  placed_subgrid_to_grid: '配置サブグリッド参照',
  modified_subgrid_to_grid: '差分サブグリッド参照',
  house_floor_to_grid: '部屋の床グリッド参照',
  house_walls_to_grid: '部屋の壁グリッド参照',
  building_info_to_grid: '建物グリッド参照',
  village_area_to_grid: '村エリアのグリッド参照',
  floating_island_to_grid: '浮島のグリッド参照'
});
const catalogLabels = Object.freeze({
  chest_item: 'チェスト内アイテム',
  inventory_item_key: 'インベントリーのアイテム',
  collection_item_key: 'コレクション',
  placed_grid_object_item: 'グリッド配置アイテム',
  modified_grid_object_item: '差分配置アイテム',
  mount_item: 'マウント',
  village_scene: '村のScene ID',
  native_grid_source_path: 'グリッド原本パス'
});

/** Only public contract labels and anonymous counts are presented. */
export function makeSaveDiagnosticView(decoded) {
  const inspected = inspectDecodedSave(decoded, null);
  if (!inspected.rootShapeValid) throw new TypeError('DB05_DIAGNOSTIC_DECODED_ROOT_REQUIRED');
  const reference = probeSaveReferences(decoded);
  const structure = probeUnifiedSaveStructure(decoded);
  const byRule = new Map(reference.rules.map(row => [row.id,row]));
  const rules = frozen(getSaveReferenceRelations().rules.map(rule => {
    const result = byRule.get(rule.id);
    return frozen({
      id: rule.id, label: labels[rule.id] ?? '参照整合性',
      status: safeStatus(result?.status),
      observed: count(result?.observed), resolved: count(result?.resolved),
      unresolved: count(result?.unresolved), missing: count(result?.missing),
      malformed: count(result?.malformed), typeIssues: count(result?.typeIssues),
      sampled: result?.sampled === true
    });
  }));
  const shapes = frozen(structure.domains.map(domain => frozen({
    domain: domain.domain,
    status: safeStatus(domain.status),
    registered: count(domain.registeredFieldCount),
    observed: count(domain.observedFieldCount),
    conflicting: domain.conflictingPaths.length,
    sampled: domain.sampled === true
  })));
  return frozen({
    contract: SAVE_DIAGNOSTIC_VIEW_CONTRACT,
    referenceStatus: safeStatus(reference.status),
    rootValid: true,
    knownPublicTemplates: structure.publicTemplateCount,
    referenceRules: rules, shapeDomains: shapes,
    privateIdsIncluded: false, privateValuesIncluded: false,
    fullSchemaVerified: false, strictDecoderVerified: false,
    referenceClosureVerified: false, ownershipVerified: false,
    writerAuthorized: false, exportAuthorized: false
  });
}

/** Do not forward source metadata, item IDs, item records or unknown fields. */
export function makeSaveCatalogAuditView(audit) {
  if (!audit || audit.contract !== 'wand.db05.db01-db04-redacted-audit@1' ||
      !Array.isArray(audit.families)) {
    throw new TypeError('DB05_CATALOG_AUDIT_CONTRACT_REQUIRED');
  }
  const byId = new Map(audit.families
    .filter(row => row && typeof row.id === 'string' && Object.hasOwn(catalogLabels,row.id))
    .map(row => [row.id,row]));
  const families = frozen(Object.keys(catalogLabels).map(id => {
    const row=byId.get(id);
    return frozen({
      id, label: catalogLabels[id],
      status: safeStatus(row?.status,sourceKinds),
      observed: count(row?.observed), matched: count(row?.matched),
      db01Matches: count(row?.db01Matches), db04Matches: count(row?.db04Matches),
      unresolved: count(row?.unresolvedInPartialCatalog),
      notLookedUp: count(row?.notLookedUp),
      malformed: count(row?.malformed), sampled: row?.sampled === true
    });
  }));
  return frozen({
    contract: 'wand.db05.browser-redacted-catalog-view@1',
    status: safeStatus(audit.status,sourceKinds),
    sourceLabelsEqual: audit.source?.sourceVersionLabelsEqual === true,
    sourceJointlyVerified: false,
    families, privateIdsIncluded: false, privateValuesIncluded: false,
    writerAuthorized: false, exportAuthorized: false
  });
}
