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
test('Complete public Steam 1.26.2 DB-02 catalog joins all 462 source-pinned Star Path and Quest slots without a private ZIP',async()=>{
  const {seen,fetcher}=publicFetcher();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  assert.equal(catalog.schema,DB02_PUBLIC_SOURCE_CATALOG_SCHEMA);
  assert.equal(catalog.gameVersion,'1.26.2');
  assert.equal(catalog.coverage.publishedItemDefinitions,13202);
  assert.equal(catalog.coverage.starPathSourceRoutes,67);
  assert.equal(catalog.coverage.questSourceRoutes,395);
  assert.equal(catalog.coverage.combinedSourceRoutes,462);
  assert.equal(catalog.origins.getCoverage().linkedRoutes,462);
  assert.equal(catalog.coverage.liveOfferAvailabilityVerified,false);
  assert.equal(catalog.coverage.sourceCoverageComplete,false);
  assert.equal(catalog.coverage.requiresPrivateGameArchive,false);
  assert.equal(catalog.coverage.verifiedOnlineNameAcquisitionLinks,0);
  assert.equal(catalog.questSource.coverage.totalItemOriginCandidates,395);
  assert.equal(catalog.coverage.linkedPublishedItemIds+
    catalog.coverage.linkedOutsidePublishedItemIds,
    catalog.coverage.allSourceLinkedItemIds);
  const urlList=new Set(seen);
  assert.equal(seen.length,19); // pointer + index + 14 source SHA shards + 3 DB-03 assets
  assert.equal(urlList.size,19);
  assert(seen.some(s=>s.endsWith('/quest-rewards-1.26.2.json')));
  assert(seen.some(s=>s.endsWith('/starpath-cache-2026-11-22.json')));
  assert(seen.some(s=>s.endsWith('/items-013.json')));
  assert(Object.isFrozen(catalog));
  assert(Object.isFrozen(catalog.coverage));
});
test('Unified lookup separates exact Quest reward Item ID routes and online name-only candidates',async()=>{
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
  ),/hash|SHA|digest|pinned|source|integrity/i);
  const noFetch=async()=>{throw new Error('SHOULD_NOT_FETCH');};
  await assert.rejects(loadPublicSourceCatalog('/Wand/../exfil',noFetch),
    /INVALID_BASE_PATH/);
  await assert.rejects(loadPublicSourceCatalog('//Wand',noFetch),
    /INVALID_BASE_PATH/);
});
