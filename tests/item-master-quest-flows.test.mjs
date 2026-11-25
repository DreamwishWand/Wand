import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createCurrentQuestItemFlowReader} from '../src/lib/items/public-quest-item-flows.ts';

test('all 1517 original mission item-flow occurrences retain exact roles and reverse identity',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const reader=createCurrentQuestItemFlowReader(db);
  const meta=await reader.getMetadata();
  assert.equal(meta.total,1517);
  assert.deepEqual(meta.counts,{intro_grant:70,substep_handoff:293,post_mission_cleanup:824,additional_reward_loot:330});
  assert.equal(meta.itemCount,1352);assert.equal(meta.questCount,461);
  const quests=await db.findItemIdsByField('quest.itemFlows',{kind:'present'});
  const rows=await reader.getForQuests(quests);
  const occurrences=rows.flatMap(r=>r.occurrences);
  assert.equal(occurrences.length,1517);
  const ids=[...new Set(occurrences.map(r=>r.itemId))].sort((a,b)=>a-b);
  const reverse=await reader.getForItems(ids);
  assert.equal(reverse.flatMap(r=>r.occurrences).length,1517);
  for(const [i,row] of reverse.entries()){
    assert.equal(row.itemId,ids[i]);
    for(const flow of row.occurrences)assert.equal(flow.itemId,row.itemId);
  }
  assert.deepEqual(reverse.flatMap(r=>r.occurrences).sort((a,b)=>a.questId-b.questId||a.flowIndex-b.flowIndex),occurrences);
  const intro=occurrences.filter(r=>r.kind==='intro_grant');
  assert.equal(intro.filter(r=>r.selectorKind==='item_ingredient').length,2);
  assert(intro.some(r=>r.questId===2070000674&&r.itemId===80000000&&r.configuredAmount===2000));
  assert(intro.some(r=>r.questId===2070001666&&r.itemId===31100282&&r.configuredAmount===4&&r.selectorKind==='item_ingredient'));
  const handoff=occurrences.filter(r=>r.kind==='substep_handoff');
  assert.equal(handoff.filter(r=>r.keepItems).length,8);
  assert(handoff.some(r=>r.questId===2070000678&&r.itemId===80000000&&r.configuredAmount===2000));
  assert.equal(occurrences.filter(r=>r.kind==='post_mission_cleanup'&&r.itemId===31200032&&r.questId===2070000628).length,1);
  assert(occurrences.every(r=>r.guaranteedGrantVerified===false&&r.currentAvailabilityVerified===false));
  const [known,unknown,duplicate]=await reader.getForItems([31200032,99999999,31200032]);
  assert.equal(unknown,null);assert.deepEqual(known,duplicate);
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')||url.includes('/acquisition/public/')));
});
