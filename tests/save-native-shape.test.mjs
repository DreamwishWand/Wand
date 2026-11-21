import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNativeSaveFields, getCommonSaveFields, getLegacySaveFields,
  probeNativeSaveStructure, compareNativeSaveStructures
} from '../src/lib/save/registry.mjs';
import { compareRedactedSaveWitnesses } from '../src/lib/save/redacted-witness.mjs';

function synthetic(schemaVersion=643) {
  const doc={GameInfo:{Version:schemaVersion},Player:{},World:{}};
  for(const field of getNativeSaveFields().fields) {
    const tokens=field.path.slice(1).split('/');
    const parent=tokens.length===1?doc:doc[tokens[0]];
    const name=tokens.at(-1);
    parent[name]=field.jsonType==='array' ? []
      : field.jsonType==='object' ? {}
      : field.jsonType==='integer' ? 7
      : field.jsonType==='boolean' ? false : 'fixture';
  }
  return doc;
}

test('native source manifest records 85 unique fields and the exact old source build',()=>{
  const native=getNativeSaveFields();
  assert.equal(native.schema,'wand.db05.native1261-observed-field-witnesses@1');
  assert.equal(native.source.gameBuild,'steam-1.26.1');
  assert.equal(native.source.currentGameBuildMatched,false);
  assert.match(native.source.sha256,/^[0-9a-f]{64}$/);
  assert.equal(native.fields.length,85);
  assert.equal(new Set(native.fields.map(x=>x.path)).size,85);
  assert.deepEqual(
    [...new Set(native.fields.map(x=>x.domain))].sort(),
    ['player','profile','world']
  );
  assert.equal(native.fields.filter(x=>x.domain==='profile').length,13);
  assert.equal(native.fields.filter(x=>x.domain==='player').length,35);
  assert.equal(native.fields.filter(x=>x.domain==='world').length,37);
  assert.ok(native.fields.every(f=>f.writerAuthorized===false&&f.observedIn.length===3));
  assert.equal(native.policy.codecRoundTripVerified,false);
  assert.equal(native.policy.currentBuildNativeTypesVerified,false);
});

test('native registry does not collide with 66 legacy or 16 common public paths',()=>{
  const paths=[
    ...getLegacySaveFields().fields.map(f=>f.path),
    ...getCommonSaveFields().fields.map(f=>f.path),
    ...getNativeSaveFields().fields.map(f=>f.path)
  ];
  assert.equal(paths.length,167);
  assert.equal(new Set(paths).size,167);
});

test('85 public native fields probe across schema 626 and 643, independent of version',()=>{
  for(const version of [626,643]) {
    const scan=probeNativeSaveStructure(synthetic(version));
    assert.equal(scan.registeredFieldCount,85);
    assert.equal(scan.domains.reduce((n,d)=>n+d.observedFieldCount,0),85);
    assert.ok(scan.domains.every(d=>d.status==='shape_candidate'));
    assert.equal(scan.platformAndVersionUsedAsGates,false);
    assert.equal(scan.nativeGameBuildAttested,false);
    assert.equal(scan.writerAuthorized,false);
  }
});

test('same native types with differing save values remain shape candidates',()=>{
  const old=synthetic(626),fresh=synthetic(643);
  fresh.Player.Level=999;
  fresh.Player.Cookbook={someFuturePrivateField:'do not disclose'};
  fresh.World.CurrentWeather='different weather';
  fresh.World.DecorationPresets.push({userContent:'private design'});
  const result=compareNativeSaveStructures(old,fresh);
  assert.equal(result.status,'same_observed_native_fields');
  assert.ok(result.domains.every(d=>d.status==='same_observed_native_fields'));
  assert.equal(result.currentGameNativeTypeAttestation,false);
  assert.equal(result.exportAuthorized,false);
  const json=JSON.stringify(result);
  for(const value of ['do not disclose','different weather','private design','999']) {
    assert.equal(json.includes(value),false);
  }
});

test('observed type conflict is reported by name without private value contents',()=>{
  const old=synthetic(626),fresh=synthetic(643);
  fresh.Player.CurrencyAmounts='SECRET_VALUE_MUST_NOT_LEAK';
  const result=compareNativeSaveStructures(old,fresh);
  assert.equal(result.status,'observed_type_conflict');
  assert.deepEqual(result.domains.find(x=>x.domain==='player').conflictingKnownPaths,
    ['/Player/CurrencyAmounts']);
  assert.equal(JSON.stringify(result).includes('SECRET_VALUE_MUST_NOT_LEAK'),false);
});

test('missing known paths are observational drift; missing entire domain inconclusive',()=>{
  const old=synthetic(626),fresh=synthetic(643);
  delete fresh.World.CurrentWeather;
  const drift=compareNativeSaveStructures(old,fresh);
  assert.equal(drift.status,'observed_witness_difference');
  assert.deepEqual(drift.domains.find(d=>d.domain==='world').missingKnownPaths,
    ['/World/CurrentWeather']);
  const empty={GameInfo:{Version:643},Player:{},World:{}};
  assert.equal(compareNativeSaveStructures(old,empty).status,'inconclusive');
  assert.equal(probeNativeSaveStructure(empty).domains.filter(d=>d.status==='not_observed').length,3);
});

test('invalid document roots are never equivalent and never grant writer',()=>{
  const result=compareNativeSaveStructures(synthetic(626),{GameInfo:{Version:'643'},Player:{},World:[]});
  assert.equal(result.status,'invalid_root');
  assert.equal(result.writerAuthorized,false);
});

test('redacted SRC-06 witness bridge accepts new public paths while rejecting private ones',()=>{
  const base=[
    {path:'/GameInfo',type:'object'},
    {path:'/GameInfo/Version',type:'integer'},
    {path:'/Player',type:'object'},
    {path:'/World',type:'object'},
    {path:'/Player/OutfitPresets',type:'array'},
    {path:'/World/FloatingIslands',type:'object'},
    {path:'/FreeTimers',type:'array'}
  ];
  const summary=version=>({
    schema:'wand.db05.ingest@1',safeForPublicRepository:false,writerAuthorized:false,
    current:{
      schemaObserved:version,rootRequiredFieldsPresent:true,rootRequiredObjectsObserved:true,
      publicWitnesses:base,otherWitnessCount:0,decoderAndBuildVerified:false,writerAuthorized:false
    }
  });
  const result=compareRedactedSaveWitnesses(summary(626),summary(643));
  for(const domain of ['player','profile','world']) {
    assert.equal(result.domains.find(d=>d.domain===domain).status,'same_observed_witnesses');
  }
  assert.equal(result.domains.length,10);
  assert.equal(result.status,'inconclusive'); // unobserved legacy domains
  const wrong=summary(643);
  wrong.current.publicWitnesses=[
    ...base,{path:'/Player/PrivateMetadataDoNotExpose',type:'string'}
  ];
  assert.throws(()=>compareRedactedSaveWitnesses(summary(626),wrong),
    /UNRECOGNIZED_PUBLIC_WITNESS_PATH/);
});

test('immutable registry cannot be silently promoted to a writer capability',()=>{
  const registry=getNativeSaveFields();
  assert.equal(Object.isFrozen(registry),true);
  assert.equal(Object.isFrozen(registry.fields[0]),true);
  assert.throws(()=>{registry.fields[0].writerAuthorized=true},TypeError);
  assert.equal(registry.fields[0].writerAuthorized,false);
});
