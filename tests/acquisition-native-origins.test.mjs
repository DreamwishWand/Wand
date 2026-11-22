import test from 'node:test';
import assert from 'node:assert/strict';
import {projectVerifiedSrc02Origins} from '../src/lib/acquisition/native-origins.ts';
import {createAcquisitionOriginDatabase} from '../src/lib/acquisition/origins.ts';

function nativeBundle() {
  const getItem=id=>({
    itemId:id,status:undefined,
    madeBy:id===31700009?[{recipeId:2050300004,resultItemId:id,type:'crafting',
      resultQuantity:2,nameKey:'CraftTest',conditionDigest:'a'.repeat(64)}]:[],
    acquisitionPaths:id===31700017?[
      {pathId:'mining:2050200001',itemId:id,type:'mining',nameKey:'MiningTest'}
    ]:[],
    shopOffers:[],
    possibleStalls:id===31700017?[{stallId:20100000,nameKey:'Gardening_Stall2_Meadow'}]:[]
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
  const routes=projectVerifiedSrc02Origins(nativeBundle(),[31700009,31700017,31700017]);
  assert.equal(routes.length,3);
  assert.equal(routes.find(r=>r.kind==='crafting')?.quantity,2);
  assert.equal(routes.find(r=>r.kind==='crafting')?.conditions.length,1);
  assert.equal(routes.find(r=>r.kind==='mining')?.routeStatus,'confirmed_source_link');
  assert.equal(routes.find(r=>r.kind==='game_shop')?.routeStatus,'static_candidate_only');
  assert(routes.every(r=>r.availability==='not_live_verified'));
  assert(routes.every(r=>r.source.sha256==='ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c'));
  const unified=createAcquisitionOriginDatabase(routes);
  assert.deepEqual(unified.getItem(31700017).origins.map(r=>r.kind),['mining','game_shop']);
  assert.equal(unified.getCoverage().routesBySourceKind.verified_game_native,3);
});

test('Unverified native data cannot be promoted into confirmed acquisition origins',()=>{
  assert.throws(()=>projectVerifiedSrc02Origins({
    ...nativeBundle(),manifestSha256:'1'.repeat(64)
  },[31700017]),/VERIFIED_PRIVATE_R5_REQUIRED/);
  assert.throws(()=>projectVerifiedSrc02Origins({
    ...nativeBundle(),source:{platform:'Steam',gameVersion:'1.26.1'}
  },[31700017]),/VERIFIED_PRIVATE_R5_REQUIRED/);
  assert.throws(()=>projectVerifiedSrc02Origins({
    ...nativeBundle(),getItem:()=>({itemId:31700017,acquisitionPaths:[
      {pathId:'mining:3',itemId:999,type:'mining'}
    ]})
  },[31700017]),/PATH_ITEM/);
  assert.throws(()=>projectVerifiedSrc02Origins(nativeBundle(),['00017']),/INVALID_ITEM_ID/);
  assert.throws(()=>projectVerifiedSrc02Origins(nativeBundle(),new Array(20001).fill(1)),/ID_BATCH_LIMIT/);
});

test('Every possible stall is a candidate, never active stock or a Premium Shop offer',()=>{
  const routes=projectVerifiedSrc02Origins(nativeBundle(),[31700017]);
  assert.equal(routes.find(r=>r.kind==='game_shop')?.price,null);
  assert(!routes.some(r=>r.kind==='premium_shop'));
  assert(routes.every(r=>r.accessTier==='not_applicable'));
});
