import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
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
 const baseIds=[...chains.keys()],targetIds=[...targets.keys()];
 const details=await readItemAcquisitionSourceDetails(db,[...baseIds,...targetIds],'ja');
 for(const [i,base] of baseIds.entries()){
   const d=details[i];assert.equal(d.evolutionStatus,'indexed');assert.equal(d.evolutionSource,null);
   assert.deepEqual(d.evolutionChain.map(l=>l.evidence),chains.get(base));
   assert.deepEqual(d.evolutionChain.map(l=>l.targetIdentity.itemId),chains.get(base).map(l=>l.targetItemId));
   assert(d.evolutionChain.every(l=>l.targetIdentity.locale==='ja'));
 }
 for(const [i,target] of targetIds.entries()){
   const d=details[baseIds.length+i];assert.equal(d.evolutionStatus,'indexed');assert.deepEqual(d.evolutionChain,[]);
   assert.deepEqual(d.evolutionSource.evidence,targets.get(target));assert.equal(d.evolutionSource.baseIdentity.itemId,targets.get(target).baseItemId);
   assert.equal(d.evolutionSource.baseIdentity.locale,'ja');
 }
 console.log('DB01_EVOLUTION_VERIFIED '+JSON.stringify({chains:chains.size,targets:targets.size}));
});


test('evolution acquisition inherits only independently classified base routes',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
 const categories=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
 const targets=new Map(await db.getFieldRows('acquisition.evolutionSource'));
 const links=catalog.has('acquisition.evolutionAcquisitionSources')?new Map(await db.getFieldRows('acquisition.evolutionAcquisitionSources')):new Map();
 let count=0;
 for(const [id,e] of targets){
   const base=categories.get(e.baseItemId)??[];
   const routes=links.get(id)??[];
   assert.deepEqual(routes.map(r=>r.category),base);
   if(routes.length)count++;
   for(const route of routes){
     assert.equal(route.sourceItemId,e.baseItemId);assert.equal(route.targetItemId,id);
     assert.equal(route.configuredGrantAmount,1);assert.equal(route.nativeCompletionVerified,true);
     assert.equal(route.directAcquisitionVerified,false);assert.equal(route.sourceCategoryInherited,true);
     assert.equal(route.guaranteedGrantVerified,false);
     assert(categories.get(id).includes(route.category));
   }
 }
 assert.equal(links.size,count);
 console.log('DB01_EVOLUTION_ACQUISITION_VERIFIED '+JSON.stringify({classifiedTargets:count,total:targets.size}));
});
