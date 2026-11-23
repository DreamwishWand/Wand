import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  openPublicSharedGameSources,DB00_PUBLIC_SOURCES_SCHEMA
} from '../src/lib/game-db/public-sources.ts';

const root=new URL('../static/',import.meta.url);
function publicFetcher(corrupt=''){
  const calls=[];
  const fetcher=async url=>{
    assert.equal(typeof url,'string');
    assert(url.startsWith('/Wand/')&&!url.includes('..')&&!url.includes('.zip'),url);
    calls.push(url);
    let raw;
    try{raw=readFileSync(new URL(url.slice('/Wand/'.length),root));}
    catch{return new Response('not found',{status:404});}
    if(corrupt&&url.endsWith(corrupt)){
      raw=Buffer.from(raw);raw[100]^=1;
    }
    return new Response(raw,{status:200});
  };
  return {fetcher,calls};
}
test('one public shared DB-00 API joins all 1255 published source routes, with 26 distinct requests',async()=>{
  const {fetcher,calls}=publicFetcher();
  const app=await openPublicSharedGameSources('/Wand',fetcher);
  assert.equal(app.schema,DB00_PUBLIC_SOURCES_SCHEMA);
  assert.equal(app.snapshotId,'steam-1.26.2-native-itemlist-v1');
  assert.equal(app.database.itemCount,13202);
  assert.equal(app.acquisition.coverage.combinedSourceRoutes,1255);
  assert.equal(app.acquisition.coverage.staticContainerCandidateRoutes,146);
  assert.equal(app.acquisition.staticContainerSource.coverage.distinctItemIds,115);
  assert(app.acquisition.lookup('31500006').staticContainerCandidates.length>=3);
  assert(app.acquisition.lookup('31500006').staticContainerCandidates.every(x=>
    x.routeStatus==='static_candidate_only'));

  assert.equal(app.acquisition.nativeIapPackReferences.coverage.totalPackReferences,6);
  assert.equal(app.acquisition.nativeIapPackReferences
    .getAdditionalForMarketplace('Expansion4PackDeluxeEdition',5).length,0);
  assert.equal(app.guide.evidence.integrity,'pinned_public_sha256');
  assert.equal(app.hasPrivateGameSource,false);
  assert.equal(app.currentAvailabilityVerified,false);
  assert.equal(app.playerOwnershipVerified,false);
  assert.equal(calls.length,26);
  assert.equal(new Set(calls).size,26);
  assert.equal(calls.filter(x=>x.endsWith('/active.json')).length,1);
  assert.equal(calls.filter(x=>x.endsWith('/starpath-cache-2026-11-22.json')).length,1);
  assert.equal(calls.filter(x=>x.endsWith('/items-013.json')).length,1);
  const item=app.getItem('170600007');
  assert.equal(item.itemId,'170600007');
  assert(item.origins.some(x=>
    x.campaignId==='native-shop:Shop20261118:Bundle_MickeyAndFriendsCelebrationHouses'));
  assert(item.origins.every(x=>x.availability==='not_live_verified'));
  assert.equal(item.nativeTags.status,item.catalog?'not_loaded':'outside_scope');
  assert.equal(item.starpathRewardsOnlyConfigured,true);
  assert.equal(item.currentlyAvailableVerified,false);
  const iap=app.getItem('10000049');
  assert(iap.origins.some(x=>x.kind==='purchase_bonus'));
  const outside=app.getItem('80000000');
  assert.equal(outside.catalogStatus,'outside_published_item_scope');
  assert(outside.origins.some(x=>x.kind==='quest_reward'));
  const rewardId=app.guide.itemIds[0];
  assert.deepEqual(app.getItem(rewardId).starpathRelations,
    app.guide.getItemRelations(rewardId));
  assert.equal(app.getItem(rewardId).playerOwnershipVerified,false);
  assert.equal(app.acquisition.lookup('50400102').onlineNameCandidates.some(x=>
    x.acquisitionLinkVerified===false),true);
  assert.equal(app.getItem('50400102').origins.some(x=>x.kind==='twitch_drop'),false,
    'name-only Twitch candidates must never become exact native ItemOrigin edges');
  assert.equal(app.summarizeFacet({scope:'current',field:'worlds'}).states.unverified,13202);
  assert.deepEqual(app.summarizeFacet({scope:'current',field:'worlds'}).values,[]);
  const page=app.queryItems([],{limit:2});
  assert.equal(page.items.length,2);
  assert.equal(page.total,13202);
  assert.deepEqual(app.getItems([rewardId,'99999999']).map(x=>x.itemId),
    [rewardId,'99999999']);
  assert.ok(Object.isFrozen(app));
  assert.ok(Object.isFrozen(item));
});

test('fresh calls do not share stale asset bytes; existing source SHA checks remain required',async()=>{
  const {fetcher,calls}=publicFetcher();
  await openPublicSharedGameSources('/Wand',fetcher);
  assert.equal(calls.length,26);
  await openPublicSharedGameSources('/Wand',fetcher);
  assert.equal(calls.length,52,'fetch deduplication is per call, not a persistent stale cache');
  await assert.rejects(
    openPublicSharedGameSources('/Wand',publicFetcher('items-012.json').fetcher),
    /SHA-256 mismatch/
  );
  await assert.rejects(
    openPublicSharedGameSources('/Wand',publicFetcher('starpath-cache-2026-11-22.json').fetcher),
    /fingerprint mismatch/
  );
  let attempted=0;
  const forbidden=async()=>{attempted++;throw Error('MUST_NOT_FETCH');};
  await assert.rejects(openPublicSharedGameSources('//Wand',forbidden),/INVALID_BASE_PATH/);
  await assert.rejects(openPublicSharedGameSources('/Wand/../private',forbidden),/INVALID_BASE_PATH/);
  assert.equal(attempted,0);
});
