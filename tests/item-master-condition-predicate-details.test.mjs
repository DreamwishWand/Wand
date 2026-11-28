import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readConditionPredicateDetails} from '../src/lib/items/public-condition-predicate-details.ts';

test('canonical condition predicates preserve logical branches and resolve only audited item IDs',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{
    requests.push(url);return new Response(await readFile('static'+url),{status:200});
  });
  const raw={Operator:1,Conditions:[
    {MissionStatus:{Mission:2070000620,Operator:0,State:8}},
    {SubConditions:{Operator:2,Conditions:[
      {CharacterFriendship:{Character:10000004,Operator:5,FriendshipLevel:10}},
      {Expansion:{ExpansionName:'Expansion04',Inversed:true}},
      {MissionStatus:{Mission:99999999,Operator:17,State:99}},
      {MissionStatus:{Mission:10000004}},
      {Unknown:{Item:2070000620}}]}}]};
  const [tree,missing,empty]=await readConditionPredicateDetails(db,[raw,null,{}],'ja');
  assert.equal(missing,null);assert.equal(empty.operator,null);assert.deepEqual(empty.children,[]);
  assert.equal(tree.operator,'OR');
  const first=tree.children[0].predicate;
  assert.equal(first.comparison,'Equal');assert.equal(first.missionState,'Completed');
  assert.equal(first.targets[0].status,'resolved');
  assert.equal(first.targets[0].name,(await db.getItemFields([2070000620],['names.ja']))[0].values['names.ja']??null);
  const sub=tree.children[1].branch;
  assert.equal(sub.operator,'NOT');
  const [friend,exp,unknown,wrong,other]=sub.children.map(c=>c.predicate);
  assert.equal(friend.comparison,'GreaterThanOrEqual');assert.equal(friend.original.FriendshipLevel,10);
  assert.equal(friend.targets[0].status,'resolved');
  assert.equal(exp.inversed,true);assert.equal(exp.original.ExpansionName,'Expansion04');
  assert.equal(unknown.comparison,null);assert.equal(unknown.missionState,null);
  assert.equal(unknown.targets[0].status,'missing_definition');
  assert.equal(wrong.targets[0].status,'category_mismatch');
  assert.equal(wrong.targets[0].name,null);assert.deepEqual(other.targets,[]);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')));
});

test('all native common-condition definitions retain every reviewed canonical reference path',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const ids=await db.findItemIdsByField('nativeCategory',{kind:'equals',value:'Condition'});
  const [rows,edges]=await Promise.all([db.getItemFields(ids,['source.Conditions']),db.getItemsReferences(ids,'outgoing')]);
  const trees=rows.map(r=>r.values['source.Conditions']??null);
  const details=await readConditionPredicateDetails(db,trees,'en');
  const collect=branch=>branch?branch.children.flatMap(c=>c.type==='branch'?collect(c.branch):c.predicate.targets):[];
  const key=([id,path])=>JSON.stringify([id,path]);
  for(const [i,tree] of details.entries()){
    assert.deepEqual(tree?.original??null,trees[i]);
    const expected=edges[i].filter(([,p])=>p.startsWith('source.Conditions.'));
    const actual=collect(tree).filter(r=>r.status==='resolved').map(r=>[r.itemId,r.sourceField.replace(/^root/,'source.Conditions')]);
    // Generic ItemID references may include other source fields; every
    // interpreted typed reference must be present in the canonical graph.
    const index=new Set(expected.map(key));
    for(const e of actual)assert(index.has(key(e)),JSON.stringify(e));
  }
  const count=details.flatMap(collect).filter(r=>r.status==='resolved').length;
  assert(count>=4960+275,'expected original Mission and CommonConditions reference census');
});
