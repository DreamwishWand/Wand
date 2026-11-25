import test from 'node:test';import assert from 'node:assert/strict';import {parseIndoorRooms,indoorPositionPlot} from '../src/lib/world/indoor-room-view.ts';
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
