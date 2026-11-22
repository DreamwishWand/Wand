import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DB02_DB03_NATIVE_REWARD_SCHEMA,projectVerifiedDb03RewardCandidates,
  loadVerifiedDb03RewardCandidates
} from '../src/lib/acquisition/db03-native-rewards.ts';
import {
  createAcquisitionOriginDatabase,loadUnifiedAcquisitionOriginDatabase
} from '../src/lib/acquisition/origins.ts';

const FILES={
  mini_event:['ddv_Data/StreamingAssets/protoDb.bin',
    'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'],
  floating_festival:['ddv_Data/StreamingAssets/protoDb.bin',
    'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'],
  quest_intro:['ddv_Data/StreamingAssets/itemlist/Mission.json',
    'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'],
  quest_loot:['ddv_Data/StreamingAssets/itemlist/Mission.json',
    'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'],
  friendship_default:['ddv_Data/StreamingAssets/friendship_levels_default.json',
    '90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22']
};
const SAMPLE=[
  ['31700009','mini_event','event/0','EasterMini',null,null],
  ['31700009','quest_intro','quest/0','10200',2,null],
  ['31700011','floating_festival','event/1','FloatingFestival',null,null],
  ['31700013','quest_loot','quest/1','10201',0,null],
  ['31700017','friendship_default','friendship/0','default_friendship_level_5',3,5]
];
function buildRow([itemId,originFamily,relationId,originId,amount,level]){
  const [nativeSourceFile,nativeSourceSha256]=FILES[originFamily];
  const original={
    relationId,itemId,originId,originFamily,sourceGameVersion:'1.26.1',
    sourceFile:nativeSourceFile,sourceDefinitionSha256:'a'.repeat(64),
    sourceField:originFamily==='friendship_default'?'CompletedReward':'protobuf.reward',
    indexMembership:originFamily==='friendship_default'?'not_applicable':'present',
    amount,level,rewardStage:level===null?null:'CompletedReward',
    guaranteedGrant:false,currentAvailabilityVerified:false,
    playerOwnershipVerified:false,characterSpecificVerified:false
  };
  return {
    original,itemId,nativeOriginId:originId,originalExtractionVersion:'1.26.1',
    sourceCompatibleWith:'1.26.2',nativeSourceSha256,nativeSourceFile,
    sourceEquivalence:'EXACT_ORIGINAL_FULL_FILE_SHA256',rewardConfigurationOnly:true,
    guaranteedGrant:false,onlineAvailabilityVerified:false,playerOwnershipVerified:false
  };
}
function reader(sourceRows=SAMPLE.map(buildRow)){
  const byItem=new Map();
  for(const row of sourceRows){
    const rows=byItem.get(row.itemId)??[];
    rows.push(row);byItem.set(row.itemId,rows);
  }
  return {
    schema:'wand.db03.current-static-reward-candidates@1',
    targetGameVersion:'1.26.2',originalExtractionVersion:'1.26.1',
    coverage:{eventCandidates:202,questCandidates:400,
      defaultFriendshipCandidates:16,totalCandidates:618,sourceEquivalenceVerified:true,
      liveOrPlayerAvailabilityVerified:false,conditionCompatibilityAsserted:false},
    getItemCandidates(id){return byItem.get(String(id))??[];}
  };
}
test('DB03 source-compatible original family candidates join by native Item ID without guaranteed awards',()=>{
  const index=projectVerifiedDb03RewardCandidates(reader(),
    ['31700009',31700011,31700013,31700017,31700009]);
  assert.equal(index.schema,DB02_DB03_NATIVE_REWARD_SCHEMA);
  assert.equal(index.coverage.requestedItemIds,4);
  assert.equal(index.coverage.projectedCandidates,5);
  assert.equal(index.coverage.distinctLinkedItemIds,4);
  assert.equal(index.coverage.eventCandidates,2);
  assert.equal(index.coverage.questCandidates,2);
  assert.equal(index.coverage.defaultFriendshipCandidates,1);
  assert.equal(index.coverage.conditionsSourceReused,false);
  assert.equal(index.coverage.guaranteedGrantsVerified,false);
  assert.equal(index.getItemCandidates(31700009).length,2);
  assert.deepEqual(index.getItemCandidates(31700009).map(r=>r.kind),
    ['event_reward','quest_reward']);
  assert.equal(index.getItemCandidates(31700013)[0].quantity,null);
  assert(index.getItemCandidates(31700013)[0].conditions.some(s=>s.includes('amount zero')));
  assert(index.getItemCandidates(31700017)[0].conditions.some(s=>s.includes('not a character-specific')));
  assert(index.origins.every(x=>x.routeStatus==='static_candidate_only'&&
    x.availability==='not_live_verified'&&x.source.gameVersion==='1.26.1'&&
    x.source.kind==='verified_game_native'&&x.campaignId===null));
  const unified=createAcquisitionOriginDatabase(index.origins);
  assert.equal(unified.getCoverage().linkedRoutes,5);
  assert.equal(unified.getItem(31700009).origins.length,2);
  assert.equal(unified.getItem(31700017).origins[0].kind,'friendship_reward');
  assert.equal(unified.getItem(1).origins.length,0);
});

test('DB03 private source compatibility is not a live claim; invalid source data fails closed',()=>{
  const r=reader();
  assert.throws(()=>projectVerifiedDb03RewardCandidates(
    {...r,coverage:{...r.coverage,sourceEquivalenceVerified:false}},[31700009]),
  /VERIFIED_DB03_READER_REQUIRED/);
  assert.throws(()=>projectVerifiedDb03RewardCandidates(r,['031700009']),
    /ITEM_ID/);
  assert.throws(()=>projectVerifiedDb03RewardCandidates(r,new Array(20001).fill(31700009)),
    /BATCH_LIMIT/);
  const source=SAMPLE.map(buildRow);
  source[0]={...source[0],nativeSourceSha256:'0'.repeat(64)};
  assert.throws(()=>projectVerifiedDb03RewardCandidates(reader(source),[31700009]),
    /NATIVE_SOURCE_IDENTITY/);
  const grants=SAMPLE.map(buildRow);
  grants[0]={...grants[0],guaranteedGrant:true};
  assert.throws(()=>projectVerifiedDb03RewardCandidates(reader(grants),[31700009]),
    /SOURCE_CANDIDATE_ASSERTIONS/);
  const wrong=SAMPLE.map(buildRow);
  wrong[0]={...wrong[0],original:{...wrong[0].original,itemId:'999'}};
  assert.throws(()=>projectVerifiedDb03RewardCandidates(reader(wrong),[31700009]),
    /SOURCE_CANDIDATE_ASSERTIONS/);
});

test('Private original local files are hash checked by DB03, not admitted from arbitrary bytes',async()=>{
  const invalid=new Uint8Array([1,2,3]);
  await assert.rejects(
    loadVerifiedDb03RewardCandidates({
      eventLinks:invalid,questFlows:invalid,friendshipDefaults:invalid,
      guideSourceCompositeV2:invalid,protoDbBridge:invalid
    }),/DB03_(PRIVATE_REWARD|SOURCE_EQUIVALENCE)_SOURCE_BYTES/
  );
});

test('Verified DB03 candidate routes compose with 67 pinned Star Path routes and historic campaigns',async()=>{
  const bytes=readFileSync(new URL(
    '../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url));
  const data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const fetcher=async url=>{
    assert.equal(url,'/Wand/guide/public/starpath-cache-2026-11-22.json');
    return {ok:true,arrayBuffer:async()=>data};
  };
  const old=projectVerifiedDb03RewardCandidates(reader(),SAMPLE.map(x=>x[0]));
  const db=await loadUnifiedAcquisitionOriginDatabase(fetcher,null,'/Wand',[],old);
  assert.equal(db.getCoverage().linkedRoutes,72);
  assert.equal(db.getItem(31700009).origins.length,2);
  assert(db.getItem(170000115).origins.some(x=>x.kind.startsWith('star_path_')));
  assert.equal(db.getCoverage().originCoverageComplete,false);
  await assert.rejects(loadUnifiedAcquisitionOriginDatabase(
    fetcher,null,'/Wand',[],{...old,coverage:{...old.coverage,conditionsSourceReused:true}}),
    /DB02_ORIGINS_DB03_VERIFIED_PRIVATE_REWARDS_REQUIRED/);
});
