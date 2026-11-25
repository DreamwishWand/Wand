import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';

test('reviewed ItemAmount references are bidirectional and costs never become acquisition rewards',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const specs=[
    ['Story','UnlockCost',39,106,true,false],
    ['Building','SpecificUnlockCost',73,73,false,false],
    ['Building','UnlockCost',23,23,true,false],
    ['DutyAch','CompletionRewards',5,5,true,true]
  ];
  const expected=[];
  for(const [category,field,count,occurrences,repeated,reward] of specs){
    const ids=await db.findItemIdsByField('nativeCategory',{kind:'equals',value:category});
    const rows=await db.getItemFields(ids,['source.'+field]);
    const selected=rows.filter(r=>r&&Object.hasOwn(r.values,'source.'+field));
    assert.equal(selected.length,count,category+'.'+field);
    let seen=0;
    for(const r of selected){
      const raw=r.values['source.'+field];
      const values=repeated?raw:[raw];
      assert(Array.isArray(values));
      for(const [i,v] of values.entries()){
        assert(Number.isSafeInteger(v.Id)&&v.Id>0);
        expected.push({source:r.itemId,target:v.Id,path:'source.'+field+(repeated?'['+i+']':'')+'.Id',reward,amount:v.Amount});
        seen++;
      }
    }
    assert.equal(seen,occurrences,category+'.'+field);
  }
  assert.equal(expected.length,207);
  assert.equal(expected.filter(e=>e.reward).length,5);
  assert(expected.some(e=>e.source===200000001&&e.target===31700101&&e.amount===5));
  assert(expected.some(e=>e.source===2110200000&&e.target===52000015&&e.amount===1));
  assert(expected.some(e=>e.path.includes('UnlockCost')&&e.amount===undefined));
  const origins=[...new Set(expected.map(e=>e.source))];
  const targets=[...new Set(expected.map(e=>e.target))];
  const [outgoing,incoming,rewards]=await Promise.all([
    db.getItemsReferences(origins,'outgoing'),db.getItemsReferences(targets,'incoming'),db.getNativeAcquisitionCandidates(targets)
  ]);
  const out=new Map(origins.map((id,i)=>[id,outgoing[i]]));
  const inc=new Map(targets.map((id,i)=>[id,incoming[i]]));
  const acq=new Map(targets.map((id,i)=>[id,rewards[i]]));
  for(const e of expected){
    assert.equal(out.get(e.source).filter(([id,p])=>id===e.target&&p===e.path).length,1,e.path);
    assert.equal(inc.get(e.target).filter(([id,p])=>id===e.source&&p===e.path).length,1,e.path);
    const links=acq.get(e.target).filter(([id,,p])=>id===e.source&&p===e.path);
    assert.deepEqual(links,e.reward?[[e.source,'duty_reward',e.path]]:[]);
  }
  for(const e of expected.filter(e=>e.reward)){
    const reverse=await db.findItemIdsByAcquisitionSource({family:'native',sourceItemId:e.source,role:'duty_reward'});
    assert(reverse.itemIds.includes(e.target));
    assert.equal(reverse.currentAvailabilityVerified,false);
  }
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
});
