import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
test('profile level rewards preserve original threshold and amount for both level systems',async()=>{
 const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
 const d=JSON.parse(await readFile('data/ddv/item-master/profile-level-rewards-steam-1.26.2.json','utf8'));
 const expected=d.tables.flatMap(t=>t.levels.filter(([level])=>level>1).flatMap(([level,points,rewards])=>rewards.map(([id,amount])=>JSON.stringify([id,t.kind,level,points,amount]))));
 const rows=await db.getFieldRows('acquisition.profileLevelRewardSources');
 const categories=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
 assert.equal(rows.length,57);assert.equal(expected.length,58);
 assert.deepEqual(rows.flatMap(([id,links])=>links.map(l=>{
   assert(categories.get(id).includes('ordinary_gameplay'));assert.equal(l.targetItemId,id);
   assert.equal(l.guaranteedGrantVerified,false);assert.equal(l.currentAvailabilityVerified,false);
   return JSON.stringify([id,l.kind,l.level,l.configuredPoints,l.configuredAmount]);
 })).sort(),expected.sort());
 assert.equal(new Map(rows).get(80100000).filter(l=>l.kind==='designer_level_reward').length,2);
});
