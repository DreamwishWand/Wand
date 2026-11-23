import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {openPublicItemMaster} from '../src/lib/items/public-item-master.ts';

function siteFiles() {
  const requests = [];
  const fetcher = async (url) => {
    assert.match(url, /^\/Wand\/ddv\/item-master\/steam-1\.26\.2\/(?:index\.json|id\/[0-9a-f]{2}\.json)$/);
    requests.push(url);
    const path = join(process.cwd(), 'static', url.slice('/Wand/'.length));
    const data = await readFile(path);
    return {
      ok: true, redirected: false,
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    };
  };
  return {fetcher,requests};
}

test('current Steam Item master loads by Item ID with all 8 names, icon GUID and exact Tags',async()=>{
  const {fetcher,requests}=siteFiles();
  const master=await openPublicItemMaster('/Wand',fetcher);
  assert.equal(master.release.count,13202);
  assert.equal(master.release.coverage.itemIconGuid,13202);
  assert.equal(master.release.coverage.sourceTagReferences,60814);
  assert.equal(requests.length,1,'index is the only eager request');
  const item=await master.getItem(40005160);
  assert.equal(item?.names.ja,'ガラスの靴');
  assert.equal(item?.names.en,'Glass Shoe');
  assert.equal(Object.keys(item.names).length,8);
  assert.equal(item.iconGuid,'ee85e95b0e61be642af03833a4942ae7');
  assert.equal(item.nativeCategory,'Furniture');
  assert.equal(item.itemType.name,'Furniture');
  assert.deepEqual(item.tags.map(tag=>tag.key),[
    'White','Bedroom','Decor','F_Elegant','LivingRoom','IsDreamlightValley'
  ]);
  assert.equal(item.collectionSourceCandidates.some(candidate=>
    candidate.setId===2120000062 && candidate.universeTagKey==='Cinderella'),true);
  assert.equal(item.collectionMembershipVerified,false);
  assert.equal(item.worldMembershipVerified,false);
  assert.equal(item.availabilityVerified,false);
  assert.equal(requests.length,2,'one item downloads one shard');
  const page=await master.getItems([40005160,40006110,40005160,900000000]);
  assert.equal(page[0],item);
  assert.equal(page[1]?.names.en,'Decorative Picnic Basket');
  assert.equal(page[2],item);
  assert.equal(page[3],null);
  assert.equal(requests.length,4,'batch fetches only distinct uncached shards');
});

test('public Item master rejects invalid IDs and changed source shard bytes',async()=>{
  const {fetcher}=siteFiles();
  const master=await openPublicItemMaster('/Wand',fetcher);
  await assert.rejects(master.getItem(0),/ITEM_MASTER_INVALID_ITEM_ID/);
  await assert.rejects(master.getItems([1,0]),/ITEM_MASTER_INVALID_ITEM_BATCH/);
  const broken=async(url,opts)=>{
    const response=await fetcher(url,opts);
    if(url.endsWith('index.json'))return response;
    const old=new Uint8Array(await response.arrayBuffer());
    old[20] ^= 1;
    return {...response,arrayBuffer:async()=>old.buffer};
  };
  const altered=await openPublicItemMaster('/Wand',broken);
  await assert.rejects(altered.getItem(40005160),/ITEM_MASTER_SHA_MISMATCH/);
});
