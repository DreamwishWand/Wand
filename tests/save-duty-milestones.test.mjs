import test from 'node:test';
import assert from 'node:assert/strict';
import {createSaveDutyMilestoneBridge, getSaveDutyMilestoneWireContract,
  SAVE_DUTY_MILESTONE_JOIN_CONTRACT} from '../src/lib/save/duty-milestones.mjs';

const H='a'.repeat(64),S='ddv_Data/StreamingAssets/itemlist/DutyAch.json';
function input(){
 const records=['2110000001','2110000002','2110000003'].map((id,i)=>({
   id,rawName:'OWNER_PRIVATE_DUTY_'+i,nativeWireSha256:H,
   source:{file:S,sha256:H,frameIndex:i}
 }));
 const duties={schema:'wand.db03.native-guide@1',family:'duties',
   target:{gameVersion:'1.26.1',platform:'Steam'},records};
 const projection={schema:'wand.db05.native-duty-milestones@1',
   sourceSchema:'wand.db03.native-guide@1',target:{...duties.target},
   source:{file:S,sha256:H},
   evidence:{
     nativeMessage:'Definitions.Items.AchievementItemData',
     milestonesFieldNumber:13,
     nestedMessage:'Definitions.Items.AchievementMilestone',
     nestedFieldNumbers:{milestone:1,rewardItem:2,rewardAmount:3},
     typedFieldProofOnly:true,allDefinitionsInterpreted:false,
     rewardEligibilityVerified:false,rewardOwnershipVerified:false,
     saveProgressVerified:false,writerAuthorized:false,exportAuthorized:false
   },
   summary:{nativeRows:3,typedMilestoneDefinitions:1,typedMilestones:2,
     opaqueOrMixedDefinitions:1,noField13Definitions:1},
   records:[
     {id:records[0].id,frameIndex:0,nativeWireSha256:H,
       evidenceState:'typed_milestone_fields',
       milestones:[
         {milestone:3,rewardItem:300001,rewardAmount:1},
         {milestone:10,rewardItem:300002,rewardAmount:2}
       ]},
     {id:records[1].id,frameIndex:1,nativeWireSha256:H,
       evidenceState:'opaque_or_mixed_field13',milestones:[]},
     {id:records[2].id,frameIndex:2,nativeWireSha256:H,
       evidenceState:'no_field13_observed',milestones:[]}
   ]
 };
 return {duties,projection};
}
function save(version=643){
 return {GameInfo:{Version:version},Player:{
   PrivateAccount:'SECRET_OWNER_ACCOUNT',
   AchievementsData:[
     {AchievementID:2110000001,CurAmount:5,ClaimedRewardMilestone:3,
       State:'SECRET_STATE',MaxAmount:10},
     {AchievementID:2110000002,CurAmount:10,ClaimedRewardMilestone:10},
     {AchievementID:2110000003,CurAmount:10},
     {AchievementID:2110000999,CurAmount:10000,ClaimedRewardMilestone:10000}
   ]
 },World:{}};
}
test('public field contract is source-derived and does not infer owned rewards',()=>{
 const rule=getSaveDutyMilestoneWireContract();
 assert.equal(rule.schema,'wand.db05.duty-milestone-wire-contract@1');
 assert.equal(rule.sourceEvidence.fieldNumber,13);
 assert.deepEqual(rule.sourceEvidence.elementFields.map(x=>[x.number,x.name]),
   [[1,'Milestone'],[2,'RewardItem'],[3,'RewardAmount']]);
 assert.equal(rule.policy.rewardGrantVerified,false);
 assert.equal(rule.policy.writerAuthorized,false);
 assert.equal(Object.isFrozen(rule.sourceEvidence.elementFields[0]),true);
});
test('exact same native IDs compare only numeric thresholds on schema 626 and 643',()=>{
 const {duties,projection}=input();
 const bridge=createSaveDutyMilestoneBridge(duties,projection);
 const original=save(),before=JSON.stringify(original);
 const a=bridge.auditSave(save(626)),b=bridge.auditSave(original);
 assert.equal(JSON.stringify(original),before);
 assert.deepEqual(a,b);
 assert.equal(a.contract,SAVE_DUTY_MILESTONE_JOIN_CONTRACT);
 assert.equal(a.status,'partially_typed_source_definitions');
 assert.equal(a.savedRowsWithDefinition,3);
 assert.equal(a.typedMilestoneDefinitionRows,1);
 assert.equal(a.opaqueDefinitionRows,1);
 assert.equal(a.noMilestoneFieldRows,1);
 assert.equal(a.typedMilestoneEntries,2);
 assert.equal(a.currentAmountComparisons,2);
 assert.equal(a.currentAtOrAboveThreshold,1);
 assert.equal(a.claimedMilestoneComparisons,2);
 assert.equal(a.claimedAtOrAboveThreshold,1);
 assert.equal(a.thresholdComparisonsAreNumericOnly,true);
 assert.equal(a.rewardGrantedVerified,false);
 assert.equal(a.rewardClaimableVerified,false);
 assert.equal(a.completionVerified,false);
 assert.equal(a.sourceOriginalBytesHashedByThisBridge,false);
 assert.equal(a.gameBuildSaveJointlyVerified,false);
 assert.equal(a.writerAuthorized,false);
 assert.equal(a.exportAuthorized,false);
 assert.equal(Object.isFrozen(a),true);
 for(const secret of ['2110000001','2110000002','2110000999','300001',
   '300002','SECRET_OWNER','SECRET_STATE','10000','OWNER_PRIVATE']) {
   assert.equal(JSON.stringify(a).includes(secret),false,secret);
 }
});
test('a save with altered or absent mission objects keeps unknown status and does not infer unearned rewards',()=>{
 const {duties,projection}=input();
 const bridge=createSaveDutyMilestoneBridge(duties,projection);
 const s=save();
 s.World={MissionSlots:{},RemovedObjects:{PRIVATE_OBJECT:'removed'}};
 delete s.World.MissionSlots;
 delete s.Player.AchievementsData;
 const r=bridge.auditSave(s);
 assert.equal(r.status,'not_observed');
 assert.equal(r.savedRowsWithDefinition,0);
 assert.equal(r.missingRecordsAreNotCorruption,true);
 assert.equal(r.ownerModifiedSaveMayOmitObjects,true);
 s.Player.AchievementsData=[{AchievementID:2110000001}];
 const p=bridge.auditSave(s);
 assert.equal(p.typedMilestoneEntries,2);
 assert.equal(p.currentAmountComparisons,0);
 assert.equal(p.claimedMilestoneComparisons,0);
 assert.equal(p.completionVerified,false);
});
test('numeric values compared without interpreting State, ownership or progress requirements',()=>{
 const {duties,projection}=input();
 const bridge=createSaveDutyMilestoneBridge(duties,projection);
 const s=save();
 s.Player.AchievementsData=[
   {AchievementID:2110000001,CurAmount:3,ClaimedRewardMilestone:11,
     State:'OWNER_PRIVATE_UNKNOWN_STATE'},
   {AchievementID:2110000001,CurAmount:2147483648,ClaimedRewardMilestone:'PRIVATE'},
   {AchievementID:2110000003,CurAmount:500},
   {AchievementID:2110000999,CurAmount:500}
 ];
 const r=bridge.auditSave(s);
 assert.equal(r.status,'observed_value_kind_difference');
 assert.equal(r.savedRowsWithDefinition,3);
 assert.equal(r.valueKindDifferences,2);
 assert.equal(r.currentAmountComparisons,2);
 assert.equal(r.currentAtOrAboveThreshold,1);
 assert.equal(r.claimedMilestoneComparisons,2);
 assert.equal(r.claimedAtOrAboveThreshold,2);
 assert.equal(JSON.stringify(r).includes('OWNER_PRIVATE_UNKNOWN_STATE'),false);
});
test('partial scan remains explicitly inconclusive',()=>{
 const {duties,projection}=input();
 const bridge=createSaveDutyMilestoneBridge(duties,projection),s=save();
 s.Player.AchievementsData=Array.from({length:520},()=>({
   AchievementID:2110000001,CurAmount:3,ClaimedRewardMilestone:0
 }));
 const r=bridge.auditSave(s,{maxReferences:12});
 assert.equal(r.status,'sampled_inconclusive');
 assert.equal(r.savedRowsWithDefinition,12);
 assert.equal(r.typedMilestoneEntries,24);
 assert.equal(r.sampled,true);
 for(const wrong of [null,[],2,{maxReferences:0},{maxReferences:257},
   {maxReferences:1.4}])
   assert.throws(()=>bridge.auditSave(s,wrong),/DB05_DUTY_MILESTONE_LIMIT_INVALID/);
});
test('type conflict in saved achievement list and root cannot promote provenance',()=>{
 const {duties,projection}=input();
 const bridge=createSaveDutyMilestoneBridge(duties,projection),s=save();
 s.Player.AchievementsData={};
 assert.equal(bridge.auditSave(s).status,'observed_value_kind_difference');
 for(const bad of [null,{}, {GameInfo:{Version:643},Player:[],World:{}}]){
   assert.throws(()=>bridge.auditSave(bad),/DB05_DUTY_MILESTONE_ROOT_REQUIRED/);
 }
});
test('tampered, incomplete or invented original source projections fail closed',()=>{
 const mutations=[
  x=>x.projection.source.sha256='b'.repeat(64),
  x=>x.projection.target.gameVersion='1.26.2',
  x=>x.projection.records.pop(),
  x=>x.projection.records[0].nativeWireSha256='b'.repeat(64),
  x=>x.projection.records[0].frameIndex=42,
  x=>x.projection.records[0].id='2110000999',
  x=>x.projection.records[0].milestones[0].milestone=10,
  x=>x.projection.records[0].milestones[1].milestone=3,
  x=>x.projection.records[0].milestones[0].rewardAmount=-1,
  x=>x.projection.records[0].milestones[0].rewardItem=2**40,
  x=>x.projection.records[1].milestones=[{milestone:1,rewardItem:2,rewardAmount:1}],
  x=>x.projection.summary.typedMilestones=9,
  x=>x.projection.evidence.rewardEligibilityVerified=true,
  x=>x.projection.evidence.nestedFieldNumbers.rewardItem=9,
  x=>x.duties.records[0].source.sha256='b'.repeat(64),
  x=>x.projection.records[0].evidenceState='PRIVATE_STATUS'
 ];
 for(const mutate of mutations){
   const x=input();mutate(x);
   assert.throws(()=>createSaveDutyMilestoneBridge(x.duties,x.projection),
     /DB05_DUTY_MILESTONE_PROJECTION_INVALID|DB05_DB03_NATIVE_DUTIES_REQUIRED/);
 }
});


test('after validation caller mutation of private projection cannot change audit thresholds',()=>{
  const {duties,projection}=input();
  const bridge=createSaveDutyMilestoneBridge(duties,projection);
  const a=bridge.auditSave(save());
  projection.records[0].milestones[0].milestone=10000;
  projection.records[0].milestones[1].milestone=10001;
  projection.records[0].milestones[0].rewardItem=900000001;
  projection.records[0].evidenceState='opaque_or_mixed_field13';
  duties.records[0].id='private-invalid-id';
  const b=bridge.auditSave(save());
  assert.deepEqual(b,a);
});
