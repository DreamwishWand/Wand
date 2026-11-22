// DB-00 source-validated typed contract. No platform APIs: Node, Workers, SvelteKit.

/** Canonical DB-00 schema types shared by runtime, offline build and adapters. */
export interface DbTarget {
  platform:string;gameVersion:string|null;buildId:string|null;sourceSha256:string;
}
export interface DbRelease {
  id:string;kind:'free_update'|'expansion'|'adventure_pack';label:string;
  gameVersion:string|null;contentIds?:string[];
}
export interface DbSource {
  id:string;sha256:string;visibility:'public_reference'|'private';
  description?:string;
}
export interface DbItem {
  id:string;names:Record<string,string>;nameStatus:'verified'|'unverified';
  category:string|null;subcategory?:string|null;nativeCategory?:string|null;
  stateClass?:string|null;stateSemantic?:string|null;
  worlds:string[];universes:string[];contentIds:string[];
  releaseIds:string[];relations:string[];sourceRefs:string[];
  media?:{path:string;sha256:string}|null;
  attributes?:Record<string,unknown>|null;
}
export interface DbCoverage {
  scope:string;complete:boolean;categories:string[];
  itemDefinitions?:number;nameVerified?:number;nameUnverified?:number;
  semanticCategoriesVerified?:boolean;
}
export interface DbSnapshot {
  schema:typeof SNAPSHOT_SCHEMA;id:string;target:DbTarget;
  coverage:DbCoverage;publishable:boolean;sources:DbSource[];
  releases:DbRelease[];items:DbItem[];
}
export interface DbPatch {
  schema:typeof PATCH_SCHEMA;target:DbTarget;
  items:DbItem[];releases:DbRelease[];sources:DbSource[];
}
export interface LegacyCollectionIndex {
  f:string[];c:string[];m:string[];w:string[];u:string[];e:string[];
}

export const SNAPSHOT_SCHEMA = 'wand.game-db.snapshot@1';
export const PATCH_SCHEMA = 'wand.game-db.patch@1';
export const RELEASE_SCHEMA = 'wand.game-db.release@1';
export const ACTIVE_SCHEMA = 'wand.game-db.active@1';
export const LOCALES = Object.freeze(['en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR']);
export const RELEASE_KINDS = Object.freeze(['free_update', 'expansion', 'adventure_pack']);
const SHA = /^[0-9a-f]{64}$/;
const ID = /^[1-9][0-9]{0,15}$/;
const KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function assert(condition:unknown, message:string):asserts condition {
  if (!condition) throw new TypeError('Game DB: ' + message);
}
function uniqueStrings(value:unknown, label:string, pattern:RegExp|null=null):string[] {
  assert(Array.isArray(value), label + ' must be an array');
  const set = new Set<string>();
  for (const entry of value) {
    assert(typeof entry === 'string' && entry.length > 0 && (!pattern || pattern.test(entry)), 'invalid ' + label + ' value');
    assert(!set.has(entry), 'duplicate ' + label + ' value: ' + entry);
    set.add(entry);
  }
  return value;
}
export function canonicalId(value:unknown):string {
  const key = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  assert(typeof key === 'string' && ID.test(key) && Number.isSafeInteger(Number(key)), 'invalid numeric Item ID');
  return key;
}
export function validateTarget(raw:unknown):DbTarget {
  const target=raw as DbTarget;
  assert(target && typeof target === 'object' && !Array.isArray(target), 'missing source target');
  assert(typeof target.platform === 'string' && target.platform.length > 0, 'missing platform');
  assert(target.gameVersion === null || (typeof target.gameVersion === 'string' && target.gameVersion.length > 0), 'invalid game version');
  assert(target.buildId === null || (typeof target.buildId === 'string' && target.buildId.length > 0), 'invalid build ID');
  assert(typeof target.sourceSha256==='string' && SHA.test(target.sourceSha256), 'missing source manifest SHA-256');
  return target;
}
export function validateRelease(raw:unknown):DbRelease {
  const release=raw as DbRelease;
  assert(release && typeof release.id==='string' && KEY.test(release.id), 'invalid release ID');
  assert(RELEASE_KINDS.includes(release.kind), 'invalid release kind');
  assert(typeof release.label === 'string' && release.label.length > 0, 'release requires a label');
  assert(release.gameVersion === null || (typeof release.gameVersion === 'string' && release.gameVersion.length > 0), 'invalid release gameVersion');
  uniqueStrings(release.contentIds ?? [], 'content IDs', KEY);
  return release;
}
export function validateItem(raw:unknown):DbItem {
  const item=raw as DbItem;
  assert(item && typeof item === 'object' && !Array.isArray(item), 'item is not an object');
  const accepted = new Set(['id','names','nameStatus','category','subcategory',
    'stateClass','stateSemantic','nativeCategory','worlds','universes',
    'contentIds','releaseIds','relations','sourceRefs','media','attributes']);
  for (const field of Object.keys(item)) assert(accepted.has(field), 'unexpected item field ' + field);
  canonicalId(item.id);
  if (item.media != null) {
    assert(typeof item.media === 'object' && !Array.isArray(item.media) &&
      /^[0-9a-f]{64}$/.test(item.media.sha256 ?? '') &&
      /^ddv\/item-images\/[a-zA-Z0-9_.\/-]+\.webp$/.test(item.media.path ?? '') &&
      !item.media.path.includes('..'), 'unverified media reference for ' + item.id);
  }
  if (item.attributes != null) {
    assert(typeof item.attributes === 'object' && !Array.isArray(item.attributes) &&
      JSON.stringify(item.attributes).length <= 20000, 'invalid item attributes');
  }
  assert(item.names && typeof item.names === 'object' && !Array.isArray(item.names), 'invalid localized names for ' + item.id);
  for (const [locale, name] of Object.entries(item.names)) {
    assert(LOCALES.includes(locale) && typeof name === 'string' && name.trim().length > 0, 'unverified locale label for ' + item.id);
  }
  assert(item.nameStatus === 'verified' || item.nameStatus === 'unverified', 'missing label verification state');
  if (item.nameStatus === 'unverified') assert(Object.keys(item.names).length === 0, 'unverified names cannot be published as verified');
  assert(item.category === null || (typeof item.category === 'string' && item.category.length > 0), 'invalid category');
  assert(item.subcategory == null || (typeof item.subcategory === 'string' && item.subcategory.length > 0), 'invalid subcategory');
  for (const key of ['worlds', 'universes', 'contentIds', 'releaseIds', 'relations'] as const) {
    uniqueStrings(item[key] ?? [], key + ' for ' + item.id);
  }
  uniqueStrings(item.sourceRefs ?? [], 'source refs', KEY);
  return item;
}
export function validateSnapshot(raw:unknown):DbSnapshot {
  const snapshot=raw as DbSnapshot;
  assert(snapshot?.schema === SNAPSHOT_SCHEMA, 'unsupported snapshot schema');
  assert(KEY.test(snapshot.id ?? ''), 'invalid immutable snapshot ID');
  validateTarget(snapshot.target);
  assert(snapshot.coverage && typeof snapshot.coverage.scope === 'string' && snapshot.coverage.scope.length > 0, 'missing coverage scope');
  assert(typeof snapshot.coverage.complete === 'boolean', 'missing coverage completeness');
  assert(typeof snapshot.publishable === 'boolean', 'missing publishable flag');
  uniqueStrings(snapshot.coverage.categories ?? [], 'coverage categories');
  assert(Array.isArray(snapshot.sources) && snapshot.sources.length > 0, 'source ledger required');
  const sources = new Set<string>();
  for (const source of snapshot.sources) {
    assert(KEY.test(source.id ?? '') && SHA.test(source.sha256 ?? ''), 'invalid source reference');
    assert(source.visibility === 'public_reference' || source.visibility === 'private', 'invalid source visibility');
    assert(!sources.has(source.id), 'duplicate source ID');
    sources.add(source.id);
  }
  assert(Array.isArray(snapshot.releases) && Array.isArray(snapshot.items), 'missing releases or items');
  const releaseIds = new Set<string>();
  for (const release of snapshot.releases) {
    validateRelease(release);
    assert(!releaseIds.has(release.id), 'duplicate release ID');
    releaseIds.add(release.id);
  }
  const ids = new Set<string>();
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
    // Only the explicitly source-audited Steam 1.26.2 ItemList release
    // may publish IDs whose eight exact names are not known. Its labels
    // remain empty; the UI must never synthesize official names.
    const auditedUnnamed = snapshot.id === 'steam-1.26.2-native-itemlist-v1'
      && snapshot.target.platform === 'Steam'
      && snapshot.target.gameVersion === '1.26.2'
      && snapshot.coverage.scope === 'steam-v1.26.2-native-itemlist'
      && snapshot.coverage.itemDefinitions === 13202
      && snapshot.coverage.nameVerified === 11492
      && snapshot.coverage.nameUnverified === 1710
      && snapshot.items.length === 13202
      && snapshot.sources.length === 1
      && snapshot.sources[0].id === 'public-steam-1262-normalized';
    if (auditedUnnamed) {
      const named = snapshot.items.filter((item) => item.nameStatus === 'verified');
      const unnamed = snapshot.items.filter((item) => item.nameStatus === 'unverified');
      assert(named.length === 11492 && unnamed.length === 1710
        && named.every((item) => LOCALES.every((locale) => typeof item.names[locale] === 'string'))
        && unnamed.every((item) => Object.keys(item.names).length === 0),
        'Steam 1.26.2 source-audited name coverage mismatch');
    } else {
      assert(snapshot.items.every((item) => item.nameStatus === 'verified'),
        'unverified names cannot be published');
    }
  }
  return snapshot;
}
export function legacyItem(index:LegacyCollectionIndex, row:unknown):DbItem {
  assert(Array.isArray(row) && row.length === 8, 'invalid legacy record');
  const id = canonicalId(row[0]);
  const names:Record<string,string> = {};
  for (let i = 0; i < LOCALES.length; i++) {
    const cleaned = String(row[7]?.[i] ?? '').replace(/<\/?nobr>/gi, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (cleaned) names[LOCALES[i]] = cleaned;
  }
  const lookup = (dictionary:readonly string[], value:number):string => {
    assert(Number.isInteger(value) && value >= 0 && value < dictionary.length, 'legacy dictionary index out of range');
    return dictionary[value];
  };
  const item:DbItem = {
    id, names, nameStatus: 'verified', category: lookup(index.f, row[1]), subcategory: null,
    stateClass: lookup(index.c, row[2]), stateSemantic: lookup(index.m, row[3]),
    worlds: (row[4] ?? []).map((v) => lookup(index.w, v)),
    universes: (row[5] ?? []).map((v) => lookup(index.u, v)),
    contentIds: (row[6] ?? []).map((v) => lookup(index.e, v)),
    releaseIds: [], relations: [], sourceRefs: ['legacy-collection-switch-1250']
  };
  return validateItem(item);
}
export function nativeItem(row:{itemId:string|number;nativeCategory:string}, sourceId:string = 'src01-steam-1262'):DbItem {
  const item:DbItem = {
    id: canonicalId(row.itemId), names: {}, nameStatus: 'unverified',
    category: null, subcategory: null,
    nativeCategory: row.nativeCategory,
    worlds: [], universes: [], contentIds: [], releaseIds: [], relations: [],
    sourceRefs: [sourceId]
  };
  return validateItem(item);
}
function valueFingerprint(item:DbItem):string {
  // Provenance differences alone are not game data changes.
  const keys = ['names', 'nameStatus', 'category', 'subcategory', 'stateClass',
    'stateSemantic', 'worlds', 'universes', 'contentIds', 'releaseIds', 'relations', 'nativeCategory', 'media', 'attributes'] as const;
  return JSON.stringify(keys.map((key) => item[key] ?? null));
}
export function diffSnapshots(before:DbSnapshot, after:DbSnapshot) {
  validateSnapshot(before); validateSnapshot(after);
  const comparable = before.target.platform === after.target.platform &&
    before.coverage.scope === after.coverage.scope &&
    JSON.stringify([...before.coverage.categories].sort()) === JSON.stringify([...after.coverage.categories].sort());
  if (!comparable) return { schema: 'wand.game-db.diff@1', from: before.id, to: after.id,
    comparable: false, reason: 'Platform, coverage scope or category set differs; no addition/deletion assertion is valid.' };
  const old = new Map(before.items.map((item) => [item.id, item]));
  const current = new Map(after.items.map((item) => [item.id, item]));
  const added:string[] = [], changed:string[] = [], reclassified:string[] = [], removed:string[] = [];
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
  const sort = (arr:string[]) => arr.sort((a, b) => Number(a) - Number(b));
  return { schema: 'wand.game-db.diff@1', from: before.id, to: after.id, comparable: true,
    removalsVerified: canAssertRemovals,
    added: sort(added), changed: sort(changed), reclassified: sort(reclassified), removed: sort(removed),
    oldOnlyUnverified: canAssertRemovals ? [] : sort([...old.keys()].filter((id) => !current.has(id))) };
}
export function searchItems(snapshot:DbSnapshot, query:unknown, locale:string = 'en', limit:number = 100):DbItem[] {
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
function mergeItem(existing:DbItem, incoming:DbItem):DbItem {
  const merged = { ...existing, names: { ...existing.names } };
  for (const [locale, name] of Object.entries(incoming.names)) {
    const prior = merged.names[locale];
    if (prior !== undefined && prior !== name) {
      throw new TypeError('Game DB: conflicting verified label ' + existing.id + ' (' + locale + ')');
    }
    merged.names[locale] = name;
  }
  merged.nameStatus = existing.nameStatus === 'verified' || incoming.nameStatus === 'verified'
    ? 'verified' : 'unverified';
  for (const key of ['category', 'subcategory', 'stateClass', 'stateSemantic', 'nativeCategory', 'media', 'attributes'] as const) {
    const before = existing[key];
    const next = incoming[key];
    if (next == null) continue;
    if (before != null && JSON.stringify(before) !== JSON.stringify(next)) {
      throw new TypeError('Game DB: conflicting verified field ' + existing.id + ' (' + key + ')');
    }
    (merged as unknown as Record<string,unknown>)[key] = next;
  }
  for (const key of ['worlds', 'universes', 'contentIds', 'releaseIds', 'relations', 'sourceRefs'] as const) {
    merged[key] = [...new Set([...(existing[key] ?? []), ...(incoming[key] ?? [])])].sort();
  }
  return validateItem(merged);
}

export function applyPatch(snapshot:DbSnapshot, patch:DbPatch):DbSnapshot {
  validateSnapshot(snapshot);
  assert(patch?.schema === PATCH_SCHEMA, 'invalid patch schema');
  validateTarget(patch.target);
  // All streams must agree on the same trusted game-source release anchor.
  // Per-stream file hashes belong in patch.sources, not in a substituted target.
  assert(patch.target.platform === snapshot.target.platform &&
    patch.target.gameVersion === snapshot.target.gameVersion &&
    patch.target.buildId === snapshot.target.buildId &&
    patch.target.sourceSha256 === snapshot.target.sourceSha256, 'patch target mismatch');
  const known = new Map(snapshot.items.map((item) => [item.id, item]));
  const patched = new Set<string>();
  for (const raw of patch.items ?? []) {
    const item = validateItem(raw);
    assert(!patched.has(item.id), 'duplicate patched ID');
    patched.add(item.id);
    const previous = known.get(item.id);
    known.set(item.id, previous ? mergeItem(previous, item) : item);
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

export function buildSearchIndex(snapshot:DbSnapshot, locale:string = 'en') {
  validateSnapshot(snapshot);
  assert(LOCALES.includes(locale), 'unsupported search locale');
  const postings = new Map<string,string[]>();
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
