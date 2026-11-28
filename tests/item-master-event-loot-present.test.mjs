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
 assert.equal(events.size,11);
 assert.equal(links.filter(l=>l.kind==='event_loot_present_spawn').length,11);
 assert.equal(links.filter(l=>l.kind==='event_loot_present_reward').length,11);
 assert.deepEqual(links.filter(l=>l.kind==='event_loot_present_memory_payload').map(l=>l.targetItemId).sort((a,b)=>a-b),[130000333,130000409]);
 const src=new Map((await db.getItemFields([...events],['source.Spawn','source.Conditions'])).map(r=>[r.itemId,r.values]));
 const tables=new Map((await db.getItemFields([...new Set(links.map(l=>l.tableItemId))],['source.Rewards'])).map(r=>[r.itemId,r.values]));
 const bags=new Map((await db.getItemFields([...new Set(links.map(l=>l.bagItemId))],['source.LootTableItemID'])).map(r=>[r.itemId,r.values]));
 for(const l of links){
   assert.equal(src.get(l.sourceItemId)['source.Spawn'].LootPresentItem.Item.Item.Item,l.bagItemId);
   assert.deepEqual(src.get(l.sourceItemId)['source.Conditions'],l.conditions);
   assert.equal(bags.get(l.bagItemId)['source.LootTableItemID'],l.tableItemId);
   if(l.tableSourcePath){
     const path=l.tableSourcePath.slice('source.Rewards'.length).match(/[A-Za-z_][A-Za-z0-9_]*|\d+/g);
     assert.equal(path.reduce((x,k)=>x[k],tables.get(l.tableItemId)['source.Rewards']),l.targetItemId);
   }
   assert.equal(l.currentAvailabilityVerified,false);assert.equal(l.guaranteedGrantVerified,false);
 }
 const ids=entries.map(([id])=>id),d=await readItemAcquisitionSourceDetails(db,ids,'ja');
 for(const [i,[id,ls]] of entries.entries()){
   assert(d[i].effectiveCategories.includes('in_game_limited_event'));
   assert.deepEqual(d[i].classificationExtensions.filter(e=>e.family==='eventLootPresent').map(e=>e.evidence),ls);
 }
});
