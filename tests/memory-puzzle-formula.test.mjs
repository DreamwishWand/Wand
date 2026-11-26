import test from 'node:test';
import assert from 'node:assert/strict';
import {puzzleMaskValue,puzzleFragment} from '../src/lib/media/memory-puzzle-formula.ts';
test('native mask arithmetic uses both bytes and truncation, including multi-bit regions',()=>{
  assert.equal(puzzleMaskValue(3/255,2/255),515);
  assert.equal(puzzleMaskValue(1.9/255,0),1);
  for(let r=0;r<=255;r++)for(let g=0;g<=3;g++)
    assert.equal(puzzleMaskValue(r/255,g/255),r|(g<<8));
});
test('native fragment blends contour and retains alpha above one before framebuffer clamp',()=>{
  const tex=[1,0,.5],tint=[0,1,.5];
  assert.deepEqual(puzzleFragment(3/255,0,1,2,tex,tint,1),[1,0,.5,1]);
  assert.deepEqual(puzzleFragment(3/255,0,1,4,tex,tint,1),[1,0,.5,0]);
  assert.deepEqual(puzzleFragment(3/255,0,0,1,tex,tint,1),[0,1,.5,2]);
  assert.deepEqual(puzzleFragment(0,2/255,.25,512,tex,tint,.5),[.25,.75,.5,.875]);
  assert.throws(()=>puzzleFragment(0,0,1,-1,tex,tint,1));
});
