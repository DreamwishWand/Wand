import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {openSharedGameDatabase} from '../src/lib/game-db/integrated.ts';
import {joinCurrentGameSources,DB00_SOURCE_JOIN_CONTRACT} from '../src/lib/game-db/source-join.ts';

const root=resolve(new URL('..',import.meta.url).pathname);
const local=async(url)=>{
  try{return new Response(await readFile(join(root,'static',url.replace(/^\/Wand\//,''))),{status:200});}
  catch(e){if(e?.code==='ENOENT')return new Response('',{status:404});throw e;}
};
const sourcePins={auditSha256:'a'.repeat(64),rowsSha256:'b'.repeat(64)};
const taggedId='30000031';
const worldTag='IsDreamlightValley';
const row=(id,nativeCategory)=>Object.freeze({
  itemId:Number(id),nativeCategory,nativeKey:'original-'+id,
  worldsDirect:Object.freeze([worldTag]),universeTagsDirect:Object.freeze(['Frozen']),
  universeSetCandidates:Object.freeze(['Frozen']),
  setDefinitionIds:Object.freeze([99])
});
function fakeScope(db,overrides={}){
  const nativeCategory=db.getItem(taggedId).nativeCategory??'ActivityItem';
  return {
    contract:'wand.db04.native-item-scope@1',
    source:{
      platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
      publicationAuthorized:false,originalItemDefinitions:13202,
      auditSha256:sourcePins.auditSha256,rowsSha256:sourcePins.rowsSha256
    },
    getItem(id){return id===Number(taggedId)?row(taggedId,nativeCategory):null;},
    byWorldTag(tag,page){
      assert.equal(tag,worldTag);
      return Object.freeze({
        evidenceKind:'world_tag_direct',tag,status:'source_native_tag_present',
        itemIds:Object.freeze([Number(taggedId)]),
        matchingItemIdsInSourceSubset:1,offset:page?.offset??0,
        limit:page?.limit??128,hasNextPage:false,nextOffset:null,
        sourceCoverageComplete:false,gameUiMembershipVerified:false,
        acquisitionWorldVerified:false,dlcEntitlementVerified:false
      });
    },
    ...overrides
  };
}
function fakeOrigins(getItem=(id)=>({
  itemId:id,originCoverageComplete:false,
  origins:id===taggedId?[{
    itemId:id,originId:'native-loot-a',routeStatus:'static_candidate_only',
    availability:'not_live_verified',kind:'loot'
  }]:[],nativeAcquisition:null
})){
  return {schema:'wand.db02.item-origins@1',originCoverageComplete:false,getItem};
}
function fakeRewards(getItemRelations=(id)=>id===taggedId?[{
  itemId:id,seasonId:'starpath-a',role:'configured_reward',
  configuredRewardOnly:true,currentAvailabilityVerified:false,
  playerOwnershipVerified:false
}]:[]){
  return {
    contract:'wand.db03.reward-relations@1',
    evidence:{platform:'Steam',gameVersion:'1.26.2',integrity:'pinned_public_sha256'},
    coverage:{currentAvailabilityVerified:false,playerProgressIncluded:false},
    getItemRelations
  };
}

test('DB-00 reads its existing 13,202 current items without inventing other streams',async()=>{
  const db=await openSharedGameDatabase('/Wand',local);
  const reader=joinCurrentGameSources(db);
  const one=reader.getItem(taggedId);
  assert.equal(reader.contract,DB00_SOURCE_JOIN_CONTRACT);
  assert.equal(one.catalogStatus,'current_published_item');
  assert.equal(one.catalog?.id,taggedId);
  assert.equal(one.nativeTags.status,'not_loaded');
  assert.equal(one.origins,null);
  assert.equal(one.starpathRelations,null);
  assert.equal(one.currentlyAvailableVerified,false);
  assert.equal(one.playerOwnershipVerified,false);
  assert.equal(one.catalog.facts.worlds.state,'unverified');
  assert.equal(reader.getItem('99999999').catalogStatus,'outside_published_item_scope');
  assert.equal(reader.getItem('99999999').nativeTags.status,'outside_scope');
  assert.deepEqual(reader.getItems([taggedId,'99999999']).map(x=>x.catalog?.id??null),
    [taggedId,null]);
  assert.throws(()=>reader.byNativeWorldTag(worldTag),/DB04_NATIVE_SCOPE_REQUIRED/);
  assert.throws(()=>reader.getItem('00030031'),/invalid numeric Item ID/);
  assert.throws(()=>reader.getItems(Array(10001).fill(taggedId)),/INVALID_BATCH/);
});

test('exact current source links stay separately qualified (native tags are not UI worlds)',async()=>{
  const db=await openSharedGameDatabase('/Wand',local);
  const reader=joinCurrentGameSources(db,{
    origins:fakeOrigins(),rewards:fakeRewards(),
    nativeScope:fakeScope(db),nativeScopePins:sourcePins
  });
  const item=reader.getItem(taggedId);
  assert.equal(item.nativeTags.status,'source_native_tag_only');
  assert.deepEqual(item.nativeTags.worldsDirect,[worldTag]);
  assert.deepEqual(item.nativeTags.universeTagsDirect,['Frozen']);
  assert.deepEqual(item.nativeTags.universeSetCandidates,['Frozen']);
  assert.equal(item.catalog?.facts.worlds.state,'unverified');
  assert.equal(item.catalog?.facts.universes.state,'unverified');
  assert.equal(item.nativeTags.gameUiMembershipVerified,false);
  assert.equal(item.nativeTags.acquisitionWorldVerified,false);
  assert.equal(item.nativeTags.dlcEntitlementVerified,false);
  assert.equal(item.origins[0].routeStatus,'static_candidate_only');
  assert.equal(item.starpathRelations[0].configuredRewardOnly,true);
  assert.equal(item.playerOwnershipVerified,false);
  const page=reader.byNativeWorldTag(worldTag,{offset:0,limit:2});
  assert.equal(page.items.length,1);
  assert.equal(page.sourcePage.matchingItemIdsInSourceSubset,1);
  assert.equal(page.items[0].itemId,taggedId);
  assert.equal(page.gameUiMembershipVerified,false);
  assert.ok(Object.isFrozen(page.items));
  assert.ok(Object.isFrozen(item.nativeTags.worldsDirect));
  assert.deepEqual(db.summarizeFacet({scope:'current',field:'worlds'}).values,[],
    'DB-04 source-native Tag must not silently appear as current verified World');

  const outer=reader.getItem('99999999');
  assert.equal(outer.catalog,null);
  assert.deepEqual(outer.origins,[]);
  assert.deepEqual(outer.starpathRelations,[]);
});

test('cross-stream evidence join fails closed on independent pin and identity mismatch',async()=>{
  const db=await openSharedGameDatabase('/Wand',local);
  const scope=fakeScope(db);
  assert.throws(()=>joinCurrentGameSources(db,{nativeScope:scope}),
    /DB04_INDEPENDENT_PRIVATE_SOURCE_PINS_REQUIRED/);
  assert.throws(()=>joinCurrentGameSources(db,{
    nativeScope:scope,nativeScopePins:{...sourcePins,rowsSha256:'f'.repeat(64)}
  }),/DB04_INDEPENDENT_PRIVATE_SOURCE_PINS_REQUIRED/);
  assert.throws(()=>joinCurrentGameSources(db,{nativeScopePins:sourcePins}),
    /DB04_PINS_WITHOUT_SOURCE/);
  assert.throws(()=>joinCurrentGameSources(db,{
    rewards:{...fakeRewards(),evidence:{platform:'Steam',
      gameVersion:'1.26.2',integrity:'source_structure_only'}}
  }),/DB03_SOURCE_NOT_PINNED/);
  assert.throws(()=>joinCurrentGameSources(db,{
    origins:fakeOrigins(id=>({
      itemId:id,originCoverageComplete:false,
      origins:[{itemId:'888',routeStatus:'confirmed_source_link',
        availability:'not_live_verified'}]
    }))
  }).getItem(taggedId),/DB02_ITEM_ID_OR_STATUS_MISMATCH/);
  assert.throws(()=>joinCurrentGameSources(db,{
    rewards:fakeRewards(id=>[{
      itemId:id,configuredRewardOnly:true,
      currentAvailabilityVerified:true,playerOwnershipVerified:false
    }])
  }).getItem(taggedId),/DB03_ITEM_ID_OR_STATUS_MISMATCH/);
  const invalidScope=fakeScope(db,{getItem:()=>row('40000000','Furniture')});
  assert.throws(()=>joinCurrentGameSources(db,{
    nativeScope:invalidScope,nativeScopePins:sourcePins
  }).getItem(taggedId),/DB04_CATALOG_IDENTITY_MISMATCH/);
  const invalidPage=fakeScope(db,{byWorldTag:()=>({
    itemIds:[99999999],matchingItemIdsInSourceSubset:1
  })});
  assert.throws(()=>joinCurrentGameSources(db,{
    nativeScope:invalidPage,nativeScopePins:sourcePins
  }).byNativeWorldTag(worldTag),/DB04_REVERSE_INDEX_IDENTITY_MISMATCH/);
});
