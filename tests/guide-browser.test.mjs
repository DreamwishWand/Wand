import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { GUIDE_SEARCH_SCHEMA, GUIDE_DETAIL_SCHEMA, validateGuideSearch, searchGuide,
  canonicalQuestRecord, importGuideSearch, importGuideDetail, detailStepRows } from '../src/lib/guide/client.mjs';

const SHA='a'.repeat(64), WIRE='b'.repeat(64);
const target={gameVersion:'1.26.1', platform:'Steam'};
const source={file:'ddv_Data/StreamingAssets/itemlist/Mission.json',sha256:SHA};
const sha = s => createHash('sha256').update(s).digest('hex');
const record=(id, name)=>({id,recordKind:'mission',nativeWireSha256:WIRE,source:{...source,frameIndex:0},names:{ja:name,en:'Party Quest'},
  structured:{stepsDetailed:[{stepId:'1',stepName:'synthetic',subSteps:[{objectives:[{type:'CraftItem',objectiveId:'2'}]}]}]}});
function fixture() {
  const full=record('2070000620','パーティー');
  const hash=sha(canonicalQuestRecord(full));
  const index={schema:GUIDE_SEARCH_SCHEMA,target,source,counts:{missions:1,sourceNativeRecords:3,excludedQuestGroups:1,excludedUnclassified:1},records:[{
    id:full.id,names:full.names,internalName:'Story!test',groupId:'2070200092',characterId:'10000035',
    sourceUpdateGroup:'Update01',sourceScopeTokens:['Expansion01'],objectiveKinds:['CraftItem'],
    detail:{file:'quest-shards/part-23.json',recordSha256:hash,nativeWireSha256:WIRE}
  }]};
  const shard={schema:GUIDE_DETAIL_SCHEMA,target,source,bucket:23,evaluation:'static_definition_only',records:[full]};
  const file={name:'part-23.json',size:Buffer.byteLength(JSON.stringify(shard)),async arrayBuffer(){return new TextEncoder().encode(JSON.stringify(shard)).buffer}};
  return {index,full,shard,file};
}

test('validates original source class census and strict per-quest locator',()=>{
  const {index}=fixture();assert.equal(validateGuideSearch(index),index);
  const bad=structuredClone(index);bad.counts.sourceNativeRecords=1;
  assert.throws(()=>validateGuideSearch(bad),/incomplete source-record census/);
  bad.counts.sourceNativeRecords=3;bad.records[0].detail.file='../../secret';
  assert.throws(()=>validateGuideSearch(bad),/invalid private shard locator/);
});
test('multilingual Japanese NFKC, English fallback, numeric ID and facets',()=>{
  const {index}=fixture();
  assert.equal(searchGuide(index,{query:'ﾊﾟｰﾃｨｰ'}).total,1);
  assert.equal(searchGuide(index,{query:'PARTY'}).results[0].matchedLocale,'en');
  assert.equal(searchGuide(index,{query:'2070000620'}).results[0].matchedLocale,'nativeId');
  assert.equal(searchGuide(index,{character:'10000035',group:'2070200092',objective:'CraftItem'}).total,1);
  assert.equal(searchGuide(index,{character:'999'}).total,0);
  assert.equal(searchGuide(index,{query:'no match'}).total,0);
});
test('rejects unsupported locales, pagination and source-invalid filters',()=>{
  const {index}=fixture();
  for (const args of [{locale:'xx'},{limit:0},{offset:-1},{query:'a'.repeat(129)},{group:'../x'}])
    assert.throws(()=>searchGuide(index,args));
});
test('accepts source-correct one-file detail import and extracts objectives',async()=>{
  const {index,file,full}=fixture();const obj=await importGuideDetail(index,full.id,file);
  assert.deepEqual(obj,full);
  assert.deepEqual(detailStepRows(obj,'ja')[0].objectives,[{kind:'CraftItem',id:'2'}]);
});
test('refuses mixed versions, wrong file, content substitution and wrong native hash',async()=>{
  const {index,file,shard,full}=fixture();
  await assert.rejects(importGuideDetail(index,full.id,{...file,name:'part-22.json'}),/wrong detail shard/);
  const content=structuredClone(shard);content.target.gameVersion='1.26.2';
  const encode=(doc)=>({name:file.name,size:Buffer.byteLength(JSON.stringify(doc)),async arrayBuffer(){return new TextEncoder().encode(JSON.stringify(doc)).buffer}});
  await assert.rejects(importGuideDetail(index,full.id,encode(content)),/source mismatch/);
  content.target.gameVersion='1.26.1';content.records[0].names.ja='差し替え';
  await assert.rejects(importGuideDetail(index,full.id,encode(content)),/SHA-256 mismatch/);
  content.records[0].nativeWireSha256='c'.repeat(64);
  await assert.rejects(importGuideDetail(index,full.id,encode(content)),/native source fingerprint/);
});
test('file read rejects oversized and bad JSON; no network or storage access',async()=>{
  const {index}=fixture();
  const txt=JSON.stringify(index),raw=new TextEncoder().encode(txt);
  assert.equal((await importGuideSearch({size:raw.byteLength,async arrayBuffer(){return raw.buffer}})).counts.missions,1);
  await assert.rejects(importGuideSearch({size:16*1024*1024+1,async arrayBuffer(){throw new Error('not used')}}),/too large/);
});
test('canonical record serialization sorted recursively',()=>{
  assert.equal(canonicalQuestRecord({b:{d:1,c:'日本語'},a:[true,null]}),'{"a":[true,null],"b":{"c":"日本語","d":1}}');
});

// Browser directory import: the folder's unrelated original data must never be read.
import { importGuideFolder } from '../src/lib/guide/client.mjs';
function localFile(path, contents, counter = {reads:0}) {
  const data = new TextEncoder().encode(contents);
  return {
    name: path.split('/').at(-1), webkitRelativePath: path, size: data.byteLength,
    async arrayBuffer() { counter.reads++; return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); }
  };
}
function folderFixture(prefix = 'snapshot/') {
  const {index,shard} = fixture();
  const shardReads = {reads:0};
  const unrelatedReads = {reads:0};
  const files = [
    localFile(prefix+'guide/quest-search.json',JSON.stringify(index)),
    localFile(prefix+'guide/quest-shards/part-23.json',JSON.stringify(shard),shardReads),
    localFile(prefix+'guide/quests.json','not even valid JSON: prohibit eager read',unrelatedReads),
    localFile(prefix+'database/quest-detail-shard-index.json','not a site upload or needed',unrelatedReads),
  ];
  return {files,index,shardReads,unrelatedReads};
}

test('one folder selection identifies search + shard and reads no large original or shard',async()=>{
  const {files,shardReads,unrelatedReads}=folderFixture('Steam-v1.26.1/');
  const selected=await importGuideFolder(files);
  assert.equal(selected.index.counts.missions,1);
  assert.equal(selected.matchedShards,1);
  assert.equal(selected.requiredShards,1);
  assert.equal(shardReads.reads,0);
  assert.equal(unrelatedReads.reads,0);
  assert.equal((await importGuideDetail(selected.index,'2070000620',selected.shardFiles['part-23.json'])).names.ja,'パーティー');
  assert.equal(shardReads.reads,1);
});

test('folder selection supports using guide directory itself as root',async()=>{
  const {files}=folderFixture('');
  assert.equal((await importGuideFolder(files)).matchedShards,1);
});

test('multiple or missing search indexes fail closed with no shard content reads',async()=>{
  const {files,shardReads}=folderFixture();
  await assert.rejects(importGuideFolder(files.filter(f=>f.name!=='quest-search.json')),/exactly one/);
  const dups=[...files,localFile('another/guide/quest-search.json',JSON.stringify(fixture().index))];
  await assert.rejects(importGuideFolder(dups),/exactly one/);
  assert.equal(shardReads.reads,0);
});

test('cross-folder shard injection is not accepted',async()=>{
  const {files}=folderFixture();
  files[1].webkitRelativePath='unrelated/guide/quest-shards/part-23.json';
  await assert.rejects(importGuideFolder(files),/no matching detail shards/);
});

test('duplicate matching shard is rejected instead of silently overwritten',async()=>{
  const {files,shardReads}=folderFixture();
  const copy={...files[1]};
  await assert.rejects(importGuideFolder([...files,copy]),/duplicate Guide detail shard/);
  assert.equal(shardReads.reads,0);
});

test('rejects oversized shard, path traversal and excessive directory enumeration',async()=>{
  const {files}=folderFixture();
  const oversized=[...files];oversized[1]={...files[1],size:16*1024*1024+1};
  await assert.rejects(importGuideFolder(oversized),/missing or too large/);
  const traversal=[...files];traversal[1]={...files[1],webkitRelativePath:'../snapshot/guide/quest-shards/part-23.json'};
  await assert.rejects(importGuideFolder(traversal),/invalid relative Guide file path/);
  await assert.rejects(importGuideFolder([]),/folder must contain/);
  await assert.rejects(importGuideFolder(new Array(10001).fill(files[0])),/folder must contain/);
});

test('partial local folder reports exactly how many shard files are accessible',async()=>{
  const {files,index}=folderFixture();
  // Add a second source-backed search row that uses a different file.
  const other=structuredClone(index.records[0]);other.id='2070000621';other.detail.file='quest-shards/part-19.json';
  index.records.push(other);index.counts.missions++;index.counts.sourceNativeRecords++;
  files[0]=localFile('snapshot/guide/quest-search.json',JSON.stringify(index));
  const selected=await importGuideFolder(files);
  assert.equal(selected.matchedShards,1);
  assert.equal(selected.requiredShards,2);
  assert.deepEqual(Object.keys(selected.shardFiles),['part-23.json']);
});
