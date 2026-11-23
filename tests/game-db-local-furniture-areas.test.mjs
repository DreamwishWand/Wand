import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {
  joinLocalFurnitureCollectionAreaSources,
  DB00_LOCAL_FURNITURE_AREAS
} from '../src/lib/game-db/local-furniture-areas.ts';
import {
  DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA,
  DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS,
  DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
  DB01_ORIGINAL_FURNITURE_SET_SHA256,
  DB01_ORIGINAL_FURNITURE_TAG_SHA256,
  DB01_ORIGINAL_FURNITURE_IL2CPP_SHA256
} from '../src/lib/items/furniture-native-has-tag.ts';

const ROOT=new URL('../static/',import.meta.url);
const fetcher=async url=>{
  assert(url.startsWith('/Wand/')&&!url.includes('..'));
  try{return new Response(readFileSync(
    new URL(url.slice(6),ROOT)),{status:200});}
  catch{return new Response('not found',{status:404});}
};
let appPromise;
const app=()=>appPromise??=openPublicSharedGameSources('/Wand',fetcher);
const HASHES=Object.freeze({
  gameVersion:'1.26.2',
  sourceFurnitureSha256:DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
  sourceSetSha256:DB01_ORIGINAL_FURNITURE_SET_SHA256,
  sourceTagSha256:DB01_ORIGINAL_FURNITURE_TAG_SHA256,
  sourceIl2cppDumpSha256:DB01_ORIGINAL_FURNITURE_IL2CPP_SHA256,
  originalNativeClassCounts:Object.freeze(Object.fromEntries(
    Object.entries(DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS).map(
      ([key,value])=>[key,value.count]
    )
  ))
});
function original(itemId,originalNativeClass,nativeTags,setLookup){
  const original=Object.freeze({
    itemId,nativeKey:'source_furniture_'+itemId,
    originalNativeClass,
    tagsFieldNumber:DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS[
      originalNativeClass].tagsFieldNumber,
    nativeTags:Object.freeze(nativeTags),
    setLookup,
    nativeHasTagSchemaVerified:true,
    gameUiCollectionMembershipVerified:false,
    dlcEntitlementVerified:false
  });
  return Object.freeze({
    original,gameVersion:'1.26.2',
    input:Object.freeze({
      itemId,gameVersion:'1.26.2',
      nativeTags:original.nativeTags,setLookup:original.setLookup
    }),
    sourceShardHashVerified:true,
    gameUiCollectionMembershipVerified:false
  });
}
const records=new Map([
  [40000001,original(40000001,'LandscapingItemData',
    [2001200029],Object.freeze({kind:'not_ihas_set'}))],
  [40000002,original(40000002,'FurnitureItemData',
    [],Object.freeze({
      kind:'has_set',setItemId:20000020,
      definition:Object.freeze({
        kind:'original_set_definition',itemId:20000020,
        nativeTags:Object.freeze([2001200067])
      })
    }))],
  [40000003,original(40000003,'FurnitureAncientMachineItemData',
    [],Object.freeze({kind:'not_ihas_set'}))],
  [40000004,original(40000004,'FurnitureItemData',
    [],Object.freeze({
      kind:'has_set',setItemId:0,
      definition:Object.freeze({kind:'missing_original_set_definition'})
    }))]
]);
function localFurniture(){
  return Object.freeze({
    schema:DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA,
    source:HASHES,
    getItem:async id=>records.get(id)??null,
    hasTag:async()=>null
  });
}

test('DB-00 owner-local Furniture bridge reuses seven exact source class counts and public Steam area pins',async()=>{
  const pub=await app();
  const reader=joinLocalFurnitureCollectionAreaSources(pub,localFurniture());
  assert.equal(reader.contract,DB00_LOCAL_FURNITURE_AREAS);
  assert.equal(reader.snapshotId,pub.snapshotId);
  assert.equal(reader.sourceFurnitureDefinitions,6746);
  assert.equal(reader.positiveOriginalAreaTagsEvaluated,6);
  assert.equal(reader.ownerLocalOnly,true);
  assert.equal(reader.publicationAuthorized,false);
  assert.equal(reader.runtimeCollectionAreaMembershipVerified,false);
  assert(Object.isFrozen(reader));
  assert.equal(pub.hasPrivateGameSource,false);
  assert.equal(pub.originalCollectionAreas.sourceConfigCount,7);
});

test('direct tag matching and SetItemData.Tags inheritance use native IHasSet only',async()=>{
  const pub=await app();
  const reader=joinLocalFurnitureCollectionAreaSources(pub,localFurniture());
  const [direct,set,ancient,missingSet]=await reader.getItems([
    40000001,40000002,40000003,40000004
  ]);
  assert.equal(direct.sourceStatus,'verified_original_furniture');
  assert.equal(direct.furniture.original.originalNativeClass,'LandscapingItemData');
  assert.deepEqual(direct.positiveSourceTagMatches.map(x=>x.area.areaCode),[2]);
  assert.equal(direct.positiveSourceTagMatches[0].sourceMatchingBranch,'item_tags');
  assert.equal(direct.positiveSourceTagMatches[0].positiveSourceMatch,true);
  assert.equal(set.furniture.original.originalNativeClass,'FurnitureItemData');
  assert.deepEqual(set.positiveSourceTagMatches.map(x=>x.area.areaCode),[4097]);
  assert.equal(set.positiveSourceTagMatches[0].sourceMatchingBranch,'set_item_tags');
  assert.equal(set.positiveSourceTagMatches[0].originalHasTag.runtimeInputVerified,false);
  assert.equal(ancient.furniture.original.originalNativeClass,
    'FurnitureAncientMachineItemData');
  assert.deepEqual(ancient.positiveSourceTagMatches,[]);
  assert.deepEqual(missingSet.positiveSourceTagMatches,[]);
  for(const item of [direct,set,ancient,missingSet]){
    assert.equal(item.positiveNativeAreaTagConfigsEvaluated,6);
    assert.equal(item.allAreasNativeDefaultInputResolved,false);
    assert.equal(item.completeNativeGetAreaConfigsEvaluation,false);
    assert.equal(item.sourceCandidatesOnly,true);
    assert.equal(item.gameUiCollectionMembershipVerified,false);
    assert.equal(item.worldAvailabilityVerified,false);
    assert.equal(item.dlcEntitlementVerified,false);
    assert.equal(item.playerOwnershipVerified,false);
    assert.equal(item.shared.itemId,item.itemId);
    assert.deepEqual(item.shared,pub.getItem(item.itemId));
    assert(Object.isFrozen(item)&&Object.isFrozen(item.positiveSourceTagMatches));
  }
});

test('out-of-source Item lookup is empty candidate evidence, not Dreamlight fallback or unlocked world',async()=>{
  const pub=await app();
  const reader=joinLocalFurnitureCollectionAreaSources(pub,localFurniture());
  const nonFurniture=await reader.getItem(31000029);
  assert.equal(nonFurniture.itemId,'31000029');
  assert.equal(nonFurniture.furniture,null);
  assert.equal(nonFurniture.sourceStatus,'not_in_original_furniture');
  assert.deepEqual(nonFurniture.positiveSourceTagMatches,[]);
  assert.equal(nonFurniture.allAreasNativeDefaultInputResolved,false);
  assert.equal(nonFurniture.completeNativeGetAreaConfigsEvaluation,false);
  assert.equal(nonFurniture.gameUiCollectionMembershipVerified,false);
  const duplicate=await reader.getItems([40000001,40000001,31000029]);
  assert.equal(duplicate.length,3);
  assert.deepEqual(duplicate[0].positiveSourceTagMatches,
    duplicate[1].positiveSourceTagMatches);
  assert(Object.isFrozen(duplicate));
  await assert.rejects(reader.getItem('040000001'),
    /invalid numeric Item ID/);
  await assert.rejects(reader.getItems(new Array(257).fill(40000001)),
    /INVALID_ID_BATCH/);
});

test('stale, contradictory or fabricated Furniture class records are rejected rather than converted to UI membership',async()=>{
  const pub=await app();
  assert.throws(()=>joinLocalFurnitureCollectionAreaSources(pub,{
    ...localFurniture(),source:{...HASHES,sourceSetSha256:'bad'}
  }),/PINNED_ORIGINAL_FURNITURE_SOURCE_REQUIRED/);
  assert.throws(()=>joinLocalFurnitureCollectionAreaSources(pub,{
    ...localFurniture(),source:{...HASHES,originalNativeClassCounts:{
      ...HASHES.originalNativeClassCounts,FurnitureItemData:100
    }}
  }),/PINNED_ORIGINAL_FURNITURE_SOURCE_REQUIRED/);
  const item=original(40000005,'FenceAndRoadItemData',
    [2001200028],Object.freeze({kind:'not_ihas_set'}));
  const badRecord={...item,original:{...item.original,tagsFieldNumber:9}};
  const reader=joinLocalFurnitureCollectionAreaSources(pub,{
    ...localFurniture(),
    getItem:async id=>id===40000005?badRecord:null
  });
  await assert.rejects(reader.getItem(40000005),
    /ORIGINAL_FURNITURE_ITEM_OR_CLASS_MISMATCH/);
  const fabricatedUi={...item,gameUiCollectionMembershipVerified:true};
  const reader2=joinLocalFurnitureCollectionAreaSources(pub,{
    ...localFurniture(),
    getItem:async id=>id===40000005?fabricatedUi:null
  });
  await assert.rejects(reader2.getItem(40000005),
    /ORIGINAL_FURNITURE_ITEM_OR_CLASS_MISMATCH/);
});
