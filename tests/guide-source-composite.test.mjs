import assert from 'node:assert/strict';
import test from 'node:test';
import {
  composeVerifiedGuideSources, guideVerifiedStaticComposite,
  GUIDE_SOURCE_COMPOSITE_SHA, GUIDE_SOURCE_COMPOSITE_BYTES
} from '../src/lib/guide/source-composite.mjs';

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
  assert.equal(result.ownerPrivateCompositeSha256,GUIDE_SOURCE_COMPOSITE_SHA);
  assert.equal(result.originalQuestFilesRelabelled,false);
  assert.equal(result.serverOrLiveStarPathVerified,false);
  assert.equal(result.allQuestShardFileBytesAttestedByComposite,false);
  assert.equal(Object.isFrozen(result),true);
  assert.equal(GUIDE_SOURCE_COMPOSITE_BYTES,8748);
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
