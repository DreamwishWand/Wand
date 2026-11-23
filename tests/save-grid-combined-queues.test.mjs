import assert from 'node:assert/strict';
import test from 'node:test';
import {combineSavedGridQueues} from '../src/lib/save/grid-combined-queues.ts';

const coordinate={localOrdinal:1,itemId:'40000001',recordKind:'full',
  expectedX:45,expectedY:9,replacementX:52,replacementY:6};
const rotate={localOrdinal:3,itemId:'40000001',recordKind:'diff_modified',
  expectedX:-12,expectedY:8,replacementX:null,replacementY:null,
  expectedOrientation:'GridOrientation_Left',
  replacementOrientation:'GridOrientation_Right'};

test('disjoint coordinate and orientation queues form one immutable Rust mixed plan',()=>{
  const coordinates=[{...coordinate}],mixed=[{...rotate}];
  const before=structuredClone({coordinates,mixed});
  const result=combineSavedGridQueues(coordinates,mixed);
  assert.ok(result);
  assert.equal(result.length,2);
  assert.deepEqual(result[0],{
    ...coordinate,expectedOrientation:null,replacementOrientation:null
  });
  assert.deepEqual(result[1],rotate);
  assert.deepEqual({coordinates,mixed},before);
  result[0].replacementX=999;
  assert.equal(coordinates[0].replacementX,52,
    'returned receipt must never mutate the independently staged queues');
});

test('orientation-only overlap composes on the same original saved ordinal',()=>{
  const same={...rotate,localOrdinal:1,recordKind:'full',
    expectedX:45,expectedY:9};
  const result=combineSavedGridQueues([coordinate],[same]);
  assert.deepEqual(result,[{
    ...coordinate,expectedOrientation:'GridOrientation_Left',
    replacementOrientation:'GridOrientation_Right'
  }]);
});

test('competing destinations and stale original identity fail closed',()=>{
  const competing={...rotate,localOrdinal:1,recordKind:'full',
    expectedX:45,expectedY:9,replacementX:48,replacementY:2};
  assert.equal(combineSavedGridQueues([coordinate],[competing]),null);
  const source={...rotate,localOrdinal:1,recordKind:'full',
    expectedX:45,expectedY:9};
  assert.equal(combineSavedGridQueues([coordinate],[{...source,expectedX:44}]),null);
  assert.equal(combineSavedGridQueues([coordinate],[{...source,itemId:'999'}]),null);
  assert.equal(combineSavedGridQueues([coordinate],[{...source,recordKind:'diff_modified'}]),null);
  assert.equal(combineSavedGridQueues([coordinate],[{
    ...source,expectedOrientation:null,replacementOrientation:null
  }]),null);
});

test('strict unique-target limit and duplicate local ordinals',()=>{
  assert.equal(combineSavedGridQueues([],[rotate]),null);
  assert.equal(combineSavedGridQueues([coordinate],[]),null);
  assert.equal(combineSavedGridQueues([coordinate,coordinate],[rotate]),null);
  assert.equal(combineSavedGridQueues([coordinate],[rotate,rotate]),null);
  assert.equal(combineSavedGridQueues([{
    ...coordinate,localOrdinal:0
  }],[rotate]),null);
  const sixteen=[coordinate,...Array.from({length:15},(_,index)=>({
    ...coordinate,localOrdinal:index+2
  }))];
  assert.equal(combineSavedGridQueues(sixteen,[rotate])?.length,16,
    'a same-ordinal orientation update is a single target');
  assert.equal(combineSavedGridQueues(sixteen,[{...rotate,localOrdinal:17}]),null);
});
