import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {canonicalQuestRecord,GUIDE_SEARCH_SCHEMA,guideMissionReferences}
  from '../src/lib/guide/client.ts';
import {createQuestConditionCrossrefs,DB03_QUEST_CONDITION_CROSSREF_SCHEMA}
  from '../src/lib/guide/quest-condition-crossrefs.ts';

const MISSION='2070000620',OTHER='2070000700',COND_ONE='2130006145',COND_TWO='2130007038';
const SHA='a'.repeat(64),WIRE='b'.repeat(64);
const target={gameVersion:'1.26.1',platform:'Steam'};
const source={file:'ddv_Data/StreamingAssets/itemlist/Mission.json',sha256:SHA};
const common=(id,inversed)=>({
  type:'CommonConditions',conditionId:id,
  ...(inversed===undefined?{}:{inversed})
});
function setup(){
  const full={
    id:MISSION,recordKind:'mission',nativeWireSha256:WIRE,source:{...source,frameIndex:0},
    names:{ja:'合成クエスト',en:'Synthetic Quest'},
    structured:{
      conditions:{
        availableConditions:{operator:'AND',conditions:[
          common(COND_ONE,true),
          {type:'MissionCompleted',missionId:OTHER},
          {type:'SubConditions',nested:{operator:'OR',conditions:[
            common(COND_TWO),{type:'Unknown',conditionId:'2130000000'}
          ]}}
        ]},
        unlockConditions:{operator:'NOT',conditions:[common(COND_ONE,false)]}
      },
      activationPolicies:{
        autoAcceptOptions:[{conditions:{operator:'AND',conditions:[common(COND_TWO)]}}],
        uiUnlockConditions:[{conditions:null}],
        ownerOverrides:[{conditions:{operator:'OR',conditions:[{type:'CommonConditions'}]}}]
      }
    }
  };
  const index={
    schema:GUIDE_SEARCH_SCHEMA,target,source,
    counts:{missions:1,sourceNativeRecords:3,excludedQuestGroups:1,excludedUnclassified:1},
    records:[{
      id:MISSION,names:full.names,internalName:'Story!Test',groupId:'2070200092',
      characterId:'10000035',sourceUpdateGroup:'Update01',sourceScopeTokens:[],
      objectiveKinds:[],detail:{
        file:'quest-shards/part-23.json',
        recordSha256:createHash('sha256').update(canonicalQuestRecord(full)).digest('hex'),
        nativeWireSha256:WIRE
      }
    }]
  };
  const matching=Object.freeze([
    Object.freeze({
      conditionId:COND_ONE,missionId:OTHER,sourceName:'Current!Condition',
      sourcePath:'conditions.children[0]',conditionWireSha256:WIRE,
      operator:'AND',kind:'MissionCompleted'
    }),
    Object.freeze({
      conditionId:COND_ONE,missionId:MISSION,sourceName:'Current!Condition',
      sourcePath:'conditions.children[1]',conditionWireSha256:WIRE,
      operator:'NOT',kind:'MissionStepStatus',stepId:9,
      omittedSourceFields:[]
    })
  ]);
  const conditions={
    schema:'wand.db03.condition-mission-references@1',
    coverage:{
      gameVersion:'1.26.2',referenceDirection:'STATIC_SOURCE_MENTION_NOT_PREREQUISITE',
      conditionTruthEvaluated:false,currentQuestAvailabilityVerified:false,
      saveProgressVerified:false,provenance:'structure_and_source_fields'
    },
    getConditionReferences(id){return id===COND_ONE?matching:[];}
  };
  return {full,index,conditions};
}

test('quest branch CommonConditions join preserves source roles, boolean paths, native IDs and duplicates',()=>{
  const {full,index,conditions}=setup();
  assert.equal(guideMissionReferences(full,index).length,1);
  const result=createQuestConditionCrossrefs(full,index,conditions);
  assert.equal(result.schema,DB03_QUEST_CONDITION_CROSSREF_SCHEMA);
  assert.equal(result.questId,MISSION);
  assert.equal(result.sourceQuestVersion,'1.26.1');
  assert.equal(result.currentConditionVersion,'1.26.2');
  assert.equal(result.originalMissionEquivalentToCurrent,false,'synthetic source is not original-byte attested');
  assert.equal(result.currentConditionEvidence,'structure_and_source_fields');
  assert.deepEqual(result.pointers.map(p=>[p.role,p.branchIndex,p.conditionId]),[
    ['availability',null,COND_ONE],
    ['availability',null,COND_TWO],
    ['unlock',null,COND_ONE],
    ['auto_accept',0,COND_TWO]
  ]);
  assert.deepEqual(result.pointers.map(p=>p.booleanPath),[
    ['AND'],['AND','OR'],['NOT'],['AND']
  ]);
  assert.deepEqual(result.pointers.map(p=>p.inversed),[true,null,false,null]);
  assert.equal(result.pointers[0].currentMissionMentions.length,2);
  assert.equal(result.pointers[0].currentMissionMentions[1].stepId,9);
  assert.equal(result.pointers[1].currentMissionMentions.length,0);
  assert.equal(result.pointers[1].missionMentionStatus,'not_in_mission_reference_subset');
  assert.equal(result.pointers[1].conditionDefinitionExistenceChecked,false);
  assert.equal(result.coverage.commonConditionOccurrences,4);
  assert.equal(result.coverage.distinctReferencedConditionIds,2);
  assert.equal(result.coverage.occurrencesWithNativeMissionMentions,2);
  assert.equal(result.coverage.distinctCurrentReferencedMissionIds,2);
  assert.equal(result.coverage.directMissionPredicateMentions,1);
  assert.equal(result.coverage.prerequisitesVerified,false);
  assert.equal(result.coverage.currentConditionTruthVerified,false);
  assert.equal(result.coverage.conditionDefinitionMembershipComplete,false);
  assert(Object.isFrozen(result));
  assert(Object.isFrozen(result.coverage));
  assert(Object.isFrozen(result.pointers));
  assert(Object.isFrozen(result.pointers[0]));
  assert(Object.isFrozen(result.pointers[0].booleanPath));
});

test('no common Condition pointers does not mean no quest conditions or no prerequisites',()=>{
  const {full,index,conditions}=setup();
  full.structured.conditions={
    availableConditions:{operator:'AND',conditions:[
      {type:'MissionCompleted',missionId:OTHER}
    ]}
  };
  full.structured.activationPolicies={};
  const output=createQuestConditionCrossrefs(full,index,conditions);
  assert.deepEqual(output.pointers,[]);
  assert.equal(output.coverage.directMissionPredicateMentions,1);
  assert.equal(output.coverage.prerequisitesVerified,false);
});

test('mixed-version, alien Mission shard, malformed conditions and mismatched native lookup fail closed',()=>{
  const {full,index,conditions}=setup();
  const swapped={...index,target:{platform:'Steam',gameVersion:'1.26.2'}};
  assert.throws(()=>createQuestConditionCrossrefs(full,swapped,conditions),
    /ARCHIVED_MISSION_SOURCE_REQUIRED/);
  const altered={...full,nativeWireSha256:'c'.repeat(64)};
  assert.throws(()=>createQuestConditionCrossrefs(altered,index,conditions),
    /mission reference source mismatch/);
  const badVersion={...conditions,coverage:{...conditions.coverage,gameVersion:'1.26.1'}};
  assert.throws(()=>createQuestConditionCrossrefs(full,index,badVersion),
    /CURRENT_CONDITION_INDEX_REQUIRED/);
  const missingApi={...conditions,getConditionReferences:null};
  assert.throws(()=>createQuestConditionCrossrefs(full,index,missingApi),
    /CURRENT_CONDITION_INDEX_REQUIRED/);
  const badResult={...conditions,getConditionReferences:()=>[{conditionId:'2130000001',missionId:MISSION}]};
  assert.throws(()=>createQuestConditionCrossrefs(full,index,badResult),
    /CONDITION_REFERENCE_IDENTITY/);
  const invalidTree=structuredClone(full);
  invalidTree.structured.conditions.availableConditions.operator='NOR';
  assert.throws(()=>createQuestConditionCrossrefs(invalidTree,index,conditions),
    /INVALID_SOURCE_AST/);
  const invalidId=structuredClone(full);
  invalidId.structured.conditions.availableConditions.conditions[0].conditionId='0001';
  assert.throws(()=>createQuestConditionCrossrefs(invalidId,index,conditions),
    /INVALID_COMMON_CONDITION_ID/);
  const invalidInversion=structuredClone(full);
  invalidInversion.structured.conditions.availableConditions.conditions[0].inversed='true';
  assert.throws(()=>createQuestConditionCrossrefs(invalidInversion,index,conditions),
    /INVALID_SOURCE_INVERSION/);
  const malformed=structuredClone(full);
  malformed.structured.conditions.availableConditions.conditions[0]=null;
  assert.throws(()=>createQuestConditionCrossrefs(malformed,index,conditions),
    /INVALID_SOURCE_LEAF/);
});

test('source Guide UI exposes source-typed Condition ID joins only after original-shard verification',async()=>{
  const route=await readFile(new URL('../src/routes/guide/source/+page.svelte',import.meta.url),'utf8');
  assert.match(route,/createQuestConditionCrossrefs\(selectedDetail,searchIndex,conditionRelations\)/);
  assert.match(route,/importGuideDetail\(index, row\.id, file\)/);
  assert.match(route,/questConditionCrossrefs\.pointers/);
  assert.match(route,/pointer\.booleanPath\.join/);
  assert.match(route,/pointer\.currentMissionMentions/);
  assert.match(route,/Condition定義自体が存在しないことを意味しません/);
  assert.doesNotMatch(route,/mandatoryPrerequisite|isUnlocked\(|isCompleted\(/);
});
