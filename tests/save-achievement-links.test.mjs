import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSaveAchievementBridge, getSaveAchievementLinkRules,
  SAVE_ACHIEVEMENT_JOIN_CONTRACT
} from '../src/lib/save/achievement-links.mjs';
import {
  getDomainSaveFields, getUnifiedSaveShapeCatalog
} from '../src/lib/save/registry.mjs';

const SHA='a'.repeat(64);
const SOURCE='ddv_Data/StreamingAssets/itemlist/DutyAch.json';
function duties(){
  return {schema:'wand.db03.native-guide@1',family:'duties',
    target:{platform:'Steam',gameVersion:'1.26.1'},
    records:['2110000001','2110000002'].map((id,i)=>({
      id,rawName:'PRIVATE_DUTY_NAME_'+i, nativeWireSha256:SHA,
      names:{ja:'PRIVATE_DUTY_LOCALIZATION_'+i},
      source:{file:SOURCE,sha256:SHA,frameIndex:i}
    }))};
}
function save(version=643){
  return {GameInfo:{Version:version},Player:{
    Account:'PRIVATE_PLAYER_ACCOUNT',
    AchievementsData:[
      {AchievementID:2110000001,CurAmount:3,MaxAmount:10,State:'PRIVATE_PROGRESS'},
      {AchievementID:2110000002,CurAmount:0,ClaimedRewardMilestone:0}
    ]
  },World:{}};
}
test('manifest explicitly pins DutyAch rather than playable Mission namespace',()=>{
  const manifest=getSaveAchievementLinkRules();
  assert.equal(manifest.schema,'wand.db05.db03-duty-achievement-links@1');
  assert.equal(manifest.families.length,1);
  const rule=manifest.families[0];
  assert.equal(rule.path,'/Player/AchievementsData[]/AchievementID');
  assert.equal(rule.nativeMessage,'AchievementData');
  assert.equal(rule.nativeFieldNumber,1);
  assert.equal(rule.targetSource,SOURCE);
  assert.equal(manifest.policy.writerAuthorized,false);
  assert.equal(Object.isFrozen(rule),true);
  assert.equal(getUnifiedSaveShapeCatalog().publicTemplateCount,440);
  const field=getDomainSaveFields().fields.find(f=>f.path===rule.path);
  assert.equal(field.nativePropertyType,'int');
  assert.equal(field.protobufFieldNumber,1);
});
test('source-native DutyAch IDs match 626 and 643 observed save structures without leaking values',()=>{
  const bridge=createSaveAchievementBridge(duties());
  assert.equal(bridge.contract,SAVE_ACHIEVEMENT_JOIN_CONTRACT);
  const before=JSON.stringify(save());
  const a=bridge.auditSave(save(626)),b=bridge.auditSave(save(643));
  assert.deepEqual(a,b);
  assert.equal(b.status,'native_duty_id_candidates');
  assert.equal(b.observed,2);
  assert.equal(b.matched,2);
  assert.equal(b.unresolved,0);
  assert.equal(b.distinctObserved,2);
  assert.equal(b.source.metadataValidated,true);
  assert.equal(b.source.originalSourceBytesVerifiedByBridge,false);
  assert.equal(b.saveAndCatalogJointlyVerified,false);
  assert.equal(b.progressVerified,false);
  assert.equal(b.completionVerified,false);
  assert.equal(b.entitlementVerified,false);
  assert.equal(b.writerAuthorized,false);
  assert.equal(b.exportAuthorized,false);
  assert.equal(JSON.stringify(save()),before);
  const output=JSON.stringify(b);
  for (const forbidden of ['2110000001','2110000002','PRIVATE_','CurAmount','MaxAmount',
    'ClaimedRewardMilestone','Account','State']) {
    assert.equal(output.includes(forbidden),false,forbidden);
  }
});
test('nonmatching exact achievement ID means unresolved in supplied DutyAch index only',()=>{
  const s=save();
  s.Player.AchievementsData.push({AchievementID:2110000999});
  const r=createSaveAchievementBridge(duties()).auditSave(s);
  assert.equal(r.matched,2);
  assert.equal(r.unresolved,1);
  assert.equal(r.status,'unresolved_in_supplied_duty_index');
  assert.equal(r.source.coverageVerified,false);
});
test('map/list identity, zero sentinel, unknown state, malformed IDs and duplicate IDs',()=>{
  const s=save();
  s.Player.AchievementsData=[
    {AchievementID:0},{AchievementID:'2110000001'}, {AchievementID:-1},
    {AchievementID:null},{AchievementID:Number.MAX_SAFE_INTEGER+1},
    {AchievementID:2110000001,State:'STATE_NOT_INTERPRETED'},
    {AchievementID:2110000001,State:'STATE_NOT_INTERPRETED'},
    {CurAmount:42},null
  ];
  const r=createSaveAchievementBridge(duties()).auditSave(s);
  assert.equal(r.observed,7);
  assert.equal(r.matched,2);
  assert.equal(r.malformed,4);
  assert.equal(r.zeroSentinels,1);
  assert.equal(r.missing,1);
  assert.equal(r.typeIssues,1);
  assert.equal(r.distinctObserved,1);
  assert.equal(r.status,'observed_type_issue');
  assert.equal(JSON.stringify(r).includes('STATE_NOT_INTERPRETED'),false);
});
test('all-zero, absent, empty and invalid achievement collection are distinguished',()=>{
  const bridge=createSaveAchievementBridge(duties());
  const s=save();
  s.Player.AchievementsData=[{AchievementID:0},{AchievementID:0}];
  assert.equal(bridge.auditSave(s).status,'zero_sentinels_only');
  s.Player.AchievementsData=[];
  assert.equal(bridge.auditSave(s).status,'not_observed');
  delete s.Player.AchievementsData;
  assert.equal(bridge.auditSave(s).status,'not_observed');
  s.Player.AchievementsData={};
  assert.equal(bridge.auditSave(s).status,'observed_type_issue');
});
test('bounded observation never presents skipped entries as verified',()=>{
  const bridge=createSaveAchievementBridge(duties()),s=save();
  s.Player.AchievementsData=Array.from({length:600},()=>({AchievementID:2110000001}));
  const r=bridge.auditSave(s);
  assert.equal(r.observed,256);
  assert.equal(r.matched,256);
  assert.equal(r.sampled,true);
  assert.equal(r.status,'sampled_inconclusive');
  const explicit=bridge.auditSave(s,{maxReferences:2});
  assert.equal(explicit.observed,2);
  assert.equal(explicit.sampled,true);
  for(const options of [{maxReferences:0},{maxReferences:257},{maxReferences:1.2},null,[],
    'wrong']) assert.throws(()=>bridge.auditSave(s,options),
      /DB05_ACHIEVEMENT_AUDIT_LIMIT_INVALID/);
});
test('non-strict or malformed decoded save root cannot be admitted',()=>{
  const bridge=createSaveAchievementBridge(duties());
  for(const s of [null,{}, {GameInfo:{Version:643},Player:[],World:{}},
    {GameInfo:{Version:'secret'},Player:{},World:{}},
    {GameInfo:{Version:643},Player:{},World:null}])
    assert.throws(()=>bridge.auditSave(s),/DB05_ACHIEVEMENT_SAVE_ROOT_INVALID/);
});
test('rejects wrong family, fabricated native source metadata, duplicates and unsafe duty IDs',()=>{
  const maker=()=>duties();
  const variants=[
    x=>x.family='quests',
    x=>x.schema='PRIVATE_WRONG_SCHEMA',
    x=>x.target.platform='',
    x=>x.records[1].id=x.records[0].id,
    x=>x.records[0].id='2110000001junk',
    x=>x.records[0].id='0900',
    x=>x.records[0].id='9007199254740993',
    x=>x.records[0].source.file='../DUTY_PRIVATE_PATH',
    x=>x.records[0].source.sha256='0'.repeat(64),
    x=>x.records[0].nativeWireSha256='PRIVATE',
    x=>x.records[0].rawName='',
    x=>x.records[0].source.frameIndex=-1,
    x=>x.records=[]
  ];
  for(const corrupt of variants){
    const doc=maker(); corrupt(doc);
    assert.throws(()=>createSaveAchievementBridge(doc),
      /DB05_DB03_NATIVE_DUTIES_REQUIRED/);
  }
});
