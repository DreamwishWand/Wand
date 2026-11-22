import assert from 'node:assert/strict';
import test from 'node:test';
import {draftGridGroupQuarterTurn} from '../src/lib/save/grid-group-quarter-turn.ts';

const a={localOrdinal:1,localGridOrdinal:1,itemId:'40000001',
  recordKind:'full',coordinatesObserved:true,x:45,y:9,
  orientation:'GridOrientation_Up'};
const b={localOrdinal:2,localGridOrdinal:1,itemId:'30000031',
  recordKind:'full',coordinatesObserved:true,x:50,y:10,
  orientation:'GridOrientation_Left'};

test('quarter-turn drafts preserve the first saved anchor and turn cardinal orientations',()=>{
  const original=[{...a},{...b}];
  const before=structuredClone(original);
  const cw=draftGridGroupQuarterTurn(original,'clockwise');
  assert.ok(cw);
  assert.deepEqual(cw.map(p=>[
    p.expectedX,p.expectedY,p.replacementX,p.replacementY,
    p.expectedOrientation,p.replacementOrientation
  ]),[
    [45,9,null,null,'GridOrientation_Up','GridOrientation_Right'],
    [50,10,44,14,'GridOrientation_Left','GridOrientation_Up']
  ]);
  const ccw=draftGridGroupQuarterTurn(original,'counterclockwise');
  assert.ok(ccw);
  assert.deepEqual(ccw.map(p=>[
    p.replacementX,p.replacementY,p.replacementOrientation
  ]),[
    [null,null,'GridOrientation_Left'],
    [46,4,'GridOrientation_Down']
  ]);
  assert.deepEqual(original,before,'the candidate engine must not mutate source');
});

test('no unknown orientation, non-positioned object, mixed grid or duplicate is staged',()=>{
  assert.equal(draftGridGroupQuarterTurn([a,{...b,orientation:null}],'clockwise'),null);
  assert.equal(draftGridGroupQuarterTurn([a,{...b,orientation:'Oblique'}],'clockwise'),null);
  assert.equal(draftGridGroupQuarterTurn([a,{...b,coordinatesObserved:false}],'clockwise'),null);
  assert.equal(draftGridGroupQuarterTurn([a,{...b,localGridOrdinal:2}],'clockwise'),null);
  assert.equal(draftGridGroupQuarterTurn([a,{...b,localOrdinal:1}],'clockwise'),null);
  assert.equal(draftGridGroupQuarterTurn([a],'clockwise'),null);
  assert.equal(draftGridGroupQuarterTurn(Array.from({length:17},(_,i)=>({
    ...a,localOrdinal:i+1
  })),'clockwise'),null);
  assert.equal(draftGridGroupQuarterTurn([a,b],'turn-around'),null);
});

test('int32 destination overflow fails closed even though subtraction is JS-safe',()=>{
  const max=2147483647;
  const upper={...a,x:max,y:0};
  const other={...b,x:max,y:-1};
  assert.equal(draftGridGroupQuarterTurn([upper,other],'clockwise'),null);
  assert.ok(draftGridGroupQuarterTurn([upper,other],'counterclockwise'));
  assert.equal(draftGridGroupQuarterTurn(
    [a,{...b,x:max+1}],'clockwise'),null);
  assert.equal(draftGridGroupQuarterTurn(
    [a,{...b,x:1.5}],'clockwise'),null);
});

test('a translated negative coordinate group remains integer-safe and source-local',()=>{
  const p={...a,x:-31,y:-22,orientation:'GridOrientation_Down'};
  const q={...b,x:-30,y:-19,orientation:'GridOrientation_Right'};
  const result=draftGridGroupQuarterTurn([p,q],'clockwise');
  assert.ok(result);
  assert.equal(result[0].replacementOrientation,'GridOrientation_Left');
  assert.deepEqual([result[1].replacementX,result[1].replacementY],[-34,-21]);
  assert.equal(result[1].replacementOrientation,'GridOrientation_Down');
});
