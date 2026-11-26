import test from 'node:test';
import assert from 'node:assert/strict';
import {completeMemoryBits,recordedMemoryBits,memoryPieceCount,exactMemoryHit} from '../src/lib/media/memory-piece-state.ts';
test('manual zero and partial states, legacy whole-memory status and completion',()=>{
  assert.equal(recordedMemoryBits(undefined,10),0);
  assert.equal(recordedMemoryBits({status:'owned'},10),1023);
  assert.equal(recordedMemoryBits({status:'missing',memoryPieces:513},10),513);
  assert.equal(recordedMemoryBits({status:'missing',memoryPieces:0},10),0);
  assert.equal(memoryPieceCount(513),2);
  assert.equal(completeMemoryBits(10),1023);
  assert.throws(()=>completeMemoryBits(11));
});
test('exact hit supports high green-channel pieces, excludes seams and nonopaque pixels',()=>{
  assert.equal(exactMemoryHit([1,0,0,255],10),1);
  assert.equal(exactMemoryHit([0,2,0,255],10),512);
  for(const pixel of [[3,0,0,255],[0,0,0,255],[1,0,1,255],[1,0,0,254],[0,4,0,255]])
    assert.equal(exactMemoryHit(pixel,10),null);
  assert.equal(exactMemoryHit([0,2,0,255],3),null);
});
