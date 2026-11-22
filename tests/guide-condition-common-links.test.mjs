import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  DB03_COMMON_CONDITION_GRAPH_SCHEMA,createStructuralCommonConditionGraph,
  loadPinnedCommonConditionGraph
} from '../src/lib/guide/condition-common-links.ts';
import {
  GUIDE_CONDITION_INDEX_V2_SHA,GUIDE_CONDITION_INDEX_V2_BYTES,
  GUIDE_CONDITION_SOURCE_SHA
} from '../src/lib/guide/current-conditions.mjs';

const SHA='9'.repeat(64);
const A='2130006145',B='2130007038',C='2130000148',D='2130000413',E='2130000999';
const MISSION='2070001661';
const leaf=(kind,ordinal,sourceTag,rest={})=>({
  kind,ordinal,sourceTag,payloadSha256:SHA,...rest
});
const common=(id,ordinal)=>leaf('CommonConditions',ordinal,5,{commonConditionId:id});
const tree=(operator,children)=>({operator,sourceTreeWireSha256:SHA,children});
const record=(id,conditions)=>({id,nativeWireSha256:SHA,conditions});
function records(){
  return [
    record(A,tree('AND',[
      common(B,0),
      leaf('SubConditions',1,10,{nested:tree('OR',[common(C,0)])}),
      leaf('MissionCompleted',2,255)
    ])),
    record(B,tree('NOT',[common(D,0)])),
    record(C,tree('AND',[leaf('MissionStepStatus',0,285)])),
    record(D,tree('AND',[])),
    record(E,tree('OR',[]))
  ];
}
function missionRefs(){
  const references=new Map([
    [B,[{missionId:MISSION,conditionId:B,kind:'MissionCompleted',sourcePath:'conditions.children[0]'}]],
    [D,[{missionId:MISSION,conditionId:D,kind:'MissionStepStatus',sourcePath:'conditions.children[1]',stepId:9}]]
  ]);
  return {
    schema:'wand.db03.condition-mission-references@1',
    coverage:{
      gameVersion:'1.26.2',sourceOriginalSha256:GUIDE_CONDITION_SOURCE_SHA,
      indexedProjectionSha256:GUIDE_CONDITION_INDEX_V2_SHA,
      conditionTruthEvaluated:false
    },
    getConditionReferences(id){return references.get(id)??[];}
  };
}
test('native v1.26.2 CommonConditions graph retains native direction, nested boolean path and all distinct occurrences',()=>{
  const graph=createStructuralCommonConditionGraph(records());
  assert.equal(graph.schema,DB03_COMMON_CONDITION_GRAPH_SCHEMA);
  assert.equal(graph.evidence,'structure_only');
  assert.deepEqual({
    definitions:graph.coverage.definitions,
    leaves:graph.coverage.totalLeaves,
    pointers:graph.coverage.commonConditionPointers,
    sources:graph.coverage.distinctPointerSources,
    targets:graph.coverage.distinctPointerTargets,
    resolved:graph.coverage.pointerTargetsResolved,
    unresolved:graph.coverage.pointerTargetsUnresolved,
    chains:graph.coverage.conditionsWithNestedPointers
  },{definitions:5,leaves:6,pointers:3,sources:2,targets:3,resolved:3,unresolved:0,chains:1});
  assert.equal(graph.coverage.runtimeConditionTruthVerified,false);
  assert.equal(graph.coverage.mandatoryPrerequisitesVerified,false);
  assert.equal(graph.coverage.sourceLeafInversionDecoded,false);
  assert.equal(graph.coverage.allNativeConditionDefinitionsVerified,false);
  assert.equal(graph.coverage.originalFileSha256,null);
  assert.deepEqual(graph.getDirect(A).map(x=>x.toConditionId),[B,C]);
  assert.deepEqual(graph.getIncoming(D).map(x=>x.fromConditionId),[B]);
  assert.deepEqual(graph.getDirect(C),[]);
  assert.deepEqual(graph.getReachable(A).map(x=>[x.conditionId,x.via.length]),[
    [B,1],[C,1],[D,2]
  ]);
  assert.deepEqual(graph.getReachable(A)[1].via[0].booleanPath,['AND','OR']);
  assert.deepEqual(graph.getReachable(A)[2].via[1].booleanPath,['NOT']);
  assert.equal(graph.getReachable(A)[0].via[0].leafInversion,'not_projected');
  assert.equal(graph.getReachable(A,1).length,2);
  assert.equal(graph.getReachable(A,2).length,3);
  assert(Object.isFrozen(graph));
  assert(Object.isFrozen(graph.coverage));
  assert(Object.isFrozen(graph.getDirect(A)));
  assert(Object.isFrozen(graph.getReachable(A)[0].via));
});
test('indirect Mission references preserve each source chain and do not create flattened prerequisites',()=>{
  const graph=createStructuralCommonConditionGraph(records());
  const mentions=graph.getIndirectMissionMentions(A,missionRefs());
  assert.equal(mentions.length,2);
  assert.deepEqual(mentions.map(m=>[m.sourceConditionId,m.via.length,m.mention.missionId]),[
    [B,1,MISSION],[D,2,MISSION]
  ]);
  assert.deepEqual(graph.getIndirectMissionMentions(C,missionRefs()),[]);
  assert(Object.isFrozen(mentions));
  assert(Object.isFrozen(mentions[0]));
  assert.throws(()=>graph.getIndirectMissionMentions(A,{
    ...missionRefs(),coverage:{...missionRefs().coverage,indexedProjectionSha256:'0'.repeat(64)}
  }),/CURRENT_MISSION_INDEX_REQUIRED/);
  const mismatched={
    ...missionRefs(),getConditionReferences:()=>[{conditionId:E,missionId:MISSION}]
  };
  assert.throws(()=>graph.getIndirectMissionMentions(A,mismatched),/MIXED_NATIVE_REFERENCE/);
});

test('malformed native source, missing or cyclic targets fail safely',()=>{
  for(const bad of ['01','0','999999999999999999','../../etc',1.2])
    assert.throws(()=>createStructuralCommonConditionGraph(records()).getDirect(bad),
      /INVALID_CONDITION_ID/);
  assert.throws(()=>createStructuralCommonConditionGraph(records()).getReachable(A,33),
    /INVALID_TRAVERSAL_DEPTH/);
  const malformed=records();
  malformed[0].conditions.children[0].sourceTag=1;
  assert.throws(()=>createStructuralCommonConditionGraph(malformed),/INVALID_COMMON_POINTER/);
  const orphan=records();
  orphan[0].conditions.children[0].commonConditionId='2130007777';
  const graph=createStructuralCommonConditionGraph(orphan);
  assert.equal(graph.coverage.pointerTargetsUnresolved,1);
  const cyclic=records();
  cyclic[3].conditions=tree('AND',[common(A,0)]);
  assert.throws(()=>createStructuralCommonConditionGraph(cyclic).getReachable(A),
    /CYCLIC_SOURCE_CONDITIONS/);
  const missing=records();
  missing[0].conditions.children[0].commonConditionId='001';
  assert.throws(()=>createStructuralCommonConditionGraph(missing),
    /INVALID_CONDITION_ID/);
});
test('only pinned private v2 SHA-256 can turn a source graph into attested evidence',async()=>{
  let reads=0;
  const file={name:'condition-native-index-v2.json',size:GUIDE_CONDITION_INDEX_V2_BYTES,
    async arrayBuffer(){reads++;return new ArrayBuffer(GUIDE_CONDITION_INDEX_V2_BYTES);}};
  await assert.rejects(()=>loadPinnedCommonConditionGraph({...file,name:'wrong.json'}),
    /OWNER_INDEX_REQUIRED/);
  await assert.rejects(()=>loadPinnedCommonConditionGraph({...file,size:12}),
    /OWNER_INDEX_REQUIRED/);
  assert.equal(reads,0);
  await assert.rejects(()=>loadPinnedCommonConditionGraph(file),
    /UNVERIFIED_OWNER_ORIGINAL/);
  assert.equal(reads,1);
});
test('Guide uses the source-pinned local Condition->Condition graph; never downloads or publishes private definitions',async()=>{
  const route=await readFile(new URL('../src/routes/guide/source/+page.svelte',import.meta.url),'utf8');
  const moduleText=await readFile(new URL('../src/lib/guide/condition-common-links.ts',import.meta.url),'utf8');
  assert.match(route,/loadPinnedCommonConditionGraph\(result\.currentConditionFiles\.indexFile\)/);
  assert.match(route,/loadPinnedCommonConditionGraph\(selection\.get\(indexName\)!\)/);
  assert.match(route,/conditionCommonGraph!\.getIndirectMissionMentions\(id,conditionRelations!\)/);
  assert.match(route,/conditionCommonGraph!\.getReachable\(id\)/);
  assert.match(route,/sourceLeafInversionDecoded/);
  assert.doesNotMatch(moduleText,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|FormData|postMessage/);
});
