import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  openPublicItemDetails, PUBLIC_ITEM_DETAILS_CONTRACT
} from '../src/lib/items/public-item-details.ts';

const sidecarPath = '/Wand/acquisition/public/db01-item-acquisition-1.26.2.json';
function siteFetcher() {
  const requests = [];
  let sidecarFailures = 0;
  const fetcher = async url => {
    requests.push(url);
    assert.match(url, /^\/Wand\/(?:acquisition\/public\/db01-item-acquisition-1\.26\.2\.json|ddv\/item-master\/steam-1\.26\.2\/(?:index\.json|id\/[a-f0-9]{2}\.json))$/);
    if (url === sidecarPath && sidecarFailures > 0) {
      sidecarFailures--;
      return new Response('unavailable', {status:503});
    }
    const bytes = await readFile(join(process.cwd(),'static',url.slice('/Wand/'.length)));
    return new Response(new Uint8Array(bytes), {status:200});
  };
  return {fetcher,requests,failSidecarOnce:()=>{sidecarFailures=1;}};
}

test('DB-01 public details join is lazy, retains all Item master fields and preserves absent IDs',async()=>{
  const {fetcher,requests} = siteFetcher();
  const db = await openPublicItemDetails('/Wand',fetcher);
  assert.equal(db.contract,PUBLIC_ITEM_DETAILS_CONTRACT);
  assert.equal(db.release.count,13202);
  assert.equal(requests.length,1,'open downloads the master index only');

  const unknown = await db.getItem(900000000);
  assert.equal(unknown,null);
  assert.equal(requests.includes(sidecarPath),false,
    'unknown Item IDs do not require acquisition');
  const details = await db.getItem(40005160);
  assert.equal(details.itemId,40005160);
  assert.equal(details.definition.names.ja,'ガラスの靴');
  assert.equal(details.definition.names.en,'Glass Shoe');
  assert.equal(details.definition.iconGuid,'ee85e95b0e61be642af03833a4942ae7');
  assert.equal(details.definition.tags.length,6);
  assert.equal(details.definition.collectionMembershipVerified,false);
  assert.equal(details.definition.worldMembershipVerified,false);
  assert.equal(details.definition.availabilityVerified,false);
  assert.equal(details.acquisition.itemId,'40005160');
  assert.equal(details.acquisition.currentAvailabilityVerified,false);
  assert.equal(details.currentAvailabilityVerified,false);
  assert(Object.isFrozen(details));
  assert.equal(requests.filter(x=>x===sidecarPath).length,1);
  assert.equal(await db.getItem(40005160),details,
    'identity and read cache are stable for detail panels');

  const rows=await db.getItems([40005160,900000000,40005160]);
  assert.deepEqual(rows,[details,null,details]);
  assert.equal(requests.filter(x=>x===sidecarPath).length,1);
});

test('DB-01 exposes six source-native acquisition groups without treating sparse data as unavailability',async()=>{
  const {fetcher,requests} = siteFetcher();
  const db = await openPublicItemDetails('Wand',fetcher);
  const groups=[
    ['ordinary_gameplay',2667],['premium_shop',272],['star_path',64],
    ['in_game_limited_event',139],['real_time_limited_event',14],
    ['iap_package_reward',158],
  ];
  for(const [category,count] of groups){
    const ids=await db.listItemIdsByAcquisition(category);
    assert.equal(ids.length,count,category);
    assert(Object.isFrozen(ids));
    assert(ids.every((id,i)=>Number.isSafeInteger(id)&&id>0&&
      (i===0 || id>ids[i-1])));
    assert.equal(await db.listItemIdsByAcquisition(category),ids);
  }
  const coverage=await db.getAcquisitionCoverage();
  assert.equal(coverage.distinctClassifiedItemIds,3247);
  assert.equal(coverage.recordsIncludingUnresolvedHints,4875);
  assert.equal(coverage.missingItemIdMeans,'unclassified_not_unobtainable');
  assert.equal(coverage.twitchDropItemIdLinks,0);
  assert.equal(coverage.redeemCodeItemIdLinks,0);
  assert.equal(coverage.separateActiveAvailabilityVerified,false);
  assert.equal(requests.filter(x=>x===sidecarPath).length,1);

  const candidates=await db.getItems((await db.listItemIdsByAcquisition('star_path')).slice(0,12));
  for(const detail of candidates) {
    if (!detail) continue; // A partial source link must never create a fictitious Item.
    assert(detail.acquisition.categories.includes('star_path'));
    assert.equal(detail.acquisition.classified,true);
    assert.equal(detail.currentAvailabilityVerified,false);
  }
});

test('sidecar download failure is retryable, with no guessed classification',async()=>{
  const {fetcher,failSidecarOnce,requests}=siteFetcher();
  const db=await openPublicItemDetails('/Wand',fetcher);
  failSidecarOnce();
  await assert.rejects(db.getItem(40005160),/DB02_DB01_ACQUISITION_DOWNLOAD_FAILED/);
  const result=await db.getItem(40005160);
  assert.equal(result.definition.itemId,40005160);
  assert.equal(requests.filter(x=>x===sidecarPath).length,2);
});
