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

export interface CollectionEntry {
  status?: 'owned' | 'missing';
  quantity?: number;
  discovered?: boolean;
  favorite?: boolean;
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
  offset: number;
  limit: number;
}
export type PublicDb01Item = Pick<Db01Item,'itemId'|'names'|'nativeCategory'>;
export interface CollectionRuntimeMetadata {
  snapshot: string;
  version: string;
  expansions: readonly string[];
  worlds: readonly string[];
  universes: readonly string[];
  worldLabels: readonly string[][];
  universeLabels: readonly string[][];
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
function asset(base: string, path: string): string {
  if (!/^\/?(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(base)
      || !/^ddv\/[A-Za-z0-9_./-]+$/.test(path)
      || path.split('/').some(x => x === '.' || x === '..')) {
    throw new Error('COLLECTION_ASSET_PATH_INVALID');
  }
  return (base ? '/' + base.replace(/^\/+|\/+$/g,'') : '') + '/' + path;
}
async function download(url: string, expectedBytes: number | null = null, expectedHash: string | null = null): Promise<string> {
  const response = await fetch(url, { credentials:'same-origin' });
  if (!response.ok || response.redirected) throw new Error('COLLECTION_ASSET_UNAVAILABLE');
  const bytes = await response.arrayBuffer();
  if (expectedBytes !== null && bytes.byteLength !== expectedBytes) throw new Error('COLLECTION_ASSET_SIZE_MISMATCH');
  if (expectedHash !== null) {
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
      x => x.toString(16).padStart(2,'0')).join('');
    if (hash !== expectedHash) throw new Error('COLLECTION_ASSET_HASH_MISMATCH');
  }
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
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
function writeIdb(db: IDBDatabase, payload: string): Promise<void> {
  return new Promise((resolve,reject) => {
    const transaction = db.transaction(STORE_NAME,'readwrite');
    transaction.objectStore(STORE_NAME).put(payload,STATE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? Error('COLLECTION_INDEXEDDB_WRITE_FAILED'));
    transaction.onabort = () => reject(transaction.error ?? Error('COLLECTION_INDEXEDDB_ABORTED'));
  });
}
export class CollectionRuntime {
  readonly metadata: CollectionRuntimeMetadata;
  private readonly engine: CollectionEngine;
  private db: IDBDatabase | null = null;
  private busy = false;
  private constructor(engine: CollectionEngine, metadata: CollectionRuntimeMetadata) {
    this.engine = engine;
    this.metadata = metadata;
  }
  static async open(base: string): Promise<CollectionRuntime> {
    const active = JSON.parse(await download(asset(base,ACTIVE))) as {
      schema?: string; kind?: string; path?: string; snapshot?: string;
      publication?: string;
    };
    if (active.schema !== 'wand.game-db.active@1')
      throw new Error('COLLECTION_DB00_POINTER_INVALID');
    if (active.kind !== 'legacy_collection' || active.path !== VERIFIED_LEGACY
      || active.publication !== 'existing_verified_public_reference') {
      throw new Error('COLLECTION_PUBLIC_SNAPSHOT_NOT_AVAILABLE');
    }
    const source = await download(asset(base,VERIFIED_LEGACY+'/index.json'));
    const manifest = JSON.parse(source) as PublicLegacyIndex;
    if (manifest.s !== 'wand.collection.runtime@1') throw new Error('COLLECTION_INDEX_INVALID');
    await init(wasmUrl);
    const engine = new CollectionEngine();
    engine.load_index(source);
    const expected = manifest.shards.reduce((sum,s) => sum+s.count,0);
    if (expected !== manifest.n) throw new Error('COLLECTION_INDEX_COUNT_MISMATCH');
    for (const shard of manifest.shards) {
      const text = await download(asset(base,VERIFIED_LEGACY+'/'+shard.file),shard.bytes,shard.sha256);
      engine.append_shard(text);
    }
    const runtime = new CollectionRuntime(engine, {
      snapshot: active.snapshot ?? 'legacy-switch-1.25.0',
      version: manifest.t.gameVersion,
      expansions:manifest.e,
      worlds:manifest.w,
      universes:manifest.u,
      worldLabels:manifest.wl,
      universeLabels:manifest.ul
    });
    await runtime.loadStorage();
    return runtime;
  }
  private async loadStorage(): Promise<void> {
    const db = await openIdb();
    try {
      const persisted = await readIdb(db);
      if (persisted !== undefined) {
        this.engine.load_state(persisted);
      } else {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy !== null) this.engine.load_state(legacy);
        const normalized = this.engine.state_json();
        await writeIdb(db,normalized);
        if (await readIdb(db) !== normalized)
          throw new Error('COLLECTION_MIGRATION_READBACK_MISMATCH');
      }
      this.db = db;
    } catch (error) {
      db.close();
      throw error;
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
      await writeIdb(this.db,updated);
      if (await readIdb(this.db) !== updated) throw new Error('COLLECTION_WRITE_READBACK_MISMATCH');
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
