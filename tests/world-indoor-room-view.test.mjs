import test from 'node:test';import assert from 'node:assert/strict';import {parseIndoorRooms,indoorPositionPlot,indoorFurnitureEdits,indoorSwapPartners,indoorPickup,indoorMove,indoorPlace} from '../src/lib/world/indoor-room-view.ts';
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
