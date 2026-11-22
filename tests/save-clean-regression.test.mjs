import test from 'node:test';
import assert from 'node:assert/strict';
import {createCleanSaveRegression,SAVE_CLEAN_REGRESSION_CONTRACT}
  from '../src/lib/save/clean-regression.mjs';

const declaration={
  ownerDeclaredClean:true,ownerDeclaredNoCheats:true,
  ownerDeclaredNoRestrictedObjectEdits:true
};
function save(version=643){
  return {
    GameInfo:{Version:version,AccountId:'PRIVATE_GAME_ACCOUNT_STRING'},
    Player:{
      ListInventories:{
        '424242424':{ID:424242424,CompatibleItemType:'PRIVATE_TYPE',
          Inventory:{'747474747':{Amount:17,Marker:'PRIVATE_MARKER'}}}
      },
      ContainerInventories:{
        '313131313':{ID:313131313,ParentItemID:null,Size:12,
          Inventory:[{ItemID:727272727,Amount:2,State:null}]}
      },
      CollectionSets:[{CollectionDefinitionID:707070707,
        GroupData:[{GroupIndex:0,State:'PRIVATE_STATE',
          GroupsCollectionItems:{'222222222':{State:'PRIVATE'}}}]}],
      AchievementsData:[{AchievementID:2110000001,CurAmount:0,
        MaxAmount:0,ClaimedRewardMilestone:0,State:'PRIVATE_ON_GOING',
        TypesCollected:[],ItemsUsed:[]}]
    },
    World:{
      MissionSlots:{'171717171':{Slots:[{MissionId:2110000002}]}},
      QuestInfo:{MissionsCompleted:[]},
      GridCollection:{
        Grids:{'5':{ID:5,GridDataPath:'PRIVATE/ORIGINAL/GRID',
          Objects:{'100':{ID:100,ItemID:303030303,State:{
            Storage:{ContainerInventoryID:313131313}
          }}}}},
        DiffGrids:{'0':{ID:0,ModifiedObjects:{
          '80':{ID:80,ItemID:303030303,State:null}
        },RemovedObjects:[]}}
      },
      PlayerHouses:[],PrivateExternalSave:'DO_NOT_EXPOSE_PRIVATE',
      Villages:[],Characters:[]
    }
  };
}
test('23/60/14 source-defined rules, owner declaration and read-only guard',()=>{
  const input=save(),before=JSON.stringify(input);
  const audit=createCleanSaveRegression(input,declaration);
  assert.equal(audit.contract,SAVE_CLEAN_REGRESSION_CONTRACT);
  assert.equal(audit.reference.knownStructureTemplates,23);
  assert.equal(audit.reference.editorReadsetTemplates,60);
  assert.equal(audit.reference.referenceRelationRules,14);
  assert.equal(audit.reference.sameAccountHistoryVerified,false);
  assert.equal(audit.reference.actualSourceValuesCaptured,false);
  assert.equal(audit.reference.writerAuthorized,false);
  assert.equal(Object.isFrozen(audit.reference),true);
  assert.equal(JSON.stringify(input),before);
  const result=audit.compare(structuredClone(input));
  assert.equal(result.status,'same_observed_structural_counts');
  assert.equal(result.observedSaveSchema,643);
  assert.deepEqual(result.editorReadset.changedFieldIds,[]);
  assert.equal(result.referenceGraph.changedRuleIds.length,0);
  assert.equal(result.unchangedCountsDoNotImplyIdenticalSaves,true);
  assert.equal(result.writerAuthorized,false);
  assert.equal(result.exportAuthorized,false);
  assert.equal(Object.isFrozen(result.editorReadset.domains[0]),true);
  const serialized=JSON.stringify({reference:audit.reference,result});
  for(const secret of [
    'PRIVATE','747474747','424242424','313131313','727272727',
    '707070707','2110000001','2110000002','303030303','222222222',
    '171717171','DO_NOT_EXPOSE'
  ])assert.ok(!serialized.includes(secret),secret);
});
test('natural progression or another account changes counts without proving edits or cheating',()=>{
  const baseline=createCleanSaveRegression(save(),declaration);
  const candidate=save(626);
  candidate.Player.CollectionSets.push({CollectionDefinitionID:888888888,GroupData:[]});
  candidate.Player.AchievementsData.push({AchievementID:2110000003,CurAmount:1});
  candidate.World.GridCollection.Grids['8']={ID:8,Objects:{}};
  const r=baseline.compare(candidate);
  assert.equal(r.status,'observed_count_or_relation_drift');
  assert.ok(r.editorReadset.changedFieldIds.includes('achievement_records'));
  assert.equal(r.sourceVersionIsNotCompatibilityGate,true);
  assert.equal(r.observedSaveSchema,626);
  assert.equal(r.driftDoesNotProveCheatsOrIllegalObjectEdits,true);
  assert.equal(r.twoSavesMayBelongToDifferentPlayers,true);
  assert.equal(r.noContinuousSaveHistoryEstablished,true);
  assert.equal(r.writerAuthorized,false);
});
test('owner-modified missing missions, achievements or world branches remain unknown',()=>{
  const clean=createCleanSaveRegression(save(),declaration);
  const candidate=save();
  delete candidate.World.MissionSlots;
  delete candidate.World.GridCollection.DiffGrids;
  delete candidate.Player.AchievementsData;
  const r=clean.compare(candidate);
  assert.equal(r.status,'optional_fields_not_observed');
  assert.ok(r.editorReadset.missingFieldIds.includes('achievement_records'));
  assert.ok(r.editorReadset.missingFieldIds.includes('mission_slot_groups'));
  assert.ok(r.baseline.optionalFieldsNotObserved.includes('world_diff_grids'));
  assert.equal(r.absenceDoesNotProveCorruption,true);
  assert.equal(r.unknownFieldsNotReconstructed,true);
  assert.equal(r.writerAuthorized,false);
});
test('new observed kind difference is a diagnostic, never a writer admission',()=>{
  const clean=createCleanSaveRegression(save(),declaration);
  const candidate=save(844);
  candidate.Player.ContainerInventories['313131313'].ParentItemID='PRIVATE_UNKNOWN';
  candidate.World.GridCollection.Grids['5'].Objects['100'].State=[];
  const r=clean.compare(candidate);
  assert.equal(r.status,'observed_kind_difference');
  assert.ok(r.editorReadset.typeCandidateIds.includes('container_parent_item'));
  assert.ok(r.editorReadset.typeCandidateIds.includes('grid_object_state'));
  assert.equal(r.observedKindDifferenceIsOnlyDiagnostic,true);
  assert.equal(r.writerAuthorized,false);
});
test('same counts with changed user data do not become a claim of identical saves',()=>{
  const clean=createCleanSaveRegression(save(),declaration);
  const changed=save();
  changed.Player.ListInventories['424242424'].Inventory['747474747'].Amount=999999999;
  changed.Player.AchievementsData[0].State='PRIVATE_DIFFERENT';
  changed.World.PrivateExternalSave='PRIVATE_OTHER_TOKEN';
  const r=clean.compare(changed);
  assert.equal(r.status,'same_observed_structural_counts');
  assert.equal(r.unchangedCountsDoNotImplyIdenticalSaves,true);
});
test('mutation of clean input after baseline capture cannot change saved witnesses',()=>{
  const input=save();
  const baseline=createCleanSaveRegression(input,declaration);
  const first=baseline.compare(save());
  input.Player.AchievementsData.splice(0);
  input.World.GridCollection.Grids={};
  input.Player.ContainerInventories={};
  const after=baseline.compare(save());
  assert.deepEqual(first,after);
});
test('bounded traversal marks inconclusive without labeling a large clean grid corrupt',()=>{
  const input=save();
  input.World.GridCollection.Grids['5'].Objects={};
  for(let i=0;i<17000;i++){
    input.World.GridCollection.Grids['5'].Objects[String(i)]={ID:i,ItemID:303030303};
  }
  const b=createCleanSaveRegression(input,declaration);
  const r=b.compare(save());
  assert.equal(r.status,'sampled_inconclusive');
  assert.ok(r.editorReadset.sampledFieldIds.includes('grid_object'));
  assert.ok(r.referenceGraph.sampledRuleIds.length>0);
  assert.equal(r.writerAuthorized,false);
});
test('reject invalid owner declaration, raw roots and duplicate-prone invalid value shape',()=>{
  for(const bad of [{},null,{ownerDeclaredClean:true}]){
    assert.throws(()=>createCleanSaveRegression(save(),bad),
      /DB05_CLEAN_BASELINE_OWNER_DECLARATION_REQUIRED/);
  }
  assert.throws(()=>createCleanSaveRegression({GameInfo:{},Player:{},World:{}},declaration),
    /DB05_CLEAN_BASELINE_ROOT_INVALID/);
  const x=createCleanSaveRegression(save(),declaration);
  assert.throws(()=>x.compare({GameInfo:{Version:643},Player:[],World:{}}),
    /DB05_CLEAN_BASELINE_CANDIDATE_ROOT_INVALID/);
});
