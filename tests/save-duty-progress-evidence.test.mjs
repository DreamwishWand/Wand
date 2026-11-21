import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSaveAchievementBridge, getSaveAchievementNativeBehaviorEvidence,
  SAVE_DUTY_PROGRESS_EVIDENCE_CONTRACT
} from '../src/lib/save/achievement-links.mjs';
import { getDomainSaveFields } from '../src/lib/save/registry.mjs';

const HASH='a'.repeat(64);
const DUTY='ddv_Data/StreamingAssets/itemlist/DutyAch.json';
function duties(){
  return {
    schema:'wand.db03.native-guide@1',family:'duties',
    target:{platform:'Steam',gameVersion:'1.26.2'},
    records:['2110000001','2110000002'].map((id,i)=>({
      id,rawName:'PRIVATE_DUTY_INTERNAL_'+i,
      names:{ja:'SECRET_LOCALIZED_DUTY_'+i},
      nativeWireSha256:HASH,
      source:{file:DUTY,sha256:HASH,frameIndex:i}
    }))
  };
}
function modifiedSave(version=643){
  return {
    GameInfo:{Version:version},
    Player:{
      PersonalToken:'OWNER_PRIVATE_PLAYER_TOKEN',
      AchievementsData:[
        {AchievementID:2110000001,CurAmount:7,MaxAmount:10,
          ClaimedRewardMilestone:5,State:'PRIVATE_COMPLETION_CODE'},
        {AchievementID:2110000002,CurAmount:8,MaxAmount:10,
          State:'PRIVATE_INCOMPLETE_CODE'},
        {AchievementID:2110000999,CurAmount:2147483648,
          ClaimedRewardMilestone:'OWNER_PRIVATE'},
        {AchievementID:0,CurAmount:1000,State:'PRIVATE_ZERO_STATE'},
        {CurAmount:12,State:'PRIVATE_NO_ID'}
      ]
    },
    World:{DeletedMissionEvidence:'OWNER_MODIFIED',
      MissionSlots:{},QuestInfo:{}}
  };
}
test('four native static semantic notes are build-scoped and prohibit all completion claims',()=>{
  const src=getSaveAchievementNativeBehaviorEvidence();
  assert.equal(src.schema,'wand.db05.achievement-native-behavior-evidence@1');
  assert.equal(src.sourceEvidence.observedPlatform,'Nintendo Switch');
  assert.equal(src.sourceEvidence.observedVersion,'1.26.1');
  assert.equal(src.sourceEvidence.buildId,'3346726B2F640E01');
  assert.equal(src.sourceEvidence.runtimeBehaviorVerified,false);
  assert.equal(src.sourceEvidence.savePersistenceVerified,false);
  assert.equal(src.sourceEvidence.steam1262BehaviorVerified,false);
  assert.equal(src.sourceDefinitionJoin.allDutyRewardTiersVerified,false);
  assert.equal(src.policy.noMissingRecordCompletionInference,true);
  assert.equal(src.policy.writerAuthorized,false);
  assert.equal(Object.isFrozen(src),true);
  assert.equal(src.fieldEvidence.length,4);
  const byPath = new Map(getDomainSaveFields().fields.map(x=>[x.path,x]));
  for(const f of src.fieldEvidence){
    const native=byPath.get(f.savePath);
    assert.ok(native,f.id);
    assert.equal(native.nativeMessage,'AchievementData');
    assert.equal(native.writable,false);
    assert.equal(typeof f.inferenceBoundary,'string');
    assert.equal(Object.isFrozen(f),true);
  }
});
test('626 and 643 source ID matches emit only presence and int32/opaque-enum kinds',()=>{
  const bridge=createSaveAchievementBridge(duties());
  const original=modifiedSave();
  const before=JSON.stringify(original);
  const a=bridge.auditProgressEvidence(modifiedSave(626));
  const b=bridge.auditProgressEvidence(original);
  assert.deepEqual(a,b);
  assert.equal(JSON.stringify(original),before);
  assert.equal(b.contract,SAVE_DUTY_PROGRESS_EVIDENCE_CONTRACT);
  assert.equal(b.status,'matched_native_duty_field_kinds');
  assert.equal(b.nativeBehaviorEvidenceScope,'switch_1_26_1_static_only');
  assert.equal(b.linkedIndexSource,'owner_private_db03_duties_metadata_only');
  assert.equal(b.matchedRecords,2);
  assert.equal(b.invalidRecords,0);
  const fields=Object.fromEntries(b.fields.map(f=>[f.field,f]));
  assert.deepEqual(fields.current_amount,{
    field:'current_amount',observed:2,absent:0,kindDifferent:0
  });
  assert.equal(fields.claimed_reward_milestone.observed,1);
  assert.equal(fields.claimed_reward_milestone.absent,1);
  assert.equal(fields.max_amount.observed,2);
  assert.equal(fields.state.observed,2);
  assert.equal(b.gameSourceOriginalBytesRehashed,false);
  assert.equal(b.gameBuildJointlyVerified,false);
  assert.equal(b.completeNativeDutyThresholdsVerified,false);
  assert.equal(b.stateMachineVerified,false);
  assert.equal(b.achievementCompletionVerified,false);
  assert.equal(b.rewardGrantVerified,false);
  assert.equal(b.savePersistenceVerified,false);
  assert.equal(b.ownerModifiedSaveMayOmitObjects,true);
  assert.equal(b.missingAchievementsDoNotImplyIncomplete,true);
  assert.equal(b.writerAuthorized,false);
  assert.equal(b.exportAuthorized,false);
  assert.equal(Object.isFrozen(b),true);
  assert.equal(Object.isFrozen(b.fields),true);
  assert.equal(Object.isFrozen(b.fields[0]),true);
  for(const forbidden of [
    '2110000001','2110000002','2110000999',
    'OWNER_PRIVATE','PRIVATE_DUTY','SECRET_LOCALIZED',
    'PRIVATE_COMPLETION_CODE','PRIVATE_INCOMPLETE_CODE',
    '2147483648','1000','CurAmount','ClaimedRewardMilestone'
  ]) assert.equal(JSON.stringify(b).includes(forbidden),false,forbidden);
});
test('unmatched Duty IDs cannot supply achievement progress or reward evidence',()=>{
  const bridge=createSaveAchievementBridge(duties());
  const s=modifiedSave();
  s.Player.AchievementsData=[{
    AchievementID:2110000999,CurAmount:'SECRET_MALFORMED',
    MaxAmount:2147483648,State:8,ClaimedRewardMilestone:2147483648
  }];
  const b=bridge.auditProgressEvidence(s);
  assert.equal(b.status,'no_exact_duty_matches');
  assert.equal(b.matchedRecords,0);
  assert.equal(b.fields.every(f=>f.observed===0 && f.absent===0 && f.kindDifferent===0),true);
  assert.equal(JSON.stringify(b).includes('SECRET_MALFORMED'),false);
});
test('owner-deleted mission/achievement data means unknown, never incomplete or corruption',()=>{
  const bridge=createSaveAchievementBridge(duties());
  const s=modifiedSave();
  delete s.World.MissionSlots;
  delete s.World.QuestInfo;
  delete s.World.DeletedMissionEvidence;
  delete s.Player.AchievementsData;
  const noRecords=bridge.auditProgressEvidence(s);
  assert.equal(noRecords.status,'no_exact_duty_matches');
  assert.equal(noRecords.matchedRecords,0);
  assert.equal(noRecords.missingAchievementsDoNotImplyIncomplete,true);
  assert.equal(noRecords.achievementCompletionVerified,false);
  s.Player.AchievementsData=[];
  const empty=bridge.auditProgressEvidence(s);
  assert.equal(empty.status,'no_exact_duty_matches');
  s.Player.AchievementsData=[{AchievementID:2110000001}];
  const partial=bridge.auditProgressEvidence(s);
  assert.equal(partial.status,'matched_native_duty_field_kinds');
  assert.equal(partial.matchedRecords,1);
  assert.equal(partial.fields.every(f=>f.absent===1),true);
});
test('native int32 and opaque enum kinds are reported but do not imply invalid or completed saves',()=>{
  const bridge=createSaveAchievementBridge(duties());
  const s=modifiedSave();
  s.Player.AchievementsData=[
    {AchievementID:2110000001,CurAmount:2147483648,MaxAmount:-2147483649,
      State:1,ClaimedRewardMilestone:'5'},
    {AchievementID:2110000002,CurAmount:-2147483648,
      MaxAmount:2147483647,State:'UNRECOGNIZED_GAME_ENUM',
      ClaimedRewardMilestone:-1}
  ];
  const x=bridge.auditProgressEvidence(s);
  assert.equal(x.status,'observed_kind_difference');
  assert.equal(x.matchedRecords,2);
  const by=Object.fromEntries(x.fields.map(f=>[f.field,f]));
  assert.equal(by.current_amount.kindDifferent,1);
  assert.equal(by.max_amount.kindDifferent,1);
  assert.equal(by.claimed_reward_milestone.kindDifferent,1);
  assert.equal(by.state.kindDifferent,1);
  assert.equal(JSON.stringify(x).includes('UNRECOGNIZED_GAME_ENUM'),false);
  assert.equal(x.stateMachineVerified,false);
});
test('bounded sampling counts only processed exact DutyAch IDs',()=>{
  const bridge=createSaveAchievementBridge(duties());
  const s=modifiedSave();
  s.Player.AchievementsData=Array.from({length:512},(_,i)=>({
    AchievementID:i%2?2110000999:2110000001,CurAmount:9
  }));
  const x=bridge.auditProgressEvidence(s,{maxReferences:20});
  assert.equal(x.status,'sampled_inconclusive');
  assert.equal(x.sampled,true);
  assert.equal(x.matchedRecords,10);
  assert.equal(x.fields.find(f=>f.field==='current_amount').observed,10);
  for(const wrong of [
    null,'bad',[],{maxReferences:0},{maxReferences:257},{maxReferences:1.5}
  ]) assert.throws(()=>bridge.auditProgressEvidence(s,wrong),
    /DB05_ACHIEVEMENT_AUDIT_LIMIT_INVALID/);
});
test('malformed rows differ from unobserved IDs and invalid root fails closed',()=>{
  const bridge=createSaveAchievementBridge(duties());
  const s=modifiedSave();
  s.Player.AchievementsData=[null,{AchievementID:2110000001,State:''},[]];
  const a=bridge.auditProgressEvidence(s);
  assert.equal(a.status,'observed_kind_difference');
  assert.equal(a.invalidRecords,2);
  assert.equal(a.matchedRecords,1);
  const b=modifiedSave();
  b.Player.AchievementsData={};
  assert.equal(bridge.auditProgressEvidence(b).status,'observed_kind_difference');
  for(const invalid of [null,{}, {GameInfo:{Version:643},Player:[],World:{}}])
    assert.throws(()=>bridge.auditProgressEvidence(invalid),
      /DB05_ACHIEVEMENT_SAVE_ROOT_INVALID/);
});
