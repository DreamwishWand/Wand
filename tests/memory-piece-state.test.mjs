import test from 'node:test';
import assert from 'node:assert/strict';
import {completeMemoryBits,recordedMemoryBits,memoryPieceCount,exactMemoryHit,knownMemoryBits,memoryMaskPixel} from '../src/lib/media/memory-piece-state.ts';
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

test('unknown save progress does not masquerade as a missing manual record',()=>{
  assert.equal(knownMemoryBits(undefined,10,false),0);
  assert.equal(knownMemoryBits(undefined,10,true),null);
  assert.equal(knownMemoryBits({status:'unknown'},10,true),null);
  assert.equal(knownMemoryBits({favorite:true},10,true),null);
  assert.equal(knownMemoryBits({status:'missing'},10,true),0);
  assert.equal(knownMemoryBits({status:'owned'},10,true),1023);
  assert.equal(knownMemoryBits({memoryPieces:0},10,true),0);
  assert.equal(knownMemoryBits({memoryPieces:513},10,true),513);
});
test('letterboxed pointer hits select exact original-resolution mask pixels',()=>{
  const rect={left:10,top:20,width:200,height:200};
  assert.deepEqual(memoryMaskPixel(110,120,rect,512,256,1024,512),{x:512,y:256});
  assert.deepEqual(memoryMaskPixel(10,70,rect,512,256,1024,512),{x:0,y:0});
  assert.equal(memoryMaskPixel(110,69,rect,512,256,1024,512),null);
  assert.equal(memoryMaskPixel(210,120,rect,512,256,1024,512),null);
  assert.equal(memoryMaskPixel(110,170,rect,512,256,1024,512),null);
  assert.deepEqual(memoryMaskPixel(110,120,rect,256,512,512,1024),{x:256,y:512});
});
