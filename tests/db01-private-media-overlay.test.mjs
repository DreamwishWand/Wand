import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPrivateDb01MediaOverlay } from '../src/lib/items/media-overlay.ts';

const hash = (v) => createHash('sha256').update(v).digest('hex');
const bytes = (v) => new TextEncoder().encode(JSON.stringify(v) + '\n');
const SHA = 'a'.repeat(64);
const SOURCE_BYTES = new TextEncoder().encode('sprite fixture');
const IMAGE_SHA = hash(SOURCE_BYTES);
const ORIGINAL_SHA = 'c'.repeat(64);

function setup() {
  const files = {};
  const raw = new Map();
  const expected = new Map();
  for (let n = 1; n <= 256; n++) {
    const bucket = n.toString(16).padStart(2, '0').slice(-2);
    const iconGuid = 'guid:' + n.toString(16).padStart(32, '0');
    const value = n % 2 === 1
      ? {
          class: 'Sprite', unityAssetId: 'unity:fake:' + n + ':Sprite',
          textureAssetId: 'unity:fake:' + n + ':Texture2D',
          sourceSha256: SHA,
          identityEvidence: 'exact_catalog_key_and_serialized_bundle_path_id',
          thumbnail: {path: 'images/thumbnail/aa/' + SHA + '.webp',
                      sha256: IMAGE_SHA, width: 128, height: 128},
          detail: {path: 'images/detail/aa/' + SHA + '.webp',
                   sha256: IMAGE_SHA, width: 256, height: 256}
        }
      : null;
    const entry = { itemId: n, iconGuid, status: value ? 'verified' : 'unresolved', image: value };
    const path = 'id/' + bucket + '.json';
    const buffer = bytes({schema: 'wand.src04.media-overlay-shard@1', bucket, rows: [entry]});
    raw.set(path, buffer);
    files[path] = {sha256: hash(buffer), bytes: buffer.length, count: 1, verified: value ? 1 : 0};
    expected.set(n, entry);
  }
  const index = {
    schema: 'wand.src04.media-overlay@1', privateOnly: true,
    publicationAuthorized: false, imageByteVerification: 'not_performed',
    source: {itemsSha256: ORIGINAL_SHA, itemMapSha256: SHA,
             sourcePlatformProvenance: 'Steam', sourceVersionProvenance: '1.26.2'},
    coverage: {totalItems: 256, verifiedItems: 128, unresolvedItems: 128,
               verifiedGuids: 128, unresolvedGuids: 128, complete: false,
               scope: 'four_native_item_categories_partial_icon_coverage'},
    bucketCount: 256, files
  };
  const catalog = {
    source: {privateOnly: true, sourceItemsSha256: ORIGINAL_SHA},
    async getItem(id) { return expected.get(id) ? {itemId:id,verifiedIconGuid:expected.get(id).iconGuid}:null; }
  };
  return {index,catalog,raw,expected};
}
test('loads only necessary SHA-pinned ID buckets', async () => {
  const {index,catalog,raw}=setup();
  let calls=0;
  const db = createPrivateDb01MediaOverlay(index,catalog,async path=>{calls++;return raw.get(path);});
  const one=await db.getItemIcon(1);
  assert.equal(one.status,'verified');
  assert.equal((await db.getItemIcon(2)).status,'unresolved');
  assert.equal((await db.getItemIcon(257)),null);
  assert.equal((await db.getItemIcon(1)).status,'verified');
  assert.equal(calls,2);
  assert.equal(db.privateOnly,true);
  assert.equal(db.publicationAuthorized,false);
  const img=await db.readVerifiedImage(one,'detail',async () => SOURCE_BYTES);
  assert.deepEqual(img,SOURCE_BYTES);
  await assert.rejects(db.readVerifiedImage(one,'detail',async()=>new TextEncoder().encode('wrong')), /SHA_MISMATCH/);
});
test('rejects mismatched DB-01 source before reading', () => {
  const {index,catalog,raw}=setup();
  catalog.source.sourceItemsSha256='d'.repeat(64);
  assert.throws(()=>createPrivateDb01MediaOverlay(index,catalog,async p=>raw.get(p)),/SOURCE_SHA_MISMATCH/);
});
test('rejects altered shard without using its data', async () => {
  const {index,catalog,raw}=setup();
  const db=createPrivateDb01MediaOverlay(index,catalog,async p=>
    p==='id/01.json' ? new TextEncoder().encode('tampered') : raw.get(p));
  await assert.rejects(db.getItemIcon(1),/BYTE_LENGTH_MISMATCH|SHA_MISMATCH/);
});
test('fails closed when a known Item ID changes GUID in DB-01', async () => {
  const {index,catalog,raw}=setup();
  catalog.getItem=async id=>({itemId:id,verifiedIconGuid:'guid:'+'f'.repeat(32)});
  const db=createPrivateDb01MediaOverlay(index,catalog,async p=>raw.get(p));
  await assert.rejects(db.getItemIcon(1),/DB01_GUID_MISMATCH/);
});
test('rejects attempted public activation of a private overlay', () => {
  const {index,catalog,raw}=setup();
  index.publicationAuthorized=true;
  assert.throws(()=>createPrivateDb01MediaOverlay(index,catalog,async p=>raw.get(p)),/PRIVATE_MANIFEST_REQUIRED/);
});

test('recognizes 100% Item ID coverage without enabling publication', async () => {
  const {index,catalog,raw,expected}=setup();
  for (let n=2;n<=256;n+=2) {
    const bucket=n.toString(16).padStart(2,'0').slice(-2);
    const path='id/'+bucket+'.json';
    const prev=expected.get(n);
    const art={...expected.get(1).image, unityAssetId:'unity:fake:'+n+':Sprite',
      textureAssetId:'unity:fake:'+n+':Texture2D'};
    const row={...prev, status:'verified', image:art};
    expected.set(n,row);
    const buffer=bytes({schema:'wand.src04.media-overlay-shard@1',bucket,rows:[row]});
    raw.set(path,buffer);
    index.files[path]={sha256:hash(buffer),bytes:buffer.length,count:1,verified:1};
  }
  index.coverage.verifiedItems=256;
  index.coverage.unresolvedItems=0;
  index.coverage.verifiedGuids=256;
  index.coverage.unresolvedGuids=0;
  const api=createPrivateDb01MediaOverlay(index,catalog,p=>raw.get(p));
  assert.equal(api.itemIconCoverageComplete,true);
  assert.equal(api.publicationAuthorized,false);
  assert.equal(api.coverage.complete,false); // Conservative broader media scope stays unchanged.
  assert.equal((await api.getItemIcon(256)).status,'verified');
});
