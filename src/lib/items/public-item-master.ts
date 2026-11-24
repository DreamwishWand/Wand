/**
 * Read-only public item master for Collection, Explore and World Editor.
 * Item ID is the only join key. Every source release is version-isolated and
 * independent of player saves. The selected release index is the only eager
 * request for explicit versions; "current" first resolves a small version
 * catalog. Exact-ID reads fetch one verified shard; batch reads are bounded.
 *
 * Original tags are facts; Collection source candidates are NOT proof of
 * visible game-screen membership or availability.
 */
export const ITEM_MASTER_RELEASE = 'steam-1.26.2-item-id-master-v1' as const;
export const ITEM_MASTER_INDEX_PATH =
  'ddv/item-master/steam-1.26.2/index.json' as const;
/** Backward-compatible default until all dependent source DBs are versioned. */
export const ITEM_MASTER_DEFAULT_GAME_VERSION = '1.26.2' as const;
export const ITEM_MASTER_VERSIONS_PATH = 'ddv/item-master-releases.json' as const;
/** Pass "current" for the release selected by the public version catalog. */
export interface ItemMasterOpenOptions {
  readonly gameVersion?: string;
  /** Expanded view adds original collectibles without replacing the base snapshot. */
  readonly scope?: 'base' | 'expanded';
}
export interface ItemMasterExpandedRelease {
  readonly release: string;
  readonly count: number;
  readonly extensionSha256: string;
}
export type ItemMasterUniverseStatus =
  'source_linked' | 'unresolved_source' | 'no_universe_in_verified_tag_fields';
export interface ItemMasterVersions {
  readonly schema: 'wand.item-master.versions@1';
  readonly current: string;
  readonly releases: readonly Readonly<{
    gameVersion: string;
    release: string;
    count: number;
    archiveSha256: string;
    expanded?: Readonly<ItemMasterExpandedRelease>;
  }>[];
}
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
  /** Exact original artwork addresses; MemoryShard retains image and mask. */
  readonly artwork?: Readonly<{
    iconGuid: string;
    imageGuid?: string | null;
    maskGuid?: string | null;
  }>;
  /** Numeric original universe references, not inferred ownership. */
  readonly universeTagIds?: readonly number[];
  readonly universeSourceStatus?: ItemMasterUniverseStatus;
  readonly itemType: Readonly<ItemMasterType>;
  readonly tags: readonly Readonly<ItemMasterTag>[];
  readonly collectionSourceCandidates: readonly Readonly<ItemMasterCollectionCandidate>[];
  readonly collectionMembershipVerified: false;
  readonly worldMembershipVerified: false;
  readonly availabilityVerified: false;
}
export interface ItemMasterRelease {
  readonly schema: 'wand.item-master.release@1';
  readonly version: string;
  readonly target: Readonly<{platform:'Steam';gameVersion:string}>;
  readonly count: number;
  readonly scope?: 'expanded';
  readonly baseRelease?: string;
  readonly baseCount?: number;
  readonly extensionCount?: number;
  readonly extensionSha256?: string;
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
const GAME_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const RELEASE_VERSION = /^steam-([0-9]+\.[0-9]+\.[0-9]+)-item-id-master-v[1-9][0-9]*$/;
const MAX_DEFINITIONS = 1_000_000;
const MAX_SHARD_BYTES = 16 * 1024 * 1024;
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
/** Freeze the shared per-shard Item objects so one consumer cannot corrupt others. */
function freezeItemRecord(item:ItemMasterRecord):ItemMasterRecord {
  Object.freeze(item.names);
  Object.freeze(item.itemType);
  if(item.artwork)Object.freeze(item.artwork);
  if(item.universeTagIds)Object.freeze(item.universeTagIds);
  item.tags.forEach(tag=>Object.freeze(tag));
  Object.freeze(item.tags);
  item.collectionSourceCandidates.forEach(candidate=>Object.freeze(candidate));
  Object.freeze(item.collectionSourceCandidates);
  return Object.freeze(item);
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
  const artwork=raw.artwork;
  if(artwork!==undefined){
    if(!isObject(artwork)||artwork.iconGuid!==raw.iconGuid)return false;
    for(const key of ['imageGuid','maskGuid']){
      const value=artwork[key];
      if(value!==undefined&&value!==null&&
        (typeof value!=='string'||!GUID.test(value)))return false;
    }
  }
  if(raw.universeTagIds!==undefined && (!Array.isArray(raw.universeTagIds)||
      !raw.universeTagIds.every((id:unknown)=>ID(id)&&id>=2000500000&&id<2000600000)||
      new Set(raw.universeTagIds).size!==raw.universeTagIds.length))return false;
  if(raw.universeSourceStatus!==undefined &&
      !['source_linked','unresolved_source','no_universe_in_verified_tag_fields']
        .includes(String(raw.universeSourceStatus)))return false;
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
  options: ItemMasterOpenOptions = {},
):Promise<PublicItemMaster> {
  assert(typeof basePath === 'string' &&
    /^\/?(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(basePath),
    'INVALID_BASE_PATH');
  const base = basePath ? '/' + basePath.replace(/^\/+|\/+$/g,'') : '';
  const scope=options.scope??'base';
  assert(scope==='base'||scope==='expanded','INVALID_SCOPE');
  let gameVersion = options.gameVersion ?? ITEM_MASTER_DEFAULT_GAME_VERSION;
  let selected: Readonly<ItemMasterVersions['releases'][number]> | undefined;
  assert(typeof gameVersion === 'string', 'INVALID_GAME_VERSION');
  if (gameVersion === 'current') {
    const raw = await checkedJson(base+'/'+ITEM_MASTER_VERSIONS_PATH,undefined,fetcher);
    assert(isObject(raw) && raw.schema === 'wand.item-master.versions@1' &&
      typeof raw.current === 'string' && GAME_VERSION.test(raw.current) &&
      Array.isArray(raw.releases) && raw.releases.length>0,
      'INVALID_VERSIONS');
    const unique = new Set<string>();
    for (const entry of raw.releases) {
      assert(isObject(entry) && typeof entry.gameVersion === 'string' &&
        GAME_VERSION.test(entry.gameVersion) && !unique.has(entry.gameVersion) &&
        typeof entry.release === 'string' &&
        RELEASE_VERSION.test(entry.release) &&
        entry.release.startsWith('steam-'+entry.gameVersion+'-') &&
        typeof entry.count === 'number' &&
        Number.isSafeInteger(entry.count) && entry.count>0 &&
        entry.count<=MAX_DEFINITIONS &&
        typeof entry.archiveSha256 === 'string' &&
        SHA.test(entry.archiveSha256), 'INVALID_VERSIONS');
      if(entry.expanded!==undefined){
        const expanded=entry.expanded;
        assert(isObject(expanded)&&typeof expanded.release==='string'&&
          RELEASE_VERSION.test(expanded.release)&&
          expanded.release.startsWith('steam-'+entry.gameVersion+'-')&&
          expanded.release!==entry.release&&typeof expanded.count==='number'&&
          Number.isSafeInteger(expanded.count)&&expanded.count>entry.count&&
          expanded.count<=MAX_DEFINITIONS&&typeof expanded.extensionSha256==='string'&&
          SHA.test(expanded.extensionSha256),'INVALID_EXPANDED_RELEASE');
      }
      unique.add(entry.gameVersion);
    }
    gameVersion = raw.current;
    selected = (raw.releases as ItemMasterVersions['releases'])
      .find(entry => entry.gameVersion === gameVersion);
    assert(selected, 'CURRENT_RELEASE_MISSING');
  }
  assert(GAME_VERSION.test(gameVersion), 'INVALID_GAME_VERSION');
  if(scope==='expanded'&&selected)assert(selected.expanded,'EXPANDED_RELEASE_NOT_PUBLISHED');
  const selectedView=scope==='expanded'?selected?.expanded:selected;
  const root = base + '/ddv/item-master/steam-' + gameVersion +
    (scope==='expanded'?'-expanded':'');
  const release = await checkedJson(root+'/index.json',undefined,fetcher);
  assert(isObject(release) &&
    release.schema === 'wand.item-master.release@1' &&
    typeof release.version === 'string' &&
    RELEASE_VERSION.test(release.version) &&
    release.version.startsWith('steam-'+gameVersion+'-') &&
    typeof release.count === 'number' &&
    Number.isSafeInteger(release.count) &&
    release.count>0 && release.count<=MAX_DEFINITIONS &&
    release.bucketCount === 256 &&
    isObject(release.target) &&
    release.target.platform === 'Steam' &&
    release.target.gameVersion === gameVersion &&
    isObject(release.shards) &&
    (!selectedView || (release.version === selectedView.release &&
      release.count === selectedView.count)), 'INVALID_RELEASE');
  if(scope==='expanded'){
    assert(release.scope==='expanded'&&typeof release.baseRelease==='string'&&
      RELEASE_VERSION.test(release.baseRelease)&&
      release.baseRelease.startsWith('steam-'+gameVersion+'-')&&
      release.baseRelease!==release.version&&typeof release.baseCount==='number'&&
      Number.isSafeInteger(release.baseCount)&&release.baseCount>0&&
      typeof release.extensionCount==='number'&&Number.isSafeInteger(release.extensionCount)&&
      release.extensionCount>0&&release.baseCount+release.extensionCount===release.count&&
      typeof release.extensionSha256==='string'&&SHA.test(release.extensionSha256)&&
      (!selected||(release.baseRelease===selected.release&&release.baseCount===selected.count&&
        release.extensionSha256===selected.expanded?.extensionSha256)),
      'INVALID_EXPANDED_RELEASE');
  }else assert(release.scope===undefined,'UNEXPECTED_EXPANDED_RELEASE');
  const source = release as unknown as ItemMasterRelease;
  // The caller may share this reader with Collection, Explorer and Save.
  // Snapshot all mutable release metadata before any lazy asynchronous read.
  const m:ItemMasterRelease = Object.freeze({
    ...source,
    target:Object.freeze({...source.target}),
    coverage:Object.freeze({...source.coverage}),
    shards:Object.freeze(Object.fromEntries(
      Object.entries(source.shards).map(([path,entry])=>[
        path, typeof entry === 'number' ? entry : Object.freeze({...entry}),
      ])
    )),
  });
  const expected = Array.from({length:256},(_,i) =>
    'id/'+i.toString(16).padStart(2,'0')+'.json');
  assert(Object.keys(m.shards).length === 256 &&
    expected.every(p => p in m.shards), 'INCOMPLETE_RELEASE');
  const meta = (path:string): Readonly<{count:number;bytes:number;sha256:string}> => {
    const raw = m.shards[path];
    assert(isObject(raw) && Number.isSafeInteger(raw.count) && raw.count>=0 &&
      typeof raw.bytes === 'number' &&
      Number.isSafeInteger(raw.bytes) && raw.bytes>0 &&
      raw.bytes<=MAX_SHARD_BYTES &&
      typeof raw.sha256 === 'string' && SHA.test(raw.sha256),
      'INVALID_SHARD_METADATA');
    return raw as unknown as {count:number;bytes:number;sha256:string};
  };
  assert(expected.every(p => !!meta(p)) &&
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
        result.set(value.itemId,freezeItemRecord(value));
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
      const found = new Map<number,ItemMasterRecord>();
      let next = 0;
      // Bound I/O to eight shards, even when 10,000 IDs span all 256 buckets.
      async function worker(): Promise<void> {
        while (next < groups.length) {
          const path = groups[next++];
          const records = await bucket(path);
          for (const [id,item] of records) found.set(id,item);
        }
      }
      await Promise.all(Array.from(
        {length:Math.min(8,groups.length)},()=>worker()
      ));
      return ids.map(id => found.get(id) ?? null);
    }
  });
}
