import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicQuestIndex} from '../src/lib/guide/public-guide.mjs';

test('Quest Guide related links preserve exact original Mission-group membership, not unlock prerequisites',async()=>{
  const index=verifyPublicQuestIndex(JSON.parse(await readFile(
    new URL('../static/guide/public/quest-index.json',import.meta.url),'utf8')));
  const groups=new Map();
  for(const row of index.quests){
    assert.equal(typeof row.groupId,'string');
    assert(Object.hasOwn(index.groups,row.groupId),'every source quest has source group');
    const entries=groups.get(row.groupId)||[];
    entries.push(row);
    groups.set(row.groupId,entries);
  }
  assert.equal(groups.size,271);
  const multiple=[...groups.values()].filter(x=>x.length>1);
  assert.equal(multiple.length,133);
  assert.equal(multiple.reduce((count,qs)=>count+qs.length,0),595);
  const welcome=index.quests.find(q=>q.id==='2070000620');
  assert(welcome);
  const related=groups.get(welcome.groupId).filter(q=>q.id!==welcome.id);
  assert.equal(related.length,13);
  assert(related.some(q=>q.id==='2070000629'));
  assert(related.every(q=>q.groupId===welcome.groupId),'do not join on character name or numeric ID proximity');
  const singleton=index.quests.find(q=>q.id==='2070000651');
  assert.equal(groups.get(singleton.groupId).length,1,
    'a singleton realm quest has no same-group links');
  assert(!Object.values(index.groups).some(g=>g.unlocked===true||g.prerequisite),
    'native group membership never proves which quest unlocks next');
});
