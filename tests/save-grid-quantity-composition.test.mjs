import assert from 'node:assert/strict';
import test from 'node:test';
import {gridEditsForQuantityExport} from '../src/lib/save/grid-combined-queues.ts';
const coordinate={localOrdinal:1,itemId:'40000001',recordKind:'full',
  expectedX:45,expectedY:9,replacementX:66,replacementY:12};
const rotation={localOrdinal:2,itemId:'30000031',recordKind:'diff_modified',
  expectedX:12,expectedY:15,replacementX:null,replacementY:null,
  expectedOrientation:'GridOrientation_Left',
  replacementOrientation:'GridOrientation_Right'};
test('quantity/position composition supports independent one-queue and two-queue sources',()=>{
  assert.deepEqual(gridEditsForQuantityExport([coordinate],[]),[{
    ...coordinate,expectedOrientation:null,replacementOrientation:null
  }]);
  assert.deepEqual(gridEditsForQuantityExport([],[rotation]),[rotation]);
  assert.deepEqual(gridEditsForQuantityExport([coordinate],[rotation]),[
    {...coordinate,expectedOrientation:null,replacementOrientation:null},rotation
  ]);
});
test('joint export merges orientation-only edits for the same local original',()=>{
  assert.deepEqual(gridEditsForQuantityExport([coordinate],[{
    ...rotation,localOrdinal:1,itemId:coordinate.itemId,
    recordKind:coordinate.recordKind,
    expectedX:coordinate.expectedX,expectedY:coordinate.expectedY
  }]),[{
    ...coordinate,
    expectedOrientation:'GridOrientation_Left',
    replacementOrientation:'GridOrientation_Right'
  }]);
});
test('joint export rejects empty, duplicate, competing and over-limit drafts',()=>{
  assert.equal(gridEditsForQuantityExport([],[]),null);
  assert.equal(gridEditsForQuantityExport([coordinate,coordinate],[]),null);
  assert.equal(gridEditsForQuantityExport([],[rotation,rotation]),null);
  assert.equal(gridEditsForQuantityExport([coordinate],[{
    ...rotation,localOrdinal:1,itemId:coordinate.itemId,
    recordKind:coordinate.recordKind,expectedX:coordinate.expectedX,
    expectedY:coordinate.expectedY,replacementX:200,replacementY:50
  }]),null);
  assert.equal(gridEditsForQuantityExport(
    Array.from({length:17},(_,i)=>({...coordinate,localOrdinal:i+1})),[]
  ),null);
});
test('no mutation of caller-owned queued edits',()=>{
  const a=structuredClone(coordinate),b=structuredClone(rotation);
  const result=gridEditsForQuantityExport([coordinate],[rotation]);
  assert.notStrictEqual(result?.[0],coordinate);
  assert.notStrictEqual(result?.[1],rotation);
  assert.deepEqual(coordinate,a);assert.deepEqual(rotation,b);
});
