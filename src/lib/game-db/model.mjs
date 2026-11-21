// DB-00 shared contract. No platform APIs: usable by Node and SvelteKit.
export const SNAPSHOT_SCHEMA = 'wand.game-db.snapshot@1';
export const PATCH_SCHEMA = 'wand.game-db.patch@1';
export const RELEASE_SCHEMA = 'wand.game-db.release@1';
export const ACTIVE_SCHEMA = 'wand.game-db.active@1';
export const LOCALES = Object.freeze(['en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR']);
export const RELEASE_KINDS = Object.freeze(['free_update', 'expansion', 'adventure_pack']);
const SHA = /^[0-9a-f]{64}$/;
const ID = /^[1-9][0-9]{0,15}$/;
const KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function assert(condition, message) {
  if (!condition) throw new TypeError('Game DB: ' + message);
}
function uniqueStrings(value, label, pattern = null) {
  assert(Array.isArray(value), label + ' must be an array');
  const set = new Set();
  for (const entry of value) {
    assert(typeof entry === 'string' && entry.length > 0 && (!pattern || pattern.test(entry)), 'invalid ' + label + ' value');
    assert(!set.has(entry), 'duplicate ' + label + ' value: ' + entry);
    set.add(entry);
  }
  return value;
}
export function canonicalId(value) {
  const key = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  assert(typeof key === 'string' && ID.test(key) && Number.isSafeInteger(Number(key)), 'invalid numeric Item ID');
  return key;
}
export function validateTarget(target) {
  assert(target && typeof target === 'object', 'missing source target');
  assert(typeof target.platform === 'string' && target.platform.length > 0, 'missing platform');
  assert(target.gameVersion === null || (typeof target.gameVersion === 'string' && target.gameVersion.length > 0), 'invalid game version');
  assert(target.buildId === null || (typeof target.buildId === 'string' && target.buildId.length > 0), 'invalid build ID');
  assert(SHA.test(target.sourceSha256 ?? ''), 'missing source manifest SHA-256');
  return target;
}
export function validateRelease(release) {
  assert(release && KEY.test(release.id ?? ''), 'invalid release ID');
  assert(RELEASE_KINDS.includes(release.kind), 'invalid release kind');
  assert(typeof release.label === 'string' && release.label.length > 0, 'release requires a label');
  assert(release.gameVersion === null || (typeof release.gameVersion === 'string' && release.gameVersion.length > 0), 'invalid release gameVersion');
  uniqueStrings(release.contentIds ?? [], 'content IDs', KEY);
  return release;
}
export function validateItem(item) {
  assert(item && typeof item === 'object', 'item is not an object');
  canonicalId(item.id);
  assert(item.names && typeof item.names === 'object' && !Array.isArray(item.names), 'invalid localized names for ' + item.id);
  for (const [locale, name] of Object.entries(item.names)) {
    assert(LOCALES.includes(locale) && typeof name === 'string' && name.trim().length > 0, 'unverified locale label for ' + item.id);
  }
  assert(item.nameStatus === 'verified' || item.nameStatus === 'unverified', 'missing label verification state');
  if (item.nameStatus === 'unverified') assert(Object.keys(item.names).length === 0, 'unverified names cannot be published as verified');
  assert(item.category === null || (typeof item.category === 'string' && item.category.length > 0), 'invalid category');
  assert(item.subcategory === null || (typeof item.subcategory === 'string' && item.subcategory.length > 0), 'invalid subcategory');
  for (const key of ['worlds', 'universes', 'contentIds', 'releaseIds', 'relations']) {
    uniqueStrings(item[key] ?? [], key + ' for ' + item.id);
  }
  uniqueStrings(item.sourceRefs ?? [], 'source refs', KEY);
  return item;
}
export function validateSnapshot(snapshot) {
  assert(snapshot?.schema === SNAPSHOT_SCHEMA, 'unsupported snapshot schema');
  assert(KEY.test(snapshot.id ?? ''), 'invalid immutable snapshot ID');
  validateTarget(snapshot.target);
  assert(snapshot.coverage && typeof snapshot.coverage.scope === 'string' && snapshot.coverage.scope.length > 0, 'missing coverage scope');
  assert(typeof snapshot.coverage.complete === 'boolean', 'missing coverage completeness');
  assert(typeof snapshot.publishable === 'boolean', 'missing publishable flag');
  uniqueStrings(snapshot.coverage.categories ?? [], 'coverage categories');
  assert(Array.isArray(snapshot.sources) && snapshot.sources.length > 0, 'source ledger required');
  const sources = new Set();
  for (const source of snapshot.sources) {
    assert(KEY.test(source.id ?? '') && SHA.test(source.sha256 ?? ''), 'invalid source reference');
    assert(source.visibility === 'public_reference' || source.visibility === 'private', 'invalid source visibility');
    assert(!sources.has(source.id), 'duplicate source ID');
    sources.add(source.id);
  }
  assert(Array.isArray(snapshot.releases) && Array.isArray(snapshot.items), 'missing releases or items');
  const releaseIds = new Set();
  for (const release of snapshot.releases) {
    validateRelease(release);
    assert(!releaseIds.has(release.id), 'duplicate release ID');
    releaseIds.add(release.id);
  }
  const ids = new Set();
  for (const item of snapshot.items) {
    validateItem(item);
    assert(!ids.has(item.id), 'duplicate Item ID: ' + item.id);
    ids.add(item.id);
    for (const ref of item.sourceRefs) assert(sources.has(ref), 'missing item source ' + ref);
    for (const releaseId of item.releaseIds) assert(releaseIds.has(releaseId), 'missing referenced release ' + releaseId);
  }
  for (const item of snapshot.items) {
    for (const ref of item.relations) assert(ids.has(ref), 'dangling item relation ' + item.id + ' -> ' + ref);
  }
  if (snapshot.publishable) {
    assert(snapshot.sources.every((source) => source.visibility === 'public_reference'), 'private sources cannot be published');
    assert(snapshot.items.every((item) => item.nameStatus === 'verified'), 'unverified names cannot be published');
  }
  return snapshot;
}
export function legacyItem(index, row) {
  assert(Array.isArray(row) && row.length === 8, 'invalid legacy record');
  const id = canonicalId(row[0]);
  const names = {};
  for (let i = 0; i < LOCALES.length; i++) {
    const cleaned = String(row[7]?.[i] ?? '').replace(/<\/?nobr>/gi, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (cleaned) names[LOCALES[i]] = cleaned;
  }
  const lookup = (dictionary, value) => {
    assert(Number.isInteger(value) && value >= 0 && value < dictionary.length, 'legacy dictionary index out of range');
    return dictionary[value];
  };
  const item = {
    id, names, nameStatus: 'verified', category: lookup(index.f, row[1]), subcategory: null,
    stateClass: lookup(index.c, row[2]), stateSemantic: lookup(index.m, row[3]),
    worlds: (row[4] ?? []).map((v) => lookup(index.w, v)),
    universes: (row[5] ?? []).map((v) => lookup(index.u, v)),
    contentIds: (row[6] ?? []).map((v) => lookup(index.e, v)),
    releaseIds: [], relations: [], sourceRefs: ['legacy-collection-switch-1250']
  };
  return validateItem(item);
}
export function nativeItem(row) {
  const item = {
    id: canonicalId(row.itemId), names: {}, nameStatus: 'unverified',
    category: null, subcategory: null,
    nativeCategory: row.nativeCategory,
    worlds: [], universes: [], contentIds: [], releaseIds: [], relations: [],
    sourceRefs: ['src01-steam-1262']
  };
  return validateItem(item);
}
function valueFingerprint(item) {
  // Provenance differences alone are not game data changes.
  const keys = ['names', 'nameStatus', 'category', 'subcategory', 'stateClass',
    'stateSemantic', 'worlds', 'universes', 'contentIds', 'releaseIds', 'relations', 'nativeCategory', 'media'];
  return JSON.stringify(keys.map((key) => item[key] ?? null));
}
export function diffSnapshots(before, after) {
  validateSnapshot(before); validateSnapshot(after);
  const comparable = before.coverage.scope === after.coverage.scope &&
    JSON.stringify([...before.coverage.categories].sort()) === JSON.stringify([...after.coverage.categories].sort());
  if (!comparable) return { schema: 'wand.game-db.diff@1', from: before.id, to: after.id,
    comparable: false, reason: 'Coverage scope or category set differs; no addition/deletion assertion is valid.' };
  const old = new Map(before.items.map((item) => [item.id, item]));
  const current = new Map(after.items.map((item) => [item.id, item]));
  const added = [], changed = [], reclassified = [], removed = [];
  for (const [id, item] of current) {
    const prev = old.get(id);
    if (!prev) added.push(id);
    else {
      if (prev.category !== item.category || prev.subcategory !== item.subcategory) reclassified.push(id);
      if (valueFingerprint(prev) !== valueFingerprint(item)) changed.push(id);
    }
  }
  const canAssertRemovals = before.coverage.complete && after.coverage.complete;
  if (canAssertRemovals) for (const id of old.keys()) if (!current.has(id)) removed.push(id);
  const sort = (arr) => arr.sort((a, b) => Number(a) - Number(b));
  return { schema: 'wand.game-db.diff@1', from: before.id, to: after.id, comparable: true,
    removalsVerified: canAssertRemovals,
    added: sort(added), changed: sort(changed), reclassified: sort(reclassified), removed: sort(removed),
    oldOnlyUnverified: canAssertRemovals ? [] : sort([...old.keys()].filter((id) => !current.has(id))) };
}
export function searchItems(snapshot, query, locale = 'en', limit = 100) {
  validateSnapshot(snapshot);
  assert(LOCALES.includes(locale), 'unsupported locale');
  const text = String(query ?? '').trim().toLocaleLowerCase();
  const results = snapshot.items.filter((item) => {
    if (!text) return true;
    return item.id.includes(text) || Object.values(item.names).some((name) => name.toLocaleLowerCase().includes(text)) ||
      String(item.category ?? '').toLocaleLowerCase().includes(text);
  });
  return results.slice(0, Math.max(0, Math.min(500, limit)));
}
export function applyPatch(snapshot, patch) {
  validateSnapshot(snapshot);
  assert(patch?.schema === PATCH_SCHEMA, 'invalid patch schema');
  validateTarget(patch.target);
  assert(patch.target.platform === snapshot.target.platform &&
    patch.target.gameVersion === snapshot.target.gameVersion &&
    patch.target.buildId === snapshot.target.buildId, 'patch target mismatch');
  const known = new Map(snapshot.items.map((item) => [item.id, item]));
  const patched = new Set();
  for (const raw of patch.items ?? []) {
    const item = validateItem(raw);
    assert(!patched.has(item.id), 'duplicate patched ID');
    patched.add(item.id);
    const previous = known.get(item.id);
    if (previous && valueFingerprint(previous) !== valueFingerprint(item)) {
      throw new TypeError('Game DB: conflicting full-item patch ' + item.id + '; reconcile source fields explicitly');
    }
    known.set(item.id, previous ?? item);
  }
  const releases = [...snapshot.releases];
  for (const release of patch.releases ?? []) {
    validateRelease(release);
    const existing = releases.find((entry) => entry.id === release.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(release)) throw new TypeError('Game DB: conflicting release ' + release.id);
    if (!existing) releases.push(release);
  }
  const sources = [...snapshot.sources];
  for (const source of patch.sources ?? []) {
    const previous = sources.find((entry) => entry.id === source.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(source)) throw new TypeError('Game DB: conflicting source ' + source.id);
    if (!previous) sources.push(source);
  }
  return validateSnapshot({ ...snapshot, sources, releases, items: [...known.values()].sort((a, b) => Number(a.id) - Number(b.id)),
    publishable: snapshot.publishable && sources.every((source) => source.visibility === 'public_reference') });
}

export function buildSearchIndex(snapshot, locale = 'en') {
  validateSnapshot(snapshot);
  assert(LOCALES.includes(locale), 'unsupported search locale');
  const postings = new Map();
  for (const item of snapshot.items) {
    const label = item.names[locale] ?? item.names.en ?? '';
    const text = [item.id, label, item.category ?? '', ...item.worlds, ...item.universes].join(' ').toLocaleLowerCase();
    // Unicode tokens support all launch locales without losing non-Latin characters.
    const words = new Set(text.match(/[\p{L}\p{N}]+/gu) ?? []);
    for (const word of words) {
      const hits = postings.get(word) ?? [];
      hits.push(item.id);
      postings.set(word, hits);
    }
  }
  return { schema: 'wand.game-db.search@1', snapshot: snapshot.id, locale,
    terms: Object.fromEntries([...postings.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) };
}
