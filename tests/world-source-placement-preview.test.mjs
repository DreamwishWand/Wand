import test from 'node:test';
import assert from 'node:assert/strict';
import {previewSourceCells,previewCellColor,gridLinePath} from '../src/lib/world/source-placement-preview.ts';
const raster={sizeX:3,sizeY:3,nativeFloorValues:new Uint32Array([4,0,4,4,4,4,4,4,4])};
const shape={width:2,height:2,cells:new Uint8Array([1,1,1,0]),acceptedFloorTypesFlag:4};
test('only mapped cells with source floor mismatch or overflow turn red; no inferred game legality',()=>{
  const cells=previewSourceCells(shape,raster,{x:0,y:0});
  assert.deepEqual(cells.map(c=>[c.x,c.y,c.evidence,c.gameStatus]),[
    [0,0,'unknown','unknown'],[1,0,'floor-mismatch','unknown'],[0,1,'unknown','unknown']]);
  assert.deepEqual(cells.map(previewCellColor),['#a7b1bf','#ef5350','#a7b1bf']);
  const edge=previewSourceCells(shape,raster,{x:2,y:2});
  assert.deepEqual(edge.map(c=>c.evidence),['unknown','outside-source-grid','outside-source-grid']);
  const negative=previewSourceCells(shape,raster,{x:-1,y:0});
  assert.deepEqual(negative.map(c=>c.evidence),['outside-source-grid','unknown','outside-source-grid']);
});
test('orientation-specific shape can change without moving origin',()=>{
  const rotated={...shape,cells:new Uint8Array([1,1,0,1])};
  assert.deepEqual(previewSourceCells(rotated,raster,{x:0,y:0}).map(c=>[c.x,c.y]),[[0,0],[1,0],[1,1]]);
});
test('grid uses source-cell edges, and palette distinguishes certified replacement',()=>{
  assert.equal(gridLinePath(2,1),'M0 0V1M1 0V1M2 0V1M0 0H2M0 1H2');
  assert.equal(previewCellColor({x:0,y:0,evidence:'unknown',gameStatus:'replacement'}),'#efc23e');
  assert.equal(previewCellColor({x:0,y:0,evidence:'unknown',gameStatus:'normal'}),'#46c781');
});
