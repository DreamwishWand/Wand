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

import {worldTransformEligible,draftSavedMapTransform} from '../src/lib/world/saved-map-transform.ts';
test('subgrid summary survives the local terrain receipt and blocks unsupported parent edits',()=>{
 const grid=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8'))).grids[0];
 const scopes=[{key:grid.key,witness:{nativeGridId:grid.gridIdNative,nativeSizeX:grid.sizeX,nativeSizeY:grid.sizeY,tessellationFactor:1}}];
 const rows=[{localOrdinal:1,localGridOrdinal:1,itemId:'40000001',recordKind:'full',x:1,y:2,orientation:'GridOrientation_Down',coordinatesObserved:true}];
 const raw={contract:'wand.db05.db04-terrain-session@1',rows,bindings:[{localOrdinal:1,sourceRefIndex:0,savedFactor:1,sourceLocalCoordinateMappingVerified:true,subgrid:{status:'resolved_full',objectCount:3}}],sourceCoverageComplete:false,effectivePlacementVerified:false,worldCoordinatesVerified:false,placementLegalityVerified:false,saveWritingAuthorized:false};
 const receipt=projectTerrainSession(raw,scopes)[0].receipt;
 const definitions=publicShapeDefinitions([[40000001,{SizeX:2,SizeY:1,Layers:[0,16],AcceptedFloorTypesFlag:4}]],[[40000001,'Furniture']],[[40000001,'Table']]);
 const map=buildSavedShapeMap(publicShapeSource(grid,definitions),grid.layoutId,grid.gridIdNative,receipt.points);
 assert.deepEqual(map.objects[0].subgrid,{status:'resolved_full',objectCount:3});
 assert.equal(worldTransformEligible(map.objects[0]),false);
 assert.equal(draftSavedMapTransform(map.objects[0],3,4,'GridOrientation_Down'),null);
 assert.equal(worldTransformEligible({...map.objects[0],subgrid:null}),true);
 assert.throws(()=>projectTerrainSession({...raw,bindings:[{...raw.bindings[0],subgrid:{status:'resolved_full',objectCount:-1}}]},scopes));
});

import {projectNativeEditRestrictions} from '../src/lib/world/native-edit-restrictions.ts';
import {worldMoveEligible,worldRotateEligible} from '../src/lib/world/saved-map-transform.ts';
test('canonical DB01 restrictions are action-specific and never infer conditional permission',()=>{
 const grid=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8'))).grids[0];
 const restrictions={CanMove:{Value:false},CanRotate:{Value:true},CanBeRemoved:{Conditions:{_unresolvedFields:[2]}}};
 assert.deepEqual(projectNativeEditRestrictions(restrictions),{move:'denied',rotate:'allowedFlag',remove:'conditional'});
 const definitions=publicShapeDefinitions([[40000001,{SizeX:2,SizeY:1,Layers:[0,16],AcceptedFloorTypesFlag:4}]],[[40000001,'Furniture']],[[40000001,'Table']],[[40000001,restrictions]]);
 const map=buildSavedShapeMap(publicShapeSource(grid,definitions),grid.layoutId,grid.gridIdNative,[{localOrdinal:1,localGridOrdinal:1,itemId:'40000001',x:1,y:2,orientation:'GridOrientation_Down'}]);
 const o=map.objects[0];
 assert.equal(worldMoveEligible(o),false);
 assert.equal(worldRotateEligible(o),true);
 assert.equal(draftSavedMapTransform(o,3,4,'GridOrientation_Down'),null);
 assert.ok(draftSavedMapTransform(o,1,2,'GridOrientation_Left'));
 assert.equal(worldTransformEligible({...o,editRestrictions:{select:'conditional'}}),false);
 assert.equal(worldRotateEligible({...o,editRestrictions:{rotate:'denied'}}),false);
 assert.deepEqual(projectNativeEditRestrictions({CanMove:{},CanRotate:{Value:true,Conditions:{}}}),{rotate:'conditional'});
});

import {bindMainland,bindMainlandGrid,mainlandExtent,mainlandMapAnchor,mainlandLocalAnchor,mainlandTerrainHits} from '../src/lib/world/mainland-world-coordinates.ts';
test('all eight original mainland GridScript paths resolve exact source origins and reversible anchor transforms',()=>{
 const source=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8'))),grids=bindMainland(source.grids);
 assert.equal(grids.length,8);const meadow=grids.find(g=>g.key==='Meadow');
 assert.deepEqual(meadow.origin.position,[-61,6,-49]);
 assert.deepEqual(mainlandMapAnchor(meadow,4,6),{x:-118,y:92});
 assert.deepEqual(mainlandLocalAnchor(meadow,-118,92),{x:4,y:6});
 const doubled=bindMainlandGrid({...meadow,factor:2});
 assert.deepEqual(mainlandMapAnchor(doubled,9,7),{x:-117.5,y:94.5});
 assert.deepEqual(mainlandLocalAnchor(doubled,-117.5,94.5),{x:9,y:7});
 assert.equal(mainlandLocalAnchor(meadow,-117.5,94.5),null);
 assert.equal(bindMainlandGrid({...meadow,gridDataPath:'GridData/unknown.json'}),null);
 assert.equal(bindMainland(grids.slice(1)),null);
 const extent=mainlandExtent(grids);
 assert(grids.every(g=>g.bounds.x>=extent.x&&g.bounds.y>=extent.y&&g.bounds.x+g.bounds.w<=extent.x+extent.w&&g.bounds.y+g.bounds.h<=extent.y+extent.h));
 const raster={sizeX:meadow.sizeX,sizeY:meadow.sizeY,nativeFloorValues:new Uint32Array(meadow.sizeX*meadow.sizeY)};
 raster.nativeFloorValues[6*meadow.sizeX+4]=4;
 const hit=mainlandTerrainHits([meadow],new Map([[meadow.key,raster]]),-117.75,91.75);assert.equal(hit[0].key,'Meadow');
 assert.deepEqual(mainlandTerrainHits([meadow],new Map([[meadow.key,raster]]),-116.75,91.75),[]);
});

import {composeMainlandDesignFrame,mainlandFrameOffset,resolveMainlandDesign,mainlandItemsValid,validatedMainlandPlan,serializeMainlandDesign,parseMainlandDesign} from '../src/lib/world/mainland-design-frame.ts';
import {emptyDesign,placeDesign,transformDesign,currentDesign,travelDesign} from '../src/lib/world/design-layout.ts';
test('actual mainland terrain resolves two distinct native areas in one local design history and portable file',()=>{
 const bundle=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8')));
 const rasters=new Map(bundle.grids.map(g=>[g.key,{sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:Uint32Array.from(inflateSync(Buffer.from(g.data,'base64')),i=>g.palette[i])}]));
 const f=composeMainlandDesignFrame(bundle.grids,rasters),shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],path:'M0 0h1v1H0Z'};
 const g={itemId:40005160,name:'Fixture',layer:'furniture',surfaceCapable:false,shapes:{'40005160:8':shape}};
 const defs=new Map([[g.itemId,g]]),w=f.raster.sizeX,h=f.raster.sizeY;
 const locations=f.grids.map((grid,i)=>{const index=f.owners.indexOf(i+1);assert(index>=0);return {grid,x:index%w,y:Math.floor(index/w)};});
 const a=locations.find(p=>p.grid.key==='Urban'),b=locations.find(p=>p.grid.key==='Meadow');
 assert.equal(resolveMainlandDesign(f,a.x,a.y,shape).grid.key,'Urban');
 assert.equal(resolveMainlandDesign(f,b.x,b.y,shape).grid.key,'Meadow');
 const blank=f.owners.indexOf(0);assert(blank>=0);assert.equal(resolveMainlandDesign(f,blank%w,Math.floor(blank/w),shape),null);
 const start=emptyDesign(),one=validatedMainlandPlan(f,start,placeDesign(start,g,a.x,a.y,2,w,h),defs);
 assert(one);const moved=validatedMainlandPlan(f,one,transformDesign(one,1,g,b.x,b.y,2,w,h),defs);
 assert(moved);assert.equal(resolveMainlandDesign(f,currentDesign(moved)[0].x,currentDesign(moved)[0].y,shape).grid.key,'Meadow');
 assert.deepEqual(currentDesign(travelDesign(moved,-1)),currentDesign(one));
 const two=validatedMainlandPlan(f,moved,placeDesign(moved,g,a.x,a.y,2,w,h),defs);assert(two);
 assert.deepEqual(parseMainlandDesign(serializeMainlandDesign(f,two,defs),f).sort((a,b)=>a.id-b.id),currentDesign(two));
 assert.equal(validatedMainlandPlan(f,two,placeDesign(two,g,blank%w,Math.floor(blank/w),2,w,h),defs),null);
 const offset=mainlandFrameOffset(f,a.grid);assert.equal(resolveMainlandDesign(f,a.x,a.y,shape).x,a.x-offset.x);
 const boundaryShape={width:2,height:1,cellCount:2,runs:[{x:0,y:0,width:2}],path:'M0 0h2v1H0Z'};
 const modified={...f,owners:f.owners.slice()};modified.owners[a.y*w+a.x+1]=255;
 assert.equal(resolveMainlandDesign(modified,a.x,a.y,boundaryShape),null);
});
