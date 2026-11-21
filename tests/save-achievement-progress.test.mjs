import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSaveAchievementObservationFields, inspectSaveAchievementProgress,
  SAVE_ACHIEVEMENT_PROGRESS_CONTRACT
} from '../src/lib/save/achievement-progress.mjs';
import { getDomainSaveFields, getUnifiedSaveShapeCatalog } from '../src/lib/save/registry.mjs';

function modifiedSave(version=643) {
  return {
    GameInfo:{Version:version},
    Player:{
      PrivateAccount:'PRIVATE_OWNER_PROFILE',
      AchievementsData:[
        {AchievementID:2110000001,CurAmount:4,MaxAmount:8,
          State:'PRIVATE_STATE_COMPLETE_OR_NOT',ClaimedRewardMilestone:0,
          TypesCollected:[2,3],ItemsUsed:[17,19]},
        {AchievementID:2110000002,CurAmount:0,MaxAmount:9,
          State:'UNKNOWN_ENUM_STRING_NOT_INTERPRETED'}
      ]
    },
    World:{ // Owner intentionally deleted some mission objects.
      QuestInfo:{},MissionSlots:{},
      GridCollection:{Grids:{},DiffGrids:{}}
    }
  };
}
test('seven fields match existing public native message, field numbers and allowed JSON kinds',()=>{
  const fields=getSaveAchievementObservationFields();
  assert.equal(fields.schema,'wand.db05.achievement-observation-fields@1');
  assert.equal(fields.fields.length,7);
  assert.equal(getUnifiedSaveShapeCatalog().publicTemplateCount,440);
  const native=new Map(getDomainSaveFields().fields.map(x=>[x.path,x]));
  for (const rule of fields.fields) {
    const source=native.get(rule.path);
    assert.ok(source,rule.path);
    assert.equal(source.nativeMessage,rule.nativeMessage);
    assert.equal(source.protobufFieldNumber,rule.fieldNumber);
    assert.equal(source.nativePropertyType,rule.nativeType);
    assert.deepEqual(rule.jsonKinds,source.allowedJsonKinds);
    assert.equal(Object.isFrozen(rule),true);
  }
  assert.equal(fields.policy.noDefaultReconstruction,true);
  assert.equal(fields.policy.missingMissionObjectsAreOptional,true);
  assert.equal(fields.policy.writerAuthorized,false);
});
test('schema 626 and 643 edited saves yield the same anonymous field observation',()=>{
  const original=modifiedSave();
  const before=JSON.stringify(original);
  const a=inspectSaveAchievementProgress(modifiedSave(626));
  const b=inspectSaveAchievementProgress(original);
  assert.deepEqual(a,b);
  assert.equal(JSON.stringify(original),before);
  assert.equal(a.contract,SAVE_ACHIEVEMENT_PROGRESS_CONTRACT);
  assert.equal(a.status,'observed_field_kinds');
  assert.equal(a.registeredFields,7);
  assert.equal(a.inspectedRows,2);
  assert.equal(a.containerPresent,true);
  assert.equal(a.invalidRows,0);
  assert.equal(a.fields.find(x=>x.id==='current_amount').observed,2);
  assert.equal(a.fields.find(x=>x.id==='items_used').absent,1);
  assert.equal(a.fields.find(x=>x.id==='types_collected').checkedElements,2);
  assert.equal(a.modifiedSaveMayOmitMissionObjects,true);
  assert.equal(a.absenceIsNotEvidenceOfCorruption,true);
  assert.equal(a.originalSavePreserved,true);
  assert.equal(a.completionVerified,false);
  assert.equal(a.achievementSemanticsVerified,false);
  assert.equal(a.writerAuthorized,false);
  assert.equal(a.exportAuthorized,false);
  assert.equal(Object.isFrozen(a),true);
  assert.equal(Object.isFrozen(a.fields),true);
  const output=JSON.stringify(a);
  for (const forbidden of ['PRIVATE_OWNER','2110000001','UNKNOWN_ENUM_STRING',
    '17','19','PRIVATE_STATE','CurrentStepIndex']) {
    assert.equal(output.includes(forbidden),false,forbidden);
  }
});
test('entire mission and object branches may be intentionally absent without blocking diagnostics',()=>{
  const original=modifiedSave();
  delete original.World.QuestInfo;
  delete original.World.MissionSlots;
  delete original.World.GridCollection;
  const without=inspectSaveAchievementProgress(original);
  assert.equal(without.status,'observed_field_kinds');
  assert.equal(without.saveIntegrityVerified,false);
  assert.equal(without.absenceIsNotEvidenceOfCorruption,true);
  original.Player.AchievementsData=[
    {AchievementID:2110000001,State:'STRING_ENUM_OF_UNKNOWN_MEANING'}
  ];
  assert.equal(inspectSaveAchievementProgress(original).status,'observed_field_kinds');
});
test('optional achievement list omitted, deleted, empty or wrong kind differs without declaring corruption',()=>{
  const save=modifiedSave();
  delete save.Player.AchievementsData;
  const absent=inspectSaveAchievementProgress(save);
  assert.equal(absent.status,'not_observed');
  assert.equal(absent.containerPresent,false);
  assert.equal(absent.containerKindValid,false);
  assert.equal(absent.fields.every(x=>x.observed===0 && x.absent===0),true);
  save.Player.AchievementsData=[];
  assert.equal(inspectSaveAchievementProgress(save).status,'observed_empty');
  save.Player.AchievementsData={};
  const changed=inspectSaveAchievementProgress(save);
  assert.equal(changed.status,'container_type_difference');
  assert.equal(changed.containerKindValid,false);
  assert.equal(changed.saveIntegrityVerified,false);
});
test('unexpected native kinds and non-JSON-shaped rows reported as observations only',()=>{
  const save=modifiedSave();
  save.Player.AchievementsData=[
    {AchievementID:2**41, CurAmount:'4', MaxAmount:2**53,
      ClaimedRewardMilestone:-1,
      State:3, TypesCollected:[1,'PRIVATE_BAD_TYPE',null],
      ItemsUsed:['bad',2**36]},
    null,[],{AchievementID:0, State:'UNKNOWN_YET_LEGAL_ENUM_NAME'}
  ];
  const r=inspectSaveAchievementProgress(save);
  assert.equal(r.status,'observed_kind_difference');
  assert.equal(r.inspectedRows,4);
  assert.equal(r.invalidRows,2);
  const byId=Object.fromEntries(r.fields.map(x=>[x.id,x]));
  assert.equal(byId.achievement_id.observed,2);
  assert.equal(byId.achievement_id.typeIssues,1);
  assert.equal(byId.current_amount.observed,1);
  assert.equal(byId.current_amount.typeIssues,1);
  assert.equal(byId.claimed_reward_milestone.typeIssues,0); // signed native int
  assert.equal(byId.max_amount.typeIssues,1);
  assert.equal(byId.state.typeIssues,1);
  assert.equal(byId.types_collected.checkedElements,3);
  assert.equal(byId.types_collected.nestedTypeIssues,2);
  assert.equal(byId.items_used.nestedTypeIssues,2); // string and out-of-native-int32 range
  assert.equal(r.saveIntegrityVerified,false);
  assert.equal(JSON.stringify(r).includes('PRIVATE_BAD_TYPE'),false);
  assert.equal(JSON.stringify(r).includes('UNKNOWN_YET'),false);
});
test('bounded rows and repeated int arrays report only sampled observation',()=>{
  const save=modifiedSave();
  save.Player.AchievementsData=Array.from({length:320},()=>({
    CurAmount:1,MaxAmount:3,TypesCollected:Array.from({length:150},()=>1)
  }));
  const r=inspectSaveAchievementProgress(save);
  assert.equal(r.status,'sampled_observation');
  assert.equal(r.inspectedRows,256);
  assert.equal(r.sampled,true);
  const nested=r.fields.find(x=>x.id==='types_collected');
  assert.equal(nested.checkedElements,256*128);
  assert.equal(nested.sampled,true);
  const smaller=inspectSaveAchievementProgress(save,{maxRecords:2});
  assert.equal(smaller.inspectedRows,2);
  assert.equal(smaller.sampled,true);
  for(const options of [{maxRecords:0},{maxRecords:257},{maxRecords:1.1},
      null,[],true,'not_options']) {
    assert.throws(()=>inspectSaveAchievementProgress(save,options),
      /DB05_ACHIEVEMENT_PROGRESS_LIMIT_INVALID/);
  }
});
test('strict decoded root required but individual deleted world branches are not required',()=>{
  for(const invalid of [null,{}, {GameInfo:{},World:{},Player:{}},
    {GameInfo:{Version:'invalid'},Player:{},World:{}},
    {GameInfo:{Version:626},Player:[],World:{}}]) {
    assert.throws(()=>inspectSaveAchievementProgress(invalid),
      /DB05_ACHIEVEMENT_PROGRESS_SAVE_ROOT_INVALID/);
  }
  const sparse={GameInfo:{Version:626},Player:{},World:{}};
  assert.equal(inspectSaveAchievementProgress(sparse).status,'not_observed');
});
