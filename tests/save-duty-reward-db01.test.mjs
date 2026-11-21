import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDb01CatalogClient,DB01_LOCALES,DB01_SHARDS_SCHEMA}
  from '../src/lib/items/index.ts';
import {
  inspectDb05DutyRewardsInDb01,DB05_DB01_DUTY_REWARD_JOIN_CONTRACT
} from '../src/lib/save/duty-rewards.ts';

const HASH='a'.repeat(64);
const SOURCE='ddv_Data/StreamingAssets/itemlist/DutyAch.json';
const sha=data=>createHash('sha256').update(data).digest('hex');
const names=(en=null)=>({en,fr:null,it:null,de:null,'es-ES':null,ja:null,
  'zh-CN':null,'pt-BR':null});
function guides(){
  const records=['2110000001','2110000002','2110000003'].map((id,i)=>({
    id,rawName:'SYNTHETIC_DUTY_'+i,nativeWireSha256:HASH,
    source:{file:SOURCE,sha256:HASH,frameIndex:i}
  }));
  const duties={schema:'wand.db03.native-guide@1',family:'duties',
    target:{platform:'Steam',gameVersion:'1.26.1'},records};
  const projection={
    schema:'wand.db05.native-duty-milestones@1',
    sourceSchema:'wand.db03.native-guide@1',
    target:{platform:'Steam',gameVersion:'1.26.1'},
    source:{file:SOURCE,sha256:HASH},
    evidence:{
      nativeMessage:'Definitions.Items.AchievementItemData',
      milestonesFieldNumber:13,
      nestedMessage:'Definitions.Items.AchievementMilestone',
      nestedFieldNumbers:{milestone:1,rewardItem:2,rewardAmount:3},
      typedFieldProofOnly:true,allDefinitionsInterpreted:false,
      rewardEligibilityVerified:false,rewardOwnershipVerified:false,
      saveProgressVerified:false,writerAuthorized:false,
      exportAuthorized:false
    },
    summary:{nativeRows:3,typedMilestoneDefinitions:1,typedMilestones:3,
      opaqueOrMixedDefinitions:1,noField13Definitions:1},
    records:[
      {id:records[0].id,nativeWireSha256:HASH,frameIndex:0,
        evidenceState:'typed_milestone_fields',
        milestones:[
          {milestone:2,rewardItem:9001,rewardAmount:100},
          {milestone:5,rewardItem:9002,rewardAmount:1},
          {milestone:10,rewardItem:0,rewardAmount:0}
        ]},
      {id:records[1].id,nativeWireSha256:HASH,frameIndex:1,
        evidenceState:'opaque_or_mixed_field13',milestones:[]},
      {id:records[2].id,nativeWireSha256:HASH,frameIndex:2,
        evidenceState:'no_field13_observed',milestones:[]}
    ]
  };
  return {duties,projection};
}
function item(itemId,nativeCategory,nativeKey,sourceSha=sha(nativeCategory)){
  const itemDomain=nativeCategory==='Furniture';
  return {
    itemId,nativeCategory,nativeKey,
    catalogDomain:itemDomain?'item':'definition_unclassified',
    localizationKey:null,
    names:names(itemDomain?'TEST FURNITURE':null),
    sourceSha256:sourceSha,
    verifiedIconGuid:itemDomain?'guid:'+'b'.repeat(32):null
  };
}
function catalogFixture(config={}){
  const privateRows=guides().duties.records;
  const dutyRows=privateRows.map(x=>item(Number(x.id),'DutyAch',x.rawName,HASH));
  const rewardRows=[item(9001,'Currency','TEST_CURRENCY'),
    item(9002,'Furniture','TEST_REWARD')];
  const all=[...dutyRows,...rewardRows];
  if(config.changeDutySha) dutyRows[0].sourceSha256='f'.repeat(64);
  if(config.changeDutyKey) dutyRows[0].nativeKey='FORGED_NAME';
  if(config.omitDuty)all.shift();
  if(config.omitReward)all.pop();
  const raw=new Map(),files={},calls=[];
  const categories=['DutyAch','Currency','Furniture'];
  function add(path,rows){
    const payload=new TextEncoder().encode(JSON.stringify(rows)+'\n');
    raw.set(path,payload);
    files[path]={sha256:sha(payload),bytes:payload.length,count:rows.length};
  }
  for(let i=0;i<256;i++){
    const hex=i.toString(16).padStart(2,'0');
    add('id/'+hex+'.json',all.filter(r=>r.itemId%256===i));
  }
  for(const cat of categories)
    add('category/'+cat+'.json',all.filter(r=>r.nativeCategory===cat));
  for(const locale of DB01_LOCALES)add('locale/'+locale+'.json',[]);
  const manifest={
    schema:DB01_SHARDS_SCHEMA,platform:config.platform??'Steam',
    gameVersion:config.gameVersion??'1.26.2',
    sourceManifestSha256:sha('metadata'),
    nativeSourceManifestSha256:sha('original-source-ledger'),
    sourceItemsSha256:sha('original-records'),
    definitions:all.length,
    currentNativeItemDefinitions:all.filter(r=>r.catalogDomain==='item').length,
    sourceFilesVerified:39,sourceFilesTotal:39,fullCorpusParsed:config.partial??true,
    privateOnly:true,publicationAuthorized:false,bucketCount:256,
    locales:[...DB01_LOCALES],categories,
    historicalCandidatesIncluded:false,historicalManifestSha256:null,
    files
  };
  const load=async path=>{calls.push(path);return raw.get(path);};
  return {manifest,raw,calls,catalog:createDb01CatalogClient(manifest,load)};
}
test('cross-version 1.26.1 -> 1.26.2 requires exact DutyAch file hash, all native IDs and names',async()=>{
  const {duties,projection}=guides(),f=catalogFixture();
  const summary=await inspectDb05DutyRewardsInDb01(f.catalog,duties,projection);
  assert.equal(summary.contract,DB05_DB01_DUTY_REWARD_JOIN_CONTRACT);
  assert.equal(summary.status,'native_source_equal_and_catalogued');
  assert.equal(summary.db01GameVersion,'1.26.2');
  assert.equal(summary.db03DefinitionGameVersion,'1.26.1');
  assert.equal(summary.sourceSha256MetadataMatchedAcrossVersions,true);
  assert.equal(summary.exactOriginalDutySourceIdentityMatched,true);
  assert.equal(summary.comparedNativeDutyDefinitions,3);
  assert.equal(summary.sourceIdentitiesMatched,3);
  assert.equal(summary.typedDutyDefinitions,1);
  assert.equal(summary.rewardReferences,2);
  assert.equal(summary.distinctRewardIds,2);
  assert.equal(summary.rewardReferencesWithNativeDefinition,2);
  assert.equal(summary.rewardReferencesWithoutNativeDefinition,0);
  assert.equal(summary.rewardReferencesWithItemDomain,1);
  assert.equal(summary.rewardReferencesWithUnclassifiedDefinition,1);
  assert.equal(summary.distinctRewardIdsWithItemDomain,1);
  assert.equal(summary.distinctRewardIdsWithUnclassifiedDefinition,1);
  assert.equal(summary.zeroRewardIdMarkers,1);
  assert.equal(summary.rewardOwnershipVerified,false);
  assert.equal(summary.rewardGrantedVerified,false);
  assert.equal(summary.saveStateVerified,false);
  assert.equal(summary.originalGameSourceAndSaveJointlyVerified,false);
  assert.equal(summary.editorWriterAuthorized,false);
  assert.equal(summary.exportAuthorized,false);
  assert.equal(summary.missingSaveRecordsAreNotCorruption,true);
  assert.equal(summary.sourceOriginalBytesRehashedByThisBridge,false);
  assert.ok(f.calls.includes('category/DutyAch.json'));
  assert.ok(f.calls.filter(x=>x.startsWith('id/')).length<=2);
  assert.equal(f.calls.some(x=>x.includes('historical')),false);
  assert.equal(Object.isFrozen(summary),true);
  const redacted=JSON.stringify(summary);
  for(const secret of [
    '2110000001','2110000002','2110000003','9001','9002',
    'SYNTHETIC_DUTY','TEST_CURRENCY','TEST_REWARD','100'
  ]) assert.equal(redacted.includes(secret),false,secret);
});
test('unresolved RewardItem ID stays unknown; no guessed item nor corruption',async()=>{
  const {duties,projection}=guides(),f=catalogFixture({omitReward:true});
  const report=await inspectDb05DutyRewardsInDb01(f.catalog,duties,projection);
  assert.equal(report.status,'some_reward_definitions_not_indexed');
  assert.equal(report.rewardReferencesWithNativeDefinition,1);
  assert.equal(report.rewardReferencesWithoutNativeDefinition,1);
  assert.equal(report.distinctRewardIdsWithoutNativeDefinition,1);
  assert.equal(report.rewardReferencesWithItemDomain,0);
  assert.equal(report.rewardOwnershipVerified,false);
});
test('DutyAch mismatched source SHA/native key and missing source definition fail closed',async()=>{
  const {duties,projection}=guides();
  for(const config of [
    {changeDutySha:true},{changeDutyKey:true},{omitDuty:true}
  ]){
    const f=catalogFixture(config);
    await assert.rejects(
      inspectDb05DutyRewardsInDb01(f.catalog,duties,projection),
      /DB05_DB01_SOURCE_/,
      JSON.stringify(config)
    );
  }
});
test('private source tampering, platform mixing and incomplete source claim fail closed',async()=>{
  for(const corrupt of [
    x=>{x.duties.records[0].source.sha256='f'.repeat(64);},
    x=>{x.projection.records[0].milestones[0].rewardAmount=-4;},
    x=>{x.projection.records[0].id='2110000555';},
    x=>{x.projection.summary.typedMilestones=100;}
  ]){
    const x=guides();corrupt(x);
    const f=catalogFixture();
    await assert.rejects(
      inspectDb05DutyRewardsInDb01(f.catalog,x.duties,x.projection),
      /DB05_DUTY_MILESTONE_PROJECTION_INVALID|DB05_DB03_NATIVE_DUTIES_REQUIRED/
    );
  }
  const x=guides();
  x.duties.target.platform='Nintendo Switch';
  x.projection.target.platform='Nintendo Switch';
  await assert.rejects(
    inspectDb05DutyRewardsInDb01(catalogFixture().catalog,x.duties,x.projection),
    /DB05_DB01_SOURCE_PLATFORM_UNSUPPORTED/);
  const y=guides();
  await assert.rejects(
    inspectDb05DutyRewardsInDb01(catalogFixture({partial:false}).catalog,y.duties,y.projection),
    /DB05_DB01_PRIVATE_DB01_CATALOG_REQUIRED/);
});
test('mutation after async validation cannot rewrite DutyAch or reward comparison',async()=>{
  const x=guides(),f=catalogFixture();
  const promise=inspectDb05DutyRewardsInDb01(f.catalog,x.duties,x.projection);
  // When first asynchronous category lookup yields, fields are frozen into
  // an independent snapshot even if the caller mutates original data.
  x.duties.records[0].rawName='MUTATED_PRIVATE_NAME';
  x.projection.records[0].milestones[0].rewardItem=9999;
  x.projection.records[0].milestones[1].rewardItem=9998;
  x.projection.source.sha256='f'.repeat(64);
  const report=await promise;
  assert.equal(report.status,'native_source_equal_and_catalogued');
  assert.equal(report.rewardReferencesWithNativeDefinition,2);
});
