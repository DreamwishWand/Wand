import {loadCompleteCollection} from './db01-complete-catalog.ts';
import init, { CollectionEngine } from './wasm/pkg/wand_collection_core.js';
import wasmUrl from './wasm/pkg/wand_collection_core_bg.wasm?url';
import type { Db01Item } from '$lib/items/index';

export const LEGACY_STORAGE_KEY = 'dreamwishwand.collection.local.v1';
const ACTIVE = 'ddv/game-db/active.json';
const VERIFIED_LEGACY = 'ddv/collection/v1.25';
const DB_NAME = 'dreamwishwand-collection';
const STORE_NAME = 'state';
const STATE_KEY = 'current';
const MAX_FILE_BYTES = 10_000_000;
// Only these audited, explicitly owner-selected files can enter the private
// loader. Keep the verified-only v1 bundle compatible with the complete v2.
const OWNER_LOCAL_DB01_FILES = [
  { schema:'wand.collection.owner-local-db01@2',
    id:'db01-steam-1-26-2-owner-local-complete', count:13_202,
    bytes:7_245_529,
    sha256:'b03d6cfd8a81443428a03aee65cf34c03591b5f1bce351b5c6461a7bdfe3affe' },
  { schema:'wand.collection.owner-local-db01@1',
    id:'db01-steam-1-26-2-owner-local-verified', count:11_492,
    bytes:6_744_949,
    sha256:'6e4aa04fa043633a4d7badb7e5b25e9b70fa56f5b0bea002d0d4846ca11d8ef8' }
] as const;

export interface CollectionEntry {
  status?: 'owned' | 'missing';
  quantity?: number;
  discovered?: boolean;
  favorite?: boolean;
}

/** Internal projection produced only after a decoder has verified the save
 * field's game semantics. Raw P1G CollectionSets map-key presence or boolean
 * shapes must NEVER be mapped into this contract. */
export interface MappedSaveStatusImport {
  schema: 'wand.collection.mapped-save-status@1';
  entries: readonly {
    itemId: number;
    status: 'owned' | 'missing' | 'unknown';
  }[];
}

/** Native CollectionSet boolean is discovered history, NOT owned status. */
export interface MappedSaveDiscoveryImport {
  schema: 'wand.collection.mapped-save-discovery@1';
  entries: readonly { itemId: number; discovered: boolean }[];
}
export interface CollectionWorkspace {
  id: string;
  name: string;
  entries: Record<string, CollectionEntry>;
}
export interface CollectionState {
  schema: 'wand.collection.local@1';
  active: string;
  workspaces: CollectionWorkspace[];
}
export interface CollectionItem {
  itemId: number;
  label: string;
  nameVerified: boolean;
  family: string;
  stateSemantic: string;
  worlds: string[];
  universes: string[];
  expansions: string[];
  status: 'owned' | 'missing' | 'unknown';
  quantity: number | null;
  discovered: boolean | null;
  favorite: boolean | null;
}
export interface CollectionPage {
  total: number;
  hasMore: boolean;
  items: CollectionItem[];
}
export interface CollectionFacet {
  id: string;
  label: string;
  total: number;
  owned: number;
}
export interface CollectionProgress {
  total: number;
  owned: number;
  missing: number;
  unknown: number;
  discovered: number;
}
export interface CollectionFilter {
  locale: string;
  search: string;
  category: string;
  world: string;
  universe: string;
  expansion: string;
  status: string;
  /** Local favorite annotation; only items explicitly starred by the user. */
  favoriteOnly?: boolean;
  nameStatus?: 'all'|'verified'|'unverified';
  offset: number;
  limit: number;
}
export type PublicDb01Item = Pick<Db01Item,'itemId'|'names'|'nativeCategory'>;
export interface CollectionRuntimeMetadata {
  snapshot: string;
  nameCoverage?: Readonly<{ itemDefinitions:number;nameVerified:number;nameUnverified:number }> | null;
  platform: string;
  version: string | null;
  expansions: readonly string[];
  worlds: readonly string[];
  universes: readonly string[];
  worldLabels: readonly string[][];
  universeLabels: readonly string[][];
  /** Explicit reviewed Item membership evidence; raw source tags are insufficient. */
  verifiedScopeMembership?: Readonly<{
    world?: 'verified_game_collection_area_item_membership';
    universe?: 'verified_game_collection_universe_item_membership';
  }>;
}
interface PublicLegacyIndex {
  s: string;
  t: { platform: string; gameVersion: string; buildID: string };
  n: number;
  w: string[];
  u: string[];
  e: string[];
  wl: string[][];
  ul: string[][];
  shards: { file: string; offset: number; count: number; bytes: number; sha256: string }[];
}
interface PublicDb00Index {
  schema: 'wand.game-db.release@1';
  coverage?: { scope:string;itemDefinitions?:number;nameVerified?:number;nameUnverified?:number;semanticCategoriesVerified?:boolean };
  id: string;
  count: number;
  target: { platform: string; gameVersion: string|null; buildId: string|null };
  /** Only a separately reviewed item-to-Collection-scope release may assert these. */
  collectionScopeEvidence?: {
    schema:'wand.collection.scope-membership@1';
    world?: 'verified_game_collection_area_item_membership';
    universe?: 'verified_game_collection_universe_item_membership';
    /** Exact, current-game 8-locale display names keyed by verified Item-axis IDs. */
    worldLabels?: Record<string,string[]>;
    universeLabels?: Record<string,string[]>;
  };
  shards: { file: string; offset: number; count: number; bytes: number; sha256: string }[];
}
interface OwnerLocalDb01Bundle {
  schema: 'wand.collection.owner-local-db01@1' | 'wand.collection.owner-local-db01@2';
  index: PublicDb00Index & { sources: { id:string;visibility:string }[] };
  shards: string[];
  coverage: { itemDefinitions:number; nameVerified:number; nameUnverified:number };
  sourceAuditSha256: string;
}
interface ActiveDb00Pointer {
  schema: string;
  kind: string;
  path: string;
  snapshot: string;
  publication: string;
  indexSha256?: string;
  target?: { platform: string; gameVersion: string|null; buildId: string|null };
}
function asset(base: string, path: string): string {
  if (!/^\/?(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(base)
      || !/^ddv\/[A-Za-z0-9_./-]+$/.test(path)
      || path.split('/').some(x => x === '.' || x === '..')) {
    throw new Error('COLLECTION_ASSET_PATH_INVALID');
  }
  return (base ? '/' + base.replace(/^\/+|\/+$/g,'') : '') + '/' + path;
}
async function digestSha256(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('COLLECTION_CRYPTO_UNAVAILABLE');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    x => x.toString(16).padStart(2,'0')).join('');
}
async function download(url: string, expectedBytes: number | null = null, expectedHash: string | null = null): Promise<string> {
  const response = await fetch(url, { credentials:'same-origin' });
  if (!response.ok || response.redirected) throw new Error('COLLECTION_ASSET_UNAVAILABLE');
  const bytes = await response.arrayBuffer();
  if (expectedBytes !== null && bytes.byteLength !== expectedBytes) throw new Error('COLLECTION_ASSET_SIZE_MISMATCH');
  if (expectedHash !== null) {
    const hash = await digestSha256(bytes);
    if (hash !== expectedHash) throw new Error('COLLECTION_ASSET_HASH_MISMATCH');
  }
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
/** DB-00's Rust metadata uses original Tag keys as the default labels.
 * A reviewed Collection UI release MUST provide current source names instead
 * of letting technical Item/Tag identifiers leak into the interface.
 */
function reviewedScopeNames(
  ids:readonly string[],
  supplied:Readonly<Record<string,readonly string[]>>|undefined,
):readonly string[][]{
  if(!supplied||Object.keys(supplied).length!==ids.length)
    throw new Error('COLLECTION_SCOPE_LABELS_MISSING');
  const unique=new Set(ids);
  if(unique.size!==ids.length)throw new Error('COLLECTION_SCOPE_IDS_DUPLICATE');
  return ids.map(id=>{
    const row=supplied[id];
    if(!Array.isArray(row)||row.length!==8||row.some(v=>
      typeof v!=='string'||v.trim()!==v||v.length<1||v.length>160||
      /[\u0000-\u001f]/.test(v)||/[<>]/.test(v)||/^\{(?:Placeholder|DoNotTranslate)/.test(v)))
      throw new Error('COLLECTION_SCOPE_LABELS_INVALID');
    return [...row];
  });
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(DB_NAME,1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? Error('COLLECTION_INDEXEDDB_OPEN_FAILED'));
    request.onblocked = () => reject(Error('COLLECTION_INDEXEDDB_BLOCKED'));
  });
}
function readIdb(db: IDBDatabase): Promise<string | undefined> {
  return new Promise((resolve,reject) => {
    const transaction = db.transaction(STORE_NAME,'readonly');
    const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
    request.onsuccess = () => {
      if (request.result === undefined) resolve(undefined);
      else if (typeof request.result === 'string') resolve(request.result);
      else reject(Error('COLLECTION_INDEXEDDB_FORMAT'));
    };
    request.onerror = () => reject(request.error ?? Error('COLLECTION_INDEXEDDB_READ_FAILED'));
  });
}
/** Compare-and-swap in one readwrite transaction. Parallel tabs must never
 * silently overwrite each other's Collection records or backup restores. */
function writeIdb(db: IDBDatabase, payload: string, expected: string | null): Promise<void> {
  return new Promise((resolve,reject) => {
    const transaction = db.transaction(STORE_NAME,'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const read = store.get(STATE_KEY);
    let conflict = false;
    read.onsuccess = () => {
      const current = read.result === undefined ? null : read.result;
      if (current !== expected) {
        conflict = true;
        transaction.abort();
      } else {
        store.put(payload,STATE_KEY);
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? Error('COLLECTION_INDEXEDDB_WRITE_FAILED'));
    transaction.onabort = () => reject(conflict
      ? Error('COLLECTION_STORAGE_CONFLICT')
      : (transaction.error ?? Error('COLLECTION_INDEXEDDB_ABORTED')));
  });
}
export class CollectionRuntime {
  readonly metadata: CollectionRuntimeMetadata;
  readonly isOwnerLocal: boolean;
  readonly ownerLocalCoverage: Readonly<{ itemDefinitions:number;nameVerified:number;nameUnverified:number }> | null;
  private readonly engine: CollectionEngine;
  private db: IDBDatabase | null = null;
  private busy = false;
  private persistedState: string | null = null;
  private constructor(engine: CollectionEngine, metadata: CollectionRuntimeMetadata,
    ownerLocalCoverage: OwnerLocalDb01Bundle['coverage'] | null = null) {
    this.engine = engine;
    this.metadata = metadata;
    this.isOwnerLocal = ownerLocalCoverage !== null;
    this.ownerLocalCoverage = ownerLocalCoverage;
  }
  static async open(base: string): Promise<CollectionRuntime> {
    const active = JSON.parse(await download(asset(base,ACTIVE))) as ActiveDb00Pointer;
    if (active.schema !== 'wand.game-db.active@1'
      || typeof active.snapshot !== 'string' || !active.snapshot) {
      throw new Error('COLLECTION_DB00_POINTER_INVALID');
    }
    await init(wasmUrl);
    const engine = new CollectionEngine();
    let metadata: CollectionRuntimeMetadata;
    try {
      if (active.kind === 'legacy_collection') {
        if (active.path !== VERIFIED_LEGACY
          || active.publication !== 'existing_verified_public_reference') {
          throw new Error('COLLECTION_PUBLIC_SNAPSHOT_NOT_AVAILABLE');
        }
        const source = await download(asset(base,VERIFIED_LEGACY+'/index.json'));
        const manifest = JSON.parse(source) as PublicLegacyIndex;
        if (manifest.s !== 'wand.collection.runtime@1')
          throw new Error('COLLECTION_INDEX_INVALID');
        engine.load_index(source);
        const expected = manifest.shards.reduce((sum,shard)=>sum+shard.count,0);
        if (expected !== manifest.n) throw new Error('COLLECTION_INDEX_COUNT_MISMATCH');
        for (const shard of manifest.shards) {
          const text = await download(asset(base,VERIFIED_LEGACY+'/'+shard.file),shard.bytes,shard.sha256);
          engine.append_shard(text);
        }
        metadata = {
          snapshot: active.snapshot, platform: manifest.t.platform, version: manifest.t.gameVersion,
          expansions:manifest.e, worlds:manifest.w, universes:manifest.u,
          worldLabels:manifest.wl, universeLabels:manifest.ul
          // The historical Switch reference contains world/universe Tag
          // associations, not source-reviewed game CollectionArea membership.
          // Do NOT automatically certify these legacy axes.
        };
      } else if (active.kind === 'db_snapshot') {
        if (active.publication !== 'validated_public_snapshot'
          || typeof active.path !== 'string'
          || !/^ddv\/game-db\/releases\/[A-Za-z0-9._-]+$/.test(active.path)
          || active.path.includes('..')
          || typeof active.indexSha256 !== 'string'
          || !/^[a-f0-9]{64}$/.test(active.indexSha256)
          || !active.target) {
          throw new Error('COLLECTION_DB00_PUBLIC_RELEASE_REQUIRED');
        }
        const source = await download(asset(base,active.path+'/index.json'),null,active.indexSha256);
        const manifest = JSON.parse(source) as PublicDb00Index;
        if (manifest.schema !== 'wand.game-db.release@1'
          || manifest.id !== active.snapshot
          || manifest.target.platform !== active.target.platform
          || manifest.target.gameVersion !== active.target.gameVersion
          || manifest.target.buildId !== active.target.buildId) {
          throw new Error('COLLECTION_DB00_PUBLIC_RELEASE_MISMATCH');
        }
        if (manifest.id === 'steam-1.26.2-native-itemlist-v1' &&
          (manifest.count !== 13_202
            || manifest.coverage?.scope !== 'steam-v1.26.2-native-itemlist'
            || manifest.coverage.itemDefinitions !== 13_202
            || manifest.coverage.nameVerified !== 11_492
            || manifest.coverage.nameUnverified !== 1_710
            || manifest.coverage.semanticCategoriesVerified !== false)) {
          throw new Error('COLLECTION_DB00_SOURCE_COVERAGE_INVALID');
        }
        engine.load_db00_index(source);
        for (const shard of manifest.shards) {
          if (!/^items-[0-9]{3,}\.json$/.test(shard.file))
            throw new Error('COLLECTION_DB00_SHARD_PATH');
          const text=await download(asset(base,active.path+'/'+shard.file),shard.bytes,shard.sha256);
          engine.append_db00_shard(text);
        }
        engine.finish_db00();
        const catalog=JSON.parse(engine.metadata_json()) as Omit<CollectionRuntimeMetadata,'snapshot'>;
        const coverage = manifest.coverage;
        // Original DB-01 Tag references are context associations, not proven
        // CollectionArea membership. Unreviewed future snapshot fields cannot
        // enable end-user filters, even when they supply names/IDs.
        const scope=manifest.collectionScopeEvidence;
        if(scope!==undefined&&(
          scope.schema!=='wand.collection.scope-membership@1'||
          (scope.world!==undefined&&scope.world!=='verified_game_collection_area_item_membership')||
          (scope.universe!==undefined&&scope.universe!=='verified_game_collection_universe_item_membership')))
          throw new Error('COLLECTION_SCOPE_EVIDENCE_INVALID');
        const verifiedScopeMembership=scope?{
          world:scope.world,universe:scope.universe
        }:undefined;
        const worldLabels=scope?.world
          ? reviewedScopeNames(catalog.worlds,scope.worldLabels)
          : catalog.worldLabels;
        const universeLabels=scope?.universe
          ? reviewedScopeNames(catalog.universes,scope.universeLabels)
          : catalog.universeLabels;
        metadata={...catalog,snapshot:active.snapshot,
          worldLabels,universeLabels,
          ...(verifiedScopeMembership?{verifiedScopeMembership}:{}),
          nameCoverage:coverage?.scope==='steam-v1.26.2-native-itemlist'
            ? {itemDefinitions:coverage.itemDefinitions!,nameVerified:coverage.nameVerified!,nameUnverified:coverage.nameUnverified!}
            : null
        };
      } else {
        throw new Error('COLLECTION_DB00_POINTER_KIND');
      }
      if(metadata.snapshot==='steam-1.26.2-native-itemlist-v1'){
        // Keep the existing active-pointer verification; consume the new
        // source projection only after its versioned DB-01 assets verify.
        const complete=await loadCompleteCollection(base);
        const id='steam-'+metadata.version+'-collection-source-v3';
        const shards:{file:string;offset:number;count:number;bytes:number;sha256:string}[]=[];
        const payloads:string[]=[];
        for(let offset=0;offset<complete.rows.length;offset+=1000){
          const items=complete.rows.slice(offset,offset+1000);
          const payload=JSON.stringify({schema:'wand.game-db.snapshot@1',offset,count:items.length,items});
          const bytes=new TextEncoder().encode(payload);
          shards.push({file:'items-'+String(shards.length).padStart(3,'0')+'.json',offset,
            count:items.length,bytes:bytes.byteLength,sha256:await digestSha256(bytes.buffer)});
          payloads.push(payload);
        }
        engine.load_db00_index(JSON.stringify({schema:'wand.game-db.release@1',id,
          target:{platform:'Steam',gameVersion:metadata.version,buildId:null},
          sources:[{id:'db01-complete-source',visibility:'public_reference'}],releases:[],
          count:complete.rows.length,shards}));
        for(const payload of payloads)engine.append_db00_shard(payload);
        engine.finish_db00();
        const catalog=JSON.parse(engine.metadata_json()) as Omit<CollectionRuntimeMetadata,'snapshot'>;
        const verified=complete.rows.filter(row=>row.nameStatus==='verified').length;
        metadata={...catalog,snapshot:id,nameCoverage:{itemDefinitions:complete.rows.length,
          nameVerified:verified,nameUnverified:complete.rows.length-verified}};
      }
      const runtime = new CollectionRuntime(engine,metadata);
      await runtime.loadStorage();
      return runtime;
    } catch (error) {
      engine.free();
      throw error;
    }
  }
  /** Import only the exact SHA-pinned owner-local Steam v1.26.2 bundle.
   * This is never fetched or persisted; IndexedDB stores Collection entries only.
   * A public DB-00 active pointer can never reach this private Rust loader. */
  static async openOwnerLocalDb01(file: File): Promise<CollectionRuntime> {
    const expected = OWNER_LOCAL_DB01_FILES.find(candidate=>candidate.bytes===file.size);
    if (!expected) throw new Error('COLLECTION_LOCAL_DB01_UNRECOGNIZED_FILE');
    const bytes = await file.arrayBuffer();
    if (await digestSha256(bytes) !== expected.sha256)
      throw new Error('COLLECTION_LOCAL_DB01_HASH_MISMATCH');
    let bundle: OwnerLocalDb01Bundle;
    try {
      bundle = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as OwnerLocalDb01Bundle;
    } catch { throw new Error('COLLECTION_LOCAL_DB01_JSON_INVALID'); }
    const idx=bundle.index;
    if (bundle.schema !== expected.schema
      || !idx || idx.schema !== 'wand.game-db.release@1'
      || idx.id !== expected.id
      || idx.count !== expected.count || idx.target.platform !== 'Steam'
      || idx.target.gameVersion !== '1.26.2' || idx.target.buildId !== null
      || idx.sources?.length !== 1 || idx.sources[0].id !== 'private-db01-v1262'
      || idx.sources[0].visibility !== 'private'
      || bundle.coverage?.itemDefinitions !== 13_202
      || bundle.coverage?.nameVerified !== 11_492
      || bundle.coverage?.nameUnverified !== 1_710
      || !Array.isArray(bundle.shards) || bundle.shards.length !== idx.shards?.length
      || !/^[a-f0-9]{64}$/.test(bundle.sourceAuditSha256)) {
      throw new Error('COLLECTION_LOCAL_DB01_CONTRACT_INVALID');
    }
    await init(wasmUrl);
    const engine = new CollectionEngine();
    try {
      engine.load_owner_local_db00_index(JSON.stringify(idx));
      for (let i=0; i<idx.shards.length; i++) {
        const payload=bundle.shards[i];
        if (typeof payload !== 'string') throw new Error('COLLECTION_LOCAL_DB01_SHARD_INVALID');
        const bytes=new TextEncoder().encode(payload);
        if (bytes.byteLength !== idx.shards[i].bytes
          || await digestSha256(bytes.buffer as ArrayBuffer) !== idx.shards[i].sha256)
          throw new Error('COLLECTION_LOCAL_DB01_SHARD_HASH_MISMATCH');
        engine.append_db00_shard(payload);
      }
      engine.finish_db00();
      const catalog=JSON.parse(engine.metadata_json()) as Omit<CollectionRuntimeMetadata,'snapshot'>;
      const runtime=new CollectionRuntime(engine,{...catalog,snapshot:idx.id},bundle.coverage);
      await runtime.loadStorage();
      return runtime;
    } catch (error) {
      engine.free();
      throw error;
    }
  }
  private async loadStorage(): Promise<void> {
    const db = await openIdb();
    try {
      const persisted = await readIdb(db);
      if (persisted !== undefined) {
        this.engine.load_state(persisted);
        this.persistedState = persisted;
      } else {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy !== null) this.engine.load_state(legacy);
        const normalized = this.engine.state_json();
        try {
          await writeIdb(db,normalized,null);
          if (await readIdb(db) !== normalized)
            throw new Error('COLLECTION_MIGRATION_READBACK_MISMATCH');
          this.persistedState = normalized;
        } catch (error) {
          // Another tab may have completed first-open migration while this tab
          // was reading the legacy key. Never overwrite its winning state.
          if (!(error instanceof Error && error.message === 'COLLECTION_STORAGE_CONFLICT'))
            throw error;
          const winner = await readIdb(db);
          if (winner === undefined) throw new Error('COLLECTION_MIGRATION_WINNER_MISSING');
          this.engine.load_state(winner);
          this.persistedState = winner;
        }
      }
      this.db = db;
    } catch (error) {
      db.close();
      throw error;
    }
  }
  /** Explicit recovery after an optimistic write conflict. Revalidate stored
   * state in Rust before accepting it. Never silently merge or overwrite tabs. */
  async reloadLatest(): Promise<void> {
    if (this.busy) throw new Error('COLLECTION_WRITE_BUSY');
    if (!this.db) throw new Error('COLLECTION_STORAGE_NOT_READY');
    this.busy = true;
    try {
      const latest = await readIdb(this.db);
      if (latest === undefined) throw new Error('COLLECTION_STORAGE_MISSING');
      this.engine.load_state(latest);
      this.persistedState = latest;
    } finally {
      this.busy = false;
    }
  }
  get state(): CollectionState {
    return JSON.parse(this.engine.state_json()) as CollectionState;
  }
  get progress(): CollectionProgress {
    return JSON.parse(this.engine.progress()) as CollectionProgress;
  }
  facets(mode: 'category'|'world'|'universe',locale: string): CollectionFacet[] {
    return JSON.parse(this.engine.facets(mode,locale)) as CollectionFacet[];
  }
  query(filter: CollectionFilter): CollectionPage {
    return JSON.parse(this.engine.query_page(JSON.stringify(filter))) as CollectionPage;
  }
  item(itemId: number,locale: string): CollectionItem {
    return JSON.parse(this.engine.item(BigInt(itemId),locale)) as CollectionItem;
  }
  private async mutate(action: () => void): Promise<void> {
    if (this.busy) throw new Error('COLLECTION_WRITE_BUSY');
    if (!this.db) throw new Error('COLLECTION_STORAGE_NOT_READY');
    const before = this.engine.state_json();
    this.busy = true;
    try {
      action();
      const updated = this.engine.state_json();
      await writeIdb(this.db,updated,this.persistedState);
      if (await readIdb(this.db) !== updated) throw new Error('COLLECTION_WRITE_READBACK_MISMATCH');
      this.persistedState = updated;
    } catch (error) {
      this.engine.load_state(before);
      throw error;
    } finally {
      this.busy = false;
    }
  }
  setEntry(itemId: number,patch: {status?: 'owned'|'missing'|null; quantity?:number|null; discovered?:boolean|null; favorite?:boolean|null}):Promise<void> {
    return this.mutate(() => this.engine.set_entry(BigInt(itemId),JSON.stringify(patch)));
  }
  setBulk(ids:number[],status:'owned'|'missing'|'unknown'):Promise<void> {
    return this.mutate(() => this.engine.set_bulk(JSON.stringify(ids),status));
  }
  /** Apply to every matching catalog row, not just the currently rendered page.
   * Rust evaluates the same predicate as query_page and changes all IDs before
   * one IndexedDB compare-and-swap commit; failed persistence rolls back. */
  setBulkMatching(filter:CollectionFilter,status:'owned'|'missing'|'unknown'):Promise<void> {
    return this.mutate(() => { this.engine.bulk_matching(JSON.stringify(filter),status); });
  }
  /** Save values supersede manual statuses for precisely verified item IDs.
   * Other manual items, favorites, quantities and discoveries remain intact;
   * editing is still possible after import. One Rust transaction and one
   * IndexedDB compare-and-swap commit ensure no partial application.
   *
   * IMPORTANT: This is deliberately NOT called by the current P1G preview.
   * DB-05 must first establish each map value's actual ownership/unlock
   * semantics; a map-key match alone is insufficient evidence.
   */
  applyMappedSaveStatuses(patch:MappedSaveStatusImport):Promise<void> {
    return this.mutate(() => { this.engine.apply_mapped_save_statuses(JSON.stringify(patch)); });
  }
  /** A strictly decoded native CollectionSet discovery projection overwrites
   * manual discovered values for matching catalog IDs only. The user's manual
   * status, quantity, favorite, other workspace data and game save stay intact.
   * Unknown native IDs are skipped by Rust without fabricating Collection rows.
   */
  async applyMappedSaveDiscovery(patch: MappedSaveDiscoveryImport):Promise<number> {
    let count=0;
    await this.mutate(() => {
      count=this.engine.apply_mapped_save_discovery(JSON.stringify(patch));
    });
    return count;
  }
  /** One atomic save projection: previously entered manual statuses are
   * superseded only by explicitly positive, verified ListInventory amounts.
   * Discovery is independently imported from native CollectionSet booleans.
   * No negative state is inferred from an absent or zero-amount entry.
   * Both projections share ONE Rust/IndexedDB CAS transaction.
   */
  async applyMappedSaveProfile(input:{
    discovered:readonly {itemId:number;discovered:boolean}[];
    positiveOwned:readonly {itemId:number;role:string}[];
  }):Promise<{discovery:number;ownership:number}> {
    const owned:MappedSaveStatusImport['entries'][number][]=[];
    for(const row of input.positiveOwned){
      // Confirm exact known public DB-00 item and expected semantic family.
      // The Worker has already required a matching save-resident role, native
      // item type and positive integer Amount. Unknown IDs are not synthesized.
      let item:CollectionItem;
      try {item=this.item(row.itemId,'en');}catch {continue;}
      // The public DB-00 Collection families are *display groupings*, not
      // identical to native ListInventory role identifiers. Steam 1.26.2
      // publishes Trimming IDs (ItemType 16) under Wallpaper & Flooring;
      // dropping them on string equality silently lost legitimate save import.
      // The role's exact ItemType, saved descriptor and ItemID are verified
      // by the local Worker; only known native-to-public family aliases pass.
      const publicFamilies:Record<string,readonly string[]>={
        Furniture:['Furniture','Landscaping','Roads & Fences'],
        Clothing:['Clothing'],
        ActivityItem:['ActivityItem','Source Activity Items',
          'Source Crop','Source Meal','Source Seed','Source Flower','Source Fish',
          'Source Ingredient','Source Consumable','Source Mineral',
          'Source Crafting Material'],
        Makeup:['Makeup','Appearance'],
        Trimming:['Trimming','Wallpaper & Flooring'],
        Building:['Building','Buildings'],
        Skin:['Skin','Appearance'],
        BoardGame:['BoardGame','Board Game'],
        AvatarFeature:['AvatarFeature','Appearance'],
        PhotoMode:['PhotoMode','Photo Mode'],
        MountGear:['MountGear','Mounts'],
        Environment:['Environment','Environment Effects']
      };
      if(!publicFamilies[row.role]?.includes(item.family))continue;
      owned.push({itemId:row.itemId,status:'owned'});
    }
    let discovery=0;
    await this.mutate(()=>{
      this.engine.apply_mapped_save_statuses(JSON.stringify({
        schema:'wand.collection.mapped-save-status@1',entries:owned
      }));
      discovery=this.engine.apply_mapped_save_discovery(JSON.stringify({
        schema:'wand.collection.mapped-save-discovery@1',entries:input.discovered
      }));
    });
    return {discovery,ownership:owned.length};
  }
  workspace(action:'select'|'add'|'rename'|'delete',id:string,name=''):Promise<void> {
    return this.mutate(() => this.engine.workspace_action(action,id,name));
  }
  restore(raw:string):Promise<void> {
    if (raw.length > MAX_FILE_BYTES) return Promise.reject(Error('COLLECTION_BACKUP_TOO_LARGE'));
    return this.mutate(() => this.engine.load_state(raw));
  }
  exportBackup():string { return JSON.stringify(this.state,null,2); }
  close():void { this.db?.close(); this.db=null; this.engine.free(); }
}
