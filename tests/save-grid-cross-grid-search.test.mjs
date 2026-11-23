import assert from 'node:assert/strict';
import test from 'node:test';
import {searchLocalGridPositions} from '../src/lib/save/grid-cross-grid-search.ts';

const rows=[
  {localOrdinal:1,localGridOrdinal:1,recordKind:'full',
   itemId:'40000001',x:10,y:20,coordinatesObserved:true},
  {localOrdinal:2,localGridOrdinal:1,recordKind:'full',
   itemId:'40000002',x:10,y:20,coordinatesObserved:true},
  {localOrdinal:3,localGridOrdinal:2,recordKind:'full',
   itemId:'600066777',x:10,y:20,coordinatesObserved:true},
  {localOrdinal:4,localGridOrdinal:3,recordKind:'diff_modified',
   itemId:'30000031',x:-40,y:70,coordinatesObserved:true},
  {localOrdinal:5,localGridOrdinal:3,recordKind:'diff_modified',
   itemId:'600066888',x:null,y:null,coordinatesObserved:false}
];

test('search crosses all local Save Grids but never merges equal coordinates across Grids',()=>{
  const result=searchLocalGridPositions(rows,'10',()=>'',20);
  assert.equal(result.length,0,'only item names, IDs and local ordinals are searchable');
  const byName=searchLocalGridPositions(rows,'pUrE NiGhT',
    id=>id==='30000031'?'Pure Night Shard':'');
  assert.deepEqual(byName,[{
    localGridOrdinal:3,recordKind:'diff_modified',
    x:-40,y:70,ordinals:[4],matchedItemId:'30000031'
  }]);
  const all=searchLocalGridPositions(rows,'0000');
  assert.deepEqual(all.map(hit=>[hit.localGridOrdinal,hit.ordinals]),
    [[1,[1,2]],[3,[4]]],
    'two objects at the same point collapse only INSIDE one Grid');
  const matching=searchLocalGridPositions(rows,'600066777');
  assert.deepEqual(matching,[{
    localGridOrdinal:2,recordKind:'full',
    x:10,y:20,ordinals:[3],matchedItemId:'600066777'
  }]);
});

test('the matched name comes from the matching overlapping object, not the first ordinal',()=>{
  const result=searchLocalGridPositions(rows,'40000002');
  assert.deepEqual(result,[{
    localGridOrdinal:1,recordKind:'full',
    x:10,y:20,ordinals:[1,2],matchedItemId:'40000002'
  }]);
});

test('search local ordinal works across Grids; invalid coordinates remain hidden',()=>{
  assert.deepEqual(searchLocalGridPositions(rows,'#3').map(hit=>hit.ordinals),
    [[3]]);
  assert.deepEqual(searchLocalGridPositions(rows,'#5'),[]);
  assert.deepEqual(searchLocalGridPositions(rows,'#4').map(hit=>hit.localGridOrdinal),
    [3]);
});

test('limited results, empty input and immutable source prevent full-list DOM growth',()=>{
  const original=structuredClone(rows);
  const huge=Array.from({length:270},(_,index)=>({
    ...rows[0],localOrdinal:index+1,localGridOrdinal:1,
    x:index,y:index
  }));
  assert.equal(searchLocalGridPositions(huge,'40000001').length,20);
  assert.equal(searchLocalGridPositions(huge,'40000001',()=>'',9).length,9);
  assert.deepEqual(searchLocalGridPositions(rows,''),[]);
  assert.deepEqual(searchLocalGridPositions(rows,'   '),[]);
  assert.deepEqual(searchLocalGridPositions(rows,'40000001',()=>'',101),[]);
  assert.deepEqual(rows,original,'search may not mutate source projections');
});
