import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PRIVATE_SRC02_BROWSER_CONTRACT} from '../src/lib/acquisition/private-browser-bundle.mjs';
import {DB02_NATIVE_TAG_PARENT_SHA256} from '../src/lib/acquisition/native-tag-evidence.mjs';
import {DB02_QUEST_ACQUISITION_CONTRACT, DB03_QUEST_FLOWS_SHA256,
  DB03_MISSION_BRIDGE_SHA256, DB03_MISSION_SOURCE_SHA256,
  validateQuestItemFlowStructure,loadPrivateQuestAcquisitionView
} from '../src/lib/acquisition/quest-item-bridge.mjs';

const SHA='a'.repeat(64);
const KINDS=[
  ['intro_item_grant_candidate',70],
  ['substep_handoff_definition',293],
  ['post_mission_cleanup_reference',824],
  ['additional_reward_loot_candidate',330]
];
function make(){
  const rows=[];let i=0;
  for(const [flowKind,count] of KINDS)for(let j=0;j<count;j++,i++){
    const row={flowKind,questId:String(2070000000+i%461),
      itemId:String(30000000+i%1352),nativeWireSha256:SHA,
      indexMembership:i%5?'present':'not_in_supplied_index',
      sourceField:`protobuf.63[${i}]`};
    if(flowKind==='intro_item_grant_candidate')
      Object.assign(row,{sourceField:`protobuf.33[${i}].ItemToGive`,
        candidateRole:'direct',selectorMode:'item',
        configuredAmount:{kind:'value',value:1,sourceWireSha256:SHA}});
    if(flowKind==='substep_handoff_definition')
      Object.assign(row,{sourceField:`protobuf.40[${i}].20.14[0]`,
        keepItems:i%2===0,configuredAmount:1,stepId:i%2?null:1,subStepId:null});
    if(flowKind==='additional_reward_loot_candidate')
      Object.assign(row,{sourceField:`protobuf.61.1[${i}].10[0]`,
        selection:'not_guaranteed',lootSubtableIndex:i});
    rows.push(row);
  }
  return {schema:'wand.db03.item-flows@1',target:{platform:'Steam',gameVersion:'1.26.1'},
    indexCoverage:'optional_partial_SRC01_membership_only',
    meaning:'STATIC candidates and item references; not guaranteed player state',links:rows};
}
const acquisition=Object.freeze({
  contract:PRIVATE_SRC02_BROWSER_CONTRACT,verified:true,privateSource:true,
  publishable:false,manifestSha256:DB02_NATIVE_TAG_PARENT_SHA256,
  source:Object.freeze({platform:'Steam',gameVersion:'1.26.2'}),
  currentAvailabilityVerified:false,
  getItem(){return {status:'unresolved_or_no_verified_link'};}
});
test('synthetic 1,517 flow references retain four distinct source-only semantics',()=>{
  const c=validateQuestItemFlowStructure(make());
  assert.equal(c.rows,1517);assert.equal(c.quests,461);
  assert.equal(c.distinctItemIds,1352);
  assert.deepEqual(c.byKind,Object.fromEntries(KINDS));
  assert.equal(DB02_QUEST_ACQUISITION_CONTRACT,'wand.db02.quest-acquisition@1');
  assert.equal(DB03_MISSION_SOURCE_SHA256,'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24');
});
test('wrong version, missing row, duplicate, forged rewards and invalid native IDs are rejected',()=>{
  const scenarios=[
    x=>{x.target.gameVersion='1.26.2';},
    x=>{x.links.pop();},
    x=>{x.links[1]=structuredClone(x.links[0]);},
    x=>{x.links[0].itemId='0';},
    x=>{x.links[0].candidateRole='guaranteed';},
    x=>{x.links[70].keepItems='maybe';},
    x=>{x.links[70].stepId='1';},
    x=>{x.links.at(-1).selection='certain';},
    x=>{x.links.at(-1).indexMembership='absent_from_game';}
  ];
  for(const change of scenarios){
    const x=make();change(x);
    assert.throws(()=>validateQuestItemFlowStructure(x),/DB02_QUEST_ACQUISITION_/);
  }
});
test('exact owner-private payload SHA pins are mandatory: synthetic bytes fail before parsing',async()=>{
  assert.equal(DB03_QUEST_FLOWS_SHA256,
    '682f5730c614332668ea1b2558622babbc36009d0f6ab305331a9d7091d8ae5a');
  assert.equal(DB03_MISSION_BRIDGE_SHA256,
    'ce0bfdf4fda1beaf6493659966eb4bc47da9af58cf7f3c3fb0b96d2d8c1b6011');
  const fake=new TextEncoder().encode(JSON.stringify(make()));
  const bridge=new TextEncoder().encode(JSON.stringify({
    schema:'wand.db03.mission-source-bridge@1',
    baseline:{platform:'Steam',gameVersion:'1.26.1'},
    target:{platform:'Steam',gameVersion:'1.26.2'}
  }));
  assert.notEqual(createHash('sha256').update(fake).digest('hex'),DB03_QUEST_FLOWS_SHA256);
  await assert.rejects(loadPrivateQuestAcquisitionView(fake,bridge,acquisition),
    /DB02_QUEST_ACQUISITION_FLOW_SHA256_MISMATCH/);
  for(const bad of [
    {...acquisition,manifestSha256:'f'.repeat(64)},
    {...acquisition,publishable:true},
    {...acquisition,source:{platform:'Steam',gameVersion:'1.26.1'}},
    {...acquisition,verified:false},
    {...acquisition,currentAvailabilityVerified:true}
  ])await assert.rejects(loadPrivateQuestAcquisitionView(fake,bridge,Object.freeze(bad)),
    /DB02_QUEST_ACQUISITION_UNVERIFIED_R5_ACQUISITION/);
});
