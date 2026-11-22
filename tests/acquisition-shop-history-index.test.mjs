import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  loadPinnedPublicNativeShopSnapshot,
  loadPinnedHistoricalNativeShopSnapshot
} from '../src/lib/acquisition/public-native-shop.ts';
import {
  DB02_SHOP_HISTORY_SCHEMA,indexNativeShopHistory
} from '../src/lib/acquisition/shop-history-index.ts';

const files=new Map([
  ['shop-cache-2026-07-15.json',readFileSync(
    new URL('../static/acquisition/public/shop-cache-2026-07-15.json',import.meta.url))],
  ['shop-cache-2026-11-22.json',readFileSync(
    new URL('../static/acquisition/public/shop-cache-2026-11-22.json',import.meta.url))]
]);
const fetcher=async url=>{
  assert(url.startsWith('/Wand/acquisition/public/'));
  const name=url.split('/').at(-1);
  const data=files.get(name);
  return data?new Response(data,{status:200}):new Response('not found',{status:404});
};
async function load(){
  const [november,july]=await Promise.all([
    loadPinnedPublicNativeShopSnapshot('/Wand',fetcher),
    loadPinnedHistoricalNativeShopSnapshot('/Wand',fetcher)
  ]);
  return {november,july,index:indexNativeShopHistory(november,july)};
}

test('Shop history indexes 56 source appearances, 48 native IDs and 186 unique Item IDs',async()=>{
  const {index,november,july}=await load();
  assert.equal(index.schema,DB02_SHOP_HISTORY_SCHEMA);
  assert.equal(index.sourceIntegrity,'both_native_shop_projections_sha_pinned');
  assert.equal(index.coverage.observedSnapshots,2);
  assert.equal(index.coverage.observedOffers,56);
  assert.equal(index.coverage.distinctNativeOfferIds,48);
  assert.equal(index.coverage.repeatedNativeOfferIds,8);
  assert.equal(index.coverage.componentOccurrences,284);
  assert.equal(index.coverage.distinctItemIds,186);
  assert.equal(index.coverage.julyItemIdsAbsentFromNovember,50);
  assert.equal(index.coverage.novemberItemIdsAbsentFromJuly,66);
  assert.equal(index.coverage.fullHistoryVerified,false);
  assert.equal(index.coverage.liveAvailabilityVerified,false);
  assert.equal(index.coverage.ownedEntitlementsVerified,false);
  assert.equal(index.coverage.checkoutPriceVerified,false);
  assert.equal(index.coverage.julyFullGameVersionVerified,false);
  assert(Object.isFrozen(index));
  assert(Object.isFrozen(index.offers));
  assert(Object.isFrozen(index.repeatedOffers));
  assert.equal(index.offers.length,48);
  assert.equal(index.repeatedOffers.length,8);
  const source=new Set([...july.origins,...november.origins]);
  let counted=0;
  for(const entry of index.offers){
    assert(Object.isFrozen(entry));
    assert(Object.isFrozen(entry.appearances));
    assert.equal(index.getOfferHistory(entry.nativeOfferId),entry);
    assert.equal(entry.idObservedInMultipleSnapshots,entry.appearances.length===2);
    for(const a of entry.appearances){
      counted++;
      assert.equal(index.getOfferAppearance(a.snapshotKey,a.nativeOfferId),a);
      assert.equal(a.availability,'not_live_verified');
      assert.equal(a.source.kind,'verified_liveops_cache');
      assert.equal(a.observedWindow,a.offer.observedWindow);
      assert(Object.isFrozen(a));
      for(const item of a.origins){
        assert(source.has(item)); // no newly invented grants
        assert(index.getItemOrigins(item.itemId).includes(item));
        assert(index.getItemHistory(item.itemId)?.origins.includes(item));
      }
    }
  }
  assert.equal(counted,56);
  assert.equal(index.getOfferHistory('not-an-offer'),null);
  assert.equal(index.getOfferAppearance('Shop20260715','missing'),null);
  assert.equal(index.getItemOrigins('invalid').length,0);
  assert.equal(index.getItemHistory('invalid'),null);
  assert.equal(index.getItemHistory(98765432123456789),null);
});
test('8 offer IDs recur, three Vanity bundles change reward contents despite same offer ID',async()=>{
  const {index}=await load();
  const reused=[
    'Bundle_Max','Bundle_Rajah','DreamBundleBeautyAndTheBeast_0003',
    'DreamBundleUrsula_0002','DreamBundleWallE_0001',
    'VanityBundle_0001','VanityBundle_0002','VanityBundle_0003'
  ];
  assert.deepEqual(index.repeatedOffers.map(x=>x.nativeOfferId).sort(),reused.sort());
  for(const entry of index.repeatedOffers){
    assert.equal(entry.appearances.length,2);
    assert.equal(entry.appearances[0].snapshotKey,'Shop20260715');
    assert.equal(entry.appearances[1].snapshotKey,'Shop20261118');
    assert.equal(entry.appearances[0].sourceGameVersion,null);
    assert.equal(entry.appearances[0].evidenceKind,'archived_minimum_version_only');
    assert.equal(entry.appearances[1].sourceGameVersion,'1.26.2');
    assert.equal(entry.appearances[1].evidenceKind,'steam_1262_snapshot');
    if(entry.nativeOfferId.startsWith('VanityBundle')){
      assert.equal(entry.identicalRewardContentsAcrossSnapshots,false);
      assert.equal(entry.identicalConfiguredPriceAllocationsAcrossSnapshots,false);
    }else{
      assert.equal(entry.identicalRewardContentsAcrossSnapshots,true);
      assert.equal(entry.identicalConfiguredPriceAllocationsAcrossSnapshots,true);
    }
    assert.equal(entry.appearances[0].configuredAllocationTotal,4000*
      Number(entry.nativeOfferId==='Bundle_Rajah')+
      4500*Number(entry.nativeOfferId==='Bundle_Max')+
      4000*Number(entry.nativeOfferId.startsWith('DreamBundle')||
        entry.nativeOfferId.startsWith('VanityBundle')));
  }
  for(const [offerId,julySlots,novemberSlots] of [
    ['VanityBundle_0001',16,17],['VanityBundle_0002',18,19],
    ['VanityBundle_0003',20,21]
  ]){
    const history=index.getOfferHistory(offerId);
    assert(history);
    assert.deepEqual(history.appearances.map(a=>a.origins.length),
      [julySlots,novemberSlots]);
    assert.deepEqual(history.appearances.map(a=>a.configuredAllocationTotal),
      [4000,4000]);
  }
  assert.equal(index.getOfferHistory('Bundle_Rajah')
    ?.firstObservedWindow.start,'2026-07-15T13:00:00.632653200Z');
  assert.equal(index.getOfferHistory('Bundle_Rajah')
    ?.lastObservedWindow.endExclusive,'2026-11-25T14:00:00Z');
});
test('per-item history preserves observation dates, component quantities and repeat slots',async()=>{
  const {index,july,november}=await load();
  const sourceIds=new Set([...july.origins,...november.origins].map(x=>x.itemId));
  let observed=0;
  for(const id of sourceIds){
    const h=index.getItemHistory(id);
    assert(h);
    assert.equal(h.itemId,id);
    assert(Object.isFrozen(h));
    assert(Object.isFrozen(h.origins));
    assert(Object.isFrozen(h.observedNativeOfferIds));
    assert(Object.isFrozen(h.observedSnapshotKeys));
    assert.equal(h.observedComponentOccurrences,h.origins.length);
    assert.equal(h.distinctOfferIds,h.observedNativeOfferIds.length);
    assert(h.origins.every(o=>
      h.observedNativeOfferIds.includes(o.productId)&&
      h.observedSnapshotKeys.some(k=>o.originId.includes(':shop:'+k+':'))));
    observed+=h.origins.length;
    assert.equal(index.getItemHistory(Number(id)),h);
  }
  assert.equal(sourceIds.size,186);
  assert.equal(observed,284);
  const historic=index.getItemHistory('20500136');
  assert(historic);
  assert(historic.observedSnapshotKeys.includes('Shop20260715'));
  assert(historic.origins.some(x=>x.productId==='HouseSkin_FishermandHouse'));
  assert(!historic.origins.some(x=>x.availability!=='not_live_verified'));
});
test('history index refuses forged source objects, reversed inputs and missing evidence',async()=>{
  const {july,november}=await load();
  assert.throws(()=>indexNativeShopHistory(july,november),
    /TWO_PINNED_NATIVE_SNAPSHOTS_REQUIRED/);
  assert.throws(()=>indexNativeShopHistory({...november},july),
    /TWO_PINNED_NATIVE_SNAPSHOTS_REQUIRED/);
  assert.throws(()=>indexNativeShopHistory(november,{...july}),
    /TWO_PINNED_NATIVE_SNAPSHOTS_REQUIRED/);
});
