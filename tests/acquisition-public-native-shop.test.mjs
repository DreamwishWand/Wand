import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  loadPinnedPublicNativeShopSnapshot,hasPinnedPublicNativeShopEvidence,
  DB02_NATIVE_SHOP_BYTES,DB02_NATIVE_SHOP_FILE,DB02_NATIVE_SHOP_SHA
} from '../src/lib/acquisition/public-native-shop.ts';
import {loadUnifiedAcquisitionOriginDatabase} from '../src/lib/acquisition/origins.ts';

const sourcePath=new URL('../static/acquisition/public/'+DB02_NATIVE_SHOP_FILE,import.meta.url);
const file=readFileSync(sourcePath);
const fetcher=async url=>{
  assert.equal(url,'/Wand/acquisition/public/shop-cache-2026-11-22.json');
  return new Response(file,{status:200});
};
test('actual public shop projection is the exact SHA-pinned, stripped game-derived snapshot',async()=>{
  assert.equal(file.length,DB02_NATIVE_SHOP_BYTES);
  assert.equal(createHash('sha256').update(file).digest('hex'),DB02_NATIVE_SHOP_SHA);
  const raw=JSON.parse(file.toString('utf8'));
  assert.deepEqual(Object.keys(raw).sort(),
    ['counts','offers','schema','source','target','window']);
  assert.equal(raw.source.originalSha256,
    '233c03e73d22503dba2f6b0961ecaa8f36ac7ef16848bb88c35e2d86f696b1ff');
  assert.equal(raw.source.originalBytes,72740);
  assert.equal(raw.source.snapshotKey,'Shop20261118');
  assert.equal(raw.source.currentAvailabilityVerified,false);
  assert.equal(raw.source.accountOwnershipVerified,false);
  assert.equal(raw.window.startUtc,'2026-11-18T14:00:00.098979Z');
  assert.equal(raw.window.endUtcExclusive,'2026-11-25T14:00:00Z');
  assert(!('Data' in raw));
  assert(!('userId' in raw)&&!('profile' in raw));
});
test('all 29 original offer IDs reverse-map 156 verified Item ID references without falsely asserting stock',async()=>{
  const index=await loadPinnedPublicNativeShopSnapshot('/Wand',fetcher);
  assert(hasPinnedPublicNativeShopEvidence(index));
  assert(!hasPinnedPublicNativeShopEvidence({...index}));
  assert.equal(index.offers.length,29);
  assert.equal(index.origins.length,156);
  assert.equal(index.campaigns.length,29);
  assert.equal(index.coverage.distinctSourceItemIds,136);
  assert.equal(index.coverage.sourceDiscountedOffers,2);
  assert.equal(index.coverage.historicalCoverageComplete,false);
  assert.equal(index.coverage.accountOwnershipVerified,false);
  assert.equal(index.coverage.currentAvailabilityVerified,false);
  const ids=new Set();
  let links=0;
  for(const offer of index.offers){
    assert(!ids.has(offer.nativeOfferId));ids.add(offer.nativeOfferId);
    assert(Object.isFrozen(offer.components));
    assert(Object.isFrozen(offer));
    const rows=index.getOfferOrigins(offer.nativeOfferId);
    assert.equal(rows.length,offer.components.length);
    assert.equal(offer.configuredAllocationTotal,
      offer.components.reduce((sum,item)=>sum+item.componentMoonstoneAllocation,0));
    for(let slot=0;slot<rows.length;slot++){
      const row=rows[slot],part=offer.components[slot];links++;
      assert.equal(row.itemId,part.itemId);
      assert.equal(row.quantity,part.quantity);
      assert.equal(row.productId,offer.nativeOfferId);
      assert.equal(row.kind,'premium_shop');
      assert.equal(row.routeStatus,'confirmed_source_link');
      assert.equal(row.availability,'not_live_verified');
      assert.equal(row.campaignId,'native-shop:Shop20261118:'+offer.nativeOfferId);
      assert(index.getItemCandidates(row.itemId).includes(row));
      assert(row.conditions.some(x=>x.includes('Original')||x.includes('original')||
        x.includes('Source stores.dat SHA-256')));
      assert(Object.isFrozen(row));
      if(offer.saleDiscountPercent===null){
        assert.equal(row.price?.quantity,offer.configuredAllocationTotal);
        assert.equal(row.price?.currencyItemId,'80100000');
      }else assert.equal(row.price,null);
    }
  }
  assert.equal(links,156);
  assert.equal(index.getOffer('Bundle_DonutDuo')?.configuredAllocationTotal,1000);
  assert.equal(index.getOffer('Bundle_DonutDuo')?.saleDiscountPercent,10);
  assert.equal(index.getOffer('Bundle_HoneyBee')?.saleDiscountPercent,20);
  assert.equal(index.getOffer('Bundle_MickeyAndFriendsCelebrationHouses')
    ?.configuredAllocationTotal,4000);
  assert.equal(index.getOfferOrigins('Bundle_PINK_DOES_NOT_EXIST').length,0);
  assert.equal(index.getItemCandidates('unknown').length,0);
});
test('rejects altered public bytes and refuses forged native-shop evidence in common ledger',async()=>{
  const corrupt=Buffer.from(file);corrupt[120]^=1;
  await assert.rejects(loadPinnedPublicNativeShopSnapshot('/Wand',
    async()=>new Response(corrupt,{status:200})),/PROJECTION_SHA/);
  await assert.rejects(loadPinnedPublicNativeShopSnapshot('/Wand',
    async()=>new Response(file.subarray(0,-1),{status:200})),/PROJECTION_SIZE/);
  const native=await loadPinnedPublicNativeShopSnapshot('/Wand',fetcher);
  assert(!hasPinnedPublicNativeShopEvidence({...native}));
  // The native-shop proof is branded. A structurally similar object is not accepted.
  const guideFetch=async url=>{
    const path=new URL('../static/'+String(url).replace(/^\/Wand\//,''),import.meta.url);
    try{return new Response(readFileSync(path),{status:200});}
    catch{return new Response('missing',{status:404});}
  };
  await assert.rejects(loadUnifiedAcquisitionOriginDatabase(
    guideFetch,null,'/Wand',[],null,null,null,{...native}
  ),/DB02_PINNED_PUBLIC_NATIVE_SHOP_REQUIRED/);
  const noFetch=async()=>{throw Error('FETCH_SHOULD_NOT_RUN');};
  await assert.rejects(loadPinnedPublicNativeShopSnapshot('/Wand/../secret',noFetch),
    /INVALID_BASE_PATH/);
});
