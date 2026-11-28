import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
test('memory loot source records retain exact piece and container reference including nested consumables',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const links=(await db.getFieldRows('acquisition.memoryLootSources')).flatMap(([id,ls])=>ls.map(l=>{assert.equal(l.targetItemId,id);return l;}));
 assert.equal(links.length,52);assert.equal(new Set(links.map(l=>l.targetItemId)).size,13);
 assert.equal(new Set(links.map(l=>l.tableItemId)).size,13);
 assert.equal(links.filter(l=>l.configuredOrbItemId!==null).length,16);
 const ids=[...new Set(links.map(l=>l.tableItemId))];
 const tables=new Map((await db.getItemFields(ids,['source.Rewards'])).map(r=>[r.itemId,r.values['source.Rewards']]));
 const refs=[...new Map(links.flatMap(l=>l.referrers).map(r=>[r.sourceItemId,r])).values()];
 assert.equal(refs.length,12);
 const refRows=new Map((await db.getItemFields(refs.map(r=>r.sourceItemId),[...new Set(refs.map(r=>r.sourcePath)),'sourceClass'])).map(r=>[r.itemId,r.values]));
 for(const l of links){
   const g=tables.get(l.tableItemId).SubLootTables[l.groupIndex],v=g.Items[l.itemIndex];
   const nested=l.configuredOrbItemId!==null;
   assert.equal(l.targetItemId,nested?v.State.ConsummableData.ItemID:v.ItemID);
   assert.equal(l.shardIndex,(nested?v.State.ConsummableData.State:v.State).MemoryShardIndex);
   assert.equal(l.minimumRolls,g.Min);assert.equal(l.maximumRolls,g.Max);
   assert.equal(l.guaranteedGrantVerified,false);assert.equal(l.currentAvailabilityVerified,false);
   for(const r of l.referrers){assert.equal(refRows.get(r.sourceItemId)[r.sourcePath],l.tableItemId);assert.equal(refRows.get(r.sourceItemId).sourceClass,r.sourceClass);}
 }
});
