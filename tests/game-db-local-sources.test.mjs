import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';
import {joinLocalGameSources,DB00_LOCAL_SOURCES_SCHEMA}
  from '../src/lib/game-db/local-sources.ts';

const DB01_SHA='c'.repeat(64);
const AUDIT='a'.repeat(64);
const ROWS='b'.repeat(64);
const PINS={auditSha256:AUDIT,rowsSha256:ROWS};
const ITEM='30000031';
const WORLD='IsDreamlightValley';
const STATIC=new URL('../static/',import.meta.url);
const fetcher=async url=>{
  assert(url.startsWith('/Wand/'));
  try{return new Response(readFileSync(new URL(url.slice(6),STATIC)),{status:200});}
  catch{return new Response('not found',{status:404});}
};
let sharedTask;
const publicData=()=>sharedTask??=openPublicSharedGameSources('/Wand',fetcher);

function fakeDefinition(db,id,worlds=null){
  const catalog=db.database.getItem(id);
  const category=catalog?catalog.nativeCategory??'ActivityItem':'Currency';
  const originalTags=worlds===null?null:{
    itemId:Number(id),nativeCategory:category,facets:{worldContextTag:worlds},
    gameUiCategoryVerified:false,worldAvailabilityVerified:false,dlcOwnershipVerified:false
  };
  return Object.freeze({
    itemId:Number(id),gameVersion:'1.26.2',nativeCategory:category,
    item:Object.freeze({
      itemId:Number(id),nativeCategory:category,
      catalogDomain:catalog?'item':'definition_unclassified',
      nativeKey:'Original_'+id,sourceSha256:'d'.repeat(64),
      names:{},verifiedIconGuid:null
    }),
    originalItemType:null,originalTags,
    collection:Object.freeze({
      direct:null,setUniverse:null,special:null,activityCrafting:null,
      candidates:Object.freeze([]),suppressed:Object.freeze([]),
      craftingExclusions:'unavailable',actualGameUiMembershipVerified:false
    }),
    screenCategory:null,screenSubcategory:null,availableWorlds:null,
    dlcEntitlements:null,contentIds:null,runtimeCollectionState:null,
    publicationAuthorized:false
  });
}
function fakeDb01(db,opts={}){
  const items=opts.items??(ids=>ids.map(id=>
    fakeDefinition(db,String(id),id===Number(ITEM)?[WORLD]:null)));
  return {
    source:{platform:'Steam',gameVersion:opts.version??'1.26.2',
      sourceItemsSha256:opts.sha??DB01_SHA,definitions:39067},
    getCoverage:()=>({
      totalDefinitions:39067,tagAssociatedDefinitions:opts.tags??14973,
      actualGameUiMembershipVerified:false,
      worldAvailabilityVerified:false,dlcOwnershipVerified:false
    }),
    getItems:async ids=>items(ids)
  };
}
function fakeDb04(db,opts={}){
  const source={
    platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
    publicationAuthorized:false,originalItemDefinitions:13202,
    auditSha256:AUDIT,rowsSha256:ROWS
  };
  const def=fakeDefinition(db,ITEM,[WORLD]);
  return {
    contract:'wand.db04.native-item-scope@1',source,
    getItem:id=>id===Number(ITEM)?Object.freeze({
      itemId:id,nativeCategory:def.nativeCategory,
      worldsDirect:Object.freeze([WORLD]),
      universeTagsDirect:Object.freeze(['Frozen']),
      universeSetCandidates:Object.freeze(['Frozen']),
      setDefinitionIds:Object.freeze([12])
    }):null,
    byWorldTag:(tag,page)=>({
      evidenceKind:'world_tag_direct',tag,status:'source_native_tag_present',
      itemIds:[Number(ITEM)],matchingItemIdsInSourceSubset:1,
      offset:page?.offset??0,limit:page?.limit??128,
      hasNextPage:false,nextOffset:null,sourceCoverageComplete:false,
      gameUiMembershipVerified:false,acquisitionWorldVerified:false,
      dlcEntitlementVerified:false
    }),
    ...opts
  };
}

test('public DB-00 sources plus owner-local DB-01/04 native evidence keep origin, world and collection semantics separate',async()=>{
  const db=await publicData();
  const joined=joinLocalGameSources(db,{
    db01:fakeDb01(db),expectedDb01SourceItemsSha256:DB01_SHA,
    nativeScope:fakeDb04(db),nativeScopePins:PINS
  });
  assert.equal(joined.contract,DB00_LOCAL_SOURCES_SCHEMA);
  assert.equal(joined.ownerLocalOnly,true);
  assert.equal(joined.publicationAuthorized,false);
  assert.equal(joined.privateDb01Connected,true);
  assert.equal(joined.privateDb04Connected,true);
  const first=await joined.getItem(ITEM);
  assert.equal(first.itemId,ITEM);
  assert.equal(first.originalDefinitionStatus,'source_native_definition');
  assert.equal(first.originalDefinition.nativeCategory,
    db.getItem(ITEM).catalog.nativeCategory??'ActivityItem');
  assert.equal(first.nativeWorldTagsCrossChecked,true);
  assert.deepEqual(first.shared.nativeTags.worldsDirect,[WORLD]);
  assert.deepEqual(first.originalDefinition.originalTags.facets.worldContextTag,[WORLD]);
  assert.equal(first.shared.catalog.facts.worlds.state,'unverified');
  assert.equal(first.shared.catalog.facts.category.state,'unverified');
  assert.equal(first.gameUiCategoryVerified,false);
  assert.equal(first.collectionUiMembershipVerified,false);
  assert.equal(first.acquisitionWorldVerified,false);
  assert.equal(first.dlcEntitlementVerified,false);
  assert.equal(first.playerOwnershipVerified,false);
  const byWorld=await joined.byNativeWorldTag(WORLD,{offset:0,limit:2});
  assert.deepEqual(byWorld.items.map(x=>x.itemId),[ITEM]);
  assert.equal(byWorld.items[0].nativeWorldTagsCrossChecked,true);
  assert.equal(byWorld.gameUiMembershipVerified,false);
  const outside=await joined.getItem('80000000');
  assert.equal(outside.shared.catalog,null);
  assert.equal(outside.originalDefinitionStatus,'source_native_definition');
  assert.equal(outside.originalDefinition.item.catalogDomain,'definition_unclassified');
  assert.equal(outside.shared.nativeTags.status,'outside_scope');
  assert(outside.shared.origins.some(x=>x.kind==='quest_reward'));
  assert.equal(outside.nativeWorldTagsCrossChecked,false);
  const sample=await joined.getItems([ITEM,'80000000',ITEM]);
  assert.deepEqual(sample.map(x=>x.itemId),[ITEM,'80000000',ITEM]);
  assert.equal(db.getItem(ITEM).catalog.facts.worlds.state,'unverified');
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(byWorld.items));
});
test('DB-01-only uses current-native source categories and original Collection candidates for paged public items without asserting a UI taxonomy',async()=>{
  const db=await publicData();
  const local=joinLocalGameSources(db,{
    db01:fakeDb01(db),expectedDb01SourceItemsSha256:DB01_SHA
  });
  const page=await local.queryPublishedItems([],{offset:0,limit:8});
  assert.equal(page.total,13202);
  assert.equal(page.items.length,8);
  assert(page.items.every(x=>x.originalDefinition?.item.catalogDomain==='item'));
  assert(page.items.every(x=>x.originalDefinitionStatus==='source_native_definition'));
  assert(page.items.every(x=>x.shared.nativeTags.status==='not_loaded'));
  assert.equal(page.gameUiMembershipVerified,false);
  assert.equal(page.nextOffset,8);
  assert.throws(()=>joinLocalGameSources(db,{
    db01:fakeDb01(db),expectedDb01SourceItemsSha256:'f'.repeat(64)
  }),/DB01_INDEPENDENT_CURRENT_PRIVATE_SOURCE_REQUIRED/);
  assert.throws(()=>joinLocalGameSources(db,{
    db01:fakeDb01(db,{version:'1.25.0'}),
    expectedDb01SourceItemsSha256:DB01_SHA
  }),/DB01_INDEPENDENT_CURRENT_PRIVATE_SOURCE_REQUIRED/);
  assert.throws(()=>joinLocalGameSources(db,{
    db01:fakeDb01(db,{tags:12000}),expectedDb01SourceItemsSha256:DB01_SHA
  }),/DB01_INDEPENDENT_CURRENT_PRIVATE_SOURCE_REQUIRED/);
  assert.throws(()=>joinLocalGameSources(db,{}),/OWNER_LOCAL_SOURCE_REQUIRED/);
  assert.throws(()=>joinLocalGameSources(db,{
    expectedDb01SourceItemsSha256:DB01_SHA,nativeScope:fakeDb04(db),
    nativeScopePins:PINS
  }),/DB01_PIN_WITHOUT_SOURCE/);
  assert.throws(()=>joinLocalGameSources(db,{
    nativeScope:fakeDb04(db),nativeScopePins:{...PINS,rowsSha256:'f'.repeat(64)}
  }),/DB04_INDEPENDENT_PRIVATE_SOURCE_PINS_REQUIRED/);
  await assert.rejects(local.getItems(Array(4097).fill(ITEM)),/INVALID_BATCH/);
});

test('identity and original World Tag disagreements fail closed without rewriting DB-00 current facts',async()=>{
  const db=await publicData();
  const nativeScope=fakeDb04(db);
  const badDb01=fakeDb01(db,{
    items:ids=>ids.map(id=>fakeDefinition(db,String(id),['IsEternityIsle']))
  });
  const mismatch=joinLocalGameSources(db,{
    db01:badDb01,expectedDb01SourceItemsSha256:DB01_SHA,
    nativeScope,nativeScopePins:PINS
  });
  await assert.rejects(mismatch.getItem(ITEM),/DB01_DB04_DIRECT_WORLD_TAG_CONFLICT/);
  const missing=joinLocalGameSources(db,{
    db01:fakeDb01(db,{items:ids=>ids.map(()=>null)}),
    expectedDb01SourceItemsSha256:DB01_SHA
  });
  await assert.rejects(missing.getItem(ITEM),/DB01_PUBLISHED_ITEM_IDENTITY_MISMATCH/);
  const swapped=joinLocalGameSources(db,{
    db01:fakeDb01(db,{items:ids=>ids.map(id=>fakeDefinition(db,'30000032',null))}),
    expectedDb01SourceItemsSha256:DB01_SHA
  });
  await assert.rejects(swapped.getItem(ITEM),/DB01_NATIVE_ITEM_ID_OR_STATUS_MISMATCH/);
  assert.equal(db.getItem(ITEM).catalog.facts.worlds.state,'unverified');
});
