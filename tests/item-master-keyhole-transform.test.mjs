import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
test('original keyhole transformation targets and all material requirements are selectable without asserting ownership',async()=>{
 const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
 const d=JSON.parse(await readFile('data/ddv/item-master/keyhole-transform-steam-1.26.2.json','utf8'));
 assert.equal(createHash('sha256').update(JSON.stringify(d.rows)).digest('hex'),'a30c153bd4769c36b0f3f881b5dc4a01d4f8b8b492794a440245afef47872082');
 const canonical=new Set((await db.getFieldRows('nativeCategory')).map(([id])=>id));
 const expected=d.rows.filter(r=>canonical.has(r[2])).map(r=>JSON.stringify(r)).sort();
 const rows=await db.getFieldRows('acquisition.keyholeTransformSources');
 assert.deepEqual(rows.flatMap(([id,links])=>links.map(e=>{
   assert.equal(e.targetItemId,id);assert.equal(e.inventoryGrantVerified,false);assert.equal(e.currentAvailabilityVerified,false);
   return JSON.stringify([e.sourceRecordIndex,e.keyholeId,id,e.isBlueprint,e.keepItemsPlacement,e.transferToBackpack,e.trackOnlyBackpack,+e.activeWhenPresent,+e.activeWhenNonempty,
      e.requirementLevels.map(l=>[l.partialSize,l.partialNoRepeatSize,l.neededItems.map(n=>[n.itemId,n.configuredAmount,+n.statePresent])])]);
 })).sort(),expected);
 const details=await readItemAcquisitionSourceDetails(db,rows.map(([id])=>id),'ja');
 for(const [i,detail] of details.entries()){
   assert.equal(detail.keyholeTransformStatus,'indexed');
   assert.deepEqual(detail.keyholeTransforms.map(x=>x.evidence),rows[i][1]);
   for(const x of detail.keyholeTransforms){
     const expected=[...new Set(x.evidence.requirementLevels.flatMap(l=>l.neededItems.filter(n=>n.canonicalItemResolved).map(n=>n.itemId)))];
     assert.deepEqual(x.materialIdentities.map(x=>x.itemId),expected);
   }
 }
});
