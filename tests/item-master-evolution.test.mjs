import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
test('original evolution chains are searchable in both directions without inferring direct acquisition',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const source=JSON.parse(await readFile('data/ddv/item-master/evolution-sources-steam-1.26.2.json','utf8'));
 const chains=new Map(await db.getFieldRows('acquisition.evolutionChain'));
 const targets=new Map(await db.getFieldRows('acquisition.evolutionSource'));
 assert.equal(chains.size,4);assert.equal(targets.size,8);
 for(const c of source.chains){
   const links=chains.get(c.baseItemId);
   assert.equal(links.length,2);
   const ids=await db.findItemIdsByField('acquisition.evolutionBaseItemId',{kind:'equals',value:c.baseItemId});
   assert.deepEqual(ids,c.steps.map(s=>s.EvolvesInto).sort((a,b)=>a-b));
   for(const [i,step] of c.steps.entries()){
     const l=targets.get(step.EvolvesInto);
     assert.deepEqual(l,links[i]);assert.deepEqual(l.originalAction,step.EvolveAction);
     assert.equal(l.baseItemId,c.baseItemId);assert.equal(l.targetItemId,step.EvolvesInto);assert.equal(l.stepIndex,i);
     assert.equal(l.previousConfiguredTargetItemId,i?c.steps[i-1].EvolvesInto:null);
     assert.equal(l.sourceFileSha256,db.release.sourceFilesSha256[c.category]);
     assert.equal(l.requiresBaseItem,true);assert.equal(l.progressCounterSemanticsVerified,false);
     assert.equal(l.currentAvailabilityVerified,false);assert.equal(l.guaranteedGrantVerified,false);
   }
 }
 console.log('DB01_EVOLUTION_VERIFIED '+JSON.stringify({chains:chains.size,targets:targets.size}));
});
