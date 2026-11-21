import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLegacySaveFields, getCommonSaveFields, getNativeSaveFields,
  getNestedSaveFields, probeNestedSaveStructure, compareNestedSaveStructures
} from '../src/lib/save/registry.mjs';
import { compareRedactedSaveWitnesses } from '../src/lib/save/redacted-witness.mjs';

function makeValue(kinds) {
  const kind = kinds[0];
  if (kind === 'null') return null;
  if (kind === 'string') return 'PRIVATE_FIXTURE_VALUE';
  if (kind === 'integer') return 101;
  if (kind === 'boolean') return false;
  if (kind === 'array') return [];
  if (kind === 'object') return {};
  throw new TypeError('INVALID_SYNTHETIC_KIND');
}
function buildSynthetic(version=643) {
  const doc={GameInfo:{Version:version},Player:{},World:{}};
  for(const field of getNestedSaveFields().fields) {
    const parts=field.path.slice(1).split('/');
    let node=doc;
    for(let i=0;i<parts.length;i++){
      const token=parts[i],last=i===parts.length-1;
      if(token.endsWith('[]')){
        const name=token.slice(0,-2);
        node[name]??=[{}];
        assert.ok(Array.isArray(node[name]));
        node=node[name][0];
      } else if(token==='{id}'){
        node['99123']??={};
        node=node['99123'];
      } else if(last){
        node[token]=makeValue(field.observedJsonKinds);
      } else {
        node[token]??={};
        node=node[token];
      }
    }
  }
  return doc;
}

test('native nested registry: 58 nonoverlapping pinned fields, no Writer capability',()=>{
  const nested=getNestedSaveFields();
  assert.equal(nested.schema,'wand.db05.native1261-nested-field-witnesses@1');
  assert.equal(nested.source.gameBuild,'steam-1.26.1');
  assert.match(nested.source.sha256,/^[a-f0-9]{64}$/);
  assert.equal(nested.source.currentGameBuildMatched,false);
  assert.equal(nested.fields.length,58);
  assert.equal(nested.fields.filter(f=>f.domain==='player').length,25);
  assert.equal(nested.fields.filter(f=>f.domain==='world').length,33);
  const all=[
    ...getLegacySaveFields().fields.map(f=>f.path),
    ...getCommonSaveFields().fields.map(f=>f.path),
    ...getNativeSaveFields().fields.map(f=>f.path),
    ...nested.fields.map(f=>f.path)
  ];
  assert.equal(all.length,225);
  assert.equal(new Set(all).size,225);
  assert.equal(Object.isFrozen(nested.fields[0]),true);
  assert.ok(nested.fields.every(f=>f.writable===false && f.observedIn.length===3));
  assert.equal(nested.policy.writerAuthorized,false);
});

test('nested probe recognizes all 58 synthetic field shapes at 626 and 643',()=>{
  for(const version of [626,643]){
    const scan=probeNestedSaveStructure(buildSynthetic(version));
    assert.equal(scan.contract,'wand.db05.nested-shape-probe@1');
    assert.equal(scan.registeredFieldCount,58);
    assert.deepEqual(scan.domains.map(d=>d.registeredFieldCount),[25,33]);
    assert.equal(scan.domains.reduce((sum,d)=>sum+d.observedFieldCount,0),58);
    assert.ok(scan.domains.every(d=>d.status==='shape_candidate'));
    assert.equal(scan.platformAndVersionUsedAsGates,false);
    assert.equal(scan.writerAuthorized,false);
  }
  const compared=compareNestedSaveStructures(buildSynthetic(626),buildSynthetic(643));
  assert.equal(compared.status,'same_observed_nested_fields');
  assert.equal(compared.currentGameNativeTypeAttestation,false);
  assert.equal(compared.exportAuthorized,false);
});

test('nullable observed kinds are represented without inventing non-null evidence',()=>{
  const fields=getNestedSaveFields().fields.filter(f=>f.observedJsonKinds.includes('null'));
  assert.equal(fields.length,4);
  const share=fields.find(f=>f.path==='/World/DecorationPresets[]/ShareInfo');
  assert.deepEqual(share.observedJsonKinds,['null']);
  assert.deepEqual(share.allowedJsonKinds,['null','object']);
  const pet=fields.find(f=>f.path==='/Player/Pets[]/LastSelfieDate');
  assert.deepEqual(pet.observedJsonKinds,['null','string']);
  assert.deepEqual(pet.allowedJsonKinds,['null','string']);
});

test('nullable timestamp changing from null to string is drift, not incompatibility',()=>{
  const old=buildSynthetic(626),next=buildSynthetic(643);
  next.Player.Pets[0].LastSelfieDate='2026-11-21T00:00:00Z';
  const cmp=compareNestedSaveStructures(old,next);
  assert.equal(cmp.status,'observed_witness_difference');
  const player=cmp.domains.find(d=>d.domain==='player');
  assert.deepEqual(player.changedKindPaths,['/Player/Pets[]/LastSelfieDate']);
  assert.deepEqual(player.conflictingKnownPaths,[]);
  assert.equal(JSON.stringify(cmp).includes('2026-11-21'),false);
  assert.equal(cmp.writerAuthorized,false);
});

test('unexpected types conflict, but never expose value strings or numeric map keys',()=>{
  const old=buildSynthetic(626),next=buildSynthetic(643);
  next.World.FloatingIslands['99123'].Unlocked='PRIVATE_VALUE_BAD_TYPE';
  const cmp=compareNestedSaveStructures(old,next);
  assert.equal(cmp.status,'observed_type_conflict');
  assert.deepEqual(cmp.domains.find(d=>d.domain==='world').conflictingKnownPaths,
    ['/World/FloatingIslands/{id}/Unlocked']);
  assert.equal(JSON.stringify(cmp).includes('PRIVATE_VALUE_BAD_TYPE'),false);
  assert.equal(JSON.stringify(cmp).includes('99123'),false);
  assert.equal(cmp.writerAuthorized,false);
});

test('missing nested witness shows coverage difference rather than deletion',()=>{
  const a=buildSynthetic(626),b=buildSynthetic(643);
  delete b.Player.Cookbook.Favorites;
  const result=compareNestedSaveStructures(a,b);
  assert.equal(result.status,'observed_witness_difference');
  assert.deepEqual(result.domains.find(d=>d.domain==='player').missingKnownPaths,
    ['/Player/Cookbook/Favorites']);
  assert.equal(result.strictDecoderVerified,false);
});

test('wildcards use bounded sampling and cannot imply exhaustive evidence',()=>{
  const a=buildSynthetic(626),b=buildSynthetic(643);
  b.Player.Pets=Array.from({length:64},()=>structuredClone(b.Player.Pets[0]));
  const result=compareNestedSaveStructures(a,b);
  assert.equal(result.status,'inconclusive');
  assert.equal(result.domains.find(d=>d.domain==='player').status,'sampled_inconclusive');
  assert.equal(result.exhaustive,false);
});

test('root shape invalid is rejected independently of save version',()=>{
  const a=buildSynthetic(626),b=buildSynthetic(643);
  b.World=null;
  assert.equal(compareNestedSaveStructures(a,b).status,'invalid_root');
});

test('SRC-06 redacted bridge accepts only 58 newly allowlisted nested public templates',()=>{
  const list=[
    {path:'/GameInfo',type:'object'},
    {path:'/GameInfo/Version',type:'integer'},
    {path:'/Player',type:'object'},
    {path:'/World',type:'object'},
    {path:'/Player/Pets[]/PetItemID',type:'integer'},
    {path:'/World/FloatingIslands/{id}/Unlocked',type:'boolean'},
    {path:'/Player/Cookbook/Recipes',type:'array'}
  ];
  const summary=version=>({
    schema:'wand.db05.ingest@1',safeForPublicRepository:false,writerAuthorized:false,
    current:{schemaObserved:version,rootRequiredFieldsPresent:true,rootRequiredObjectsObserved:true,
      publicWitnesses:list,otherWitnessCount:3,decoderAndBuildVerified:false,writerAuthorized:false}
  });
  const x=compareRedactedSaveWitnesses(summary(626),summary(643));
  assert.equal(x.status,'inconclusive');
  assert.equal(x.domains.find(d=>d.domain==='player').status,'same_observed_witnesses');
  assert.equal(x.domains.find(d=>d.domain==='world').status,'same_observed_witnesses');
  assert.ok(!JSON.stringify(x).includes('99123'));
  const bad=summary(643);
  bad.current={...bad.current,publicWitnesses:list.concat(
    {path:'/World/FloatingIslands/99123/Unlocked',type:'boolean'})};
  assert.throws(()=>compareRedactedSaveWitnesses(summary(626),bad),/UNRECOGNIZED_PUBLIC_WITNESS_PATH/);
});
