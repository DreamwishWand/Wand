import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { GUIDE_SEARCH_SCHEMA, GUIDE_DETAIL_SCHEMA, validateGuideSearch, searchGuide,
  canonicalQuestRecord, importGuideSearch, importGuideDetail, detailStepRows, guideItemTargets, guideSourceText, guideCharacterLabels, guideGroupInfo, guideStaticFacts, formatGuideConditionTree, guideMissionReferences } from '../src/lib/guide/client.mjs';

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
  assert.equal(searchGuide(index,{scopeToken:'Expansion01'}).total,1);
  assert.equal(searchGuide(index,{scopeToken:'Expansion02'}).total,0);
  assert.equal(searchGuide(index,{scopeToken:'',character:'10000035'}).total,1);
  assert.equal(searchGuide(index,{character:'999'}).total,0);
  assert.equal(searchGuide(index,{query:'no match'}).total,0);
});
test('rejects unsupported locales, pagination and source-invalid filters',()=>{
  const {index}=fixture();
  for (const args of [{locale:'xx'},{limit:0},{offset:-1},{query:'a'.repeat(129)},{group:'../x'},{scopeToken:42}])
    assert.throws(()=>searchGuide(index,args));
});
test('accepts source-correct one-file detail import and extracts objectives',async()=>{
  const {index,file,full}=fixture();const obj=await importGuideDetail(index,full.id,file);
  assert.deepEqual(obj,full);
  assert.deepEqual(detailStepRows(obj,'ja')[0].objectives.map(x=>({kind:x.kind,id:x.id})),[{kind:'CraftItem',id:'2'}]);
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

// Source descriptions are distinct from UI buttons, guessed requirements and player state.
test('localized step and objective text prefer authored Japanese with provenance',()=>{
  const doc=record('1234','合成');
  const loc=(ja,en)=>({plainText:{ja,en},localizationKey:'Synthetic.StepDescription'});
  const step=doc.structured.stepsDetailed[0];
  step.descriptions={ongoingRequestButton:loc('何をすればいい？','What should I do?'),stepDescription:loc('  調べよう  ','Investigate'),storyDescription:loc('過去の物語','Past story')};
  step.subSteps[0].objectives[0].descriptions={stepDescription:loc('<nobr>木材を</nobr>\u200b集めよう','Gather wood')};
  const row=detailStepRows(doc,'ja')[0];
  assert.equal(row.text,'調べよう');assert.equal(row.storyText,'過去の物語');
  assert.equal(row.objectives[0].text,'木材を集めよう');
  assert.equal(row.objectives[0].textSource,'ja');
  assert.equal(row.objectives[0].descriptionLevel,'objective');
  assert.equal(row.objectives[0].configuredQuantity,null);
});

test('English fallback is explicit, and UI-only button strings never become instructions',()=>{
  const doc=record('1234','合成');
  const step=doc.structured.stepsDetailed[0];
  step.descriptions={ongoingRequestButton:{plainText:{ja:'何をすればいい？'}},storyDescription:{plainText:{en:'Story info'}}};
  step.subSteps[0].objectives[0].descriptions={stepDescription:{plainText:{en:'<smallcaps>Find</smallcaps><br>the item'}}};
  const row=detailStepRows(doc,'ja')[0];
  assert.equal(row.text,'');assert.equal(row.storyText,'Story info');
  assert.equal(row.objectives[0].text,'Find\nthe item');assert.equal(row.objectives[0].textSource,'en');
  assert.equal(guideSourceText({plainText:{it:'Solo italiano'}},'ja').text,'');
});

test('substep description fallback is source-labeled, not duplicated for every objective',()=>{
  const doc=record('1234','合成');const sub=doc.structured.stepsDetailed[0].subSteps[0];
  sub.descriptions={stepDescription:{plainText:{ja:'サブステップの説明'}}};
  sub.objectives.push({type:'VisitArea',objectiveId:null});
  const row=detailStepRows(doc,'ja')[0];
  assert.equal(row.objectives[0].text,'サブステップの説明');
  assert.equal(row.objectives[0].descriptionLevel,'subStep');
  assert.equal(row.objectives[1].text,'');
});

test('source-configured quantity and alternative IDs are candidates not inferred requirements',()=>{
  const doc=record('1234','合成');const obj=doc.structured.stepsDetailed[0].subSteps[0].objectives[0];
  obj.itemTargets={schema:'wand.db03.mission-items@1',amount:{kind:'value',value:6},selectors:[
    {itemCandidates:[{id:'30200087',role:'alternative'},{id:'30200086',role:'alternative'}]},
    {itemCandidates:[{id:'30200087',role:'alternative'}]}
  ]};
  const row=detailStepRows(doc,'ja')[0].objectives[0];
  assert.equal(row.configuredQuantity,6);assert.equal(row.totalCandidates,2);
  assert.deepEqual(row.candidates,[{id:'30200087',role:'alternative'},{id:'30200086',role:'alternative'}]);
  assert.equal(row.text,'');
});

test('unsupported amount schema, expression and unsafe candidate IDs are never displayed as definite',()=>{
  assert.deepEqual(guideItemTargets({amount:{kind:'value',value:2},selectors:[]}),{configuredQuantity:null,candidates:[],totalCandidates:0});
  const target={schema:'wand.db03.mission-items@1',amount:{kind:'formula',value:99},selectors:[{itemCandidates:[{id:'../../escape',role:'direct'},{id:'123',role:'direct'}]}]};
  assert.deepEqual(guideItemTargets(target),{configuredQuantity:null,candidates:[{id:'123',role:'direct'}],totalCandidates:1});
});

test('locale unknown fails closed; missing descriptions are not fabricated',()=>{
  assert.throws(()=>detailStepRows(record('1','x'),'ko'),/unsupported detail locale/);
  assert.throws(()=>guideSourceText(null,'ko'),/unsupported detail locale/);
  assert.equal(detailStepRows(record('1','x'),'ja')[0].objectives[0].text,'');
});


test('optional native character names require same game-version and verified source fields',()=>{
  const {index}=fixture();
  const char={schema:'wand.db03.native-guide@1',family:'characters',target,
    records:[{id:'10000035',names:{ja:'マーリン（合成）',en:'Merlin synthetic'},
      nativeWireSha256:WIRE,source:{file:'ddv_Data/StreamingAssets/itemlist/Character.json',sha256:SHA}}]};
  assert.deepEqual(guideCharacterLabels(char,index),{'10000035':char.records[0].names});
  const different=structuredClone(char);different.target.gameVersion='1.26.2';
  assert.throws(()=>guideCharacterLabels(different,index),/same-version/);
  const malformed=structuredClone(char);malformed.records[0].source.file='Mission.json';
  assert.throws(()=>guideCharacterLabels(malformed,index),/invalid or duplicate/);
  const dup=structuredClone(char);dup.records.push(dup.records[0]);
  assert.throws(()=>guideCharacterLabels(dup,index),/invalid or duplicate/);
});

test('one-folder Guide loads native character names only when an optional exact file exists',async()=>{
  const {files,shardReads,unrelatedReads}=folderFixture();
  const doc={schema:'wand.db03.native-guide@1',family:'characters',target,
    records:[{id:'10000035',names:{ja:'合成キャラクター',en:'Synthetic character'},
      nativeWireSha256:WIRE,source:{file:'ddv_Data/StreamingAssets/itemlist/Character.json',sha256:SHA}}]};
  const counter={reads:0};files.push(localFile('snapshot/guide/characters.json',JSON.stringify(doc),counter));
  const selected=await importGuideFolder(files);
  assert.equal(selected.characterNames['10000035'].ja,'合成キャラクター');
  assert.equal(counter.reads,1);assert.equal(shardReads.reads,0);assert.equal(unrelatedReads.reads,0);
  const original=await importGuideFolder(files.filter(f=>f.name!=='characters.json'));
  assert.deepEqual(original.characterNames,{});
});

test('character data in another root cannot contaminate same-folder source',async()=>{
  const {files}=folderFixture();
  const bad={schema:'wand.db03.native-guide@1',family:'characters',target,
    records:[{id:'10000035',names:{ja:'異なるフォルダ'},nativeWireSha256:WIRE,
      source:{file:'ddv_Data/StreamingAssets/itemlist/Character.json',sha256:SHA}}]};
  files.push(localFile('another/guide/characters.json',JSON.stringify(bad)));
  const selected=await importGuideFolder(files);
  assert.deepEqual(selected.characterNames,{});
  files.push(localFile('snapshot/guide/characters.json',JSON.stringify(bad)));
  files.push(localFile('snapshot/guide/characters.json',JSON.stringify(bad)));
  await assert.rejects(importGuideFolder(files),/duplicate native character/);
});

// Original QuestGroup missionIds are source listing membership, not progression DAG.
function groupFixture() {
  const {index}=fixture();
  return {schema:'wand.db03.quest-catalogue@1',target,source:{...source},
    counts:{missions:1,questGroups:1,unclassified:1,nativeSourceRecords:3},
    missions:[{id:index.records[0].id,groupId:index.records[0].groupId,nativeWireSha256:WIRE}],
    questGroups:[{id:'2070200092',recordKind:'questGroup',rawName:'Village!Wizard!Merlin',
      names:{},nativeWireSha256:WIRE,missionIds:['2070000620']}]};
}
test('source-catalogue group join is exact and displays original unlocalized group',()=>{
  const {index}=fixture(); const joined=guideGroupInfo(groupFixture(),index);
  assert.equal(joined['2070200092'].rawName,'Village!Wizard!Merlin');
  assert.deepEqual(joined['2070200092'].missionIds,['2070000620']);
  assert.equal(searchGuide(index,{query:'Wizard',groupInfo:joined}).total,1);
  assert.equal(searchGuide(index,{query:'Wizard',groupInfo:joined}).results[0].matchedLocale,'sourceGroup');
  assert.equal(searchGuide(index,{query:'Wizard'}).total,0);
});
test('character names search quests with labeled provenance, without changing IDs',()=>{
  const {index}=fixture();
  const labels={'10000035':{ja:'合成キャラクター名',en:'Merlin Synthetic'}};
  assert.equal(searchGuide(index,{query:'マーリン',characterNames:labels}).total,0);
  assert.equal(searchGuide(index,{query:'合成キャラクター',characterNames:labels}).results[0].matchedLocale,'character:ja');
  assert.equal(searchGuide(index,{query:'Merlin',characterNames:labels}).results[0].matchedLocale,'character:en');
});
test('quest-group join rejects mixed-source, orphan and duplicate membership',()=>{
  const {index}=fixture(),a=groupFixture();
  a.source.sha256='c'.repeat(64);
  assert.throws(()=>guideGroupInfo(a,index),/from another build/);
  a.source.sha256=SHA;a.questGroups[0].missionIds=['2070000650'];
  assert.throws(()=>guideGroupInfo(a,index),/wrong-group/);
  a.questGroups[0].missionIds=['2070000620','2070000620'];
  assert.throws(()=>guideGroupInfo(a,index),/duplicate/);
  a.questGroups[0].missionIds=[];
  assert.throws(()=>guideGroupInfo(a,index),/coverage incomplete/);
});
test('folder import reads optional 1.6MB catalogue but not private detail shards',async()=>{
  const {files,index,shardReads,unrelatedReads}=folderFixture();
  const counter={reads:0};
  files.push(localFile('snapshot/guide/quest-catalogue.json',JSON.stringify(groupFixture()),counter));
  const imported=await importGuideFolder(files);
  assert.equal(Object.keys(imported.groupInfo).length,1);
  assert.equal(counter.reads,1);
  assert.equal(shardReads.reads,0);assert.equal(unrelatedReads.reads,0);
  const missing=await importGuideFolder(files.filter(x=>x.name!=='quest-catalogue.json'));
  assert.deepEqual(missing.groupInfo,{});
  files.push(localFile('snapshot/guide/quest-catalogue.json',JSON.stringify(groupFixture())));
  await assert.rejects(importGuideFolder(files),/duplicate quest catalogue/);
});
test('unrelated versioned folder cannot inject quest-group names',async()=>{
  const {files}=folderFixture();
  files.push(localFile('different/guide/quest-catalogue.json',JSON.stringify(groupFixture())));
  assert.deepEqual((await importGuideFolder(files)).groupInfo,{});
});


test('source condition trees retain nested AND/OR/NOT and unevaluated typed references',()=>{
  const tree={operator:'AND',conditions:[
    {type:'MissionCompleted',missionId:'2070000022',inversed:true,nativeWireSha256:SHA},
    {type:'SubConditions',nested:{operator:'OR',conditions:[
      {type:'CharacterFriendship',characterId:'10000055',friendshipLevel:4,
        comparisonOperator:'GreaterThanOrEqual'},
      {type:'Unknown',wireSha256:WIRE}
    ]}}
  ]};
  const formatted=formatGuideConditionTree(tree);
  assert.match(formatted,/AND \[/);
  assert.match(formatted,/MissionCompleted \(missionId="2070000022", inversed=true\)/);
  assert.match(formatted,/OR \[/);
  assert.match(formatted,/CharacterFriendship .*friendshipLevel=4/);
  assert.match(formatted,/Unknown/);
  assert.doesNotMatch(formatted,/nativeWireSha256|wireSha256/);
  assert.equal(formatGuideConditionTree(null),null);
});

test('quest source conditions, activation branches and reward ranges remain static-only',()=>{
  const conditions={operator:'NOT',conditions:[{type:'MissionStatus',
    missionId:'2070000022',missionState:'Completed'}]};
  const record={structured:{
    conditions:{availableConditions:conditions,unlockConditions:{operator:'AND',conditions:[]}},
    activationPolicies:{
      autoAcceptOptions:[{choice:'Any',choiceFromProtoDefault:true,conditions}],
      uiUnlockConditions:[{text:{plainText:{ja:'表示',en:'Visible'}},conditions:null}],
      ownerOverrides:[{ownerKind:'custom',customPayloadSha256:WIRE,conditions}]
    },
    rewardsDecoded:{
      friendshipOverride:{min:0,max:30},
      currency:[{currencyId:'80000000',amountMin:50,amountMax:80},
                {currencyId:null,amountMin:null,amountMax:100}]
    }
  }};
  const facts=guideStaticFacts(record,'ja');
  assert.equal(facts.conditions.length,2);
  assert.match(facts.conditions[0].expression,/NOT \[/);
  assert.equal(facts.policies.length,3);
  assert.match(facts.policies[0].note,/protobuf既定値/);
  assert.match(facts.policies[1].note,/原文=表示/);
  assert.match(facts.policies[2].note,/不透明な原本設定/);
  assert.equal(facts.policies[1].expression,null);
  assert.deepEqual(facts.rewards.map(x=>[x.min,x.max]),[[0,30],[50,80],[null,100]]);
  assert.equal(guideStaticFacts({},'en').rewards.length,0);
  assert.throws(()=>guideStaticFacts(record,'xx'),/unsupported detail locale/);
});


test('Guide resolves only exact native Mission predicates to same-source searchable quests',()=>{
  const {index, full}=fixture();
  const next={...structuredClone(index.records[0]),id:'2070000700',
    names:{en:'Source-only second quest'}, internalName:'Story!Other'};
  index.records.push(next);
  index.counts.missions=2;index.counts.sourceNativeRecords=4;
  full.structured.conditions={
    availableConditions:{operator:'AND',conditions:[
      {type:'MissionCompleted',missionId:'2070000700'},
      {type:'SubConditions',nested:{operator:'OR',conditions:[
        {type:'CommonConditions',conditionId:'2070000700'},
        {type:'MissionStatus',missionId:'2070000999'},
        {type:'Unknown',missionId:'2070000700'}
      ]}}
    ]},
    unlockConditions:{operator:'NOT',conditions:[
      {type:'MissionStepCompleted',missionId:'2070000620',stepId:10}
    ]}
  };
  full.structured.activationPolicies={
    autoAcceptOptions:[{conditions:{operator:'AND',conditions:[
      {type:'MissionObjectiveStatus',missionId:'2070000700',objectiveId:5}
    ]}}],
    uiUnlockConditions:[{conditions:null}],
    ownerOverrides:[{conditions:{operator:'OR',conditions:[
      {type:'StoryCompleted',storyId:'2070000700'}
    ]}}]
  };
  const links=guideMissionReferences(full,index,'ja');
  assert.deepEqual(links.map(x=>[x.predicate,x.id,x.targetInSearchIndex]),[
    ['MissionCompleted','2070000700',true],
    ['MissionStatus','2070000999',false],
    ['MissionStepCompleted','2070000620',true],
    ['MissionObjectiveStatus','2070000700',true]
  ]);
  assert.equal(links[0].targetName,'Source-only second quest');
  assert.equal(links[0].targetNameSource,'en');
  assert.equal(links[0].targetRow, next);
  assert.equal(links[1].targetName,null);
  assert.equal(links[1].targetRow,null);
  assert.equal(links[2].section,'解放条件');
  assert.equal(links[3].section,'自動受諾オプション 1');
  assert.match(links[1].sourcePath,/SubConditions/);
  assert.ok(links.every(x=>!('required' in x) && !('completed' in x)));
});

test('Guide condition links reject mixed original game source and do not infer absent reference edges',()=>{
  const {index,full}=fixture();
  assert.deepEqual(guideMissionReferences(full,index),[]);
  assert.throws(()=>guideMissionReferences(full,index,'fake'),/unsupported reference locale/);
  const mix=structuredClone(full);
  mix.source.sha256='c'.repeat(64);
  assert.throws(()=>guideMissionReferences(mix,index),/mission reference source mismatch/);
  mix.source.sha256=SHA;mix.nativeWireSha256='c'.repeat(64);
  assert.throws(()=>guideMissionReferences(mix,index),/mission reference source mismatch/);
  mix.nativeWireSha256=WIRE;
  mix.structured.conditions={availableConditions:{operator:'AND',conditions:[
    {type:'MissionAvailable',missionId:'0'},
    {type:'MissionCompleted',missionId:'0001'},
    {type:'ConditionCompleted',missionId:'2070000620'}
  ]}};
  assert.deepEqual(guideMissionReferences(mix,index),[]);
  mix.structured.conditions.availableConditions={operator:'AND',conditions:[
    {type:'SubConditions',nested:{operator:'AND',conditions:[]}}
  ]};
  assert.deepEqual(guideMissionReferences(mix,index),[]);
});
