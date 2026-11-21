/** Private SRC-04 v2 media index: max-128px thumbnail + native-size lossless WebP.
 * Identity and media bytes are SHA-pinned. No public URLs, network or filesystem
 * access is built in. The caller must supply authorized private bytes providers.
 * The v1 thumbnail/detail reader is kept separately for backward compatibility.
 */
import type { Db01CatalogClient } from './index.ts';

export const DB01_MEDIA_OVERLAY_V2_SCHEMA = 'wand.src04.media-overlay-manifest@2' as const;
const SHARD_SCHEMA = 'wand.src04.media-overlay-shard@2' as const;
const VARIANT_POLICY = 'thumbnail_128_lossless_webp_plus_original_native_lossless_webp';
const EVIDENCE = 'exact_catalog_key_and_serialized_bundle_path_id';
const SHA = /^[0-9a-f]{64}$/;
const GUID = /^guid:[0-9a-f]{32}$/;
const UNITY = /^unity:([0-9a-f]{64}):.+:[-0-9]+:(Sprite|Texture2D)$/;
export type PrivateMediaV2Kind = 'thumbnail' | 'original';

export interface PrivateMediaV2Variant {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}
export interface PrivateMediaV2Image {
  readonly class: 'Sprite' | 'Texture2D';
  readonly unityAssetId: string;
  readonly textureAssetId: string | null;
  /** SHA-256 of the canonical PNG encoding of the decoded Unity pixels. */
  readonly decodedSha256: string;
  readonly sourceBundleSha256: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly identityEvidence: typeof EVIDENCE;
  readonly thumbnail: PrivateMediaV2Variant;
  readonly original: PrivateMediaV2Variant;
}
export interface PrivateMediaV2Row {
  readonly itemId: number;
  readonly iconGuid: string;
  readonly status: 'verified';
  readonly image: PrivateMediaV2Image;
}
export interface PrivateMediaV2Index {
  readonly schema: typeof DB01_MEDIA_OVERLAY_V2_SCHEMA;
  readonly privateOnly: true;
  readonly publicationAuthorized: false;
  readonly imageByteVerification: true;
  readonly bucketCount: 256;
  readonly source: {
    readonly sourceItemsSha256: string;
    readonly variantPolicy: typeof VARIANT_POLICY;
    readonly generatedBy: string;
  };
  readonly coverage: {
    readonly complete: false;
    readonly scope: string;
    readonly totalItems: number;
    readonly verifiedItems: number;
    readonly unresolvedItems: 0;
    readonly verifiedGuids: number;
    readonly unresolvedGuids: 0;
  };
  readonly files: Readonly<Record<string, {
    readonly sha256: string; readonly bytes: number;
    readonly count: number; readonly verified: number;
  }>>;
}
export type PrivateMediaV2BytesProvider =
  (relativePath: string) => Promise<Uint8Array | ArrayBuffer>;

function fail(code: string): never { throw new TypeError('SRC04_V2_' + code); }
function check(value: unknown, code: string): asserts value { if (!value) fail(code); }
function object(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function posInt(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
function nonNegInt(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function variant(raw: unknown, kind: PrivateMediaV2Kind, pixelSha: string,
                 srcWidth: number, srcHeight: number): asserts raw is PrivateMediaV2Variant {
  check(object(raw) && SHA.test(raw.sha256) && posInt(raw.bytes) &&
    posInt(raw.width) && posInt(raw.height) && typeof raw.path === 'string',
    'INVALID_VARIANT');
  check(raw.path === 'images-v2/' + kind + '/' + pixelSha.slice(0, 2) +
    '/' + pixelSha + '.webp', 'INVALID_VARIANT_PATH');
  if (kind === 'thumbnail') {
    check(raw.width <= Math.min(128, srcWidth) &&
      raw.height <= Math.min(128, srcHeight) &&
      (srcWidth > 128 || srcHeight > 128 ||
       (raw.width === srcWidth && raw.height === srcHeight)),
      'THUMBNAIL_DIMENSIONS');
  } else {
    check(raw.width === srcWidth && raw.height === srcHeight,
      'ORIGINAL_NOT_NATIVE_SIZE');
  }
}
function row(raw: unknown, bucket: string): asserts raw is PrivateMediaV2Row {
  check(object(raw) && posInt(raw.itemId) &&
    (raw.itemId & 255).toString(16).padStart(2, '0') === bucket &&
    typeof raw.iconGuid === 'string' && GUID.test(raw.iconGuid) &&
    raw.status === 'verified', 'INVALID_ITEM_ROW');
  const img = raw.image;
  check(object(img) && (img.class === 'Sprite' || img.class === 'Texture2D') &&
    img.identityEvidence === EVIDENCE &&
    SHA.test(img.decodedSha256) && SHA.test(img.sourceBundleSha256) &&
    posInt(img.sourceWidth) && posInt(img.sourceHeight) &&
    typeof img.unityAssetId === 'string', 'INVALID_IMAGE');
  const unity = UNITY.exec(img.unityAssetId);
  check(unity && unity[1] === img.sourceBundleSha256 && unity[2] === img.class,
    'UNITY_SOURCE_MISMATCH');
  check(img.textureAssetId === null || (img.class === 'Sprite' &&
    typeof img.textureAssetId === 'string' &&
    img.textureAssetId.endsWith(':Texture2D')), 'INVALID_TEXTURE_PAIR');
  variant(img.thumbnail, 'thumbnail', img.decodedSha256, img.sourceWidth, img.sourceHeight);
  variant(img.original, 'original', img.decodedSha256, img.sourceWidth, img.sourceHeight);
}
function manifest(raw: unknown, catalog: Db01CatalogClient):
  asserts raw is PrivateMediaV2Index {
  check(object(raw) && raw.schema === DB01_MEDIA_OVERLAY_V2_SCHEMA &&
    raw.privateOnly === true && raw.publicationAuthorized === false &&
    raw.imageByteVerification === true && raw.bucketCount === 256 &&
    object(raw.source) && SHA.test(raw.source.sourceItemsSha256) &&
    raw.source.variantPolicy === VARIANT_POLICY &&
    typeof raw.source.generatedBy === 'string' &&
    catalog?.source?.privateOnly === true &&
    catalog.source.sourceItemsSha256 === raw.source.sourceItemsSha256,
    'PRIVATE_SOURCE_REQUIRED');
  const c = raw.coverage;
  check(object(c) && c.complete === false && typeof c.scope === 'string' &&
    c.scope.length > 0 && posInt(c.totalItems) && posInt(c.verifiedItems) &&
    nonNegInt(c.verifiedGuids) && c.verifiedItems === c.totalItems &&
    c.unresolvedItems === 0 && c.unresolvedGuids === 0 &&
    c.verifiedGuids <= c.totalItems, 'INCOMPLETE_ITEM_COVERAGE');
  check(object(raw.files) && Object.keys(raw.files).length === 256, 'INVALID_FILE_COUNT');
  let total = 0;
  for (let n = 0; n < 256; n++) {
    const key = 'id/' + n.toString(16).padStart(2, '0') + '.json';
    const f = raw.files[key];
    check(object(f) && SHA.test(f.sha256) && posInt(f.bytes) &&
      nonNegInt(f.count) && nonNegInt(f.verified) && f.count === f.verified,
      'INVALID_SHARD_META');
    total += f.count;
  }
  check(total === c.totalItems, 'INVALID_SHARD_TOTAL');
}
async function checkedBytes(input: Uint8Array | ArrayBuffer,
                            expectedHash: string, expectedBytes: number): Promise<Uint8Array> {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  check(bytes instanceof Uint8Array && bytes.byteLength === expectedBytes,
    'BYTE_LENGTH_MISMATCH');
  check(globalThis.crypto?.subtle, 'SHA_UNAVAILABLE');
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  const actual = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
  check(actual === expectedHash, 'SHA_MISMATCH');
  return copy;
}
/** Checks WebP RIFF framing and that the primary image stream uses VP8L, not
 * lossy VP8. Browser/consumer performs final image decoding.
 */
function checkWebpLossless(data: Uint8Array): void {
  check(data.length >= 20 &&
    String.fromCharCode(...data.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...data.subarray(8, 12)) === 'WEBP',
    'NOT_WEBP');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  check(view.getUint32(4, true) + 8 === data.length, 'WEBP_RIFF_LENGTH');
  let lossless = false;
  for (let at = 12; at + 8 <= data.length;) {
    const fourcc = String.fromCharCode(...data.subarray(at, at + 4));
    const size = view.getUint32(at + 4, true);
    const next = at + 8 + size + (size & 1);
    check(next <= data.length, 'WEBP_CHUNK_LENGTH');
    check(fourcc !== 'VP8 ', 'WEBP_IS_LOSSY');
    if (fourcc === 'VP8L') lossless = true;
    at = next;
  }
  check(lossless, 'WEBP_LOSSLESS_REQUIRED');
}
/** Accepts only the SHA-verified private v2 index, never public CDN paths.
 * The v1 contract is deliberately not accepted here.
 */
export function createPrivateDb01MediaOverlayV2(
  rawIndex: unknown, catalog: Db01CatalogClient, loadShardBytes: PrivateMediaV2BytesProvider
) {
  manifest(rawIndex, catalog);
  check(typeof loadShardBytes === 'function', 'LOADER_REQUIRED');
  const index = rawIndex;
  const cache = new Map<string, Promise<ReadonlyMap<number, PrivateMediaV2Row>>>();
  async function shard(bucket: string): Promise<ReadonlyMap<number, PrivateMediaV2Row>> {
    const existing = cache.get(bucket);
    if (existing) return existing;
    const request = (async () => {
      const path = 'id/' + bucket + '.json';
      const info = index.files[path];
      const bytes = await checkedBytes(await loadShardBytes(path), info.sha256, info.bytes);
      const parsed: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
      check(object(parsed) && parsed.schema === SHARD_SCHEMA &&
        parsed.bucket === bucket && Array.isArray(parsed.rows) &&
        parsed.rows.length === info.count, 'INVALID_SHARD');
      const rows = new Map<number, PrivateMediaV2Row>();
      for (const item of parsed.rows) {
        row(item, bucket);
        check(!rows.has(item.itemId), 'DUPLICATE_ITEM_ID');
        rows.set(item.itemId, Object.freeze(item));
      }
      return rows;
    })();
    cache.set(bucket, request);
    try { return await request; } catch (e) { cache.delete(bucket); throw e; }
  }
  async function getItemIcon(itemId: number): Promise<Readonly<PrivateMediaV2Row> | null> {
    check(posInt(itemId), 'INVALID_ITEM_ID');
    const dbRow = await catalog.getItem(itemId);
    if (!dbRow) return null;
    const bucket = (itemId & 255).toString(16).padStart(2, '0');
    const icon = (await shard(bucket)).get(itemId);
    check(icon && icon.iconGuid === dbRow.verifiedIconGuid, 'DB01_GUID_MISMATCH');
    return icon;
  }
  async function readVerifiedImage(
    icon: PrivateMediaV2Row, kind: PrivateMediaV2Kind,
    loadImageBytes: PrivateMediaV2BytesProvider
  ): Promise<Uint8Array> {
    check(kind === 'thumbnail' || kind === 'original', 'INVALID_KIND');
    check(typeof loadImageBytes === 'function', 'IMAGE_PROVIDER_REQUIRED');
    const current = await getItemIcon(icon.itemId);
    check(current && current.iconGuid === icon.iconGuid &&
      current.image.decodedSha256 === icon.image.decodedSha256 &&
      current.image[kind].sha256 === icon.image[kind].sha256 &&
      current.image[kind].path === icon.image[kind].path,
      'IMAGE_NOT_IN_OVERLAY');
    const ref = current.image[kind];
    const bytes = await checkedBytes(await loadImageBytes(ref.path), ref.sha256, ref.bytes);
    checkWebpLossless(bytes);
    return bytes;
  }
  return Object.freeze({
    privateOnly: true as const,
    publicationAuthorized: false as const,
    sourceItemsSha256: index.source.sourceItemsSha256,
    itemIconCoverageComplete: true as const,
    coverage: Object.freeze(index.coverage),
    getItemIcon, readVerifiedImage
  });
}
