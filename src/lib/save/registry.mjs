import registry from '../../../data/ddv/save/registry.v1.json' with { type: 'json' };
import legacyFields from '../../../data/ddv/save/legacy626-fields.v1.json' with { type: 'json' };

export const SAVE_REGISTRY_SCHEMA = 'wand.db05.save-registry@1';
export const SAVE_INSPECTION_CONTRACT = 'wand.db05.save-readonly-inspection@1';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;

export function getSaveRegistry() { return registry; }
export function getLegacySaveFields() { return legacyFields; }

export function matchSaveBuild({ platform, identityKind, identity, schemaVersion }) {
  if (typeof platform !== 'string' || typeof identityKind !== 'string' || typeof identity !== 'string') return null;
  return registry.builds.find(build => build.platform === platform && build.identityKind === identityKind && build.identity === identity && build.schemaVersion === schemaVersion) ?? null;
}

/** Strict validation of JSON text belongs to the Codec, before JSON.parse. No writer authority. */
export function inspectDecodedSave(decoded, declaredBuild) {
  const issues = [];
  const build = matchSaveBuild(declaredBuild ?? {});
  if (!build) issues.push('BUILD_OR_SCHEMA_NOT_REGISTERED');
  if (!plain(decoded)) issues.push('ROOT_MUST_BE_OBJECT');
  const info = plain(decoded) && own(decoded, 'GameInfo') ? decoded.GameInfo : undefined;
  if (!plain(info)) issues.push('GAMEINFO_MUST_BE_OBJECT');
  const schema = plain(info) && own(info, 'Version') ? info.Version : undefined;
  if (!integer(schema)) issues.push('GAMEINFO_VERSION_MUST_BE_NONNEGATIVE_SAFE_INTEGER');
  if (build && schema !== build.schemaVersion) issues.push('SAVE_SCHEMA_MISMATCH');
  for (const key of ['Player', 'World']) {
    if (!plain(decoded) || !own(decoded, key) || !plain(decoded[key])) issues.push(key.toUpperCase() + '_MUST_BE_OBJECT');
  }
  return Object.freeze({
    contract: SAVE_INSPECTION_CONTRACT,
    buildCandidate: build?.key ?? null,
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
    if (!plain(row) || !integer(row[key])) throw new TypeError('INVALID_CATALOG_ID');
    if (index.has(row[key])) throw new TypeError('DUPLICATE_CATALOG_ID');
    index.set(row[key], row);
  }
  return index;
}

export function matchGameId(index, id) {
  if (!(index instanceof Map) || !integer(id)) return null;
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
