import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  loadPublicSourceCatalog
} from '../src/lib/acquisition/public-source-catalog.ts';
import {
  indexGameNativeItemCategories,hasGameNativeItemCategoryEvidence,
  DB02_GAME_NATIVE_ITEM_CATEGORIES_SCHEMA
} from '../src/lib/acquisition/game-native-item-categories.ts';

const STATIC=new URL('../static/',import.meta.url);
function publicFetcher(){
  const calls=[];
  return {calls,fetcher:async url=>{
    assert(url.startsWith('/Wand/')&&!url.includes('..'),url);
    calls.push(url);
    try{return new Response(readFileSync(new URL(url.slice(6),STATIC)),
      {status:200});}
    catch{return new Response('missing',{status:404});}
  }};
}
async function sourceIndex(){
  const {calls,fetcher}=publicFetcher();
  const catalog=await loadPublicSourceCatalog('/Wand',fetcher);
  return {catalog,calls,fetcher};
}

test('4 game-native Item categories are lazy, unique and include only original source evidence',async()=>{
  const {catalog,calls}=await sourceIndex();
  assert.equal(calls.length,26);
  const promise=catalog.loadGameNativeItemCategories();
  assert.equal(catalog.loadGameNativeItemCategories(),promise);
  const index=await promise;
  assert.equal(calls.length,28,'original Pet and Online metadata only, no external archive');
  assert.equal(new Set(calls).size,28);
  assert(index.originalGameFilesOnly);
  assert.equal(index.complete,false);
  assert.equal(index.schema,DB02_GAME_NATIVE_ITEM_CATEGORIES_SCHEMA);
  assert.equal(index.gameVersion,'1.26.2');
  assert(hasGameNativeItemCategoryEvidence(index));
  assert(!hasGameNativeItemCategoryEvidence({...index}));
  const c=index.coverage;
  assert.equal(c.originalShopItemOccurrences,284);
  assert.equal(c.nativeStarPathRewardOccurrences,67);
  assert.equal(c.nativeGameEventRewardOccurrences,202);
  assert.equal(c.originalIapPackageRewardOccurrences,291);
  assert.equal(c.nativePetPremiumShopRows,95);
  assert.equal(c.nativePetStarPathRows,7);
  assert.equal(c.nativePetGameEventRows,9);
  assert.equal(c.nativePetExclusivePromotionRows,14);
  assert.equal(c.unresolvedOriginalPremiumRows,1830);
  assert.equal(c.unresolvedOriginalTimeLimitedRows,368);
  assert.equal(c.explicitlyMappedTwitchDropItemIds,0);
  assert.equal(c.explicitlyMappedCampaignCodeItemIds,0);
  assert.equal(c.dateOrPriceEvidenceUsed,false);
  assert.equal(c.thirdPartyOrOfficialWebEvidenceUsed,false);
  assert.equal(c.gameSourceCoverageComplete,false);
  assert.equal(c.currentAvailabilityVerified,false);
  const types=[
    'premium_shop','star_path','in_game_limited_event',
    'real_time_limited_event','iap_package_reward'
  ];
  for(const kind of types){
    const ids=index.listItemIds(kind);
    assert(Object.isFrozen(ids));
    assert.deepEqual(ids,[...ids].sort((a,b)=>Number(a)-Number(b)));
    assert.equal(new Set(ids).size,ids.length);
    for(const id of ids){
      const item=index.getItem(id);
      assert(item.categories.includes(kind));
      assert(item.evidence.some(e=>e.category===kind));
      assert(item.evidence.every(e=>
        e.itemId===id&&e.exactItemIdInOriginalSource===true&&
        e.currentAvailabilityVerified===false&&
        e.specificExternalCampaignVerified===false));
    }
  }
  assert.equal(index.listItemIds('premium_shop').length,c.premiumShopItemIds);
  assert.equal(index.listItemIds('star_path').length,c.starPathItemIds);
  assert.equal(index.listItemIds('in_game_limited_event').length,c.inGameLimitedEventItemIds);
  assert.equal(index.listItemIds('real_time_limited_event').length,c.realTimeLimitedEventItemIds);
  assert.equal(index.listItemIds('iap_package_reward').length,c.iapPackageRewardItemIds);
  assert.equal(index.listItemIds().length,c.distinctClassifiedItemIds);
  assert(index.listItemIds('premium_shop').length>=186);
  assert(index.listItemIds('star_path').length>=7);
  assert(index.listItemIds('in_game_limited_event').length>=9);
  assert(index.listItemIds('real_time_limited_event').length>=14);
  assert(index.listItemIds('iap_package_reward').length>=158);
  assert(Object.isFrozen(index));
  assert(Object.isFrozen(index.coverage));
  assert(Object.isFrozen(index.listItemIds()));
  assert.deepEqual(index.getItem(999999999).categories,[]);
  assert.equal(index.getItem(999999999).unknownBecauseNoCategoryEvidence,true);
});

test('all 284 original store item occurrences map to premium_shop without dates or prices',async()=>{
  const {catalog}=await sourceIndex();
  const index=await catalog.loadGameNativeItemCategories();
  for(const source of [catalog.nativeShopSource,catalog.historicalNativeShopSource]){
    for(const origin of source.origins){
      const item=index.getItem(origin.itemId);
      assert(item.categories.includes('premium_shop'));
      assert(item.evidence.some(e=>
        e.category==='premium_shop'&&
        e.basis==='original_shop_offer_item_id'&&
        e.originalCategoryOnly===false));
      assert(!('date' in item)&&!('price' in item)&&
        !('offerId' in item)&&!('code' in item));
    }
  }
  assert.equal(catalog.shopHistory.coverage.distinctItemIds,186);
  for(const id of catalog.shopHistory.coverage.distinctItemIds?
    catalog.itemSources.getKindItemIds('premium_shop'):[]){
    const item=index.getItem(id);
    assert(item.categories.includes('premium_shop'));
  }
});

test('game-native event, original Star Path and native Pet.Source map to source categories, not named campaigns',async()=>{
  const {catalog}=await sourceIndex();
  const index=await catalog.loadGameNativeItemCategories();
  const pets=await catalog.loadNativePetSources();
  for(const row of pets.classifications){
    const expected={
      quest:null,timebending:null,event:'in_game_limited_event',
      star_path:'star_path',premium_shop:'premium_shop',
      exclusive_promotion:'real_time_limited_event'
    }[row.category];
    const item=index.getItem(row.itemId);
    if(expected===null)continue;
    assert(item.categories.includes(expected));
    assert(item.evidence.some(e=>
      e.category===expected&&e.basis==='original_pet_source_enum'&&
      e.originalCategoryOnly===true));
  }
  for(const origin of catalog.eventFriendshipSource.origins){
    if(origin.kind==='friendship_reward')continue;
    assert.equal(origin.kind,'event_reward');
    assert(index.getItem(origin.itemId).categories.includes('in_game_limited_event'));
  }
  let starPaths=0;
  for(const id of catalog.origins.listLinkedItemIds()){
    for(const origin of catalog.origins.getItem(id).origins){
      if(!origin.kind.startsWith('star_path_'))continue;
      starPaths++;
      assert(index.getItem(id).categories.includes('star_path'));
    }
  }
  assert.equal(starPaths,67);
  for(const origin of catalog.nativeIapSource.origins){
    assert(index.getItem(origin.itemId).categories.includes('iap_package_reward'));
    assert(index.getItem(origin.itemId).evidence.some(e=>
      e.category==='iap_package_reward'&&
      e.basis==='original_iap_package_reward_item_id'));
  }
});

test('generic OnlineCategory Premium/TimeLimited never promotes an item into a shop or named external reward',async()=>{
  const {catalog,calls}=await sourceIndex();
  const index=await catalog.loadGameNativeItemCategories();
  const online=await catalog.loadNativeOnlineCategories();
  for(const row of online.rows){
    const item=index.getItem(row.itemId);
    assert(item.unresolvedNativeOnlineCategories.includes(row.category));
    assert(!item.evidence.some(e=>
      e.basis==='original_shop_offer_item_id'&&e.originalCategoryOnly===true));
  }
  // At least some original metadata-only IDs must remain unresolved, showing
  // that Premium is not blindly relabelled into a Shop offer.
  const metadataOnly=online.rows.filter(row=>
    index.getItem(row.itemId).unknownBecauseNoCategoryEvidence);
  assert(metadataOnly.length>0);
  assert(metadataOnly.some(row=>row.category==='premium'));
  assert(metadataOnly.every(row=>
    index.getItem(row.itemId).categories.length===0));
  assert.equal(index.coverage.explicitlyMappedTwitchDropItemIds,0);
  assert.equal(index.coverage.explicitlyMappedCampaignCodeItemIds,0);
  assert.equal(calls.length,28);
  assert.throws(()=>index.getItem('01300000'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.listItemIds('twitch_drop'),/INVALID_CATEGORY/);
});

test('branded game-file-only source inputs are required; consumers share lazy metadata fetch',async()=>{
  const {catalog,calls}=await sourceIndex();
  const [online,pets]=await Promise.all([
    catalog.loadNativeOnlineCategories(),catalog.loadNativePetSources()
  ]);
  const build=(a,b,c,d,e,f,g)=>indexGameNativeItemCategories(a,b,c,d,e,f,g);
  const args=[
    catalog.origins,catalog.nativeShopSource,catalog.historicalNativeShopSource,
    catalog.nativeIapSource,catalog.eventFriendshipSource,pets,online
  ];
  assert.throws(()=>build(...args.slice(0,1),{...args[1]},...args.slice(2)),
    /ORIGINAL_SOURCE_REQUIRED/);
  assert.throws(()=>build(...args.slice(0,2),{...args[2]},...args.slice(3)),
    /ORIGINAL_SOURCE_REQUIRED/);
  assert.throws(()=>build(...args.slice(0,3),{...args[3]},...args.slice(4)),
    /ORIGINAL_SOURCE_REQUIRED/);
  assert.throws(()=>build(...args.slice(0,4),{...args[4]},...args.slice(5)),
    /ORIGINAL_SOURCE_REQUIRED/);
  assert.throws(()=>build(...args.slice(0,5),{...args[5]},...args.slice(6)),
    /ORIGINAL_SOURCE_REQUIRED/);
  assert.throws(()=>build(...args.slice(0,6),{...args[6]}),
    /ORIGINAL_SOURCE_REQUIRED/);
  const idx=build(...args);
  assert(hasGameNativeItemCategoryEvidence(idx));
  const result=await catalog.lookupWithGameNativeItemCategories(
    catalog.shopHistory.coverage.distinctItemIds?
      catalog.itemSources.getKindItemIds('premium_shop')[0]:1);
  assert.equal(result.gameNativeItemCategoriesLoaded,true);
  assert(result.gameNativeItemCategories.categories.includes('premium_shop'));
  assert(Object.isFrozen(result));
  await catalog.loadDistributionScopes();
  assert.equal(new Set(calls).size,calls.length);
});
