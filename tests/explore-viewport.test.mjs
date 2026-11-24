import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogGridLayout,GRID_GAP,WINDOW_ROWS} from '../src/lib/explore/viewport-grid.ts';
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
test('all section height is known without revealing preceding cards',()=>{
 const sizes=[57,2200,8000];
 const grids=sizes.map(n=>catalogGridLayout(1280,n));
 assert.equal(grids.reduce((sum,g)=>sum+g.chunks.reduce((n,c)=>n+c.end-c.start,0),0),sizes.reduce((a,b)=>a+b,0));
 const last=grids[2].chunks.at(-1);
 assert.equal(last.end,8000);
 assert.ok(grids[2].height>50000);
});
