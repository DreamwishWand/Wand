import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  loadPinnedNativeLootCandidates
} from '../src/lib/acquisition/public-native-loot.ts';
import {
  joinPinnedNativeObjectLoot,
  DB02_PUBLIC_NATIVE_OBJECT_LOOT_SCHEMA
} from '../src/lib/acquisition/public-native-loot-objects.ts';
import {
  nativeLootObjectReferenceIndex,
  DB02_LOOT_OBJECT_ORIGINAL_SHA256
} from '../src/lib/acquisition/native-loot-object-references.ts';

const data=readFileSync(new URL(
  '../static/acquisition/public/native-loot-candidates-1.26.2.json',
  import.meta.url
));
const fetcher=async url=>{
  assert.equal(url,'/Wand/acquisition/public/native-loot-candidates-1.26.2.json');
  return new Response(data,{status:200});
};

test('original source-verified 375 object references resolve 295 tables with 698 static Item candidates',async()=>{
  const loot=await loadPinnedNativeLootCandidates('/Wand',fetcher);
  const index=joinPinnedNativeObjectLoot(loot);
  assert.equal(index.schema,DB02_PUBLIC_NATIVE_OBJECT_LOOT_SCHEMA);
  assert.equal(index.gameVersion,'1.26.2');
  assert.equal(index.loot,loot);
  const c=index.coverage;
  assert.equal(c.originalGameVersion,'1.26.2');
  assert.equal(c.originalLootTables,960);
  assert.equal(c.originalLootItemReferences,3804);
  assert.equal(c.originalActivityItemObjectReferences,203);
  assert.equal(c.originalFurnitureObjectReferences,172);
  assert.equal(c.directObjectTableReferences,375);
  assert.equal(c.distinctSourceObjectItemIds,375);
  assert.equal(c.distinctReferencedLootTableIds,295);
  assert.equal(c.expandedStaticCandidateRelations,698);
  assert.equal(c.distinctCandidateItemIds,356);
  assert.equal(c.distinctObjectItemPairs,642);
  assert.equal(c.objectReferencesWithoutExplicitItemCandidates,9);
  assert.equal(c.conditionalCandidateRelations,0);
  assert.equal(c.dynamicFilteredCandidateRelations,0);
  assert.equal(c.eligibilityGatedCandidateRelations,5);
  assert.equal(c.sourceObjectTableIdsVerified,true);
  assert.equal(c.sourceLootTableMembershipVerified,true);
  assert.equal(c.actualDropVerified,false);
  assert.equal(c.playerUnlockVerified,false);
  assert.equal(c.sourceFamiliesComplete,false);
  assert.equal(index.candidateRelations.length,698);
  assert.equal(index.listSourceObjectItemIds().length,375);
  assert.equal(index.listReferencedLootTableIds().length,295);
  assert.equal(index.listCandidateItemIds().length,356);
  assert.equal(new Set(index.candidateRelations.map(x=>
    x.sourceObjectItemId+':'+x.itemId)).size,642);
  assert.equal(new Set(index.candidateRelations.map(x=>
    x.sourceObjectItemId+':'+x.lootPathId)).size,698);
  assert(Object.isFrozen(index)&&Object.isFrozen(index.coverage)&&
    Object.isFrozen(index.candidateRelations)&&
    Object.isFrozen(index.listCandidateItemIds()));
  for(const row of index.candidateRelations){
    assert.equal(row.routeStatus,'static_candidate_only');
    assert.equal(row.objectTableReferenceVerified,true);
    assert.equal(row.candidateTableMembershipVerified,true);
    assert.equal(row.gameplayAcquisitionContextVerified,false);
    assert.equal(row.actualDropVerified,false);
    assert.equal(row.currentAvailabilityVerified,false);
    assert.equal(row.playerOwnershipVerified,false);
    assert.equal(row.nativeObjectReference.lootTableId,row.lootTableId);
    assert.equal(row.nativeLootCandidate.tableId,row.lootTableId);
    assert.equal(row.nativeLootCandidate.itemId,row.itemId);
    assert(index.getItemObjectCandidates(row.itemId).includes(row));
    assert(index.getObjectCandidateItems(row.sourceObjectItemId).includes(row));
    assert(index.getTableObjectCandidates(row.lootTableId).includes(row));
    assert(Object.isFrozen(row));
  }
});
test('exact native ActivityItem and Furniture source fields are retained separately',async()=>{
  const index=joinPinnedNativeObjectLoot(
    await loadPinnedNativeLootCandidates('/Wand',fetcher));
  const ref=index.getObjectTableReferences('31300003');
  assert.equal(ref.length,1);
  assert.equal(ref[0].sourceFamily,'ActivityItem');
  assert.equal(ref[0].sourceWirePath,'protobuf.9');
  assert.equal(ref[0].sourceOriginalSha256,DB02_LOOT_OBJECT_ORIGINAL_SHA256.activityItem);
  assert.equal(ref[0].lootTableId,'2090000003');
  assert.deepEqual(index.getObjectCandidateItems('31300003').map(x=>x.itemId),
    ['31700017','30400010','80000000','31700022']);
  const direct=index.getItemObjectCandidates('31700017');
  assert(direct.some(x=>x.sourceObjectItemId==='31300003'&&
    x.lootPathId==='loot:2090000003:0:0'&&
    x.nativeLootCandidate.groupIndex===0));
  assert(index.getTableObjectReferences('2090000003').some(x=>
    x.sourceObjectItemId==='31300003'));
  const furnitureRef=index.getObjectTableReferences('31500371');
  assert(furnitureRef.length>0);
  assert.equal(furnitureRef[0].sourceFamily,'Furniture');
  assert.equal(furnitureRef[0].sourceWirePath,'protobuf.12');
  assert.equal(furnitureRef[0].sourceOriginalSha256,
    DB02_LOOT_OBJECT_ORIGINAL_SHA256.furniture);
  assert.equal(furnitureRef[0].sourceFile,'itemlist/Furniture.json');
  assert.equal(nativeLootObjectReferenceIndex.coverage.distinctObjectItemIds,375);
  assert.deepEqual(index.getObjectTableReferences(99999999),[]);
  assert.deepEqual(index.getObjectCandidateItems(99999999),[]);
  assert.deepEqual(index.getItemObjectCandidates(99999999),[]);
  assert.deepEqual(index.getTableObjectCandidates(2090999999),[]);
});
test('some native objects have a valid LootTable reference with no explicit Item rows',async()=>{
  const index=joinPinnedNativeObjectLoot(
    await loadPinnedNativeLootCandidates('/Wand',fetcher));
  const empty=index.listSourceObjectItemIds().filter(objectId=>
    index.getObjectCandidateItems(objectId).length===0);
  assert.equal(empty.length,9);
  for(const id of empty){
    const refs=index.getObjectTableReferences(id);
    assert(refs.length>0);
    assert(refs.every(x=>x.sourceDefinitionRefVerified===true&&
      x.actualDropVerified===false));
    assert.deepEqual(index.getObjectCandidateItems(id),[]);
  }
});
test('only pinned LootTable evidence is accepted; unknown canonical IDs fail closed',async()=>{
  const loot=await loadPinnedNativeLootCandidates('/Wand',fetcher);
  assert.throws(()=>joinPinnedNativeObjectLoot({...loot}),
    /PINNED_ORIGINAL_SOURCE_REQUIRED/);
  assert.throws(()=>joinPinnedNativeObjectLoot(null),
    /PINNED_ORIGINAL_SOURCE_REQUIRED/);
  const joined=joinPinnedNativeObjectLoot(loot);
  assert.throws(()=>joined.getItemObjectCandidates('-5'),/INVALID_ITEM_ID/);
  assert.throws(()=>joined.getObjectCandidateItems('031300003'),/INVALID_ITEM_ID/);
  assert.throws(()=>joined.getTableObjectReferences(0),/INVALID_ITEM_ID/);
});
