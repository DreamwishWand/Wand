import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
test('exact default memory content is indexed separately from independently verified state-free acquisition routes',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const [a,c,d,m,i,o,g,e]=await Promise.all(['acquisition.memoryDefaultContentCandidates','acquisition.memoryDefaultContentSources',
  'source.DefaultItem','acquisition.memoryAppearance','acquisition.ordinaryQuestIntroSources','acquisition.questObjectiveGrantSources',
  'acquisition.conditionalQuestSources','acquisition.effectiveCategories'].map(f=>db.getFieldRows(f)));
 const defaults=new Map(d),memory=new Map(m),intro=new Map(i),objective=new Map(o),conditional=new Map(g),effective=new Map(e);
 const candidates=a.flatMap(([,ls])=>ls);
 assert.equal(a.length,94);assert.equal(candidates.length,113);
 assert.deepEqual(candidates.filter(l=>!l.shardIndexValid).map(l=>l.orbItemId).sort((a,b)=>a-b),[31500355,31500364]);
 for(const l of candidates){
   assert.deepEqual(l.defaultContent,defaults.get(l.orbItemId));
   assert.equal(l.defaultContent.ItemID,l.targetItemId);
   assert.equal(l.configuredShardCount,memory.get(l.targetItemId).configuredShardCount);
   assert.equal(l.shardIndex,l.defaultContent.State.MemoryShardIndex);
 }
 const expected=new Set();
 for(const l of candidates.filter(l=>l.shardIndexValid)){
   for(const p of intro.get(l.orbItemId)??[])if(p.sourcePath.includes('.Item.Item.Item'))expected.add(JSON.stringify([l.targetItemId,l.orbItemId,p.questId,p.sourcePath]));
   for(const p of objective.get(l.orbItemId)??[])if(p.category!==null)expected.add(JSON.stringify([l.targetItemId,l.orbItemId,p.sourceItemId,p.sourcePath]));
 }
 const actual=new Set();
 const ids=c.map(([id])=>id);assert(ids.length>0);
 const details=await readItemAcquisitionSourceDetails(db,ids,'ja');
 for(const [j,[id,links]] of c.entries()){
   assert.deepEqual(details[j].classificationExtensions.filter(x=>x.family==='memoryDefaultContent').map(x=>x.evidence),links);
   for(const l of links){
     assert.equal(l.targetItemId,id);assert(l.shardIndexValid);assert(l.explicitGrantStateAbsent);
     assert(effective.get(id).includes(l.category));assert.equal(l.currentAvailabilityVerified,false);
     assert.deepEqual(l.defaultContent,defaults.get(l.orbItemId));
     if(l.routeKind==='conditional_grant'){
       assert(conditional.get(l.orbItemId).some(p=>p.sourceItemId===l.sourceItemId&&p.sourcePath===l.sourcePath));
       const [src]=await db.getItemFields([l.sourceItemId],['source.GiveItem']);
       const idx=Number(l.sourcePath.match(/Items\[(\d+)\]/)[1]);
       assert.deepEqual(src.values['source.GiveItem'].Items[idx],{ItemID:l.orbItemId,Amount:l.configuredGrantAmount});
     }else actual.add(JSON.stringify([id,l.orbItemId,l.sourceItemId,l.sourcePath]));
   }
 }
 assert.deepEqual([...actual].sort(),[...expected].sort());
});
