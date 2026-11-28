import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
test('all permanent story puzzles use original visibility, unlock and material cost definitions',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const sources=await db.getFieldRows('acquisition.storyUnlockSources');
 assert.equal(sources.length,56);
 const ids=sources.map(([id])=>id),rows=new Map((await db.getItemFields(ids,['source.VisibilityConditions','source.UnlockConditions','source.UnlockCost','source.IsMissionItem','source.Reward','nativeCategory'])).map(r=>[r.itemId,r.values]));
 const links=sources.flatMap(([,ls])=>ls);
 assert.equal(links.filter(l=>l.routeKind==='snippet_cost').length,33);
 assert.equal(links.filter(l=>l.routeKind==='quest_conditions').length,19);
 assert(ids.includes(200000049));assert(ids.includes(200000058));
 const events=links.filter(l=>l.routeKind==='festival_puzzle');assert.equal(events.length,4);
 assert.deepEqual(events.filter(l=>l.kind==='story_event_completion_reward').map(l=>l.targetItemId).sort((a,b)=>a-b),[40005836,40006319]);
 const details=await readItemAcquisitionSourceDetails(db,ids,'ja');
 for(const [i,[id,ls]] of sources.entries()){
  assert.equal(ls.length,1);const l=ls[0],raw=rows.get(l.sourceItemId);
  assert.equal(l.targetItemId,id);assert.equal(raw.nativeCategory,'Story');
  if(l.kind==='story_event_completion_reward')assert.deepEqual(l.originalReward,raw['source.Reward']);else assert.equal(l.sourceItemId,id);
  assert.deepEqual(l.visibilityConditions,raw['source.VisibilityConditions']);
  assert.deepEqual(l.unlockConditions,raw['source.UnlockConditions']);
  assert.deepEqual(l.unlockCosts,raw['source.UnlockCost']??[]);
  assert.equal(l.isMissionItem,raw['source.IsMissionItem']??false);
  assert.equal(l.currentAvailabilityVerified,false);
  assert(details[i].effectiveCategories.includes(l.category));
  assert.deepEqual(details[i].classificationExtensions.filter(e=>e.family==='storyUnlock').map(e=>e.evidence),ls);
 }
});
