import assert from 'node:assert/strict';
import test from 'node:test';
import {queuedSaveExportMode} from '../src/lib/save/queued-save-export.ts';

test('normal Save export chooses exactly one complete staged target set',()=>{
  assert.equal(queuedSaveExportMode(0,0,0,null,null),'none');
  assert.equal(queuedSaveExportMode(2,0,0,null,null),'quantity');
  assert.equal(queuedSaveExportMode(0,2,0,null,2),'coordinates');
  assert.equal(queuedSaveExportMode(0,0,3,null,3),'mixed');
  assert.equal(queuedSaveExportMode(0,2,1,3,3),'combined');
  assert.equal(queuedSaveExportMode(1,1,0,null,1),'quantity-grid');
  assert.equal(queuedSaveExportMode(3,0,1,null,1),'quantity-grid');
  assert.equal(queuedSaveExportMode(3,2,2,3,3),'quantity-grid');
});
test('conflicting/uncomposable queue cannot silently export a subset',()=>{
  assert.equal(queuedSaveExportMode(1,2,1,null,null),'conflict');
  assert.equal(queuedSaveExportMode(0,2,1,null,null),'conflict');
  assert.equal(queuedSaveExportMode(1,1,0,null,null),'conflict');
  assert.equal(queuedSaveExportMode(0,2,0,null,null),'conflict');
  assert.equal(queuedSaveExportMode(0,0,2,null,null),'conflict');
  assert.equal(queuedSaveExportMode(1,0,1,null,17),'conflict');
  assert.equal(queuedSaveExportMode(0,16,16,17,null),'conflict');
  assert.equal(queuedSaveExportMode(17,0,0,null,null),'conflict');
  assert.equal(queuedSaveExportMode(0,0,-1,null,null),'conflict');
  assert.equal(queuedSaveExportMode(Number.NaN,1,0,null,1),'conflict');
  assert.equal(queuedSaveExportMode(1.5,0,0,null,null),'conflict');
});
test('maximum staged counts require merged native queue <=16',()=>{
  assert.equal(queuedSaveExportMode(16,16,0,null,16),'quantity-grid');
  assert.equal(queuedSaveExportMode(0,16,16,16,16),'combined');
  assert.equal(queuedSaveExportMode(16,16,16,null,16),'quantity-grid');
});
