import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createCurrentQuestItemFlowReader} from '../src/lib/items/public-quest-item-flows.ts';
test('ordinary quest intro source classification exactly covers verified story and friendship grant paths',async()=>{
  const read=async p=>JSON.parse(await readFile(p,'utf8'));
  const [q,e,raw]=await Promise.all([
    read('static/guide/public/quest-index.json'),
    read('static/guide/public/event-quest-links-1.26.2.json'),
    read('data/ddv/item-master/original-quest-intro-grants-steam-1.26.2.json')
  ]);
  const eventIds=new Set(Object.values(e.events).flat().map(Number));
  const quests=new Map(q.quests.map(v=>[Number(v.id),v]));
  const accepted=raw.filter(([qid])=>{
    const r=quests.get(qid);
    return r&&!eventIds.has(qid)&&['Village','Story','Realm'].includes(r.internalName.split('!')[0])&&
      q.groups[r.groupId].rawName.split('!')[0]===r.internalName.split('!')[0];
  });
  assert.equal(raw.length,70);assert.equal(accepted.length,67);
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const evidence=await db.getFieldRows('acquisition.ordinaryQuestIntroSources');
  assert.equal(evidence.length,new Set(accepted.map(r=>r[2])).size);
  const effective=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
  const previous=new Map(await db.getFieldRows('acquisition.categories'));
  const key=(qid,id,amount)=>JSON.stringify([qid,id,amount]);
  const actual=evidence.flatMap(([id,links])=>links.map(l=>key(l.questId,id,l.configuredAmount)));
  assert.deepEqual(actual.sort(),accepted.map(([qid,,id,amount])=>key(qid,id,amount)).sort());
  const reader=createCurrentQuestItemFlowReader(db);
  const rows=await reader.getForItems(evidence.map(([id])=>id));
  for(const [i,[id,links]] of evidence.entries()){
    assert(effective.get(id).includes('ordinary_gameplay'));
    for(const l of links){
      assert.equal(l.guaranteedGrantVerified,false);assert.equal(l.currentAvailabilityVerified,false);
      assert.equal(l.sourceMissionSha256,db.release.sourceFilesSha256.Mission);
      assert(rows[i].occurrences.some(o=>o.questId===l.questId&&o.flowIndex===l.flowIndex&&
        o.sourcePath===l.sourcePath&&o.kind==='intro_grant'&&o.configuredAmount===l.configuredAmount));
      assert(!eventIds.has(l.questId));
    }
  }
  assert(!evidence.some(([,l])=>l.some(r=>r.questId===2070000952)));
  assert(evidence.filter(([id])=>!previous.has(id)).length>0);
});
