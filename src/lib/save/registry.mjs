export {createSaveDutyMilestoneBridge, getSaveDutyMilestoneWireContract, SAVE_DUTY_MILESTONE_JOIN_CONTRACT} from './duty-milestones.mjs';
export { getSaveAchievementObservationFields, inspectSaveAchievementProgress, SAVE_ACHIEVEMENT_PROGRESS_CONTRACT } from './achievement-progress.mjs';
export { createSaveAchievementBridge, getSaveAchievementLinkRules, SAVE_ACHIEVEMENT_JOIN_CONTRACT, getSaveAchievementNativeBehaviorEvidence, SAVE_DUTY_PROGRESS_EVIDENCE_CONTRACT } from './achievement-links.mjs';
export { createSaveGuideProgressBridge, getSaveGuideLinkRules, SAVE_GUIDE_JOIN_CONTRACT } from './guide-links.mjs';
export { createSaveSourceCatalogBridge, getSaveCatalogLinkRules, SAVE_CROSS_CATALOG_CONTRACT, SAVE_CROSS_CATALOG_AUDIT_CONTRACT } from './catalog-links.mjs';
export { getSaveReferenceRelations, probeSaveReferences, compareSaveReferenceProbes, SAVE_REFERENCE_PROBE_CONTRACT, SAVE_REFERENCE_COMPARISON_CONTRACT } from './references.mjs';
import registry from '../../../data/ddv/save/registry.v1.json' with { type: 'json' };
import legacyFields from '../../../data/ddv/save/legacy626-fields.v1.json' with { type: 'json' };
import commonFields from '../../../data/ddv/save/common626643-fields.v1.json' with { type: 'json' };
import nativeFields from '../../../data/ddv/save/native1261-observed-fields.v1.json' with { type: 'json' };
import nestedFields from '../../../data/ddv/save/native1261-nested-fields.v1.json' with { type: 'json' };
import deepFields from '../../../data/ddv/save/native1261-deep-fields.v1.json' with { type: 'json' };
import domainFields from '../../../data/ddv/save/native1262-domain-fields.v1.json' with { type: 'json' };

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
deepFreeze(registry);
deepFreeze(legacyFields);
deepFreeze(commonFields);
deepFreeze(nativeFields);
deepFreeze(nestedFields);
deepFreeze(deepFields);
deepFreeze(domainFields);

export const SAVE_REGISTRY_SCHEMA = 'wand.db05.save-registry@1';
export const SAVE_INSPECTION_CONTRACT = 'wand.db05.save-readonly-inspection@1';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const positiveId = value => Number.isSafeInteger(value) && value > 0;

export function getSaveRegistry() { return registry; }
export function getLegacySaveFields() { return legacyFields; }
export function getLegacySaveIdReferences(namespace = '') {
  if (typeof namespace !== 'string') throw new TypeError('INVALID_ID_NAMESPACE');
  return Object.freeze(legacyFields.fields.filter(field => field.idReference && (!namespace || field.idReference.namespace === namespace)));
}

/** Historical field paths are structural candidates, not version or platform gates. */
export const SAVE_SHAPE_PROBE_CONTRACT = 'wand.db05.save-shape-probe@1';
const SHAPE_DOMAINS = Object.freeze(['inventory', 'chests', 'collection', 'grids', 'appearance']);
const DOMAIN_ANCHORS = Object.freeze({
  inventory: ['/Player/ListInventories'],
  chests: ['/Player/ContainerInventories'],
  collection: ['/Player/CollectionSets'],
  grids: ['/World/GridCollection/DiffGrids'],
  appearance: ['/Player/AvatarIsMale', '/Player/MaleAvatar', '/Player/FemaleAvatar']
});
const SHAPE_WILDCARD_LIMIT = 32;
const SHAPE_NODE_LIMIT = 1024;
const shapeType = value =>
  value === null ? 'null' : Array.isArray(value) ? 'array' :
  plain(value) ? 'object' : Number.isSafeInteger(value) ? 'integer' : typeof value;

/** Bounded observation: absent/empty paths never count as proof of a field. */
function observeKnownField(document, field) {
  const tokens = field.path.slice(1).split('/');
  let nodes = [document], sampled = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], next = [], final = i === tokens.length - 1;
    for (const node of nodes) {
      // The parent field's own known-path probe records its type conflict.
      // Descendants are simply unobserved, avoiding repeated false conflicts.
      if (!plain(node)) continue;
      if (/^\{[A-Za-z][A-Za-z0-9]*\}$/.test(token)) {
        const keys = Object.keys(node);
        if (keys.length > SHAPE_WILDCARD_LIMIT) sampled = true;
        for (const key of keys.slice(0, SHAPE_WILDCARD_LIMIT)) next.push(node[key]);
      } else if (token.endsWith('[]')) {
        const key = token.slice(0, -2);
        if (!own(node, key)) continue;
        const arr = node[key];
        if (!Array.isArray(arr)) return { status: 'type_conflict', sampled };
        if (final) next.push(arr);
        else {
          if (arr.length > SHAPE_WILDCARD_LIMIT) sampled = true;
          next.push(...arr.slice(0, SHAPE_WILDCARD_LIMIT));
        }
      } else if (own(node, token)) next.push(node[token]);
      if (next.length > SHAPE_NODE_LIMIT) {
        next.length = SHAPE_NODE_LIMIT;
        sampled = true;
        break;
      }
    }
    nodes = next;
    if (!nodes.length) return { status: 'not_observed', sampled, kinds: Object.freeze([]) };
  }
  const kinds = Object.freeze([...new Set(nodes.map(shapeType))].sort());
  return {
    status: kinds.every(kind => field.type.split('|').includes(kind)) ? 'observed' : 'type_conflict',
    sampled, kinds
  };
}

/** No source platform, Build ID, or version number is used to select shape. */
export function probeSaveStructure(decoded) {
  const byDomain = [];
  for (const domain of SHAPE_DOMAINS) {
    const fields = legacyFields.fields.filter(f => f.domain === domain);
    const observations = fields.map(field => ({ path: field.path, ...observeKnownField(decoded, field) }));
    const observed = observations.filter(o => o.status === 'observed');
    const conflicting = observations.filter(o => o.status === 'type_conflict');
    const anchorObserved = observed.some(o => DOMAIN_ANCHORS[domain].includes(o.path));
    const anchorConflicting = conflicting.some(o => DOMAIN_ANCHORS[domain].includes(o.path));
    const sampled = observations.some(o => o.sampled);
    const status = conflicting.length || anchorConflicting ? 'shape_conflict' :
      anchorObserved ? (sampled ? 'sampled_candidate' : 'shape_candidate') : 'not_observed';
    byDomain.push(Object.freeze({
      domain, status, observedFieldCount: observed.length,
      // Only public, predeclared field templates and JSON kinds; no IDs or values.
      observedFields: Object.freeze(observed.map(o => Object.freeze({ path: o.path, kinds: o.kinds }))),
      conflictingPaths: Object.freeze(conflicting.map(o => o.path)),
      sampled, source: 'legacy_rust_field_candidates_only', writerAuthorized: false
    }));
  }
  return Object.freeze({
    contract: SAVE_SHAPE_PROBE_CONTRACT,
    compatibilityBasis: 'decoded_field_shape',
    platformAndVersionUsedAsGates: false,
    domains: Object.freeze(byDomain),
    exhaustive: false,
    codecVerified: false,
    writerAuthorized: false
  });
}

export const SAVE_STRUCTURE_COMPARISON_CONTRACT = 'wand.db05.save-structure-comparison@1';

/**
 * Compare only public, historically known JSON path templates and JSON types.
 * Neither a matching signature nor a missing optional field grants Codec/Writer
 * compatibility. Platform/Build/version are deliberately not inputs.
 */
export function compareSaveStructures(previous, current) {
  const before = inspectDecodedSave(previous, null);
  const after = inspectDecodedSave(current, null);
  const domains = before.shapeProbe.domains.map((left, index) => {
    const right = after.shapeProbe.domains[index];
    const a = new Map(left.observedFields.map(row => [row.path, row.kinds]));
    const b = new Map(right.observedFields.map(row => [row.path, row.kinds]));
    const sharedChanged = [...a.keys()].filter(path => b.has(path) &&
      a.get(path).join('|') !== b.get(path).join('|'));
    const conflicts = [...new Set([...left.conflictingPaths, ...right.conflictingPaths, ...sharedChanged])].sort();
    const added = [...b.keys()].filter(path => !a.has(path)).sort();
    const removed = [...a.keys()].filter(path => !b.has(path)).sort();
    const status = conflicts.length ? 'structural_conflict'
      : left.status === 'not_observed' || right.status === 'not_observed' ? 'insufficient_evidence'
      : left.sampled || right.sampled ? 'sampled_inconclusive'
      : added.length || removed.length ? 'observed_shape_drift'
      : 'same_known_field_shape';
    return Object.freeze({
      domain: left.domain, status,
      addedKnownPaths: Object.freeze(added),
      removedKnownPaths: Object.freeze(removed),
      conflictingKnownPaths: Object.freeze(conflicts),
      previousObservedFieldCount: left.observedFieldCount,
      currentObservedFieldCount: right.observedFieldCount,
      writerAuthorized: false
    });
  });
  const validRoots = before.rootShapeValid && after.rootShapeValid;
  const overall = !validRoots ? 'invalid_root'
    : domains.some(d => d.status === 'structural_conflict') ? 'structural_conflict'
    : domains.some(d => d.status === 'insufficient_evidence' || d.status === 'sampled_inconclusive') ? 'inconclusive'
    : domains.some(d => d.status === 'observed_shape_drift') ? 'observed_shape_drift'
    : 'same_known_field_shape';
  return Object.freeze({
    contract: SAVE_STRUCTURE_COMPARISON_CONTRACT,
    compatibilityBasis: 'decoded_field_shape',
    platformAndVersionUsedAsGates: false,
    status: overall,
    rootIssues: Object.freeze({
      previous: before.issues,
      current: after.issues
    }),
    domains: Object.freeze(domains),
    knownPathsOnly: true,
    exhaustive: false,
    strictDecoderVerified: false,
    referenceClosureVerified: false,
    writerAuthorized: false,
    exportAuthorized: false
  });
}

export const SAVE_COMMON_SHAPE_PROBE_CONTRACT = 'wand.db05.common-shape-probe@1';
export const SAVE_COMMON_SHAPE_COMPARE_CONTRACT = 'wand.db05.common-shape-comparison@1';
const COMMON_DOMAINS = Object.freeze(['world','progression','cosmetics']);

/** All 16 public path templates are independent of version and platform. */
export function getCommonSaveFields() { return commonFields; }

/**
 * Distinct from the 66 historical legacy paths: observed common save fields
 * only. Exact game-source type binding remains unverified.
 */
export function probeCommonSaveStructure(decoded) {
  const domains = COMMON_DOMAINS.map(domain => {
    const candidates = commonFields.fields.filter(f => f.domain === domain);
    const observations = candidates.map(f => Object.freeze({
      path: f.path, ...observeKnownField(decoded, f)
    }));
    const observed = observations.filter(x => x.status === 'observed');
    const conflicting = observations.filter(x => x.status === 'type_conflict');
    const sampled = observations.some(x => x.sampled);
    const status = conflicting.length ? 'shape_conflict'
      : observed.length ? (sampled ? 'sampled_candidate' : 'shape_candidate')
      : 'not_observed';
    return Object.freeze({
      domain, status, observedFieldCount: observed.length,
      observedFields: Object.freeze(observed.map(x => Object.freeze({ path:x.path, kinds:x.kinds }))),
      conflictingPaths: Object.freeze(conflicting.map(x => x.path)),
      sampled, writerAuthorized:false
    });
  });
  return Object.freeze({
    contract:SAVE_COMMON_SHAPE_PROBE_CONTRACT,
    platformAndVersionUsedAsGates:false,
    completeness:'known_16_templates_only',
    domains:Object.freeze(domains),
    exhaustive:false, strictDecoderVerified:false, writerAuthorized:false
  });
}

/** Read-only comparison of newly observed common path types. */
export function compareCommonSaveStructures(previous, current) {
  const before = probeCommonSaveStructure(previous);
  const after = probeCommonSaveStructure(current);
  const domains = before.domains.map((left,index) => {
    const right=after.domains[index];
    const a=new Map(left.observedFields.map(f=>[f.path,f.kinds.join('|')]));
    const b=new Map(right.observedFields.map(f=>[f.path,f.kinds.join('|')]));
    const addedKnownPaths=[...b.keys()].filter(p=>!a.has(p)).sort();
    const missingKnownPaths=[...a.keys()].filter(p=>!b.has(p)).sort();
    const kindChangedPaths=[...a.keys()].filter(p=>b.has(p)&&a.get(p)!==b.get(p)).sort();
    const conflictingKnownPaths=[...new Set([...left.conflictingPaths,...right.conflictingPaths,...kindChangedPaths])].sort();
    const status=conflictingKnownPaths.length ? 'observed_type_conflict'
      : !a.size||!b.size ? 'insufficient_evidence'
      : left.sampled||right.sampled ? 'sampled_inconclusive'
      : addedKnownPaths.length||missingKnownPaths.length ? 'observed_witness_difference'
      : 'same_known_common_shape';
    return Object.freeze({domain:left.domain,status,
      addedKnownPaths:Object.freeze(addedKnownPaths),
      missingKnownPaths:Object.freeze(missingKnownPaths),
      conflictingKnownPaths:Object.freeze(conflictingKnownPaths),
      writerAuthorized:false});
  });
  const status=domains.some(d=>d.status==='observed_type_conflict') ? 'observed_type_conflict'
    : domains.some(d=>d.status==='insufficient_evidence'||d.status==='sampled_inconclusive') ? 'inconclusive'
    : domains.some(d=>d.status==='observed_witness_difference') ? 'observed_witness_difference'
    : 'same_known_common_shape';
  return Object.freeze({
    contract:SAVE_COMMON_SHAPE_COMPARE_CONTRACT,
    status,platformAndVersionUsedAsGates:false,
    domains:Object.freeze(domains),
    exhaustive:false,strictDecoderVerified:false,writerAuthorized:false,exportAuthorized:false
  });
}


export const SAVE_NATIVE_SHAPE_PROBE_CONTRACT = 'wand.db05.native-shape-probe@1';
export const SAVE_NATIVE_SHAPE_COMPARE_CONTRACT = 'wand.db05.native-shape-comparison@1';
const NATIVE_SHAPE_DOMAINS = Object.freeze(['profile', 'player', 'world']);

/** Native types from the exact pinned Steam 1.26.1 dump; observed on three owner saves. */
export function getNativeSaveFields() { return nativeFields; }

/** Bounded public-path/type probe; no save values, identifiers or rights emitted. */
export function probeNativeSaveStructure(decoded) {
  const domains = NATIVE_SHAPE_DOMAINS.map(domain => {
    const fields = nativeFields.fields.filter(f => f.domain === domain);
    const observations = fields.map(f => ({ path: f.path, ...observeKnownField(decoded, { path: f.path, type: f.jsonType }) }));
    const observed = observations.filter(f => f.status === 'observed');
    const conflicting = observations.filter(f => f.status === 'type_conflict');
    const sampled = observations.some(f => f.sampled);
    const status = conflicting.length ? 'shape_conflict'
      : observed.length ? (sampled ? 'sampled_candidate' : 'shape_candidate') : 'not_observed';
    return Object.freeze({
      domain, status,
      registeredFieldCount: fields.length,
      observedFieldCount: observed.length,
      observedFields: Object.freeze(observed.map(o => Object.freeze({ path: o.path, kinds: o.kinds }))),
      conflictingPaths: Object.freeze(conflicting.map(o => o.path)),
      sampled, writerAuthorized: false
    });
  });
  return Object.freeze({
    contract: SAVE_NATIVE_SHAPE_PROBE_CONTRACT,
    compatibilityBasis: 'observed_native_field_types',
    nativeGameBuildAttested: false,
    platformAndVersionUsedAsGates: false,
    domains: Object.freeze(domains),
    registeredFieldCount: nativeFields.fields.length,
    exhaustive: false, strictDecoderVerified: false, writerAuthorized: false
  });
}

/** Neither a match nor a mismatch across the 85 known fields authorizes writing. */
export function compareNativeSaveStructures(previous, current) {
  const left = probeNativeSaveStructure(previous);
  const right = probeNativeSaveStructure(current);
  const domains = left.domains.map((oldDomain, i) => {
    const newDomain = right.domains[i];
    const a = new Map(oldDomain.observedFields.map(f => [f.path, f.kinds.join('|')]));
    const b = new Map(newDomain.observedFields.map(f => [f.path, f.kinds.join('|')]));
    const addedKnownPaths = [...b.keys()].filter(path => !a.has(path)).sort();
    const missingKnownPaths = [...a.keys()].filter(path => !b.has(path)).sort();
    const changedKinds = [...a.keys()].filter(path => b.has(path) && a.get(path) !== b.get(path));
    const conflictingKnownPaths = [...new Set([
      ...oldDomain.conflictingPaths, ...newDomain.conflictingPaths, ...changedKinds
    ])].sort();
    const status = conflictingKnownPaths.length ? 'observed_type_conflict'
      : oldDomain.status === 'not_observed' || newDomain.status === 'not_observed' ? 'insufficient_evidence'
      : oldDomain.sampled || newDomain.sampled ? 'sampled_inconclusive'
      : addedKnownPaths.length || missingKnownPaths.length ? 'observed_witness_difference'
      : 'same_observed_native_fields';
    return Object.freeze({
      domain: oldDomain.domain, status,
      addedKnownPaths: Object.freeze(addedKnownPaths),
      missingKnownPaths: Object.freeze(missingKnownPaths),
      conflictingKnownPaths: Object.freeze(conflictingKnownPaths),
      writerAuthorized: false
    });
  });
  const invalidRoot = !inspectDecodedSave(previous, null).rootShapeValid ||
    !inspectDecodedSave(current, null).rootShapeValid;
  const status = invalidRoot ? 'invalid_root'
    : domains.some(d => d.status === 'observed_type_conflict') ? 'observed_type_conflict'
    : domains.some(d => d.status === 'insufficient_evidence' || d.status === 'sampled_inconclusive') ? 'inconclusive'
    : domains.some(d => d.status === 'observed_witness_difference') ? 'observed_witness_difference'
    : 'same_observed_native_fields';
  return Object.freeze({
    contract: SAVE_NATIVE_SHAPE_COMPARE_CONTRACT,
    status, domains: Object.freeze(domains),
    platformAndVersionUsedAsGates: false,
    sourceGameBuild: 'steam-1.26.1',
    currentGameNativeTypeAttestation: false,
    exhaustive: false, strictDecoderVerified: false,
    writerAuthorized: false, exportAuthorized: false
  });
}


export const SAVE_NESTED_SHAPE_PROBE_CONTRACT = 'wand.db05.nested-shape-probe@1';
export const SAVE_NESTED_SHAPE_COMPARE_CONTRACT = 'wand.db05.nested-shape-comparison@1';
const NESTED_SAVE_DOMAINS = Object.freeze(['player', 'world']);

/** Native v1.26.1 nested Protobuf properties witnessed in three private saves. */
export function getNestedSaveFields() { return nestedFields; }

/** Unknown fields, user map keys, contents, and IDs are never returned. */
export function probeNestedSaveStructure(decoded) {
  const domains = NESTED_SAVE_DOMAINS.map(domain => {
    const fields = nestedFields.fields.filter(f => f.domain === domain);
    const observations = fields.map(field => Object.freeze({
      path: field.path,
      ...observeKnownField(decoded, { path: field.path, type: field.allowedJsonKinds.join('|') })
    }));
    const observed = observations.filter(o => o.status === 'observed');
    const conflicting = observations.filter(o => o.status === 'type_conflict');
    const sampled = observations.some(o => o.sampled);
    return Object.freeze({
      domain,
      status: conflicting.length ? 'shape_conflict'
        : observed.length ? sampled ? 'sampled_candidate' : 'shape_candidate' : 'not_observed',
      registeredFieldCount: fields.length,
      observedFieldCount: observed.length,
      observedFields: Object.freeze(observed.map(o => Object.freeze({ path: o.path, kinds: o.kinds }))),
      conflictingPaths: Object.freeze(conflicting.map(o => o.path)),
      sampled, writerAuthorized: false
    });
  });
  return Object.freeze({
    contract: SAVE_NESTED_SHAPE_PROBE_CONTRACT,
    registeredFieldCount: nestedFields.fields.length,
    nativeGameBuildAttested: false,
    platformAndVersionUsedAsGates: false,
    exhaustive: false, strictDecoderVerified: false,
    domains: Object.freeze(domains), writerAuthorized: false
  });
}

export function compareNestedSaveStructures(previous, current) {
  const a = probeNestedSaveStructure(previous);
  const b = probeNestedSaveStructure(current);
  const domains = a.domains.map((left, i) => {
    const right = b.domains[i];
    const oldKinds = new Map(left.observedFields.map(f => [f.path, f.kinds.join('|')]));
    const newKinds = new Map(right.observedFields.map(f => [f.path, f.kinds.join('|')]));
    const addedKnownPaths = [...newKinds.keys()].filter(p => !oldKinds.has(p)).sort();
    const missingKnownPaths = [...oldKinds.keys()].filter(p => !newKinds.has(p)).sort();
    const changedKinds = [...oldKinds.keys()].filter(p => newKinds.has(p) && oldKinds.get(p) !== newKinds.get(p));
    const conflictingKnownPaths = [...new Set([
      ...left.conflictingPaths, ...right.conflictingPaths
    ])].sort();
    const changedKindPaths = changedKinds.sort();
    const status = conflictingKnownPaths.length ? 'observed_type_conflict'
      : !oldKinds.size || !newKinds.size ? 'insufficient_evidence'
      : left.sampled || right.sampled ? 'sampled_inconclusive'
      : addedKnownPaths.length || missingKnownPaths.length || changedKindPaths.length ? 'observed_witness_difference'
      : 'same_observed_nested_fields';
    return Object.freeze({
      domain: left.domain, status,
      addedKnownPaths: Object.freeze(addedKnownPaths),
      missingKnownPaths: Object.freeze(missingKnownPaths),
      conflictingKnownPaths: Object.freeze(conflictingKnownPaths),
      changedKindPaths: Object.freeze(changedKindPaths),
      writerAuthorized: false
    });
  });
  const invalidRoot = !inspectDecodedSave(previous, null).rootShapeValid ||
    !inspectDecodedSave(current, null).rootShapeValid;
  return Object.freeze({
    contract: SAVE_NESTED_SHAPE_COMPARE_CONTRACT,
    status: invalidRoot ? 'invalid_root'
      : domains.some(d => d.status === 'observed_type_conflict') ? 'observed_type_conflict'
      : domains.some(d => d.status === 'insufficient_evidence' || d.status === 'sampled_inconclusive') ? 'inconclusive'
      : domains.some(d => d.status === 'observed_witness_difference') ? 'observed_witness_difference'
      : 'same_observed_nested_fields',
    domains: Object.freeze(domains),
    platformAndVersionUsedAsGates: false, sourceGameBuild: 'steam-1.26.1',
    currentGameNativeTypeAttestation: false,
    exhaustive: false, strictDecoderVerified: false,
    writerAuthorized: false, exportAuthorized: false
  });
}


/**
 * Aggregate structural evidence without replacing the separate 66/16/85/58
 * provenance-tagged registries. The new 83 native nested paths are independent.
 * No private save values, IDs, platform names or metadata are emitted.
 */
export const SAVE_UNIFIED_SHAPE_PROBE_CONTRACT = 'wand.db05.unified-shape-probe@1';
export const SAVE_UNIFIED_SHAPE_COMPARISON_CONTRACT = 'wand.db05.unified-shape-comparison@1';
const ALL_PUBLIC_SHAPE_FIELDS = Object.freeze([
  ...legacyFields.fields.map(f => ({ domain: f.domain, path: f.path, type: f.type })),
  ...commonFields.fields.map(f => ({ domain: f.domain, path: f.path, type: f.type })),
  ...nativeFields.fields.map(f => ({ domain: f.domain, path: f.path, type: f.jsonType })),
  ...nestedFields.fields.map(f => ({ domain: f.domain, path: f.path, type: f.allowedJsonKinds.join('|') })),
  ...deepFields.fields.map(f => ({ domain: f.domain, path: f.path, type: f.allowedJsonKinds.join('|') })),
  ...domainFields.fields.map(f => ({ domain: f.domain, path: f.path, type: f.allowedJsonKinds.join('|') }))
]);
const ALL_PUBLIC_SHAPE_DOMAINS = Object.freeze(
  [...new Set(ALL_PUBLIC_SHAPE_FIELDS.map(f => f.domain))].sort()
);
const ALL_PUBLIC_SHAPE_COUNTS = Object.freeze({
  legacy: legacyFields.fields.length,
  common: commonFields.fields.length,
  native: nativeFields.fields.length,
  nativeNested: nestedFields.fields.length,
  nativeDeep: deepFields.fields.length,
  nativeDomain: domainFields.fields.length
});

/** Public field metadata only; never returns save values or real map keys. */
export function getDeepSaveFields() { return deepFields; }
/** Additional real-save-observed deep save fields, native metadata only. */
export function getDomainSaveFields() { return domainFields; }
export function getUnifiedSaveShapeCatalog() {
  return Object.freeze({
    contract: 'wand.db05.unified-shape-catalog@1',
    publicTemplateCount: ALL_PUBLIC_SHAPE_FIELDS.length,
    sourceCounts: ALL_PUBLIC_SHAPE_COUNTS,
    domains: ALL_PUBLIC_SHAPE_DOMAINS,
    compatibilityGate: 'decoded_shape_not_build_or_platform',
    currentNativeBuildAttested: false,
    writerAuthorized: false
  });
}

/**
 * Every candidate is strictly read-only; a missing or sampled path cannot
 * establish structural compatibility or complete save coverage.
 */
export function probeUnifiedSaveStructure(decoded) {
  const domains = ALL_PUBLIC_SHAPE_DOMAINS.map(domain => {
    const fields = ALL_PUBLIC_SHAPE_FIELDS.filter(f => f.domain === domain);
    const rows = fields.map(f => Object.freeze({
      path: f.path, ...observeKnownField(decoded, f)
    }));
    const observed = rows.filter(f => f.status === 'observed');
    const conflicts = rows.filter(f => f.status === 'type_conflict');
    const sampled = rows.some(f => f.sampled);
    return Object.freeze({
      domain, registeredFieldCount: fields.length,
      observedFieldCount: observed.length,
      status: conflicts.length ? 'shape_conflict'
        : !observed.length ? 'not_observed'
        : sampled ? 'sampled_candidate' : 'shape_candidate',
      observedFields: Object.freeze(observed.map(f =>
        Object.freeze({ path: f.path, kinds: f.kinds })
      )),
      conflictingPaths: Object.freeze(conflicts.map(f => f.path).sort()),
      sampled, writerAuthorized: false
    });
  });
  return Object.freeze({
    contract: SAVE_UNIFIED_SHAPE_PROBE_CONTRACT,
    publicTemplateCount: ALL_PUBLIC_SHAPE_FIELDS.length,
    platformAndVersionUsedAsGates: false,
    nativeBuildAttested: false,
    domains: Object.freeze(domains),
    exhaustive: false, strictDecoderVerified: false,
    writerAuthorized: false
  });
}

/**
 * Compare only named public templates and kinds. Even a 'same' report means
 * same observed *subset*, never full compatibility, ownership or safety.
 */
export function compareUnifiedSaveStructures(previous, current) {
  const left = probeUnifiedSaveStructure(previous);
  const right = probeUnifiedSaveStructure(current);
  const domains = left.domains.map((a, i) => {
    const b = right.domains[i];
    const oldKinds = new Map(a.observedFields.map(f => [f.path, f.kinds.join('|')]));
    const newKinds = new Map(b.observedFields.map(f => [f.path, f.kinds.join('|')]));
    const addedKnownPaths = [...newKinds.keys()].filter(p => !oldKinds.has(p)).sort();
    const missingKnownPaths = [...oldKinds.keys()].filter(p => !newKinds.has(p)).sort();
    const changedKindPaths = [...oldKinds.keys()].filter(p =>
      newKinds.has(p) && oldKinds.get(p) !== newKinds.get(p)).sort();
    const conflictingKnownPaths = [...new Set([
      ...a.conflictingPaths, ...b.conflictingPaths
    ])].sort();
    const status = conflictingKnownPaths.length ? 'observed_type_conflict'
      : !oldKinds.size || !newKinds.size ? 'insufficient_evidence'
      : a.sampled || b.sampled ? 'sampled_inconclusive'
      : addedKnownPaths.length || missingKnownPaths.length || changedKindPaths.length
        ? 'observed_witness_difference' : 'same_observed_witnesses';
    return Object.freeze({
      domain: a.domain,
      status,
      addedKnownPaths: Object.freeze(addedKnownPaths),
      missingKnownPaths: Object.freeze(missingKnownPaths),
      changedKindPaths: Object.freeze(changedKindPaths),
      conflictingKnownPaths: Object.freeze(conflictingKnownPaths),
      writerAuthorized: false
    });
  });
  const invalidRoot = !inspectDecodedSave(previous, null).rootShapeValid ||
    !inspectDecodedSave(current, null).rootShapeValid;
  const status = invalidRoot ? 'invalid_root'
    : domains.some(d => d.status === 'observed_type_conflict') ? 'observed_type_conflict'
    : domains.some(d => d.status === 'insufficient_evidence' || d.status === 'sampled_inconclusive')
      ? 'inconclusive'
    : domains.some(d => d.status === 'observed_witness_difference') ? 'observed_witness_difference'
    : 'same_observed_witnesses';
  return Object.freeze({
    contract: SAVE_UNIFIED_SHAPE_COMPARISON_CONTRACT,
    status, publicTemplateCount: ALL_PUBLIC_SHAPE_FIELDS.length,
    domains: Object.freeze(domains),
    platformAndVersionUsedAsGates: false,
    nativeBuildAttested: false, exhaustive: false,
    strictDecoderVerified: false,
    writerAuthorized: false, exportAuthorized: false
  });
}

export function matchSaveBuild({ platform, identityKind, identity, schemaVersion }) {
  if (typeof platform !== 'string' || typeof identityKind !== 'string' || typeof identity !== 'string') return null;
  return registry.builds.find(build => build.platform === platform && build.identityKind === identityKind && build.identity === identity && build.schemaVersion === schemaVersion) ?? null;
}

/** Strict JSON validation belongs to the Codec. Build/version are advisory metadata, not shape gates. */
export function inspectDecodedSave(decoded, declaredBuild) {
  const issues = [];
  const build = matchSaveBuild(declaredBuild ?? {});
  if (!plain(decoded)) issues.push('ROOT_MUST_BE_OBJECT');
  const info = plain(decoded) && own(decoded, 'GameInfo') ? decoded.GameInfo : undefined;
  if (!plain(info)) issues.push('GAMEINFO_MUST_BE_OBJECT');
  const schema = plain(info) && own(info, 'Version') ? info.Version : undefined;
  if (!integer(schema)) issues.push('GAMEINFO_VERSION_MUST_BE_NONNEGATIVE_SAFE_INTEGER');
  for (const key of ['Player', 'World']) {
    if (!plain(decoded) || !own(decoded, key) || !plain(decoded[key])) issues.push(key.toUpperCase() + '_MUST_BE_OBJECT');
  }
  return Object.freeze({
    contract: SAVE_INSPECTION_CONTRACT,
    buildCandidate: build?.key ?? null,
    compatibilityBasis: 'decoded_field_shape',
    shapeProbe: probeSaveStructure(decoded),
    saveSchemaVersion: integer(schema) ? schema : null,
    rootShapeValid: issues.length === 0,
    issues: Object.freeze(issues),
    strictDecoderVerified: false,
    externalBuildVerified: false,
    referenceClosureVerified: false,
    writerAuthorized: false,
    ownershipMutationAuthorized: false,
    exportAuthorized: false
  });
}

/** Object identity is retained; never serialize, clone, sanitize or rewrite a save. */
export function borrowUntouchedDecodedSave(decoded, declaredBuild) {
  const assessment = inspectDecodedSave(decoded, declaredBuild);
  if (!assessment.rootShapeValid) throw new TypeError(assessment.issues.join(', '));
  return { original: decoded, assessment };
}

/** Exact ID-only join. Caller must supply provenance-backed catalog rows. */
export function makeGameIdIndex(rows, key = 'itemId') {
  if (!Array.isArray(rows) || typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(key)) throw new TypeError('INVALID_ID_CATALOG');
  const index = new Map();
  for (const row of rows) {
    if (!plain(row) || !positiveId(row[key])) throw new TypeError('INVALID_CATALOG_ID');
    if (index.has(row[key])) throw new TypeError('DUPLICATE_CATALOG_ID');
    index.set(row[key], row);
  }
  return index;
}

export function matchGameId(index, id) {
  if (!(index instanceof Map) || !positiveId(id)) return null;
  return index.get(id) ?? null;
}

/** Diff only actual report witnesses, not inferred game changes. */
export function diffSaveWitnesses(previous, current) {
  const toMap = witnesses => {
    if (!Array.isArray(witnesses)) throw new TypeError('INVALID_WITNESS_LIST');
    const result = new Map();
    for (const w of witnesses) {
      if (!plain(w) || typeof w.path !== 'string' || !w.path.startsWith('/') || typeof w.type !== 'string') throw new TypeError('INVALID_WITNESS');
      if (result.has(w.path)) throw new TypeError('DUPLICATE_WITNESS_PATH');
      result.set(w.path, w.type);
    }
    return result;
  };
  const old = toMap(previous), next = toMap(current);
  const added = [], removed = [], changed = [];
  for (const [path, type] of next) {
    if (!old.has(path)) added.push({ path, type });
    else if (old.get(path) !== type) changed.push({ path, previousType: old.get(path), currentType: type });
  }
  for (const [path, type] of old) if (!next.has(path)) removed.push({ path, type });
  const sort = (a, b) => a.path.localeCompare(b.path, 'en');
  return { schema: 'wand.db05.save-witness-diff@1', added: added.sort(sort), removed: removed.sort(sort), changed: changed.sort(sort), authoritative: false, basis: 'observed_witnesses_only' };
}
