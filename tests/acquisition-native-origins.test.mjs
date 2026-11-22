import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectVerifiedSrc02Origins,projectStructuralSrc02Origins,
  loadVerifiedSrc02OriginReader
} from '../src/lib/acquisition/native-origins.ts';
import {createAcquisitionOriginDatabase} from '../src/lib/acquisition/origins.ts';

function nativeBundle() {
  const getItem=id=>({
    itemId:id,status:undefined,
    madeBy:id===31700009?[{recipeId:2050300004,resultItemId:id,type:'crafting',
      resultQuantity:2,nameKey:'CraftTest',conditionDigest:'a'.repeat(64)}]:[],
    acquisitionPaths:id===31700017?[
      {pathId:'mining:2050200001',itemId:id,type:'mining',nameKey:'MiningTest',
        definitionId:2050200001,areaId:2,sceneId:null,rarity:3,
        source:{kind:'game_native',file:'itemlist/ActivityData.json',
          definitionId:2050200001}}
    ]:[],
    shopOffers:[],
    possibleStalls:id===31700017?[{stallId:20100000,nameKey:'Gardening_Stall2_Meadow',
      status:'static_candidate_not_verified_for_sale',hasConditionalFilter:false,
      slots:[{slotIndex:0,lootTableId:2090000003,candidateGroupIndexes:[1,2]}]}]:[]
  });
  return {
    contract:'wand.src02.private-browser-bundle@1',
    manifestSha256:'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c',
    privateSource:true,publishable:false,verified:true,provenanceMatched:true,
    currentShopOffersVerified:false,currentAvailabilityVerified:false,
    source:{platform:'Steam',gameVersion:'1.26.2'},
    getItem
  };
}

test('Verified native recipes, gathering paths and static stall candidates coexist under an Item ID',()=>{
  const routes=projectStructuralSrc02Origins(nativeBundle(),[31700009,31700017,31700017]);
  assert.equal(routes.length,3);
  assert.equal(routes.find(r=>r.kind==='crafting')?.quantity,2);
  assert.equal(routes.find(r=>r.kind==='crafting')?.conditions.length,1);
  assert.equal(routes.find(r=>r.kind==='mining')?.routeStatus,'static_candidate_only');
  assert.deepEqual(routes.find(r=>r.kind==='mining')?.nativeDetails?.areaIds,[2]);
  assert.equal(routes.find(r=>r.kind==='mining')?.nativeDetails?.rarity,3);
  assert.equal(routes.find(r=>r.kind==='game_shop')?.nativeDetails?.lootTableId,'2090000003');
  assert.deepEqual(routes.find(r=>r.kind==='game_shop')?.nativeDetails?.candidateGroupIndexes,[1,2]);
  assert.equal(routes.find(r=>r.kind==='game_shop')?.routeStatus,'static_candidate_only');
  assert(routes.every(r=>r.availability==='not_live_verified'));
  assert(routes.every(r=>r.source.sha256===null &&
    r.source.kind==='unhashed_structural_candidate'));
  const unified=createAcquisitionOriginDatabase(routes);
  assert.deepEqual(unified.getItem(31700017).origins.map(r=>r.kind),['mining','game_shop']);
  assert.equal(unified.getCoverage().routesBySourceKind.unhashed_structural_candidate,3);
});

test('Unverified native data cannot be promoted into confirmed acquisition origins',()=>{
  assert.throws(()=>projectStructuralSrc02Origins({
    ...nativeBundle(),manifestSha256:'1'.repeat(64)
  },[31700017]),/VERIFIED_PRIVATE_R5_REQUIRED/);
  assert.throws(()=>projectStructuralSrc02Origins({
    ...nativeBundle(),source:{platform:'Steam',gameVersion:'1.26.1'}
  },[31700017]),/VERIFIED_PRIVATE_R5_REQUIRED/);
  assert.throws(()=>projectStructuralSrc02Origins({
    ...nativeBundle(),getItem:()=>({itemId:31700017,acquisitionPaths:[
      {pathId:'mining:3',itemId:999,type:'mining'}
    ]})
  },[31700017]),/PATH_ITEM/);
  assert.throws(()=>projectStructuralSrc02Origins(nativeBundle(),['00017']),/INVALID_ITEM_ID/);
  assert.throws(()=>projectStructuralSrc02Origins(nativeBundle(),new Array(20001).fill(1)),/ID_BATCH_LIMIT/);
});

test('Copied SHA and flags cannot forge authenticated private browser provenance',async()=>{
  assert.throws(()=>projectVerifiedSrc02Origins(nativeBundle(),[31700017]),
    /PINNED_SOURCE_REQUIRED/);
  await assert.rejects(loadVerifiedSrc02OriginReader(new Uint8Array([1,2,3]),{
    platform:'Steam',gameVersion:'1.26.2',
    manifestSha256:'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c',
    src01ManifestSha256:'a'.repeat(64),
    currentConditionSha256:'9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c'
  }),/PRIVATE_SRC02_ARCHIVE_SIZE/);
});

test('Every possible stall is a candidate, never active stock or a Premium Shop offer',()=>{
  const routes=projectStructuralSrc02Origins(nativeBundle(),[31700017]);
  assert.equal(routes.find(r=>r.kind==='game_shop')?.price,null);
  assert(!routes.some(r=>r.kind==='premium_shop'));
  assert(routes.every(r=>r.accessTier==='not_applicable'));
});
