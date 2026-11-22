import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGuideRewardIndex} from '../src/lib/guide/reward-relations.ts';
import {
  DB03_PRIVATE_REWARD_CONTRACT,DB03_PRIVATE_REWARD_SOURCE,
  createStructuralPrivateRewardIndex,loadPinnedPrivateGuideRewardIndex,
  combineGuideItemOrigins
} from '../src/lib/guide/private-reward-evidence.ts';

const SHA='a'.repeat(64),PROTO='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const FRIENDSHIP='90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22';
const EVENT_COUNTS={
  static_expansion_tag_item_reference:6,static_expansion_village_scene_reference:6,
  static_festival_reward_candidate:31,
  static_festival_target_scene_reference:5,static_festival_target_subscene_reference:12,
  static_mini_event_duty_reference:84,static_mini_event_quest_reference:66,
  static_mini_event_reward_candidate:171
};
const QUEST_COUNTS={
  intro_item_grant_candidate:70,substep_handoff_definition:293,
  post_mission_cleanup_reference:824,additional_reward_loot_candidate:330
};
function fixtures(){
  const events=[];
  for(const [relationKind,count] of Object.entries(EVENT_COUNTS)){
    for(let i=0;i<count;i++){
      const mini=relationKind==='static_mini_event_reward_candidate';
      const festival=relationKind==='static_festival_reward_candidate';
      events.push({
        fromFamily:mini?'miniEvents':festival?'floatingFestivals':'expansions',
        fromId:mini?'TEST_MINI_EVENT':festival?'TEST_FLOATING_EVENT':'BaseGame',
        toFamily:mini||festival?'items':'worlds',
        toId:mini||festival?'80100000':'2001200028',
        relationKind,sourceField:'protobuf.'+(mini?'12['+i+'].2':'21['+i+'].1'),
        targetIndexMembership:'present_in_optional_partial_index',
        source:{
          file:'ddv_Data/StreamingAssets/protoDb.bin',sha256:PROTO,
          definitionWireSha256:SHA,referenceWireSha256:SHA
        }
      });
    }
  }
  const flows=[];
  for(const [flowKind,count] of Object.entries(QUEST_COUNTS)){
    for(let i=0;i<count;i++){
      flows.push({
        flowKind,questId:flowKind==='additional_reward_loot_candidate'?'2070000628':'2070000620',
        itemId:'80100000',
        sourceField:'protobuf.'+(flowKind==='additional_reward_loot_candidate'?'61.1[0].10['+i+']':'33['+i+'].ItemToGive'),
        nativeWireSha256:SHA,indexMembership:'present',
        ...(flowKind==='intro_item_grant_candidate'?{
          configuredAmount:{kind:'value',value:1,sourceWireSha256:SHA}
        }:{})
      });
    }
  }
  const stages=['FirstIntermediateReward','SecondIntermediateReward',
    'ThirdIntermediateReward','CompletedReward'];
  const records=Array.from({length:16},(_,i)=>({
    id:'default:'+Math.floor(i/4)+':'+stages[i%4]+':0',
    level:Math.floor(i/4)+1,nativeRewardId:'80100000',amount:5,rewardStage:stages[i%4],
    scope:'default_friendship_level_not_character_specific',
    source:{file:'ddv_Data/StreamingAssets/friendship_levels_default.json',sha256:FRIENDSHIP}
  }));
  return {
    eventLinks:{
      schema:'wand.db03.guide-event-links@1',
      source:'archived_verified_protoDb_projection',
      status:'static_source_links_only_not_live_events_or_player_inventory',
      itemIndexCoverage:'optional_partial_SRC01_membership_not_comprehensive',
      counts:{total:381,byRelationKind:EVENT_COUNTS},links:events
    },
    questFlows:{
      schema:'wand.db03.item-flows@1',
      target:{platform:'Steam',gameVersion:'1.26.1'},links:flows
    },
    friendshipDefaults:{
      schema:'wand.db03.native-guide@1',scope:'default_friendship_levels_only',
      target:{platform:'Steam',gameVersion:'1.26.1'},records
    }
  };
}

test('typed private source graph indexes 202 event + 400 quest + 16 default-friendship source candidates',()=>{
  const view=createStructuralPrivateRewardIndex(fixtures());
  assert.equal(view.contract,DB03_PRIVATE_REWARD_CONTRACT);
  assert.equal(view.coverage.sourceIntegrity,'structure_only');
  assert.equal(view.coverage.eventRewardCandidates,202);
  assert.equal(view.coverage.questRewardCandidates,400);
  assert.equal(view.coverage.defaultFriendshipRewardCandidates,16);
  assert.equal(view.candidates.length,618);
  const mini=view.getEventCandidates('mini_event','TEST_MINI_EVENT');
  const festival=view.getEventCandidates('floating_festival','TEST_FLOATING_EVENT');
  assert.equal(mini.length,171);
  assert.equal(festival.length,31);
  assert(mini.every(x=>x.originFamily==='mini_event'&&x.sourceGameVersion==='1.26.1'));
  assert(festival.every(x=>x.originFamily==='floating_festival'));
  assert.equal(view.getQuestCandidates('2070000628').length,330);
  assert.equal(view.getQuestCandidates('2070000620').length,70);
  assert(view.getQuestCandidates('2070000628').every(x=>x.originFamily==='quest_loot'));
  assert.equal(view.getDefaultFriendshipCandidates().length,16);
  assert.equal(view.getDefaultFriendshipCandidates(1).length,4);
  assert.equal(view.getDefaultFriendshipCandidates(4).length,4);
  assert.equal(view.getDefaultFriendshipCandidates(9).length,0);
  assert.equal(view.getItemCandidates('80100000').length,618);
  assert(view.candidates.every(x=>x.guaranteedGrant===false&&
    x.currentAvailabilityVerified===false&&x.playerOwnershipVerified===false&&
    x.characterSpecificVerified===false));
  assert.equal(view.candidates[0].relationId,'event/0');
  assert(Object.isFrozen(view.candidates));
  assert(Object.isFrozen(view.getItemCandidates('80100000')));
  assert.equal(view.getItemCandidates(80100000).length,618);
  assert.deepEqual(view.getItemCandidates('123456'),[]);
  assert.throws(()=>view.getItemCandidates('__proto__'),/ITEM_ID/);
  assert.throws(()=>view.getQuestCandidates('__proto__'),/QUEST_ID/);
  assert.throws(()=>view.getEventCandidates('mini_event','../fake'),/EVENT_ID/);
  assert.throws(()=>view.getDefaultFriendshipCandidates(0),/FRIENDSHIP_LEVEL/);
});

test('private event/quest and 2026 public Star Path retain separate source versions per item',async()=>{
  const raw=JSON.parse(await readFile(new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url)));
  const publicIndex=createGuideRewardIndex(raw),old=createStructuralPrivateRewardIndex(fixtures());
  const mixed=combineGuideItemOrigins(publicIndex,old,'80100000');
  assert.equal(mixed.length,12+618);
  assert.equal(mixed.filter(x=>x.kind==='public_starpath').length,12);
  assert.equal(mixed.filter(x=>x.kind==='owner_private_historical').length,618);
  assert(mixed.every(x=>x.itemId==='80100000'));
  assert(mixed.filter(x=>x.kind==='public_starpath').every(x=>x.originalVersion==='1.26.2'&&x.starpath));
  assert(mixed.filter(x=>x.kind==='owner_private_historical').every(x=>x.originalVersion==='1.26.1'&&x.historical));
  assert(Object.isFrozen(mixed));
  assert.equal(combineGuideItemOrigins(publicIndex,old,'120000253').length,1);
});

test('source type drift, forged event references and non-character defaults fail structural checks',()=>{
  const f=fixtures();
  const candidate=f.eventLinks.links.find(x=>x.relationKind==='static_festival_reward_candidate');
  candidate.source.sha256='0'.repeat(64);
  assert.throws(()=>createStructuralPrivateRewardIndex(f),/EVENT_REWARD_PROVENANCE/);
  candidate.source.sha256=PROTO;
  f.questFlows.links.pop();
  assert.throws(()=>createStructuralPrivateRewardIndex(f),/QUEST_SOURCE_CONTRACT/);
  const g=fixtures();
  g.friendshipDefaults.records[0].scope='specific_villager';
  assert.throws(()=>createStructuralPrivateRewardIndex(g),/FRIENDSHIP_REWARD_SOURCE/);
  const h=fixtures();
  h.eventLinks.links[0].relationKind='fake-item-reward';
  assert.throws(()=>createStructuralPrivateRewardIndex(h),/EVENT_KIND_CENSUS|EVENT_UNEXPECTED_KIND/);
});

test('owner-local loader requires all three exact archived original SHA-256 payloads',async()=>{
  assert.equal(DB03_PRIVATE_REWARD_SOURCE.eventLinks.bytes,257544);
  assert.equal(DB03_PRIVATE_REWARD_SOURCE.questFlows.bytes,519368);
  assert.equal(DB03_PRIVATE_REWARD_SOURCE.friendshipDefaults.bytes,7432);
  assert.match(DB03_PRIVATE_REWARD_SOURCE.eventLinks.sha256,/^[a-f0-9]{64}$/);
  assert.match(DB03_PRIVATE_REWARD_SOURCE.questFlows.sha256,/^[a-f0-9]{64}$/);
  assert.match(DB03_PRIVATE_REWARD_SOURCE.friendshipDefaults.sha256,/^[a-f0-9]{64}$/);
  await assert.rejects(()=>loadPinnedPrivateGuideRewardIndex({
    eventLinks:new Uint8Array(2),
    questFlows:new Uint8Array(519368),
    friendshipDefaults:new Uint8Array(7432)
  }),/SOURCE_BYTES/);
  const f=fixtures();
  assert.equal(createStructuralPrivateRewardIndex(f).coverage.sourceIntegrity,'structure_only',
    'synthetic fixtures may validate shape, never masquerade as owner-authenticated data');
});
