import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  indexStaticConditionMentions, currentConditionMentionsForQuest,
  assertGuideConditionBridge, importCurrentGuideConditions,
  GUIDE_CONDITION_INDEX_SHA, GUIDE_CONDITION_MAX_FILE_BYTES
} from '../src/lib/guide/current-conditions.mjs';
const H='0'.repeat(64);
const bridge = {baselineVersion:'1.26.1',targetVersion:'1.26.2',
  originalSearchIndexSha256:'26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d',
  compatibleFamilies:['Mission.json','LocDB (8 payloads)'],conditionDefinitionsEquivalent:false,localePayloadsEqual:8};
function row(id, tree) {return {id,sourceName:'Mission!Synthetic',nativeFrameIndex:0,
  nativeWireSha256:H,conditions:tree};}
function tree(children,operator='AND'){return {operator,operatorExplicit:true,sourceTreeWireSha256:H,children};}
function step(missionId,stepId,statusCode,ordinal){return {ordinal,kind:'MissionStepStatus',sourceTag:285,
  payloadSha256:H,missionId,stepId,statusCode,sourceStatusName:'Completed',
  scalarInterpretation:'source_explicit_fields_only',omittedSourceFields:[]};}
function file(name,bytes){return {name,size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};}

test('source-typed nested OR stays a mention, not an inferred prerequisite', () => {
  const records=[row('2130000001',tree([
    {ordinal:0,kind:'SubConditions',sourceTag:10,payloadSha256:H,
      nested:tree([step('2070001661',9,4,0)],'OR')},
    {ordinal:1,kind:'DialogueFlag',sourceTag:130,payloadSha256:H}
  ]))];
  const out=indexStaticConditionMentions(records);
  assert.deepEqual(out.census.sourceKinds,{DialogueFlag:1,MissionStepStatus:1,SubConditions:1});
  const result=currentConditionMentionsForQuest({...out,evaluation:'static_native_definitions_only'},'2070001661');
  assert.equal(result.total,1);
  assert.equal(result.rows[0].stepId,9);
  assert.equal(result.rows[0].operator,'OR');
  assert.match(result.rows[0].sourcePath,/nested/);
  assert.equal(JSON.stringify(result).includes('prerequisite'),false);
});

test('source omitted scalars remain absent on the rendered record', () => {
  const l=step('2070000651',0,2,0);
  delete l.stepId; delete l.statusCode; delete l.sourceStatusName;
  l.omittedSourceFields=['stepId','statusCode'];
  const idx=indexStaticConditionMentions([row('2130000002',tree([l]))]);
  const found=idx.byMission.get('2070000651')[0];
  assert.equal(Object.hasOwn(found,'stepId'),false);
  assert.equal(Object.hasOwn(found,'status'),false);
  assert.deepEqual(found.omittedSourceFields,['stepId','statusCode']);
});

test('opaque unknown tags are never reinterpreted as Mission references', () => {
  const r=row('2130000003',tree([{ordinal:0,kind:'Unknown',sourceTag:777,payloadSha256:H},
    {ordinal:1,kind:'CommonConditions',sourceTag:5,payloadSha256:H,commonConditionId:'2130000001'}]));
  const idx=indexStaticConditionMentions([r]);
  assert.equal(idx.census.commonConditionPointerLeaves,1);
  assert.equal(idx.byMission.size,0);
});

test('duplicate ID, invalid wire identity, optional mismatch and malformed nesting fail closed', () => {
  const a=row('2130000001',tree([step('2070001661',9,4,0)]));
  assert.throws(()=>indexStaticConditionMentions([a,a]),/duplicate source Condition/);
  const m=row('2130000004',tree([step('2070001661',9,4,0)]));
  m.conditions.children[0].omittedSourceFields=['statusCode'];
  assert.throws(()=>indexStaticConditionMentions([m]),/optional source field inference mismatch/);
  const n=row('2130000005',tree([{ordinal:0,kind:'SubConditions',sourceTag:10,payloadSha256:H}]));
  assert.throws(()=>indexStaticConditionMentions([n]),/SubConditions source tag/);
});

test('unverified source bridge and forged user JSON cannot import current Condition', async () => {
  assert.doesNotThrow(()=>assertGuideConditionBridge(bridge));
  assert.throws(()=>assertGuideConditionBridge({...bridge, conditionDefinitionsEquivalent:true}),/exact verified/);
  const a=file('condition-native-index.json',Buffer.from('{}'));
  const b=file('condition-native-index-manifest.json',Buffer.from('{}'));
  await assert.rejects(importCurrentGuideConditions(a,b,bridge),/fingerprint mismatch/);
  await assert.rejects(importCurrentGuideConditions(a,b,{...bridge,baselineVersion:'1.26.2'}),/exact verified/);
  assert.equal(GUIDE_CONDITION_MAX_FILE_BYTES>3888435,true);
  assert.match(GUIDE_CONDITION_INDEX_SHA,/^[a-f0-9]{64}$/);
});

test('actual owner-private original index + manifest import and 1262 Jack Sparrow native steps', async t => {
  const folder=process.env.DB03_PRIVATE_CONDITION_DIR;
  if (!folder) return t.skip('private source fixture not present in public CI');
  const raw=await readFile(folder+'/condition-native-index.json');
  const manifest=await readFile(folder+'/condition-native-index-manifest.json');
  const imported=await importCurrentGuideConditions(file('condition-native-index.json',raw),
    file('condition-native-index-manifest.json',manifest),bridge);
  assert.equal(imported.count,5440);
  const out=currentConditionMentionsForQuest(imported,'2070001661',100);
  assert(out.rows.some(x=>x.conditionId==='2130006145' && x.stepId===9 && x.statusCode===4));
  assert(out.rows.some(x=>x.conditionId==='2130007038' && x.stepId===12 && x.statusCode===2));
  assert(!out.rows.some(x=>x.conditionId==='2130006145' && x.stepId===6));
  assert.equal(out.total,imported.byMission.get('2070001661').length);
});
