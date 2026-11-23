/**
 * Read-only public item master for Collection, Explore and World Editor.
 * Item ID is the only join key. The source data is Steam 1.26.2 and is
 * independent of player saves. The index is the only eager request; exact-ID
 * reads fetch one small immutable shard and cache it for later consumers.
 *
 * Original tags are facts; Collection source candidates are NOT proof of
 * visible game-screen membership or availability.
 */
export const ITEM_MASTER_RELEASE = 'steam-1.26.2-item-id-master-v1' as const;
export const ITEM_MASTER_INDEX_PATH =
  'ddv/item-master/steam-1.26.2/index.json' as const;
export const ITEM_MASTER_LOCALES =
  ['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'] as const;
export type ItemMasterLocale = (typeof ITEM_MASTER_LOCALES)[number];

export interface ItemMasterTag {
  readonly id: number;
  readonly key: string;
  readonly facet: string;
  /** Original protobuf field, not an inferred product category. */
  readonly sourceField: number;
}
export interface ItemMasterType {
  readonly code: number;
  readonly name: string;
  readonly subtypeCode: number;
  readonly subtypeEnum: string | null;
  readonly subtypeName: string | null;
  readonly subtypeNameVerified: boolean;
}
export interface ItemMasterCollectionCandidate {
  readonly setId: number;
  readonly submenuCode?: number | null;
  readonly groupIndex: number;
  readonly evidence: string;
  readonly labelKey?: string | null;
  readonly sourceSetItemId?: number | null;
  readonly universeTagId?: number | null;
  readonly universeTagKey?: string | null;
  readonly criterion?: number | null;
  readonly criterionName?: string | null;
  readonly sourceRule?: string | null;
  readonly sourceField?: string | null;
  readonly tagKey?: string | null;
}
export interface ItemMasterRecord {
  readonly itemId: number;
  readonly names: Readonly<Record<ItemMasterLocale,string | null>>;
  readonly nameVerified: boolean;
  readonly nativeCategory: string;
  readonly nativeKey: string;
  /** GUID uniquely resolves the icon asset, not an active CDN URL. */
  readonly iconGuid: string;
  readonly itemType: Readonly<ItemMasterType>;
  readonly tags: readonly Readonly<ItemMasterTag>[];
  readonly collectionSourceCandidates: readonly Readonly<ItemMasterCollectionCandidate>[];
  readonly collectionMembershipVerified: false;
  readonly worldMembershipVerified: false;
  readonly availabilityVerified: false;
}
export interface ItemMasterRelease {
  readonly schema: 'wand.item-master.release@1';
  readonly version: typeof ITEM_MASTER_RELEASE;
  readonly target: Readonly<{platform:'Steam';gameVersion:'1.26.2'}>;
  readonly count: 13202;
  readonly bucketCount: 256;
  readonly coverage: Readonly<{
    itemNamesVerified: number;
    itemNamesUnverified: number;
    itemIconGuid: number;
    sourceTagReferences: number;
    itemsWithSourceTag: number;
    sourceCollectionCandidateReferences: number;
    itemsWithSourceCollectionCandidates: number;
    worldMembershipVerified: false;
    collectionMembershipVerified: false;
    acquisitionCoverageComplete: false;
    publishedR2ImageUrlAvailable: false;
  }>;
  readonly shards: Readonly<Record<string, Readonly<{
    count:number; bytes?:number; sha256?:string;
  }> | number>>;
}
export interface PublicItemMaster {
  readonly release: ItemMasterRelease;
  getItem(itemId: number): Promise<ItemMasterRecord | null>;
  getItems(itemIds: readonly number[]): Promise<(ItemMasterRecord | null)[]>;
}
const SHA = /^[0-9a-f]{64}$/;
const GUID = /^[0-9a-f]{32}$/;
const ID = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
function assert(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error('ITEM_MASTER_' + reason);
}
function pathFor(id:number): string {
  return 'id/' + (id & 255).toString(16).padStart(2, '0') + '.json';
}
function isObject(x:unknown): x is Record<string,unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}
function validRecord(raw:unknown, bucket:string): raw is ItemMasterRecord {
  if (!isObject(raw) || !ID(raw.itemId) || pathFor(raw.itemId) !== bucket ||
      typeof raw.nativeCategory !== 'string' ||
      typeof raw.nativeKey !== 'string' ||
      typeof raw.iconGuid !== 'string' || !GUID.test(raw.iconGuid) ||
      !isObject(raw.itemType) || !isObject(raw.names) ||
      !Array.isArray(raw.tags) ||
      !Array.isArray(raw.collectionSourceCandidates) ||
      raw.collectionMembershipVerified !== false ||
      raw.worldMembershipVerified !== false ||
      raw.availabilityVerified !== false) return false;
  const names = raw.names as Record<string,unknown>;
  if (!ITEM_MASTER_LOCALES.every(locale =>
    names[locale] === null ||
    (typeof names[locale] === 'string' && (names[locale] as string).length > 0)))
    return false;
  if (raw.tags.some((v:unknown) => !isObject(v) || !ID(v.id) ||
    typeof v.key !== 'string' || typeof v.facet !== 'string' ||
    !Number.isInteger(v.sourceField))) return false;
  return !raw.collectionSourceCandidates.some((v:unknown) =>
    !isObject(v) || !ID(v.setId) || !Number.isInteger(v.groupIndex) ||
    typeof v.evidence !== 'string');
}
async function checkedJson(url:string, meta?:Readonly<{bytes?:number;sha256?:string}>,
  fetcher:typeof fetch = fetch): Promise<unknown> {
  const response = await fetcher(url, {credentials:'same-origin',redirect:'error'});
  assert(response.ok && !response.redirected, 'ASSET_UNAVAILABLE');
  const bytes = await response.arrayBuffer();
  if (meta?.bytes !== undefined)
    assert(bytes.byteLength === meta.bytes, 'BYTE_LENGTH_MISMATCH');
  if (meta?.sha256 !== undefined) {
    assert(SHA.test(meta.sha256) && !!globalThis.crypto?.subtle,
      'SHA_UNAVAILABLE');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const actual = [...new Uint8Array(digest)]
      .map(n => n.toString(16).padStart(2,'0')).join('');
    assert(actual === meta.sha256, 'SHA_MISMATCH');
  }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function openPublicItemMaster(
  basePath: string = '',
  fetcher: typeof fetch = fetch,
):Promise<PublicItemMaster> {
  assert(typeof basePath === 'string' &&
    /^\/?(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(basePath),
    'INVALID_BASE_PATH');
  const root = (basePath ? '/' + basePath.replace(/^\/+|\/+$/g,'') : '') +
    '/ddv/item-master/steam-1.26.2';
  const release = await checkedJson(root+'/index.json',undefined,fetcher);
  assert(isObject(release) &&
    release.schema === 'wand.item-master.release@1' &&
    release.version === ITEM_MASTER_RELEASE &&
    release.count === 13202 && release.bucketCount === 256 &&
    isObject(release.target) && release.target.gameVersion === '1.26.2' &&
    isObject(release.shards), 'INVALID_RELEASE');
  const m = release as unknown as ItemMasterRelease;
  const expected = Array.from({length:256},(_,i) =>
    'id/'+i.toString(16).padStart(2,'0')+'.json');
  assert(Object.keys(m.shards).length === 256 &&
    expected.every(p => p in m.shards), 'INCOMPLETE_RELEASE');
  const meta = (path:string): Readonly<{count:number;bytes?:number;sha256?:string}> => {
    const raw = m.shards[path];
    return typeof raw === 'number' ? {count:raw} : raw;
  };
  assert(expected.every(p => Number.isInteger(meta(p).count) &&
    meta(p).count >= 0) &&
    expected.reduce((n,p)=>n+meta(p).count,0) === m.count,
    'RELEASE_COUNT_MISMATCH');

  const cache = new Map<string,Promise<ReadonlyMap<number,ItemMasterRecord>>>();
  async function bucket(path:string):Promise<ReadonlyMap<number,ItemMasterRecord>> {
    const previous = cache.get(path);
    if (previous) return previous;
    const task = (async()=>{
      const raw = await checkedJson(root+'/'+path,meta(path),fetcher);
      assert(isObject(raw) && raw.schema === 'wand.item-master.shard@1' &&
        raw.bucket === path.slice(3,5) && Array.isArray(raw.items) &&
        raw.items.length === meta(path).count,'INVALID_SHARD');
      const result = new Map<number,ItemMasterRecord>();
      for (const value of raw.items) {
        assert(validRecord(value,path) && !result.has(value.itemId),
          'INVALID_ITEM_ROW');
        result.set(value.itemId,value);
      }
      return result;
    })();
    cache.set(path,task);
    try{return await task;}catch(e){cache.delete(path);throw e;}
  }
  return Object.freeze({
    release:m,
    async getItem(id:number){
      assert(ID(id),'INVALID_ITEM_ID');
      return (await bucket(pathFor(id))).get(id) ?? null;
    },
    async getItems(ids:readonly number[]){
      assert(Array.isArray(ids) && ids.length <= 10000 &&
        ids.every(ID),'INVALID_ITEM_BATCH');
      const groups = [...new Set(ids.map(pathFor))];
      const results = await Promise.all(groups.map(bucket));
      const found = new Map<number,ItemMasterRecord>();
      for (const group of results)
        for (const [id,item] of group) found.set(id,item);
      return ids.map(id => found.get(id) ?? null);
    }
  });
}
