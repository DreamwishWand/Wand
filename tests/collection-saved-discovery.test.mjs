import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_COLLECTION_DISCOVERY_CONTRACT,
  SAVE_COLLECTION_DISCOVERY_IMPORT_SCHEMA,
  projectSavedCollectionDiscovery,
  sanitizeSavedCollectionDiscovery
} from '../src/lib/collection/saved-collection-discovery.mjs';

const save=(groups,version=643)=>({
  GameInfo:{Version:version},
  Player:{CollectionSets:[{
    CollectionDefinitionID:2120000001,
    GroupData:groups.map((items,i)=>({
      GroupIndex:i,State:'secret native group state',
      GroupsCollectionItems:items
    }))
  }]},
  World:{playerSecrets:'never copy'}
});

test('native CollectionSet booleans preserve true and false as discovery, not owned or unlocked',()=>{
  const root=save([
    {'101':true,'102':false,'103':true},
    {'101':true,'104':false}
  ]);
  const before=structuredClone(root);
  const result=projectSavedCollectionDiscovery(root);
  assert.deepEqual(root,before);
  assert.equal(result.contract,SAVE_COLLECTION_DISCOVERY_CONTRACT);
  assert.equal(result.importSchema,SAVE_COLLECTION_DISCOVERY_IMPORT_SCHEMA);
  assert.equal(result.status,'observed_boolean_discovery');
  assert.equal(result.saveSchema,643);
  assert.equal(result.observedReferences,5);
  assert.equal(result.ambiguousItemIds,0);
  assert.equal(result.semantic,'collection_discovery_history_not_ownership');
  assert.equal(result.ownershipVerified,false);
  assert.deepEqual(result.entries,[
    {itemId:101,discovered:true},
    {itemId:102,discovered:false},
    {itemId:103,discovered:true},
    {itemId:104,discovered:false}
  ]);
  assert.ok(Object.isFrozen(result.entries));
  assert.deepEqual(sanitizeSavedCollectionDiscovery(structuredClone(result)),result);
  const serialized=JSON.stringify(result);
  assert.ok(!serialized.includes('secret'));
  assert.ok(!serialized.includes('CollectionDefinitionID'));
  assert.ok(!serialized.includes('GroupIndex'));
});

test('cross-category contradictory discovery booleans never overwrite manual state',()=>{
  // Historical native v1.24.13 profile includes exactly such disagreement.
  const result=projectSavedCollectionDiscovery(save([
    {'40003256':true,'40006110':false},
    {'40003256':false,'40006110':false},
    {'40003256':true,'40005160':true}
  ]));
  assert.equal(result.status,'partial_inconclusive');
  assert.equal(result.ambiguousItemIds,1);
  assert.deepEqual(result.entries,[
    {itemId:40005160,discovered:true},
    {itemId:40006110,discovered:false}
  ]);
  assert.deepEqual(sanitizeSavedCollectionDiscovery(result),result);
});

test('non-boolean values and malformed keys never produce a known discovery value',()=>{
  const result=projectSavedCollectionDiscovery(save([
    {'101':false,'102':null,'103':1,'0104':true},
    {'102':true,'103':false,'105':'true','106':{private:'no'}}
  ]));
  assert.equal(result.status,'partial_inconclusive');
  assert.deepEqual(result.entries,[{itemId:101,discovered:false}]);
  assert.equal(result.invalidReferences,5);
  assert.equal(result.ambiguousItemIds,2);
  assert.equal(sanitizeSavedCollectionDiscovery(result).status,'partial_inconclusive');
});

test('missing, empty or unrecognized save schema never resets manual records',()=>{
  const empty=projectSavedCollectionDiscovery(save([]));
  assert.equal(empty.status,'observed_empty');
  assert.deepEqual(empty.entries,[]);
  const missing=projectSavedCollectionDiscovery({GameInfo:{Version:643},Player:{},World:{}});
  assert.equal(missing.status,'not_observed');
  assert.deepEqual(missing.entries,[]);
  const newer=projectSavedCollectionDiscovery(save([{'101':true}],644));
  assert.equal(newer.status,'unsupported_schema');
  assert.deepEqual(newer.entries,[]);
  const legacy=projectSavedCollectionDiscovery(save([{'101':false}],624));
  assert.equal(legacy.status,'observed_boolean_discovery');
  assert.deepEqual(legacy.entries,[{itemId:101,discovered:false}]);
  for(const result of [empty,missing,newer,legacy])
    assert.deepEqual(sanitizeSavedCollectionDiscovery(result),result);
});

test('Worker projection sanitizer rejects ambiguous, forged or private rows',()=>{
  const good=structuredClone(projectSavedCollectionDiscovery(save([{'101':true,'102':false}])));
  good.sensitive='private';
  const clean=sanitizeSavedCollectionDiscovery(good);
  assert.ok(!Object.hasOwn(clean,'sensitive'));
  const forged=structuredClone(good);
  forged.entries[0].private='data';
  assert.throws(()=>sanitizeSavedCollectionDiscovery(forged),/PROJECTION_INVALID/);
  const duplicate=structuredClone(good);
  duplicate.entries[1].itemId=101;
  assert.throws(()=>sanitizeSavedCollectionDiscovery(duplicate),/PROJECTION_INVALID/);
  const nonBoolean=structuredClone(good);
  nonBoolean.entries[0].discovered='owned';
  assert.throws(()=>sanitizeSavedCollectionDiscovery(nonBoolean),/PROJECTION_INVALID/);
  const schema=structuredClone(good);
  schema.saveSchema=999;
  assert.throws(()=>sanitizeSavedCollectionDiscovery(schema),/PROJECTION_INVALID/);
  const counterfeit=structuredClone(good);
  counterfeit.ownershipVerified=true;
  assert.throws(()=>sanitizeSavedCollectionDiscovery(counterfeit),/PROJECTION_INVALID/);
  const wrongCount=structuredClone(good);
  wrongCount.observedReferences=1;
  assert.throws(()=>sanitizeSavedCollectionDiscovery(wrongCount),/PROJECTION_INVALID/);
});
