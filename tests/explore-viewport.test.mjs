import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogGridLayout,GRID_GAP,WINDOW_ROWS,seriesBlockSpan} from '../src/lib/explore/viewport-grid.ts';
test('window geometry preserves every item and total scroll height at desktop, board and phone widths',()=>{
 for(const width of [320,480,800,1280,1920])for(const count of [0,1,2,57,2200,8000]){
  const l=catalogGridLayout(width,count,width<600?78:94);
  assert.equal(l.chunks.reduce((n,c)=>n+c.end-c.start,0),count);
  for(let i=0;i<l.chunks.length;i++){
    const c=l.chunks[i];assert.equal(c.start,i?l.chunks[i-1].end:0);assert.ok(c.end-c.start<=l.columns*WINDOW_ROWS);
  }
  const height=l.chunks.reduce((n,c)=>n+c.height,0)+Math.max(0,l.chunks.length-1)*GRID_GAP;
  assert.ok(Math.abs(height-l.height)<1e-7);
 }
 assert.deepEqual(catalogGridLayout(0,8000).chunks,[]);
});

test('series span is compact, ordered and bounded by available columns',()=>{
  assert.deepEqual([1,2,3,5,12,13,24,25,120].map(n=>seriesBlockSpan(n,12)),[2,2,3,5,12,7,12,12,12]);
  assert.deepEqual([1,2,3,5,9].map(n=>seriesBlockSpan(n,4)),[2,2,3,3,4]);
  assert.equal(seriesBlockSpan(5,1),1);
  for(const width of [320,800,1280])for(const span of [1,2,3])assert.equal(catalogGridLayout(width,10,94,span).columns,span);
});
