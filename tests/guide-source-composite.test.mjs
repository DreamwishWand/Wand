import assert from 'node:assert/strict';
import test from 'node:test';
import {
  composeVerifiedGuideSources, guideVerifiedStaticComposite,
  GUIDE_SOURCE_COMPOSITE_SHA, GUIDE_SOURCE_COMPOSITE_BYTES,
  GUIDE_SOURCE_COMPOSITE_V2_SCHEMA, GUIDE_SOURCE_COMPOSITE_V2_SHA, GUIDE_SOURCE_COMPOSITE_V2_BYTES,
  GUIDE_FRIENDSHIP_ORIGINAL_SHA
} from '../src/lib/guide/source-composite.ts';

const bridge={baselineVersion:'1.26.1',targetVersion:'1.26.2',
  originalSearchIndexSha256:'26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d',
  compatibleFamilies:['Mission.json','LocDB (8 payloads)'],localePayloadsEqual:8,
  conditionDefinitionsEquivalent:false};
const conditions={count:5440,formatVersion:2,targetVersion:'1.26.2',
  evaluation:'static_native_definitions_only',missionReferenceCount:4960,
  sourceSha256:'9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c',
  indexSha256:'aa04c61c973874881443a370a50009f5ad6156d9e1b83ec4553045561c41b08f',
  byMission:new Map([['2070001661',[]]])};

test('nine original static Guide source families compose without relabelling Quest output',()=>{
  const result=composeVerifiedGuideSources(bridge,conditions);
  assert.equal(result.targetGameVersion,'1.26.2');
  assert.equal(result.questSearchOriginalVersion,'1.26.1');
  assert.equal(result.staticItemlistFamiliesCompared,9);
  assert.equal(result.unchangedItemlistSourceFamilies,8);
  assert.equal(result.currentReextractedConditionFamilies,1);
  assert.equal(result.localeMemberPayloadsCompared,142816);
  assert.equal(result.currentConditionMissionMentions,4960);
  assert.equal(result.schema,GUIDE_SOURCE_COMPOSITE_V2_SCHEMA);
  assert.equal(result.ownerPrivateCompositeSha256,GUIDE_SOURCE_COMPOSITE_V2_SHA);
  assert.equal(result.baselineSourceCompositeSha256,GUIDE_SOURCE_COMPOSITE_SHA);
  assert.equal(result.ownerPrivateCompositeBytes,GUIDE_SOURCE_COMPOSITE_V2_BYTES);
  assert.equal(result.totalOriginalQuestShardBytes,98001716);
  assert.equal(result.friendshipDefaultOriginalSha256,GUIDE_FRIENDSHIP_ORIGINAL_SHA);
  assert.equal(result.originalQuestShardAuditSha256,'99a539aad1884c92cc92337f52c6651879dc2f27493a9185dec36ff05863c4bf');
  assert.equal(result.originalQuestFilesRelabelled,false);
  assert.equal(result.serverOrLiveStarPathVerified,false);
  assert.equal(result.allQuestShardFileBytesAttestedByComposite,true);
  assert.equal(result.all733QuestDetailRecordsVerified,true);
  assert.equal(result.friendshipDefaultCrossVersionEqualityVerified,true);
  assert.equal(result.originalQuestShardBytesCheckedAtOpen,true);
  assert.equal(Object.isFrozen(result),true);
  assert.equal(GUIDE_SOURCE_COMPOSITE_BYTES,8748);
  assert.equal(GUIDE_SOURCE_COMPOSITE_V2_BYTES,12664);
});

test('unverified search index cannot obtain owner-original static composite evidence',()=>{
  assert.equal(guideVerifiedStaticComposite(null,conditions),null);
  assert.throws(()=>guideVerifiedStaticComposite({records:[]},conditions),/unsupported search index schema/);
});

test('older Condition v1 index cannot claim full Steam 1.26.2 composite',()=>{
  assert.equal(composeVerifiedGuideSources(bridge,{...conditions,formatVersion:1,missionReferenceCount:3102}),null);
  assert.equal(composeVerifiedGuideSources(bridge,{...conditions,indexSha256:'0'.repeat(64)}),null);
  assert.equal(composeVerifiedGuideSources(bridge,{...conditions,sourceSha256:'0'.repeat(64)}),null);
  assert.equal(composeVerifiedGuideSources(bridge,{...conditions,byMission:{}}),null);
});

test('synthetic compatibility claims or wrong source version cannot forge this view',()=>{
  assert.equal(composeVerifiedGuideSources({...bridge,conditionDefinitionsEquivalent:true},conditions),null);
  assert.equal(composeVerifiedGuideSources({...bridge,targetVersion:'1.26.3'},conditions),null);
  assert.equal(composeVerifiedGuideSources({...bridge,originalSearchIndexSha256:'0'.repeat(64)},conditions),null);
  assert.equal(composeVerifiedGuideSources({...bridge,localePayloadsEqual:7},conditions),null);
});


test('new full-shard proof does not imply live Guide or player progress', () => {
  const r=composeVerifiedGuideSources(bridge,conditions);
  assert.equal(r.serverOrLiveStarPathVerified,false);
  assert.equal(r.runtimeConditionConsumptionVerified,false);
  assert.equal(r.playerProgressVerified,false);
  assert.equal(r.originalQuestFilesRelabelled,false);
  assert.equal(r.gameTextPublished,false);
});

test('composite display is fail-closed for any missing source-v2 proof, not a live or progress claim',()=>{
  for(const missing of ['targetVersion','baselineVersion','originalSearchIndexSha256',
    'localePayloadsEqual','conditionDefinitionsEquivalent','compatibleFamilies']){
    const forged={...bridge};
    delete forged[missing];
    assert.equal(composeVerifiedGuideSources(forged,conditions),null,missing);
  }
  for(const key of ['count','missionReferenceCount','formatVersion',
    'sourceSha256','indexSha256','evaluation','targetVersion']){
    const forged={...conditions};
    delete forged[key];
    assert.equal(composeVerifiedGuideSources(bridge,forged),null,key);
  }
  assert.equal(composeVerifiedGuideSources(bridge,{...conditions,byMission:[]}),null);
  assert.equal(composeVerifiedGuideSources({...bridge,compatibleFamilies:['Mission.json']},conditions),null);
  assert.equal(composeVerifiedGuideSources({...bridge,compatibleFamilies:['LocDB (8 payloads)']},conditions),null);
  assert.equal(composeVerifiedGuideSources(undefined,conditions),null);
  assert.equal(composeVerifiedGuideSources(bridge,undefined),null);
});
test('typed 1.26.1-versus-1.26.2 composite preserves every explicit safety boundary',()=>{
  const proof=composeVerifiedGuideSources(bridge,conditions);
  assert(proof);
  assert(Object.isFrozen(proof));
  assert.deepEqual(
    [proof.questSearchOriginalVersion,proof.targetGameVersion,proof.targetPlatform],
    ['1.26.1','1.26.2','Steam']);
  assert.deepEqual(
    [proof.originalQuestFilesRelabelled,proof.playerProgressVerified,
      proof.runtimeConditionConsumptionVerified,proof.serverOrLiveStarPathVerified,
      proof.gameTextPublished],
    [false,false,false,false,false]);
  assert.deepEqual(
    [proof.questShardCountReferenced,proof.questSearchNativeMissions,
      proof.currentConditionDefinitions,proof.currentConditionMissionMentions],
    [32,733,5440,4960]);
});
