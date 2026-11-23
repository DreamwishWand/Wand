import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nextSaveListWindowLimit,SAVE_LIST_WINDOW_SIZE
} from '../src/lib/save/save-list-scroll.ts';

test('Save list scroll reveals every matching row in bounded increments',()=>{
  assert.equal(SAVE_LIST_WINDOW_SIZE,120);
  const nearEnd={scrollTop:320,clientHeight:400,scrollHeight:800};
  assert.equal(nextSaveListWindowLimit(120,325,nearEnd),240);
  assert.equal(nextSaveListWindowLimit(240,325,nearEnd),325);
  assert.equal(nextSaveListWindowLimit(325,325,nearEnd),325);
  assert.equal(nextSaveListWindowLimit(120,121,nearEnd),121);
  assert.equal(nextSaveListWindowLimit(100,101,nearEnd,100),101);
});

test('Save list scroll does not load rows before the list end',()=>{
  assert.equal(nextSaveListWindowLimit(120,1000,{
    scrollTop:200,clientHeight:400,scrollHeight:900
  }),120);
  assert.equal(nextSaveListWindowLimit(120,1000,{
    scrollTop:0,clientHeight:0,scrollHeight:0
  }),120);
  assert.equal(nextSaveListWindowLimit(120,1000,{
    scrollTop:Number.NaN,clientHeight:400,scrollHeight:800
  }),120);
  assert.equal(nextSaveListWindowLimit(120,1000,{
    scrollTop:300,clientHeight:400,scrollHeight:400
  }),120);
});

test('invalid and empty UI windows cannot cause arbitrary expansion',()=>{
  const end={scrollTop:450,clientHeight:400,scrollHeight:800};
  assert.equal(nextSaveListWindowLimit(120,1000,end,0),120);
  assert.equal(nextSaveListWindowLimit(120,-1,end),120);
  assert.equal(nextSaveListWindowLimit(120,1000,end,1.5),120);
  assert.equal(nextSaveListWindowLimit(120,0,end),120);
});
