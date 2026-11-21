import { loadCollectionRuntime, COLLECTION_RUNTIME_PATH } from '../collection/catalog.mjs';
import { ACTIVE_SCHEMA, RELEASE_SCHEMA, SNAPSHOT_SCHEMA, LOCALES,
  validateSnapshot, legacyItem } from './model.mjs';

const ACTIVE_PATH = 'ddv/game-db/active.json';
function safePath(value) {
  if (typeof value !== 'string' || !/^ddv\/[a-zA-Z0-9_.\/-]+$/.test(value) ||
      value.split('/').some((part) => !part || part === '..' || part === '.')) {
    throw new TypeError('Invalid game database manifest path');
  }
  return value;
}
function asset(base, path) {
  if (typeof base !== 'string' || !/^\/?(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(base)) {
    throw new TypeError('Invalid SvelteKit asset base');
  }
  return (base ? '/' + base.replace(/^\/+|\/+$/g, '') : '') + '/' + safePath(path);
}
async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error('Game database fetch failed (' + response.status + '): ' + url);
  return response.json();
}
async function sha256(buffer) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 verification unavailable');
  const raw = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(raw)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
async function checkedJSON(url, expectedHash, expectedBytes, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error('Game database fetch failed (' + response.status + '): ' + url);
  const bytes = await response.arrayBuffer();
  if (expectedBytes != null && bytes.byteLength !== expectedBytes) throw new Error('Game database byte count mismatch');
  if (await sha256(bytes) !== expectedHash) throw new Error('Game database SHA-256 mismatch');
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function loadActivePointer(base = '', fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(asset(base, ACTIVE_PATH));
  if (response.status === 404) return null; // Older GitHub Pages deployment, before DB-00.
  if (!response.ok) throw new Error('Game DB active pointer request failed (' + response.status + ')');
  const pointer = await response.json();
  if (pointer?.schema !== ACTIVE_SCHEMA ||
      !['legacy_collection', 'db_snapshot'].includes(pointer.kind) ||
      typeof pointer.snapshot !== 'string' || !pointer.snapshot ||
      !pointer.target || typeof pointer.target.platform !== 'string') {
    throw new TypeError('Invalid Game DB active pointer');
  }
  safePath(pointer.path);
  if (pointer.kind === 'legacy_collection' && pointer.path !== COLLECTION_RUNTIME_PATH) {
    throw new TypeError('Unsupported legacy Collection path');
  }
  if (pointer.kind === 'db_snapshot' &&
    (!/^[0-9a-f]{64}$/.test(pointer.indexSha256 ?? '') || !pointer.path.includes('/releases/'))) {
    throw new TypeError('Invalid immutable Game DB release pointer');
  }
  return pointer;
}
export async function loadCurrentGameDatabase(base = '', fetchImpl = globalThis.fetch) {
  const pointer = await loadActivePointer(base, fetchImpl);
  if (!pointer || pointer.kind === 'legacy_collection') {
    const legacy = await loadCollectionRuntime(base, fetchImpl);
    return {
      kind: 'legacy_collection', id: pointer?.snapshot ?? 'legacy-switch-1.25.0',
      target: legacy.index.t,
      coverage: { scope: 'collection-legacy-reference', complete: true },
      items: legacy.rows.map((row) => legacyItem(legacy.index, row)),
      legacy
    };
  }
  const root = pointer.path;
  const index = await checkedJSON(asset(base, root + '/index.json'), pointer.indexSha256, null, fetchImpl);
  if (index?.schema !== RELEASE_SCHEMA || index.id !== pointer.snapshot ||
      !Array.isArray(index.shards) || !Number.isSafeInteger(index.count)) {
    throw new TypeError('Invalid Game DB release index');
  }
  if (index.target?.platform !== pointer.target.platform ||
      index.target.gameVersion !== pointer.target.gameVersion ||
      index.target.buildId !== pointer.target.buildId) {
    throw new TypeError('Game DB release target mismatch');
  }
  let offset = 0;
  const items = [];
  for (const shard of index.shards) {
    if (!/^items-[0-9]{3,}\.json$/.test(shard.file) ||
        shard.offset !== offset || !Number.isSafeInteger(shard.count) ||
        !Number.isSafeInteger(shard.bytes) || !/^[0-9a-f]{64}$/.test(shard.sha256)) {
      throw new TypeError('Invalid Game DB shard declaration');
    }
    const payload = await checkedJSON(asset(base, root + '/' + shard.file), shard.sha256, shard.bytes, fetchImpl);
    if (payload.schema !== SNAPSHOT_SCHEMA || payload.offset !== offset || payload.count !== shard.count ||
        !Array.isArray(payload.items) || payload.items.length !== shard.count) {
      throw new TypeError('Game DB shard contract mismatch');
    }
    items.push(...payload.items);
    offset += shard.count;
  }
  if (items.length !== index.count) throw new TypeError('Game DB item count mismatch');
  const snapshot = validateSnapshot({
    schema: SNAPSHOT_SCHEMA, id: index.id, target: index.target, coverage: index.coverage,
    sources: index.sources, releases: index.releases, publishable: true, items
  });
  return { kind: 'db_snapshot', ...snapshot };
}
function collectionCompatibility(snapshot) {
  const values = (key) => [...new Set(snapshot.items.flatMap((item) => item[key] ?? []))].sort();
  const f = [...new Set(snapshot.items.map((item) => item.category).filter(Boolean))].sort();
  const c = [...new Set(snapshot.items.map((item) => item.stateClass ?? 'READ_ONLY'))].sort();
  const m = [...new Set(snapshot.items.map((item) => item.stateSemantic ?? 'UNLOCK_OR_AVAILABILITY'))].sort();
  const w = values('worlds'), u = values('universes'), e = values('contentIds');
  const index = {
    t: { platform: snapshot.target.platform, gameVersion: snapshot.target.gameVersion, buildID: snapshot.target.buildId },
    f, c, m, w, u, e, wl: w.map((value) => LOCALES.map(() => value)),
    ul: u.map((value) => LOCALES.map(() => value))
  };
  const rows = snapshot.items.map((item) => [
    Number(item.id), f.indexOf(item.category), c.indexOf(item.stateClass ?? 'READ_ONLY'),
    m.indexOf(item.stateSemantic ?? 'UNLOCK_OR_AVAILABILITY'),
    item.worlds.map((value) => w.indexOf(value)),
    item.universes.map((value) => u.indexOf(value)),
    item.contentIds.map((value) => e.indexOf(value)),
    LOCALES.map((locale) => item.names[locale] ?? '')
  ]);
  return { index, rows };
}
// Collection uses the currently published pointer. Existing local user entries keep numeric Item IDs.
export async function loadActiveCollectionRuntime(base = '', fetchImpl = globalThis.fetch) {
  const pointer = await loadActivePointer(base, fetchImpl);
  if (!pointer || pointer.kind === 'legacy_collection') return loadCollectionRuntime(base, fetchImpl);
  const database = await loadCurrentGameDatabase(base, fetchImpl);
  return collectionCompatibility(database);
}
