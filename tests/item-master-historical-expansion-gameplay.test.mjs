import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';

test('historical expansion gameplay corroboration shares canonical fields and never asserts exclusive availability',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const evidence=new Map(await db.getFieldRows('history.corroboratedExpansionGameplayEvidence'));
  assert.equal(evidence.size,199);
  const expected={cooking_fixed_expansion_ingredient:37,crafting_fixed_expansion_ingredient:104,
    fishing_expansion_area:17,mining_expansion_area:9,growing_expansion_crop:9,
    character_expansion_scene:19,expansion_gated_grant:1,expansion_gated_stall_pool:42};
  const counts={};
  for(const [,links] of evidence){
    for(const link of links){
      assert.equal(link.sourceGameVersion,'1.26.1');
      assert.equal(link.runtimeAvailabilityVerified,false);
      assert.equal(link.exclusiveAcquisitionVerified,false);
      assert.match(link.sourceSha256,/^[a-f0-9]{64}$/);
      if(link.kind==='expansion_gated_stall_pool')assert(link.grantEventItemIds.length>0);
      if(link.kind.endsWith('fixed_expansion_ingredient'))assert(link.requiredIngredientItemIds.length>0);
    }
    for(const k of new Set(links.map(x=>x.kind)))counts[k]=(counts[k]??0)+1;
  }
  assert.deepEqual(counts,expected);
  const confirmed=await db.findItemIdsByContent({kind:'confirmed_release',releaseId:'dlc.the-keepsake-sea'});
  assert.equal(confirmed.itemIds.length,759);
  assert([...evidence.keys()].every(id=>confirmed.itemIds.includes(id)));
  const newAssignments=await db.findItemIdsByField('history.contentAttributionEvidenceKind',{kind:'equals',value:'verified_expansion_tag_and_gameplay_relation'});
  assert.equal(newAssignments.length,194);
  const native=await db.findItemIdsByContent({kind:'native_expansion_at_introduction',expansionKey:'Expansion04'});
  assert([...evidence.keys()].every(id=>native.itemIds.includes(id)));
  const examples=[[30300732,'cooking_fixed_expansion_ingredient'],[31700188,'crafting_fixed_expansion_ingredient'],
    [31000117,'fishing_expansion_area'],[31600083,'mining_expansion_area'],
    [30400282,'growing_expansion_crop'],[10000194,'character_expansion_scene'],[20300118,'expansion_gated_grant']];
  for(const [id,kind] of examples)assert(evidence.get(id)?.some(x=>x.kind===kind));
  const [bridge]=await db.getItemContentOrigins([40006771]);
  assert.equal(bridge.contentReleaseId,null);
  const reward=await db.findItemIdsByField('history.contentAttributionEvidenceKind',{kind:'equals',value:'verified_expansion_tag_and_reward'});
  assert.equal(reward.length,46);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')));
});
