import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {questGate} from '../tools/db-01-items/conditional-quest-acquisition.mjs';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
test('quest gate classification rejects non-positive, mixed, cyclic and unrecognized conditions',()=>{
  const kinds=new Map([[1,'ordinary_gameplay'],[2,'in_game_limited_event']]);
  const leaf={MissionCompleted:{Mission:1}},common=new Map([[10,{Conditions:[leaf]}],[11,{Conditions:[{CommonConditions:{Condition:11}}]}]]);
  const tree={Conditions:[{CommonConditions:{Condition:10}}, {SubConditions:{Operator:0,Conditions:[leaf]}}]};
  const found=questGate(tree,common,kinds);
  assert.equal(found.length,2);assert.equal(found[0].commonChain[0].conditionItemId,10);
  for(const v of [{Operator:1,Conditions:[leaf]},{Operator:2,Conditions:[leaf]},
    {Conditions:[{MissionCompleted:{Mission:1,Inversed:true}}]},
    {Conditions:[{CommonConditions:{Condition:11}}]},
    {Conditions:[leaf,{EventTime:{Event:'event'}}]},
    {Conditions:[{MissionCompleted:{Mission:3}}]},
    {Conditions:[leaf,{_unresolvedFields:[3]}]}])assert.equal(questGate(v,common,kinds),null);
});
test('conditional quest classification preserves only original positive grant references and exact published quest groups',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const q=JSON.parse(await readFile('static/guide/public/quest-index.json','utf8'));
  const e=JSON.parse(await readFile('static/guide/public/event-quest-links-1.26.2.json','utf8'));
  const events=new Set(Object.values(e.events).flat().map(Number)),quests=new Map(q.quests.map(r=>[Number(r.id),r]));
  const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const rows=catalog.has('acquisition.conditionalQuestSources')?await db.getFieldRows('acquisition.conditionalQuestSources'):[];
  const native=await db.getNativeAcquisitionCandidates(rows.map(([id])=>id));
  const effective=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
  for(const [i,[item,links]] of rows.entries())for(const l of links){
    assert(l.configuredAmount>0&&l.currentAvailabilityVerified===false&&l.guaranteedGrantVerified===false);
    assert(effective.get(item).includes(l.category));
    assert(native[i].some(([id,role,path])=>id===l.sourceItemId&&role===l.role&&path===l.sourcePath));
    assert(l.questGates.length>0);
    for(const g of l.questGates){
      assert.equal(g.category,l.category);assert(quests.has(g.questId));
      if(l.category==='in_game_limited_event')assert(events.has(g.questId));
      else{
        assert.equal(l.category,'ordinary_gameplay');assert(!events.has(g.questId));
        const quest=quests.get(g.questId),prefix=quest.internalName.split('!')[0];
        assert(['Village','Story','Realm'].includes(prefix));assert.equal(q.groups[quest.groupId].rawName.split('!')[0],prefix);
      }
    }
  }
  console.log('DB01_CONDITIONAL_QUEST_VERIFIED '+JSON.stringify({items:rows.length,occurrences:rows.reduce((n,[,links])=>n+links.length,0)}));
});
