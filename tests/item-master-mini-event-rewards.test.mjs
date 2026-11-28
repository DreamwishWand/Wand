import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
test('mini event association preserves all native eligible reward occurrences without claiming grants',async()=>{
 const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
 const bytes=await readFile('data/ddv/item-master/mini-event-rewards-steam-1.26.2.json');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'15e7e08a8eb1555a0e431512f4273a3275bb239ec9b453eb738915c4b624dc8d');
 const d=JSON.parse(bytes);
 const canonical=new Set((await db.getFieldRows('nativeCategory')).map(([id])=>id));
 const expected=d.events.flatMap(([name,index,record,payload,rewards])=>rewards.flatMap(([id,amount,priority],position)=>
   [3,8].includes(Math.floor(id/10000000))||!canonical.has(id)?[]:[JSON.stringify([id,name,index,record,payload,position,amount,priority])]));
 const rows=await db.getFieldRows('acquisition.miniEventRewardSources');
 const categories=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
 assert.equal(d.events.length,18);
 assert.equal(d.events.flatMap(r=>r[4]).length,166);
 assert.deepEqual(rows.flatMap(([id,links])=>links.map(l=>{
   assert(categories.get(id).includes('in_game_limited_event'));
   assert.equal(l.targetItemId,id);assert.equal(l.nativeTimeLimitedMembershipVerified,true);
   assert.equal(l.exactGrantMechanismVerified,false);assert.equal(l.guaranteedGrantVerified,false);assert.equal(l.currentAvailabilityVerified,false);
   return JSON.stringify([id,l.eventId,l.sourceRecordIndex,l.sourceRecordSha256,l.sourcePayloadSha256,l.sourcePosition,l.configuredAmount,l.featuringPriority]);
 })).sort(),expected.sort());
 console.log('DB01_MINI_EVENT_REWARDS_VERIFIED '+JSON.stringify({canonicalItems:rows.length,canonicalOccurrences:expected.length}));
});
