import {parseReplayStep} from '../src/lib/world/checkpoint-journal.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {worldMoveEligible,worldRotateEligible,draftSavedMapTransform} from '../src/lib/world/saved-map-transform.ts';
import {mainlandFreeHits} from '../src/lib/world/mainland-world-coordinates.ts';
import {stockSourceEligible,landscapeSourceEligible,buildingSourceEligible,buildingDuplicate,buildingPickup,buildingPlacementSources} from '../src/lib/world/save-furniture-placement.ts';
const o={localOrdinal:1,localGridOrdinal:1,itemId:'40000001',x:1,y:1,orientation:'GridOrientation_Down',orientationCode:8,layer:'furniture',shapeKey:'40000001:8',editRestrictions:{select:'denied',move:'denied',rotate:'denied',remove:'denied'}};
test('game flags are overridable without overriding support and native network invariants',()=>{
 assert.equal(worldMoveEligible(o),false);assert.equal(worldMoveEligible(o,true),true);assert.equal(worldRotateEligible(o,true),true);
 assert.ok(draftSavedMapTransform(o,2,2,'GridOrientation_Right',true));
 assert.equal(worldMoveEligible({...o,subgrid:{}},true),false);
 assert.equal(worldMoveEligible({...o,layer:'ground',itemId:'40100068'},true),false);
 assert.equal(stockSourceEligible({shape:{},object:o},true),true);
 assert.equal(landscapeSourceEligible({shape:{},object:{...o,itemId:'40200001',layer:'landscape'}},true),true);
});
test('nonstandard placement falls back only to a unique source rectangle',()=>{
 const g={key:'g',factor:1,sizeX:3,sizeY:3,origin:{position:[0,0,0]},bounds:{x:0,y:-3,w:3,h:3}},h={...g,key:'h'};
 const r={sizeX:3,sizeY:3,nativeFloorValues:new Uint32Array(9)};
 assert.deepEqual(mainlandFreeHits([g],new Map([['g',r]]),1,-1),[g]);
 assert.equal(mainlandFreeHits([g,h],new Map([['g',r],['h',r]]),1,-1).length,2);
 assert.equal(mainlandFreeHits([g],new Map([['g',r]]),4,-1).length,0);
});

import {alignmentTargets} from '../src/lib/world/map-alignment.ts';
import {stageWorldTargets,emptyWorldTimeline,currentWorldEdits} from '../src/lib/world/saved-map-batch.ts';
test('free alignment permits restricted furniture but not structural dependencies or networks',()=>{
 const a=o,b={...o,localOrdinal:2,x:5,y:3};
 const map={objects:[a,b],shapes:{[o.shapeKey]:{width:1,height:1,runs:[{x:0,y:0,width:1}]}}};
 assert.equal(alignmentTargets(map,map.objects,'left'),null);
 const targets=alignmentTargets(map,map.objects,'left',true);
 assert.ok(targets);assert.deepEqual(targets.map(t=>[t.x,t.y]),[[1,1],[1,3]]);
 const next=stageWorldTargets(map,emptyWorldTimeline(),targets,'test',true);
 assert.ok(next);assert.equal(currentWorldEdits(next).length,1);
 assert.equal(currentWorldEdits(next)[0].plan.replacementX,1);
 assert.equal(alignmentTargets(map,[a,{...b,subgrid:{}}],'left',true),null);
 assert.equal(alignmentTargets(map,[a,{...b,itemId:'40100068',layer:'ground'}],'left',true),null);
});

import {playerHouseSourceEligible,playerHouseDuplicate,playerHousePickup} from '../src/lib/world/save-furniture-placement.ts';
import {bindMainlandGrid} from '../src/lib/world/mainland-world-coordinates.ts';
test('player house exterior duplication targets exact grids in the same world',()=>{
 const g=bindMainlandGrid({key:'Beach',layoutId:'SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json',gridDataPath:'GridData/Villages/Village04-BeachLevel-GridData.json',gridIdNative:0,factor:1,sizeX:400,sizeY:350});
 assert.ok(g);
 const r={sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:new Uint32Array(g.sizeX*g.sizeY)};
 const shape={width:2,height:2,cellCount:4,runs:[{x:0,y:0,width:2},{x:0,y:1,width:2}]};
 const p={area:g.key,factor:g.factor,x:g.bounds.x+1,y:g.bounds.y+g.bounds.h-1,shape,object:{...o,itemId:'20500001',nativeType:'Building',layer:'other'}};
 assert.equal(playerHouseSourceEligible(p),true);
 const rasters=new Map([[g.key,r]]),x=g.bounds.x+5.1,y=g.bounds.y+g.bounds.h-6.1;
 const q=playerHouseDuplicate([g],rasters,p,x,y);
 assert.ok(q);assert.deepEqual([q.plan.x,q.plan.y],[5,6]);assert.equal(q.plan.itemId,'20500001');
 assert.equal(playerHouseDuplicate([g],rasters,{...p,area:'Other'},x,y),null);
 assert.equal(playerHouseDuplicate([g],rasters,{...p,object:{...p.object,subgrid:{}}},x,y),null);
 assert.equal(playerHouseSourceEligible({...p,object:{...p.object,itemId:'20000001'}}),false);
 const h=bindMainlandGrid({key:'Meadow',layoutId:'SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json',gridDataPath:'GridData/Villages/Village04-MeadowLevel-GridData.json',gridIdNative:0,factor:1,sizeX:196,sizeY:100});
 assert.ok(h);
 const rr={sizeX:h.sizeX,sizeY:h.sizeY,nativeFloorValues:Uint32Array.from({length:h.sizeX*h.sizeY},()=>4)};
 const cross=playerHouseDuplicate([g,h],new Map([[g.key,r],[h.key,rr]]),p,h.bounds.x+5.1,h.bounds.y+h.bounds.h-6.1);
 assert.ok(cross);assert.equal(cross.area,h.key);
 assert.equal(playerHousePickup(p,[p]),null);
 assert.equal(playerHousePickup(p,[p,{...p,area:h.key,object:{...p.object,localOrdinal:2}}]).plan.action,'remove');
});

import {mainlandTransferCandidate} from '../src/lib/world/mainland-saved-objects.ts';
test('free player house move uses the destination Grid even without ordinary terrain',()=>{
 const g=bindMainlandGrid({key:'Beach',layoutId:'SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json',gridDataPath:'GridData/Villages/Village04-BeachLevel-GridData.json',gridIdNative:0,factor:1,sizeX:400,sizeY:350});
 const h=bindMainlandGrid({key:'Meadow',layoutId:'SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json',gridDataPath:'GridData/Villages/Village04-MeadowLevel-GridData.json',gridIdNative:0,factor:1,sizeX:196,sizeY:100});
 assert.ok(g&&h);
 const raster=(g)=>({sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:new Uint32Array(g.sizeX*g.sizeY)});
 const rasters=new Map([[g.key,raster(g)],[h.key,raster(h)]]);
 rasters.get(h.key).nativeFloorValues[6*h.sizeX+5]=4;
 const p={area:g.key,factor:1,x:g.bounds.x+1,y:g.bounds.y+g.bounds.h-1,shape:{width:2,height:2,cellCount:4,runs:[{x:0,y:0,width:2},{x:0,y:1,width:2}]},object:{...o,itemId:'20500001',nativeType:'Building',layer:'other'}};
 const x=h.bounds.x+5.1,y=h.bounds.y+h.bounds.h-6.1;
 assert.equal(mainlandTransferCandidate(p,[g,h],rasters,emptyWorldTimeline(),x,y),null);
 const move=mainlandTransferCandidate(p,[g,h],rasters,emptyWorldTimeline(),x,y,true);
 assert.ok(move);assert.equal(move.area,h.key);assert.deepEqual([move.plan.x,move.plan.y],[5,6]);
 assert.equal(mainlandTransferCandidate({...p,object:{...p.object,subgrid:{}}},[g,h],rasters,emptyWorldTimeline(),x,y,true),null);
 for(const itemId of ['20000001','20100001','20200001','20300001']){
  const building={...p,object:{...p.object,itemId,shapeKey:itemId+':8'}};
  assert.equal(mainlandTransferCandidate(building,[g,h],rasters,emptyWorldTimeline(),x,y),null);
  const transfer=mainlandTransferCandidate(building,[g,h],rasters,emptyWorldTimeline(),x,y,true);
  assert.ok(transfer);assert.equal(transfer.plan.itemId,itemId);assert.equal(transfer.area,h.key);
  assert.equal(buildingSourceEligible(building),true);
  const second={...building,object:{...building.object,localOrdinal:2}};
  assert.equal(buildingPlacementSources([g,h],[second,building]).get(Number(itemId)),building);
  assert.equal(buildingPlacementSources([h],[building]).size,0);
  assert.equal(buildingPlacementSources([g,h],[{...building,object:{...building.object,subgrid:{}}}]).size,0);
  assert.equal(buildingDuplicate([g,h],rasters,building,x,y)?.plan.action,'duplicate');
  assert.equal(buildingPickup(building,[])?.plan.action,'remove');
  assert.equal(buildingDuplicate([g,h],rasters,{...building,object:{...building.object,subgrid:{}}},x,y),null);
  assert.equal(mainlandTransferCandidate({...building,object:{...building.object,subgrid:{}}},[g,h],rasters,emptyWorldTimeline(),x,y,true),null);
 }
 assert.equal(mainlandTransferCandidate({...p,object:{...p.object,itemId:'20400001'}},[g,h],rasters,emptyWorldTimeline(),x,y,true),null);
 const landscape={...p,object:{...o,itemId:'40200001',layer:'landscape',shapeKey:'40200001:8',editRestrictions:{...o.editRestrictions,switchGrid:'denied'}}};
 assert.equal(mainlandTransferCandidate(landscape,[g,h],rasters,emptyWorldTimeline(),x,y),null);
 const moved=mainlandTransferCandidate(landscape,[g,h],rasters,emptyWorldTimeline(),x,y,true);
 assert.ok(moved);assert.equal(moved.area,h.key);assert.equal(moved.plan.itemId,'40200001');
 assert.deepEqual(parseReplayStep({command:'transfer-export',plan:moved.plan}),{command:'transfer-export',plan:moved.plan});
 assert.equal(mainlandTransferCandidate({...landscape,object:{...landscape.object,subgrid:{}}},[g,h],rasters,emptyWorldTimeline(),x,y,true),null);
 assert.equal(mainlandTransferCandidate(landscape,[g,h],rasters,emptyWorldTimeline(),1e9,-1e9,true),null);
});

import {EIGHT_WAY_ORIENTATIONS,worldOrientationCode} from '../src/lib/world/saved-map-transform.ts';
import {stageWorldEdit,projectWorldEdits} from '../src/lib/world/saved-map-batch.ts';
test('45-degree furniture rotation stages and projects native shape code without widening other types',()=>{
 const shape={width:2,height:2,cellCount:4,runs:[{x:0,y:0,width:2},{x:0,y:1,width:2}]};
 const map={objects:[o],shapes:{[o.shapeKey]:shape,'40000001:10':shape}};
 assert.deepEqual(EIGHT_WAY_ORIENTATIONS.map(worldOrientationCode),[0,2,4,6,8,10,12,14]);
 const turn='GridOrientation_DownLeft';
 assert.equal(draftSavedMapTransform(o,1,1,turn),null);
 const t=stageWorldEdit(map,emptyWorldTimeline(),1,1,1,turn,'test',true);
 assert.ok(t);assert.equal(currentWorldEdits(t)[0].plan.replacementOrientation,turn);
 const p=projectWorldEdits(map,currentWorldEdits(t)).objects[0];
 assert.equal(p.orientationCode,10);assert.equal(p.shapeKey,'40000001:10');
 assert.equal(draftSavedMapTransform({...o,itemId:'20500001',nativeType:'Building'},1,1,turn,true),null);
 assert.equal(draftSavedMapTransform({...o,subgrid:{}},1,1,turn,true),null);
 assert.equal(draftSavedMapTransform({...o,itemId:'40100001',layer:'ground'},1,1,turn,true),null);
});

import {stockPlacement,stockPickup} from '../src/lib/world/save-furniture-placement.ts';
test('oblique stock placement and duplicate preserve the selected shape and orientation',()=>{
 const g=bindMainlandGrid({key:'Beach',layoutId:'SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json',gridDataPath:'GridData/Villages/Village04-BeachLevel-GridData.json',gridIdNative:0,factor:1,sizeX:400,sizeY:350});assert.ok(g);
 const r={sizeX:400,sizeY:350,nativeFloorValues:new Uint32Array(400*350)};
 const shape={width:2,height:2,cellCount:2,runs:[{x:0,y:0,width:1},{x:1,y:1,width:1}]};
 const id=40000001,orientation='GridOrientation_DownLeft',def={itemId:id,layer:'furniture',surfaceCapable:false,shapes:{[id+':10']:shape}};
 const defs=new Map([[1,def]]),rasters=new Map([[g.key,r]]),x=g.bounds.x+5.1,y=g.bounds.y+g.bounds.h-6.1;
 assert.equal(stockPlacement([g],rasters,defs,id,orientation,x,y,null,false),null);
 const placed=stockPlacement([g],rasters,defs,id,orientation,x,y,null,true);assert.ok(placed);assert.equal(placed.plan.orientation,orientation);assert.equal(placed.shape,shape);
 const p={area:g.key,factor:1,x:g.bounds.x+1,y:g.bounds.y+g.bounds.h-1,shape,object:{...o,orientation}};
 assert.equal(stockPlacement([g],rasters,defs,id,orientation,x,y,p,true)?.plan.action,'duplicate');assert.equal(stockPickup(p,true)?.plan.action,'remove');
 assert.equal(stockPlacement([g],rasters,new Map([[1,{...def,surfaceCapable:true}]]),id,orientation,x,y,null,true),null);
});

import {captureHousePoses,reviewHouseLayout,housePoseRows} from '../src/lib/world/player-house-backup.ts';
test('world house backup preserves repeated exterior poses and requires every existing skin',()=>{
 const g=bindMainlandGrid({key:'Beach',layoutId:'SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json',gridDataPath:'GridData/Villages/Village04-BeachLevel-GridData.json',gridIdNative:0,factor:1,sizeX:400,sizeY:350});
 const h=bindMainlandGrid({key:'Meadow',layoutId:'SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json',gridDataPath:'GridData/Villages/Village04-MeadowLevel-GridData.json',gridIdNative:0,factor:1,sizeX:196,sizeY:100});
 const p={area:g.key,factor:1,shape:{width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}]},object:{...o,itemId:'20500001',nativeType:'Building'}};
 const rows=captureHousePoses(g,[p,p]);assert.equal(rows.length,2);
 const objects=new Map([[g.key,[p,p]],[h.key,[]]]),wanted={itemId:20500001,x:2,y:3,orientation:1};
 const incoming=new Map([[g.key,{houses:[]}],[h.key,{houses:[wanted,wanted,wanted]}]]);
 const result=reviewHouseLayout([g,h],objects,incoming,true);
 assert.ok(result);assert.equal(result.removed,2);assert.equal(result.added,3);assert.equal(result.plans.get(h.key).after.length,3);
 assert.equal(reviewHouseLayout([g,h],objects,incoming,false),null);
 assert.equal(reviewHouseLayout([g,h],objects,new Map([[g.key,{houses:[]}],[h.key,{houses:[]}]]),true),null);
 assert.equal(reviewHouseLayout([g,h],objects,new Map([[g.key,{houses:[]}],[h.key,{houses:[{...wanted,itemId:20500002}]}]]),true),null);
 assert.throws(()=>housePoseRows([{...wanted,orientation:1.5}],h));
 assert.throws(()=>housePoseRows([{...wanted,PlayerHouseIndex:0}],h));
});

import {captureBuildingPoses,reviewBuildingLayout,buildingPoseRows} from '../src/lib/world/building-pose-backup.ts';
test('building layout restores only unambiguous existing same-grid objects',()=>{
 const g=bindMainlandGrid({key:'Beach',layoutId:'SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json',gridDataPath:'GridData/Villages/Village04-BeachLevel-GridData.json',gridIdNative:0,factor:1,sizeX:400,sizeY:350});
 const h=bindMainlandGrid({key:'Meadow',layoutId:'SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json',gridDataPath:'GridData/Villages/Village04-MeadowLevel-GridData.json',gridIdNative:0,factor:1,sizeX:196,sizeY:100});
 const p={area:g.key,factor:1,shape:{width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}]},object:{...o,itemId:'20100001',nativeType:'Building'}};
 const q={...p,object:{...p.object,localOrdinal:2,itemId:'20200001',x:4,y:5}};
 const rows=captureBuildingPoses(g,[p,q]);assert.equal(rows.length,2);
 const objects=new Map([[g.key,[p,q]],[h.key,[]]]),wanted=rows.map(p=>({...p,x:8,y:9,orientation:1}));
 const incoming=new Map([[g.key,{buildings:wanted}],[h.key,{buildings:[]}]]);
 const result=reviewBuildingLayout([g,h],objects,incoming,true);
 assert.ok(result);assert.equal(result.moved,2);assert.deepEqual(result.plans.get(g.key).after,wanted);
 assert.equal(reviewBuildingLayout([g,h],objects,incoming,false),null);
 assert.equal(reviewBuildingLayout([g,h],objects,new Map([[g.key,{buildings:[]}],[h.key,{buildings:wanted}]]),true),null);
 const expanded=reviewBuildingLayout([g,h],objects,new Map([[g.key,{buildings:[...wanted,wanted[0]]}],[h.key,{buildings:[]}]]),true);
 assert.ok(expanded);assert.equal(expanded.added,1);assert.equal(expanded.moved,2);
 assert.equal(expanded.plans.get(g.key).freePlacement,true);
 const extra={...p,object:{...p.object,localOrdinal:3,x:5,y:5}};
 const reduced=reviewBuildingLayout([g,h],new Map([[g.key,[p,q,extra]],[h.key,[]]]),new Map([[g.key,{buildings:rows}],[h.key,{buildings:[]}]]),true);
 assert.ok(reduced);assert.equal(reduced.removed,1);assert.equal(reduced.moved,0);
 const duplicate={...p,object:{...p.object,localOrdinal:3,x:5,y:5}};
 assert.equal(reviewBuildingLayout([g,h],new Map([[g.key,[p,duplicate]],[h.key,[]]]),new Map([[g.key,{buildings:[wanted[0],{...wanted[0],x:9}]}],[h.key,{buildings:[]}]]),true),null);
 assert.throws(()=>buildingPoseRows([{...wanted[0],itemId:20500001}],g));
 assert.deepEqual(captureBuildingPoses(g,[p,{...duplicate,shape:null}]),[]);
});

import {regionBuildingPoses,validateRegionBuildingPoses} from '../src/lib/world/region-decoration-backup.ts';
import {mainlandMapAnchor} from '../src/lib/world/mainland-world-coordinates.ts';
test('bounded building backups preserve outside and ambiguous instances',()=>{
 const g=bindMainlandGrid({key:'Beach',layoutId:'SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json',gridDataPath:'GridData/Villages/Village04-BeachLevel-GridData.json',gridIdNative:0,factor:1,sizeX:400,sizeY:350});assert.ok(g);
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}]};
 const make=(itemId,x,y,localOrdinal)=>({area:g.key,factor:1,...mainlandMapAnchor(g,x,y),shape,object:{...o,itemId:String(itemId),x,y,localOrdinal,nativeType:'Building'}});
 const a=make(20100001,2,2,1),b=make(20200001,8,8,2),origin=mainlandMapAnchor(g,0,0),region={x:origin.x,y:origin.y-6,w:6,h:6};
 const rows=regionBuildingPoses(region,g,[a,b]);assert.equal(rows.length,1);assert.equal(rows[0].itemId,20100001);
 const defs=new Map([[20100001,{shapes:{'20100001:4':shape}}]]);
 assert.equal(validateRegionBuildingPoses(region,g,[a,b],[{...rows[0],x:3,y:3}],defs),true);
 assert.equal(validateRegionBuildingPoses(region,g,[a,b],[{...rows[0],x:7,y:3}],defs),false);
 assert.equal(validateRegionBuildingPoses(region,g,[a,b],[{...rows[0],orientation:1}],defs),true);
 assert.equal(validateRegionBuildingPoses(region,g,[a,b],[{...rows[0],orientation:1}],new Map()),false);
 assert.equal(validateRegionBuildingPoses(region,g,[a,b],[{...rows[0],itemId:20200001}],defs),false);
 assert.equal(validateRegionBuildingPoses(region,g,[a,b],[rows[0],rows[0]],defs),false);
 const duplicate=make(20100001,9,9,3);
 assert.deepEqual(regionBuildingPoses(region,g,[a,duplicate,b]),[]);
 assert.equal(validateRegionBuildingPoses(region,g,[a,duplicate,b],rows,defs),false);
 const crossing=make(20100001,5,2,4);crossing.shape={width:2,height:1,cellCount:2,runs:[{x:0,y:0,width:2}]};
 assert.deepEqual(regionBuildingPoses(region,g,[crossing]),[]);
});
