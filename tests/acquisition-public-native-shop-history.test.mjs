import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_ARCHIVED_SHOP_BYTES,DB02_ARCHIVED_SHOP_FILE,DB02_ARCHIVED_SHOP_SHA,
  hasPinnedPublicNativeShopEvidence,loadPinnedHistoricalNativeShopSnapshot,
  loadPinnedPublicNativeShopSnapshot
} from '../src/lib/acquisition/public-native-shop.ts';
import {loadUnifiedAcquisitionOriginDatabase}
  from '../src/lib/acquisition/origins.ts';

const historical=readFileSync(
  new URL('../static/acquisition/public/'+DB02_ARCHIVED_SHOP_FILE,import.meta.url)
);
const november=readFileSync(
  new URL('../static/acquisition/public/shop-cache-2026-11-22.json',import.meta.url)
);
const fetcher=async url=>{
  assert(url.startsWith('/Wand/acquisition/public/'),url);
  const filename=url.slice('/Wand/acquisition/public/'.length);
  return new Response(filename===DB02_ARCHIVED_SHOP_FILE?historical:
    filename==='shop-cache-2026-11-22.json'?november:'missing',
    {status:filename.includes('shop-cache-')?200:404});
};
test('historical archive is source-pinned but never impersonates a 1.26.2 original',()=>{
  assert.equal(historical.byteLength,DB02_ARCHIVED_SHOP_BYTES);
  assert.equal(createHash('sha256').update(historical).digest('hex'),DB02_ARCHIVED_SHOP_SHA);
  const json=JSON.parse(historical.toString('utf8'));
  assert.equal(json.target.platform,'Steam');
  assert.equal(json.target.gameVersion,null);
  assert.equal(json.source.nativeMinGameVersion,'1.24');
  assert.equal(json.source.fullGameVersionVerified,false);
  assert.equal(json.source.sourceIsArchivedBackup,true);
  assert.equal(json.source.originalBytes,70749);
  assert.equal(json.source.originalSha256,
    '01a561793ecaa253457e89797da03e929ca8bb8e3dac7d257d786215584468a5');
  assert.equal(json.source.corroboratingBackupSha256,
    '9553c37b141123b70550b64ef4bd683c7c08b84f52fc4a63e737b0e8e0a95138');
  assert.equal(json.source.backupDifferencesLimitedToUpdateTimestamps,true);
  assert.equal(json.window.startUtc,'2026-07-15T13:00:00.632653200Z');
  assert.equal(json.window.endUtcExclusive,'2026-07-22T13:00:00Z');
  assert.equal(json.counts.offers,27);
  assert.equal(json.counts.itemOccurrences,128);
  assert.equal(json.counts.distinctItemIds,120);
  assert.equal(json.counts.discountedOffers,2);
  assert(!('Data' in json));
  assert.deepEqual(Object.keys(json).sort(),
    ['counts','offers','schema','source','target','window']);
});
test('27 historical offers retain 128 direct Item links and never claim current shop availability',async()=>{
  const history=await loadPinnedHistoricalNativeShopSnapshot('/Wand',fetcher);
  const current=await loadPinnedPublicNativeShopSnapshot('/Wand',fetcher);
  assert(hasPinnedPublicNativeShopEvidence(history));
  assert(hasPinnedPublicNativeShopEvidence(current));
  assert(!hasPinnedPublicNativeShopEvidence({...history}));
  assert.equal(history.snapshotKey,'Shop20260715');
  assert.equal(current.snapshotKey,'Shop20261118');
  assert.equal(history.offers.length,27);
  assert.equal(history.origins.length,128);
  assert.equal(history.campaigns.length,27);
  assert.equal(history.coverage.sourceOffers,27);
  assert.equal(history.coverage.sourceItemOccurrences,128);
  assert.equal(history.coverage.distinctSourceItemIds,120);
  assert.equal(history.coverage.fullGameVersionVerified,false);
  assert.equal(current.coverage.fullGameVersionVerified,true);
  assert.equal(history.coverage.accountOwnershipVerified,false);
  assert.equal(history.coverage.currentAvailabilityVerified,false);
  let items=0;
  for(const offer of history.offers){
    const refs=history.getOfferOrigins(offer.nativeOfferId);
    assert(Object.isFrozen(offer));
    assert(Object.isFrozen(offer.components));
    assert.equal(refs.length,offer.components.length);
    assert.equal(offer.configuredAllocationTotal,
      offer.components.reduce((sum,p)=>sum+p.componentMoonstoneAllocation,0));
    for(let i=0;i<refs.length;i++){
      const row=refs[i],source=offer.components[i];items++;
      assert.equal(row.itemId,source.itemId);
      assert.equal(row.quantity,source.quantity);
      assert.equal(row.productId,offer.nativeOfferId);
      assert.equal(row.kind,'premium_shop');
      assert.equal(row.routeStatus,'confirmed_source_link');
      assert.equal(row.availability,'not_live_verified');
      assert.equal(row.source.gameVersion,null);
      assert.equal(row.window.endExclusive,'2026-07-22T13:00:00Z');
      assert(row.conditions.some(c=>c.includes('original game build')&&
        c.includes('NOT verified')));
      assert(row.originId.startsWith('db02:shop:Shop20260715:'));
      assert(history.getItemCandidates(row.itemId).includes(row));
      assert(Object.isFrozen(row));
      if(offer.saleDiscountPercent===null){
        assert.equal(row.price?.quantity,offer.configuredAllocationTotal);
      }else assert.equal(row.price,null);
    }
  }
  assert.equal(items,128);
  assert.equal(history.getOffer('HouseSkin_FishermandHouse')
    ?.components[0].itemId,'20500136');
  assert.equal(history.getOffer('Bundle_BayouToolSet')?.saleDiscountPercent,20);
  assert.equal(history.getOffer('HeroItem_FieryRaven')?.saleDiscountPercent,20);
  assert.equal(history.getOfferOrigins('Bundle_BayouToolSet')[0].price,null);
  assert.equal(history.getOfferOrigins('does-not-exist').length,0);
  assert.equal(history.getItemCandidates('invalid').length,0);
  // Some historical products share offer IDs with November; route IDs
  // are disjoint by native snapshot ID and never overwrite prior observations.
  const overlap='Bundle_Rajah';
  assert(history.getOffer(overlap));
  assert(current.getOffer(overlap));
  assert.notEqual(history.getOfferOrigins(overlap)[0].originId,
    current.getOfferOrigins(overlap)[0].originId);
  assert.equal(history.getOfferOrigins(overlap)[0].campaignId,
    'native-shop:Shop20260715:'+overlap);
});
test('historic and current source readers fail closed on damaged bytes or forged evidence',async()=>{
  const broken=Buffer.from(historical);broken[250]^=1;
  await assert.rejects(loadPinnedHistoricalNativeShopSnapshot('/Wand',
    async()=>new Response(broken,{status:200})),/PROJECTION_SHA/);
  await assert.rejects(loadPinnedHistoricalNativeShopSnapshot('/Wand',
    async()=>new Response(historical.subarray(1),{status:200})),/PROJECTION_SIZE/);
  const index=await loadPinnedHistoricalNativeShopSnapshot('/Wand',fetcher);
  const guideFetcher=async url=>{
    try{return new Response(readFileSync(new URL(
      '../static/'+String(url).replace(/^\/Wand\//,''),
      import.meta.url
    )),{status:200});}
    catch{return new Response('missing',{status:404});}
  };
  await assert.rejects(loadUnifiedAcquisitionOriginDatabase(
    guideFetcher,null,'/Wand',[],null,null,null,null,null,{...index}
  ),/DB02_PINNED_HISTORICAL_NATIVE_SHOP_REQUIRED/);
  const never=async()=>{throw Error('NO_FETCH');};
  await assert.rejects(loadPinnedHistoricalNativeShopSnapshot('/Wand/../secret',never),
    /INVALID_BASE_PATH/);
});
