import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRedactedSaveWitnesses } from '../src/lib/save/redacted-witness.mjs';

const root = [
  { path: '/GameInfo', type: 'object' },
  { path: '/GameInfo/Version', type: 'integer' },
  { path: '/Player', type: 'object' },
  { path: '/World', type: 'object' }
];
const paths = [
  {path:'/Player/ListInventories',type:'object'},
  {path:'/Player/ContainerInventories',type:'object'},
  {path:'/Player/ContainerInventories/{containerId}/Inventory[]/Amount',type:'integer'},
  {path:'/Player/CollectionSets',type:'array'},
  {path:'/World/GridCollection/DiffGrids',type:'object'},
  {path:'/Player/AvatarIsMale',type:'boolean'},
  {path:'/World/Characters',type:'array'},
  {path:'/Player/AchievementsData',type:'array'},
  {path:'/Player/Mounts',type:'array'}
];
const summary = (schemaObserved, witnesses = paths) => ({
  schema: 'wand.db05.ingest@1',
  safeForPublicRepository: false,
  writerAuthorized: false,
  current: {
    schemaObserved,
    rootRequiredFieldsPresent: true,
    rootRequiredObjectsObserved: true,
    publicWitnesses: [...root,...witnesses],
    otherWitnessCount: 200,
    decoderAndBuildVerified: false,
    writerAuthorized: false
  },
  // Unknown input metadata must not enter the result.
  privateAccount: 'really-sensitive-user-value'
});

test('version 626 vs 643: equal observed shapes, no platform/build gates', () => {
  const left = summary(626), right = summary(643);
  right.platform = 'Nintendo Switch';
  left.platform = 'Steam';
  const result = compareRedactedSaveWitnesses(left,right);
  assert.equal(result.status,'same_observed_witnesses');
  assert.equal(result.domains.length,8);
  assert.ok(result.domains.every(d=>d.status==='same_observed_witnesses'));
  assert.equal(result.platformAndVersionUsedAsGates,false);
  assert.equal(result.writerAuthorized,false);
  assert.equal(result.complete,false);
  assert.equal(result.strictDecoderVerified,false);
  assert.equal(JSON.stringify(result).includes('really-sensitive-user-value'),false);
  assert.equal(JSON.stringify(result).includes('schemaObserved'),false);
});

test('known chest path type mismatch is explicit structural witness conflict', () => {
  const newer=summary(643,paths.map(v=>v.path.endsWith('/Amount')?{...v,type:'string'}:v));
  const result=compareRedactedSaveWitnesses(summary(626),newer);
  assert.equal(result.status,'observed_type_conflict');
  const chest=result.domains.find(d=>d.domain==='chests');
  assert.equal(chest.status,'observed_type_conflict');
  assert.deepEqual(chest.differingKinds,[{
    path:'/Player/ContainerInventories/{containerId}/Inventory[]/Amount',
    relation:'type_conflict', previousKinds:['integer'],currentKinds:['string']
  }]);
});

test('integer vs number is ambiguous, not proof of incompatible save structure', () => {
  const newer=summary(643,paths.map(v=>v.path.endsWith('/Amount')?{...v,type:'number'}:v));
  const result=compareRedactedSaveWitnesses(summary(626),newer);
  assert.equal(result.status,'inconclusive');
  assert.equal(result.domains.find(d=>d.domain==='chests').differingKinds[0].relation,'numeric_ambiguity');
});

test('unverified lexical kind is inconclusive and never becomes compatible evidence', () => {
  const newer=summary(643,paths.map(v=>v.path.endsWith('/Amount')?{...v,type:'unverified'}:v));
  const result=compareRedactedSaveWitnesses(summary(626),newer);
  assert.equal(result.status,'inconclusive');
  assert.deepEqual(result.domains.find(d=>d.domain==='chests').unknownKindPaths,
    ['/Player/ContainerInventories/{containerId}/Inventory[]/Amount']);
});

test('observed known-path omission is witness drift, not source deletion', () => {
  const newer=summary(643,paths.filter(v=>!v.path.endsWith('/Amount')));
  const result=compareRedactedSaveWitnesses(summary(626),newer);
  assert.equal(result.status,'observed_witness_difference');
  assert.deepEqual(result.domains.find(d=>d.domain==='chests').missingKnownPaths,
    ['/Player/ContainerInventories/{containerId}/Inventory[]/Amount']);
  assert.equal(result.authoritative,false);
});

test('missing root witness report fails structural trust without claiming save corruption', () => {
  const newer=summary(643);newer.current.rootRequiredObjectsObserved=false;
  assert.equal(compareRedactedSaveWitnesses(summary(626),newer).status,'invalid_or_unverified_root');
});

test('reject raw SRC-06 scanner reports and naked field lists', () => {
  const raw={status:'structural_witness',fieldWitnesses:[{path:'/Player/PrivateKey',type:'string'}]};
  assert.throws(()=>compareRedactedSaveWitnesses(raw,summary(643)),/DB05_REDACTED_SUMMARY_REQUIRED/);
  assert.throws(()=>compareRedactedSaveWitnesses(summary(626).current,summary(643)),/DB05_REDACTED_SUMMARY_REQUIRED/);
});

test('reject private keys and even numeric IDs before constructing output', () => {
  const variants=['/Player/PrivateAccount/Secret','/Player/ListInventories/5/Inventory',
    '/Player/ContainerInventories/123/Inventory[]/Amount','/Player/AvatarIsMale/PersonalName'];
  for(const path of variants){
    const tampered=summary(643,[...paths,{path,type:'string'}]);
    assert.throws(()=>compareRedactedSaveWitnesses(summary(626),tampered),e=>{
      assert.equal(e.message,'UNRECOGNIZED_PUBLIC_WITNESS_PATH');
      assert.equal(e.message.includes(path),false);
      return true;
    });
  }
});

test('duplicate fields, excessive witnesses and unknown kinds fail closed', () => {
  const repeated=summary(643,[...paths,paths[0]]);
  assert.throws(()=>compareRedactedSaveWitnesses(summary(626),repeated),/DUPLICATE_PUBLIC_WITNESS_PATH/);
  const huge=summary(643,Array.from({length:100},()=>paths[0]));
  assert.throws(()=>compareRedactedSaveWitnesses(summary(626),huge),/PUBLIC_WITNESS_LIMIT/);
  const invalid=summary(643,paths.map(v=>v.path.endsWith('/Amount')?{...v,type:'secret_type'}:v));
  assert.throws(()=>compareRedactedSaveWitnesses(summary(626),invalid),/INVALID_PUBLIC_WITNESS_KIND/);
});

test('same path with an extra observed kind is a non-authoritative witness difference', () => {
  const newer=summary(643,paths.map(v=>v.path.endsWith('/Amount')?{...v,type:'integer,string'}:v));
  const result=compareRedactedSaveWitnesses(summary(626),newer);
  assert.equal(result.status,'observed_witness_difference');
  assert.equal(result.domains.find(d=>d.domain==='chests').differingKinds[0].relation,'type_set_drift');
  assert.equal(result.ownershipMutationAuthorized,false);
});

test('unobserved domain always remains inconclusive rather than same shape', () => {
  const onlyInventory=[paths[0]];
  const comparison=compareRedactedSaveWitnesses(summary(626,onlyInventory),summary(643,onlyInventory));
  assert.equal(comparison.status,'inconclusive');
  assert.equal(comparison.domains.find(d=>d.domain==='chests').status,'not_observed');
});

test('sensitive source metadata and unrecognized content cannot leak via result', () => {
  const prev=summary(626);prev.current.rawOriginal={accountName:'Private',location:'Secret'};
  const next=summary(643);next.current.otherWitnessCount=9876;
  next.payload='AUniquePrivateMarker';
  const output=JSON.stringify(compareRedactedSaveWitnesses(prev,next));
  for(const secret of ['Private','Secret','9876','AUniquePrivateMarker','really-sensitive-user-value']) {
    assert.ok(!output.includes(secret),secret);
  }
});
