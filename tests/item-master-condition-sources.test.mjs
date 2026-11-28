import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createConditionSourceReader,readCommonConditionPointers} from '../src/lib/items/public-condition-sources.ts';

test('condition pointers preserve original operator codes, inversion and repeated edges',()=>{
  const raw={Operator:1,Conditions:[{CommonConditions:{Condition:2130000001,Inversed:true}},
    {SubConditions:{Operator:2,Conditions:[{CommonConditions:{Condition:2130000001}},
      {CommonConditions:{}},{MissionStatus:{Mission:2130000001}}]}}]};
  const links=readCommonConditionPointers(raw);
  assert.deepEqual(links.map(r=>[r.conditionItemId,r.operatorPath,r.inversed]),[
    [2130000001,[1],true],[2130000001,[1,2],null],[null,[1,2],null]]);
  assert.equal(links[1].sourcePath,'root.Conditions[1].SubConditions.Conditions[0].CommonConditions');
  assert.equal(links[0].original,raw.Conditions[0].CommonConditions);
  assert.deepEqual(readCommonConditionPointers({}),[]);
});

test('current canonical Condition graph preserves every original common pointer and resolves targets',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const reader=createConditionSourceReader(db);
  const ids=await db.findItemIdsByField('nativeCategory',{kind:'equals',value:'Condition'});
  assert.equal(ids.length,5440);
  const {roots,graph}=await reader.getForDefinitions(ids,'source.Conditions');
  assert.equal(graph.status,'indexed');
  const direct=roots.flatMap(r=>r.pointers);
  assert.equal(direct.length,275);
  assert.equal(roots.filter(r=>r.pointers.length).length,196);
  assert.equal(new Set(direct.map(r=>r.conditionItemId)).size,186);
  assert.equal(graph.nodes.length,186);
  assert(graph.nodes.every(n=>n.status==='indexed'));
  const byId=new Map(roots.map(r=>[r.sourceItemId,r]));
  for(const node of graph.nodes){
    assert.deepEqual(node.tree,byId.get(node.conditionItemId).tree);
    assert.deepEqual(node.pointers,byId.get(node.conditionItemId).pointers);
  }
  assert.equal(graph.runtimeTruthVerified,false);
  assert.equal(graph.mandatoryPrerequisitesVerified,false);
  const quest=await reader.getForDefinitions([2070000620,99999999,2130000001,2070000620],'source.AvailableConditions');
  assert.equal(quest.roots[1],null);
  assert.equal(quest.roots[2].status,'field_absent');
  assert.deepEqual(quest.roots[0],quest.roots[3]);
  assert.deepEqual(quest.roots[0].tree.Conditions,[{PlayerLevel:{PlayerLevel:1}},{RealmUnlocked:{Universe:2000500019}}]);
  const explicit=await reader.resolveTrees([{Conditions:[{CommonConditions:{Condition:99999999}},
    {CommonConditions:{Condition:2070000620}},{CommonConditions:{Condition:2130000001}}]}]);
  assert.equal(explicit.nodes.find(n=>n.conditionItemId===99999999).status,'missing_definition');
  assert.equal(explicit.nodes.find(n=>n.conditionItemId===2070000620).status,'not_condition');
  assert.equal(explicit.nodes.find(n=>n.conditionItemId===2130000001).status,'indexed');
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
});
