import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP_CALIBRATION_SCHEMA,parseMapCalibration,findMapBinding,
  projectGridEdge,imagePixelToGridCell,matchesMapImage}
  from '../src/lib/world/media-map-calibration.ts';
const identity={layoutId:'SceneLayouts/Village04/Meadow.json',
  nativeGridId:7,gridDataPath:'GridData/Village04/Meadow.json',sizeX:4,sizeY:3};
const target={platform:'Steam',gameVersion:'1.26.2',regionKey:'Village04'};
const image={filename:'synthetic.webp',sha256:'a'.repeat(64),width:100,height:80};
const make=(matrix=[5,0,0,-5,10,40])=>({schema:MAP_CALIBRATION_SCHEMA,
  ...target,image,grids:[{...identity,gridToImage:matrix}]});
test('original pixel registration supports translation, scale and flipped axes',()=>{
  const cal=parseMapCalibration(make());
  const b=findMapBinding(cal,{...target,...identity});
  assert.ok(b);
  assert.deepEqual(projectGridEdge(b.gridToImage,0,0),{x:10,y:40});
  assert.deepEqual(imagePixelToGridCell(b,12.5,37.5),{x:0,y:0});
  assert.deepEqual(imagePixelToGridCell(b,27.5,27.5),{x:3,y:2});
  assert.equal(imagePixelToGridCell(b,30,32),null);
  assert.equal(imagePixelToGridCell(b,9,35),null);
  assert.equal(matchesMapImage(cal,image),true);
  assert.equal(matchesMapImage(cal,{...image,sha256:'b'.repeat(64)}),false);
  assert.equal(matchesMapImage(cal,{...image,width:99}),false);
});
test('rotated nonuniform calibration uses the inverse of the same matrix',()=>{
  const b=parseMapCalibration(make([0,3,-6,0,40,10])).grids[0];
  const p=projectGridEdge(b.gridToImage,2.5,1.5);
  assert.deepEqual(imagePixelToGridCell(b,p.x,p.y),{x:2,y:1});
});
test('no implicit alignment on version, region, layout, Grid or dimensions mismatch',()=>{
  const cal=parseMapCalibration(make());
  const original={...target,...identity};
  for(const override of [{gameVersion:'1.27.0'},{platform:'Switch'},
    {regionKey:'VillageExpansion01'},{layoutId:'SceneLayouts/Other.json'},
    {nativeGridId:8},{gridDataPath:'GridData/Other.json'},{sizeX:5}]){
    assert.equal(findMapBinding(cal,{...original,...override}),null);
  }
});
test('reject singular transforms, off-image corners, duplicate Grid refs and corrupt image identity',()=>{
  for(const m of [[1,0,1,0,0,0],[5,0,0,5,99,0],[0,0,0,0,0,0],[1,0,0,1,NaN,0]])
    assert.throws(()=>parseMapCalibration(make(m)));
  const duplicate=make();duplicate.grids.push(duplicate.grids[0]);
  assert.throws(()=>parseMapCalibration(duplicate));
  assert.throws(()=>parseMapCalibration({...make(),image:{...image,sha256:'not-a-hash'}}));
});
