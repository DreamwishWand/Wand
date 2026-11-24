import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {inflateSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {parsePublicTerrainBundle,publicShapeDefinitions,publicShapeSource} from '../src/lib/world/public-terrain-projection.ts';
import {buildSavedShapeMap} from '../src/lib/world/saved-shape-map.ts';
const path=new URL('../static/ddv/world/steam-1.26.2/village04.json',import.meta.url);
test('all 8 actual mainland rasters match decoded SHA and palette counts',()=>{
 const bundle=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8')));
 assert.equal(bundle.grids.length,8);let total=0;
 for(const g of bundle.grids){const b=inflateSync(Buffer.from(g.data,'base64'));assert.equal(b.length,g.sizeX*g.sizeY);
  assert.equal(createHash('sha256').update(b).digest('hex'),g.sha256);const c=g.palette.map(()=>0);
  for(const i of b){assert.ok(i<c.length);c[i]++;}assert.deepEqual(c,g.counts);total+=b.length;}
 assert.equal(total,412868);
});
test('public DB01 geometry uses canonical fields and no fallback shape for missing fields',()=>{
 const objects=publicShapeDefinitions([[40000001,{SizeX:2,SizeY:1,Layers:[0,16],AcceptedFloorTypesFlag:4}],[40000002,{SizeX:2,SizeY:1,Layers:[16]}]],[[40000001,'Furniture'],[40000002,'Furniture']],[[40000001,'Table']]);
 const grid=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8'))).grids[0];
 const map=buildSavedShapeMap(publicShapeSource(grid,objects),grid.layoutId,grid.gridIdNative,[{localOrdinal:1,localGridOrdinal:1,itemId:'40000001',x:0,y:1,orientation:'GridOrientation_Down'},{localOrdinal:2,localGridOrdinal:1,itemId:'40000002',x:3,y:1,orientation:'GridOrientation_Down'}]);
 assert.equal(map.shapes['40000001:8'].cellCount,2);assert.equal(map.objects[0].name,'Table');assert.equal(map.objects[1].shapeKey,null);
 assert.equal(map.savedSourceCoordinateEquivalenceVerified,false);
});

import {terrainFloorAt,terrainWarnings,projectTerrainSession} from '../src/lib/world/terrain-binding.ts';
test('native factor mapping and per-cell outside/mismatched floor evidence',()=>{
 const t={raster:{sizeX:2,sizeY:2,nativeFloorValues:Uint32Array.from([4,512,4,4])},factor:2,verifiedGridOrdinals:[1]};
 assert.equal(terrainFloorAt(t,1,0),4);assert.equal(terrainFloorAt(t,2,0),512);
 assert.equal(terrainFloorAt(t,-1,0),null);assert.equal(terrainFloorAt(t,4,0),null);
 const shape={width:4,height:1,cellCount:4,runs:[{x:0,y:0,width:4}],path:'',acceptedFloorTypesFlag:4};
 assert.deepEqual(terrainWarnings(t,shape,1,0),[{x:2,y:0,width:2,reason:'floor-mismatch'},{x:4,y:0,width:1,reason:'outside'}]);
});
test('one terrain session distributes complete local rows by exact public witness index',()=>{
 const scopes=[{key:'A',witness:{nativeGridId:0,nativeSizeX:10,nativeSizeY:10,tessellationFactor:1}},{key:'B',witness:{nativeGridId:1,nativeSizeX:4,nativeSizeY:4,tessellationFactor:2}}];
 const rows=[{localOrdinal:1,localGridOrdinal:1,itemId:'40005160',recordKind:'full',x:1,y:2,orientation:'GridOrientation_Down',coordinatesObserved:true},{localOrdinal:2,localGridOrdinal:2,itemId:'40005160',recordKind:'full',x:8,y:1,orientation:null,coordinatesObserved:true}];
 const raw={contract:'wand.db05.db04-terrain-session@1',rows,bindings:[{localOrdinal:1,sourceRefIndex:0,savedFactor:1,sourceLocalCoordinateMappingVerified:true},{localOrdinal:2,sourceRefIndex:1,savedFactor:1,sourceLocalCoordinateMappingVerified:false}],sourceCoverageComplete:false,effectivePlacementVerified:false,worldCoordinatesVerified:false,placementLegalityVerified:false,saveWritingAuthorized:false};
 const result=projectTerrainSession(raw,scopes);assert.deepEqual(result[0].verifiedGridOrdinals,[1]);assert.deepEqual(result[1].verifiedGridOrdinals,[]);
 assert.equal(result[1].receipt.outsideSourceNumericEnvelopeCount,1);assert.equal(result[0].receipt.points[0].x,1);
 assert.throws(()=>projectTerrainSession({...raw,bindings:[{...raw.bindings[1],sourceLocalCoordinateMappingVerified:true}]},scopes));
});

import {parsePublicTerrainRelease,sameTerrainGrid} from '../src/lib/world/public-terrain-projection.ts';
test('published world release: every regional digest, raster and scope identity',()=>{
 const releaseRoot=new URL('../static/ddv/world/steam-1.26.2/',import.meta.url);
 const release=parsePublicTerrainRelease(JSON.parse(fs.readFileSync(new URL('index.json',releaseRoot),'utf8')));
 let total=0,count=0;
 for(const entry of release.entries){
  const raw=fs.readFileSync(new URL(entry.path,releaseRoot));
  assert.equal(createHash('sha256').update(raw).digest('hex'),entry.sha256);
  const b=parsePublicTerrainBundle(JSON.parse(raw.toString('utf8')));
  assert.equal(b.grids.length,entry.gridCount);
  for(const [i,g] of b.grids.entries()){
   assert.ok(sameTerrainGrid(g,entry.grids[i]));
   const indices=inflateSync(Buffer.from(g.data,'base64'));
   assert.equal(indices.length,g.sizeX*g.sizeY);
   assert.equal(createHash('sha256').update(indices).digest('hex'),g.sha256);
   const counts=g.palette.map(()=>0);
   for(const index of indices){assert.ok(index<counts.length);counts[index]++;}
   assert.deepEqual(counts,g.counts);total+=indices.length;count++;
  }
 }
 assert.equal(count,207);assert.equal(total,2985814);
});
