import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
test('active seasonal loot bags and exact rewards use the same acquisition category for every item family',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const entries=await db.getFieldRows('acquisition.eventLootPresentSources');
 const links=entries.flatMap(([id,ls])=>ls.map(l=>{assert.equal(l.targetItemId,id);return l}));
 const events=new Set(links.map(l=>l.sourceItemId));
 const legacy=links.filter(l=>l.spawnSourcePath==='source.Spawn.LootPresentItem.Item.Item.Item');
 const overrides=links.filter(l=>l.spawnSourcePath==='source.Spawn.RewardOverride.ItemID');
 assert.equal(events.size,25);
 assert.equal(legacy.filter(l=>l.kind==='event_loot_present_spawn').length,11);
 assert.equal(legacy.filter(l=>l.kind==='event_loot_present_reward').length,11);
 const overrideSources=overrides.filter(l=>l.kind==='event_loot_present_override');
 assert.equal(overrideSources.length,14);
 assert.equal(overrideSources.filter(l=>l.precursors.some(p=>p.kind==='event_fishing_result')).length,7);
 assert.equal(overrideSources.filter(l=>l.precursors.some(p=>p.kind==='event_quest_blocker_note')).length,7);
 const memory=overrides.filter(l=>l.kind==='event_loot_present_reward'&&l.targetItemId>=130000000&&l.targetItemId<140000000);
 assert.deepEqual([...new Set(memory.map(l=>l.targetItemId))].sort((a,b)=>a-b),[130000385,130000444]);
 assert.equal(memory.length,56);
 for(const l of memory)assert(l.shardIndex>=0&&l.shardIndex<l.configuredShardCount);
 assert.deepEqual(links.filter(l=>l.kind==='event_loot_present_memory_payload').map(l=>l.targetItemId).sort((a,b)=>a-b),[130000333,130000409]);
 const src=new Map((await db.getItemFields([...events],['source.Spawn','source.Conditions'])).map(r=>[r.itemId,r.values]));
 const tables=new Map((await db.getItemFields([...new Set(links.map(l=>l.tableItemId))],['source.Rewards'])).map(r=>[r.itemId,r.values]));
 const bags=new Map((await db.getItemFields([...new Set(links.map(l=>l.bagItemId))],['source.LootTableItemID'])).map(r=>[r.itemId,r.values]));
 for(const l of links){
   const spawn=src.get(l.sourceItemId)['source.Spawn'];
   if(l.spawnSourcePath==='source.Spawn.RewardOverride.ItemID'){
     assert.deepEqual(spawn.RewardOverride,l.rewardOverride);
     assert.equal(spawn.RewardOverride.ItemID,l.bagItemId);
     assert.equal(spawn.FurnitureItem.Item.Item.Item,l.blockerItemId);
     assert.deepEqual(spawn.RewardOverride.State.LootPresentData,{});
     assert.equal(l.conditions.Conditions[0].Inventory.Item,l.inventoryItemId);
   }else assert.equal(spawn.LootPresentItem.Item.Item.Item,l.bagItemId);
   assert.deepEqual(src.get(l.sourceItemId)['source.Conditions'],l.conditions);
   assert.equal(bags.get(l.bagItemId)['source.LootTableItemID'],l.tableItemId);
   if(l.tableSourcePath){
     const path=l.tableSourcePath.slice('source.Rewards'.length).match(/[A-Za-z_][A-Za-z0-9_]*|\d+/g);
     assert.equal(path.reduce((x,k)=>x[k],tables.get(l.tableItemId)['source.Rewards']),l.targetItemId);
   }
   assert.equal(l.currentAvailabilityVerified,false);assert.equal(l.guaranteedGrantVerified,false);
 }
 const precursorIds=[...new Set(overrideSources.flatMap(l=>l.precursors.map(p=>p.sourceItemId)))];
 const precursorRows=new Map((await db.getItemFields(precursorIds,['source.Conditions','source.Result','source.Spawn'])).map(r=>[r.itemId,r.values]));
 for(const l of overrideSources)for(const p of l.precursors){
   const src=precursorRows.get(p.sourceItemId);
   assert.deepEqual(src['source.Conditions'],p.originalConditions);
   assert.equal(p.kind==='event_fishing_result'?src['source.Result'].ItemID:src['source.Spawn'].RewardOverride.ItemID,l.inventoryItemId);
   assert.equal(p.eventName,l.eventName);
 }
 const ids=entries.map(([id])=>id),d=await readItemAcquisitionSourceDetails(db,ids,'ja');
 for(const [i,[id,ls]] of entries.entries()){
   assert(d[i].effectiveCategories.includes('in_game_limited_event'));
   assert.deepEqual(d[i].classificationExtensions.filter(e=>e.family==='eventLootPresent').map(e=>e.evidence),ls);
 }
});
