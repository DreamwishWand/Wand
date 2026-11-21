import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createPrivateDb01MediaOverlayV2
} from '../src/lib/items/media-overlay-v2.ts';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = obj => new TextEncoder().encode(JSON.stringify(obj) + '\n');
const SOURCE_SHA = 'c'.repeat(64);
const BUNDLE_SHA = 'a'.repeat(64);
const PIXEL_SHA = 'b'.repeat(64);
const GUID = 'guid:' + '1'.repeat(32);
const imageFile = (kind) => 'images-v2/' + kind + '/bb/' + PIXEL_SHA + '.webp';

function webp(kind = 'VP8L') {
  const bytes = new Uint8Array(24);
  const s = new TextEncoder();
  bytes.set(s.encode('RIFF'), 0);
  new DataView(bytes.buffer).setUint32(4, 16, true);
  bytes.set(s.encode('WEBP'), 8);
  bytes.set(s.encode(kind), 12);
  new DataView(bytes.buffer).setUint32(16, 4, true);
  bytes.set([0x2f, 1, 2, 3], 20);
  return bytes;
}
const LOSSLESS = webp();
function setup() {
  const files = {};
  const data = new Map();
  const rows = new Map();
  for (let n = 1; n <= 256; n++) {
    const bucket = (n & 255).toString(16).padStart(2, '0');
    const img = {
      class: 'Sprite', unityAssetId: 'unity:' + BUNDLE_SHA + ':CAB-fixture:' + n + ':Sprite',
      textureAssetId: 'unity:' + BUNDLE_SHA + ':CAB-fixture:' + (n + 1) + ':Texture2D',
      decodedSha256: PIXEL_SHA, sourceBundleSha256: BUNDLE_SHA,
      sourceWidth: 300, sourceHeight: 240,
      identityEvidence: 'exact_catalog_key_and_serialized_bundle_path_id',
      thumbnail: {path: imageFile('thumbnail'), sha256: sha256(LOSSLESS),
                  bytes: LOSSLESS.length, width: 128, height: 102},
      original: {path: imageFile('original'), sha256: sha256(LOSSLESS),
                 bytes: LOSSLESS.length, width: 300, height: 240}
    };
    const row = {itemId: n, iconGuid: GUID, status: 'verified', image: img};
    const filename = 'id/' + bucket + '.json';
    const payload = jsonBytes({schema:'wand.src04.media-overlay-shard@2',bucket,rows:[row]});
    files[filename] = {sha256:sha256(payload),bytes:payload.length,count:1,verified:1};
    data.set(filename,payload);
    rows.set(n,row);
  }
  const index = {
    schema:'wand.src04.media-overlay-manifest@2', bucketCount:256,
    privateOnly:true, publicationAuthorized:false, imageByteVerification:true,
    source:{sourceItemsSha256:SOURCE_SHA,
            variantPolicy:'thumbnail_128_lossless_webp_plus_original_native_lossless_webp',
            generatedBy:'src04_variants_v2.py'},
    coverage:{complete:false,scope:'four_native_item_categories_partial_icon_coverage',
              totalItems:256,verifiedItems:256,unresolvedItems:0,
              verifiedGuids:1,unresolvedGuids:0},
    files
  };
  const catalog = {
    source:{privateOnly:true,sourceItemsSha256:SOURCE_SHA},
    async getItem(id){return rows.has(id)?{itemId:id,verifiedIconGuid:GUID}:null}
  };
  return {index,catalog,data,rows};
}

test('v2 supports 256 SHA-pinned shards and both native/thumbnail variants', async () => {
  const {index,catalog,data} = setup();
  let hits=0;
  const api = createPrivateDb01MediaOverlayV2(index,catalog,async p=>{hits++;return data.get(p)});
  const first = await api.getItemIcon(1);
  assert.equal(first.image.thumbnail.width,128);
  assert.equal(first.image.original.width,300);
  assert.equal((await api.getItemIcon(1)).itemId,1);
  assert.equal(hits,1);
  assert.equal((await api.getItemIcon(257)),null);
  assert.equal(api.itemIconCoverageComplete,true);
  assert.equal(api.publicationAuthorized,false);
  assert.deepEqual(await api.readVerifiedImage(first,'original',async()=>LOSSLESS),LOSSLESS);
  assert.deepEqual(await api.readVerifiedImage(first,'thumbnail',async()=>LOSSLESS),LOSSLESS);
});
test('cannot activate public image delivery or accept outdated v1 shape', () => {
  const {index,catalog,data} = setup();
  index.publicationAuthorized=true;
  assert.throws(()=>createPrivateDb01MediaOverlayV2(index,catalog,p=>data.get(p)),
                /PRIVATE_SOURCE_REQUIRED/);
  index.publicationAuthorized=false;
  index.schema='wand.src04.media-overlay@1';
  assert.throws(()=>createPrivateDb01MediaOverlayV2(index,catalog,p=>data.get(p)),
                /PRIVATE_SOURCE_REQUIRED/);
});
test('a wrong native source hash fails closed', () => {
  const {index,catalog,data} = setup();
  catalog.source.sourceItemsSha256='d'.repeat(64);
  assert.throws(()=>createPrivateDb01MediaOverlayV2(index,catalog,p=>data.get(p)),
                /PRIVATE_SOURCE_REQUIRED/);
});
test('any edited shard is rejected by hash or byte length', async () => {
  const {index,catalog,data} = setup();
  const api=createPrivateDb01MediaOverlayV2(index,catalog,async p=>
    p==='id/01.json' ? jsonBytes({tampered:true}) : data.get(p));
  await assert.rejects(api.getItemIcon(1),/BYTE_LENGTH_MISMATCH|SHA_MISMATCH/);
});
test('native resolution mismatch in a shard is rejected', async () => {
  const {index,catalog,data,rows}=setup();
  const bad=structuredClone(rows.get(1));
  bad.image.original.width=299;
  const payload=jsonBytes({schema:'wand.src04.media-overlay-shard@2',bucket:'01',rows:[bad]});
  data.set('id/01.json',payload);
  index.files['id/01.json']={sha256:sha256(payload),bytes:payload.length,count:1,verified:1};
  const api=createPrivateDb01MediaOverlayV2(index,catalog,p=>data.get(p));
  await assert.rejects(api.getItemIcon(1),/ORIGINAL_NOT_NATIVE_SIZE/);
});
test('an old lossless? no: lossy VP8 image is explicitly rejected', async () => {
  const {index,catalog,data}=setup();
  const api=createPrivateDb01MediaOverlayV2(index,catalog,p=>data.get(p));
  const icon=await api.getItemIcon(1);
  const lossy=webp('VP8 ');
  // Override the in-memory expected SHA to test RIFF-signature rejection only.
  const fresh=structuredClone(JSON.parse(new TextDecoder().decode(data.get('id/01.json'))));
  fresh.rows[0].image.original.sha256=sha256(lossy);
  const buf=jsonBytes(fresh);
  data.set('id/01.json',buf);
  index.files['id/01.json']={sha256:sha256(buf),bytes:buf.length,count:1,verified:1};
  const api2=createPrivateDb01MediaOverlayV2(index,catalog,p=>data.get(p));
  const row=await api2.getItemIcon(1);
  await assert.rejects(api2.readVerifiedImage(row,'original',async()=>lossy),/WEBP_IS_LOSSY/);
  await assert.rejects(api2.readVerifiedImage(row,'original',async()=>new TextEncoder().encode('junk')),
                       /BYTE_LENGTH_MISMATCH|SHA_MISMATCH/);
});
test('GUID mismatches are not served even from valid shards', async () => {
  const {index,catalog,data}=setup();
  catalog.getItem=async id=>({itemId:id,verifiedIconGuid:'guid:'+'f'.repeat(32)});
  const api=createPrivateDb01MediaOverlayV2(index,catalog,p=>data.get(p));
  await assert.rejects(api.getItemIcon(1),/DB01_GUID_MISMATCH/);
});
