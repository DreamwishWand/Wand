/**
 * DB-01 -> DB-02 read-only, provenance-gated static item evidence.
 * Accept only a caller-verified private DB-02 bundle, an independently trusted
 * byte-exact manifest SHA, and independently established current Condition SHA.
 * No online stock, eligibility, ownership, save writing, publishing or DLC rights.
 */
import type { Db01CatalogClient, Db01Item } from './index.ts';

export const DB01_DB02_JOIN_CONTRACT = 'wand.db01.db02-private-source-join@1' as const;
const SHA = /^[a-f0-9]{64}$/;
const CURRENT_1262_CONDITION_SHA = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
const SRC02_REQUIRED_FILES = [
  'recipes.jsonl', 'acquisitions.jsonl', 'loot-tables.jsonl',
  'related-items.jsonl', 'condition-gates.jsonl', 'condition-definitions.jsonl'
] as const;

export interface Db02StaticAcquisitionResult {
  readonly itemId: number;
  readonly source: { readonly platform: string; readonly gameVersion: string };
  readonly status?: 'unresolved_or_no_verified_link';
  readonly inSrc01?: boolean;
  readonly madeBy?: readonly unknown[];
  readonly usedBy?: readonly unknown[];
  readonly acquisitionPaths?: readonly unknown[];
  readonly growsInto?: readonly unknown[];
  readonly shopOffers?: readonly unknown[];
  readonly possibleStalls?: readonly unknown[];
}
export interface Db02StaticAcquisitionConsumer {
  readonly source: { readonly platform: string; readonly gameVersion: string };
  getItem(itemId: number): Db02StaticAcquisitionResult | null;
}
/** Pins must come from a separate owner-verified ledger, never copied from the untrusted manifest. */
export interface Db02IndependentSourcePins {
  readonly manifestSha256: string;
  readonly currentConditionSha256: string;
}
export interface Db01Db02JoinResult {
  readonly contract: typeof DB01_DB02_JOIN_CONTRACT;
  readonly itemId: number;
  readonly status: 'exact_current_definition_id' | 'not_in_partial_db01_catalog';
  readonly definition: Readonly<Db01Item> | null;
  /** SRC-02 static candidates only. May be unresolved even for a known DB-01 item. */
  readonly staticAcquisition: Db02StaticAcquisitionResult | null;
  readonly versionAndSourceProvenanceMatched: true;
  readonly liveAvailabilityVerified: false;
  readonly unlockOrEntitlementVerified: false;
  readonly saveWritingAuthorized: false;
  readonly publicationAuthorized: false;
}
export interface Db01Db02Join {
  readonly contract: typeof DB01_DB02_JOIN_CONTRACT;
  readonly source: Readonly<{platform:string; gameVersion:string; manifestSha256:string; currentConditionSha256:string}>;
  getItem(itemId: number): Promise<Db01Db02JoinResult>;
}
function check(value: unknown, reason:string): asserts value {
  if (!value) throw new TypeError(`DB01_DB02_${reason}`);
}
function obj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function isSha(value: unknown): value is string {
  return typeof value === 'string' && SHA.test(value);
}

/**
 * Manifest and the DB-02 consumer must already come from the same trusted
 * verify_bundle.mjs private snapshot. The independent manifest checksum and
 * source-probe condition hash are checked here again at the service boundary.
 */
export async function createDb01Db02Join(
  catalog: Db01CatalogClient,
  acquisition: Db02StaticAcquisitionConsumer,
  manifestBytes: Uint8Array | ArrayBuffer,
  trusted: Db02IndependentSourcePins
): Promise<Db01Db02Join> {
  check(catalog?.source?.privateOnly === true &&
    typeof catalog.getItem === 'function' &&
    isSha(catalog.source.nativeSourceManifestSha256), 'PRIVATE_DB01_REQUIRED');
  check(acquisition && typeof acquisition.getItem === 'function' && obj(acquisition.source),
    'VERIFIED_DB02_CONSUMER_REQUIRED');
  check(obj(trusted) && isSha(trusted.manifestSha256) &&
    isSha(trusted.currentConditionSha256), 'INDEPENDENT_SOURCE_PINS_REQUIRED');
  const input = manifestBytes instanceof ArrayBuffer ? new Uint8Array(manifestBytes) : manifestBytes;
  check(input instanceof Uint8Array && input.byteLength > 0 && input.byteLength <= 1024*1024,
    'INVALID_MANIFEST_BYTES');
  check(globalThis.crypto?.subtle, 'SHA256_UNAVAILABLE');
  const safe = new Uint8Array(input.byteLength);
  safe.set(input);
  const shaBytes = new Uint8Array(await crypto.subtle.digest('SHA-256',safe));
  const actualSha = Array.from(shaBytes,b=>b.toString(16).padStart(2,'0')).join('');
  check(actualSha === trusted.manifestSha256, 'MANIFEST_HASH_MISMATCH');
  let manifest: unknown;
  try { manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input)); }
  catch { throw new TypeError('DB01_DB02_MANIFEST_JSON_INVALID'); }
  check(obj(manifest) && manifest.schema === 'wand.src02@1' &&
    manifest.status === 'partial_native_extraction' &&
    manifest.platform === catalog.source.platform &&
    manifest.gameVersion === catalog.source.gameVersion, 'EXACT_VERSION_REQUIRED');
  check(acquisition.source.platform === manifest.platform &&
    acquisition.source.gameVersion === manifest.gameVersion, 'DB02_CONSUMER_VERSION_MISMATCH');
  check(obj(manifest.source) &&
    manifest.source.src01ManifestSha256 === catalog.source.nativeSourceManifestSha256 &&
    isSha(manifest.source.src01ItemsSha256), 'NATIVE_SOURCE_CHAIN_MISMATCH');
  // Steam 1.26.2 source-probe SHA is an independently verified known constant.
  // Other game versions require a new independently reviewed source profile.
  check(manifest.platform === 'Steam' && manifest.gameVersion === '1.26.2' &&
    trusted.currentConditionSha256 === CURRENT_1262_CONDITION_SHA &&
    manifest.source.conditionSha256 === CURRENT_1262_CONDITION_SHA,
    'CURRENT_CONDITION_SOURCE_REQUIRED');
  const fileLedger = manifest.files;
  check(obj(fileLedger) && SRC02_REQUIRED_FILES.every(name=>isSha(fileLedger[name])),
    'DB02_OUTPUT_EVIDENCE_MISSING');
  return Object.freeze({
    contract:DB01_DB02_JOIN_CONTRACT,
    source:Object.freeze({platform:manifest.platform as string,gameVersion:manifest.gameVersion as string,
      manifestSha256:actualSha,currentConditionSha256:CURRENT_1262_CONDITION_SHA}),
    async getItem(itemId:number):Promise<Db01Db02JoinResult> {
      check(isId(itemId),'INVALID_ITEM_ID');
      const definition=await catalog.getItem(itemId);
      const found=acquisition.getItem(itemId);
      if (found !== null) {
        check(obj(found) && found.itemId === itemId && obj(found.source) &&
          found.source.platform === manifest.platform &&
          found.source.gameVersion === manifest.gameVersion,
          'DB02_RESULT_PROVENANCE_MISMATCH');
      }
      return Object.freeze({contract:DB01_DB02_JOIN_CONTRACT,itemId,
        status:definition===null?'not_in_partial_db01_catalog':'exact_current_definition_id',
        definition,staticAcquisition:found,versionAndSourceProvenanceMatched:true,
        liveAvailabilityVerified:false,unlockOrEntitlementVerified:false,
        saveWritingAuthorized:false,publicationAuthorized:false});
    }
  });
}