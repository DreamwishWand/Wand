import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVED_GRID_REFERENCES_CONTRACT,
  projectSavedGridFurnitureReferences,
  sanitizeSavedGridFurnitureReferences
} from '../src/lib/collection/saved-grid-furniture-references.mjs';

const save=(grid,version=643)=>({
  GameInfo:{Version:version},Player:{Private:'not exposed'},
  World:{GridCollection:grid,PrivateCoords:'not copied'}
});
const obj=(id,itemID)=>({
  ID:id,ItemID:itemID,X:123.5,Y:45,State:{PrivateItemName:'not copied'},
  From:'world-origin-not-player-proof'
});
const check=x=>assert.deepEqual(sanitizeSavedGridFurnitureReferences(
  structuredClone(x)),x);

test('full-grid furniture references are distinct from current ListInventory stock and unlocks',()=>{
  const source=save({Grids:{
    '3':{ID:3,Objects:{
      '1':obj(1,40005160),
      '2':obj(2,40005160),
      '3':obj(3,40006110),
      '4':obj(4,50000001), // clothing item: not furniture
    }}
  }});
  const cloned=structuredClone(source);
  const result=projectSavedGridFurnitureReferences(source);
  assert.deepEqual(source,cloned);
  assert.equal(result.contract,SAVED_GRID_REFERENCES_CONTRACT);
  assert.equal(result.status,'saved_furniture_references');
  assert.equal(result.observedFullGrids,1);
  assert.equal(result.observedDiffGrids,0);
  assert.equal(result.fullReferences,3);
  assert.equal(result.diffModifiedReferences,0);
  assert.deepEqual(result.entries,[
    {itemId:40005160,fullGridReferences:2,diffModifiedReferences:0},
    {itemId:40006110,fullGridReferences:1,diffModifiedReferences:0}
  ]);
  assert.equal(result.playerPlacementVerified,false);
  assert.equal(result.ownershipOrUnlockInferred,false);
  assert.equal(result.fullEffectivePlacedCountVerified,false);
  assert.equal(result.defaultWorldGridJoined,false);
  assert.equal(result.stockQuantityAdjusted,false);
  const serialized=JSON.stringify(result);
  for(const secret of ['not exposed','not copied','PrivateCoords','world-origin',
    '"X"','"Y"','"State"','"From"','"ID"'])assert.ok(!serialized.includes(secret),secret);
  check(result);
});

test('DiffGrid modified entries removed in overlay are excluded regardless of ItemID',()=>{
  const result=projectSavedGridFurnitureReferences(save({
    Grids:{'3':{ID:3,Objects:{'1':obj(1,40005160)}}},
    DiffGrids:{
      '6':{ID:6,RemovedObjects:[5,7],ModifiedObjects:{
        '5':obj(5,40009000),// stale: not currently active
        '6':obj(6,40005160), // surviving modified reference
        '7':obj(7,40009001),// stale even though valid object
        '8':obj(8,40006110)
      }}
    }
  }));
  assert.equal(result.status,'saved_furniture_references');
  assert.equal(result.fullReferences,1);
  assert.equal(result.diffModifiedReferences,2);
  assert.deepEqual(result.entries,[
    {itemId:40005160,fullGridReferences:1,diffModifiedReferences:1},
    {itemId:40006110,fullGridReferences:0,diffModifiedReferences:1}
  ]);
  assert.equal(result.observedDiffGrids,1);
  check(result);
});

test('DiffGrid-only data is not treated as the complete effective layout',()=>{
  const result=projectSavedGridFurnitureReferences(save({
    DiffGrids:{'42':{ID:42,ModifiedObjects:{'1':obj(1,40005160)}}}
  },624));
  assert.equal(result.status,'saved_furniture_references');
  assert.equal(result.fullReferences,0);
  assert.equal(result.diffModifiedReferences,1);
  assert.equal(result.fullEffectivePlacedCountVerified,false);
  check(result);
});

test('unsupported removal representation excludes entire diff grid instead of fabricating active placements',()=>{
  const result=projectSavedGridFurnitureReferences(save({
    DiffGrids:{'9':{ID:9,RemovedObjects:['5'],ModifiedObjects:{
      '5':obj(5,40005160),'6':obj(6,40006110)
    }}}
  }));
  assert.equal(result.status,'partial_inconclusive');
  assert.equal(result.observedDiffGrids,0);
  assert.equal(result.invalidRecords,1);
  assert.deepEqual(result.entries,[]);
  check(result);
});

test('wrong object identity and full/diff grid identity collisions do not double count',()=>{
  const result=projectSavedGridFurnitureReferences(save({
    Grids:{'1':{ID:1,Objects:{'2':obj(9,40005160),'3':obj(3,40006110)}}},
    DiffGrids:{'1':{ID:1,ModifiedObjects:{'4':obj(4,40005160)}}}
  }));
  assert.equal(result.status,'partial_inconclusive');
  assert.equal(result.invalidRecords,2);
  assert.equal(result.fullReferences,1);
  assert.deepEqual(result.entries,[{itemId:40006110,fullGridReferences:1,diffModifiedReferences:0}]);
  check(result);
});

test('missing, unknown and invalid grid data never become an unowned-state inference',()=>{
  const inputs=[
    [{GameInfo:{Version:643},World:{},Player:{}},'not_observed'],
    [save({Grids:{},DiffGrids:{}}),'observed_no_furniture_refs'],
    [save({Grids:'bad-map'}),'partial_inconclusive'],
    [save({Grids:{'1':{ID:1,Objects:{'2':obj(2,40005160)}}}},999),'unsupported_schema']
  ];
  for(const [source,status] of inputs){
    const result=projectSavedGridFurnitureReferences(source);
    assert.equal(result.status,status);
    assert.equal(result.ownershipOrUnlockInferred,false);
    check(result);
  }
});

test('main-thread sanitizer rejects forged ownership claims, raw coordinates and impossible references',()=>{
  const base=projectSavedGridFurnitureReferences(save({
    Grids:{'1':{ID:1,Objects:{'2':obj(2,40005160)}}}
  }));
  const decorated=structuredClone(base);
  decorated.PrivatePlayer='secret';
  const clean=sanitizeSavedGridFurnitureReferences(decorated);
  assert.ok(!Object.hasOwn(clean,'PrivatePlayer'));
  for(const edit of [
    x=>{x.entries[0].X=1;},
    x=>{x.entries[0].itemId=50000001;},
    x=>{x.entries[0].fullGridReferences=200;},
    x=>{x.fullReferences=0;},
    x=>{x.ownershipOrUnlockInferred=true;},
    x=>{x.fullEffectivePlacedCountVerified=true;},
    x=>{x.status='observed_no_furniture_refs';},
    x=>{x.saveSchema=999;},
    x=>{x.entries.push({...x.entries[0]});}
  ]){
    const forged=structuredClone(base);
    edit(forged);
    assert.throws(()=>sanitizeSavedGridFurnitureReferences(forged),
      /SAVED_GRID_REFERENCES_INVALID_WORKER_REPLY/);
  }
});
