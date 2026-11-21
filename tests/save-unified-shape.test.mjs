import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLegacySaveFields, getCommonSaveFields, getNativeSaveFields,
  getNestedSaveFields, getDeepSaveFields,
  getUnifiedSaveShapeCatalog, probeUnifiedSaveStructure,
  compareUnifiedSaveStructures
} from '../src/lib/save/registry.mjs';
import { compareRedactedSaveWitnesses } from '../src/lib/save/redacted-witness.mjs';

function valueFor(kinds) {
  if (kinds.includes('object')) return {};
  if (kinds.includes('null')) return null;
  if (kinds.includes('array')) return [];
  if (kinds.includes('integer')) return 3;
  if (kinds.includes('boolean')) return false;
  if (kinds.includes('string')) return 'private-fixture-only';
  throw new TypeError('BAD_SYNTHETIC_KIND');
}

function buildDocument(schemaVersion=643) {
  const document={GameInfo:{Version:schemaVersion},Player:{},World:{}};
  for(const field of getDeepSaveFields().fields) {
    const tokens=field.path.slice(1).split('/');
    let node=document;
    for(let index=0;index<tokens.length;index++){
      const token=tokens[index];
      if(token==='{id}'){
        node['9999']??={};node=node['9999'];
      } else if(token.endsWith('[]')){
        const key=token.slice(0,-2);
        if(!Array.isArray(node[key]))node[key]=[{}];
        if(!node[key].length)node[key].push({});
        node=node[key][0];
      } else if(index===tokens.length-1){
        node[token]=valueFor(field.observedJsonKinds);
      } else {
        node[token]??={};node=node[token];
      }
    }
  }
  return document;
}

const normalize=p=>p.replace(/\/\{(?:id|routeId|containerId|itemId|slot|gridId|objectId)\}(?=\/|$)/g,'/{id}');

test('all five provenance classes contain 308 structurally unique paths',()=>{
  const files=[
    getLegacySaveFields(),getCommonSaveFields(),getNativeSaveFields(),
    getNestedSaveFields(),getDeepSaveFields()
  ];
  assert.deepEqual(files.map(x=>x.fields.length),[66,16,85,58,83]);
  const paths=files.flatMap(f=>f.fields.map(row=>normalize(row.path)));
  assert.equal(paths.length,308);
  assert.equal(new Set(paths).size,308);
  const catalog=getUnifiedSaveShapeCatalog();
  assert.equal(catalog.publicTemplateCount,308);
  assert.deepEqual(catalog.sourceCounts,{
    legacy:66,common:16,native:85,nativeNested:58,nativeDeep:83
  });
  assert.equal(catalog.writerAuthorized,false);
});

test('83 native deep fields have source tags, precise observed types and no write privileges',()=>{
  const x=getDeepSaveFields();
  assert.equal(x.schema,'wand.db05.native1261-deep-field-witnesses@1');
  assert.equal(x.source.gameBuild,'steam-1.26.1');
  assert.equal(x.source.currentGameBuildMatched,false);
  assert.match(x.source.sha256,/^[0-9a-f]{64}$/);
  assert.deepEqual([x.fields.filter(f=>f.domain==='player').length,
    x.fields.filter(f=>f.domain==='world').length],[10,73]);
  assert.ok(x.fields.every(f=>Number.isInteger(f.protobufFieldNumber)&&f.protobufFieldNumber>0));
  assert.ok(x.fields.every(f=>f.writable===false && f.observedIn.length===3));
  assert.equal(x.policy.writerAuthorized,false);
  assert.equal(Object.isFrozen(x.fields[0]),true);
});

test('unified probe reaches 83 deep paths with no version/platform gates',()=>{
  for(const schema of [626,643]){
    const x=probeUnifiedSaveStructure(buildDocument(schema));
    assert.equal(x.publicTemplateCount,308);
    assert.equal(x.platformAndVersionUsedAsGates,false);
    assert.equal(x.nativeBuildAttested,false);
    assert.ok(x.domains.find(d=>d.domain==='world').observedFields.length>=73);
    assert.ok(x.domains.find(d=>d.domain==='player').observedFields.length>=10);
    assert.equal(x.writerAuthorized,false);
    assert.equal(x.exhaustive,false);
  }
});

test('world paths witness grid objects and character state without leaking map keys',()=>{
  const old=buildDocument(626),updated=buildDocument(643);
  updated.World.GridCollection.Grids['9999'].Objects['9999'].X=18;
  updated.World.Characters[0].Friendship=202;
  updated.World.Characters[0].LastGiftDate='2026-11-21T00:00:00Z';
  const result=compareUnifiedSaveStructures(old,updated);
  const world=result.domains.find(d=>d.domain==='world');
  assert.equal(world.status,'observed_witness_difference');
  assert.ok(world.changedKindPaths.includes('/World/Characters[]/LastGiftDate'));
  assert.deepEqual(world.conflictingKnownPaths,[]);
  assert.ok(!JSON.stringify(result).includes('9999'));
  assert.ok(!JSON.stringify(result).includes('2026-11-21'));
  assert.equal(result.writerAuthorized,false);
});

test('unregistered field and user identifier never appear in public comparison',()=>{
  const a=buildDocument(626),b=buildDocument(643);
  b.Player.SecretProfileId='secret-do-not-leak';
  b.World.GridCollection.Grids['9999'].Objects['9999'].UnknownPrivateItem='private';
  const c=compareUnifiedSaveStructures(a,b);
  assert.equal(JSON.stringify(c).includes('SecretProfileId'),false);
  assert.equal(JSON.stringify(c).includes('UnknownPrivateItem'),false);
  assert.equal(JSON.stringify(c).includes('secret-do-not-leak'),false);
});

test('wrong type in a grid object is an explicit diagnostic conflict',()=>{
  const a=buildDocument(626),b=buildDocument(643);
  b.World.GridCollection.Grids['9999'].Objects['9999'].ItemID='private value';
  const c=compareUnifiedSaveStructures(a,b);
  assert.equal(c.status,'observed_type_conflict');
  assert.ok(c.domains.find(x=>x.domain==='world').conflictingKnownPaths.includes(
    '/World/GridCollection/Grids/{id}/Objects/{id}/ItemID'));
  assert.equal(JSON.stringify(c).includes('private value'),false);
  assert.equal(c.exportAuthorized,false);
});

test('known nullable grid state can change from null to object without type conflict',()=>{
  const a=buildDocument(626),b=buildDocument(643);
  const stateField=getDeepSaveFields().fields.find(f=>
    f.path==='/World/GridCollection/Grids/{id}/Objects/{id}/State');
  assert.deepEqual(stateField.observedJsonKinds,['null','object']);
  a.World.GridCollection.Grids['9999'].Objects['9999'].State=null;
  b.World.GridCollection.Grids['9999'].Objects['9999'].State={Kind:'private'};
  const c=compareUnifiedSaveStructures(a,b);
  const w=c.domains.find(x=>x.domain==='world');
  assert.ok(w.changedKindPaths.includes(stateField.path));
  assert.equal(w.conflictingKnownPaths.includes(stateField.path),false);
});

test('coverage changes are not interpreted as absent ownership',()=>{
  const a=buildDocument(626),b=buildDocument(643);
  delete b.Player.ListInventories['9999'].CompatibleFurnitureTypes;
  const cmp=compareUnifiedSaveStructures(a,b);
  assert.ok(cmp.domains.find(d=>d.domain==='player').missingKnownPaths.includes(
    '/Player/ListInventories/{id}/CompatibleFurnitureTypes'));
  assert.equal(cmp.strictDecoderVerified,false);
});

test('invalid root and unknown-only reports cannot assert compatibility',()=>{
  const a=buildDocument(626);
  assert.equal(compareUnifiedSaveStructures(a,{GameInfo:{Version:643},Player:{},World:[]}).status,'invalid_root');
  const empty={GameInfo:{Version:643},Player:{},World:{}};
  const cmp=compareUnifiedSaveStructures(a,empty);
  assert.equal(cmp.status,'inconclusive');
  assert.equal(cmp.nativeBuildAttested,false);
});

test('SRC-06 comparator permits deep anonymous templates but rejects real map keys',()=>{
  const fields=[
    {path:'/GameInfo',type:'object'}, {path:'/GameInfo/Version',type:'integer'},
    {path:'/Player',type:'object'}, {path:'/World',type:'object'},
    {path:'/World/GridCollection/Grids/{id}/Objects/{id}/ItemID',type:'integer'},
    {path:'/World/Characters[]/LastGiftDate',type:'null,string'},
    {path:'/Player/ListInventories/{id}/CompatibleFurnitureTypes',type:'object'}
  ];
  const summary=schema=>({
    schema:'wand.db05.ingest@1',safeForPublicRepository:false,writerAuthorized:false,
    current:{schemaObserved:schema,rootRequiredFieldsPresent:true,rootRequiredObjectsObserved:true,
      publicWitnesses:fields,otherWitnessCount:200,decoderAndBuildVerified:false,writerAuthorized:false}
  });
  const x=compareRedactedSaveWitnesses(summary(626),summary(643));
  assert.equal(x.domains.find(d=>d.domain==='world').status,'same_observed_witnesses');
  assert.equal(x.domains.find(d=>d.domain==='player').status,'same_observed_witnesses');
  const bad=summary(643);
  bad.current={...bad.current,publicWitnesses:fields.concat({
    path:'/World/GridCollection/Grids/9999/Objects/9999/ItemID',type:'integer'
  })};
  assert.throws(()=>compareRedactedSaveWitnesses(summary(626),bad),/UNRECOGNIZED_PUBLIC_WITNESS_PATH/);
});
