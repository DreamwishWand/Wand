import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb01LocalizedSourceScopeClient} from './localized-source-scope.ts';

const SHA='a'.repeat(64);
const TAG_SHA='b'.repeat(64);
const world=(tagItemId,nativeKey,displayName)=>({
  kind:'world_context_tag',tagItemId,nativeKey,locale:'ja',displayName,
  originalTagDefinitionSha256:TAG_SHA,
  sourceExactCurrentLocDbName:true,originalTagDefinitionVerified:true,
  sourceWorldOrUniverseTagVerified:true,
  gameUiCollectionMembershipVerified:false,
  itemAcquisitionWorldVerified:false,
});
const universe=(tagItemId,nativeKey,displayName)=>({
  ...world(tagItemId,nativeKey,displayName),kind:'disney_universe_tag',
});
const worlds=[
  world(2001200001,'IsDreamlightValley','ドリームライト・バレー'),
  world(2001200002,'IsEternityIsle','永遠の島'),
];
const universes=[
  universe(2000500001,'MickeyAndFriends','ミッキーと仲間たち'),
  universe(2000500002,'BeautyAndTheBeast','美女と野獣'),
];
function match(facet,tagId,originalTagKey,matchingNativeItemIds){
  return {facet,tagId,originalTagKey,matchingNativeItemIds,
    sourceTagAssociationVerified:true,gameUiFilterVerified:false};
}
function fixture(){
  const calls={world:0,universe:0,facet:[]};
  const native={
    contract:'wand.db01.original-native-filters@1',
    source:{gameVersion:'1.26.2',sourceItemsSha256:SHA,
      sourceSqliteSha256:SHA,sourceIl2cppDumpSha256:SHA},
    getCoverage:async()=>({
      gameVersion:'1.26.2',sourceItemsSha256:SHA,
      completeSourceNativeItemScan:true,fullNativeDefinitions:13202,
    }),
    getFacetOptions:async facet=>{
      calls.facet.push(facet);
      return facet==='worldContextTag'?
        [match(facet,2001200001,'IsDreamlightValley',15)]:
        [match(facet,2000500002,'BeautyAndTheBeast',8)];
    },
  };
  const taxonomy={
    contract:'wand.db04.native-tag-taxonomy@1',
    source:{platform:'Steam',gameVersion:'1.26.2',
      db01SourceItemsSha256:SHA,originalTagSha256:TAG_SHA,
      privateOnly:true,publicationAuthorized:false},
    listWorldTags:async()=>{calls.world++;return worlds;},
    listUniverseTags:async()=>{calls.universe++;return universes;},
  };
  return {native,taxonomy,calls};
}
test('exact localized original source World tags compose with DB-01 Item facet counts',async()=>{
  const f=fixture(),client=createDb01LocalizedSourceScopeClient(
    f.native,f.taxonomy);
  const result=await client.listWorldContextOptions('ja');
  assert.deepEqual(result.map(x=>[x.tagId,x.originalTagKey,x.displayName,
    x.matchingNativeItemIds]),[
    [2001200001,'IsDreamlightValley','ドリームライト・バレー',15],
    [2001200002,'IsEternityIsle','永遠の島',0],
  ]);
  assert.equal(result[0].currentLocDbNameVerified,true);
  assert.equal(result[0].gameUiCollectionMembershipVerified,false);
  assert.equal(result[0].itemAcquisitionWorldVerified,false);
  assert.equal(result[0].contentPackRelationVerified,false);
  assert.equal(result[0].dlcEntitlementVerified,false);
  assert.equal(client.source.actualWorldAvailabilityVerified,false);
  assert.equal(Object.isFrozen(result),true);
  assert.equal(Object.isFrozen(result[0]),true);
  assert.deepEqual(f.calls.facet,['worldContextTag']);
});
test('native universe Tag ID and Japanese LocDB label remain exact, missing association remains zero',async()=>{
  const f=fixture(),client=createDb01LocalizedSourceScopeClient(
    f.native,f.taxonomy);
  const result=await client.listDisneyUniverseOptions('ja');
  assert.deepEqual(result.map(x=>[x.tagId,x.displayName,x.matchingNativeItemIds]),[
    [2000500001,'ミッキーと仲間たち',0],
    [2000500002,'美女と野獣',8],
  ]);
  assert.deepEqual(f.calls.facet,['disneyUniverse']);
});
test('different native source version or Item source SHA rejects before any read',()=>{
  const f=fixture();
  assert.throws(()=>createDb01LocalizedSourceScopeClient(f.native,{
    ...f.taxonomy,source:{...f.taxonomy.source,gameVersion:'1.27.0'},
  }),/UNVERIFIED_OR_MISMATCHED_SOURCE/);
  assert.throws(()=>createDb01LocalizedSourceScopeClient(f.native,{
    ...f.taxonomy,source:{...f.taxonomy.source,
      db01SourceItemsSha256:'c'.repeat(64)},
  }),/UNVERIFIED_OR_MISMATCHED_SOURCE/);
  assert.equal(f.calls.world,0);
});
test('unknown facet tags, wrong original Tag keys and forged localization fail closed',async()=>{
  const f=fixture();
  for(const option of [
    match('worldContextTag',999,'UnrecognizedWorldTag',3),
    match('worldContextTag',2001200001,'WrongOriginalKey',3),
    match('worldContextTag',2001200001,'IsDreamlightValley',13203),
  ]){
    const native={...f.native,
      getFacetOptions:async()=>[option]};
    await assert.rejects(createDb01LocalizedSourceScopeClient(
      native,f.taxonomy).listWorldContextOptions('ja'),
      /UNKNOWN_OR_CONFLICTING_NATIVE_FACET/);
  }
  const tampered={...f.taxonomy,listWorldTags:async()=>[
    {...worlds[0],displayName:'  unverified '},worlds[1],
  ]};
  await assert.rejects(createDb01LocalizedSourceScopeClient(
    f.native,tampered).listWorldContextOptions('ja'),
    /INVALID_OR_DUPLICATE_ORIGINAL_TAG_NAME/);
  const wrongLocale={...f.taxonomy,listWorldTags:async()=>[
    {...worlds[0],locale:'en'},worlds[1],
  ]};
  await assert.rejects(createDb01LocalizedSourceScopeClient(
    f.native,wrongLocale).listWorldContextOptions('ja'),
    /INVALID_OR_DUPLICATE_ORIGINAL_TAG_NAME/);
});
test('partial native scans and inconsistent Tag original source are rejected',async()=>{
  const f=fixture();
  await assert.rejects(createDb01LocalizedSourceScopeClient({
    ...f.native,getCoverage:async()=>({
      gameVersion:'1.26.2',sourceItemsSha256:SHA,
      completeSourceNativeItemScan:false,fullNativeDefinitions:13202,
    }),
  },f.taxonomy).listWorldContextOptions('ja'),
  /INCOMPLETE_OR_CONFLICTING_NATIVE_ITEM_SCAN/);
  await assert.rejects(createDb01LocalizedSourceScopeClient(f.native,{
    ...f.taxonomy,listWorldTags:async()=>[
      {...worlds[0],originalTagDefinitionSha256:'c'.repeat(64)},worlds[1],
    ],
  }).listWorldContextOptions('ja'),/MIXED_ORIGINAL_TAG_SOURCE/);
  await assert.rejects(createDb01LocalizedSourceScopeClient(f.native,
    {...f.taxonomy,source:{...f.taxonomy.source,
      originalTagSha256:'d'.repeat(64)}})
    .listWorldContextOptions('ja'),/TAXONOMY_TAG_SHA_MISMATCH/);
});
test('unsupported locale rejected before requesting any native source files',async()=>{
  const f=fixture();
  await assert.rejects(createDb01LocalizedSourceScopeClient(
    f.native,f.taxonomy).listWorldContextOptions('zz'),
  /INVALID_LOCALE/);
  assert.deepEqual(f.calls.facet,[]);
});
