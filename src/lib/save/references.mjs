import relations from '../../../data/ddv/save/reference-relations.v1.json' with { type: 'json' };

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
deepFreeze(relations);

export const SAVE_REFERENCE_PROBE_CONTRACT = 'wand.db05.save-reference-probe@1';
export const SAVE_REFERENCE_COMPARISON_CONTRACT = 'wand.db05.save-reference-comparison@1';
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const MAX_COLLECTION = 4096;
const MAX_VISITS = 65536;
const MAP_TOKEN = /^\{[A-Za-z][A-Za-z0-9]*\}$/;
const NUMERIC_KEY = /^(0|[1-9][0-9]*)$/;

// Do not coerce string-valued Protobuf references; ID values must be JSON
// integers, whereas map keys are necessarily strings after JSON decoding.
function idFromNumber(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value) : null;
}
function idFromMapKey(value) {
  return typeof value === 'string' && NUMERIC_KEY.test(value) &&
    Number.isSafeInteger(Number(value)) && String(Number(value)) === value
    ? value : null;
}

/** Yield only values and short-lived map keys; never copy keys into reports. */
function walk(root, publicTemplate, receive) {
  const tokens = publicTemplate.slice(1).split('/');
  const stats = { sampled: false, typeIssues: 0, visited: 0 };
  function step(node, offset, mapKey) {
    if (stats.visited >= MAX_VISITS) {
      stats.sampled = true;
      return;
    }
    if (offset === tokens.length) {
      stats.visited++;
      receive(node, mapKey);
      return;
    }
    const token = tokens[offset];
    if (MAP_TOKEN.test(token)) {
      if (!record(node)) { stats.typeIssues++; return; }
      const keys = Object.keys(node);
      if (keys.length > MAX_COLLECTION) stats.sampled = true;
      for (const key of keys.slice(0, MAX_COLLECTION)) {
        if (stats.visited >= MAX_VISITS) { stats.sampled = true; break; }
        step(node[key], offset + 1, key);
      }
      return;
    }
    if (token.endsWith('[]')) {
      if (!record(node)) { stats.typeIssues++; return; }
      const key = token.slice(0, -2);
      if (!has(node, key)) return;
      const list = node[key];
      if (!Array.isArray(list)) { stats.typeIssues++; return; }
      if (list.length > MAX_COLLECTION) stats.sampled = true;
      for (const child of list.slice(0, MAX_COLLECTION)) {
        if (stats.visited >= MAX_VISITS) { stats.sampled = true; break; }
        step(child, offset + 1, mapKey);
      }
      return;
    }
    if (!record(node)) { stats.typeIssues++; return; }
    if (has(node, token)) step(node[token], offset + 1, mapKey);
  }
  step(root, 0, null);
  return stats;
}

function buildIndex(root, templates) {
  const keys = new Set();
  let sampled = false;
  let typeIssues = 0;
  let available = false;
  for (const path of templates) {
    const stats = walk(root, path, node => {
      if (!record(node)) { typeIssues++; return; }
      available = true;
      const names = Object.keys(node);
      if (names.length > MAX_COLLECTION) sampled = true;
      for (const name of names.slice(0, MAX_COLLECTION)) {
        const id = idFromMapKey(name);
        if (id === null) typeIssues++;
        else keys.add(id);
      }
    });
    sampled ||= stats.sampled;
    typeIssues += stats.typeIssues;
  }
  return { keys, available, sampled, typeIssues };
}

function visitRule(root, rule, indexes) {
  let observed = 0, resolved = 0, unresolved = 0, missing = 0, malformed = 0;
  const isIdentity = rule.mode === 'id_matches_map_key';
  const publicTemplate = isIdentity
    ? rule.traversalTemplate.slice(0, -'/ID'.length) : rule.traversalTemplate;
  const target = rule.targetIndex ? indexes[rule.targetIndex] : null;
  const stats = walk(root, publicTemplate, (node, mapKey) => {
    observed++;
    if (isIdentity) {
      if (!record(node)) { malformed++; return; }
      if (!has(node, 'ID')) { missing++; return; }
      const value = idFromNumber(node.ID);
      const key = idFromMapKey(mapKey);
      if (value === null || key === null) { malformed++; return; }
      if (value === key) resolved++;
      else unresolved++;
      return;
    }
    const value = idFromNumber(node);
    if (value === null) { malformed++; return; }
    if (!target.available) { missing++; return; }
    if (target.keys.has(value)) resolved++;
    else unresolved++;
  });
  const sampled = stats.sampled || Boolean(target?.sampled);
  const typeIssues = stats.typeIssues + (target?.typeIssues ?? 0);
  const status = typeIssues || malformed || unresolved ? 'observed_anomaly'
    : !observed ? 'not_observed'
    : sampled ? 'sampled_inconclusive'
    : missing ? 'insufficient_evidence'
    : 'observed_consistent';
  return Object.freeze({
    id: rule.id, sourcePublicTemplate: rule.sourcePublicTemplate,
    targetIndex: rule.targetIndex, mode: rule.mode,
    status, observed, resolved, unresolved, missing, malformed,
    typeIssues, sampled, writerAuthorized: false
  });
}

/**
 * A structural and numeric-ID diagnostic only.
 * - does not read external DB-01 item catalogs
 * - does not infer ownership or item permission from a numeric ID
 * - unresolved references are observed anomalies, NOT save corruption proof
 * - never emits user IDs, instance keys, field values or raw input paths
 */
export function probeSaveReferences(decoded) {
  const rootValid = record(decoded) && record(decoded.Player) &&
    record(decoded.World);
  if (!rootValid) {
    return Object.freeze({
      contract: SAVE_REFERENCE_PROBE_CONTRACT, status: 'invalid_root',
      rootValid: false, rules: Object.freeze([]),
      indexSizes: Object.freeze({ container: 0, grid: 0 }),
      platformAndVersionUsedAsGates: false,
      referenceClosureVerified: false,
      exhaustive: false, writerAuthorized: false, exportAuthorized: false
    });
  }
  const indexes = {
    container: buildIndex(decoded, [relations.indexTemplates.container]),
    grid: buildIndex(decoded, relations.indexTemplates.grid)
  };
  const reports = Object.freeze(relations.rules.map(rule => visitRule(decoded, rule, indexes)));
  const anomaly = reports.some(r => r.status === 'observed_anomaly') ||
    Object.values(indexes).some(x => x.typeIssues);
  const incomplete = reports.some(r => r.status === 'not_observed' ||
    r.status === 'insufficient_evidence' || r.status === 'sampled_inconclusive') ||
    Object.values(indexes).some(x => !x.available || x.sampled);
  const status = anomaly ? 'observed_anomaly' :
    incomplete ? 'inconclusive' : 'observed_consistent';
  return Object.freeze({
    contract: SAVE_REFERENCE_PROBE_CONTRACT, status, rootValid: true,
    rules: reports,
    // Only counts; source map keys and actual ID numbers remain private.
    indexSizes: Object.freeze({
      container: indexes.container.keys.size,
      grid: indexes.grid.keys.size
    }),
    platformAndVersionUsedAsGates: false,
    referenceClosureVerified: false,
    exhaustive: false, writerAuthorized: false, exportAuthorized: false
  });
}

export function getSaveReferenceRelations() { return relations; }

/** Compare status/count changes in a privacy-redacted reference observation. */
export function compareSaveReferenceProbes(previous, current) {
  const left = probeSaveReferences(previous);
  const right = probeSaveReferences(current);
  const changes = Object.freeze(relations.rules.map((rule, i) => {
    const a = left.rules[i], b = right.rules[i];
    if (!a || !b) return Object.freeze({
      id: rule.id, status: 'insufficient_evidence',
      observedDelta: null, unresolvedDelta: null,
      writerAuthorized: false
    });
    const observedDelta = b.observed - a.observed;
    const unresolvedDelta = b.unresolved - a.unresolved;
    const changed = a.status !== b.status || observedDelta !== 0 ||
      unresolvedDelta !== 0 || a.resolved !== b.resolved ||
      a.missing !== b.missing || a.malformed !== b.malformed ||
      a.sampled !== b.sampled;
    return Object.freeze({
      id: rule.id, status: changed ? 'changed_observation' : 'same_observed_counts',
      observedDelta, unresolvedDelta, writerAuthorized: false
    });
  }));
  const status = !left.rootValid || !right.rootValid ? 'invalid_root' :
    left.status === 'observed_anomaly' || right.status === 'observed_anomaly' ?
      'observed_anomaly' :
    changes.some(row => row.status === 'changed_observation') ?
      'observed_reference_difference' : 'same_observed_counts';
  return Object.freeze({
    contract: SAVE_REFERENCE_COMPARISON_CONTRACT, status, changes,
    comparisonBasis: 'counts_and_status_only_not_numeric_identity',
    platformAndVersionUsedAsGates: false,
    referenceClosureVerified: false,
    exhaustive: false,
    writerAuthorized: false, exportAuthorized: false
  });
}
