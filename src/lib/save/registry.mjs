import registry from '../../../data/ddv/save/registry.v1.json' with { type: 'json' };
import legacyFields from '../../../data/ddv/save/legacy626-fields.v1.json' with { type: 'json' };

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
deepFreeze(registry);
deepFreeze(legacyFields);

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
    if (!nodes.length) return { status: 'not_observed', sampled };
  }
  return {
    status: nodes.every(v => field.type.split('|').includes(shapeType(v))) ? 'observed' : 'type_conflict',
    sampled
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
