import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLegacySaveFields, getCommonSaveFields, getNativeSaveFields,
  getNestedSaveFields, getDeepSaveFields, getDomainSaveFields,
  getUnifiedSaveShapeCatalog, probeUnifiedSaveStructure, compareUnifiedSaveStructures
} from '../src/lib/save/registry.mjs';
import { compareRedactedSaveWitnesses } from '../src/lib/save/redacted-witness.mjs';

const normalize = path => path.replace(/\/\{[A-Za-z][A-Za-z0-9]*\}(?=\/|$)/g,'/{id}');
function syntheticValue(kinds) {
  const kind = kinds[0];
  if (kind === 'null') return null;
  if (kind === 'array') return [];
  if (kind === 'object') return {};
  if (kind === 'integer') return 24;
  if (kind === 'number') return 1.5;
  if (kind === 'string') return 'synthetic';
  if (kind === 'boolean') return false;
  throw new TypeError('BAD_TEST_KIND');
}
function syntheticSave(version=643) {
  const doc={GameInfo:{Version:version},Player:{},World:{}};
  const records=[...getDomainSaveFields().fields].sort((a,b)=>a.path.length-b.path.length);
  for(const field of records){
    const tokens=field.path.slice(1).split('/');
    let node=doc;
    for(let i=0;i<tokens.length;i++){
      const token=tokens[i],last=i===tokens.length-1;
      if(token==='{id}'){
        node['99232']??={};node=node['99232'];
      } else if(token.endsWith('[]')){
        const name=token.slice(0,-2);
        node[name]??=[{}];
        if(!Array.isArray(node[name])) throw Error('ARRAY_SHAPE_CONFLICT');
        if(!node[name].length) node[name].push({});
        node=node[name][0];
      } else if(last){
        node[token]=syntheticValue(field.observedJsonKinds);
      }else{
        node[token]??={};
        if(node[token]===null) node[token]={};
        node=node[token];
      }
    }
  }
  return doc;
}

test('five earlier registries plus the new native domain file contain 440 unique public templates',()=>{
  const sources=[getLegacySaveFields(),getCommonSaveFields(),getNativeSaveFields(),
                 getNestedSaveFields(),getDeepSaveFields(),getDomainSaveFields()];
  assert.deepEqual(sources.map(x=>x.fields.length),[66,16,85,58,83,132]);
  const paths=sources.flatMap(x=>x.fields.map(f=>normalize(f.path)));
  assert.equal(paths.length,440);
  assert.equal(new Set(paths).size,440);
  const catalog=getUnifiedSaveShapeCatalog();
  assert.equal(catalog.publicTemplateCount,440);
  assert.equal(catalog.sourceCounts.nativeDomain,132);
  assert.equal(catalog.compatibilityGate,'decoded_shape_not_build_or_platform');
  assert.equal(catalog.writerAuthorized,false);
});

test('native source identity, exact Protobuf tags, real-save sampling and null limits are recorded',()=>{
  const manifest=getDomainSaveFields();
  assert.equal(manifest.schema,'wand.db05.native1262-domain-fields@1');
  assert.equal(manifest.source.gameBuild,'steam-1.26.2-archived-dump');
  assert.equal(manifest.source.sourceHash,'0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08');
  assert.equal(manifest.source.executableVerified,false);
  assert.deepEqual([
    manifest.fields.filter(f=>f.domain==='player').length,
    manifest.fields.filter(f=>f.domain==='world').length
  ],[40,92]);
  assert.equal(manifest.fields.filter(f=>f.sampledAtLeastOneOriginal).length,77);
  assert.ok(manifest.fields.every(f=>Number.isInteger(f.protobufFieldNumber)&&f.protobufFieldNumber>0));
  assert.ok(manifest.fields.every(f=>f.writable===false && f.observedIn.length===3));
  assert.equal(manifest.policy.writerAuthorized,false);
  assert.equal(Object.isFrozen(manifest.fields[0]),true);
  assert.equal(Object.isFrozen(manifest.fields),true);
});

test('440-field unified probe observes all 132 new structural witnesses on synthetic 626/643 inputs',()=>{
  for(const version of [626,643]){
    const probe=probeUnifiedSaveStructure(syntheticSave(version));
    assert.equal(probe.publicTemplateCount,440);
    const player=probe.domains.find(d=>d.domain==='player');
    const world=probe.domains.find(d=>d.domain==='world');
    assert.ok(player.observedFields.filter(f=>getDomainSaveFields().fields.some(r=>r.path===f.path)).length>=40);
    assert.ok(world.observedFields.filter(f=>getDomainSaveFields().fields.some(r=>r.path===f.path)).length>=92);
    assert.equal(probe.platformAndVersionUsedAsGates,false);
    assert.equal(probe.exhaustive,false);
    assert.equal(probe.writerAuthorized,false);
  }
});

test('a nullable mount expiration is type-set drift, not unsupported ownership state',()=>{
  const old=syntheticSave(626),current=syntheticSave(643);
  old.Player.Mounts[0].GlowExpiration=null;
  current.Player.Mounts[0].GlowExpiration='2026-11-21T00:00:00Z';
  const result=compareUnifiedSaveStructures(old,current);
  const domain=result.domains.find(d=>d.domain==='player');
  assert.ok(domain.changedKindPaths.includes('/Player/Mounts[]/GlowExpiration'));
  assert.equal(domain.conflictingKnownPaths.includes('/Player/Mounts[]/GlowExpiration'),false);
  assert.equal(result.writerAuthorized,false);
  assert.ok(!JSON.stringify(result).includes('2026-11-21'));
});

test('ten null-only observations retain native-derived non-null possibilities without invented evidence',()=>{
  const manifest=getDomainSaveFields();
  const nullable=manifest.fields.filter(f=>
    f.observedJsonKinds.length===1 && f.observedJsonKinds[0]==='null');
  assert.equal(nullable.length,10);
  assert.equal(manifest.evidence.allowedKindExtraIsNativeDerivedNotObserved,true);
  assert.ok(nullable.every(f=>f.allowedJsonKinds.length===2 && f.allowedJsonKinds.includes('null')));
  const property=nullable.find(f=>f.path==='/Player/ContainerInventories/{id}/Inventory[]/State/MealData/SceneRestriction');
  assert.deepEqual(property.observedJsonKinds,['null']);
  assert.deepEqual(property.allowedJsonKinds,['integer','null']);
  const timestamp=nullable.find(f=>f.path==='/World/MissionSlots/{id}/Slots[]/ExpirationTime');
  assert.deepEqual(timestamp.allowedJsonKinds,['null','string']);
  const reward=nullable.find(f=>f.path==='/World/MissionSlots/{id}/Slots[]/RewardPresents');
  assert.deepEqual(reward.allowedJsonKinds,['null','object']);
  const old=syntheticSave(626),next=syntheticSave(643);
  old.Player.ContainerInventories['99232']={Inventory:[{State:{MealData:{SceneRestriction:null}}}]};
  next.Player.ContainerInventories['99232']={Inventory:[{State:{MealData:{SceneRestriction:1}}}]};
  const compared=compareUnifiedSaveStructures(old,next);
  const inventory=compared.domains.find(d=>d.domain==='inventory');
  const player=compared.domains.find(d=>d.domain==='player');
  assert.equal(compared.status==='observed_type_conflict',false);
  assert.ok(player.changedKindPaths.includes(property.path));
});

test('incorrect house flooring and achievement milestone types yield known-only conflicts',()=>{
  const left=syntheticSave(626),right=syntheticSave(643);
  right.World.PlayerHouses[0].Floors[0].Rooms['99232'].Flooring='private';
  right.Player.AchievementsData[0].ClaimedRewardMilestone='wrong';
  const result=compareUnifiedSaveStructures(left,right);
  assert.equal(result.status,'observed_type_conflict');
  assert.ok(result.domains.find(d=>d.domain==='world').conflictingKnownPaths.includes(
    '/World/PlayerHouses[]/Floors[]/Rooms/{id}/Flooring'));
  assert.ok(result.domains.find(d=>d.domain==='player').conflictingKnownPaths.includes(
    '/Player/AchievementsData[]/ClaimedRewardMilestone'));
  assert.ok(!JSON.stringify(result).includes('99232'));
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('missing observed quest slot is not treated as complete save deletion',()=>{
  const a=syntheticSave(626),b=syntheticSave(643);
  delete b.World.MissionSlots['99232'].Slots[0].CurrentStepIndex;
  const result=compareUnifiedSaveStructures(a,b);
  assert.ok(result.domains.find(d=>d.domain==='world').missingKnownPaths.includes(
    '/World/MissionSlots/{id}/Slots[]/CurrentStepIndex'));
  assert.equal(result.strictDecoderVerified,false);
  assert.equal(result.exportAuthorized,false);
});

test('sampled 64-item mount arrays are diagnosed as inconclusive',()=>{
  const a=syntheticSave(626),b=syntheticSave(643);
  b.Player.Mounts=Array.from({length:64},()=>structuredClone(b.Player.Mounts[0]));
  const result=compareUnifiedSaveStructures(a,b);
  assert.equal(result.domains.find(d=>d.domain==='player').status,'sampled_inconclusive');
  assert.equal(result.status,'inconclusive');
  assert.equal(result.exhaustive,false);
});

test('SRC-06 accepts 132 new templates but never real map-key IDs',()=>{
  const common=[{path:'/GameInfo',type:'object'},{path:'/GameInfo/Version',type:'integer'},
    {path:'/Player',type:'object'},{path:'/World',type:'object'},
    {path:'/Player/Mounts[]/MountItemID',type:'integer'},
    {path:'/Player/AchievementsData[]/State',type:'string'},
    {path:'/World/GridCollection/Grids/{id}/Objects/{id}/State/Storage/ContainerInventoryID',type:'integer'}];
  const report=version=>({schema:'wand.db05.ingest@1',safeForPublicRepository:false,
    writerAuthorized:false,current:{schemaObserved:version,publicWitnesses:common,
      rootRequiredFieldsPresent:true,rootRequiredObjectsObserved:true,
      otherWitnessCount:99,decoderAndBuildVerified:false,writerAuthorized:false}});
  const compared=compareRedactedSaveWitnesses(report(626),report(643));
  assert.equal(compared.domains.find(d=>d.domain==='player').status,'same_observed_witnesses');
  assert.equal(compared.domains.find(d=>d.domain==='world').status,'same_observed_witnesses');
  const bad=report(643);
  bad.current={...bad.current,publicWitnesses:[...common,
    {path:'/World/GridCollection/Grids/99232/Objects/2/State/Storage/ContainerInventoryID',type:'integer'}]};
  assert.throws(()=>compareRedactedSaveWitnesses(report(626),bad),/UNRECOGNIZED_PUBLIC_WITNESS_PATH/);
});
