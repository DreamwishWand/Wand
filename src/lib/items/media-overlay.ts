/** SHA-pinned, strictly private SRC-04 media overlay for lazy DB-01 reads.
 * Returned paths are local evidence, NOT URLs. Does not fetch or publish images.
 */
import type { Db01CatalogClient } from './index.ts';

export const DB01_MEDIA_OVERLAY_SCHEMA = 'wand.src04.media-overlay@1' as const;
const SHARD_SCHEMA = 'wand.src04.media-overlay-shard@1';
const EVIDENCE = 'exact_catalog_key_and_serialized_bundle_path_id';
const SHA = /^[0-9a-f]{64}$/;
const GUID = /^guid:[0-9a-f]{32}$/;

export interface MediaVariant {
  readonly path: string; readonly sha256: string;
  readonly width: number; readonly height: number;
}
export interface ExactItemMedia {
  readonly class: 'Sprite' | 'Texture2D';
  readonly unityAssetId: string;
  readonly textureAssetId: string | null;
  readonly sourceSha256: string;
  readonly identityEvidence: typeof EVIDENCE;
  readonly thumbnail: MediaVariant;
  readonly detail: MediaVariant;
}
export interface PrivateItemIconRow {
  readonly itemId: number;
  readonly iconGuid: string;
  readonly status: 'verified' | 'unresolved';
  readonly image: ExactItemMedia | null;
}
export interface MediaOverlayIndex {
  readonly schema: typeof DB01_MEDIA_OVERLAY_SCHEMA;
  readonly privateOnly: true;
  readonly publicationAuthorized: false;
  readonly imageByteVerification: 'not_performed';
  readonly source: {
    readonly itemsSha256: string; readonly itemMapSha256: string;
    readonly sourcePlatformProvenance: string | null;
    readonly sourceVersionProvenance: string | null;
  };
  readonly coverage: {
    readonly totalItems: number; readonly verifiedItems: number;
    readonly unresolvedItems: number; readonly verifiedGuids: number;
    readonly unresolvedGuids: number; readonly complete: false;
    readonly scope: string;
  };
  readonly bucketCount: 256;
  readonly files: Readonly<Record<string, {
    readonly sha256: string; readonly bytes: number;
    readonly count: number; readonly verified: number;
  }>>;
}
export type PrivateBytesProvider = (relativePath: string) => Promise<Uint8Array | ArrayBuffer>;

function fail(code: string): never { throw new TypeError('SRC04_OVERLAY_' + code); }
function check(ok: unknown, code: string): asserts ok { if (!ok) fail(code); }
function object(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function idValid(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function checkVariant(value: unknown, kind: 'thumbnail' | 'detail',
                      contentSha: string): asserts value is MediaVariant {
  const pathPattern = new RegExp('^images/' + kind + '/[0-9a-f]{2}/' + contentSha + '\\.webp$');
  check(object(value) && typeof value.path === 'string' && pathPattern.test(value.path) &&
    typeof value.sha256 === 'string' && SHA.test(value.sha256) &&
    Number.isSafeInteger(value.width) && value.width > 0 &&
    Number.isSafeInteger(value.height) && value.height > 0, 'VARIANT_EVIDENCE');
}
function checkRow(value: unknown, bucket: string): asserts value is PrivateItemIconRow {
  check(object(value) && idValid(value.itemId) &&
    value.itemId.toString(16).padStart(2, '0').slice(-2) === bucket &&
    typeof value.iconGuid === 'string' && GUID.test(value.iconGuid), 'INVALID_ICON_ROW');
  check(value.status === 'verified' || value.status === 'unresolved', 'INVALID_ICON_STATUS');
  if (value.status === 'unresolved') {
    check(value.image === null, 'UNRESOLVED_WITH_IMAGE');
    return;
  }
  const img = value.image;
  check(object(img) && (img.class === 'Sprite' || img.class === 'Texture2D') &&
    img.identityEvidence === EVIDENCE &&
    typeof img.unityAssetId === 'string' && img.unityAssetId.startsWith('unity:') &&
    img.unityAssetId.endsWith(':' + img.class) &&
    typeof img.sourceSha256 === 'string' && SHA.test(img.sourceSha256) &&
    (img.textureAssetId === null ||
      (img.class === 'Sprite' && typeof img.textureAssetId === 'string' &&
       img.textureAssetId.endsWith(':Texture2D'))), 'UNVERIFIED_IMAGE');
  checkVariant(img.thumbnail, 'thumbnail', img.sourceSha256);
  checkVariant(img.detail, 'detail', img.sourceSha256);
}
function checkManifest(value: unknown, catalog: Db01CatalogClient):
  asserts value is MediaOverlayIndex {
  check(object(value) && value.schema === DB01_MEDIA_OVERLAY_SCHEMA &&
    value.privateOnly === true && value.publicationAuthorized === false &&
    value.imageByteVerification === 'not_performed' &&
    value.bucketCount === 256, 'PRIVATE_MANIFEST_REQUIRED');
  check(object(value.source) &&
    typeof value.source.itemsSha256 === 'string' && SHA.test(value.source.itemsSha256) &&
    typeof value.source.itemMapSha256 === 'string' && SHA.test(value.source.itemMapSha256) &&
    catalog?.source?.privateOnly === true &&
    catalog.source.sourceItemsSha256 === value.source.itemsSha256, 'SOURCE_SHA_MISMATCH');
  const c = value.coverage;
  check(object(c) && c.complete === false && typeof c.scope === 'string' &&
    c.scope.length > 0 &&
    Number.isSafeInteger(c.totalItems) && c.totalItems > 0 &&
    Number.isSafeInteger(c.verifiedItems) && c.verifiedItems >= 0 &&
    Number.isSafeInteger(c.unresolvedItems) && c.unresolvedItems >= 0 &&
    Number.isSafeInteger(c.verifiedGuids) && c.verifiedGuids >= 0 &&
    Number.isSafeInteger(c.unresolvedGuids) && c.unresolvedGuids >= 0 &&
    c.verifiedItems + c.unresolvedItems === c.totalItems &&
    c.verifiedGuids + c.unresolvedGuids <= c.totalItems, 'INVALID_COVERAGE');
  check(object(value.files) && Object.keys(value.files).length === 256, 'INVALID_FILE_COUNT');
  let total = 0, verified = 0;
  for (let i = 0; i < 256; i++) {
    const name = 'id/' + i.toString(16).padStart(2, '0') + '.json';
    const f = value.files[name];
    check(object(f) && typeof f.sha256 === 'string' && SHA.test(f.sha256) &&
      Number.isSafeInteger(f.bytes) && f.bytes > 0 &&
      Number.isSafeInteger(f.count) && f.count >= 0 &&
      Number.isSafeInteger(f.verified) && f.verified >= 0 &&
      f.verified <= f.count, 'INVALID_SHARD_META');
    total += f.count; verified += f.verified;
  }
  check(total === c.totalItems && verified === c.verifiedItems, 'SHARD_COUNTS_MISMATCH');
}
async function checkedBytes(value: Uint8Array | ArrayBuffer, sha: string,
                            expectedSize?: number): Promise<Uint8Array> {
  const input = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  check(input instanceof Uint8Array && (expectedSize == null ||
    input.byteLength === expectedSize), 'BYTE_LENGTH_MISMATCH');
  check(globalThis.crypto?.subtle, 'SHA_UNAVAILABLE');
  const stable = new Uint8Array(input);
  const result = await crypto.subtle.digest('SHA-256', stable);
  const actual = Array.from(new Uint8Array(result),
    b => b.toString(16).padStart(2, '0')).join('');
  check(actual === sha, 'SHA_MISMATCH');
  return stable;
}

/** No implicit network, file-system or public static asset use.
 * Only the injected loader can access private shards or original WebP bytes.
 */
export function createPrivateDb01MediaOverlay(
  rawIndex: unknown, catalog: Db01CatalogClient, loadBytes: PrivateBytesProvider
) {
  checkManifest(rawIndex, catalog);
  check(typeof loadBytes === 'function', 'LOADER_REQUIRED');
  const index = rawIndex;
  const cache = new Map<string, Promise<ReadonlyMap<number, PrivateItemIconRow>>>();
  async function shard(bucket: string): Promise<ReadonlyMap<number, PrivateItemIconRow>> {
    const pending = cache.get(bucket);
    if (pending) return pending;
    const task = (async () => {
      const path = 'id/' + bucket + '.json', info = index.files[path];
      const bytes = await checkedBytes(await loadBytes(path), info.sha256, info.bytes);
      const data: unknown = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
      check(object(data) && data.schema === SHARD_SCHEMA && data.bucket === bucket &&
        Array.isArray(data.rows) && data.rows.length === info.count, 'INVALID_SHARD');
      const rows = new Map<number, PrivateItemIconRow>();
      let linked = 0;
      for (const row of data.rows) {
        checkRow(row, bucket);
        check(!rows.has(row.itemId), 'DUPLICATE_ITEM_ID');
        rows.set(row.itemId, Object.freeze(row));
        if (row.status === 'verified') linked++;
      }
      check(linked === info.verified, 'SHARD_VERIFIED_COUNT');
      return rows;
    })();
    cache.set(bucket, task);
    try { return await task; } catch (error) { cache.delete(bucket); throw error; }
  }
  async function getItemIcon(itemId: number): Promise<Readonly<PrivateItemIconRow> | null> {
    check(idValid(itemId), 'INVALID_ITEM_ID');
    const dbItem = await catalog.getItem(itemId);
    if (!dbItem) return null;
    const bucket = itemId.toString(16).padStart(2, '0').slice(-2);
    const row = (await shard(bucket)).get(itemId);
    check(row && row.iconGuid === dbItem.verifiedIconGuid, 'DB01_GUID_MISMATCH');
    return row;
  }
  async function readVerifiedImage(
    row: PrivateItemIconRow, kind: 'thumbnail' | 'detail', provider: PrivateBytesProvider
  ): Promise<Uint8Array> {
    check(kind === 'thumbnail' || kind === 'detail', 'INVALID_IMAGE_VARIANT');
    check(row.status === 'verified' && row.image !== null, 'UNRESOLVED_IMAGE');
    const exact = await getItemIcon(row.itemId);
    check(exact?.iconGuid === row.iconGuid &&
      exact.image?.sourceSha256 === row.image.sourceSha256 &&
      exact.image?.[kind].path === row.image[kind].path &&
      exact.image?.[kind].sha256 === row.image[kind].sha256, 'IMAGE_NOT_IN_OVERLAY');
    const ref = exact.image[kind];
    return checkedBytes(await provider(ref.path), ref.sha256);
  }
  return Object.freeze({
    privateOnly: true as const, publicationAuthorized: false as const,
    sourceItemsSha256: index.source.itemsSha256, coverage: Object.freeze(index.coverage),
    /** Complete coverage of the pinned SRC-01 Item ID corpus only; not media-publication approval. */
    itemIconCoverageComplete: index.coverage.verifiedItems === index.coverage.totalItems &&
      index.coverage.unresolvedItems === 0 && index.coverage.unresolvedGuids === 0,
    getItemIcon, readVerifiedImage
  });
}
