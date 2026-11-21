import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCleanSaveBaseline,getCleanSaveBaselineRules,
  SAVE_CLEAN_BASELINE_CONTRACT
} from '../src/lib/save/clean-baseline.mjs';

const claim=()=>({
  ownerDeclaredClean:true,
  ownerDeclaredNoCheats:true,
  ownerDeclaredNoRestrictedObjectEdits:true
});
const fixture=(version=643)=>({
  GameInfo:{Version:version,PrivateName:'FORBIDDEN_USER_TOKEN'},
  Player:{
    ListInventories:{
      '11111111':{ID:11111111,Inventory:{'90000001':{Amount:3}},CompatibleItemType:'Unknown_Slot'},
      '22222222':{ID:22222222,Inventory:{},CompatibleItemType:'Unknown_Slot'}
    },
    ContainerInventories:{
      '33333333':{ID:33333333,Inventory:[],Size:20},
      '44444444':{ID:44444444,Inventory:[{ItemID:90000005}],Size:20}
    },
    CollectionSets:[{GroupData:[]}],
    AchievementsData:[{AchievementID:88888888,State:'PRIVATE_ENUM',
      CurAmount:0,MaxAmount:0,ClaimedRewardMilestone:0}],
    Account:'VERY_PRIVATE_PLAYER_TOKEN'
  },
  World:{
    MissionSlots:{'666':{Slots:[]}},
    QuestInfo:{MissionsCompleted:[]},
    GridCollection:{Grids:{'777':{ID:777}},DiffGrids:{'888':{ID:888}}},
    Villages:[{}],Characters:[{}],PlayerHouses:[{}],
    PrivateOwnerWorldId:'NEVER_PUBLISH'
  }
});
test('QwX-class clean baseline captures exact fixed shapes, not sensitive identifiers or user provenance',()=>{
  const clean=fixture();
  const before=JSON.stringify(clean);
  const b=createCleanSaveBaseline(clean,claim());
  assert.equal(JSON.stringify(clean),before);
  assert.equal(b.contract,SAVE_CLEAN_BASELINE_CONTRACT);
  assert.equal(b.reference.status,'owner_declared_clean_observed');
  assert.equal(b.reference.ownerDeclarationNotTechnicallyVerifiable,true);
  assert.equal(b.reference.sourceBuildValidated,false);
  assert.equal(b.reference.encryptedRoundtripValidated,false);
  assert.equal(b.reference.writerAuthorized,false);
  assert.equal(b.reference.fieldCount,getCleanSaveBaselineRules().length);
  assert.equal(b.reference.observations.find(x=>x.id==='achievements').childCount,1);
  assert.equal(b.reference.observations.find(x=>x.id==='container_inventories').childCount,2);
  assert.ok(Object.isFrozen(b.reference));
  assert.ok(Object.isFrozen(b.reference.observations[0]));
  assert.equal(Object.isFrozen(getCleanSaveBaselineRules()),true);
  for(const secret of [
    'VERY_PRIVATE','FORBIDDEN_USER_TOKEN','PRIVATE_ENUM',
    '90000001','90000005','88888888','11111111',
    'NEVER_PUBLISH','Unknown_Slot'
  ]) assert.ok(!JSON.stringify(b.reference).includes(secret),secret);
});
test('absence of missions or deleted objects in modified save is not corruption',()=>{
  const b=createCleanSaveBaseline(fixture(),claim());
  const edited=fixture();
  delete edited.World.MissionSlots;
  delete edited.World.QuestInfo;
  delete edited.World.GridCollection.DiffGrids;
  delete edited.Player.AchievementsData;
  const result=b.compare(edited);
  assert.equal(result.status,'optional_fields_not_observed');
  assert.ok(result.optionalFieldsNotObserved.includes('mission_slots'));
  assert.ok(result.optionalFieldsNotObserved.includes('achievements'));
  assert.ok(result.optionalFieldsNotObserved.includes('world_diff_grids'));
  assert.equal(result.absenceDoesNotImplyCorruption,true);
  assert.equal(result.countDriftDoesNotImplyCheats,true);
  assert.equal(result.countDriftDoesNotImplyUserObjectEdits,true);
  assert.equal(result.completeEditorSchemaVerified,false);
  assert.equal(result.writerAuthorized,false);
  for(const secret of ['11111111','22222222','666','777','888','PRIVATE']){
    assert.ok(!JSON.stringify(result).includes(secret),secret);
  }
});
test('normal gameplay changes in count are count drift, not cheating or bad save',()=>{
  const b=createCleanSaveBaseline(fixture(),claim());
  const advanced=fixture(827);  // version labels never gate shape
  advanced.Player.AchievementsData.push(
    {AchievementID:9999999,CurAmount:100,State:'PRIVATE_NEW_ENUM'});
  advanced.World.GridCollection.DiffGrids['900009']={ID:900009};
  advanced.Player.CollectionSets.push({GroupData:[]});
  const result=b.compare(advanced);
  assert.equal(result.status,'cardinality_drift_only');
  assert.ok(result.cardinalityDifferentFields.includes('achievements'));
  assert.ok(result.cardinalityDifferentFields.includes('world_diff_grids'));
  assert.equal(result.typeDifferenceCandidates.length,0);
  assert.equal(result.differentSchemaVersionIsNotIncompatibleByItself,true);
  assert.equal(result.ownerModificationHistoryNotInferred,true);
});
test('unexpected kind of observed known source field is a diagnostic only',()=>{
  const b=createCleanSaveBaseline(fixture(),claim()),candidate=fixture();
  candidate.World.GridCollection.Grids=[];
  const result=b.compare(candidate);
  assert.equal(result.status,'observed_kind_difference');
  assert.ok(result.typeDifferenceCandidates.includes('world_grids'));
  assert.equal(result.strictRoundtripVerified,false);
  assert.equal(result.writerAuthorized,false);
});
test('clean reference itself may have absent optional fields without speculation',()=>{
  const clean=fixture();
  delete clean.World.MissionSlots;
  delete clean.Player.AchievementsData;
  const b=createCleanSaveBaseline(clean,claim());
  const c=b.compare(fixture());
  assert.equal(c.typeDifferenceCandidates.length,0);
  assert.ok(c.cardinalityDifferentFields.includes('mission_slots'));
  assert.equal(c.absenceDoesNotImplyCorruption,true);
});
test('explicit clean owner declaration and root checks are mandatory',()=>{
  const f=fixture();
  for(const bad of [{},null,[],{ownerDeclaredClean:true},
    {...claim(),ownerDeclaredNoCheats:false}
  ]) assert.throws(()=>createCleanSaveBaseline(f,bad),
    /DB05_CLEAN_BASELINE_OWNER_DECLARATION_REQUIRED/);
  for(const bad of [null,{}, {GameInfo:{},Player:{},World:{}},
    {GameInfo:{Version:643},Player:[],World:{}}]){
    assert.throws(()=>createCleanSaveBaseline(bad,claim()),
      /DB05_CLEAN_BASELINE_ROOT_INVALID/);
  }
  const b=createCleanSaveBaseline(f,claim());
  assert.throws(()=>b.compare({GameInfo:{Version:643},Player:[],World:{}}),
    /DB05_CLEAN_BASELINE_CANDIDATE_ROOT_INVALID/);
});
test('sampling of abnormally large maps is explicit instead of pretending exhaustive',()=>{
  const sample=fixture();
  for(let i=0;i<4200;i++)sample.World.GridCollection.Grids[String(i)]= {};
  const b=createCleanSaveBaseline(sample,claim());
  const r=b.compare(fixture());
  assert.equal(r.status,'sampled_inconclusive');
  assert.ok(r.sampledFields.includes('world_grids'));
  assert.equal(r.writerAuthorized,false);
});
