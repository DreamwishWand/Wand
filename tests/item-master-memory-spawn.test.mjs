import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
test('all Custom direct spawn memory references preserve shard index and classify only positive reviewed quest gates',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const all=new Map(await db.getFieldRows('acquisition.memorySpawnSources'));
 const classified=new Map(await db.getFieldRows('acquisition.classifiedMemorySpawnSources'));
 assert.equal(all.size,53);assert.equal([...all.values()].flat().length,78);
 // Seven positive objective-completion spawn rows and two independently
 // reviewed secret step-completion rows. The AlwaysFalse route remains
 // unclassified; the non-Custom memory is deliberately outside this index.
 const newlyVerified=[1520000386,1520002372,1520002433,1520002513,1520002903,1520002904,1520002905,1520000999,1520002328].sort((a,b)=>a-b);
 const objectiveLinks=[...classified.values()].flat().filter(l=>l.questGates.some(g=>g.kind==='MissionObjectiveStatus'));
 assert.deepEqual(objectiveLinks.map(l=>l.sourceItemId).sort((a,b)=>a-b),newlyVerified.filter(n=>![1520000999,1520002328].includes(n)));
 assert.equal(classified.size,46);assert.equal([...classified.values()].flat().length,60);
 const verifiedSources=new Set([...classified.values()].flat().map(l=>l.sourceItemId));
 for(const n of newlyVerified)assert(verifiedSources.has(n));
 assert(!verifiedSources.has(1520000765));assert(!verifiedSources.has(1520002385));
 const missionIds=[...new Set(objectiveLinks.flatMap(l=>l.questGates.filter(g=>g.kind==='MissionObjectiveStatus').map(g=>g.questId)))];
 const missions=new Map((await db.getItemFields(missionIds,['source.Steps'])).map(r=>[r.itemId,r.values['source.Steps']]));
 for(const l of objectiveLinks)for(const g of l.questGates.filter(g=>g.kind==='MissionObjectiveStatus')){
   const p=g.original;
   assert.equal(p.Status,4);
   const step=missions.get(g.questId).find(s=>(s.StepID??0)===(p.StepID??0));
   const sub=step.SubSteps.find(s=>(s.SubStepID??0)===(p.SubStepID??0));
   assert(sub.Objectives.some(o=>(o.ObjectiveID??0)===(p.ObjectiveID??0)));
 }
 const realm=[...classified.values()].flat().filter(l=>l.kind==='realm_fixed_memory_spawn');
 assert.deepEqual(realm.map(l=>l.targetItemId).sort((a,b)=>a-b),Array.from({length:10},(_,i)=>130000247+i));
 assert.equal(realm.filter(l=>l.conditionItemIds.length).length,1);
 const extra=[...classified.values()].flat().filter(l=>l.kind==='quest_gated_memory_spawn'&&l.additionalGates.length);
 assert.deepEqual(extra.map(l=>l.sourceItemId).sort((a,b)=>a-b),[1520000067,1520000068,1520000110]);
 const links=[...all.values()].flat();
 const srcIds=[...new Set(links.map(l=>l.sourceItemId))].sort((a,b)=>a-b);
 const events=new Map((await db.getItemFields(srcIds,['source.Spawn','source.Conditions'])).map(r=>[r.itemId,r.values]));
 const invalid=links.filter(l=>!l.shardIndexValid);
 assert.equal(invalid.length,1);assert.equal(invalid[0].sourceItemId,1520002281);assert.equal(invalid[0].category,null);
 for(const l of links){
   const v=events.get(l.sourceItemId),s=v['source.Spawn'],r=s.RewardOverride;
   const nested=l.sourcePath.endsWith('ConsummableData.ItemID');
   assert.equal(l.targetItemId,nested?r.State.ConsummableData.ItemID:r.ItemID);
   assert.equal(l.shardIndex,(nested?r.State.ConsummableData.State:r.State).MemoryShardIndex);
   assert.deepEqual(l.conditions,v['source.Conditions']??null);assert.deepEqual(l.spawnLocation,s.SpawnLocationSource??null);
   for(const gate of l.additionalGates){const index=Number(gate.sourcePath.match(/Conditions\[(\d+)\]/)[1]);assert.deepEqual(gate.original,l.conditions.Conditions[index][gate.kind]);}
   assert.equal(l.configuredAmount,s.AmountToSpawn.Value.Value);
   assert.equal(l.currentAvailabilityVerified,false);assert.equal(l.guaranteedGrantVerified,false);
   assert.equal(l.sourceEventSha256,db.release.sourceFilesSha256.ConditionalEvent);
 }
 const ids=[...classified.keys()];const d=await readItemAcquisitionSourceDetails(db,ids,'ja');
 for(const [i,id] of ids.entries()){
   assert(d[i].effectiveCategories.includes('ordinary_gameplay'));
   const evidence=d[i].classificationExtensions.filter(e=>e.family==='memorySpawn');
   assert.deepEqual(evidence.map(e=>e.evidence),classified.get(id));
   for(const e of evidence){assert.equal(e.identity.nativeCategory,'ConditionalEvent');assert(e.relatedIdentities.some(r=>r.nativeCategory===(e.evidence.kind==='realm_fixed_memory_spawn'?'Scene':'Mission')));
     for(const n of e.evidence.characterItemIds)assert(e.relatedIdentities.some(r=>r.itemId===n&&r.nativeCategory==='Character'));}
 }
});
