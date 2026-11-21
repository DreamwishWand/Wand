/** DB-05 browser presentation adapter. No source values or private ID keys escape. */
import {
  getSaveReferenceRelations, probeSaveReferences, probeUnifiedSaveStructure,
  inspectDecodedSave, getUnifiedSaveShapeCatalog
} from './registry.mjs';
import { getSaveAchievementObservationFields, inspectSaveAchievementProgress } from './achievement-progress.mjs';

export const SAVE_DIAGNOSTIC_VIEW_CONTRACT = 'wand.db05.browser-readonly-diagnostics@2';
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
const achievementStatuses = new Set([
  'not_observed', 'observed_empty', 'container_type_difference',
  'observed_kind_difference', 'sampled_observation', 'observed_field_kinds'
]);
const achievementLabels = Object.freeze({
  achievement_id:'実績ID',
  current_amount:'現在値',
  max_amount:'保存上の最大値',
  claimed_reward_milestone:'報酬マイルストーン',
  state:'状態（意味は未検証）',
  types_collected:'収集種類',
  items_used:'使用アイテム'
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
  const achievement = inspectSaveAchievementProgress(decoded);
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
  const achievementFields = frozen(achievement.fields.map(field => frozen({
    id:field.id,
    label:achievementLabels[field.id] ?? '実績フィールド',
    observed:count(field.observed),
    absent:count(field.absent),
    typeIssues:count(field.typeIssues),
    checkedElements:count(field.checkedElements),
    nestedTypeIssues:count(field.nestedTypeIssues),
    sampled:field.sampled === true
  })));
  const achievementObservation = frozen({
    status:achievement.status,
    containerPresent:achievement.containerPresent === true,
    containerKindValid:achievement.containerKindValid === true,
    inspectedRows:count(achievement.inspectedRows),
    invalidRows:count(achievement.invalidRows),
    sampled:achievement.sampled === true,
    fields:achievementFields,
    modifiedSaveMayOmitMissionObjects:true,
    absenceIsNotEvidenceOfCorruption:true,
    completionVerified:false,
    saveIntegrityVerified:false,
    writerAuthorized:false,
    exportAuthorized:false
  });
  return frozen({
    contract: SAVE_DIAGNOSTIC_VIEW_CONTRACT,
    referenceStatus: safeStatus(reference.status),
    rootValid: true,
    knownPublicTemplates: structure.publicTemplateCount,
    referenceRules: rules, shapeDomains: shapes, achievementObservation,
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

/**
 * Treat Worker messages as untrusted structured-clone results. Reconstruct
 * only locally enumerated IDs, labels, statuses and bounded integer counts.
 * Unknown fields, raw save paths and user data cannot reach Svelte.
 */
export function sanitizeSaveDiagnosticView(input) {
  const fail = () => { throw new TypeError('DB05_DIAGNOSTIC_WORKER_REPLY_INVALID'); };
  const obj = value => value !== null && typeof value === 'object' &&
    !Array.isArray(value);
  const number = value => {
    if (!Number.isSafeInteger(value) || value < 0) fail();
    return value;
  };
  const refStatuses = new Set([
    'observed_consistent','observed_anomaly','not_observed',
    'insufficient_evidence','sampled_inconclusive'
  ]);
  const globalStatuses = new Set(['observed_consistent','observed_anomaly','inconclusive']);
  const shapeStatuses = new Set(['shape_candidate','sampled_candidate','shape_conflict','not_observed']);
  const source = getSaveReferenceRelations();
  const shape = getUnifiedSaveShapeCatalog();
  const achievementFields = getSaveAchievementObservationFields().fields;
  if (!obj(input) || input.contract !== SAVE_DIAGNOSTIC_VIEW_CONTRACT ||
      input.rootValid !== true || input.knownPublicTemplates !== shape.publicTemplateCount ||
      input.writerAuthorized !== false || input.exportAuthorized !== false ||
      input.privateIdsIncluded !== false || input.privateValuesIncluded !== false ||
      !globalStatuses.has(input.referenceStatus) ||
      !Array.isArray(input.referenceRules) ||
      input.referenceRules.length !== source.rules.length ||
      !Array.isArray(input.shapeDomains) ||
      input.shapeDomains.length !== shape.domains.length ||
      !obj(input.achievementObservation)) fail();
  const refs = new Map();
  for (const row of input.referenceRules) {
    if (!obj(row) || !source.rules.some(rule => rule.id === row.id) ||
        refs.has(row.id) || !refStatuses.has(row.status) ||
        typeof row.sampled !== 'boolean') fail();
    refs.set(row.id, row);
  }
  const referenceRules = frozen(source.rules.map(rule => {
    const row=refs.get(rule.id);
    if (!row) fail();
    return frozen({
      id:rule.id, label: labels[rule.id] ?? '参照整合性',
      status:row.status,
      observed:number(row.observed),resolved:number(row.resolved),
      unresolved:number(row.unresolved),missing:number(row.missing),
      malformed:number(row.malformed),typeIssues:number(row.typeIssues),
      sampled:row.sampled
    });
  }));
  const domains = new Map();
  for (const row of input.shapeDomains) {
    if (!obj(row) || !shape.domains.includes(row.domain) ||
        domains.has(row.domain) || !shapeStatuses.has(row.status) ||
        typeof row.sampled !== 'boolean') fail();
    domains.set(row.domain,row);
  }
  const shapeDomains = frozen(shape.domains.map(domain => {
    const row=domains.get(domain);
    if (!row) fail();
    const registered=number(row.registered), observed=number(row.observed);
    const conflicting=number(row.conflicting);
    if (observed > registered || conflicting > registered ||
        observed+conflicting > registered) fail();
    return frozen({
      domain, status:row.status, registered, observed, conflicting, sampled:row.sampled
    });
  }));
  const raw = input.achievementObservation;
  if (!achievementStatuses.has(raw.status) ||
      typeof raw.containerPresent !== 'boolean' ||
      typeof raw.containerKindValid !== 'boolean' ||
      typeof raw.sampled !== 'boolean' ||
      raw.modifiedSaveMayOmitMissionObjects !== true ||
      raw.absenceIsNotEvidenceOfCorruption !== true ||
      raw.completionVerified !== false ||
      raw.saveIntegrityVerified !== false ||
      raw.writerAuthorized !== false ||
      raw.exportAuthorized !== false ||
      !Array.isArray(raw.fields) ||
      raw.fields.length !== achievementFields.length) fail();
  const inspectedRows = number(raw.inspectedRows);
  const invalidRows = number(raw.invalidRows);
  if (inspectedRows > 256 || invalidRows > inspectedRows ||
      (!raw.containerKindValid && inspectedRows !== 0) ||
      (!raw.containerPresent && raw.containerKindValid)) fail();
  const byField = new Map();
  for (const row of raw.fields) {
    if (!obj(row) || !achievementFields.some(field => field.id === row.id) ||
        byField.has(row.id) || typeof row.sampled !== 'boolean') fail();
    byField.set(row.id,row);
  }
  const fields = frozen(achievementFields.map(field => {
    const row = byField.get(field.id);
    if (!row) fail();
    const observed=number(row.observed), absent=number(row.absent);
    const typeIssues=number(row.typeIssues),
      checkedElements=number(row.checkedElements),
      nestedTypeIssues=number(row.nestedTypeIssues);
    if (observed+absent > inspectedRows-invalidRows ||
        typeIssues > observed ||
        checkedElements > inspectedRows * 128 ||
        nestedTypeIssues > checkedElements ||
        (field.jsonKinds[0] !== 'array' && (checkedElements || nestedTypeIssues || row.sampled)))
      fail();
    return frozen({
      id:field.id, label:achievementLabels[field.id],
      observed, absent, typeIssues, checkedElements, nestedTypeIssues,
      sampled:row.sampled
    });
  }));
  const achievementObservation = frozen({
    status:raw.status,
    containerPresent:raw.containerPresent,
    containerKindValid:raw.containerKindValid,
    inspectedRows,
    invalidRows,
    sampled:raw.sampled,
    fields,
    modifiedSaveMayOmitMissionObjects:true,
    absenceIsNotEvidenceOfCorruption:true,
    completionVerified:false,
    saveIntegrityVerified:false,
    writerAuthorized:false,
    exportAuthorized:false
  });
  return frozen({
    contract:SAVE_DIAGNOSTIC_VIEW_CONTRACT,
    referenceStatus:input.referenceStatus,
    rootValid:true,
    knownPublicTemplates:shape.publicTemplateCount,
    referenceRules, shapeDomains, achievementObservation,
    privateIdsIncluded:false, privateValuesIncluded:false,
    fullSchemaVerified:false, strictDecoderVerified:false,
    referenceClosureVerified:false, ownershipVerified:false,
    writerAuthorized:false, exportAuthorized:false
  });
}
