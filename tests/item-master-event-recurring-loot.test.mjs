import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
test('explicit event-active recurring ephemeral memory loot joins original item list and exact pieces',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const rows=await db.getFieldRows('acquisition.eventRecurringLootSources'),links=rows.flatMap(([,ls])=>ls);
 const expected=[[1520000976,2010000132,31300106,2090000462,130000270,6],[1520000986,2010000135,31300107,2090000461,130000269,6],
 [1520000987,2010000136,31300105,2090000460,130000268,6],[1520001860,2010000179,31300175,2090000724,130000407,10]];
 for(const [e,r,p,t,m,n] of expected){
  const found=links.filter(l=>l.sourceItemId===e&&l.targetItemId===m);
  assert.equal(found.length,n);assert.deepEqual(found.map(l=>l.shardIndex).sort((a,b)=>a-b),Array.from({length:n},(_,i)=>i));
  for(const l of found){assert.deepEqual([l.recurringEventItemId,l.ephemeralItemId,l.tableItemId],[r,p,t]);assert.equal(l.eventName,'MemoryMania_UI_2026');}
 }
 const cheshire=links.filter(l=>l.sourceItemId===1520001514),pieces=cheshire.filter(l=>l.targetItemId===130000375);
 assert.equal(cheshire.length,20);assert.equal(pieces.length,10);
 assert.deepEqual(pieces.map(l=>l.shardIndex).sort((a,b)=>a-b),Array.from({length:10},(_,i)=>i));
 assert.equal(cheshire.filter(l=>l.targetItemId===31500362).length,10);
 for(const l of cheshire){
   assert.deepEqual([l.recurringEventItemId,l.blockerItemId,l.tableItemId],[2010000160,40600303,2090000596]);
   assert.equal(l.eventName,'CheshireChaos');assert.equal(l.kind,'event_recurring_blocker_loot');
   assert.deepEqual([l.boundedLocalDateGate.conditionItemId,l.boundedLocalDateGate.missionItemId,
     l.boundedLocalDateGate.startLocalSeconds,l.boundedLocalDateGate.endLocalSeconds],
     [2130003317,2070000620,1746576000,1747785540]);
 }
 assert(!links.some(l=>[1520001515,1520001516,1520001517].includes(l.sourceItemId)));
 const ids=[...new Set(links.flatMap(l=>[l.sourceItemId,l.recurringEventItemId,l.ephemeralItemId??l.blockerItemId,l.tableItemId,
   ...(l.boundedLocalDateGate?[l.boundedLocalDateGate.conditionItemId]:[])]))];
 const data=new Map((await db.getItemFields(ids,['source.RecurringEvent','source.Conditions','source.ItemList','source.TreasureLootTable','source.RewardLootTableItemID','source.Rewards'])).map(r=>[r.itemId,r.values]));
 for(const l of links){
  assert.deepEqual(data.get(l.sourceItemId)['source.RecurringEvent'],l.recurringActivation);
  assert.deepEqual(data.get(l.sourceItemId)['source.Conditions'],l.conditions);
  const spawned=l.ephemeralItemId??l.blockerItemId;
  assert(data.get(l.recurringEventItemId)['source.ItemList'].Items.some(e=>e.ItemID===spawned&&e.Weight===l.configuredSpawnWeight));
  assert.equal(data.get(spawned)[l.blockerSourcePath??l.ephemeralSourcePath],l.tableItemId);
  if(l.boundedLocalDateGate)assert.deepEqual(data.get(l.boundedLocalDateGate.conditionItemId)['source.Conditions'],l.boundedLocalDateGate.original);
  if(l.orbItemId){assert.equal(l.orbItemId,31500362);assert.equal(l.configuredConsumableAmount,1);}
  const path=l.tableSourcePath.slice('source.Rewards'.length).match(/[A-Za-z_][A-Za-z0-9_]*|\d+/g);
  assert.equal(path.reduce((x,k)=>x[k],data.get(l.tableItemId)['source.Rewards']),l.targetItemId);
  assert.equal(l.guaranteedGrantVerified,false);assert.equal(l.currentAvailabilityVerified,false);
 }
 const details=await readItemAcquisitionSourceDetails(db,rows.map(([id])=>id),'ja');
 for(const [i,[,ls]] of rows.entries()){
  assert(details[i].effectiveCategories.includes('in_game_limited_event'));
  assert.deepEqual(details[i].classificationExtensions.filter(e=>e.family==='eventRecurringLoot').map(e=>e.evidence),ls);
 }
});
