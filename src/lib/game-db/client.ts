/** DB-00 typed runtime transport; .mjs remains a compatibility reexport. */
import type { PublicSnapshot, DbTarget } from './integrated.ts';
type PublicRow = PublicSnapshot['items'][number];
type FetchImpl = typeof globalThis.fetch;
interface ActivePointer {
  schema:string; snapshot:string; kind:'legacy_collection'|'db_snapshot';
  path:string; target:DbTarget; indexSha256:string; publication:string;
}
interface ReleaseShard {
  file:string; offset:number; count:number; bytes:number; sha256:string;
}
interface ReleaseIndex {
  schema:string; id:string; count:number; target:DbTarget;
  coverage:PublicSnapshot['coverage']; sources:PublicSnapshot['sources'];
  releases:PublicSnapshot['releases']; shards:readonly ReleaseShard[];
  search?:readonly {locale:string;file:string;bytes:number;sha256:string}[];
}
interface ShardPayload {
  schema:string; offset:number; count:number; items:readonly PublicRow[];
}
export interface PublishedPage {
  items:readonly PublicRow[]; offset:number; itemCount:number;
  nextOffset:number|null; done:boolean;
}
export interface PublishedPageReader {
  kind:'db_snapshot'|'legacy_collection'; snapshotId:string;
  transport:'sha256_paged'|'eager_legacy'; itemCount:number;
  target:Readonly<DbTarget> | Readonly<{platform:string;gameVersion:string;buildID:string}>;
  coverage?:PublicSnapshot['coverage'];
  loadPage(options?:{offset?:number;limit?:number}):Promise<PublishedPage>;
}
import { loadCollectionRuntime, COLLECTION_RUNTIME_PATH } from '../collection/catalog.mjs';
import { ACTIVE_SCHEMA, RELEASE_SCHEMA, SNAPSHOT_SCHEMA, LOCALES,
  validateSnapshot, validateItem, canonicalId, legacyItem } from './model.mjs';

const ACTIVE_PATH = 'ddv/game-db/active.json';
function safePath(value:unknown):string {
  if (typeof value !== 'string' || !/^ddv\/[a-zA-Z0-9_.\/-]+$/.test(value) ||
      value.split('/').some((part) => !part || part === '..' || part === '.')) {
    throw new TypeError('Invalid game database manifest path');
  }
  return value;
}
function asset(base:string, path:string):string {
  if (typeof base !== 'string' || !/^\/?(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(base)) {
    throw new TypeError('Invalid SvelteKit asset base');
  }
  return (base ? '/' + base.replace(/^\/+|\/+$/g, '') : '') + '/' + safePath(path);
}
async function getJson(url:string, fetchImpl:FetchImpl):Promise<unknown> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error('Game database fetch failed (' + response.status + '): ' + url);
  return response.json();
}
async function sha256(buffer:ArrayBuffer):Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 verification unavailable');
  const raw = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(raw)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
async function checkedJSON(url:string, expectedHash:string, expectedBytes:number|null, fetchImpl:FetchImpl):Promise<unknown> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error('Game database fetch failed (' + response.status + '): ' + url);
  const bytes = await response.arrayBuffer();
  if (expectedBytes != null && bytes.byteLength !== expectedBytes) throw new Error('Game database byte count mismatch');
  if (await sha256(bytes) !== expectedHash) throw new Error('Game database SHA-256 mismatch');
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function loadActivePointer(base:string = '', fetchImpl:FetchImpl = globalThis.fetch):Promise<ActivePointer|null> {
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
  return pointer as ActivePointer;
}
export async function loadCurrentGameDatabase(base:string = '', fetchImpl:FetchImpl = globalThis.fetch) {
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
  const index = await checkedJSON(asset(base, root + '/index.json'), pointer.indexSha256, null, fetchImpl) as ReleaseIndex;
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
  const items:PublicRow[] = [];
  for (const shard of index.shards) {
    if (!/^items-[0-9]{3,}\.json$/.test(shard.file) ||
        shard.offset !== offset || !Number.isSafeInteger(shard.count) ||
        !Number.isSafeInteger(shard.bytes) || !/^[0-9a-f]{64}$/.test(shard.sha256)) {
      throw new TypeError('Invalid Game DB shard declaration');
    }
    const payload = await checkedJSON(asset(base, root + '/' + shard.file), shard.sha256, shard.bytes, fetchImpl) as ShardPayload;
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
  return { kind: 'db_snapshot' as const, ...(snapshot as PublicSnapshot) };
}
function collectionCompatibility(snapshot:PublicSnapshot) {
  const values = (key:'worlds'|'universes'|'contentIds') => [...new Set(snapshot.items.flatMap((item) => item[key] ?? []))].sort();
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
export async function loadActiveCollectionRuntime(base:string = '', fetchImpl:FetchImpl = globalThis.fetch) {
  const pointer = await loadActivePointer(base, fetchImpl);
  if (!pointer || pointer.kind === 'legacy_collection') return loadCollectionRuntime(base, fetchImpl);
  const database = await loadCurrentGameDatabase(base, fetchImpl);
  return collectionCompatibility(database);
}

export async function loadCurrentSearchIndex(base:string = '', locale:string = 'en', fetchImpl:FetchImpl = globalThis.fetch) {
  if (!LOCALES.includes(locale)) throw new TypeError('Unsupported game database search locale');
  const pointer = await loadActivePointer(base, fetchImpl);
  if (!pointer || pointer.kind === 'legacy_collection') return null; // Existing Collection uses its verified runtime.
  const releaseIndex = await checkedJSON(asset(base, pointer.path + '/index.json'), pointer.indexSha256, null, fetchImpl) as ReleaseIndex;
  const entry = releaseIndex.search?.find((source) => source.locale === locale);
  if (!entry || entry.file !== 'search-' + locale + '.json' || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) {
    throw new TypeError('Missing locale search index');
  }
  const search = await checkedJSON(asset(base, pointer.path + '/' + entry.file), entry.sha256, entry.bytes, fetchImpl) as {schema:string;snapshot:string;locale:string;terms:Record<string,string[]>};
  if (search.schema !== 'wand.game-db.search@1' || search.snapshot !== pointer.snapshot ||
      search.locale !== locale || !search.terms || typeof search.terms !== 'object') {
    throw new TypeError('Invalid locale search index');
  }
  return search;
}


/**
 * Open the active release without eagerly fetching its 13k+ Item definitions.
 *
 * index.json is pinned by active.json; each requested data shard is independently
 * SHA-256 checked. Range reads validate their local records and provenance, not
 * the unseen shards. Use loadCurrentGameDatabase() for full-graph validation.
 *
 * This is a data transport for intersection-observer / scroll-driven UIs, not
 * an inference that all game item families or locales are covered.
 */
export async function openCurrentGameDatabasePages(base:string = '', fetchImpl:FetchImpl = globalThis.fetch):Promise<PublishedPageReader> {
  const pointer = await loadActivePointer(base, fetchImpl);
  if (!pointer || pointer.kind === 'legacy_collection') {
    // Old releases have no verified seekable manifest; retain rollback behavior
    // without pretending the legacy transfer is network-lazy.
    const legacy = await loadCollectionRuntime(base, fetchImpl);
    return Object.freeze({
      kind: 'legacy_collection',
      snapshotId: pointer?.snapshot ?? 'legacy-switch-1.25.0',
      transport: 'eager_legacy',
      itemCount: legacy.rows.length,
      target: Object.freeze({ ...legacy.index.t }),
      async loadPage({ offset = 0, limit = 100 }: {offset?:number;limit?:number} = {}) {
        validatePageRange(offset, limit, legacy.rows.length);
        const items = legacy.rows.slice(offset, offset + limit)
          .map((row) => legacyItem(legacy.index, row));
        const nextOffset = offset + items.length;
        return { items, offset, itemCount: legacy.rows.length,
          nextOffset: nextOffset < legacy.rows.length ? nextOffset : null,
          done: nextOffset >= legacy.rows.length };
      }
    });
  }

  const root = pointer.path;
  const index = await checkedJSON(asset(base, root + '/index.json'), pointer.indexSha256, null, fetchImpl);
  if (index?.schema !== RELEASE_SCHEMA || index.id !== pointer.snapshot ||
      !Number.isSafeInteger(index.count) || index.count < 0 || index.count > 10_000_000 ||
      !Array.isArray(index.shards) ||
      index.target?.platform !== pointer.target.platform ||
      index.target?.gameVersion !== pointer.target.gameVersion ||
      index.target?.buildId !== pointer.target.buildId) {
    throw new TypeError('Invalid paged Game DB release index');
  }
  validateSnapshot({
    schema: SNAPSHOT_SCHEMA, id: index.id, target: index.target,
    coverage: index.coverage, sources: index.sources, releases: index.releases,
    publishable: false, items: []
  });
  if (!index.sources.every((source) => source.visibility === 'public_reference') ||
      (index.coverage.itemDefinitions !== undefined &&
        index.coverage.itemDefinitions !== index.count)) {
    throw new TypeError('Invalid paged Game DB release provenance');
  }

  let next = 0;
  const declared = new Set<string>();
  for (const shard of index.shards) {
    if (!shard || typeof shard.file !== 'string' ||
        !/^items-[0-9]{3,}\.json$/.test(shard.file) || declared.has(shard.file) ||
        shard.offset !== next || !Number.isSafeInteger(shard.count) || shard.count < 1 ||
        !Number.isSafeInteger(shard.bytes) || shard.bytes < 1 || shard.bytes > 32_000_000 ||
        !/^[0-9a-f]{64}$/.test(shard.sha256 ?? '')) {
      throw new TypeError('Invalid paged Game DB shard declaration');
    }
    declared.add(shard.file);
    next += shard.count;
    if (!Number.isSafeInteger(next) || next > index.count)
      throw new TypeError('Paged Game DB shard count overflow');
  }
  if (next !== index.count) throw new TypeError('Paged Game DB shard coverage mismatch');

  const sourceIds = new Set(index.sources.map((source) => source.id));
  const releaseIds = new Set(index.releases.map((release) => release.id));
  const shardCache = new Map<string,Promise<readonly PublicRow[]>>();
  async function readShard(shard:ReleaseShard):Promise<readonly PublicRow[]> {
    const cached = shardCache.get(shard.file);
    if (cached) return cached;
    const pending = (async () => {
      const payload = await checkedJSON(asset(base, root + '/' + shard.file),
        shard.sha256, shard.bytes, fetchImpl) as ShardPayload;
      if (payload?.schema !== SNAPSHOT_SCHEMA ||
          payload.offset !== shard.offset || payload.count !== shard.count ||
          !Array.isArray(payload.items) || payload.items.length !== shard.count)
        throw new TypeError('Paged Game DB shard contract mismatch');
      const seen = new Set();
      const rows = payload.items.map((item:PublicRow) => {
        validateItem(item);
        if (index.id === 'steam-1.26.2-native-itemlist-v1' &&
            item.nameStatus === 'verified' &&
            !LOCALES.every((locale) => typeof item.names[locale] === 'string')) {
          throw new TypeError('Paged Game DB source-audited locale coverage mismatch');
        }
        canonicalId(item.id);
        if (seen.has(item.id) ||
            !item.sourceRefs.every((ref) => sourceIds.has(ref)) ||
            !item.releaseIds.every((ref) => releaseIds.has(ref)))
          throw new TypeError('Paged Game DB duplicate Item ID or invalid source/release ref');
        for (const ref of item.relations) canonicalId(ref);
        seen.add(item.id);
        return item;
      });
      return rows;
    })();
    shardCache.set(shard.file, pending);
    try { return await pending; }
    catch (error) {
      if (shardCache.get(shard.file) === pending) shardCache.delete(shard.file);
      throw error;
    }
  }

  return Object.freeze({
    kind: 'db_snapshot',
    snapshotId: index.id,
    transport: 'sha256_paged',
    itemCount: index.count,
    target: Object.freeze({ ...index.target }),
    coverage: Object.freeze({ ...index.coverage, categories: Object.freeze([...index.coverage.categories]) }),
    async loadPage({ offset = 0, limit = 100 } = {}) {
      validatePageRange(offset, limit, index.count);
      const end = Math.min(index.count, offset + limit);
      const required = index.shards.filter((shard) =>
        shard.offset < end && shard.offset + shard.count > offset);
      const fragments = await Promise.all(required.map(async (shard) => {
        const rows = await readShard(shard);
        const start = Math.max(0, offset - shard.offset);
        const stop = Math.min(rows.length, end - shard.offset);
        return rows.slice(start, stop);
      }));
      // Never return the in-memory integrity-checked cached objects by reference:
      // callers may edit display objects without changing subsequent page reads.
      const items = fragments.flat().map((item) => structuredClone(item));
      if (items.length !== end - offset) throw new TypeError('Paged Game DB incomplete range');
      return { items, offset, itemCount: index.count,
        nextOffset: end < index.count ? end : null, done: end >= index.count };
    }
  });
}

function validatePageRange(offset:number, limit:number, count:number):void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > count ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 500)
    throw new TypeError('Invalid paged Game DB offset or limit');
}
