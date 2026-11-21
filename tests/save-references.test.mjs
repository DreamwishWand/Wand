import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLegacySaveFields, getCommonSaveFields, getNativeSaveFields,
  getNestedSaveFields, getDeepSaveFields, getDomainSaveFields,
  getSaveReferenceRelations, probeSaveReferences, compareSaveReferenceProbes
} from '../src/lib/save/registry.mjs';

const canonical = p => p.replace(/\/\{[A-Za-z][A-Za-z0-9]*\}(?=\/|$)/g, '/{id}');
function fixture(version=643) {
  return {
    GameInfo: { Version: version },
    Player: { ContainerInventories: {
      '31': { ID: 31, Inventory: [{ItemID:500, Amount:1}] },
      '32': { ID: 32, Inventory: [] }
    }},
    World: {
      GridCollection: {
        Grids: {
          '0': { ID: 0, Objects: {
            '7': {ID:7, State:{Storage:{ContainerInventoryID:31},SubGrid:{GridID:20}}}
          }},
          '10': { ID: 10, Objects: {
            '8': {ID:8, State:{Storage:{ContainerInventoryID:32},SubGrid:{GridID:0}}}
          }}
        },
        DiffGrids: {
          '20': {ID:20,ModifiedObjects:{
            '9': {ID:9,State:{Storage:{ContainerInventoryID:31},SubGrid:{GridID:10}}}
          }}
        }
      },
      PlayerHouses:[{Floors:[{Rooms:{'1':{FloorGridID:10,WallGridIDs:{'1':0,'2':20}}}}]}],
      BuildingInfos:{'5':{GridIDs:{List:[0,20]}}},
      Villages:[{Areas:{'7':{GridIDs:[0,10,20]}}}],
      FloatingIslands:{'8':{GridIDs:[20,0]}}
    }
  };
}
const ruleById=(result,id)=>result.rules.find(x=>x.id===id);

test('14 native-backed relations use only paths already declared by 440-field registry',()=>{
  const manifest=getSaveReferenceRelations();
  assert.equal(manifest.schema,'wand.db05.save-reference-relations@1');
  assert.equal(manifest.rules.length,14);
  const registered=new Set([
    getLegacySaveFields(),getCommonSaveFields(),getNativeSaveFields(),
    getNestedSaveFields(),getDeepSaveFields(),getDomainSaveFields()
  ].flatMap(s=>s.fields.map(x=>canonical(x.path))));
  assert.equal(registered.size,440);
  assert.ok(manifest.rules.every(x=>registered.has(canonical(x.sourcePublicTemplate))));
  assert.ok(manifest.rules.every(x=>x.targetIndex===null ||
    x.targetIndex==='container' || x.targetIndex==='grid'));
  assert.equal(manifest.policy.writerAuthorized,false);
  assert.equal(manifest.policy.referenceClosureVerified,false);
  assert.equal(Object.isFrozen(manifest.rules[0]),true);
});

test('three valid 626/643 structural classes: 14 read-only observations with zero usable',()=>{
  for(const version of [626,643]) {
    const result=probeSaveReferences(fixture(version));
    assert.equal(result.contract,'wand.db05.save-reference-probe@1');
    assert.equal(result.status,'observed_consistent');
    assert.equal(result.rootValid,true);
    assert.deepEqual(result.indexSizes,{container:2,grid:3});
    assert.equal(result.rules.length,14);
    assert.ok(result.rules.every(x=>x.status==='observed_consistent' && x.observed>0));
    assert.ok(result.rules.every(x=>x.unresolved===0 && x.typeIssues===0));
    assert.equal(ruleById(result,'village_area_to_grid').resolved,3);
    assert.equal(ruleById(result,'house_walls_to_grid').resolved,2);
    assert.equal(ruleById(result,'placed_storage_to_container').resolved,2);
    assert.equal(ruleById(result,'modified_storage_to_container').resolved,1);
    assert.equal(result.platformAndVersionUsedAsGates,false);
    assert.equal(result.referenceClosureVerified,false);
    assert.equal(result.writerAuthorized,false);
    assert.equal(result.exportAuthorized,false);
  }
});

test('missing chest ID, bad storage reference, and grid object key mismatch are distinguished',()=>{
  const doc=fixture();
  delete doc.Player.ContainerInventories['32'].ID;
  doc.World.GridCollection.Grids['10'].Objects['8'].ID=9;
  doc.World.GridCollection.Grids['0'].Objects['7'].State.Storage.ContainerInventoryID=987654321;
  const result=probeSaveReferences(doc);
  assert.equal(result.status,'observed_anomaly');
  const chest=ruleById(result,'container_key_identity');
  assert.equal(chest.missing,1);
  assert.equal(chest.resolved,1);
  assert.equal(chest.unresolved,0);
  assert.equal(chest.status,'insufficient_evidence');
  const object=ruleById(result,'grid_object_key_identity');
  assert.equal(object.unresolved,1);
  assert.equal(object.status,'observed_anomaly');
  const storage=ruleById(result,'placed_storage_to_container');
  assert.equal(storage.unresolved,1);
  assert.equal(storage.resolved,1);
  assert.equal(storage.status,'observed_anomaly');
  const serialized=JSON.stringify(result);
  for(const value of ['987654321','\"8\"','\"32\"']) assert.equal(serialized.includes(value),false);
  assert.equal(result.writerAuthorized,false);
});

test('private textual/numeric map keys and raw field values cannot enter report',()=>{
  const doc=fixture();
  doc.Player.ContainerInventories['PRIVATE_ACCOUNT_42']={ID:42};
  doc.World.GridCollection.Grids['10'].Objects['PRIVATE_OBJECT_17']={
    ID:17,State:{Storage:{ContainerInventoryID:'PRIVATE_SAVE_VALUE'}}
  };
  doc.World.SecretPlayerIdentifier='TOP_SECRET_VALUE';
  const a=JSON.stringify(doc);
  const report=probeSaveReferences(doc);
  assert.equal(JSON.stringify(doc),a);
  assert.equal(report.status,'observed_anomaly');
  const response=JSON.stringify(report);
  for(const secret of ['PRIVATE_ACCOUNT_42','PRIVATE_OBJECT_17','PRIVATE_SAVE_VALUE',
                       'TOP_SECRET_VALUE','SecretPlayerIdentifier']) {
    assert.equal(response.includes(secret),false,secret);
  }
  assert.ok(ruleById(report,'container_key_identity').malformed>0);
  assert.ok(ruleById(report,'grid_object_key_identity').malformed>0);
  assert.ok(ruleById(report,'placed_storage_to_container').malformed>0);
});

test('sample caps yield inconclusive instead of false graph closure',()=>{
  const doc=fixture();
  for(let i=100;i<4300;i++) doc.Player.ContainerInventories[String(i)]={ID:i};
  const report=probeSaveReferences(doc);
  assert.equal(ruleById(report,'container_key_identity').sampled,true);
  assert.equal(ruleById(report,'container_key_identity').status,'sampled_inconclusive');
  assert.equal(report.status,'inconclusive');
  assert.equal(report.exhaustive,false);
  assert.equal(report.referenceClosureVerified,false);
});

test('incomplete target index cannot be counted as unresolved save link',()=>{
  const doc=fixture();
  delete doc.Player.ContainerInventories;
  const report=probeSaveReferences(doc);
  const storage=ruleById(report,'placed_storage_to_container');
  assert.equal(storage.observed,2);
  assert.equal(storage.resolved,0);
  assert.equal(storage.unresolved,0);
  assert.equal(storage.missing,2);
  assert.equal(storage.status,'insufficient_evidence');
  assert.equal(report.status,'inconclusive');
});

test('invalid root returns only a sanitized empty rule set',()=>{
  const out=probeSaveReferences({GameInfo:{Version:643},Player:[],World:{}});
  assert.equal(out.status,'invalid_root');
  assert.equal(out.rootValid,false);
  assert.deepEqual(out.rules,[]);
  assert.equal(out.referenceClosureVerified,false);
});

test('graph comparison reports only deltas, not private IDs or identity equivalence',()=>{
  const before=fixture(626),after=fixture(643);
  const same=compareSaveReferenceProbes(before,after);
  assert.equal(same.status,'same_observed_counts');
  assert.ok(same.changes.every(x=>x.status==='same_observed_counts'));
  assert.equal(same.comparisonBasis,'counts_and_status_only_not_numeric_identity');
  // A different but resolvable target is deliberately undetectable by a
  // privacy-preserving count comparison. 'same' is NOT a compatibility proof.
  after.World.GridCollection.Grids['0'].Objects['7'].State.Storage.ContainerInventoryID=32;
  const changedTarget=compareSaveReferenceProbes(before,after);
  assert.equal(changedTarget.status,'same_observed_counts');
  assert.equal(changedTarget.referenceClosureVerified,false);
  after.World.GridCollection.Grids['0'].Objects['7'].State.Storage.ContainerInventoryID=99999;
  const broken=compareSaveReferenceProbes(before,after);
  assert.equal(broken.status,'observed_anomaly');
  assert.equal(broken.changes.find(x=>x.id==='placed_storage_to_container').unresolvedDelta,1);
  assert.equal(JSON.stringify(broken).includes('99999'),false);
  assert.equal(broken.exportAuthorized,false);
});

test('room and village target types are source graph evidence, not DB-04 item ownership',()=>{
  const input=fixture();
  const result=probeSaveReferences(input);
  for(const id of ['house_floor_to_grid','house_walls_to_grid','building_info_to_grid',
                   'village_area_to_grid','floating_island_to_grid']) {
    assert.equal(ruleById(result,id).status,'observed_consistent');
  }
  assert.equal(result.referenceClosureVerified,false);
  assert.equal(getSaveReferenceRelations().policy.foreignCatalogClosureVerified,false);
});
