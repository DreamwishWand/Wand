import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveGuideProgressBridge, getSaveGuideLinkRules,
  SAVE_GUIDE_JOIN_CONTRACT } from '../src/lib/save/guide-links.mjs';
import { getUnifiedSaveShapeCatalog, getDomainSaveFields } from '../src/lib/save/registry.mjs';

const HASH='a'.repeat(64);
function guideIndex(version='1.26.1') {
  const ids=['2070000620','2070000621'];
  return {
    schema:'wand.db03.quest-search@1',
    target:{gameVersion:version,platform:'Steam'},
    source:{file:'ddv_Data/StreamingAssets/itemlist/Mission.json',sha256:HASH},
    counts:{missions:2,sourceNativeRecords:2,excludedQuestGroups:0,excludedUnclassified:0},
    records: ids.map((id,i)=>({
      id,names:{ja:'PRIVATE_QUEST_LABEL_'+i},internalName:'PRIVATE_INTERNAL_'+i,
      groupId:null,characterId:null,sourceUpdateGroup:null,sourceScopeTokens:[],
      objectiveKinds:[],detail:{file:'quest-shards/part-23.json',
        recordSha256:HASH,nativeWireSha256:HASH}
    }))
  };
}
function save(version=643) {
  return { GameInfo:{Version:version}, Player:{Account:'PRIVATE_PLAYER_TOKEN'},
    World:{MissionSlots:{
      'SECRET_MAP_KEY':{Slots:[
        {MissionId:2070000620,CurrentStepIndex:1,State:'Active'},
        {MissionId:2070000621,CurrentStepIndex:2,State:'Active'}
      ]}
    }} };
}
test('source path is native-backed among 440 fields and manifest is immutable',()=>{
  const rules=getSaveGuideLinkRules();
  assert.equal(rules.schema,'wand.db05.db03-quest-links@1');
  assert.equal(rules.families.length,1);
  assert.equal(rules.families[0].path,'/World/MissionSlots/{id}/Slots[]/MissionId');
  assert.equal(getUnifiedSaveShapeCatalog().publicTemplateCount,440);
  assert.equal(getDomainSaveFields().fields.find(x=>x.path===rules.families[0].path)?.nativePropertyType,'int');
  assert.equal(Object.isFrozen(rules.families[0]),true);
  assert.equal(rules.policy.writerAuthorized,false);
});

test('canonical exact Mission ID lookup is metadata-bound but save-version neutral',()=>{
  const bridge=createSaveGuideProgressBridge(guideIndex());
  assert.equal(bridge.contract,SAVE_GUIDE_JOIN_CONTRACT);
  const result626=bridge.auditSave(save(626));
  const result643=bridge.auditSave(save(643));
  assert.deepEqual(result626,result643);
  assert.equal(result643.status,'native_mission_id_candidates');
  assert.equal(result643.observed,2);
  assert.equal(result643.matched,2);
  assert.equal(result643.distinctObserved,2);
  assert.equal(result643.unresolved,0);
  assert.equal(result643.source.originalSourceBytesVerifiedByBridge,false);
  assert.equal(result643.sourceAndSaveJointlyVerified,false);
  assert.equal(result643.questProgressVerified,false);
  assert.equal(result643.writerAuthorized,false);
  assert.equal(result643.exportAuthorized,false);
  const text=JSON.stringify(result643);
  for(const secret of [
    'PRIVATE_QUEST_LABEL','PRIVATE_INTERNAL','PRIVATE_PLAYER_TOKEN',
    'SECRET_MAP_KEY','2070000620','2070000621','CurrentStepIndex'
  ]) assert.equal(text.includes(secret),false,secret);
});

test('unmatched exact IDs are unresolved in the playable subset, not invalid quests',()=>{
  const doc=save();
  doc.World.MissionSlots.SECRET_MAP_KEY.Slots.push({MissionId:2070000999});
  const report=createSaveGuideProgressBridge(guideIndex()).auditSave(doc);
  assert.equal(report.unresolved,1);
  assert.equal(report.matched,2);
  assert.equal(report.status,'unresolved_in_playable_quest_subset');
  assert.equal(report.source.subset,'playable_missions_only');
});

test('zero sentinel, malformed values, nulls and missing fields have distinct outcomes',()=>{
  const doc=save();
  doc.World.MissionSlots.SECRET_MAP_KEY.Slots=[
    {MissionId:0},{MissionId:'2070000620'},
    {MissionId:-1},{MissionId:null},{MissionId:2**53},{MissingID:1}
  ];
  const report=createSaveGuideProgressBridge(guideIndex()).auditSave(doc);
  assert.equal(report.status,'observed_type_issue');
  assert.equal(report.observed,5);
  assert.equal(report.zeroSentinels,1);
  assert.equal(report.malformed,4);
  assert.equal(report.missing,1);
  assert.equal(report.matched,0);
  assert.equal(report.unresolved,0);
});

test('bounded scans fail to assert completeness and never leak map keys',()=>{
  const doc=save();
  doc.World.MissionSlots={};
  for(let i=0;i<700;i++){
    doc.World.MissionSlots['PRIVATE_'+i]={Slots:[{MissionId:2070000620}]};
  }
  const bridge=createSaveGuideProgressBridge(guideIndex());
  const report=bridge.auditSave(doc,{maxReferences:12});
  assert.equal(report.observed,12);
  assert.equal(report.sampled,true);
  assert.equal(report.status,'sampled_inconclusive');
  assert.equal(report.matched,12);
  assert.equal(JSON.stringify(report).includes('PRIVATE_'),false);
  for(const wrong of [{maxReferences:0},{maxReferences:257},{maxReferences:1.5}])
    assert.throws(()=>bridge.auditSave(doc,wrong),/DB05_DB03_AUDIT_LIMIT_INVALID/);
});
test('missing or invalid save root and mission slot shape fail closed',()=>{
  const bridge=createSaveGuideProgressBridge(guideIndex());
  for(const bad of [null,{}, {GameInfo:{Version:'PRIVATE'},Player:{},World:{}},
    {GameInfo:{Version:643},Player:[],World:{}}])
    assert.throws(()=>bridge.auditSave(bad),/DB05_DB03_SAVE_ROOT_INVALID/);
  const none=bridge.auditSave({GameInfo:{Version:643},Player:{},World:{}});
  assert.equal(none.status,'not_observed');
  const doc=save();
  doc.World.MissionSlots=[];
  assert.equal(bridge.auditSave(doc).status,'observed_type_issue');
});
test('rejects fake source provenance, missing rows, invalid native locator and duplicate IDs',()=>{
  const incorrect=guideIndex();
  incorrect.records[0].id=incorrect.records[1].id;
  assert.throws(()=>createSaveGuideProgressBridge(incorrect),
    /DB05_DB03_VERIFIED_QUEST_SEARCH_REQUIRED/);
  const forged=guideIndex();
  forged.source.sha256='not-a-hash';
  assert.throws(()=>createSaveGuideProgressBridge(forged),
    /DB05_DB03_VERIFIED_QUEST_SEARCH_REQUIRED/);
  const escaped=guideIndex();
  escaped.records[0].detail.file='../private.json';
  assert.throws(()=>createSaveGuideProgressBridge(escaped),
    /DB05_DB03_VERIFIED_QUEST_SEARCH_REQUIRED/);
});
