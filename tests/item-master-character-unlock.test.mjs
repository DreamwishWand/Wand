import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
test('original character modes and native character unlock action cover all direct and owner-target routes',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const modes=new Map(await db.getFieldRows('acquisition.characterUnlockMode'));
 const sources=new Map(await db.getFieldRows('acquisition.characterUnlockSources'));
 const steps=new Map(await db.getFieldRows('source.Steps'));
 const owners=new Map(await db.getFieldRows('source.OwnerCharacter'));
 const effective=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
 assert.equal(modes.size,142);
 const residents=[...modes].filter(([,m])=>m.residentRouteEligible);
 assert.equal(residents.length,79);
 assert.deepEqual(residents.filter(([,m])=>m.unlockConditionCode===1).map(([id])=>id),[10000003,10000004,10000035,10000055]);
 let direct=0,fallback=0;
 for(const [mission,ss] of steps)for(const [si,step] of ss.entries())for(const [ui,sub] of (step.SubSteps??[]).entries())
  for(const [oi,o] of (sub.Objectives??[]).entries()){
   if(!Object.hasOwn(o,'UnlockCharacter'))continue;
   const u=o.UnlockCharacter,target=u.Character||owners.get(mission);
   if(u.Character)direct++;else fallback++;
   const link=sources.get(target).find(x=>x.sourceItemId===mission&&x.stepIndex===si&&x.subStepIndex===ui&&x.objectiveIndex===oi);
   assert(link);assert.deepEqual(link.original,u);assert.equal(link.nextStateCode,0);
   assert.equal(link.targetResolution,u.Character?'explicit_character':'mission_owner');
   assert.equal(link.currentAvailabilityVerified,false);assert.equal(link.guaranteedGrantVerified,false);
   if(link.category!==null)assert(effective.get(target).includes(link.category));
  }
 assert.equal(direct,35);assert.equal(fallback,26);assert.equal(sources.size,65);
 for(const [id,ls] of sources)for(const l of ls)assert.equal(l.targetItemId,id);
 const ids=[...sources].filter(([,ls])=>ls.some(x=>x.category!==null)).map(([id])=>id);
 const details=await readItemAcquisitionSourceDetails(db,ids,'ja');
 for(const [i,d] of details.entries())assert.deepEqual(d.classificationExtensions.filter(l=>l.family==='characterUnlock').map(l=>l.evidence),sources.get(ids[i]).filter(l=>l.category!==null));
});
