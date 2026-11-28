import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
test('fixed memory treasure on each initial village grid preserves exact location and shard identity',async()=>{
 const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
 const d=JSON.parse(await readFile('data/ddv/item-master/initial-village-memory-treasures-steam-1.26.2.json','utf8'));
 const expected=d.rows.flatMap(([file,sha,es])=>es.map(e=>JSON.stringify([file,sha,...e]))).sort();
 const rows=await db.getFieldRows('acquisition.initialVillageMemoryTreasureSources');
 const cats=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
 assert.equal(rows.length,19);
 assert.deepEqual(rows.flatMap(([id,ls])=>ls.map(l=>{
   assert.equal(id,l.targetItemId);assert(cats.get(id).includes('ordinary_gameplay'));
   assert.equal(l.nativeRewardActionVerified,true);assert.equal(l.guaranteedGrantVerified,false);assert.equal(l.currentAvailabilityVerified,false);
   return JSON.stringify([l.sourceFile,l.sourceFileSha256,l.gridId,l.objectId,l.sourceItemId,l.x,l.y,l.targetItemId,l.shardIndex,l.configuredShardCount]);
 })).sort(),expected);
});
