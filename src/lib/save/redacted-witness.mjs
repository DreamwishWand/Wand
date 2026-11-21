// DB-05 read-only bridge: consume ONLY sanitized SRC-06 -> DB-05 ingest witnesses.
// Never accept raw save JSON, raw SRC-06 reports, personal ID keys, or unknown paths.
import { getLegacySaveFields, getCommonSaveFields, getNativeSaveFields } from './registry.mjs';

export const REDACTED_SAVE_WITNESS_CONTRACT = 'wand.db05.redacted-witness-comparison@1';
const PUBLIC_ROOT_PATHS = Object.freeze(['/GameInfo', '/GameInfo/Version', '/Player', '/World']);
const PUBLIC_KINDS = new Set(['array','object','string','number','integer','boolean','null','unverified']);
const PER_DOMAIN = Object.freeze(['inventory','chests','collection','grids','appearance','world','progression','cosmetics','player','profile']);
const KNOWN_FIELDS = new Map([
  ...PUBLIC_ROOT_PATHS.map(path => [path, 'root']),
  ...getLegacySaveFields().fields.map(field => [field.path, field.domain]),
  ...getCommonSaveFields().fields.map(field => [field.path, field.domain]),
  ...getNativeSaveFields().fields.map(field => [field.path, field.domain])
]);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sorted = list => [...list].sort();

function parseKinds(kind) {
  if (typeof kind !== 'string' || kind.length === 0 || kind.length > 100) {
    throw new TypeError('INVALID_PUBLIC_WITNESS_KIND');
  }
  const kinds = kind.split(',');
  if (kinds.length > 7 || kinds.some(k => !PUBLIC_KINDS.has(k))) {
    throw new TypeError('INVALID_PUBLIC_WITNESS_KIND');
  }
  return sorted(new Set(kinds));
}

/** Fail closed: raw SRC-06 fieldWitnesses and raw values are not admissible. */
function normalizeSummary(input) {
  // The private ingest.py contract is mandatory. A naked scanner report is not.
  if (!isRecord(input) || input.schema !== 'wand.db05.ingest@1' ||
      input.safeForPublicRepository !== false || input.writerAuthorized !== false ||
      !isRecord(input.current) || !Array.isArray(input.current.publicWitnesses) ||
      input.current.decoderAndBuildVerified !== false ||
      input.current.writerAuthorized !== false ||
      !Number.isSafeInteger(input.current.otherWitnessCount) ||
      input.current.otherWitnessCount < 0) {
    throw new TypeError('DB05_REDACTED_SUMMARY_REQUIRED');
  }
  if (input.current.publicWitnesses.length > KNOWN_FIELDS.size) {
    throw new TypeError('PUBLIC_WITNESS_LIMIT');
  }
  const fields = new Map();
  for (const entry of input.current.publicWitnesses) {
    if (!isRecord(entry) || typeof entry.path !== 'string' ||
        !KNOWN_FIELDS.has(entry.path)) {
      // Never include the supplied path or other input value in an error.
      throw new TypeError('UNRECOGNIZED_PUBLIC_WITNESS_PATH');
    }
    if (fields.has(entry.path)) throw new TypeError('DUPLICATE_PUBLIC_WITNESS_PATH');
    fields.set(entry.path, Object.freeze(parseKinds(entry.type)));
  }
  return {
    fields,
    rootObserved: input.current.rootRequiredFieldsPresent === true &&
      input.current.rootRequiredObjectsObserved === true,
    // Upstream is a lexical scanner; it does not prove duplicate-key/Codec safety.
    scannerVerified: false
  };
}

function typeRelation(left, right) {
  if (left.includes('unverified') || right.includes('unverified')) return 'unverified';
  if (left.join('|') === right.join('|')) return 'same';
  // Numeric kinds are not enough to prove a changed serialized field type:
  // integer is a subset of number, and scanners may use either spelling.
  const equivalentNumeric = kinds => kinds.every(kind => kind === 'integer' || kind === 'number');
  if (equivalentNumeric(left) && equivalentNumeric(right)) return 'numeric_ambiguity';
  const disjoint = left.every(kind => !right.includes(kind));
  return disjoint ? 'type_conflict' : 'type_set_drift';
}

/**
 * Returns a redacted structural witness comparison. Neither platform nor
 * gameVersion is read. The returned object has no user IDs, names, raw paths,
 * source values, or authorization flags that could grant Writer access.
 */
export function compareRedactedSaveWitnesses(previousSummary, currentSummary) {
  const previous = normalizeSummary(previousSummary);
  const current = normalizeSummary(currentSummary);
  const domains = PER_DOMAIN.map(domain => {
    const paths = [...KNOWN_FIELDS].filter(([, d]) => d === domain).map(([p]) => p);
    const addedKnownPaths = [], missingKnownPaths = [], differingKinds = [], unknownKinds = [];
    let shared = 0;
    for (const path of paths) {
      const a = previous.fields.get(path), b = current.fields.get(path);
      if (a === undefined && b === undefined) continue;
      if (a === undefined) { addedKnownPaths.push(path); continue; }
      if (b === undefined) { missingKnownPaths.push(path); continue; }
      shared++;
      const relation = typeRelation(a, b);
      if (relation === 'unverified') unknownKinds.push(path);
      else if (relation !== 'same') differingKinds.push(Object.freeze({
        path, relation, previousKinds: a, currentKinds: b
      }));
    }
    const observed = paths.some(path => previous.fields.has(path) || current.fields.has(path));
    const incompatible = differingKinds.some(row => row.relation === 'type_conflict');
    const ambiguous = unknownKinds.length || differingKinds.some(row => row.relation === 'numeric_ambiguity');
    const drift = addedKnownPaths.length || missingKnownPaths.length ||
      differingKinds.some(row => row.relation === 'type_set_drift');
    const status = !observed ? 'not_observed'
      : incompatible ? 'observed_type_conflict'
      : ambiguous ? 'inconclusive'
      : drift ? 'observed_witness_difference' : 'same_observed_witnesses';
    return Object.freeze({
      domain, status, sharedKnownPaths: shared,
      addedKnownPaths: Object.freeze(sorted(addedKnownPaths)),
      missingKnownPaths: Object.freeze(sorted(missingKnownPaths)),
      differingKinds: Object.freeze(differingKinds.sort((a, b) => a.path.localeCompare(b.path))),
      unknownKindPaths: Object.freeze(sorted(unknownKinds)),
      writerAuthorized: false
    });
  });
  const invalidRoot = !previous.rootObserved || !current.rootObserved;
  const overall = invalidRoot ? 'invalid_or_unverified_root'
    : domains.some(d => d.status === 'observed_type_conflict') ? 'observed_type_conflict'
    : domains.some(d => d.status === 'observed_witness_difference') ? 'observed_witness_difference'
    : domains.some(d => d.status === 'not_observed' || d.status === 'inconclusive') ? 'inconclusive'
    : 'same_observed_witnesses';
  return Object.freeze({
    contract: REDACTED_SAVE_WITNESS_CONTRACT,
    comparisonBasis: 'redacted_known_field_shapes_only',
    platformAndVersionUsedAsGates: false,
    status: overall,
    domains: Object.freeze(domains),
    source: 'src06_lexical_scanner_via_db05_private_ingest',
    authoritative: false,
    complete: false,
    strictDecoderVerified: false,
    referenceClosureVerified: false,
    writerAuthorized: false,
    ownershipMutationAuthorized: false,
    exportAuthorized: false
  });
}
