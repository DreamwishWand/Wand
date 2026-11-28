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
 assert.equal(direct,35);assert.equal(fallback,26);assert.equal(sources.size,80);
 const raw=new Map(await db.getFieldRows('source.SecretCharacterData'));
 const secretLinks=[...sources].flatMap(([,ls])=>ls.filter(l=>l.kind==='character_secret_condition_unlock'));
 assert.equal(secretLinks.length,31);
 assert.equal(secretLinks.filter(l=>!sources.get(l.targetItemId).some(r=>r.kind==='character_quest_unlock')).length,15);
 const newlyCovered=secretLinks.filter(l=>!sources.get(l.targetItemId).some(r=>r.kind==='character_quest_unlock')).map(l=>l.targetItemId);
 assert.deepEqual(newlyCovered.sort((a,b)=>a-b),[10000027,10000029,10000038,10000043,10000046,10000060,10000061,10000062,10000063,10000070,10000073,10000103,10000114,10000133,10000209]);
 for(const l of secretLinks){
   const data=raw.get(l.targetItemId);
   assert.deepEqual(l.original,data.CharacterUnlockCondition);
   assert.deepEqual(l.preConditions,data.PreConditions??null);
   const p=l.original.Conditions[0][l.predicateKind];
   assert.equal(p.Mission,l.missionItemId);
   if(l.predicateKind.startsWith('MissionStep')){
     assert.equal(l.missionStepId,p.StepID??0);
     assert.equal(steps.get(l.missionItemId).filter(st=>(st.StepID??0)===l.missionStepId).length,1);
   }else assert.equal(l.missionStepId,null);
   assert.equal(l.category,'ordinary_gameplay');
   assert(effective.get(l.targetItemId).includes(l.category));
 }
 assert(residents.every(([id])=>sources.get(id)?.some(l=>l.category==='ordinary_gameplay')));
 const debugFlags=new Map(await db.getFieldRows('source.IsDebug'));
 for(const [id,mode] of modes){
   assert.equal(mode.nativeCanBeCollected,debugFlags.get(id)!==true);
   assert.equal(mode.nativeCollectionPredicateVerified,true);
   assert.equal(mode.nativeCollectionPredicate,'not_is_debug');
 }
 assert.equal([...modes.values()].filter(m=>!m.nativeCanBeCollected).length,60);
 const dory=modes.get(10000209),doryLink=sources.get(10000209).find(l=>l.kind==='character_secret_condition_unlock');
 assert.equal(dory.residentRouteEligible,false);assert.equal(dory.sidekick,true);
 assert.equal(dory.nativeCanBeCollected,true);
 assert.equal(doryLink.sidekick,true);assert.equal(doryLink.missionItemId,2070001508);assert.equal(doryLink.missionStepId,2);
 assert.equal(doryLink.category,'ordinary_gameplay');
 assert.equal([...modes].filter(([id,m])=>m.nativeCanBeCollected&&!effective.has(id)).length,0);
 for(const [id,ls] of sources)for(const l of ls)assert.equal(l.targetItemId,id);
 const ids=[...sources].filter(([,ls])=>ls.some(x=>x.category!==null)).map(([id])=>id);
 const details=await readItemAcquisitionSourceDetails(db,ids,'ja');
 for(const [i,d] of details.entries())assert.deepEqual(d.classificationExtensions.filter(l=>l.family==='characterUnlock').map(l=>l.evidence),sources.get(ids[i]).filter(l=>l.category!==null));
});
