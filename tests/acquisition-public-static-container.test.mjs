import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  loadPinnedStaticContainerContents,hasPinnedStaticContainerEvidence,
  DB02_STATIC_CONTAINER_SCHEMA,DB02_STATIC_CONTAINER_FILE,
  DB02_STATIC_CONTAINER_BYTES,DB02_STATIC_CONTAINER_SHA
} from '../src/lib/acquisition/public-static-container.ts';

const source=readFileSync(new URL(
  '../static/acquisition/public/'+DB02_STATIC_CONTAINER_FILE,import.meta.url));
const fetcher=async url=>{
  assert.equal(url,'/Wand/acquisition/public/'+DB02_STATIC_CONTAINER_FILE);
  return new Response(source,{status:200});
};
const load=()=>loadPinnedStaticContainerContents('/Wand',fetcher);

test('original static container projection has exact 88/84 templates, 147/146/1 slot census and 115 Item IDs',async()=>{
  assert.equal(source.length,DB02_STATIC_CONTAINER_BYTES);
  assert.equal(createHash('sha256').update(source).digest('hex'),
    DB02_STATIC_CONTAINER_SHA);
  const doc=JSON.parse(source.toString('utf8'));
  assert.equal(doc.schema,DB02_STATIC_CONTAINER_SCHEMA);
  assert.equal(doc.source.originalProtoDbSha256,
    'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623');
  assert.equal(doc.source.originalFile,'StreamingAssets/protoDb.bin');
  assert.equal(doc.source.originalRecordType,'Meta.ContainerInventory');
  assert.equal(doc.source.slotListField,3);
  assert.equal(doc.source.slotItemIdField,1);
  assert.equal(doc.source.slotAmountField,2);
  assert.equal(doc.source.personalSaveContentsIncluded,false);
  assert.equal(doc.source.liveContentsVerified,false);
  assert.equal(doc.source.guaranteedLootVerified,false);
  const index=await load();
  assert(hasPinnedStaticContainerEvidence(index));
  assert(!hasPinnedStaticContainerEvidence({...index}));
  assert.equal(index.schema,DB02_STATIC_CONTAINER_SCHEMA);
  assert.equal(index.coverage.definitionRecords,88);
  assert.equal(index.coverage.populatedDefinitions,84);
  assert.equal(index.coverage.totalSourceSlots,147);
  assert.equal(index.coverage.populatedSourceSlots,146);
  assert.equal(index.coverage.blankSourceSlots,1);
  assert.equal(index.coverage.distinctItemIds,115);
  assert.equal(index.coverage.liveContentsVerified,false);
  assert.equal(index.coverage.containerSpawnVerified,false);
  assert.equal(index.coverage.guaranteedLootVerified,false);
  assert.equal(index.coverage.personalSaveContentsIncluded,false);
  assert.equal(index.origins.length,146);
  assert.equal(index.linkedItemIds.length,115);
  assert.equal(index.templates.length,88);
  assert.equal(index.templates.filter(x=>x.containsConfiguredItems).length,84);
  assert(index.linkedItemIds.every((id,i,arr)=>
    i===0||Number(arr[i-1])<Number(id)));
  assert(Object.isFrozen(index));
  assert(Object.isFrozen(index.origins));
  assert(Object.isFrozen(index.templates));
  assert(Object.isFrozen(index.linkedItemIds));
  assert(Object.isFrozen(index.coverage));
  for(const origin of index.origins){
    assert.equal(origin.kind,'loot');
    assert.equal(origin.routeStatus,'static_candidate_only');
    assert.equal(origin.availability,'not_live_verified');
    assert.equal(origin.source.kind,'verified_game_native');
    assert.equal(origin.source.sha256,doc.source.originalProtoDbSha256);
    assert.equal(origin.source.gameVersion,'1.26.2');
    assert.equal(origin.quantity>0,true);
    assert.equal(origin.price,null);
    assert.equal(origin.campaignId,null);
    assert(Object.isFrozen(origin));
    assert.equal(index.getOrigin(origin.originId)[0],origin);
    assert(index.getItemCandidates(origin.itemId).includes(origin));
  }
});
test('repeated Item IDs and one original blank slot remain exact without duplicate grants',async()=>{
  const index=await load();
  const vending=index.getTemplate('RLM_MonsterIncIP_Mike_010_VendingMachine03');
  assert(vending);
  assert.deepEqual(vending.slots.map(x=>x.sourceSlotIndex),[1,2,3,4]);
  assert.deepEqual(vending.slots.map(x=>x.itemId),
    ['30300135','30300135','30300135','30300045']);
  assert.equal(index.getTemplateOrigins(vending.name).length,4);
  assert.equal(index.getItemCandidates('30300135').filter(x=>
    x.name.includes(vending.name)).length,3);
  assert.deepEqual(index.getTemplate('MRQS_E01_060_Chest')?.slots
    .map(x=>[x.itemId,x.quantity]),[
    ['31500223',1],['31500223',1],['30300400',1],['30300429',1]
  ]);
  assert.deepEqual(index.getTemplate('CastleSecretRoomContainer01')?.slots
    .map(x=>[x.itemId,x.quantity]),[
    ['30800089',5],['30800093',4],['30200082',5],['30200003',3]
  ]);
  assert.deepEqual(index.getTemplate('Chest_16Slot')?.slots,[]);
  assert.deepEqual(index.getTemplate('Chest_32Slot')?.slots,[]);
  assert.deepEqual(index.getTemplate('Chest_48Slot')?.slots,[]);
  assert.deepEqual(index.getTemplate('Furniture_16Slot')?.slots,[]);
  assert.equal(index.getTemplate('NotAContainer'),null);
  assert.deepEqual(index.getTemplateOrigins('NotAContainer'),[]);
  assert.deepEqual(index.getItemCandidates('999999999'),[]);
  assert.deepEqual(index.getItemTemplateNames('999999999'),[]);
  assert(index.getItemTemplateNames('31500006').includes('RLM_Joy_010_StorageBag'));
  assert(Object.isFrozen(vending.slots));
  assert(Object.isFrozen(vending.slots[0]));
});
test('static configured contents cannot assert actual spawn, ownership or currently available loot',async()=>{
  const index=await load();
  const sourceId=index.getItemCandidates('31500006');
  assert(sourceId.length>=3);
  assert(sourceId.every(x=>x.routeStatus==='static_candidate_only'));
  assert(sourceId.every(x=>x.conditions.some(t=>
    t.includes('no runtime container instantiation'))));
  assert(sourceId.every(x=>x.source.kind==='verified_game_native'));
  assert(sourceId.every(x=>x.salePeriods.length===0));
  assert.equal(index.coverage.liveContentsVerified,false);
  assert.equal(index.coverage.guaranteedLootVerified,false);
  assert.equal(index.coverage.personalSaveContentsIncluded,false);
});
test('reject corrupt bytes and invalid Item IDs without leaking or using other sources',async()=>{
  const index=await load();
  const corrupt=Buffer.from(source);corrupt[90]^=1;
  await assert.rejects(loadPinnedStaticContainerContents('/Wand',
    async()=>new Response(corrupt,{status:200})),/PUBLIC_SHA/);
  await assert.rejects(loadPinnedStaticContainerContents('/Wand',
    async()=>new Response(source.subarray(1),{status:200})),/PUBLIC_SIZE/);
  let requested=false;
  await assert.rejects(loadPinnedStaticContainerContents('/Wand/../private',
    async()=>{requested=true;return new Response(source);}),/INVALID_BASE_PATH/);
  assert.equal(requested,false);
  assert.throws(()=>index.getItemCandidates('00031500006'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getItemCandidates(-1),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getItemCandidates(NaN),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getItemTemplateNames('314?'),/INVALID_ITEM_ID/);
});
