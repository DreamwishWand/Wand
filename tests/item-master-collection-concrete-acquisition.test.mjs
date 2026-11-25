import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readCollectionConcreteAcquisition} from '../src/lib/collection/concrete-acquisition.ts';

test('concrete sources use canonical localized seed, machine and stall identities without full database downloads',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{
    requests.push(url);return new Response(await readFile('static'+url),{status:200});
  });
  const ids=[30400010,40800027,20100000];
  const names=await db.getItemFields(ids,['names.ja','names.en']);
  const crops=await readCollectionConcreteAcquisition(db,30200000,'ja');
  const honey=await readCollectionConcreteAcquisition(db,31100251,'ja');
  const stall=await readCollectionConcreteAcquisition(db,30200009,'ja');
  for(const [i,result,key] of [[0,crops,'configuredNames'],[1,honey,'configuredNames'],[2,stall,'candidateNames']]){
    const name=names[i].values['names.ja'];
    assert(typeof name==='string'&&name.length>0);
    assert(result[key].includes(name),name);
    assert.equal(result.locale,'ja');
    assert(result.configuredNames.every(x=>typeof x==='string'&&x.trim()));
    assert(result.candidateNames.every(x=>typeof x==='string'&&x.trim()));
  }
  const english=await readCollectionConcreteAcquisition(db,31100251,'en');
  assert(english.configuredNames.includes(names[1].values['names.en']));
  assert.equal(english.locale,'en');
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
});
