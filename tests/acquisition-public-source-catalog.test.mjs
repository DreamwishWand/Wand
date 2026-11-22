import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  loadPublicSourceCatalog,
  DB02_PUBLIC_SOURCE_CATALOG_SCHEMA
} from '../src/lib/acquisition/public-source-catalog.ts';

const STATIC=new URL('../static/',import.meta.url);
function publicFetcher(options={}){
  const seen=[];
  const fetcher=async url=>{
    assert.equal(typeof url,'string');
    assert(url.startsWith('/Wand/'),url);
    assert(!url.includes('owner-local')&&!url.includes('.zip')&&!url.includes('private'),url);
    seen.push(url);
    const relative=url.slice('/Wand/'.length);
    let bytes;
    try{bytes=readFileSync(new URL(relative,STATIC));}
    catch{return new Response('not found',{status:404});}
    if(options.corrupt&&relative.endsWith(options.corrupt)){
      bytes=Buffer.from(bytes);bytes[100]^=1;
    }
    return new Response(bytes,{status:200});
  };
  return {seen,fetcher};
}
test('Complete public Steam 1.26.2 DB-02 catalog joins 1127 source-pinned Star Path, Quest, Event, Friendship, Shop and IAP rewards without a private ZIP',async()=>{
  const {seen,fetcher}=publicFetcher();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  assert.equal(catalog.schema,DB02_PUBLIC_SOURCE_CATALOG_SCHEMA);
  assert.equal(catalog.gameVersion,'1.26.2');
  assert.equal(catalog.coverage.publishedItemDefinitions,13202);
  assert.equal(catalog.coverage.starPathSourceRoutes,67);
  assert.equal(catalog.coverage.questSourceRoutes,395);
  assert.equal(catalog.coverage.nativeEventSourceRoutes,202);
  assert.equal(catalog.coverage.defaultFriendshipSourceRoutes,16);
  assert.equal(catalog.coverage.nativeShopOffers,29);
  assert.equal(catalog.coverage.nativeShopSourceRoutes,156);
  assert.equal(catalog.coverage.nativeShopDistinctItemIds,136);
  assert.equal(catalog.coverage.nativeIapPackages,53);
  assert.equal(catalog.coverage.nativeIapDirectRewardRoutes,150);
  assert.equal(catalog.coverage.nativeIapExtendedRewardRoutes,141);
  assert.equal(catalog.coverage.nativeIapSourceRoutes,291);
  assert.equal(catalog.coverage.combinedSourceRoutes,1127);
  assert.equal(catalog.origins.getCoverage().linkedRoutes,1127);
  assert.equal(catalog.origins.getCoverage().routesBySourceKind.verified_game_native,904);
  assert.equal(catalog.origins.getCoverage().routesBySourceKind.verified_liveops_cache,223);
  assert.equal(catalog.eventFriendshipSource.origins.length,218);
  assert.equal(catalog.coverage.liveOfferAvailabilityVerified,false);
  assert.equal(catalog.coverage.sourceCoverageComplete,false);
  assert.equal(catalog.coverage.requiresPrivateGameArchive,false);
  assert.equal(catalog.coverage.verifiedOnlineNameAcquisitionLinks,0);
  assert.equal(catalog.questSource.coverage.totalItemOriginCandidates,395);
  assert.equal(catalog.coverage.linkedPublishedItemIds+
    catalog.coverage.linkedOutsidePublishedItemIds,
    catalog.coverage.allSourceLinkedItemIds);
  const urlList=new Set(seen);
  assert.equal(seen.length,22); // pointer + index + 14 shards + 4 Guide + Shop + IAP
  assert.equal(urlList.size,22);
  assert(seen.some(s=>s.endsWith('/iap-rewards-1.26.2.json')));
  assert(seen.some(s=>s.endsWith('/shop-cache-2026-11-22.json')));
  assert(seen.some(s=>s.endsWith('/event-friendship-rewards-1.26.2.json')));
  assert(seen.some(s=>s.endsWith('/quest-rewards-1.26.2.json')));
  assert(seen.some(s=>s.endsWith('/starpath-cache-2026-11-22.json')));
  assert(seen.some(s=>s.endsWith('/items-013.json')));
  assert(Object.isFrozen(catalog));
  assert(Object.isFrozen(catalog.coverage));
});
test('Unified lookup separates exact Quest, Event and Friendship Item ID routes from online name-only candidates',async()=>{
  const {fetcher}=publicFetcher();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  const currency=catalog.lookup('80000000');
  assert.equal(currency.catalogClassification,'outside_published_db00_item_scope');
  const questCurrency=currency.origins.find(r=>
    r.originId==='db03:public:quest:2070000672:currency:80000000');
  assert(questCurrency);
  assert.equal(questCurrency.kind,'quest_reward');
  assert.equal(questCurrency.routeStatus,'static_candidate_only');
  assert.equal(questCurrency.quantity,null);
  assert(questCurrency.conditions.some(c=>
    c.includes('Configured currency amount range: 500–500')));
  assert.equal(catalog.getSourceOrigin(questCurrency.originId)[0],questCurrency);
  const defaultFriendship=catalog.lookup('80100000').origins.filter(r=>
    r.kind==='friendship_reward');
  assert(defaultFriendship.length>0);
  assert(defaultFriendship.every(r=>
    r.routeStatus==='static_candidate_only'&&r.availability==='not_live_verified'&&
    r.conditions.some(x=>x.includes('no character-specific link'))));
  const haunting=catalog.eventFriendshipSource.getEventCandidates(
    'floating_festival','HauntedFloatingFestival2026');
  assert.equal(haunting.length,9);
  for(const reward of haunting){
    assert(catalog.lookup(reward.itemId).origins.includes(reward));
    assert.equal(catalog.getSourceOrigin(reward.originId)[0],reward);
    assert.equal(reward.kind,'event_reward');
    assert.equal(reward.routeStatus,'static_candidate_only');
    assert.equal(reward.availability,'not_live_verified');
  }
  const nativeShop=catalog.nativeShopSource.getOffer('Bundle_MickeyAndFriendsCelebrationHouses');
  assert(nativeShop);
  assert.equal(nativeShop.components.length,5);
  assert.equal(nativeShop.configuredAllocationTotal,4000);
  const shopOrigin=catalog.lookup('170600007').origins.find(r=>
    r.campaignId==='native-shop:Shop20261118:Bundle_MickeyAndFriendsCelebrationHouses');
  assert(shopOrigin);
  assert.equal(shopOrigin.kind,'premium_shop');
  assert.equal(shopOrigin.routeStatus,'confirmed_source_link');
  assert.equal(shopOrigin.productId,'Bundle_MickeyAndFriendsCelebrationHouses');
  assert.equal(shopOrigin.price?.quantity,4000);
  assert.equal(shopOrigin.availability,'not_live_verified');
  assert.equal(catalog.getSourceOrigin(shopOrigin.originId)[0],shopOrigin);
  assert(catalog.getCampaign(shopOrigin.campaignId)?.rewards.some(r=>
    r.itemId==='170600007'&&r.quantity===1));
  const discounted=catalog.nativeShopSource.getOfferOrigins('Bundle_DonutDuo');
  assert.equal(discounted.length,2);
  assert(discounted.every(r=>r.price===null&&r.conditions.some(x=>
    x.includes('discount: 10%'))));
  const iap=catalog.nativeIapSource.getPackage('Expansion4PackDeluxeEdition');
  assert(iap);
  assert.equal(iap.rewards.length,5);
  const iapOrigin=catalog.lookup('10000049').origins.find(o=>
    o.campaignId==='native-iap:Expansion4PackDeluxeEdition');
  assert(iapOrigin);
  assert.equal(iapOrigin.kind,'purchase_bonus');
  assert.equal(iapOrigin.routeStatus,'confirmed_source_link');
  assert.equal(iapOrigin.availability,'not_live_verified');
  assert.equal(catalog.getSourceOrigin(iapOrigin.originId)[0],iapOrigin);
  assert(catalog.getCampaign(iapOrigin.campaignId)?.rewards.some(r=>
    r.itemId==='10000049'&&r.quantity===1));
  const extended=catalog.nativeIapSource.getPackageOrigins('SeasonalPackUpd25MegaPack');
  assert.equal(extended.length,5);
  assert(extended.every(r=>r.conditions.some(c=>
    c.includes('IAPData.Extended[10].Rewards[3]'))));
  const twitch=catalog.lookup('50400102');
  assert(twitch.catalogItem);
  assert(twitch.onlineNameCandidates.some(c=>
    c.kind==='official_campaign_name_candidate'&&
    c.campaignId==='twitch:2023-launch'&&
    c.rewardName==='Gamer Mickey Ears Headband'&&
    c.acquisitionLinkVerified===false));
  assert(!twitch.origins.some(o=>o.kind==='twitch_drop'));
  const shop=catalog.lookup('40001849');
  assert.equal(shop.onlineNameCandidates.filter(c=>
    c.kind==='community_premium_shop_name_candidate'&&
    c.productName==='Enchanted Ice Fountain').length,2);
  assert(shop.onlineNameCandidates.every(c=>c.currentAvailabilityVerified===false));
  assert.equal(catalog.getCampaign('code:DDVPRIDE2026')?.kind,'redeem_code');
  assert(Object.isFrozen(shop));
  assert(Object.isFrozen(shop.onlineNameCandidates));
  assert.throws(()=>catalog.lookup('00080000000'),/INVALID_ITEM_ID/);
});
test('Public-only startup rejects corrupt source-pinned DB-00 and Guide bytes; unsafe bases never trigger downloads',async()=>{
  await assert.rejects(loadPublicSourceCatalog(
    '/Wand',publicFetcher({corrupt:'items-012.json'}).fetcher
  ),/SHA-256 mismatch/);
  await assert.rejects(loadPublicSourceCatalog(
    '/Wand',publicFetcher({corrupt:'quest-rewards-1.26.2.json'}).fetcher
  ),/PUBLISHED_SHA_MISMATCH/);
  await assert.rejects(loadPublicSourceCatalog(
    '/Wand',publicFetcher({corrupt:'starpath-cache-2026-11-22.json'}).fetcher
  ),/fingerprint mismatch/);
  await assert.rejects(loadPublicSourceCatalog(
    '/Wand',publicFetcher({corrupt:'event-friendship-rewards-1.26.2.json'}).fetcher
  ),/PUBLIC_SHA/);
  await assert.rejects(loadPublicSourceCatalog(
    '/Wand',publicFetcher({corrupt:'shop-cache-2026-11-22.json'}).fetcher
  ),/PROJECTION_SHA/);
  await assert.rejects(loadPublicSourceCatalog(
    '/Wand',publicFetcher({corrupt:'iap-rewards-1.26.2.json'}).fetcher
  ),/PUBLIC_SHA/);
  const noFetch=async()=>{throw new Error('SHOULD_NOT_FETCH');};
  await assert.rejects(loadPublicSourceCatalog('/Wand/../exfil',noFetch),
    /INVALID_BASE_PATH/);
  await assert.rejects(loadPublicSourceCatalog('//Wand',noFetch),
    /INVALID_BASE_PATH/);
});
