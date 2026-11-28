import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
test('original dialogue and chase objective grants preserve exact selectors, amount and cleanup separately',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const entries=await db.getFieldRows('acquisition.questObjectiveGrantSources');
 const links=entries.flatMap(([id,ls])=>ls.map(l=>{assert.equal(l.targetItemId,id);return l}));
 const questIds=[...new Set(links.map(l=>l.sourceItemId))];
 const quests=new Map((await db.getItemFields(questIds,['source.Steps','source.ItemsToDeleteAfterMission'])).map(r=>[r.itemId,r.values]));
 const counts={};let classified=0;
 for(const l of links){
   const q=quests.get(l.sourceItemId),v=q['source.Steps'][l.stepIndex].SubSteps[l.subStepIndex].Objectives[l.objectiveIndex][l.objectiveKind].ItemsToGive[l.grantIndex];
   assert.deepEqual(l.originalGrant,v);
   assert.equal(v.ItemToGive.ItemToGive.Item.Item.Item,l.targetItemId);
   assert.equal(v.ItemToGiveAmount.Value.Value,l.configuredAmount);
   assert.equal(l.cleanupConfigured,(q['source.ItemsToDeleteAfterMission']??[]).includes(l.targetItemId));
   assert.equal(l.permanentOwnershipVerified,false);assert.equal(l.guaranteedGrantVerified,false);assert.equal(l.currentAvailabilityVerified,false);
   if(l.category!==null){classified++;const k=l.objectiveKind+':'+l.category;counts[k]=(counts[k]??0)+1;}
 }
 // Independent census from decoded original quest steps and Guide taxonomy.
 assert.deepEqual(counts,{'TalkToCharacter:ordinary_gameplay':414,'Chase:ordinary_gameplay':177,'TalkToCharacter:in_game_limited_event':12,'Chase:in_game_limited_event':5});
 assert.equal(classified,608);
 const selected=entries.filter(([,ls])=>ls.some(l=>l.category!==null));
 const details=await readItemAcquisitionSourceDetails(db,selected.map(([id])=>id),'ja');
 for(const [i,[id,ls]] of selected.entries()){
   const d=details[i],expected=ls.filter(l=>l.category!==null);
   assert.deepEqual(d.classificationExtensions.filter(l=>l.family==='questObjective').map(l=>l.evidence),expected);
   for(const l of expected)assert(d.effectiveCategories.includes(l.category));
 }
});
