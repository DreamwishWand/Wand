import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectRewardSourceEquivalence,loadVerifiedRewardSourceEquivalence,
  joinEquivalentCurrentRewardCandidates,DB03_REWARD_SOURCE_EQUIVALENCE_SCHEMA
} from '../src/lib/guide/reward-source-equivalence.ts';
import {
  GUIDE_SOURCE_COMPOSITE_V2_SHA,GUIDE_SOURCE_COMPOSITE_V2_BYTES,
  GUIDE_FRIENDSHIP_ORIGINAL_SHA
} from '../src/lib/guide/source-composite.ts';

const PROTO='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const MISSION='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const CONDITION='9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
function source(){
  const composite={
    schema:'wand.db03.guide-source-composite@2',
    target:{gameVersion:'1.26.2',platform:'Steam'},
    baseline:{gameVersion:'1.26.1',platform:'Steam'},
    originalGuideFamilySources:{
      quests:{
        reuseMode:'EXACT_ORIGINAL_FULL_FILE_SHA256',
        baselineSha256:MISSION,targetSha256:MISSION,
        targetVersion:'1.26.2',targetBytes:4373535,baselineNativeRecords:1030
      },
      conditions:{
        reuseMode:'REEXTRACT_CURRENT_CHANGED_ORIGINAL',
        baselineSha256:'f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150',
        targetSha256:CONDITION
      }
    },
    friendshipDefaultSource:{
      exactFullOriginalFileContentIdentical:true,
      baseVersion:'1.26.1',targetVersion:'1.26.2',
      nativeSourceSha256:GUIDE_FRIENDSHIP_ORIGINAL_SHA,records:16
    },
    staticProtoDb:{originalSha256:PROTO,nativeEntries:2246},
    currentConditions:{nativeDefinitions:5440,typedMissionMentions:4960},
    limits:{
      automaticPrerequisiteGraphVerified:false,playerProgressOrEntitlementVerified:false,
      currentStarPathOrLiveEventVerified:false
    }
  };
  const protoDbBridge={
    schema:'wand.db03.protodb-source-bridge@1',
    status:'IDENTICAL_ARCHIVED_STATIC_SOURCE',
    proof:{fullOriginalBytesIdentical:true,byteComparison:'complete_exact_binary'},
    baseline:{platform:'Steam',gameVersion:'1.26.1',sha256:PROTO,bytes:1335720,protoDbEntries:2246},
    target:{platform:'Steam',gameVersion:'1.26.2',sha256:PROTO,bytes:1335720,protoDbEntries:2246},
    staticCensusReused:{miniEvents:19,floatingFestivals:5},
    starPath:{archivedSeasonDefinitions:0,liveSeasonState:'NOT_VERIFIED'}
  };
  return {composite,protoDbBridge};
}
const FAKE=[
  {itemId:'40004651',originId:'HauntedFloatingFestival',originFamily:'floating_festival',
    sourceGameVersion:'1.26.1',sourceFile:'ddv_Data/StreamingAssets/protoDb.bin'},
  {itemId:'31200039',originId:'2070000672',originFamily:'quest_intro',
    sourceGameVersion:'1.26.1',sourceFile:'ddv_Data/StreamingAssets/itemlist/Mission.json'},
  {itemId:'80000000',originId:'default_friendship_level_1',originFamily:'friendship_default',
    sourceGameVersion:'1.26.1',sourceFile:'ddv_Data/StreamingAssets/friendship_levels_default.json'},
  {itemId:'50900262',originId:'HauntedFloatingFestival2026',originFamily:'floating_festival',
    sourceGameVersion:'1.26.1',sourceFile:'ddv_Data/StreamingAssets/protoDb.bin'}
];
function fakeArchive(){
  return {
    contract:'wand.db03.private-reward-evidence@1',
    coverage:{sourceIntegrity:'pinned_original_sha256',sourceGameVersion:'1.26.1',
      eventRewardCandidates:202,questRewardCandidates:400,defaultFriendshipRewardCandidates:16},
    getItemCandidates(id){return FAKE.filter(x=>x.itemId===id);},
    getEventCandidates(family,id){return FAKE.filter(x=>x.originFamily===family&&x.originId===id);},
    getQuestCandidates(id){return FAKE.filter(x=>x.originId===id&&x.originFamily.startsWith('quest'));}
  };
}

test('independent owner offline report preserves three exact full-native-file equivalences and a changed Condition source',()=>{
  const {composite,protoDbBridge}=source(),p=projectRewardSourceEquivalence(composite,protoDbBridge);
  assert.equal(p.schema,DB03_REWARD_SOURCE_EQUIVALENCE_SCHEMA);
  assert.equal(p.provenance,'structure_only','synthetic claims are not SHA-authenticated');
  assert.equal(p.evidence.compositeSha256,GUIDE_SOURCE_COMPOSITE_V2_SHA);
  assert.match(p.evidence.protoDbBridgeSha256,/^[a-f0-9]{64}$/);
  assert.equal(p.evidence.baseline,'1.26.1');
  assert.equal(p.evidence.target,'1.26.2');
  assert.deepEqual(p.families.map(x=>x.family),['protoDb','Mission','defaultFriendship']);
  assert.deepEqual(p.families.map(x=>x.sourceSha256),
    [PROTO,MISSION,GUIDE_FRIENDSHIP_ORIGINAL_SHA]);
  assert(p.families.every(x=>x.comparison==='EXACT_ORIGINAL_FULL_FILE_SHA256'));
  assert.equal(p.unchangedConditionSource,false);
  assert.equal(p.sourceEquivalenceDoesNotVerify.questUnlocks,true);
  assert.equal(p.sourceEquivalenceDoesNotVerify.rewardsGranted,true);
  assert.equal(p.sourceEquivalenceDoesNotVerify.currentEventAvailability,true);
  assert.equal(p.sourceEquivalenceDoesNotVerify.playerProgress,true);
  assert(Object.isFrozen(p));
  assert(Object.isFrozen(p.families));
  assert(Object.isFrozen(p.evidence));
});

test('v1.26.1 event, quest, and default friendship candidate identities remain separate, even with v1.26.2 native equality',()=>{
  const {composite,protoDbBridge}=source(),structural=projectRewardSourceEquivalence(composite,protoDbBridge);
  assert.throws(()=>joinEquivalentCurrentRewardCandidates(fakeArchive(),structural),
    /OWNER_SOURCE_PROOF_REQUIRED/,'structural evidence cannot certify current version compatibility');
  // Synthetic fixture mimics already SHA-verified owner inputs to exercise the
  // strictly source-only join. Real runtime uses both pinned private loaders.
  const validated={...structural,provenance:'pinned_owner_original_audits_sha256'};
  const joined=joinEquivalentCurrentRewardCandidates(fakeArchive(),validated);
  assert.equal(joined.targetGameVersion,'1.26.2');
  assert.equal(joined.originalExtractionVersion,'1.26.1');
  assert.equal(joined.coverage.totalCandidates,618);
  assert.equal(joined.coverage.conditionCompatibilityAsserted,false);
  assert.equal(joined.coverage.liveOrPlayerAvailabilityVerified,false);
  for(const row of FAKE){
    const found=joined.getItemCandidates(row.itemId).find(r=>r.nativeOriginId===row.originId);
    assert(found);
    assert.strictEqual(found.original,row,'no duplicate Item ID or native event identity');
    assert.equal(found.originalExtractionVersion,'1.26.1');
    assert.equal(found.sourceCompatibleWith,'1.26.2');
    assert.equal(found.rewardConfigurationOnly,true);
    assert.equal(found.guaranteedGrant,false);
    assert.equal(found.onlineAvailabilityVerified,false);
    assert.equal(found.playerOwnershipVerified,false);
    assert(Object.isFrozen(found));
  }
  assert.equal(joined.getEventCandidates('floating_festival','HauntedFloatingFestival').length,1);
  assert.equal(joined.getQuestCandidates('2070000672').length,1);
  assert.deepEqual(joined.getItemCandidates('999999'),[]);
  assert.throws(()=>joined.getItemCandidates('__proto__'),/INVALID_ITEM_ID/);
});

test('static version bridge rejects altered source, missing mission equality and fabricated unchanged Conditions',()=>{
  const {composite,protoDbBridge}=source();
  composite.originalGuideFamilySources.quests.targetSha256='0'.repeat(64);
  assert.throws(()=>projectRewardSourceEquivalence(composite,protoDbBridge),/UNVERIFIED_ORIGINAL_FILES/);
  composite.originalGuideFamilySources.quests.targetSha256=MISSION;
  protoDbBridge.target.sha256='0'.repeat(64);
  assert.throws(()=>projectRewardSourceEquivalence(composite,protoDbBridge),/UNVERIFIED_PROTO_DB_BRIDGE/);
  protoDbBridge.target.sha256=PROTO;
  composite.originalGuideFamilySources.conditions.reuseMode='EXACT_ORIGINAL_FULL_FILE_SHA256';
  assert.throws(()=>projectRewardSourceEquivalence(composite,protoDbBridge),/MUST_NOT_MERGE_CHANGED_CONDITIONS/);
  const valid=source();
  valid.protoDbBridge.starPath.liveSeasonState='CURRENTLY_ACTIVE';
  assert.throws(()=>projectRewardSourceEquivalence(
    valid.composite,valid.protoDbBridge),/UNVERIFIED_PROTO_DB_BRIDGE/);
});

test('owner-local attested loader refuses any fake private audit bytes and never fetches from web',async()=>{
  assert.equal(GUIDE_SOURCE_COMPOSITE_V2_BYTES,12664);
  const tiny=new Uint8Array(1);
  await assert.rejects(()=>loadVerifiedRewardSourceEquivalence({
    guideSourceCompositeV2:tiny,protoDbBridge:tiny
  }),/SOURCE_BYTES/);
  await assert.rejects(()=>loadVerifiedRewardSourceEquivalence({
    guideSourceCompositeV2:new Uint8Array(GUIDE_SOURCE_COMPOSITE_V2_BYTES),
    protoDbBridge:new Uint8Array(1470)
  }),/PINNED_SHA256_MISMATCH/);
});
