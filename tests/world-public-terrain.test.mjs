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

import {composeMainlandDesignFrame,mainlandFrameOffset,resolveMainlandDesign,mainlandItemsValid,validatedMainlandPlan,serializeMainlandDesign,parseMainlandDesign,mainlandImportMatches} from '../src/lib/world/mainland-design-frame.ts';
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
 const sourceAreas=new Map(),imported=parseMainlandDesign(serializeMainlandDesign(f,two,defs),f,sourceAreas).sort((a,b)=>a.id-b.id);
 assert.deepEqual(imported,currentDesign(two));assert.equal(mainlandImportMatches(f,imported,defs,sourceAreas),true);
 sourceAreas.set(1,'Urban');assert.equal(mainlandImportMatches(f,imported,defs,sourceAreas),false);
 assert.equal(validatedMainlandPlan(f,two,placeDesign(two,g,blank%w,Math.floor(blank/w),2,w,h),defs),null);
 const offset=mainlandFrameOffset(f,a.grid);assert.equal(resolveMainlandDesign(f,a.x,a.y,shape).x,a.x-offset.x);
 const boundaryShape={width:2,height:1,cellCount:2,runs:[{x:0,y:0,width:2}],path:'M0 0h2v1H0Z'};
 const modified={...f,owners:f.owners.slice()};modified.owners[a.y*w+a.x+1]=255;
 assert.equal(resolveMainlandDesign(modified,a.x,a.y,boundaryShape),null);
});

import {projectMainlandSaved,mainlandSavedAt,mainlandSavedInRect,visibleMainlandSaved,mainlandSavedDraft,mainlandSavedCell,mainlandSavedDraftAtCell,mainlandSavedGroupDraft,mainlandSavedAdvancedDraft,mainlandGroupFactor,mainlandTransferCandidate} from '../src/lib/world/mainland-saved-objects.ts';
test('mainland saved objects preserve exact grid identity, staged coordinates and shape holes',()=>{
 const bundle=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8'))),grids=bindMainland(bundle.grids),g=grids.find(g=>g.key==='Meadow');
 const p={localOrdinal:1,localGridOrdinal:3,itemId:'40005160',x:4,y:6,orientation:'GridOrientation_Down',subgrid:null};
 const shape={width:2,height:2,runs:[{x:0,y:0,width:2},{x:1,y:1,width:1}],cellCount:3,path:'M0 0h2v1H0Z'};
 const o={...p,shapeKey:p.itemId+':8',name:'Fixture',orientationCode:8,layer:'furniture',surfaceCapable:false};
 const m={layoutId:g.layoutId,gridIdNative:g.gridIdNative,gridDataPath:g.gridDataPath,sourceGridFactor:g.factor,objects:[o],shapes:{[o.shapeKey]:shape},actualOccupancyVerified:false,savedSourceCoordinateEquivalenceVerified:false};
 const receipt={viewKey:g.key,points:[p],rowsWithoutCoordinates:0},sessions=[{receipt,verifiedGridOrdinals:[3]}],maps=new Map([[g.key,m]]);
 const a=projectMainlandSaved(grids,sessions,maps,[]);assert.equal(a.objects.length,1);
 const v=a.objects[0];assert.deepEqual({x:v.x,y:v.y},mainlandMapAnchor(g,p.x,p.y));
 assert.equal(mainlandSavedAt(a.objects,v.x+.25,v.y-.25).length,1);
 assert.equal(mainlandSavedAt(a.objects,v.x+.25,v.y-1.25).length,0);
 const select=(x1,y1,x2,y2)=>mainlandSavedInRect(a.objects,{x:v.x+x1,y:v.y+y1},{x:v.x+x2,y:v.y+y2});
 assert.equal(select(.1,-1.1,.9,-1.9).length,0); // shape hole
 assert.deepEqual(select(1.9,-1.9,1.1,-1.1),[v]); // reversed drag
 assert.equal(select(2,-1.9,3,-1.1).length,0); // touching edge only
 assert.equal(select(0,-1,0,-2).length,0); // zero-width gesture
 assert.equal(select(NaN,0,1,-1).length,0);
 const half={...v,factor:2};
 assert.deepEqual(mainlandSavedInRect([half],{x:v.x+.55,y:v.y-.55},{x:v.x+.95,y:v.y-.95}),[half]);
 assert.equal(mainlandSavedInRect([half],{x:v.x+.05,y:v.y-.55},{x:v.x+.45,y:v.y-.95}).length,0);
 assert.deepEqual(mainlandSavedInRect([{...v,shape:null}],{x:v.x+.1,y:v.y-.1},{x:v.x+.9,y:v.y-.9}).map(p=>p.object.localOrdinal),[v.object.localOrdinal]);
 assert.equal(visibleMainlandSaved(a.objects,{x:v.x-2,y:v.y-2,w:4,h:4}).length,1);
 const edit={plan:{localOrdinal:1,itemId:p.itemId,expectedX:4,expectedY:6,expectedOrientation:p.orientation,replacementX:8,replacementY:9,replacementOrientation:null},gridOrdinal:3,name:'Fixture',warning:''};
 assert.deepEqual(projectMainlandSaved(grids,sessions,maps,[edit]).objects.map(p=>({x:p.x,y:p.y})),[mainlandMapAnchor(g,8,9)]);
 assert.equal(projectMainlandSaved(grids,[{receipt,verifiedGridOrdinals:[]}],maps,[]).omitted,1);
 assert.equal(projectMainlandSaved(grids,[{receipt:{...receipt,points:[p,{...p,localOrdinal:2,localGridOrdinal:4}]},verifiedGridOrdinals:[3,4]}],maps,[]).objects.length,0);
 assert.equal(projectMainlandSaved(grids,sessions,new Map([[g.key,{...m,sourceGridFactor:2}]]),[]).objects.length,0);
});

import {emptyWorldTimeline,currentWorldEdits} from '../src/lib/world/saved-map-batch.ts';
test('mainland save move drafts remain native same-grid and reject overlaps or other areas',()=>{
 const bundle=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8'))),grids=bindMainland(bundle.grids),g=grids.find(g=>g.key==='Meadow');
 const rasters=new Map(grids.map(g=>[g.key,{sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:new Uint32Array(g.sizeX*g.sizeY)}]));
 const r=rasters.get(g.key);r.nativeFloorValues[6*r.sizeX+4]=4;r.nativeFloorValues[9*r.sizeX+8]=4;
 const shape={width:1,height:1,runs:[{x:0,y:0,width:1}],cellCount:1,path:'M0 0h1v1H0Z'};
 const o={localOrdinal:1,localGridOrdinal:3,itemId:'40005160',x:4,y:6,orientation:'GridOrientation_Down',shapeKey:'40005160:8',orientationCode:8,name:'Fixture',layer:'furniture',surfaceCapable:false};
 const m={layoutId:g.layoutId,gridIdNative:g.gridIdNative,gridDataPath:g.gridDataPath,sourceGridFactor:g.factor,objects:[o],shapes:{[o.shapeKey]:shape},actualOccupancyVerified:false,savedSourceCoordinateEquivalenceVerified:false};
 const a={area:g.key,object:o,shape,factor:g.factor,...mainlandMapAnchor(g,o.x,o.y)},maps=new Map([[g.key,m]]),timeline=emptyWorldTimeline();
 const b=mainlandMapAnchor(g,8.5,9.5),draft=mainlandSavedDraft(a,grids,rasters,maps,timeline,b.x,b.y,o.orientation);
 assert(draft?.valid);assert.equal(currentWorldEdits(draft.next)[0].plan.replacementX,8);assert.equal(currentWorldEdits(draft.next)[0].plan.replacementY,9);
 const coords=mainlandSavedCell(a);assert.deepEqual(coords,{x:2*g.origin.position[0]+4,z:2*g.origin.position[2]+6});
 const exact=mainlandSavedDraftAtCell(a,grids,rasters,maps,timeline,coords.x+4,coords.z+3,o.orientation);assert.deepEqual(exact.next,draft.next);
 assert.equal(mainlandSavedDraftAtCell(a,grids,rasters,maps,timeline,coords.x+.5,coords.z,o.orientation),null);
 assert.equal(mainlandSavedDraftAtCell(a,grids,rasters,maps,timeline,coords.x+5000,coords.z,o.orientation)?.valid,false);
 const second={...o,localOrdinal:2,x:8,y:9},map2={...m,objects:[o,second]},b2={...a,object:second,...mainlandMapAnchor(g,8,9)};
 r.nativeFloorValues[6*r.sizeX+5]=4;r.nativeFloorValues[9*r.sizeX+9]=4;
 const group=mainlandSavedGroupDraft([a,b2],grids,rasters,new Map([[g.key,map2]]),timeline,1,0);
 assert.equal(group.next?.snapshots.length,2);assert.equal(currentWorldEdits(group.next).length,2);
 assert.equal(mainlandGroupFactor([a,{...b2,factor:2}]),1);
 assert.equal(mainlandSavedAdvancedDraft([a,{...b2,factor:2}],grids,rasters,new Map([[g.key,map2]]),timeline,'left').next,null);
 assert.equal(mainlandSavedAdvancedDraft([a,b2],grids,rasters,new Map([[g.key,map2]]),timeline,'left').next,null);
 r.nativeFloorValues[9*r.sizeX+4]=4;
 const aligned=mainlandSavedAdvancedDraft([a,b2],grids,rasters,new Map([[g.key,map2]]),timeline,'left');
 assert.equal(aligned.next?.snapshots.length,2);
 assert.equal(currentWorldEdits(aligned.next)[0].plan.replacementX,4);
 assert.equal(currentWorldEdits(aligned.next)[0].plan.localOrdinal,2);
 const rotatedMap={...map2,shapes:{'40005160:0':shape,'40005160:4':shape,'40005160:8':shape,'40005160:12':shape}};
 r.nativeFloorValues[6*r.sizeX+7]=4;r.nativeFloorValues[10*r.sizeX+4]=4;
 const rotated=mainlandSavedAdvancedDraft([a,b2],grids,rasters,new Map([[g.key,rotatedMap]]),timeline,1);
 assert.equal(rotated.next?.snapshots.length,2);
 assert.equal(currentWorldEdits(rotated.next).length,2);
 assert.equal(mainlandSavedGroupDraft([a,b2],grids,rasters,new Map([[g.key,map2]]),timeline,5000,0).next,null);
 assert.equal(mainlandSavedGroupDraft([a,a],grids,rasters,new Map([[g.key,map2]]),timeline,1,0).next,null);
 const outside=mainlandMapAnchor(g,50.5,50.5);assert.equal(mainlandSavedDraft(a,grids,rasters,maps,timeline,outside.x,outside.y,o.orientation)?.valid,false);
 const other=grids.find(g=>g.key==='Forest'),far=mainlandMapAnchor(other,4.5,6.5);
 assert.equal(mainlandSavedDraft(a,grids,rasters,maps,timeline,far.x,far.y,o.orientation)?.valid,false);
 rasters.get(other.key).nativeFloorValues[6*other.sizeX+4]=4;
 const transfer=mainlandTransferCandidate(a,grids,rasters,timeline,far.x,far.y);
 assert.equal(transfer?.area,other.key);assert.equal(transfer?.plan.x,4);assert.equal(transfer?.plan.y,6);assert.equal(transfer?.plan.expectedX,4);
 assert.equal(mainlandTransferCandidate(a,grids,rasters,draft.next,far.x,far.y),null);
 assert.equal(mainlandTransferCandidate({...a,object:{...o,editRestrictions:{switchGrid:'denied'}}},grids,rasters,timeline,far.x,far.y),null);
});

import {mainlandNetworkScope,mergeMainlandAreaDrafts} from '../src/lib/world/mainland-design-frame.ts';
import {roadComponent,floodRoadRegion} from '../src/lib/world/road-design.ts';
import {fenceDesignEdges,fenceComponent} from '../src/lib/world/fence-design.ts';
import {commitRoadDesign,replaceDesignNetwork} from '../src/lib/world/design-layout.ts';
test('mainland network scope separates adjacent source areas without splitting the design history',()=>{
 const shape={width:2,height:2,cellCount:4,runs:[{x:0,y:0,width:2},{x:0,y:1,width:2}],path:'M0 0h2v2H0Z'};
 const a={itemId:40100068,name:'Path_MainStreet',layer:'ground',surfaceCapable:false,shapes:{'40100068:8':shape}},b={...a,itemId:40100035,name:'Path_Brick',shapes:{'40100035:8':shape}};
 const defs=new Map([[a.itemId,a],[b.itemId,b]]),scope=p=>p.x<4?'A':'B';
 const next=commitRoadDesign(emptyDesign(),a,[{x:0,y:0},{x:2,y:0},{x:4,y:0}],1,12,12);
 assert.deepEqual(roadComponent(currentDesign(next),defs,1,1,scope),[1,2]);
 const changed=replaceDesignNetwork(next,1,b,defs,1,12,12,scope);
 assert.deepEqual(currentDesign(changed).map(p=>p.itemId),[b.itemId,b.itemId,a.itemId]);
 const r={sizeX:8,sizeY:4,nativeFloorValues:new Uint32Array(32).fill(1)};
 assert.equal(floodRoadRegion({x:0,y:0},a,{raster:r,factor:1,verifiedGridOrdinals:[]},[],scope).length,4);
 const fence={itemId:40700000,name:'Fence_IronBricks_Base',layer:'fence',surfaceCapable:false,shapes:{'40700000:8':{width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],path:'M0 0h1v1H0Z'}}};
 const nodes=[{id:1,itemId:fence.itemId,x:2,y:0,orientation:2},{id:2,itemId:fence.itemId,x:3,y:0,orientation:2},{id:3,itemId:fence.itemId,x:4,y:0,orientation:2}],fd=new Map([[fence.itemId,fence]]);
 assert.equal(fenceDesignEdges(nodes,fd,1,scope).length,1);assert.deepEqual(fenceComponent(nodes,fd,1,1,scope),[1,2]);
});

test('area drafts copy into mainland atomically with new IDs and leave the source unchanged',()=>{
 const bundle=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8')));
 const rasters=new Map(bundle.grids.map(g=>[g.key,{sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:Uint32Array.from(inflateSync(Buffer.from(g.data,'base64')),i=>g.palette[i])}]));
 const f=composeMainlandDesignFrame(bundle.grids,rasters),g=f.grids.find(g=>g.key==='Meadow'),i=f.grids.indexOf(g)+1,w=f.raster.sizeX,at=f.owners.indexOf(i),x=at%w,y=Math.floor(at/w),off=mainlandFrameOffset(f,g);
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],path:'M0 0h1v1H0Z'},item={itemId:40005160,name:'Fixture',layer:'furniture',surfaceCapable:false,shapes:{'40005160:8':shape}},defs=new Map([[item.itemId,item]]);
 const local=placeDesign(emptyDesign(),item,x-off.x,y-off.y,2,g.sizeX,g.sizeY),world=emptyDesign(),next=mergeMainlandAreaDrafts(f,world,{[g.key]:local},defs);
 assert(next);assert.equal(currentDesign(next).length,1);assert.equal(currentDesign(next)[0].x,x);assert.equal(currentDesign(next)[0].y,y);assert.equal(currentDesign(local)[0].x,x-off.x);
 assert.equal(mergeMainlandAreaDrafts(f,next,{[g.key]:local},defs),next);assert.equal(currentDesign(travelDesign(next,-1)).length,0);
});

test('five DLC scene coordinate tables cover every published grid in the exact scope',()=>{
 const release=parsePublicTerrainRelease(JSON.parse(fs.readFileSync(new URL('../static/ddv/world/steam-1.26.2/index.json',import.meta.url),'utf8')));
 const expected={VillageExpansion01:34,VillageExpansion02:31,VillageExpansion03:27,VillageExpansion04:52,VillageWinnieDLC:11};
 for(const [scope,count] of Object.entries(expected)){
  const region=release.entries.find(e=>e.scope===scope),grids=bindMainland(region.grids);
  assert.equal(grids.length,count);assert.equal(bindMainland(region.grids.slice(1)),null);
  assert.equal(bindMainland([...region.grids.slice(1),region.grids[1]]),null);
  const bundle=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(new URL('../static/ddv/world/steam-1.26.2/'+region.path,import.meta.url),'utf8')));
  const rasters=new Map(bundle.grids.map(g=>[g.key,{sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:Uint32Array.from(inflateSync(Buffer.from(g.data,'base64')),i=>g.palette[i])}]));
  const f=composeMainlandDesignFrame(region.grids,rasters);assert.equal(f.scope,scope);assert(f.owners.some(n=>n>0&&n<255));
  for(const g of grids){const p=mainlandMapAnchor(g,0,0);assert.deepEqual(mainlandLocalAnchor(g,p.x,p.y),{x:0,y:0});}
  const doc=serializeMainlandDesign(f,emptyDesign(),new Map());assert.deepEqual(parseMainlandDesign(doc,f),[]);
  assert.throws(()=>parseMainlandDesign(doc.replace(scope,'WrongWorld'),f));
 }
});

import {snapWorldRoad,worldRoadStroke,worldRoadPlan,worldRoadComponent,replaceWorldRoad} from '../src/lib/world/world-road-lattice.ts';
import {commitNetworkDesign} from '../src/lib/world/design-layout.ts';
test('road lattice follows odd source origins and preserves a single world timeline',()=>{
 const release=parsePublicTerrainRelease(JSON.parse(fs.readFileSync(new URL('../static/ddv/world/steam-1.26.2/index.json',import.meta.url),'utf8')));
 const region=release.entries.find(e=>e.scope==='VillageExpansion01'),bundle=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(new URL('../static/ddv/world/steam-1.26.2/'+region.path,import.meta.url),'utf8')));
 const rasters=new Map(bundle.grids.map(g=>[g.key,{sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:new Uint32Array(g.sizeX*g.sizeY)}]));
 const f=composeMainlandDesignFrame(region.grids,rasters),g=f.grids.find(g=>{const o=mainlandFrameOffset(f,g);return o.x%2||o.y%2;}),off=mainlandFrameOffset(f,g),owner=f.grids.indexOf(g)+1,w=f.raster.sizeX;
 for(let y=0;y<4;y++)for(let x=0;x<8;x++){const k=(off.y+y)*w+off.x+x;f.owners[k]=owner;f.raster.nativeFloorValues[k]=4;}
 const shape={width:2,height:2,cellCount:4,runs:[{x:0,y:0,width:2},{x:0,y:1,width:2}],path:'M0 0h2v2H0Z'};
 const a={itemId:40100068,name:'Path_MainStreet',layer:'ground',surfaceCapable:false,shapes:{'40100068:8':shape}},b={...a,itemId:40100035,name:'Path_Brick',shapes:{'40100035:8':shape}},defs=new Map([[a.itemId,a],[b.itemId,b]]);
 assert.deepEqual(snapWorldRoad(f,{x:off.x+1,y:off.y+1},2),off);
 const points=worldRoadStroke(f,[off,{x:off.x+4,y:off.y}],'line',2,a,[],defs);assert.equal(points.length,3);
 const start=emptyDesign(),plan=worldRoadPlan(f,start,a,points,false),next=commitNetworkDesign(start,plan);
 assert(next);assert.equal(currentDesign(next).length,3);assert(mainlandItemsValid(f,currentDesign(next),defs));
 assert.deepEqual(worldRoadComponent(f,currentDesign(next),defs,1),[1,2,3]);
 const changed=replaceWorldRoad(f,next,1,b,defs);assert(changed);assert(currentDesign(changed).every(p=>p.itemId===b.itemId));
 assert.equal(worldRoadPlan(f,start,a,[off,{x:off.x+8,y:off.y}],false),null);
 assert.equal(currentDesign(travelDesign(next,-1)).length,0);
});

import {captureSaveDesign,mergeSaveDesign} from '../src/lib/world/save-design-capture.ts';
test('copy real source-local furniture to independent world design with fresh local IDs and undoable non-destructive merge',()=>{
 const bundle=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8'))),grids=bindMainland(bundle.grids),g=grids.find(g=>g.key==='Meadow');
 const rasters=new Map(grids.map(g=>[g.key,{sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:new Uint32Array(g.sizeX*g.sizeY)}]));
 rasters.get(g.key).nativeFloorValues[6*g.sizeX+4]=4;
 const shape={width:1,height:1,runs:[{x:0,y:0,width:1}],cellCount:1,path:'M0 0h1v1H0Z'};
 const o={localOrdinal:987654,localGridOrdinal:777,itemId:'40005160',x:4,y:6,orientation:'GridOrientation_Down',shapeKey:'40005160:8',orientationCode:8,name:'Fixture',layer:'furniture',surfaceCapable:false};
 const m={layoutId:g.layoutId,gridIdNative:g.gridIdNative,gridDataPath:g.gridDataPath,sourceGridFactor:g.factor,objects:[o],shapes:{[o.shapeKey]:shape},actualOccupancyVerified:false,savedSourceCoordinateEquivalenceVerified:false};
 const a={area:g.key,object:o,shape,factor:g.factor,...mainlandMapAnchor(g,o.x,o.y)},maps=new Map([[g.key,m]]);
 const capture=captureSaveDesign(grids,rasters,maps,[a,{...a,object:{...o,localOrdinal:987655,subgrid:{status:'resolved_full',objectCount:1}}}],2);
 assert.equal(capture.count,1);assert.equal(capture.omitted,3);assert.ok(!capture.text.includes('987654')&&!capture.text.includes('localOrdinal'));
 const mixedCapability=captureSaveDesign(grids,rasters,maps,[{...a,object:{...o,surfaceCapable:true}}]);
 assert.equal(mixedCapability?.count,1);
 assert.equal(captureSaveDesign(grids,rasters,maps,[{...a,object:{...o,layer:'surface',surfaceCapable:true}}]),null);
 const frame=composeMainlandDesignFrame(grids,rasters),incoming=parseMainlandDesign(capture.text,frame);
 const def={itemId:40005160,name:'Fixture',layer:'furniture',surfaceCapable:false,shapes:m.shapes},defs=new Map([[def.itemId,def]]);
 const first=mergeSaveDesign(emptyDesign(),incoming,defs,frame.raster.sizeX,frame.raster.sizeY);
 assert.equal(currentDesign(first).length,1);assert.equal(first.cursor,1);
 assert.equal(mergeSaveDesign(first,incoming,defs,frame.raster.sizeX,frame.raster.sizeY),first);
 const second=mergeSaveDesign(first,[...incoming,{...incoming[0],id:2}],defs,frame.raster.sizeX,frame.raster.sizeY);
 assert.equal(currentDesign(second).length,2);assert.equal(second.cursor,2);
 assert.deepEqual(second.snapshots[1],currentDesign(first));
});

import {savedAdjacentNetwork} from '../src/lib/world/saved-adjacent-network.ts';
test('same-style cardinal road cells select only their source grid and translate atomically',()=>{
 const bundle=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8'))),grids=bindMainland(bundle.grids),g=grids.find(g=>g.key==='Meadow');
 const rasters=new Map(grids.map(g=>[g.key,{sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:new Uint32Array(g.sizeX*g.sizeY)}]));
 const r=rasters.get(g.key);for(let y=6;y<8;y++)for(let x=4;x<10;x++)r.nativeFloorValues[y*r.sizeX+x]=4;
 const shape={width:2,height:2,cellCount:4,runs:[{x:0,y:0,width:2},{x:0,y:1,width:2}],path:'M0 0h2v2H0Z'};
 const o={localOrdinal:1,localGridOrdinal:3,itemId:'40100068',x:4,y:6,orientation:'GridOrientation_Down',shapeKey:'40100068:8',orientationCode:8,name:'Path_MainStreet',layer:'ground',surfaceCapable:false};
 const p={...o,localOrdinal:2,x:6};
 const m={layoutId:g.layoutId,gridIdNative:g.gridIdNative,gridDataPath:g.gridDataPath,sourceGridFactor:g.factor,objects:[o,p],shapes:{[o.shapeKey]:shape},actualOccupancyVerified:false,savedSourceCoordinateEquivalenceVerified:false};
 const wrap=object=>({area:g.key,object,shape,factor:g.factor,...mainlandMapAnchor(g,object.x,object.y)});
 const a=wrap(o),b=wrap(p),foreign={...b,area:'elsewhere',object:{...p,localOrdinal:3,x:8}};
 assert.deepEqual(savedAdjacentNetwork(a,[a,b,foreign]),[1,2]);
 assert.deepEqual(savedAdjacentNetwork(a,[a,b,{...b,object:{...p,localOrdinal:4}}]),[]);
 const result=mainlandSavedGroupDraft([a,b],grids,rasters,new Map([[g.key,m]]),emptyWorldTimeline(),2,0);
 assert.ok(result.next);
 assert.deepEqual(currentWorldEdits(result.next).map(e=>e.plan.replacementX),[6,8]);
 const occupied={...m,objects:[o,p,{...p,localOrdinal:4,x:8}]};
 assert.equal(mainlandSavedGroupDraft([a,b],grids,rasters,new Map([[g.key,occupied]]),emptyWorldTimeline(),2,0).next,null);
});

import {supportTerrainRow,supportFreeEdit,parseSupportTree,supportStockPlacement,supportStockPickup,supportHitIndices,supportPlacementFits,supportDragDestination} from '../src/lib/world/subgrid-local.ts';
test('support cells use original L-shaped shelf raster, masks, factors and sibling footprints',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../static/ddv/world/steam-1.26.2/support-terrain.json',import.meta.url),'utf8'));
 assert.equal(catalog.grids.length,47);
 assert.equal(new Set(catalog.grids.map(g=>g[0])).size,47);
 assert.equal(catalog.grids.reduce((n,g)=>n+g[4].length,0),1143);
 for(const [path,x,y,sha,cells] of catalog.grids){assert.equal(cells.length,x*y);assert.match(sha,/^[a-f0-9]{64}$/);assert.ok(supportTerrainRow(catalog,path));}
 const pool=supportTerrainRow(catalog,'GridData/Furniture/NonIP_SetLess/Ingroundpool01-GridData.json');assert.deepEqual([...pool.nativeFloorValues].flatMap((n,i)=>n===0?[i]:[]),[20,21]);
 const sourcePath='GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json';
 const raster=supportTerrainRow(catalog,sourcePath);
 assert.deepEqual([...raster.nativeFloorValues],[4096,4096,4096,0]);
 const tree=parseSupportTree({contract:'wand.world.subgrid-local@1',worldTransformVerified:false,tree:{factor:2,sourcePath,objects:[
 {itemId:40000001,x:0,y:0,orientation:'GridOrientation_Down',child:null},
 {itemId:40000002,x:0,y:2,orientation:'GridOrientation_Down',child:null}
 ]}});
 const cell={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],path:'M0 0h1v1h-1z',acceptedFloorTypesFlag:4096};
 const shapes={'40000001:8':cell,'40000001:12':{...cell,width:2,cellCount:2,runs:[{x:0,y:0,width:2}]},'40000002:8':cell};
 const allowed=new Set([40000001,40000002]);
 const drag=supportDragDestination(tree.objects[0],{x:0,y:0},{x:2,y:0});
 assert.deepEqual(drag,{x:2,y:0});
 assert.ok(supportFreeEdit(tree,shapes,allowed,raster,0,drag.x,drag.y,'GridOrientation_Down'));
 const invalidDrag=supportDragDestination(tree.objects[0],{x:0,y:0},{x:2,y:2});
 assert.equal(supportFreeEdit(tree,shapes,allowed,raster,0,invalidDrag.x,invalidDrag.y,'GridOrientation_Down'),null);
 assert.ok(supportFreeEdit(tree,shapes,allowed,raster,0,2,0,'GridOrientation_Down'));
 assert.ok(supportFreeEdit(tree,shapes,allowed,raster,0,2,0,'GridOrientation_Left'));
 assert.equal(supportFreeEdit(tree,shapes,allowed,raster,0,2,2,'GridOrientation_Down'),null);
 assert.equal(supportFreeEdit(tree,shapes,allowed,raster,0,0,2,'GridOrientation_Down'),null);
 assert.equal(supportFreeEdit(tree,shapes,allowed,raster,0,3,0,'GridOrientation_Left'),null);
 assert.equal(supportFreeEdit(tree,{...shapes,'40000001:8':{...cell,acceptedFloorTypesFlag:512}},allowed,raster,0,2,0,'GridOrientation_Down'),null);
 assert.equal(supportTerrainRow(catalog,'GridData/Unknown.json'),null);
 assert.ok(supportPlacementFits(tree,shapes,raster,40000001,2,0,'GridOrientation_Down'));
 assert.equal(supportPlacementFits(tree,shapes,raster,40000001,2,2,'GridOrientation_Down'),false);
 assert.equal(supportPlacementFits(tree,shapes,raster,40000001,0,2,'GridOrientation_Down'),false);
 assert.ok(supportStockPlacement(tree,shapes,raster,40000001,1,2,0,'GridOrientation_Down'));
 assert.equal(supportStockPlacement(tree,shapes,raster,40000001,1,0,2,'GridOrientation_Down'),null);
 assert.equal(supportStockPlacement(tree,shapes,raster,40000001,1,2,2,'GridOrientation_Down'),null);
 assert.equal(supportStockPlacement(tree,shapes,raster,40000001,0,2,0,'GridOrientation_Down'),null);
 assert.deepEqual(supportStockPickup(tree,0,new Map([[40000001,0]]),allowed),{action:'pickup',itemId:40000001,expectedStock:0,index:0,expectedX:0,expectedY:0,expectedOrientation:'GridOrientation_Down'});
 assert.equal(supportStockPickup(tree,0,new Map(),allowed),null);
});

test('support map selection uses exact occupied cells, including holes and overlapping hits',()=>{
 const object={itemId:40000001,x:2,y:3,orientation:'GridOrientation_Down',child:null};
 const tree={factor:1,sourcePath:null,objects:[object,{...object,itemId:40000002},{...object,itemId:40000003}]};
 const shape={width:2,height:2,cellCount:3,runs:[{x:0,y:0,width:2},{x:0,y:1,width:1}]};
 const shapes={'40000001:8':shape,'40000002:8':{...shape,width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}]}};
 assert.deepEqual(supportHitIndices(tree,shapes,2,3),[0,1]);
 assert.deepEqual(supportHitIndices(tree,shapes,3,3),[0]);
 assert.deepEqual(supportHitIndices(tree,shapes,3,4),[]);
 assert.deepEqual(supportHitIndices(tree,shapes,1,3),[]);
 assert.deepEqual(supportHitIndices(tree,shapes,2.5,3),[]);
});

import {appendSavedStroke,savedNetworkFreehand,cardinalRoadCandidate,cardinalFenceCandidate} from '../src/lib/world/cardinal-road-save.ts';
test('saved network freehand samples use native logical cells and fail closed at bounds or limit',()=>{
 const g={origin:{position:[0,0,0]},factor:2,sizeX:8,sizeY:8};
 let p=appendSavedStroke([],{x:.1,y:-.1},g,4,2);
 assert.equal(p.length,1);
 p=appendSavedStroke(p,{x:1.9,y:-1.9},g,4,2);
 assert.equal(p.length,1);
 p=appendSavedStroke(p,{x:2.1,y:-.1},g,4,2);
 assert.equal(p.length,2);
 assert.equal(appendSavedStroke(p,{x:4.1,y:-.1},g,4,2),null);
 assert.equal(appendSavedStroke([],{x:-.1,y:0},g,4,2),null);
 assert.equal(appendSavedStroke([],{x:8,y:0},g,4,2),null);
 assert.ok(savedNetworkFreehand('connect-brush'));assert.ok(savedNetworkFreehand('erase-brush'));assert.equal(savedNetworkFreehand('line'),false);
});

test('new path and fence styles create plans without any saved network seed',()=>{
 const grid={key:'A',factor:1,sizeX:20,sizeY:20,origin:{position:[0,0,0]},bounds:{x:0,y:-20,w:20,h:20},layoutId:'SceneLayouts/Village04/A.json',gridDataPath:'GridData/A.json'};
 const rasters=new Map([['A',{sizeX:20,sizeY:20,nativeFloorValues:Uint32Array.from({length:400},()=>4)}]]);
 const shape={width:2,height:2,cellCount:4,acceptedFloorTypesFlag:4,runs:[{x:0,y:0,width:2},{x:0,y:1,width:2}],path:''};
 const road={styleOnly:true,kind:'road',area:'A',factor:1,itemId:40100068,name:'Path',shape};
 const a={x:2.1,y:-2.1},b={x:6.1,y:-2.1};
 const candidate=cardinalRoadCandidate(road,[grid],rasters,[],a,b,'line');
 assert.deepEqual(candidate.plan.cells,[[2,2],[4,2],[6,2]]);
 assert.equal(candidate.plan.seed,undefined);
 assert.equal(cardinalRoadCandidate(road,[grid],rasters,[],a,b,'erase-line'),null);
 assert.equal(cardinalRoadCandidate(road,[grid],rasters,[],a,{x:22,y:-2},'line'),null);
 const fence={...road,kind:'fence',itemId:40000001,shape:{...shape,width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}]}};
 const f=cardinalFenceCandidate(fence,[grid],rasters,[],a,{x:4.1,y:-2.1},'line');
 assert.deepEqual(f.plan.nodes,[[2,2],[3,2],[4,2]]);
 assert.equal(f.plan.seed,undefined);
 assert.equal(cardinalFenceCandidate(fence,[grid],rasters,[],a,b,'connect-line'),null);
});

test('support direct drag preserves grab offset on native cells',()=>{
 const o={x:4,y:7};
 assert.deepEqual(supportDragDestination(o,{x:5,y:8},{x:3,y:4}),{x:2,y:3});
 assert.deepEqual(supportDragDestination(o,{x:5,y:8},{x:5,y:8}),o);
 assert.deepEqual(supportDragDestination(o,{x:5,y:8},{x:-1,y:-1}),{x:-2,y:-2});
 assert.equal(supportDragDestination(o,{x:.5,y:0},{x:1,y:1}),null);
 assert.equal(supportDragDestination(o,{x:0,y:0},{x:Infinity,y:1}),null);
 assert.equal(supportDragDestination(o,{x:0,y:0},{x:2147483647,y:1}),null);
});

import {captureSupportScene,parseSupportScene,supportScenePlan,supportSceneCounts} from '../src/lib/world/support-scene.ts';
test('portable support Scene keeps native coordinates, validates stock and refuses nested reconstruction',()=>{
 const item=40000001,owner=40000002,sourcePath='GridData/Furniture/Example.json';
 const child={itemId:item,x:0,y:0,orientation:'GridOrientation_Down',child:null};
 const tree={factor:1,sourcePath,objects:[child,{...child,x:1}]};
 const scene=captureSupportScene(owner,tree);
 assert.deepEqual(parseSupportScene(JSON.stringify(scene)),scene);
 assert.deepEqual([...supportSceneCounts(scene.tree)],[[item,2]]);
 const target={...tree,objects:[]};
 const raster={sizeX:2,sizeY:1,nativeFloorValues:Uint32Array.from([1024,1024])};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'};
 const shapes={[item+':8']:shape},counts=new Map([[item,2]]),allowed=new Set([item]);
 assert.deepEqual(supportScenePlan(scene,owner,target,shapes,raster,counts,allowed).map(p=>[p.x,p.expectedStock]),[[0,2],[1,1]]);
 assert.equal(supportScenePlan(scene,owner,target,shapes,raster,new Map([[item,1]]),allowed),null);
 assert.equal(supportScenePlan(scene,owner,tree,shapes,raster,counts,allowed),null);
 assert.equal(supportScenePlan(scene,owner+1,target,shapes,raster,counts,allowed),null);
 assert.equal(supportScenePlan(scene,owner,{...target,factor:2},shapes,raster,counts,allowed),null);
 assert.equal(supportScenePlan(scene,owner,target,shapes,raster,counts,new Set()),null);
 const nested=captureSupportScene(owner,{...tree,objects:[{...child,child:tree}]});
 assert.equal(supportSceneCounts(nested.tree).get(item),3);
 assert.equal(supportScenePlan(nested,owner,target,shapes,raster,counts,allowed),null);
 assert.throws(()=>parseSupportScene(JSON.stringify({...scene,tree:{...tree,sourcePath:'../private.json'}})));
 assert.throws(()=>parseSupportScene(JSON.stringify({...scene,tree:{...tree,objects:[{...child,gridId:42}]}})));
});
