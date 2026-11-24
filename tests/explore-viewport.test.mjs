import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogGridLayout,GRID_GAP,WINDOW_ROWS,catalogPrefix} from '../src/lib/explore/viewport-grid.ts';
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

test('one global reveal budget crosses universe boundaries without preloading later sections',()=>{
 const sections=[['a',[1,2,3]],['b',[4,5,6,7]],['c',Array.from({length:9000},(_,i)=>i+8)]];
 assert.deepEqual(catalogPrefix(sections,2),[['a',[1,2]]]);
 assert.deepEqual(catalogPrefix(sections,5),[['a',[1,2,3]],['b',[4,5]]]);
 assert.deepEqual(catalogPrefix(sections,8),[['a',[1,2,3]],['b',[4,5,6,7]],['c',[8]]]);
 assert.equal(catalogPrefix(sections,0).length,0);
 assert.equal(catalogPrefix(sections,10000).flatMap(([,items])=>items).length,9007);
});
