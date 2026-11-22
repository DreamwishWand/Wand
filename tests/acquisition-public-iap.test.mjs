import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_PUBLIC_IAP_BYTES,DB02_PUBLIC_IAP_FILE,DB02_PUBLIC_IAP_SHA,
  hasPinnedPublicIapEvidence,loadPinnedPublicIapSource
} from '../src/lib/acquisition/public-static-iap.ts';
import {loadUnifiedAcquisitionOriginDatabase} from '../src/lib/acquisition/origins.ts';

const path=new URL('../static/acquisition/public/'+DB02_PUBLIC_IAP_FILE,import.meta.url);
const file=readFileSync(path);
const fetcher=async url=>{
  assert.equal(url,'/Wand/acquisition/public/iap-rewards-1.26.2.json');
  return new Response(file,{status:200});
};
test('published 1.26.2-compatible IAP projection matches its exact source and public SHA',()=>{
  assert.equal(file.byteLength,DB02_PUBLIC_IAP_BYTES);
  assert.equal(createHash('sha256').update(file).digest('hex'),DB02_PUBLIC_IAP_SHA);
  const data=JSON.parse(file.toString('utf8'));
  assert.deepEqual(Object.keys(data).sort(),
    ['coverage','packages','schema','source','target']);
  assert.equal(data.source.originalProtoDbSha256,
    'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623');
  assert.equal(data.source.originalProtoDbBytes,1335720);
  assert.equal(data.source.originalSourceGameVersion,'1.26.1');
  assert.equal(data.source.originalFileEquivalentTo1262,true);
  assert.equal(data.source.accountEntitlementVerified,false);
  assert.equal(data.source.currentStorefrontAvailabilityVerified,false);
  assert.equal(data.source.nestedRewardExpansionVerified,false);
  assert.equal(data.coverage.embeddedPromoCodeRecords,0);
  assert.equal(data.coverage.embeddedOnlineMessageRecords,0);
  assert(!('Data' in data));
  assert(!('userId' in data)&&!('profile' in data)&&!('receipt' in data));
});
test('53 native IAP packages retain 291 exact direct/extended Item-ID links and package flags',async()=>{
  const x=await loadPinnedPublicIapSource('/Wand',fetcher);
  assert(hasPinnedPublicIapEvidence(x));
  assert(!hasPinnedPublicIapEvidence({...x}));
  assert.equal(x.packages.length,53);
  assert.equal(x.origins.length,291);
  assert.equal(x.campaigns.length,53);
  assert.equal(x.coverage.directRewardReferences,150);
  assert.equal(x.coverage.extendedRewardReferences,141);
  assert.equal(x.coverage.distinctRewardItemIds,158);
  assert.equal(x.coverage.nestedPackageReferences,3);
  assert.equal(x.coverage.accountEntitlementVerified,false);
  assert.equal(x.coverage.onlineSyncVerified,false);
  assert.equal(x.coverage.nestedRewardsExpanded,false);
  let direct=0,extended=0,nested=0;
  for(const pack of x.packages){
    assert(Object.isFrozen(pack)&&Object.isFrozen(pack.rewards));
    assert(Object.isFrozen(pack.directRewards)&&Object.isFrozen(pack.extendedRewards));
    assert.equal(pack.rewards.length,pack.directRewards.length+pack.extendedRewards.length);
    if(pack.nestedPackageId!==null)nested++;
    const origins=x.getPackageOrigins(pack.nativePackageId);
    assert.equal(origins.length,pack.rewards.length);
    for(const row of origins){
      assert.equal(row.kind,'purchase_bonus');
      assert.equal(row.routeStatus,'confirmed_source_link');
      assert.equal(row.availability,'not_live_verified');
      assert.equal(row.price,null);
      assert.equal(row.campaignId,'native-iap:'+pack.nativePackageId);
      assert.equal(row.productId,pack.nativePackageId);
      assert.equal(row.source.kind,'verified_game_native');
      assert(row.conditions.some(v=>v.includes('not proof of a grant')));
      assert(x.getItemOrigins(row.itemId).includes(row));
      assert(Object.isFrozen(row));
    }
    direct+=pack.directRewards.length;
    extended+=pack.extendedRewards.length;
    assert(x.campaigns.some(c=>c.campaignId==='native-iap:'+pack.nativePackageId&&
      c.rewards.length===pack.rewards.length));
  }
  assert.equal(direct,150);assert.equal(extended,141);assert.equal(nested,3);
  const deluxe=x.getPackage('Expansion4PackDeluxeEdition');
  assert(deluxe);
  assert.equal(deluxe.sourceRecordName,'DeluxeEditionExpansion4');
  assert.equal(deluxe.associatedExpansion,'Expansion04');
  assert.equal(deluxe.ownershipCheckRequired,true);
  assert.equal(deluxe.rewards.length,5);
  assert(x.getPackageOrigins(deluxe.nativePackageId).some(o=>
    o.itemId==='10000049'&&o.quantity===1&&
    o.conditions.some(v=>v.includes('IAPData.Rewards[9]'))));
  const seasonal=x.getPackage('SeasonalPackUpd25MegaPack');
  assert(seasonal);
  assert.equal(seasonal.directRewards.length,0);
  assert.equal(seasonal.extendedRewards.length,5);
  assert(x.getPackageOrigins(seasonal.nativePackageId).every(o=>
    o.conditions.some(v=>v.includes('IAPData.Extended[10].Rewards[3]'))));
  const nestedPack=x.getPackage('FoundersPackDeluxe');
  assert(nestedPack);
  assert.equal(nestedPack.isLocalEntitlement,true);
  assert.equal(nestedPack.nestedPackageId,'FoundersPackBaseGame');
  assert(!x.getPackageOrigins(nestedPack.nativePackageId).some(o=>
    o.originId.includes('FoundersPackBaseGame')));
  assert.equal(x.getPackage('missing'),null);
  assert.equal(x.getPackageOrigins('missing').length,0);
  assert.equal(x.getItemOrigins('no such item').length,0);
});
test('pinned native IAP source rejects tampered data, unsafe paths and forged ledger evidence',async()=>{
  const corrupted=Buffer.from(file);corrupted[300]^=1;
  await assert.rejects(loadPinnedPublicIapSource('/Wand',
    async()=>new Response(corrupted,{status:200})),/PUBLIC_SHA/);
  await assert.rejects(loadPinnedPublicIapSource('/Wand',
    async()=>new Response(file.subarray(0,-1),{status:200})),/PUBLIC_SIZE/);
  const proof=await loadPinnedPublicIapSource('/Wand',fetcher);
  const guideFetcher=async url=>{
    try{return new Response(readFileSync(
      new URL('../static/'+String(url).replace(/^\/Wand\//,''),import.meta.url)
    ),{status:200});}
    catch{return new Response('missing',{status:404});}
  };
  await assert.rejects(loadUnifiedAcquisitionOriginDatabase(
    guideFetcher,null,'/Wand',[],null,null,null,null,{...proof}
  ),/DB02_PINNED_PUBLIC_IAP_REQUIRED/);
  const never=async()=>{throw Error('NO_FETCH');};
  await assert.rejects(loadPinnedPublicIapSource('/Wand/../hidden',never),
    /INVALID_BASE_PATH/);
  await assert.rejects(loadPinnedPublicIapSource('//Wand',never),
    /INVALID_BASE_PATH/);
});
