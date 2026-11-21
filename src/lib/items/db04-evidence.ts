/**
 * DB-01 final TypeScript ↔ DB-04 original-file-equal PRIVATE evidence overlay.
 * Source archive producer: tools/db-01-items/corroborate_world_objects.py.
 * No game text, source archive or rights/placement evaluation in this module.
 */
import type { Db01CatalogClient, Db01Item } from './index.ts';

export const DB01_WORLD_EVIDENCE_SCHEMA = 'wand.db01.db04-native-evidence@1' as const;
export interface Db01WorldFootprintEvidence {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly acceptedFloorTypesFlag: number;
  readonly layerValuesSha256: string;
  readonly nativeDimensionsVerified: true;
  readonly placementLegalityVerified: false;
  readonly cellIndexToXYVerified: false;
  readonly layerMaskSemanticsVerified: false;
}
export interface Db01WorldEvidenceRow {
  readonly itemId: number;
  readonly nativeCategory: 'Building' | 'Furniture';
  readonly nativeKey: string;
  readonly localizationKey: string;
  readonly sourceSha256: string;
  readonly footprint: Readonly<Db01WorldFootprintEvidence> | null;
}
export interface Db01WorldEvidenceManifest {
  readonly schema: typeof DB01_WORLD_EVIDENCE_SCHEMA;
  readonly privateOnly: true;
  readonly publicationAuthorized: false;
  readonly platform: 'Steam';
  readonly db01GameVersion: string;
  readonly worldGameVersion: string;
  readonly db01SourceItemsSha256: string;
  readonly db01SqliteSha256: string;
  readonly worldArchiveSha256: string;
  readonly worldManifestSha256: string;
  readonly worldObjectsSha256: string;
  readonly sourceSha256ByCategory: Readonly<Record<'Building'|'Furniture', string>>;
  readonly categories: readonly ['Building','Furniture'];
  readonly bucketCount: 256;
  readonly itemCount: number;
  readonly byCategory: Readonly<Record<'Building'|'Furniture', number>>;
  readonly recoveredLocalizationKeys: Readonly<Record<'Building'|'Furniture', number>>;
  readonly verifiedFootprints: Readonly<Record<'Building'|'Furniture', number>>;
  readonly fullWorldHierarchyVerified: false;
  readonly placementLegalityVerified: false;
  readonly saveStateOrOwnershipVerified: false;
  readonly files: Readonly<Record<string, Readonly<{bytes:number;sha256:string;count:number}>>>;
}
export interface Db01CorroboratedWorldObject {
  readonly itemId: number;
  readonly nativeCategory: 'Building' | 'Furniture';
  readonly nativeKey: string;
  /** Raw source wire field 3, NOT a translated name. */
  readonly localizationKey: string;
  readonly localizationKeyRecoveredFromWorld: boolean;
  readonly footprint: Readonly<Db01WorldFootprintEvidence> | null;
  readonly sourceGameVersions: Readonly<{item: string; world: string}>;
  readonly sourceFileBytesIdentical: true;
  readonly placementLegalityVerified: false;
  readonly worldCoordinatesVerified: false;
  readonly saveStateOrOwnershipVerified: false;
  readonly publicationAuthorized: false;
}
export interface Db01WorldEvidenceClient {
  readonly source: Readonly<Pick<Db01WorldEvidenceManifest,'db01GameVersion'|'worldGameVersion'|'itemCount'|'byCategory'|'recoveredLocalizationKeys'|'verifiedFootprints'>>;
  getItem(itemId: number): Promise<Readonly<Db01CorroboratedWorldObject> | null>;
}

const SHA = /^[a-f0-9]{64}$/;
const KEY = /^[^\x00-\x1f]+$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const CATEGORIES = ['Building','Furniture'] as const;
const validKey = (value:unknown,max:number):value is string =>
  typeof value==='string' && value.length>0 && value.length<=max &&
  value.trim()===value && KEY.test(value);
const goodId = (v:unknown):v is number => typeof v==='number' && Number.isSafeInteger(v) && v>0;
const uint32 = (v:unknown):v is number => typeof v==='number' && Number.isInteger(v) && v>=0 && v<=0xffffffff;
function check(ok:unknown,message:string):asserts ok {if(!ok)throw new TypeError('DB01_WORLD_'+message);}
function object(v:unknown):v is Record<string,unknown> {return !!v && typeof v==='object' && !Array.isArray(v);}
function manifestCheck(v:unknown):asserts v is Db01WorldEvidenceManifest {
  check(object(v),'INVALID_MANIFEST');
  const m=v as unknown as Db01WorldEvidenceManifest;
  check(m.schema===DB01_WORLD_EVIDENCE_SCHEMA && m.privateOnly===true &&
    m.publicationAuthorized===false && m.platform==='Steam' && m.bucketCount===256 &&
    m.fullWorldHierarchyVerified===false && m.placementLegalityVerified===false &&
    m.saveStateOrOwnershipVerified===false, 'PRIVATE_PROOF_REQUIRED');
  check(typeof m.db01GameVersion==='string' && VERSION.test(m.db01GameVersion) &&
    typeof m.worldGameVersion==='string' && VERSION.test(m.worldGameVersion),'GAME_VERSION');
  for(const key of ['db01SourceItemsSha256','db01SqliteSha256','worldArchiveSha256',
                    'worldManifestSha256','worldObjectsSha256'] as const)
    check(typeof m[key]==='string' && SHA.test(m[key]),'SOURCE_PIN');
  check(object(m.sourceSha256ByCategory) && object(m.byCategory) &&
    object(m.recoveredLocalizationKeys) && object(m.verifiedFootprints), 'CATEGORY_LEDGER');
  check(Array.isArray(m.categories) && JSON.stringify(m.categories)===JSON.stringify(CATEGORIES),
    'CATEGORY_SCOPE');
  check(goodId(m.itemCount),'ITEM_COUNT');
  let count=0;
  for(const category of CATEGORIES){
    check(typeof m.sourceSha256ByCategory[category]==='string' &&
      SHA.test(m.sourceSha256ByCategory[category]),'CATEGORY_SHA');
    check(typeof m.byCategory[category]==='number' && Number.isSafeInteger(m.byCategory[category]) &&
      m.byCategory[category]>=0,'CATEGORY_COUNT');
    for(const key of ['recoveredLocalizationKeys','verifiedFootprints'] as const)
      check(typeof m[key][category]==='number' && Number.isSafeInteger(m[key][category]) &&
        m[key][category]>=0 && m[key][category]<=m.byCategory[category], 'CATEGORY_EVIDENCE_COUNT');
    count+=m.byCategory[category];
  }
  check(count===m.itemCount,'ITEM_LEDGER');
  check(object(m.files) && Object.keys(m.files).length===256,'ASSET_LEDGER');
  let total=0;
  for(let i=0;i<256;i++) {
    const key=`${i.toString(16).padStart(2,'0')}.json`;
    const meta=m.files[key];
    check(object(meta) && typeof meta.sha256==='string' && SHA.test(meta.sha256) &&
      Number.isSafeInteger(meta.bytes) && meta.bytes>=3 &&
      Number.isSafeInteger(meta.count) && meta.count>=0,'ASSET_METADATA');
    total+=meta.count;
  }
  check(total===m.itemCount,'ASSET_TOTAL');
}
function footprintCheck(value:unknown):asserts value is Db01WorldFootprintEvidence|null {
  if(value===null)return;
  check(object(value),'FOOTPRINT_SHAPE');
  const fp=value as unknown as Db01WorldFootprintEvidence;
  check(Number.isSafeInteger(fp.sizeX) && fp.sizeX>=1 && fp.sizeX<=256 &&
    Number.isSafeInteger(fp.sizeY) && fp.sizeY>=1 && fp.sizeY<=256 &&
    fp.sizeX*fp.sizeY<=16384 && uint32(fp.acceptedFloorTypesFlag) &&
    typeof fp.layerValuesSha256==='string' && SHA.test(fp.layerValuesSha256) &&
    fp.nativeDimensionsVerified===true && fp.placementLegalityVerified===false &&
    fp.cellIndexToXYVerified===false && fp.layerMaskSemanticsVerified===false,
    'INVALID_FOOTPRINT_EVIDENCE');
}
function validateRow(raw:unknown, bucket:number, source:Db01WorldEvidenceManifest):
    asserts raw is Db01WorldEvidenceRow {
  check(object(raw) && goodId(raw.itemId) && raw.itemId%256===bucket &&
    (raw.nativeCategory==='Furniture' || raw.nativeCategory==='Building') &&
    validKey(raw.nativeKey,256) && validKey(raw.localizationKey,512) &&
    raw.sourceSha256===source.sourceSha256ByCategory[raw.nativeCategory],
    'INVALID_NATIVE_ROW');
  footprintCheck(raw.footprint);
}
async function sha256(bytes:Uint8Array):Promise<string> {
  // Stable owned buffer, required for TS5.9 BufferSource and browser SubtleCrypto.
  const stable=new Uint8Array(bytes.byteLength);stable.set(bytes);
  const digest=await crypto.subtle.digest('SHA-256',stable);
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}

/**
 * Requires INDEPENDENT owner-trusted hashes; hashes copied from an untrusted
 * data provider are not enough. No asset is fetched during construction.
 */
export async function createDb01WorldEvidenceClient({catalog,manifestBytes,load,
  expectedManifestSha256,expectedWorldArchiveSha256,expectedDb01SqliteSha256}: {
  catalog:Db01CatalogClient;
  manifestBytes:Uint8Array;
  load:(relativePath:string)=>Promise<Uint8Array>;
  expectedManifestSha256:string;
  expectedWorldArchiveSha256:string;
  expectedDb01SqliteSha256:string;
}):Promise<Db01WorldEvidenceClient> {
  check(typeof load==='function' && catalog?.source?.privateOnly===true,
    'PRIVATE_CATALOG_REQUIRED');
  for(const val of [expectedManifestSha256,expectedWorldArchiveSha256,expectedDb01SqliteSha256])
    check(typeof val==='string' && SHA.test(val),'TRUSTED_SHA_REQUIRED');
  check(manifestBytes instanceof Uint8Array && manifestBytes.byteLength>0 &&
    manifestBytes.byteLength<1024*1024,'MANIFEST_BYTES');
  check(await sha256(manifestBytes)===expectedManifestSha256,'MANIFEST_PIN_MISMATCH');
  const untrusted:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes));
  manifestCheck(untrusted);
  const manifest:Db01WorldEvidenceManifest=untrusted;
  check(manifest.db01SourceItemsSha256===catalog.source.sourceItemsSha256 &&
    manifest.db01GameVersion===catalog.source.gameVersion &&
    manifest.platform===catalog.source.platform &&
    manifest.worldArchiveSha256===expectedWorldArchiveSha256 &&
    manifest.db01SqliteSha256===expectedDb01SqliteSha256,
    'DB01_WORLD_VERSION_OR_SOURCE_MISMATCH');
  const cache = new Map<string,Promise<readonly Db01WorldEvidenceRow[]>>();
  async function bucket(bucketId:number):Promise<readonly Db01WorldEvidenceRow[]> {
    const file=`${bucketId.toString(16).padStart(2,'0')}.json`;
    if(!cache.has(file))cache.set(file,(async()=>{
      const b=await load(file);
      check(b instanceof Uint8Array && b.byteLength===manifest.files[file].bytes,
        'ASSET_SIZE_MISMATCH');
      check(await sha256(b)===manifest.files[file].sha256,'ASSET_SHA_MISMATCH');
      const rows:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
      check(Array.isArray(rows) && rows.length===manifest.files[file].count,'ASSET_ROWS');
      const ids=new Set<number>();
      let previous=0;
      for(const row of rows){
        validateRow(row,bucketId,manifest);
        check(!ids.has(row.itemId) && row.itemId>previous,'UNSORTED_OR_DUPLICATE_ITEMS');
        ids.add(row.itemId);previous=row.itemId;
        if(row.footprint) Object.freeze(row.footprint);
        Object.freeze(row);
      }
      return Object.freeze(rows) as readonly Db01WorldEvidenceRow[];
    })());
    return cache.get(file)!;
  }
  async function getItem(itemId:number):Promise<Readonly<Db01CorroboratedWorldObject>|null> {
    check(goodId(itemId),'INVALID_ITEM_ID');
    const db01:Readonly<Db01Item>|null=await catalog.getItem(itemId);
    if(db01===null)return null;
    if(db01.nativeCategory!=='Building' && db01.nativeCategory!=='Furniture')return null;
    const rows=await bucket(itemId%256);
    const record=rows.find(row=>row.itemId===itemId);
    check(record!==undefined,'WORLD_ITEM_MISSING');
    check(db01.nativeCategory===record.nativeCategory &&
      db01.nativeKey===record.nativeKey &&
      db01.sourceSha256===record.sourceSha256 &&
      (db01.localizationKey===null || db01.localizationKey===record.localizationKey),
      'ORIGINAL_SOURCE_IDENTITY_MISMATCH');
    return Object.freeze({
      itemId, nativeCategory:record.nativeCategory,nativeKey:record.nativeKey,
      localizationKey:record.localizationKey,
      localizationKeyRecoveredFromWorld:db01.localizationKey===null,
      footprint:record.footprint,
      sourceGameVersions:Object.freeze({item:manifest.db01GameVersion,world:manifest.worldGameVersion}),
      sourceFileBytesIdentical:true as const,placementLegalityVerified:false as const,
      worldCoordinatesVerified:false as const, saveStateOrOwnershipVerified:false as const,
      publicationAuthorized:false as const,
    });
  }
  return Object.freeze({
    source:Object.freeze({db01GameVersion:manifest.db01GameVersion,
      worldGameVersion:manifest.worldGameVersion,itemCount:manifest.itemCount,
      byCategory:manifest.byCategory,
      recoveredLocalizationKeys:manifest.recoveredLocalizationKeys,
      verifiedFootprints:manifest.verifiedFootprints}),
    getItem,
  });
}