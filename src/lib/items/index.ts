/** DB-01 final typed, lazy read API. No private data or file URLs are embedded. */
export const DB01_SHARDS_SCHEMA = 'wand.db01.private-shards@2' as const;
export const DB01_LOCALES = ['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'] as const;
export type Db01Locale = typeof DB01_LOCALES[number];
export type Db01CatalogDomain = 'item' | 'definition_unclassified';
export type Db01SourceNameEvidence = 'current_exact_locdb_join' | 'historical_prefix_crc_correlated_unverified_current';
export interface Db01Item {
  readonly itemId: number;
  readonly nativeCategory: string;
  readonly catalogDomain: Db01CatalogDomain;
  readonly localizationKey: string | null;
  /** Source-exact wire field 2: an identity, not a game semantic classification. */
  readonly nativeKey: string;
  readonly sourceSha256: string;
  readonly verifiedIconGuid: string | null;
  readonly names: Readonly<Record<Db01Locale, string | null>>;
}
export interface Db01NameResult {
  readonly itemId: number;
  readonly locale: Db01Locale;
  readonly value: string;
  readonly evidence: Db01SourceNameEvidence;
  readonly baselineVersion: string | null;
}
export interface Db01ShardMeta { readonly sha256: string; readonly bytes: number; readonly count: number; }
export interface Db01ShardManifest {
  readonly schema: typeof DB01_SHARDS_SCHEMA;
  readonly platform: string;
  readonly gameVersion: string;
  readonly sourceManifestSha256: string;
  readonly nativeSourceManifestSha256: string;
  readonly sourceItemsSha256: string;
  readonly definitions: number;
  readonly currentNativeItemDefinitions: number;
  readonly sourceFilesVerified: number;
  readonly sourceFilesTotal: number;
  readonly fullCorpusParsed: boolean;
  readonly privateOnly: true;
  readonly publicationAuthorized: false;
  readonly bucketCount: 256;
  readonly categories: readonly string[];
  readonly locales: readonly Db01Locale[];
  readonly historicalCandidatesIncluded: boolean;
  readonly historicalManifestSha256: string | null;
  readonly files: Readonly<Record<string, Db01ShardMeta>>;
}
/** Consumer chooses a secure origin or locally provided File objects. Never auto-fetch private data. */
export type Db01LoadBytes = (relativePath: string) => Promise<Uint8Array | ArrayBuffer>;

const SHA = /^[0-9a-f]{64}$/;
const CATEGORY = /^[A-Za-z][A-Za-z0-9]*$/;
const EXACT = /^[0-9a-f]{2}$/;
const LOCALE_SET = new Set<string>(DB01_LOCALES);
const NONDISPLAY = /^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}/i;
function fail(code: string): never { throw new TypeError(`DB01_TS_${code}`); }
function check(ok: unknown, code: string): asserts ok { if (!ok) fail(code); }
function isObj(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function localeIsValid(value: string): value is Db01Locale { return LOCALE_SET.has(value); }
function isItemId(id: number): boolean { return Number.isSafeInteger(id) && id > 0; }
function nativeKeySafe(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\x00-\x1f]/.test(value);
}
function stringSafe(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && !NONDISPLAY.test(value);
}

/** Fail closed on private/provenance/cross-version mismatches before any file load. */
export function validateDb01Shards(manifest: unknown): asserts manifest is Db01ShardManifest {
  check(isObj(manifest), 'INVALID_MANIFEST');
  check(manifest.schema === DB01_SHARDS_SCHEMA && manifest.privateOnly === true &&
    manifest.publicationAuthorized === false && manifest.bucketCount === 256, 'PRIVATE_SCHEMA_REQUIRED');
  check(manifest.platform === 'Steam' && typeof manifest.gameVersion === 'string' &&
    /^\d+\.\d+\.\d+$/.test(manifest.gameVersion), 'INVALID_TARGET');
  check(typeof manifest.sourceManifestSha256 === 'string' && SHA.test(manifest.sourceManifestSha256) &&
    typeof manifest.nativeSourceManifestSha256 === 'string' && SHA.test(manifest.nativeSourceManifestSha256) &&
    typeof manifest.sourceItemsSha256 === 'string' && SHA.test(manifest.sourceItemsSha256), 'UNVERIFIED_SOURCE');
  check(Number.isSafeInteger(manifest.definitions) && Number(manifest.definitions) > 0 &&
    Number.isInteger(manifest.currentNativeItemDefinitions) && Number(manifest.currentNativeItemDefinitions)>0 &&
    Number(manifest.currentNativeItemDefinitions)<=Number(manifest.definitions) &&
    Number.isInteger(manifest.sourceFilesVerified) && Number.isInteger(manifest.sourceFilesTotal) &&
    Number(manifest.sourceFilesVerified) > 0 &&
    Number(manifest.sourceFilesTotal) >= Number(manifest.sourceFilesVerified), 'INVALID_COVERAGE');
  check(typeof manifest.fullCorpusParsed === 'boolean', 'INVALID_CORPUS_STATUS');
  check(Array.isArray(manifest.categories) && manifest.categories.length > 0 &&
    manifest.categories.every((c:unknown) => typeof c === 'string' && CATEGORY.test(c)) &&
    new Set(manifest.categories).size === manifest.categories.length, 'INVALID_CATEGORIES');
  const manifestLocales = manifest.locales;
  check(Array.isArray(manifestLocales) &&
    manifestLocales.length === DB01_LOCALES.length &&
    DB01_LOCALES.every(l => manifestLocales.includes(l)), 'INVALID_LOCALES');
  check(typeof manifest.historicalCandidatesIncluded === 'boolean' &&
    (manifest.historicalCandidatesIncluded ?
      typeof manifest.historicalManifestSha256 === 'string' && SHA.test(manifest.historicalManifestSha256) :
      manifest.historicalManifestSha256 === null), 'INVALID_HISTORY_CONTRACT');
  check(isObj(manifest.files), 'INVALID_FILE_MANIFEST');
  const required = [
    ...Array.from({length:256},(_,i) => `id/${i.toString(16).padStart(2,'0')}.json`),
    ...manifest.categories.map((c:string)=>`category/${c}.json`),
    ...DB01_LOCALES.map(locale=>`locale/${locale}.json`),
    ...(manifest.historicalCandidatesIncluded ?
      Array.from({length:256},(_,i)=>`historical/${i.toString(16).padStart(2,'0')}.json`) : []),
  ];
  check(Object.keys(manifest.files).length === required.length &&
    required.every(path=>Object.prototype.hasOwnProperty.call(manifest.files,path)), 'UNEXPECTED_ASSET_PATHS');
  for (const value of Object.values(manifest.files)) {
    check(isObj(value) && typeof value.sha256 === 'string' && SHA.test(value.sha256) &&
      Number.isInteger(value.bytes) && Number(value.bytes) >= 3 && Number(value.bytes) < 12_000_000 &&
      Number.isSafeInteger(value.count) && Number(value.count) >= 0, 'INVALID_ASSET_METADATA');
  }
  // These are metadata-only checks, so corrupted release ledgers are rejected
  // before downloading any private source files. The offline release auditor
  // performs the separate, full source-to-shard relational verification.
  const ledger = manifest.files as Record<string, Db01ShardMeta>;
  const definitions = Number(manifest.definitions);
  const count = (path:string) => ledger[path].count;
  const idTotal = Array.from({length:256},(_,i)=>count(`id/${i.toString(16).padStart(2,'0')}.json`))
    .reduce((a,b)=>a+b,0);
  // Deliberately avoid inferring domain from non-item native categories.
  const allCategories = manifest.categories as string[];
  const categoriesTotal = allCategories.reduce((total,category)=>total+count(`category/${category}.json`),0);
  const nativeTotal = allCategories.filter(category=>
    ['ActivityItem','Furniture','Clothing','Trimming'].includes(category))
    .reduce((total,category)=>total+count(`category/${category}.json`),0);
  check(idTotal === manifest.definitions && categoriesTotal === manifest.definitions &&
    nativeTotal === manifest.currentNativeItemDefinitions, 'SHARD_LEDGER_TOTAL_MISMATCH');
  check(DB01_LOCALES.every(locale=>count(`locale/${locale}.json`) <= definitions),
    'LOCALE_LEDGER_OVERFLOW');
  if (manifest.historicalCandidatesIncluded) {
    const historyTotal = Array.from({length:256},(_,i)=>
      count(`historical/${i.toString(16).padStart(2,'0')}.json`)).reduce((a,b)=>a+b,0);
    check(historyTotal <= definitions * DB01_LOCALES.length, 'HISTORY_LEDGER_OVERFLOW');
  }
  check(!manifest.fullCorpusParsed ||
    manifest.sourceFilesVerified === manifest.sourceFilesTotal, 'INCOMPLETE_CORPUS_LEDGER');
}

function checkItem(row: unknown, manifest: Db01ShardManifest): asserts row is Db01Item {
  check(isObj(row) && isItemId(Number(row.itemId)) && typeof row.itemId === 'number', 'INVALID_ITEM');
  check(typeof row.nativeCategory === 'string' && manifest.categories.includes(row.nativeCategory) &&
    (row.catalogDomain === 'item' || row.catalogDomain === 'definition_unclassified') &&
    (row.localizationKey === null || typeof row.localizationKey === 'string') &&
    nativeKeySafe(row.nativeKey) &&
    typeof row.sourceSha256 === 'string' && SHA.test(row.sourceSha256), 'INVALID_ITEM_SOURCE');
  const expected = ['ActivityItem','Furniture','Clothing','Trimming'].includes(row.nativeCategory) ? 'item' : 'definition_unclassified';
  check(row.catalogDomain === expected, 'INVALID_ITEM_DOMAIN');
  check(expected === 'item' ? typeof row.verifiedIconGuid === 'string' &&
    /^guid:[0-9a-f]{32}$/.test(row.verifiedIconGuid) :
    row.verifiedIconGuid === null, 'UNVERIFIED_ICON');
  check(isObj(row.names) && Object.keys(row.names).length === DB01_LOCALES.length, 'INVALID_ITEM_NAMES');
  for (const locale of DB01_LOCALES) {
    const name = row.names[locale];
    check(name === null || stringSafe(name), 'INVALID_EXACT_NAME');
  }
}

export interface Db01CatalogClient {
  readonly source: Readonly<Pick<Db01ShardManifest,'platform'|'gameVersion'|'definitions'|'currentNativeItemDefinitions'|'nativeSourceManifestSha256'|'fullCorpusParsed'|'privateOnly'|'sourceItemsSha256'>>;
  getItem(id: number): Promise<Readonly<Db01Item> | null>;
  /** Bounded multi-ID lookup for Save/Guide/Collection; one hash check per unique bucket. */
  getItems(ids: readonly number[]): Promise<readonly (Readonly<Db01Item> | null)[]>;
  getCategory(category: string): Promise<readonly Readonly<Db01Item>[]>;
  /** Original SHA-pinned category names; includes native non-inventory types. */
  getCategories(): readonly string[];
  getByNativeKey(category: string, nativeKey: string): Promise<Readonly<Db01Item> | null>;
  searchExactNames(query: string, locale: Db01Locale, limit?: number): Promise<readonly Db01NameResult[]>;
  getName(id: number, locale: Db01Locale, options?: {allowHistorical?: boolean}): Promise<Db01NameResult | null>;
}

/** No whole-catalog load: memoized category, locale and ID-bucket reads are SHA-pinned. */
export function createDb01CatalogClient(rawManifest: unknown, loadBytes: Db01LoadBytes): Db01CatalogClient {
  validateDb01Shards(rawManifest);
  // A caller can reuse and mutate its own parsed JSON object, including while
  // asynchronous File/ZIP reads are in flight. Snapshot the complete verified
  // ledger instead of trusting mutable caller-owned hash/byte/count metadata.
  const manifest: Db01ShardManifest = Object.freeze({
    ...rawManifest,
    categories: Object.freeze([...rawManifest.categories]),
    locales: Object.freeze([...rawManifest.locales]),
    files: Object.freeze(Object.fromEntries(Object.entries(rawManifest.files).map(
      ([path,meta])=>[path,Object.freeze({...meta})]))),
  });
  check(typeof loadBytes === 'function', 'LOADER_REQUIRED');
  const reads = new Map<string, Promise<unknown>>();
  async function loadJson(path: string): Promise<unknown> {
    const existing = reads.get(path);
    if (existing) return existing;
    const promise = (async () => {
      const meta = manifest.files[path];
      check(meta, 'UNEXPECTED_ASSET_PATH');
      const payload = await loadBytes(path);
      const bytes = payload instanceof ArrayBuffer ? new Uint8Array(payload) : payload;
      check(bytes instanceof Uint8Array && bytes.byteLength === meta.bytes, 'ASSET_SIZE_MISMATCH');
      check(globalThis.crypto?.subtle, 'SHA_UNAVAILABLE');
      const stableBytes = new Uint8Array(bytes.byteLength);
      stableBytes.set(bytes);
      const raw = await crypto.subtle.digest('SHA-256', stableBytes);
      const digest = Array.from(new Uint8Array(raw), b=>b.toString(16).padStart(2,'0')).join('');
      check(digest === meta.sha256, 'ASSET_HASH_MISMATCH');
      // Parse exactly the immutable snapshot that was SHA-256 verified, not the
      // caller-owned Uint8Array, which may change while digest() is pending.
      const json: unknown = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(stableBytes));
      check(Array.isArray(json) && json.length === meta.count, 'ASSET_COUNT_MISMATCH');
      return json;
    })();
    reads.set(path, promise);
    try { return await promise; }
    catch (error) { reads.delete(path); throw error; }
  }
  const bucket = (id:number) => id.toString(16).padStart(2,'0').slice(-2);
  function parseRows(data: unknown, path: string): readonly Readonly<Db01Item>[] {
    check(Array.isArray(data), 'INVALID_SHARD');
    const seen = new Set<number>();
    const seenKeys = new Set<string>();
    for (const value of data) {
      checkItem(value,manifest);
      check(!seen.has(value.itemId), 'DUPLICATE_SHARD_ID');
      seen.add(value.itemId);
      if (path.startsWith('id/')) check(bucket(value.itemId) === path.slice(3,5), 'WRONG_ID_BUCKET');
      if (path.startsWith('category/')) {
        check(value.nativeCategory === path.slice(9,-5), 'WRONG_CATEGORY_SHARD');
        check(!seenKeys.has(value.nativeKey), 'DUPLICATE_NATIVE_KEY');
        seenKeys.add(value.nativeKey);
      }
    }
    for (const row of data as Db01Item[]) {
      Object.freeze(row.names);
      Object.freeze(row);
    }
    return Object.freeze(data) as readonly Db01Item[];
  }
  async function getItem(id:number): Promise<Readonly<Db01Item> | null> {
    check(isItemId(id), 'INVALID_ID');
    const path=`id/${bucket(id)}.json`;
    const rows=parseRows(await loadJson(path),path);
    return rows.find(row=>row.itemId===id) ?? null;
  }
  /** Preserve caller order and missing IDs, while deduplicating I/O and capping concurrency. */
  async function getItems(ids: readonly number[]): Promise<readonly (Readonly<Db01Item> | null)[]> {
    check(Array.isArray(ids) && ids.length <= 4096 && ids.every(isItemId), 'INVALID_BATCH_IDS');
    if (ids.length === 0) return Object.freeze([]);
    const requested=new Set(ids);
    const paths=[...new Set(ids.map(id=>`id/${bucket(id)}.json`))];
    const found=new Map<number, Readonly<Db01Item>>();
    let next=0;
    // Eight workers avoid 256 simultaneous file/ZIP reads for large save indexes.
    async function worker(): Promise<void> {
      while (next < paths.length) {
        const path=paths[next++];
        const rows=parseRows(await loadJson(path),path);
        for (const row of rows) if (requested.has(row.itemId)) found.set(row.itemId,row);
      }
    }
    await Promise.all(Array.from({length:Math.min(8,paths.length)},()=>worker()));
    return Object.freeze(ids.map(id=>found.get(id)??null));
  }
  async function getCategory(category:string):Promise<readonly Readonly<Db01Item>[]> {
    check(CATEGORY.test(category) && manifest.categories.includes(category), 'INVALID_CATEGORY');
    const path=`category/${category}.json`;
    return parseRows(await loadJson(path),path);
  }
  /** Exact raw native-key lookup, with no inferred DLC, item class or owner state. */
  async function getByNativeKey(category:string, nativeKey:string):Promise<Readonly<Db01Item>|null> {
    check(CATEGORY.test(category) && manifest.categories.includes(category), 'INVALID_CATEGORY');
    check(nativeKeySafe(nativeKey), 'INVALID_NATIVE_KEY');
    const matches=(await getCategory(category)).filter(row=>row.nativeKey===nativeKey);
    check(matches.length<=1, 'DUPLICATE_NATIVE_KEY');
    return matches[0]??null;
  }
  async function searchExactNames(query:string,locale:Db01Locale,limit=100):Promise<readonly Db01NameResult[]> {
    check(localeIsValid(locale), 'INVALID_LOCALE');
    check(typeof query === 'string' && query.trim().length <= 150 &&
      Number.isSafeInteger(limit) && limit >= 1 && limit <= 500, 'INVALID_SEARCH');
    if (!query.trim()) return [];
    const rows = await loadJson(`locale/${locale}.json`);
    check(Array.isArray(rows), 'INVALID_LOCALE_SHARD');
    const target=query.trim().toLocaleLowerCase(locale);
    const matches:Db01NameResult[]=[];
    const seen=new Set<number>();
    for (const pair of rows) {
      check(Array.isArray(pair) && pair.length === 2 &&
        typeof pair[0] === 'number' && isItemId(pair[0]) && stringSafe(pair[1]), 'INVALID_NAME_INDEX');
      check(!seen.has(pair[0]), 'DUPLICATE_NAME_INDEX_ID');
      seen.add(pair[0]);
      // Validate the complete SHA-pinned shard, including entries after the result limit.
      if (matches.length < limit && pair[1].toLocaleLowerCase(locale).includes(target)) {
        matches.push({itemId:pair[0],locale,value:pair[1],evidence:'current_exact_locdb_join',baselineVersion:null});
      }
    }
    return matches;
  }
  async function getName(id:number,locale:Db01Locale,options:{allowHistorical?:boolean}={}):Promise<Db01NameResult|null> {
    check(localeIsValid(locale), 'INVALID_LOCALE');
    const row=await getItem(id);
    if(!row)return null;
    const exact=row.names[locale];
    if(exact!==null)return {itemId:id,locale,value:exact,evidence:'current_exact_locdb_join',baselineVersion:null};
    if(!options.allowHistorical || !manifest.historicalCandidatesIncluded)return null;
    const history=await loadJson(`historical/${bucket(id)}.json`);
    check(Array.isArray(history), 'INVALID_HISTORY_SHARD');
    const seen=new Set<string>();
    let candidate:Db01NameResult|null=null;
    for(const tuple of history){
      check(Array.isArray(tuple) && tuple.length===4 && isItemId(tuple[0]) &&
        localeIsValid(tuple[1]) && stringSafe(tuple[2]) &&
        typeof tuple[3]==='string' && /^\d+\.\d+\.\d+$/.test(tuple[3]) &&
        tuple[3]!==manifest.gameVersion && bucket(tuple[0])===bucket(id), 'INVALID_HISTORY_ROW');
      const key=`${tuple[0]}:${tuple[1]}`;
      check(!seen.has(key), 'DUPLICATE_HISTORY_ENTRY');
      seen.add(key);
      // Never return early: every entry in a trusted shard must satisfy the contract.
      if(tuple[0]===id && tuple[1]===locale)
        candidate={itemId:id,locale,value:tuple[2],evidence:'historical_prefix_crc_correlated_unverified_current',baselineVersion:tuple[3]};
    }
    return candidate;
  }
  return Object.freeze({
    source:Object.freeze({platform:manifest.platform,gameVersion:manifest.gameVersion,
      definitions:manifest.definitions,currentNativeItemDefinitions:manifest.currentNativeItemDefinitions,
      nativeSourceManifestSha256:manifest.nativeSourceManifestSha256,fullCorpusParsed:manifest.fullCorpusParsed,
      privateOnly:manifest.privateOnly,sourceItemsSha256:manifest.sourceItemsSha256}),
    getItem,getItems,getCategory,getCategories:()=>manifest.categories,
    getByNativeKey,searchExactNames,getName,
  });
}