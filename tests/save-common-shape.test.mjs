import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLegacySaveFields, getCommonSaveFields, probeCommonSaveStructure,
  compareCommonSaveStructures
} from '../src/lib/save/registry.mjs';
import { compareRedactedSaveWitnesses } from '../src/lib/save/redacted-witness.mjs';

const doc = version => ({
  GameInfo: { Version: version },
  Player: {
    Mounts: [{ StableName: 'fixture only' }],
    AchievementsData: [],
    DutySlots: {},
    BattlePassStates: {},
    EvolveStatesProfile: {},
    LastUsedLinkedEnvironmentEnter: {}
  },
  World: {
    Characters: [{ SkinID: 23400001 }],
    CastleSkinItemID: 100001,
    PlazaSkinItemID: 100002,
    Keyholes: {},
    MissionSlots: {},
    QuestInfo: { MissionsCompleted: [] },
    SceneryPuzzles: [],
    Realms: {}
  }
});

test('common field registry contains 16 distinct public source-backed templates', () => {
  const fields=getCommonSaveFields();
  const historical=getLegacySaveFields();
  assert.equal(fields.schema,'wand.db05.common626643-field-witnesses@1');
  assert.equal(fields.fields.length,16);
  assert.equal(new Set(fields.fields.map(f=>f.path)).size,16);
  assert.ok(fields.fields.every(f=>f.publicSource.startsWith('DreamwishWand/web/') && f.writable===false));
  assert.ok(fields.fields.every(f=>f.codecClosureVerified===false));
  assert.equal(fields.policy.writerAuthorized,false);
  assert.equal(historical.fields.length,66);
  assert.ok(fields.fields.every(f=>!historical.fields.some(old=>old.path===f.path)));
});

test('626/643 identical source-backed field types are the same candidate shape', () => {
  const a=doc(626),b=doc(643);
  const left=probeCommonSaveStructure(a),right=probeCommonSaveStructure(b);
  assert.equal(left.contract,'wand.db05.common-shape-probe@1');
  assert.equal(left.platformAndVersionUsedAsGates,false);
  assert.deepEqual(left.domains.map(d=>d.status),['shape_candidate','shape_candidate','shape_candidate']);
  assert.equal(left.domains.reduce((sum,d)=>sum+d.observedFieldCount,0),16);
  assert.equal(right.domains.reduce((sum,d)=>sum+d.observedFieldCount,0),16);
  const cmp=compareCommonSaveStructures(a,b);
  assert.equal(cmp.status,'same_known_common_shape');
  assert.equal(cmp.writerAuthorized,false);
  assert.equal(cmp.strictDecoderVerified,false);
});

test('public structure comparison ignores values and unknown private names',()=>{
  const a=doc(626),b=doc(643);
  b.World.Characters[0].SkinID=999999;
  b.Player.UserPrivateNotes='SensitiveFixtureMarker';
  b.World.QuestInfo.MissionsCompleted.push(123);
  const cmp=compareCommonSaveStructures(a,b);
  assert.equal(cmp.status,'same_known_common_shape');
  assert.ok(!JSON.stringify(cmp).includes('SensitiveFixtureMarker'));
  assert.ok(!JSON.stringify(cmp).includes('999999'));
  assert.equal(cmp.exportAuthorized,false);
});

test('actual public-path type conflict is identified without treating version as cause',()=>{
  const a=doc(626),b=doc(643);
  b.World.CastleSkinItemID='invalid instead of integer';
  const cmp=compareCommonSaveStructures(a,b);
  assert.equal(cmp.status,'observed_type_conflict');
  const c=cmp.domains.find(d=>d.domain==='cosmetics');
  assert.ok(c.conflictingKnownPaths.includes('/World/CastleSkinItemID'));
});

test('missing candidate path is observational drift and not absence of rights',()=>{
  const a=doc(626),b=doc(643);
  delete b.Player.AchievementsData;
  const cmp=compareCommonSaveStructures(a,b);
  assert.equal(cmp.status,'observed_witness_difference');
  const progress=cmp.domains.find(d=>d.domain==='progression');
  assert.deepEqual(progress.missingKnownPaths,['/Player/AchievementsData']);
  assert.equal(progress.writerAuthorized,false);
});

test('array samples and empty candidate domains remain inconclusive',()=>{
  const a=doc(626),b=doc(643);
  b.World.Characters=Array.from({length:80},(_,i)=>({SkinID:i+1}));
  assert.equal(probeCommonSaveStructure(b).domains.find(d=>d.domain==='world').status,'sampled_candidate');
  assert.equal(compareCommonSaveStructures(a,b).status,'inconclusive');
  delete b.World.Characters;delete b.World.Keyholes;delete b.World.SceneryPuzzles;delete b.World.Realms;
  delete b.Player.LastUsedLinkedEnvironmentEnter;
  const result=probeCommonSaveStructure(b);
  assert.equal(result.exhaustive,false);
});

test('private DB-05 scanner summary now accepts only new allowlisted common paths',()=>{
  const known=[
    {path:'/GameInfo',type:'object'},
    {path:'/GameInfo/Version',type:'integer'},
    {path:'/Player',type:'object'},
    {path:'/World',type:'object'},
    {path:'/World/Characters',type:'array'},
    {path:'/Player/AchievementsData',type:'array'},
    {path:'/Player/Mounts',type:'array'}
  ];
  const summary=version=>({
    schema:'wand.db05.ingest@1', safeForPublicRepository:false, writerAuthorized:false,
    current:{schemaObserved:version,rootRequiredFieldsPresent:true,rootRequiredObjectsObserved:true,
      publicWitnesses:known,otherWitnessCount:0,decoderAndBuildVerified:false,writerAuthorized:false}
  });
  const x=compareRedactedSaveWitnesses(summary(626),summary(643));
  assert.equal(x.domains.find(d=>d.domain==='world').status,'same_observed_witnesses');
  assert.equal(x.domains.find(d=>d.domain==='progression').status,'same_observed_witnesses');
  assert.equal(x.domains.find(d=>d.domain==='cosmetics').status,'same_observed_witnesses');
  assert.equal(x.status,'inconclusive'); // legacy domains absent
  const invalid=summary(643);
  invalid.current={...invalid.current,publicWitnesses:[...known,{path:'/World/UnknownPrivateField',type:'object'}]};
  assert.throws(()=>compareRedactedSaveWitnesses(summary(626),invalid),/UNRECOGNIZED_PUBLIC_WITNESS_PATH/);
});
