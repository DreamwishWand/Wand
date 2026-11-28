import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeDesignViewport} from '../src/lib/world/native-design-viewport.ts';
import {readFileSync} from 'node:fs';
import {bindNativeCalibrationGrids,nativeCalibrationScope,nativeUnderwaterDesignGrid,bindIndependentEditorGrid} from '../src/lib/world/native-calibration-grids.ts';
const {grids}=JSON.parse(readFileSync(new URL('../static/ddv/world/steam-1.26.2/villageexpansion04underwaterareas.json',import.meta.url),'utf8'));
test('all twelve source grids bind to exactly three separate native map planes',()=>{
 const cases=[
  ['MapVillageExpansion4Underwater02',[9,5,6,8],65915,[-107,-102,241,198]],
  ['MapVillageExpansion4Underwater03',[0,3,2,1],62140,[-8,-87,225,180]],
  ['MapVillageExpansion4Underwater04',[3,1,0,2],41546,[-8,-33,223,122]]
 ];
 const seen=new Set();
 for(const [id,ids,cellCount,bounds] of cases){
  assert.equal(nativeCalibrationScope(id),'VillageExpansion04UnderwaterAreas');
  const bound=bindNativeCalibrationGrids(id,grids);
  assert.ok(bound);
  assert.deepEqual(bound.map(g=>g.gridIdNative),ids);
  assert.equal(bound.reduce((n,g)=>n+g.sizeX*g.sizeY,0),cellCount);
  const b=bound[0].bounds;assert.deepEqual([b.x,b.y,b.w,b.h],bounds);
  for(const g of bound){assert.ok(!seen.has(g.key));seen.add(g.key);}
  const corrupt=grids.map(g=>g.key===bound[0].key?{...g,sizeX:g.sizeX+1}:g);
  assert.equal(bindNativeCalibrationGrids(id,corrupt),null);
  assert.equal(bindNativeCalibrationGrids(id,grids.filter(g=>g.key!==bound[0].key)),null);
 }
 assert.equal(seen.size,12);
 assert.equal(nativeCalibrationScope('MapVillageExpansion4Underwater01'),null);
 assert.equal(bindNativeCalibrationGrids('MapVillageExpansion4Underwater01',grids),null);
});

test('individual underwater design area maps only to its own scene and original north-up bounds',()=>{
 for(const g of grids){
  const binding=nativeUnderwaterDesignGrid(g);
  assert.ok(binding);
  const source=bindNativeCalibrationGrids(binding.mapId,grids);
  assert.deepEqual(binding.grid,source.find(row=>row.key===g.key));
  const {bounds}=binding.grid;
  const frame={minX:bounds.x,minZ:-bounds.y-bounds.h,raster:{sizeX:g.sizeX,sizeY:g.sizeY}};
  assert.deepEqual(nativeDesignViewport(frame,{x:0,y:0,w:g.sizeX,h:g.sizeY}),bounds);
  assert.deepEqual(nativeDesignViewport(frame,{x:2,y:3,w:5,h:6}),{x:bounds.x+2,y:bounds.y+3,w:5,h:6});
  for(const invalid of [{...g,factor:2},{...g,sizeX:g.sizeX+1},{...g,gridDataPath:g.gridDataPath+'x'},{...g,key:g.key+'x'}])
   assert.equal(nativeUnderwaterDesignGrid(invalid),null);
 }
 assert.equal(nativeUnderwaterDesignGrid(null),null);
 assert.equal(nativeUnderwaterDesignGrid({...grids[0],layoutId:'SceneLayouts/OffGridBuildings/Expansion04/UnderwaterTutorial/UnderwaterTutorial-DefaultLayout.json'}),null);
});

test('all exact underwater grids can open the existing independent Save overview without merging planes',()=>{
 for(const g of grids){
  assert.deepEqual(bindIndependentEditorGrid(g),nativeUnderwaterDesignGrid(g).grid);
  assert.equal(bindIndependentEditorGrid({...g,sizeX:g.sizeX+1}),null);
  assert.equal(bindIndependentEditorGrid({...g,layoutId:'SceneLayouts/OffGridBuildings/Expansion04/UnderwaterTutorial/UnderwaterTutorial-DefaultLayout.json'}),null);
 }
});
