import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeCollectionAcquisition}
  from '../src/lib/collection/acquisition-summary.ts';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';

const ID='40001082';
function fixture(){
  return {
    itemId:ID,staticSourceOnly:true,
    currentAvailabilityVerified:false,playerOwnershipVerified:false,
    collectionUiMembershipVerified:false,
    recipes:{
      itemId:ID,sourceRecipeResultOnly:true,recipeUnlockedVerified:false,
      recipes:[],sourceRecipeOrigins:[]
    },
    activities:{
      itemId:ID,staticSourceOnly:true,
      actualOccurrenceGuaranteed:false,currentAvailabilityVerified:false,
      sourcePaths:[],sourcePathOrigins:[]
    },
    loot:{
      itemId:ID,sourceCandidateOnly:true,
      actualGameplayContextVerified:false,guaranteedDropVerified:false,
      currentAvailabilityVerified:false,playerOwnershipVerified:false,
      candidates:[],staticCandidateOrigins:[]
    },
    staticLootCandidateCount:0,
    actualLootContextVerified:false,guaranteedLootDropVerified:false,
    shared:{itemId:ID,origins:[],starpathRewardsOnlyConfigured:true,
      starpathRelations:[]}
  };
}
const stallCandidate=(overrides={})=>({
  itemId:ID,routeStatus:'static_candidate_only',
  stallSlotReferenceVerified:true,itemInReferencedLootTableVerified:true,
  staticStorePoolOnly:true,liveStockVerified:false,livePriceVerified:false,
  purchaseEligibilityVerified:false,playerOwnershipVerified:false,...overrides
});
function stalls(candidates=[]){
  return {
    schema:'wand.db02.native-stall-loot-join@1',
    gameVersion:'1.26.2',
    coverage:{staticStorePoolOnly:true,liveShopStockVerified:false,
      livePurchasePriceVerified:false,purchasabilityVerified:false,
      playerUnlockVerified:false},
    getItemCandidates(){return candidates;}
  };
}
const lootCandidate=(overrides={})=>({
  itemId:ID,routeStatus:'static_candidate_only',
  gameplayContextVerified:false,itemGrantVerified:false,
  playerOwnershipVerified:false,...overrides
});

test('exact original recipes, activities and configured primary Star Path rewards',()=>{
  const value=fixture();
  value.recipes.recipes=[
    {resultItemId:ID,kind:'cooking',recipeUnlockedVerified:false},
    {resultItemId:ID,kind:'crafting',recipeUnlockedVerified:false},
    {resultItemId:ID,kind:'cooking',recipeUnlockedVerified:false}
  ];
  value.activities.sourcePaths=[
    {resultItemId:ID,method:'farming',occurrenceGuaranteed:false,currentAvailabilityVerified:false},
    {resultItemId:ID,method:'mining',occurrenceGuaranteed:false,currentAvailabilityVerified:false},
    {resultItemId:ID,method:'fishing',occurrenceGuaranteed:false,currentAvailabilityVerified:false},
    {resultItemId:ID,method:'timebending',occurrenceGuaranteed:false,currentAvailabilityVerified:false}
  ];
  value.shared.starpathRelations=[
    {itemId:ID,role:'premium_access_currency',configuredRewardOnly:true,guaranteedGrant:false},
    {itemId:ID,role:'vault_alternative_candidate',configuredRewardOnly:true,guaranteedGrant:false},
    {itemId:ID,role:'configured_reward',configuredRewardOnly:true,guaranteedGrant:false}
  ];
  const summary=summarizeCollectionAcquisition(value,stalls());
  assert.deepEqual(summary,{
    itemId:Number(ID),
    kinds:['crafting','cooking','fishing','mining','timebending','farming','starpath'],
    candidates:[],
    staticSourceOnly:true,availabilityVerified:false,ownershipVerified:false
  });
  assert(Object.isFrozen(summary));
  assert(Object.isFrozen(summary.kinds));
  assert(Object.isFrozen(summary.candidates));
});

test('only exact ID-linked and positively sourced origin kinds; no enum/name-only promotion',()=>{
  const value=fixture();
  const origin=(kind,routeStatus,sourceKind='verified_game_native',itemId=ID)=>({
    itemId,kind,routeStatus,source:{kind:sourceKind},availability:'not_live_verified'
  });
  value.shared.origins=[
    origin('quest_reward','confirmed_source_link'),
    origin('event_reward','confirmed_source_link'),
    origin('premium_shop','confirmed_source_link','verified_sale_snapshot'),
    origin('twitch_drop','confirmed_source_link','official_publication'),
    origin('redeem_code','confirmed_source_link','unhashed_structural_candidate'),
    origin('game_shop','static_candidate_only'),
    origin('loot','confirmed_source_link')
  ];
  const summary=summarizeCollectionAcquisition(value,stalls());
  assert.deepEqual(summary.kinds,[
    'quest_reward','event_reward','twitch_drop','premium_shop'
  ].sort((a,b)=>[
    'crafting','cooking','fishing','mining','timebending','farming','foraging',
    'game_shop','quest_reward','event_reward','friendship_reward','starpath',
    'twitch_drop','redeem_code','premium_shop'
  ].indexOf(a)-[
    'crafting','cooking','fishing','mining','timebending','farming','foraging',
    'game_shop','quest_reward','event_reward','friendship_reward','starpath',
    'twitch_drop','redeem_code','premium_shop'
  ].indexOf(b)));
  assert.equal(summary.kinds.includes('redeem_code'),false);
  assert.equal(summary.kinds.includes('game_shop'),false);
  assert.deepEqual(summary.candidates,[]);
});

test('source candidates are separate from confirmed Item-origin methods',()=>{
  const value=fixture();
  value.loot.candidates=[lootCandidate()];
  value.loot.staticCandidateOrigins=[{itemId:ID,routeStatus:'static_candidate_only'}];
  value.staticLootCandidateCount=1;
  const result=summarizeCollectionAcquisition(value,stalls([stallCandidate()]));
  assert.deepEqual(result.kinds,[]);
  assert.deepEqual(result.candidates,['loot_table','stall_slot']);
  const sourceOnly=summarizeCollectionAcquisition(value,stalls());
  assert.deepEqual(sourceOnly.candidates,['loot_table']);
  const empty=fixture();
  empty.shared.starpathRelations=[
    {itemId:ID,role:'premium_access_currency',configuredRewardOnly:true,guaranteedGrant:false},
    {itemId:ID,role:'vault_alternative_candidate',configuredRewardOnly:true,guaranteedGrant:false}
  ];
  assert.deepEqual(summarizeCollectionAcquisition(empty,stalls()),{
    itemId:Number(ID),kinds:[],candidates:[],
    staticSourceOnly:true,availabilityVerified:false,ownershipVerified:false
  });
});

test('rejects fake availability, mismatched Item IDs, grants and stock claims',()=>{
  const a=fixture();a.currentAvailabilityVerified=true;
  assert.throws(()=>summarizeCollectionAcquisition(a,stalls()),/UNVERIFIED_SOURCE/);
  const b=fixture();b.loot.guaranteedDropVerified=true;
  assert.throws(()=>summarizeCollectionAcquisition(b,stalls()),/UNVERIFIED_SOURCE/);
  const c=fixture();c.recipes.recipes=[{
    resultItemId:'123',kind:'crafting',recipeUnlockedVerified:false
  }];
  assert.throws(()=>summarizeCollectionAcquisition(c,stalls()),/RECIPE_MISMATCH/);
  const d=fixture();d.activities.sourcePaths=[{
    resultItemId:ID,method:'mining',occurrenceGuaranteed:true,
    currentAvailabilityVerified:false
  }];
  assert.throws(()=>summarizeCollectionAcquisition(d,stalls()),/PATH_MISMATCH/);
  const e=fixture();e.shared.itemId='123';
  assert.throws(()=>summarizeCollectionAcquisition(e,stalls()),/ID_MISMATCH/);
  const f=fixture();f.shared.origins=[{
    itemId:'123',kind:'quest_reward',routeStatus:'confirmed_source_link',
    source:{kind:'verified_game_native'},availability:'not_live_verified'
  }];
  assert.throws(()=>summarizeCollectionAcquisition(f,stalls()),/ORIGIN_MISMATCH/);
  const g=fixture();g.loot.candidates=[lootCandidate({itemGrantVerified:true})];
  g.loot.staticCandidateOrigins=[{}];g.staticLootCandidateCount=1;
  assert.throws(()=>summarizeCollectionAcquisition(g,stalls()),/LOOT_MISMATCH/);
  const h=fixture();
  assert.throws(()=>summarizeCollectionAcquisition(h,stalls([stallCandidate({
    liveStockVerified:true
  })])),/STALL_MISMATCH/);
  const i=fixture();
  assert.throws(()=>summarizeCollectionAcquisition(i,{...stalls(),
    coverage:{...stalls().coverage,purchasabilityVerified:true}
  }),/STALL_SOURCE_UNVERIFIED/);
});

test('public Steam v1.26.2 source bytes join real LootTable and stall candidates',async()=>{
  const urls=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    urls.push(url);
    try{
      return new Response(readFileSync(new URL(url.slice(6),
        new URL('../static/',import.meta.url))),{status:200});
    }catch{
      return new Response('missing',{status:404});
    }
  };
  const app=await openPublicSharedGameSources('/Wand',fetcher);
  const before=urls.length;
  assert(!urls.some(url=>url.includes('native-stall-slots')));
  assert(!urls.some(url=>url.includes('native-loot-candidates')));
  const id='30200000'; // source-fixture Item with original Stall slot candidates
  const [evidence,stallsIndex]=await Promise.all([
    app.getAllNativeAcquisitionEvidence(id),
    app.acquisition.loadNativeStallSources()
  ]);
  const summary=summarizeCollectionAcquisition(evidence,stallsIndex);
  assert.equal(summary.itemId,30200000);
  assert(summary.candidates.includes('stall_slot'));
  assert(summary.candidates.includes('loot_table'));
  assert(stallsIndex.getItemCandidates(id).length>0);
  assert(evidence.loot.candidates.length>0);
  assert.equal(summary.availabilityVerified,false);
  assert.equal(summary.ownershipVerified,false);
  assert.equal(urls.filter(url=>url.endsWith('native-stall-slots-1.26.2.json')).length,1);
  assert.equal(urls.filter(url=>url.endsWith('native-loot-candidates-1.26.2.json')).length,1);
  assert.equal(urls.length,before+4);
});
