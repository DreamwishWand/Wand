import test from 'node:test';import assert from 'node:assert/strict';import {indoorFloorGroups,indoorRoomRenamePlan,indoorRoomResizePlan,indoorAppendFloorPlan,indoorAddRoomPlan,indoorRemoveRoomPlan,indoorCeilingFinishPlan,indoorHouseGroups,parseIndoorRooms,indoorPositionPlot,indoorFurnitureEdits,indoorSwapPartners,indoorPickup,indoorGroupPickup,indoorDuplicateClip,indoorStorageDuplicateSelection,indoorStorageDuplicatePlacement,indoorGroupPlace,captureIndoorScene,indoorSceneClip,indoorScenePlacement,indoorMove,indoorGroupMove,indoorGroupRotate,indoorFreeGroupRotate,indoorPlace,indoorTransferPlace,captureIndoorCut,indoorGroupTransfer,rotateIndoorCut} from '../src/lib/world/indoor-room-view.ts';
const face={kind:'floor',ordinal:1,wallPosition:null,finish:40000001,gridStatus:'full',items:[{itemId:40000002,quantity:2}],positions:[{itemId:40000002,x:1,y:2,orientationCode:8}],factor:1,missingPositions:1};
const room={ordinal:1,house:1,floor:1,name:'Test',ceiling:null,surfaces:[face,{kind:'wall',ordinal:2,wallPosition:0,finish:0,gridStatus:'diff',items:[],positions:[],factor:null,missingPositions:0}]};
const report=rooms=>({contract:'wand.db05.indoor-rooms@1',rooms,geometryVerified:false,writerAuthorized:false});
test('room projection retains finish and zero separately from unknown, no grid identities',()=>{assert.deepEqual(parseIndoorRooms(report([room])),[room]);assert.throws(()=>parseIndoorRooms(report([{...room,gridId:42}])));assert.throws(()=>parseIndoorRooms(report([{...room,surfaces:[{...face,gridStatus:'shared'}]}])));assert.throws(()=>parseIndoorRooms({...report([room]),writerAuthorized:true}));});

test('indoor positions must reconcile with quantities; unknown coordinates are not invented',()=>{
 assert.throws(()=>parseIndoorRooms(report([{...room,surfaces:[{...face,missingPositions:0}]}])));
 assert.throws(()=>parseIndoorRooms(report([{...room,surfaces:[{...face,positions:[{itemId:40000003,x:1,y:2,orientationCode:8}]}]}])));
 assert.throws(()=>parseIndoorRooms(report([{...room,surfaces:[{...face,positions:[{itemId:40000002,x:1.5,y:2,orientationCode:8}]}]}])));
 const plot=indoorPositionPlot([{itemId:1,x:-2,y:3},{itemId:2,x:-2,y:3},{itemId:1,x:4,y:1}],1);
 assert.deepEqual(plot.points,[{x:-2,y:3,count:2,selected:1},{x:4,y:1,count:1,selected:1}]);assert.equal(plot.viewBox,'-3 0 8 4');assert.equal(indoorPositionPlot([]),null);
});

test('source footprint candidates extend the view without inventing room dimensions',()=>{const p={itemId:1,x:2,y:3,orientationCode:8};const q=indoorPositionPlot([p],1,{'1:8':{width:3,height:2,path:'M0 0h3v2H0Z'}});assert.equal(q.viewBox,'1 2 5 4');assert.equal(q.footprints.length,1);assert.equal(indoorPositionPlot([{...p,orientationCode:null}],1,{'1:8':{width:3,height:2,path:'M0 0h3v2H0Z'}}).footprints.length,0);});

test('indoor edits preserve identical occupied shapes, reject overlap and missing geometry, and use exact stock',()=>{
 const a={itemId:40000001,x:1,y:2,orientationCode:8},b={itemId:40000002,x:3,y:2,orientationCode:8};
 const full={...face,items:[{itemId:a.itemId,quantity:1},{itemId:b.itemId,quantity:1}],positions:[a,b],missingPositions:0};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1,path:'M0 0h1v1H0Z'};
 const shapes={'40000001:8':shape,'40000001:12':shape,'40000002:8':shape};
 const allowed=new Set([a.itemId,b.itemId]);
 assert.equal(indoorFurnitureEdits(full,shapes,allowed,0,null,1)[0].orientation,'GridOrientation_Left');
 assert.deepEqual(indoorSwapPartners(full,shapes,allowed,0),[1]);
 assert.equal(indoorFurnitureEdits(full,shapes,allowed,0,1,1)[0].x,3);
 assert.equal(indoorFurnitureEdits({...full,positions:[a,{...b,x:1}]},shapes,allowed,0,null,1),null);
 assert.equal(indoorFurnitureEdits(full,{'40000001:8':shape,'40000001:12':shape},allowed,0,null,1),null);
 assert.equal(indoorFurnitureEdits({...full,missingPositions:1},shapes,allowed,0,null,1),null);
 assert.equal(indoorPickup(full,0,allowed,new Map()),null);
 assert.equal(indoorPickup(full,0,allowed,new Map([[a.itemId,0]])).expectedStock,0);
});

test('source-bound room raster enables exact free placement and rejects blocked cells and overlaps',()=>{
 const a={itemId:40000001,x:1,y:1,orientationCode:8},b={itemId:40000002,x:2,y:1,orientationCode:8};
 const terrain={sizeX:4,sizeY:3,nativeFloorValues:Uint32Array.from([0,1024,1024,1024,1024,1024,1024,1024,1024,1024,1024,1024])};
 const full={...face,items:[{itemId:a.itemId,quantity:1},{itemId:b.itemId,quantity:1}],positions:[a,b],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'};
 const shapes={'40000001:8':shape,'40000001:12':shape,'40000002:8':shape},allowed=new Set([a.itemId,b.itemId]),stock=new Map([[a.itemId,2]]);
 assert.equal(indoorMove(full,shapes,allowed,0,3,2)[0].x,3);
 assert.equal(indoorMove(full,shapes,allowed,0,2,1),null);
 assert.equal(indoorMove(full,shapes,allowed,0,0,0),null);
 assert.equal(indoorMove({...full,terrain:undefined},shapes,allowed,0,3,2),null);
 assert.equal(indoorPlace(full,shapes,allowed,stock,a.itemId,3,2,'GridOrientation_Down').expectedStock,2);
 assert.equal(indoorPlace(full,shapes,allowed,stock,a.itemId,4,2,'GridOrientation_Down'),null);
 assert.equal(indoorPlace(full,shapes,allowed,stock,a.itemId,0,0,'GridOrientation_Down'),null);
 const wire={...full,terrain:{sizeX:4,sizeY:3,values:[...terrain.nativeFloorValues]}};
 assert.deepEqual(parseIndoorRooms(report([{...room,surfaces:[wire]}]))[0].surfaces[0].terrain,terrain);
 assert.throws(()=>parseIndoorRooms(report([{...room,surfaces:[{...wire,terrain:{...wire.terrain,values:[1024]}}]}])));
});

test('cut furniture placement requires source room floor but no inventory',()=>{
 const terrain={sizeX:3,sizeY:2,nativeFloorValues:Uint32Array.from([0,1024,1024,1024,1024,1024])};
 const full={...face,items:[{itemId:40000002,quantity:1}],positions:[{itemId:40000002,x:1,y:0,orientationCode:8}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'};
 const shapes={'40000001:8':shape,'40000002:8':shape},allowed=new Set([40000001,40000002]);
 assert.deepEqual(indoorTransferPlace(full,shapes,allowed,40000001,2,1,'GridOrientation_Down'),{itemId:40000001,x:2,y:1,orientation:'GridOrientation_Down'});
 for(const [x,y] of [[0,0],[1,0],[3,1]])assert.equal(indoorTransferPlace(full,shapes,allowed,40000001,x,y,'GridOrientation_Down'),null);
 assert.equal(indoorTransferPlace({...full,kind:'wall'},shapes,allowed,40000001,2,1,'GridOrientation_Down'),null);
 assert.equal(indoorTransferPlace(full,shapes,new Set(),40000001,2,1,'GridOrientation_Down'),null);
});

test('room group capture and paste retains relative half-cell offsets and is atomic',()=>{
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>1024)};
 const full={...face,items:[{itemId:40000001,quantity:2}],positions:[{itemId:40000001,x:1,y:1,orientationCode:8},{itemId:40000001,x:3,y:1,orientationCode:8}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'};
 const shapes=Object.fromEntries([0,4,8,12].map(code=>['40000001:'+code,shape])),allowed=new Set([40000001]);
 const group=captureIndoorCut(full,1,[0,1],shapes,allowed,allowed);
 assert.deepEqual(group.clip.map(p=>[p.dx,p.dy]),[[0,0],[4,0]]);
 assert.deepEqual(group.rows.map(p=>p.roomSource.index),[0,1]);
 const empty={...full,items:[],positions:[]};
 const placed=indoorGroupTransfer(empty,shapes,allowed,group.rows,group.clip,2,3);
 assert.deepEqual(placed.map(p=>[p.x,p.y]),[[2,3],[4,3]]);
 assert.equal(indoorGroupTransfer(empty,shapes,allowed,group.rows,group.clip,7,3),null);
 assert.equal(indoorGroupTransfer(full,shapes,allowed,group.rows,group.clip,1,1),null);
 assert.equal(indoorGroupTransfer(empty,shapes,allowed,group.rows,[group.clip[0],group.clip[0]],2,3),null);
 assert.equal(indoorGroupTransfer(empty,shapes,allowed,group.rows,[group.clip[0],{...group.clip[1],dx:1}],2,3),null);
 assert.deepEqual(rotateIndoorCut(group.clip,1,shapes,1).map(p=>[p.dx,p.dy,p.orientation]),[[0,0,1],[0,4,1]]);
 assert.equal(captureIndoorCut(full,1,[0,0],shapes,allowed,allowed),null);
});

test('room group translation reuses selected old cells and rejects stationary footprint conflicts',()=>{
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>1024)};
 const full={...face,positions:[{itemId:40000001,x:1,y:1,orientationCode:8},{itemId:40000001,x:2,y:1,orientationCode:8},{itemId:40000001,x:4,y:1,orientationCode:8}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes={'40000001:8':shape},allowed=new Set([40000001]);
 assert.deepEqual(indoorGroupMove(full,shapes,allowed,[0,1],0,2,1).map(p=>[p.index,p.x,p.y]),[[0,2,1],[1,3,1]]);
 assert.equal(indoorGroupMove(full,shapes,allowed,[0,1],0,3,1),null);
 assert.equal(indoorGroupMove(full,shapes,allowed,[0,1],0,7,1),null);
 assert.equal(indoorGroupMove(full,shapes,allowed,[0,0],0,2,1),null);
 assert.equal(indoorGroupMove(full,{},allowed,[0,1],0,2,1),null);
});

test('room group rotation uses native rotated footprints and rejects blocked targets',()=>{
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>1024)};
 const full={...face,positions:[{itemId:40000001,x:1,y:1,orientationCode:8},{itemId:40000001,x:3,y:1,orientationCode:8}],missingPositions:0,terrain};
 const wide={width:2,height:1,cellCount:2,runs:[{x:0,y:0,width:2}],acceptedFloorTypesFlag:1024,path:'M0 0h2v1H0Z'};
 const tall={width:1,height:2,cellCount:2,runs:[{x:0,y:0,width:1},{x:0,y:1,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v2H0Z'};
 const shapes={'40000001:8':wide,'40000001:4':tall,'40000001:12':tall},allowed=new Set([40000001]);
 const result=indoorGroupRotate(full,shapes,allowed,[0,1],1);
 assert.deepEqual(result?.map(p=>[p.index,p.x,p.y,p.orientation]),[[0,1,1,'GridOrientation_Right'],[1,1,3,'GridOrientation_Right']]);
 assert.equal(indoorGroupRotate({...full,positions:[...full.positions,{itemId:40000001,x:1,y:3,orientationCode:8}]},shapes,allowed,[0,1],1),null);
 assert.equal(indoorGroupRotate(full,{'40000001:8':wide},allowed,[0,1],1),null);
 assert.equal(indoorGroupRotate(full,shapes,new Set(),[0,1],1),null);
});

test('room group stock pickup and duplicate account for repeated item IDs atomically',()=>{
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>1024)};
 const full={...face,positions:[{itemId:40000001,x:1,y:1,orientationCode:8},{itemId:40000001,x:3,y:1,orientationCode:8}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes={'40000001:8':shape},allowed=new Set([40000001]),stock=new Map([[40000001,2]]);
 assert.deepEqual(indoorGroupPickup(full,[0,1],allowed,stock).map(p=>p.expectedStock),[2,2]);
 assert.equal(indoorGroupPickup(full,[0,1],allowed,new Map([[40000001,2147483646]])),null);
 const clip=indoorDuplicateClip(full,[0,1],shapes,allowed,stock);
 assert.deepEqual(clip.map(p=>p.dx),[0,4]);
 assert.equal(indoorDuplicateClip(full,[0,1],shapes,allowed,new Map([[40000001,1]])),null);
 assert.deepEqual(indoorGroupPlace(full,shapes,allowed,stock,clip,1,3).map(p=>[p.x,p.y,p.expectedStock]),[[1,3,2],[3,3,1]]);
 assert.equal(indoorGroupPlace(full,shapes,allowed,stock,clip,1,1),null);
 assert.equal(indoorGroupPlace(full,shapes,allowed,stock,clip,7,3),null);
});

test('indoor Scene shares the portable format, requires plain witnesses and exact stock',()=>{
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>1024)};
 const full={...face,positions:[{itemId:40000001,x:1,y:1,orientationCode:8,plain:true},{itemId:40000001,x:3,y:1,orientationCode:8,plain:true}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes={'40000001:8':shape},allowed=new Set([40000001]),stock=new Map([[40000001,2]]);
 const scene=captureIndoorScene(full,[0,1],shapes,allowed);
 assert.equal(scene.schema,'wand.preset.scene@1');assert.deepEqual(scene.items.map(p=>p.dx),[0,2]);
 const {clip,anchor}=indoorSceneClip(JSON.stringify(scene),1);
 assert.deepEqual(clip.map(p=>p.dx),[0,4]);assert.equal(anchor,'corner');
 assert.deepEqual(indoorScenePlacement(full,shapes,allowed,stock,clip,'center',2,3).map(p=>[p.x,p.y]),[[1,3],[3,3]]);
 assert.equal(indoorScenePlacement(full,shapes,allowed,new Map([[40000001,1]]),clip,anchor,1,3),null);
 assert.equal(captureIndoorScene({...full,positions:[full.positions[0],{...full.positions[1],plain:undefined}]},[0,1],shapes,allowed),null);
 assert.throws(()=>indoorSceneClip(JSON.stringify({...scene,items:[{...scene.items[0],itemId:40200001}]}),1));
});

test('portable mixed indoor Scene preserves support closure and charges child stock before the next root',async()=>{
 const {captureIndoorMixedScene,indoorMixedScene,indoorMixedPlacement}=await import('../src/lib/world/indoor-room-view.ts');
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>1024)};
 const full={...face,positions:[{itemId:40000001,x:1,y:1,orientationCode:8},{itemId:40000002,x:3,y:1,orientationCode:8,plain:true}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes={'40000001:8':shape,'40000002:8':shape},allowed=new Set([40000001,40000002]);
 const support={schema:'wand.preset.support-scene@1',gameVersion:'1.26.2',ownerItemId:40000001,tree:{factor:1,sourcePath:'GridData/Furniture/Test.json',objects:[{itemId:40000002,x:0,y:0,orientation:'GridOrientation_Down',child:null}]}};
 const scene=captureIndoorMixedScene(full,[0,1],shapes,allowed,new Map([[0,support]]));
 assert.equal(scene.schema,'wand.preset.mixed-scene@1');assert.deepEqual(scene.items.map(p=>p.dx),[0,4]);
 assert.deepEqual(indoorMixedScene(JSON.stringify(scene)),scene);
 const clip=scene.items.map(({support,...pose})=>pose);
 const stock=new Map([[40000001,1],[40000002,2]]);
 const result=indoorMixedPlacement(full,shapes,allowed,stock,clip,scene,'corner',1,3);
 assert.deepEqual(result.map(r=>[r.x,r.y,r.expectedStock]),[[1,3,1],[3,3,1]]);
 assert.deepEqual(result[0].scene,support);
 assert.equal(indoorMixedPlacement(full,shapes,allowed,new Map([[40000001,1],[40000002,1]]),clip,scene,'corner',1,3),null);
 assert.equal(captureIndoorMixedScene(full,[0,1],shapes,allowed,new Map()),null);
 assert.equal(indoorMixedPlacement(full,shapes,allowed,stock,clip,scene,'corner',1,1),null);
 const freeFace={...full,sourcePath:'GridData/Rooms/Room8x8-GridData.json'};
 const free=indoorMixedPlacement(freeFace,shapes,allowed,stock,clip,scene,'corner',1,1,null,null,false,true);
 assert.ok(free);assert.deepEqual(free.map(p=>[p.x,p.y]),[[1,1],[3,1]]);assert.deepEqual(free[0].scene,support);
 assert.equal(indoorMixedPlacement(freeFace,shapes,allowed,stock,clip,scene,'corner',7,7,null,null,false,true),null);
 const diagonalFace={...freeFace,positions:[freeFace.positions[0],{...freeFace.positions[1],orientationCode:10}]};
 const diagonalShapes={...shapes,'40000002:10':shape};
 const diagonal=captureIndoorMixedScene(diagonalFace,[0,1],diagonalShapes,allowed,new Map([[0,support]]),false,true);
 assert.ok(diagonal);assert.equal(diagonal.items[1].orientation,2.5);
 const diagonalClip=diagonal.items.map(({support,...pose})=>pose);
 assert.equal(indoorMixedPlacement(diagonalFace,diagonalShapes,allowed,stock,diagonalClip,diagonal,'corner',1,1,null,null,false,true)[1].orientation,'GridOrientation_DownLeft');
 assert.equal(indoorMixedPlacement(diagonalFace,diagonalShapes,allowed,stock,diagonalClip,diagonal,'corner',1,1),null);
 assert.equal(indoorMixedPlacement(diagonalFace,diagonalShapes,allowed,stock,[{...diagonalClip[0],orientation:2.5},diagonalClip[1]],diagonal,'corner',1,1,null,null,false,true),null);
});

test('room cut carries support witness only to matching native factor',()=>{
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>1024)};
 const source={...face,positions:[{itemId:40000001,x:1,y:1,orientationCode:8}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes={'40000001:8':shape},allowed=new Set([40000001]);
 const group=captureIndoorCut(source,1,[0],shapes,allowed,allowed,new Set([0]));
 assert.equal(group.rows[0].supportFactor,1);
 const dest={...source,positions:[]};
 assert.equal(indoorGroupTransfer(dest,shapes,allowed,group.rows,group.clip,2,2)[0].supportFactor,1);
 assert.equal(indoorGroupTransfer({...dest,factor:2},shapes,allowed,group.rows,group.clip,2,2),null);
});

test('mixed indoor pickup flags exact support roots without dropping ordinary rows',()=>{
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>1024)};
 const full={...face,positions:[{itemId:40000001,x:1,y:1,orientationCode:8},{itemId:40000001,x:3,y:1,orientationCode:8}],missingPositions:0,terrain};
 const rows=indoorGroupPickup(full,[0,1],new Set([40000001]),new Map([[40000001,2]]),new Set([0]));
 assert.equal(rows[0].includeSupport,true);assert.equal(rows[1].includeSupport,undefined);
 assert.equal(indoorGroupPickup(full,[0,0],new Set([40000001]),new Map([[40000001,2]]),new Set([0])),null);
});

test('room alignment uses shape edges and rejects overlap; symmetry preserves native footprints',async()=>{
 const {indoorAlign,indoorSymmetricDuplicate}=await import('../src/lib/world/indoor-room-view.ts');
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>1024)};
 const full={...face,positions:[{itemId:40000001,x:1,y:1,orientationCode:8,plain:true},{itemId:40000001,x:3,y:3,orientationCode:8,plain:true}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes={'40000001:8':shape,'40000001:0':shape},allowed=new Set([40000001]);
 assert.deepEqual(indoorAlign(full,shapes,allowed,[0,1],'left').map(p=>[p.index,p.x,p.y]),[[1,1,3]]);
 assert.equal(indoorAlign({...full,positions:[full.positions[0],{...full.positions[1],y:1}]},shapes,allowed,[0,1],'left'),null);
 assert.deepEqual(indoorSymmetricDuplicate(full,shapes,allowed,new Map([[40000001,2]]),[0,1],{mode:'vertical',x2:8,y2:0}).map(p=>[p.x,p.y]),[[6,1],[4,3]]);
 assert.equal(indoorSymmetricDuplicate({...full,positions:[{...full.positions[0],plain:undefined},full.positions[1]]},shapes,allowed,new Map([[40000001,2]]),[0,1],{mode:'vertical',x2:8,y2:0}),null);
});

test('linked room move translates exact mirrored pairs and rejects missing partners',async()=>{
 const {indoorLinkedMove}=await import('../src/lib/world/indoor-room-view.ts');
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>1024)};
 const full={...face,positions:[{itemId:40000001,x:1,y:1,orientationCode:8,plain:true},{itemId:40000001,x:6,y:1,orientationCode:8,plain:true}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes={'40000001:8':shape},allowed=new Set([40000001]),axis={mode:'vertical',x2:8,y2:0};
 assert.deepEqual(indoorLinkedMove(full,shapes,allowed,[0],0,2,2,axis).map(p=>[p.index,p.x,p.y]),[[0,2,2],[1,5,2]]);
 assert.equal(indoorLinkedMove({...full,positions:[full.positions[0]]},shapes,allowed,[0],0,2,2,axis),null);
});

test('linked room rotation and placement use exact native pairs and joint stock',async()=>{
 const {indoorLinkedRotate,indoorLinkedPlacement}=await import('../src/lib/world/indoor-room-view.ts');
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>1024)};
 const full={...face,positions:[{itemId:40000001,x:1,y:1,orientationCode:8,plain:true},{itemId:40000001,x:6,y:1,orientationCode:8,plain:true}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes=Object.fromEntries([0,4,8,12].map(n=>['40000001:'+n,shape])),allowed=new Set([40000001]),axis={mode:'vertical',x2:8,y2:0};
 const rotated=indoorLinkedRotate(full,shapes,allowed,[0],1,axis);
 assert.deepEqual(rotated.map(p=>[p.index,p.orientation]),[[0,'GridOrientation_Left'],[1,'GridOrientation_Right']]);
 const clip=[{itemId:40000001,dx:0,dy:0,orientation:2}];
 const rows=indoorLinkedPlacement(full,shapes,allowed,new Map([[40000001,2]]),clip,'corner',1,3,axis);
 assert.deepEqual(rows.map(p=>[p.x,p.y,p.expectedStock]),[[1,3,2],[6,3,1]]);
 assert.equal(indoorLinkedPlacement(full,shapes,allowed,new Map([[40000001,1]]),clip,'corner',1,3,axis),null);
});

import {indoorFreeRotate,indoorFreeMoveGroup,indoorHitIndices,indoorEditableTree} from '../src/lib/world/indoor-room-view.ts';
test('free floor editor restores repeated anchors and native diagonal Scene poses',()=>{
 const itemId=40000001,p={itemId,x:1,y:1,orientationCode:8,plain:true},b={...p,x:2,orientationCode:10};
 const floor={...face,positions:[p,b],items:[{itemId,quantity:2}],missingPositions:0,sourcePath:'GridData/Rooms/Room8x8-GridData.json',terrain:{sizeX:4,sizeY:4,nativeFloorValues:new Uint32Array(16)}};
 const shape={width:2,height:1,cellCount:2,runs:[{x:0,y:0,width:2}],acceptedFloorTypesFlag:1024,path:'M0 0h2v1H0Z'},shapes=Object.fromEntries([0,2,4,6,8,10,12,14].map(code=>[itemId+':'+code,shape]));
 const allowed=new Set([itemId]),stock=new Map([[itemId,2]]);
 assert.equal(indoorMove(floor,shapes,allowed,0,2,1),null);
 assert.equal(indoorMove(floor,shapes,allowed,0,2,1,undefined,true)[0].x,2);
 assert.equal(indoorFreeRotate(floor,shapes,allowed,0,1)[0].orientation,'GridOrientation_DownLeft');
 assert.deepEqual(indoorHitIndices(indoorEditableTree(floor),shapes,2,1),[0,1]);
 assert.equal(indoorFreeMoveGroup(floor,shapes,allowed,[0,1],0,1,0).length,2);
 assert.equal(indoorMove(floor,shapes,allowed,0,4,0,undefined,true),null);
 assert.equal(indoorMove({...floor,kind:'wall'},shapes,allowed,0,2,1,undefined,true),null);
 assert.equal(indoorMove({...floor,positions:[{...p,plain:undefined},b]},shapes,allowed,0,2,1,undefined,true),null);
 const scene=captureIndoorScene(floor,[0,1],shapes,allowed,true);assert.deepEqual(scene.items.map(p=>p.orientation),[2,2.5]);
 const clip=indoorSceneClip(JSON.stringify(scene),1,true).clip,rows=indoorGroupPlace(floor,shapes,allowed,stock,clip,2,1,true);assert.equal(rows.length,2);assert.equal(rows[1].orientation,'GridOrientation_DownLeft');assert.equal(rows[1].expectedStock,1);
 assert.throws(()=>indoorSceneClip(JSON.stringify(scene),1));
});

test('house navigator uses exact definition identity and keeps distinct house records',()=>{
 const a={...room,houseItemId:20500001},b={...a,ordinal:2,floor:2},c={...a,ordinal:3,house:2},d={...room,ordinal:4,house:3};
 const parsed=parseIndoorRooms(report([a,b,c,d]));
 assert.deepEqual(parsed,[a,b,c,d]);
 assert.deepEqual(indoorHouseGroups(parsed),[{house:1,itemId:20500001,firstIndex:0,roomCount:2},{house:2,itemId:20500001,firstIndex:2,roomCount:1},{house:3,firstIndex:3,roomCount:1}]);
 assert.throws(()=>parseIndoorRooms(report([{...a,houseItemId:40000001}])));
 assert.throws(()=>parseIndoorRooms(report([{...a,gridId:42}])));
 assert.deepEqual(indoorHouseGroups([a,{...b,houseItemId:20500002}]),[{house:1,firstIndex:0,roomCount:2}]);
});

test('room rename requires a source-confirmed existing name and retains Unicode',()=>{
 const r=parseIndoorRooms(report([{...room,nameEditable:true}]))[0];
 assert.deepEqual(indoorRoomRenamePlan(r,'書斎 🌿'),{roomOrdinal:1,expected:'Test',name:'書斎 🌿'});
 assert.deepEqual(indoorRoomRenamePlan(r,''),{roomOrdinal:1,expected:'Test',name:''});
 for(const name of ['Test','x'.repeat(129),'\n','\ud800'])assert.equal(indoorRoomRenamePlan(r,name),null);
 assert.equal(indoorRoomRenamePlan(room,'new'),null);
 assert.throws(()=>parseIndoorRooms(report([{...room,nameEditable:false}])));
});

test('room slots distinguish sparse rooms and floor navigation preserves global ordinals',()=>{
 const rows=[{...room,roomSlot:0},{...room,ordinal:2,roomSlot:2},{...room,ordinal:3,floor:2,roomSlot:0},{...room,ordinal:4,house:2,roomSlot:0}];
 const parsed=parseIndoorRooms(report(rows));
 assert.deepEqual(indoorFloorGroups(parsed,1).map(g=>[g.floor,g.firstIndex,g.rooms.map(({r})=>r.roomSlot)]),[[1,0,[0,2]],[2,2,[0]]]);
 assert.deepEqual(indoorFloorGroups(parsed,2).map(g=>g.firstIndex),[3]);
 assert.throws(()=>parseIndoorRooms(report([rows[0],{...rows[1],roomSlot:0}])));
 assert.throws(()=>parseIndoorRooms(report([{...rows[0],roomSlot:4}])));
});

test('protected room positions remain visible but cannot be returned to stock',()=>{
 const f={...face,positions:[{...face.positions[0],protected:true}],items:[{itemId:40000002,quantity:1}],missingPositions:0};
 const parsed=parseIndoorRooms(report([{...room,surfaces:[f]}]))[0].surfaces[0];
 assert.equal(parsed.positions[0].protected,true);
 assert.equal(indoorPickup(parsed,0,new Set([40000002]),new Map([[40000002,0]])),null);
 assert.throws(()=>parseIndoorRooms(report([{...room,surfaces:[{...f,positions:[{...f.positions[0],plain:true}]}]}])));
});

test('room resize is offered only by the verified projection',()=>{
 const r={...room,resize:{current:'6x6',options:['3x3','12x12']}};
 const p=parseIndoorRooms(report([r]))[0];
 assert.deepEqual(indoorRoomResizePlan(p,'12x12'),{roomOrdinal:1,expected:'6x6',size:'12x12'});
 assert.equal(indoorRoomResizePlan(p,'8x3'),null);
 assert.equal(indoorRoomResizePlan(p,'6x6'),null);
 assert.equal(indoorRoomResizePlan(room,'3x3'),null);
 assert.throws(()=>parseIndoorRooms(report([{...r,resize:{current:'6x6',options:['6x6']}}])));
 assert.throws(()=>parseIndoorRooms(report([{...r,resize:{current:'6x6',options:['3x3','3x3']}}])));
});

test('append floor uses exact primary house and current floor count',()=>{
 const r={...room,houseItemId:20500000,roomSlot:0,appendFloorCount:3};
 const v=parseIndoorRooms(report([r]))[0];
 assert.deepEqual(indoorAppendFloorPlan(v),{house:1,houseItemId:20500000,expectedCount:3});
 assert.equal(indoorAppendFloorPlan(room),null);
 assert.throws(()=>parseIndoorRooms(report([{...r,appendFloorCount:128}])));
 assert.equal(indoorAppendFloorPlan({...v,appendFloorCount:20}),null);
 assert.deepEqual(indoorAppendFloorPlan({...v,appendFloorCount:20},2,true),{house:1,houseItemId:20500000,expectedCount:20,count:2,extended:true});
 assert.deepEqual(indoorAppendFloorPlan(v,4),{house:1,houseItemId:20500000,expectedCount:3,count:4});
 assert.equal(indoorAppendFloorPlan(v,1,true),null);
 assert.throws(()=>parseIndoorRooms(report([{...r,houseItemId:20500001}])));
 assert.throws(()=>parseIndoorRooms(report([{...r,roomSlot:1}])));
});

test('room addition only offers source-confirmed slots and sizes',()=>{
 const r={...room,houseItemId:20500000,roomSlot:0,addRoomSlots:[1,3],addRoomSizes:['3x3','8x8','12x12']};
 const p=parseIndoorRooms(report([r]))[0];
 assert.deepEqual(indoorAddRoomPlan(p,3,'12x12'),{house:1,houseItemId:20500000,floor:1,slot:3,size:'12x12'});
 assert.equal(indoorAddRoomPlan(p,2,'12x12'),null);
 assert.equal(indoorAddRoomPlan(p,1,'8x8').size,'8x8');
 assert.equal(indoorAddRoomPlan(p,1,'8x3'),null);
 assert.throws(()=>parseIndoorRooms(report([{...r,addRoomSizes:undefined}])));
 assert.throws(()=>parseIndoorRooms(report([{...r,addRoomSizes:['3x3','3x3']}])));
 assert.throws(()=>parseIndoorRooms(report([{...r,addRoomSlots:[0]}])));
});

test('removal requires a verified empty room or last floor projection',()=>{
 const r={...room,houseItemId:20500000,roomSlot:1,removeKind:'room'};
 const p=parseIndoorRooms(report([r]))[0];
 assert.deepEqual(indoorRemoveRoomPlan(p),{house:1,houseItemId:20500000,floor:1,slot:1,kind:'room'});
 assert.equal(indoorRemoveRoomPlan(room),null);
 assert.throws(()=>parseIndoorRooms(report([{...r,roomSlot:0}])));
 assert.throws(()=>parseIndoorRooms(report([{...r,roomSlot:0,removeKind:'floor'}])));
 assert.equal(indoorRemoveRoomPlan(parseIndoorRooms(report([{...r,roomSlot:0,floor:2,removeKind:'floor'}]))[0]).kind,'floor');
});

test('occupied resize marks anchor-only options explicitly',()=>{
 const r={...room,resize:{current:'6x6',options:['6x8'],anchorOptions:['12x12']}};
 const p=parseIndoorRooms(report([r]))[0];
 assert.deepEqual(indoorRoomResizePlan(p,'12x12'),{roomOrdinal:1,expected:'6x6',size:'12x12',preserveAnchors:true});
 assert.deepEqual(indoorRoomResizePlan(p,'6x8'),{roomOrdinal:1,expected:'6x6',size:'6x8'});
 assert.throws(()=>parseIndoorRooms(report([{...r,resize:{...r.resize,anchorOptions:['6x8']}}])));
});

test('shrink recovery requires explicit size and exact return count',()=>{
 const r={...room,resize:{current:'6x6',options:[],recoveryOptions:[['3x3',2]]}};
 const p=parseIndoorRooms(report([r]))[0];
 assert.deepEqual(indoorRoomResizePlan(p,'3x3'),{roomOrdinal:1,expected:'6x6',size:'3x3',recoverCount:2});
 assert.throws(()=>parseIndoorRooms(report([{...r,resize:{...r.resize,recoveryOptions:[['3x3',0]]}}])));
 assert.throws(()=>parseIndoorRooms(report([{...r,resize:{...r.resize,options:['3x3']}}])));
});

test('removal plan carries explicit recovered furniture count',()=>{
 const r={...room,houseItemId:20500000,roomSlot:0,floor:2,removeKind:'floor',removeRecoverCount:7};
 const p=parseIndoorRooms(report([r]))[0];
 assert.deepEqual(indoorRemoveRoomPlan(p),{house:1,houseItemId:20500000,floor:2,slot:0,kind:'floor',recoverCount:7});
 assert.throws(()=>parseIndoorRooms(report([{...r,removeRecoverCount:0}])));
 assert.throws(()=>parseIndoorRooms(report([{...r,removeKind:undefined}])));
});
test('ceiling plan uses existing scalar and only flooring IDs',()=>{
 const r={...room,ceiling:160100136,surfaces:[{...room.surfaces[0]},...Array.from({length:4},(_,i)=>({...room.surfaces[0],kind:'wall',wallPosition:i,ordinal:i+2}))]};
 assert.deepEqual(indoorCeilingFinishPlan(r,160100031),{roomOrdinal:1,itemId:160100031,kind:'ceiling',wall:null,expected:160100136});
 assert.equal(indoorCeilingFinishPlan(r,160000000),null);
 assert.equal(indoorCeilingFinishPlan(r,160100136),null);
 assert.equal(indoorCeilingFinishPlan({...r,ceiling:null},160100031),null);
});

test('free room group quarter turns allow overlap and diagonal poses but preserve eligibility and bounds',()=>{
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>0)};
 const full={...face,kind:'floor',sourcePath:'GridData/Rooms/Room8x8-GridData.json',factor:1,positions:[{itemId:40000001,x:1,y:1,orientationCode:10,plain:true},{itemId:40000001,x:3,y:1,orientationCode:8,plain:true},{itemId:40000001,x:1,y:3,orientationCode:8}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'};
 const shapes=Object.fromEntries([0,2,4,6,8,10,12,14].map(code=>['40000001:'+code,shape])),allowed=new Set([40000001]);
 const result=indoorFreeGroupRotate(full,shapes,allowed,[0,1],1);
 assert.deepEqual(result?.map(p=>[p.index,p.x,p.y,p.orientation]),[[0,1,1,'GridOrientation_DownRight'],[1,1,3,'GridOrientation_Right']]);
 assert.equal(indoorFreeGroupRotate(full,shapes,allowed,[0,2],1),null);
 assert.equal(indoorFreeGroupRotate(full,shapes,allowed,[0,0],1),null);
 assert.equal(indoorFreeGroupRotate(full,shapes,new Set(),[0,1],1),null);
 assert.equal(indoorFreeGroupRotate({...full,terrain:{...terrain,sizeY:2}},shapes,allowed,[0,1],1),null);
});

test('free room alignment and spacing retain diagonal orientations and permit stationary overlap',async()=>{
 const {indoorAlign}=await import('../src/lib/world/indoor-room-view.ts');
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>0)};
 const full={...face,sourcePath:'GridData/Rooms/Room8x8-GridData.json',positions:[{itemId:40000001,x:1,y:1,orientationCode:10,plain:true},{itemId:40000001,x:2,y:2,orientationCode:8,plain:true},{itemId:40000001,x:7,y:3,orientationCode:8,plain:true},{itemId:40000002,x:4,y:2,orientationCode:8}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes={'40000001:8':shape,'40000001:10':shape},allowed=new Set([40000001]);
 assert.deepEqual(indoorAlign(full,shapes,allowed,[0,1,2],'spaceX',true)?.map(p=>[p.index,p.x,p.y,p.orientation]),[[1,4,2,'GridOrientation_Down']]);
 assert.deepEqual(indoorAlign(full,shapes,allowed,[0,1],'left',true)?.map(p=>[p.index,p.x,p.y]),[[1,1,2]]);
 assert.equal(indoorAlign(full,shapes,allowed,[0,3],'left',true),null);
 assert.equal(indoorAlign(full,shapes,allowed,[0,1],'left'),null);
});

test('free symmetry duplicate accepts native diagonal mirror and overlap but rejects missing footprint and state',async()=>{
 const {indoorSymmetricDuplicate}=await import('../src/lib/world/indoor-room-view.ts');
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>0)};
 const full={...face,sourcePath:'GridData/Rooms/Room8x8-GridData.json',positions:[{itemId:40000001,x:1,y:1,orientationCode:10,plain:true},{itemId:40000002,x:4,y:1,orientationCode:8}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes={'40000001:10':shape,'40000001:6':shape,'40000001:2':shape},allowed=new Set([40000001]),stock=new Map([[40000001,2]]);
 assert.deepEqual(indoorSymmetricDuplicate(full,shapes,allowed,stock,[0],{mode:'vertical',x2:6,y2:0},new Map(),true),[{itemId:40000001,x:4,y:1,orientation:'GridOrientation_DownRight',expectedStock:2}]);
 assert.deepEqual(indoorSymmetricDuplicate(full,shapes,allowed,stock,[0],{mode:'point',x2:6,y2:6},new Map(),true),[{itemId:40000001,x:4,y:4,orientation:'GridOrientation_UpRight',expectedStock:2}]);
 assert.equal(indoorSymmetricDuplicate(full,{'40000001:10':shape},allowed,stock,[0],{mode:'vertical',x2:6,y2:0},new Map(),true),null);
 assert.equal(indoorSymmetricDuplicate(full,shapes,allowed,stock,[1],{mode:'vertical',x2:6,y2:0},new Map(),true),null);
});

test('free linked symmetry moves and turns diagonal partners over occupied cells',async()=>{
 const {indoorLinkedMove,indoorLinkedRotate,indoorLinkedPlacement}=await import('../src/lib/world/indoor-room-view.ts');
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>0)};
 const full={...face,sourcePath:'GridData/Rooms/Room8x8-GridData.json',positions:[{itemId:40000001,x:1,y:1,orientationCode:10,plain:true},{itemId:40000001,x:4,y:1,orientationCode:6,plain:true},{itemId:40000002,x:2,y:2,orientationCode:8}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes=Object.fromEntries([0,2,4,6,8,10,12,14].map(code=>['40000001:'+code,shape])),allowed=new Set([40000001]),axis={mode:'vertical',x2:6,y2:0};
 assert.deepEqual(indoorLinkedMove(full,shapes,allowed,[0],0,2,2,axis,true)?.map(p=>[p.index,p.x,p.y]),[[0,2,2],[1,3,2]]);
 assert.equal(indoorLinkedMove({...full,positions:[...full.positions,{...full.positions[1]}]},shapes,allowed,[0],0,2,2,axis,true),null);
 assert.deepEqual(indoorLinkedRotate(full,shapes,allowed,[0],1,axis,true)?.map(p=>p.orientation),['GridOrientation_UpLeft','GridOrientation_UpRight']);
 assert.deepEqual(indoorLinkedPlacement(full,shapes,allowed,new Map([[40000001,2]]),[{itemId:40000001,dx:0,dy:0,orientation:2.5}],'corner',2,2,axis,true)?.map(p=>[p.x,p.y,p.expectedStock]),[[2,2,2],[3,2,1]]);
 assert.equal(indoorLinkedPlacement(full,shapes,allowed,new Map([[40000001,1]]),[{itemId:40000001,dx:0,dy:0,orientation:2.5}],'corner',2,2,axis,true),null);
});

test('free indoor cut captures overlapping diagonal records and pastes them without stock',()=>{
 const terrain={sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>0)};
 const full={...face,sourcePath:'GridData/Rooms/Room8x8-GridData.json',positions:[{itemId:40000001,x:1,y:1,orientationCode:10,plain:true},{itemId:40000001,x:1,y:1,orientationCode:8,plain:true}],missingPositions:0,terrain};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes={'40000001:8':shape,'40000001:10':shape},allowed=new Set([40000001]);
 const cut=captureIndoorCut(full,1,[0,1],shapes,allowed,allowed,new Set(),true);
 assert.deepEqual(cut?.clip.map(p=>p.orientation),[2.5,2]);
 assert.deepEqual(indoorGroupTransfer(full,shapes,allowed,cut.rows,cut.clip,1,1,true)?.map(p=>[p.x,p.y,p.orientation]),[[1,1,'GridOrientation_DownLeft'],[1,1,'GridOrientation_Down']]);
 assert.equal(indoorGroupTransfer(full,shapes,allowed,cut.rows,cut.clip,1,1),null);
 assert.equal(indoorGroupTransfer(full,shapes,allowed,cut.rows,cut.clip,8,1,true),null);
 assert.equal(captureIndoorCut(full,1,[0,1],shapes,allowed,allowed,new Set([0]),true),null);
 assert.equal(captureIndoorCut(full,1,[1],shapes,allowed,allowed,new Set([1]),true),null);
 const support={...full,positions:[{itemId:40000001,x:1,y:1,orientationCode:8,plain:false}]};
 const hierarchy=captureIndoorCut(support,1,[0],shapes,allowed,allowed,new Set([0]),true);assert.ok(hierarchy);
 assert.equal(hierarchy.rows[0].supportFactor,1);
 assert.equal(indoorGroupTransfer(full,shapes,allowed,hierarchy.rows,hierarchy.clip,1,1,true)[0].supportFactor,1);
 assert.equal(indoorGroupTransfer(full,shapes,allowed,hierarchy.rows,[{...hierarchy.clip[0],orientation:2.5}],1,1,true),null);
 const crossFactor=hierarchy.rows.map(r=>({...r,supportFactor:2}));
 assert.equal(indoorGroupTransfer(full,shapes,allowed,crossFactor,hierarchy.clip,1,1,true)[0].supportFactor,2);
 assert.equal(indoorGroupTransfer(full,shapes,allowed,crossFactor,hierarchy.clip,1,1,false),null);
});

test('storage root supports cardinal move and explicit storage cut but not leaf pickup',async()=>{
 const {indoorFreeTransform,indoorFreeRotate,indoorPickup}=await import('../src/lib/world/indoor-room-view.ts');
 const full={...face,sourcePath:'GridData/Rooms/Room8x8-GridData.json',positions:[{itemId:40001680,x:1,y:1,orientationCode:8,storage:true}],missingPositions:0,terrain:{sizeX:8,sizeY:8,nativeFloorValues:new Uint32Array(64)}};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:''},shapes=Object.fromEntries([0,2,4,6,8,10,12,14].map(n=>['40001680:'+n,shape])),allowed=new Set([40001680]);
 assert.equal(indoorFreeTransform(full,shapes,allowed,0,3,3)[0].x,3);
 assert.ok(indoorFreeRotate(full,shapes,allowed,0,1));
 assert.equal(indoorFreeTransform(full,shapes,allowed,0,3,3,'GridOrientation_DownLeft'),null);
 assert.equal(indoorPickup(full,0,allowed,new Map([[40001680,1]]),true),null);
 assert.equal(indoorPickup({...full,positions:[{...full.positions[0],storageEmpty:true}]},0,allowed,new Map([[40001680,1]]),true).storageEmpty,true);
 const cut=captureIndoorCut(full,1,[0],shapes,allowed,allowed,new Set(),true);
 assert.equal(cut.rows[0].storage,true);
 assert.equal(indoorGroupTransfer(full,shapes,allowed,cut.rows,cut.clip,2,2,true)[0].storage,true);
 assert.equal(indoorGroupTransfer(full,shapes,allowed,cut.rows,[{...cut.clip[0],orientation:2.5}],2,2,true),null);
});

test('indoor mixed storage duplication keeps each original witness and staged stock',()=>{
 const id=40001680,normal=40000001,positions=[{itemId:id,x:1,y:1,orientationCode:8,storage:true,storageKnown:true},{itemId:normal,x:2,y:1,orientationCode:8,plain:true},{itemId:id,x:3,y:1,orientationCode:8,storage:true,storageKnown:true}];
 const f={...face,sourcePath:'GridData/Rooms/Room8x8-GridData.json',positions,missingPositions:0,terrain:{sizeX:8,sizeY:8,nativeFloorValues:new Uint32Array(64)}};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:''},shapes=Object.fromEntries([id,normal].flatMap(id=>[0,4,8,12].map(n=>[id+':'+n,shape]))),allowed=new Set([id,normal]),stock=new Map([[id,2],[normal,1]]);
 const selection=indoorStorageDuplicateSelection(f,[0,1,2],shapes,allowed,stock,true);assert.ok(selection);
 const q=indoorStorageDuplicatePlacement(f,shapes,allowed,stock,selection.clip,selection.sources,true,2,3,true);assert.ok(q);
 assert.deepEqual(q.map(p=>[p.expectedStock,p.storageSource?.index,p.storageSource?.copyContents]),[[2,0,true],[1,undefined,undefined],[1,2,true]]);
 assert.equal(indoorStorageDuplicateSelection(f,[0,1,2],shapes,allowed,new Map([[id,1],[normal,1]]),true),null);
 assert.equal(indoorStorageDuplicatePlacement(f,shapes,allowed,stock,selection.clip.map((p,i)=>i===0?{...p,orientation:2.5}:p),selection.sources,true,2,3,true),null);
 assert.equal(indoorStorageDuplicateSelection({...f,positions:[{...positions[0],storage:undefined},...positions.slice(1)]},[0,1,2],shapes,allowed,stock,true),null);
});

test('local indoor mixed duplication carries separate support and storage witnesses without portable storage capture',async()=>{
 const {captureIndoorMixedScene,indoorMixedPlacement}=await import('../src/lib/world/indoor-room-view.ts');
 const id=40001680,table=40000001,child=40000002;
 const f={...face,positions:[{itemId:table,x:1,y:1,orientationCode:8},{itemId:id,x:3,y:1,orientationCode:8,storage:true,storageKnown:true},{itemId:child,x:5,y:1,orientationCode:8,plain:true}],missingPositions:0,terrain:{sizeX:8,sizeY:8,nativeFloorValues:Uint32Array.from({length:64},()=>1024)}};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'},shapes=Object.fromEntries([id,table,child].map(id=>[id+':8',shape])),allowed=new Set([id,table,child]);
 const support={schema:'wand.preset.support-scene@1',gameVersion:'1.26.2',ownerItemId:table,tree:{factor:1,sourcePath:'GridData/Furniture/Test.json',objects:[{itemId:child,x:0,y:0,orientation:'GridOrientation_Down',child:null}]}},supports=new Map([[0,support]]);
 assert.equal(captureIndoorMixedScene(f,[0,1,2],shapes,allowed,supports),null);
 const scene=captureIndoorMixedScene(f,[0,1,2],shapes,allowed,supports,true);assert.ok(scene);
 const clip=scene.items.map(({support,...pose})=>pose),stock=new Map([[id,1],[table,1],[child,2]]),source={index:0,expectedX:1,expectedY:1,expectedOrientation:'GridOrientation_Down'},storage={index:1,expectedX:3,expectedY:1,expectedOrientation:'GridOrientation_Down'};
 const q=indoorMixedPlacement(f,shapes,allowed,stock,clip,scene,'corner',1,3,[source,null,null],[null,storage,null],true);assert.ok(q);
 assert.deepEqual(q.map(p=>p.expectedStock),[1,1,1]);assert.deepEqual(q[0].supportSource,source);assert.deepEqual(q[1].storageSource,{...storage,copyContents:true});assert.equal(q[2].storageSource,undefined);
 assert.equal(indoorMixedPlacement(f,shapes,allowed,stock,clip,scene,'corner',1,3,[source,null,null],[null,{...storage,expectedX:99},null],true),null);
});

test('single support duplication uses free room pose without relaxing cardinal or source identity',async()=>{
 const {indoorSupportDuplicatePlacement}=await import('../src/lib/world/indoor-room-view.ts');
 const id=40000001,full={...face,sourcePath:'GridData/Rooms/Room8x8-GridData.json',positions:[{itemId:id,x:1,y:1,orientationCode:8,plain:false}],missingPositions:0,terrain:{sizeX:8,sizeY:8,nativeFloorValues:new Uint32Array(64)}};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:''},shapes={[id+':8']:shape,[id+':10']:shape},stock=new Map([[id,2]]),allowed=new Set([id]);
 const w={index:0,expectedX:1,expectedY:1,expectedOrientation:'GridOrientation_Down'};
 assert.equal(indoorSupportDuplicatePlacement(full,shapes,allowed,stock,id,w,1,1,'GridOrientation_Down'),null);
 assert.deepEqual(indoorSupportDuplicatePlacement(full,shapes,allowed,stock,id,w,1,1,'GridOrientation_Down',true),{itemId:id,expectedStock:2,x:1,y:1,orientation:'GridOrientation_Down',supportSource:w});
 assert.equal(indoorSupportDuplicatePlacement(full,shapes,allowed,stock,id,w,1,1,'GridOrientation_DownLeft',true),null);
 assert.equal(indoorSupportDuplicatePlacement(full,shapes,allowed,stock,id,{...w,expectedX:2},1,1,'GridOrientation_Down',true),null);
 assert.equal(indoorSupportDuplicatePlacement(full,shapes,allowed,stock,id,w,8,1,'GridOrientation_Down',true),null);
 assert.equal(indoorSupportDuplicatePlacement({...full,positions:[{...full.positions[0],plain:true}]},shapes,allowed,stock,id,w,1,1,'GridOrientation_Down',true),null);
});
