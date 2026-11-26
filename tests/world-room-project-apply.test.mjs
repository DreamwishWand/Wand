import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {roomDesignTemplates} from '../src/lib/world/room-design.ts';
import {newRoomSurface} from '../src/lib/world/room-project-design.ts';
import {buildRoomApplyPlan,roomApplyMatches,roomApplyShortages} from '../src/lib/world/room-project-apply.ts';
const templates=roomDesignTemplates(JSON.parse(readFileSync(new URL('../static/ddv/world/steam-1.26.2/room-terrain.json',import.meta.url),'utf8')));
const floor=templates.find(t=>t.kind==='floor'),wall=templates.find(t=>t.kind==='wall'),id=40000001;
const pose={id:1,itemId:id,x:2,y:2,orientation:2};
const timeline={snapshots:[[pose]],cursor:0,nextId:2};
const surfaces=[{...newRoomSurface(1,floor),timeline},{...newRoomSurface(2,wall),timeline}];
const face=(t,ordinal)=>({kind:t.kind,ordinal,wallPosition:ordinal===1?null:ordinal-2,finish:0,gridStatus:'full',items:[],positions:[],factor:1,missingPositions:0,terrain:t.raster,sourcePath:t.grid.gridDataPath});
const room={ordinal:1,house:1,floor:1,name:'Room',ceiling:null,surfaces:[face(floor,1),face(wall,2)]};
function geo(mask){const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:mask,path:'M0 0h1v1H0Z'},shapes=Object.fromEntries([0,4,8,12].map(n=>[id+':'+n,shape]));return {design:new Map([[id,{itemId:id,name:'Test',layer:'furniture',surfaceCapable:false,shapes}]]),shapes,allowed:new Set([id])};}
const geometry=new Map([[1,geo(1024)],[2,geo(2048)]]),mapping=new Map([[1,1],[2,2]]),stock=new Map([[id,2]]),owned=new Set();
test('room application requires exact face paths, converts coordinates and shares one stock ledger',()=>{
 assert.ok(roomApplyMatches(surfaces[0],room.surfaces[0]));
 assert.equal(roomApplyMatches(surfaces[0],{...room.surfaces[0],sourcePath:'GridData/Rooms/Room8x8-GridData.json'}),false);
 const plan=buildRoomApplyPlan(surfaces,room,mapping,geometry,stock,owned);
 assert.ok(plan);assert.equal(plan.surfaces[0].place[0].x,1);assert.equal(plan.surfaces[0].place[0].expectedStock,2);assert.equal(plan.surfaces[1].place[0].expectedStock,1);
 assert.deepEqual(roomApplyShortages(surfaces,new Map([[id,1]])),[{itemId:id,required:2,available:1}]);
 assert.equal(buildRoomApplyPlan(surfaces,room,mapping,geometry,new Map([[id,1]]),owned),null);
 assert.equal(buildRoomApplyPlan(surfaces,room,new Map([[1,1],[2,1]]),geometry,stock,owned),null);
 const occupied={...room,surfaces:[{...room.surfaces[0],positions:[{itemId:id,x:1,y:1,orientationCode:8}],items:[{itemId:id,quantity:1}]},room.surfaces[1]]};
 assert.equal(buildRoomApplyPlan(surfaces,occupied,mapping,geometry,stock,owned),null);
 const odd={...surfaces[0],timeline:{...timeline,snapshots:[[{...pose,x:3}]]}};
 assert.equal(buildRoomApplyPlan([odd,surfaces[1]],room,mapping,geometry,stock,owned),null);
});
