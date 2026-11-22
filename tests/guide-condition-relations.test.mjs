import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  DB03_CONDITION_RELATION_SCHEMA,createStructuralGuideConditionRelations,
  loadVerifiedGuideConditionRelations
} from '../src/lib/guide/condition-relations.ts';
import {
  GUIDE_CONDITION_SOURCE_SHA,GUIDE_CONDITION_INDEX_V2_SHA,
  GUIDE_CONDITION_V2_MISSION_REFERENCES
} from '../src/lib/guide/current-conditions.mjs';

const ONE='2070000651',TWO='2070001661',THREE='2070001731';
const WIRE='9'.repeat(64);
const MISSION_IDS=[ONE,TWO,THREE];
function fixture(){
  const byMission=new Map(MISSION_IDS.map(x=>[x,[]]));
  for(let i=0;i<4960;i++){
    const mission=i<2000?ONE:i<4000?TWO:THREE;
    const kind=i%3===0?'MissionStepStatus':i%3===1?'MissionCompleted':'MissionObjectiveStatus';
    const row={
      conditionId:String(2130000001+(i%200)),
      sourceName:'Mission!Test!KnownSource_'+(i%200),
      conditionWireSha256:WIRE,
      sourcePath:i%2===0?'conditions.children[0]':'conditions.children[0].nested.children[1]',
      operator:i%4===0?'OR':'AND',kind,
      ...(kind==='MissionStepStatus'?{
        stepId:i%23,statusCode:5,status:'NotCompleted',omittedSourceFields:[]
      }:kind==='MissionObjectiveStatus'?{stepId:i%23,objectiveId:i%8}:{}),
      ...(i%5===0?{inversed:true}:{})
    };
    byMission.get(mission).push(row);
  }
  return {
    byMission,count:5440,missionReferenceCount:4960,formatVersion:2,
    targetVersion:'1.26.2',sourceSha256:GUIDE_CONDITION_SOURCE_SHA,
    indexSha256:GUIDE_CONDITION_INDEX_V2_SHA,evaluation:'static_native_definitions_only'
  };
}

test('shared v1.26.2 native Condition index reverses all 4960 references without inventing quest dependency edges',()=>{
  const index=createStructuralGuideConditionRelations(fixture());
  assert.equal(index.schema,DB03_CONDITION_RELATION_SCHEMA);
  assert.deepEqual({
    gameVersion:index.coverage.gameVersion,definitions:index.coverage.definitions,
    missionMentions:index.coverage.missionMentions,
    distinctMentionedMissionIds:index.coverage.distinctMentionedMissionIds,
    conditionsWithMissionMentions:index.coverage.conditionsWithMissionMentions,
    direction:index.coverage.referenceDirection,
    provenance:index.coverage.provenance
  },{
    gameVersion:'1.26.2',definitions:5440,missionMentions:4960,
    distinctMentionedMissionIds:3,conditionsWithMissionMentions:200,
    direction:'STATIC_SOURCE_MENTION_NOT_PREREQUISITE',
    provenance:'structure_and_source_fields'
  });
  assert.equal(index.coverage.conditionTruthEvaluated,false);
  assert.equal(index.coverage.currentQuestAvailabilityVerified,false);
  assert.equal(index.coverage.saveProgressVerified,false);
  assert.equal(index.coverage.indexedProjectionSha256,GUIDE_CONDITION_INDEX_V2_SHA);
  assert.equal(index.coverage.sourceOriginalSha256,GUIDE_CONDITION_SOURCE_SHA);
  assert.equal(GUIDE_CONDITION_V2_MISSION_REFERENCES,4960);
  assert.equal(index.getMissionReferences(ONE).total,2000);
  assert.equal(index.getMissionReferences(TWO).total,2000);
  assert.equal(index.getMissionReferences(THREE).total,960);
  assert.equal(index.getMissionReferences('999999').total,0);
  assert.equal(index.getMissionReferences(ONE,20,1990).rows.length,20);
  assert.equal(index.getMissionReferences(THREE,20,955).rows.length,5);
  const p=index.getMissionReferences(ONE,20,1990);
  assert.equal(p.rows[0].missionId,ONE);
  assert.equal(p.rows[0].conditionId,String(2130000001+(1990%200)));
  assert(Object.isFrozen(index));
  assert(Object.isFrozen(index.coverage));
  assert(Object.isFrozen(p));
  assert(Object.isFrozen(p.rows));
  assert(Object.isFrozen(p.rows[0]));
  const c=index.getConditionReferences('2130000001');
  assert.equal(c.length,25);
  assert.equal(new Set(c.map(x=>x.missionId)).size,3);
  assert(Object.isFrozen(c));
  const nativeStep=3;
  const stepRows=index.getMissionStepReferences(ONE,nativeStep);
  assert(stepRows.length>0);
  assert(stepRows.every(x=>x.stepId===nativeStep));
  assert(Object.isFrozen(stepRows));
  const counts=index.getMissionReferenceKinds(ONE);
  assert.equal(Object.values(counts).reduce((n,v)=>n+v,0),2000);
  assert(Object.isFrozen(counts));
  assert.deepEqual(index.getMissionReferenceKinds('999999'),{});
  const unknownCondition=index.getConditionReferences('999999');
  assert.deepEqual(unknownCondition,[]);
  assert(index.coverage.conditionsWithMissionMentions<index.coverage.definitions,
    'absence from the mission reference map is not proof that a Condition ID is undefined');
});

test('invalid input cannot masquerade as verified v1.26.2 Condition references',()=>{
  const index=createStructuralGuideConditionRelations(fixture());
  for(const bad of ['0','01','__proto__','99999999999999999',1.2,-2,NaN])
    assert.throws(()=>index.getMissionReferences(bad),/INVALID_NATIVE_ID/);
  assert.throws(()=>index.getMissionReferences(ONE,501),/INVALID_PAGE/);
  assert.throws(()=>index.getMissionReferences(ONE,5,-1),/INVALID_PAGE/);
  assert.throws(()=>index.getMissionStepReferences(ONE,-1),/INVALID_NATIVE_STEP_ID/);
  assert.throws(()=>index.getConditionReferences('abc'),/INVALID_NATIVE_ID/);
  const wrong=fixture();
  wrong.sourceSha256='0'.repeat(64);
  assert.throws(()=>createStructuralGuideConditionRelations(wrong),/V1262_SOURCE_REQUIRED/);
  const removed=fixture();
  removed.byMission.get(ONE).pop();
  assert.throws(()=>createStructuralGuideConditionRelations(removed),/MENTION_CENSUS/);
  const forged=fixture();
  forged.byMission.get(ONE)[0].sourcePath='conditions.children[0].inject';
  assert.throws(()=>createStructuralGuideConditionRelations(forged),/INVALID_MENTION/);
  const fakeStep=fixture();
  fakeStep.byMission.get(ONE)[0].omittedSourceFields=['imaginaryField'];
  assert.throws(()=>createStructuralGuideConditionRelations(fakeStep),/INVALID_OMITTED_FIELDS/);
});

test('verified loader refuses wrong private file names before touching any source bytes',async()=>{
  const fake={name:'external.json',size:1,arrayBuffer:async()=>new ArrayBuffer(1)};
  await assert.rejects(
    loadVerifiedGuideConditionRelations(fake,fake,{}),
    /PRIVATE_V2_FILES_REQUIRED/
  );
  const route=await readFile(new URL('../src/routes/guide/source/+page.svelte',import.meta.url),'utf8');
  assert.match(route,/createStructuralGuideConditionRelations\(current\)/);
  assert.match(route,/createStructuralGuideConditionRelations\(result\)/);
  assert.match(route,/conditionRelations\.getMissionReferences\(selectedId\)/);
  assert.match(route,/withVerifiedConditionStepDetails\(/,
    'existing original Mission step matcher must remain in use');
});
