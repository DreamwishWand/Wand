import test from 'node:test';
import assert from 'node:assert/strict';
import {collectWindow} from '../src/lib/ui/collect-window.mjs';

test('multiple safe sub-100 requests append an exact, ordered visible window',()=>{
  const records=Array.from({length:257},(_,id)=>({id}));
  const batches=[];
  const fetch=(offset,limit)=>{
    batches.push({offset,limit});
    assert.ok(limit<=100);
    return {total:records.length,rows:records.slice(offset,offset+limit)};
  };
  const first=collectWindow(fetch,40);
  assert.equal(first.rows.length,40);
  assert.equal(first.total,257);
  assert.equal(first.nextOffset,40);
  const next=collectWindow(fetch,145);
  assert.deepEqual(next.rows.map(x=>x.id),Array.from({length:145},(_,i)=>i));
  assert.equal(next.nextOffset,145);
  const all=collectWindow(fetch,1000);
  assert.deepEqual(all.rows,records);
  assert.equal(all.nextOffset,null);
  assert.deepEqual(batches.filter(x=>x.offset===100),[{offset:100,limit:45},{offset:100,limit:100}]);
});

test('works for private Guide result field without source pagination relaxation',()=>{
  const data=Array.from({length:231},(_,i)=>({id:String(i+1)}));
  const out=collectWindow((offset,limit)=>({
    total:data.length,results:data.slice(offset,offset+limit)
  }),222,'results',40);
  assert.equal(out.results.length,222);
  assert.equal(out.nextOffset,222);
  assert.deepEqual(out.results.map(x=>x.id),data.slice(0,222).map(x=>x.id));
});

test('rejects invalid page sizes and inconsistent source totals',()=>{
  assert.throws(()=>collectWindow(()=>({total:2,rows:[]}),0),/WAND_WINDOW_INVALID/);
  assert.throws(()=>collectWindow(()=>({total:2,rows:[]}),10),/WAND_WINDOW_PAGE_INVALID/);
  assert.throws(()=>collectWindow(()=>({total:4,rows:[1,2,3,4,5]}),4,'rows',4),/WAND_WINDOW_PAGE_INVALID/);
  assert.throws(()=>collectWindow((offset,limit)=>({
    total:offset===0?150:151,rows:Array.from({length:limit},(_,i)=>offset+i)
  }),140),/WAND_WINDOW_PAGE_INVALID/);
});
