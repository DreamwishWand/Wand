import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {
  joinDb00LocalCurrentConditionMissions,
  DB00_LOCAL_CONDITION_MISSIONS
} from '../src/lib/game-db/local-condition-missions.ts';
import {
  GUIDE_CONDITION_SOURCE_SHA,GUIDE_CONDITION_INDEX_V2_SHA
} from '../src/lib/guide/current-conditions.ts';

const ROOT=new URL('../static/',import.meta.url);
let requests=0;
const fetcher=async url=>{
  assert(url.startsWith('/Wand/')&&!url.includes('..'));
  requests++;
  try{return new Response(readFileSync(
    new URL(url.slice(6),ROOT)),{status:200});}
  catch{return new Response('missing',{status:404});}
};
let publicPromise;
const publicQuestReader=async()=>{
  const pub=await (publicPromise??=
    openPublicSharedGameSources('/Wand',fetcher));
  return pub.loadNativeQuestSources();
};
function sample(conditionId,i,withStep){
  return {
    conditionId,sourceName:'Condition!Example_'+conditionId,
    conditionWireSha256:'a'.repeat(64),
    sourcePath:'conditions.children['+i+']',
    operator:['AND','OR','NOT'][i%3],
    kind:withStep?'MissionStepStatus':'MissionCompleted',
    ...(withStep?{stepId:i%35,statusCode:2,status:'completed',
      omittedSourceFields:[]}:{})
  };
}
function fixture(known){
  const byMission=new Map([
    [known,Array.from({length:3200},(_,i)=>sample(
      i%2?'70500001':'70500002',i,i%2===0
    ))],
    ['99999999',Array.from({length:1760},(_,i)=>sample(
      i%2?'70500003':'70500002',3200+i,i%3===0
    ))]
  ]);
  return {
    byMission,count:5440,missionReferenceCount:4960,
    formatVersion:2,targetVersion:'1.26.2',
    sourceSha256:GUIDE_CONDITION_SOURCE_SHA,
    indexSha256:GUIDE_CONDITION_INDEX_V2_SHA,
    evaluation:'static_native_definitions_only'
  };
}
test('DB-00 composes 4960 original private Condition references with public Quest identities without new source requests',async()=>{
  const quests=await publicQuestReader();
  const id=quests.searchQuests({limit:1}).quests[0].questId;
  const data=fixture(id);
  const before=requests;
  const reader=joinDb00LocalCurrentConditionMissions(quests,data);
  assert.equal(requests,before);
  assert.equal(reader.contract,DB00_LOCAL_CONDITION_MISSIONS);
  assert.equal(reader.snapshotId,quests.snapshotId);
  assert.equal(reader.sourceConditionDefinitions,5440);
  assert.equal(reader.sourceMissionMentionRelations,4960);
  assert.equal(reader.privateSourceRequired,true);
  assert.equal(reader.publicationAuthorized,false);
  assert.equal(reader.sourceMentionsOnly,true);
  assert.equal(reader.questPrerequisitesVerified,false);
  assert.equal(reader.runtimeTruthVerified,false);
  assert.equal(reader.playerProgressVerified,false);
  assert.equal(reader.distinctSourceMissionIds,2);
  assert.equal(reader.distinctSourceConditionIds,3);
  assert.deepEqual(new Set(reader.listMentionedConditionIds()),
    new Set(['70500001','70500002','70500003']));
  assert(Object.isFrozen(reader));
});

test('source Mission mentions and inverse Condition lookup preserve native step IDs, without inferring Quest steps',async()=>{
  const quests=await publicQuestReader();
  const id=quests.searchQuests({limit:1}).quests[0].questId;
  const reader=joinDb00LocalCurrentConditionMissions(quests,fixture(id));
  const linked=reader.getMission(id);
  assert(linked.publicQuest);
  assert.equal(linked.publicQuest.questId,id);
  assert.equal(linked.mentions.length,3200);
  assert.equal(linked.sourceNativeOnly,true);
  assert.equal(linked.questPrerequisiteVerified,false);
  assert.equal(linked.currentQuestStatusVerified,false);
  assert.equal(linked.playerProgressVerified,false);
  assert(linked.mentions.every(x=>
    x.missionId===id &&
    x.originalStaticMentionVerified===true &&
    x.nativeStepIdToGuideStepPositionVerified===false &&
    x.questPrerequisiteVerified===false &&
    x.runtimeTruthVerified===false &&
    x.saveProgressVerified===false
  ));
  const outside=reader.getMission('99999999');
  assert.equal(outside.publicQuest,null);
  assert.equal(outside.mentions.length,1760);
  assert.equal(outside.playerProgressVerified,false);
  const original=reader.getConditionMentions('70500002');
  assert(original.length>0);
  assert(original.some(x=>x.missionId===id));
  assert(original.some(x=>x.missionId==='99999999'));
  const sum=reader.listMentionedConditionIds().reduce((a,k)=>
    a+reader.getConditionMentions(k).length,0);
  assert.equal(sum,4960);
  assert(Object.isFrozen(original));
  assert.deepEqual(reader.getConditionMentions(70509999),[]);
  assert.deepEqual(reader.getMission(70509999).mentions,[]);
});

test('source-mission paging keeps outside-Quest IDs, while optional public-only filter does not invent missing Quest',async()=>{
  const quests=await publicQuestReader();
  const id=quests.searchQuests({limit:1}).quests[0].questId;
  const reader=joinDb00LocalCurrentConditionMissions(quests,fixture(id));
  const all=reader.searchMissions({limit:1});
  assert.equal(all.total,2);
  assert.equal(all.missions.length,1);
  assert(all.nextOffset!==null);
  assert.equal(all.sourceMentionOnly,true);
  assert.equal(all.prerequisiteVerified,false);
  assert.equal(all.playerProgressVerified,false);
  const second=reader.searchMissions({offset:all.nextOffset,limit:1});
  assert.equal(second.total,2);
  assert.equal(second.nextOffset,null);
  const published=reader.searchMissions({publicQuestOnly:true});
  assert.equal(published.total,1);
  assert.equal(published.missions[0].missionId,id);
  const step=reader.searchMissions({withStepReferencesOnly:true});
  assert.equal(step.total,2);
  assert(Object.isFrozen(step.missions));
  assert.throws(()=>reader.searchMissions({limit:251}),/INVALID_PAGE/);
  assert.throws(()=>reader.searchMissions({offset:-1}),/INVALID_PAGE/);
  assert.throws(()=>reader.searchMissions({publicQuestOnly:false}),
    /INVALID_SEARCH_FILTER/);
  assert.throws(()=>reader.getMission('01000001'),
    /invalid numeric Item ID/);
});

test('wrong SHA, wrong private format, truncated 4960 census and invalid source mentions fail closed',async()=>{
  const quests=await publicQuestReader();
  const id=quests.searchQuests({limit:1}).quests[0].questId;
  const base=fixture(id);
  for(const bad of [
    {...base,indexSha256:'0'.repeat(64)},
    {...base,formatVersion:1},
    {...base,missionReferenceCount:4959},
    {...base,count:5439}
  ]){
    assert.throws(()=>joinDb00LocalCurrentConditionMissions(quests,bad),
      /PINNED_CURRENT_CONDITION_AND_PUBLIC_QUEST_REQUIRED/);
  }
  const truncated=fixture(id);
  truncated.byMission.get(id).pop();
  assert.throws(()=>joinDb00LocalCurrentConditionMissions(quests,truncated),
    /SOURCE_CONDITION_MENTION_CENSUS_DRIFT/);
  const malformed=fixture(id);
  malformed.byMission.get(id)[0].operator='XOR';
  assert.throws(()=>joinDb00LocalCurrentConditionMissions(quests,malformed),
    /SOURCE_CONDITION_MENTION_MALFORMED/);
});

test('a caller changing its mutable private Map after join cannot rewrite verified DB-00 evidence',async()=>{
  const quests=await publicQuestReader();
  const id=quests.searchQuests({limit:1}).quests[0].questId;
  const source=fixture(id);
  const reader=joinDb00LocalCurrentConditionMissions(quests,source);
  const prior=reader.getMission(id).mentions[0].original.kind;
  source.byMission.get(id)[0].kind='tampered';
  source.byMission.set(id,[]);
  assert.equal(reader.getMission(id).mentions.length,3200);
  assert.equal(reader.getMission(id).mentions[0].original.kind,prior);
  assert(Object.isFrozen(reader.getMission(id).mentions));
  assert(Object.isFrozen(reader.getMission(id).mentions[0].original));
});
