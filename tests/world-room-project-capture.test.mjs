import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {roomDesignTemplates} from '../src/lib/world/room-design.ts';
import {captureRoomTemplate,captureRoomRows,captureRoomSurface,capturedRoomDocument} from '../src/lib/world/room-project-capture.ts';
import {parseRoomProject} from '../src/lib/world/room-project-design.ts';
const templates=roomDesignTemplates(JSON.parse(readFileSync(new URL('../static/ddv/world/steam-1.26.2/room-terrain.json',import.meta.url),'utf8')));
const floor=templates.find(t=>t.kind==='floor'),wall=templates.find(t=>t.kind==='wall'),id=40000001;
const face=(t,ordinal)=>({kind:t.kind,ordinal,wallPosition:ordinal===1?null:ordinal-2,finish:0,gridStatus:'full',items:[],positions:[],factor:1,missingPositions:0,terrain:t.raster,sourcePath:t.grid.gridDataPath});
const a=face(floor,1),b=face(wall,2),room={ordinal:1,house:1,floor:1,name:'Private room',ceiling:null,surfaces:[a,b]};
test('capture requires exact terrain, path and complete faces; private room metadata is not exported',()=>{
 assert.equal(captureRoomTemplate(a,templates),floor);
 assert.equal(captureRoomTemplate({...a,sourcePath:'unknown'},templates),null);
 assert.equal(captureRoomTemplate({...a,finish:null},templates),null);
 const rows=room.surfaces.map((f,i)=>captureRoomSurface(f,[floor,wall][i],[],new Map(),new Set()));
 const raw=capturedRoomDocument(room,rows,templates);
 assert.ok(raw);assert.equal(raw.includes('Private room'),false);assert.equal(parseRoomProject(raw,templates).surfaces.length,2);
 assert.equal(capturedRoomDocument(room,rows.slice(0,1),templates),null);
});
test('capture uses absolute half-cell coordinates and never drops nonportable object state',()=>{
 const f={...a,items:[{itemId:id,quantity:1}],positions:[{itemId:id,x:1,y:2,orientationCode:8,plain:true}]};
 assert.deepEqual(captureRoomRows(room,f,floor,[],new Map()),[{id:1,itemId:id,x:2,y:4,orientation:2}]);
 assert.equal(captureRoomRows(room,{...f,positions:[{...f.positions[0],plain:undefined}]},floor,[],new Map()),null);
 assert.equal(captureRoomRows(room,{...f,missingPositions:1,items:[{itemId:id,quantity:2}]},floor,[],new Map()),null);
});

test('room capture includes reconstructible empty storage and preserves other storage',()=>{
 const make=(x,flags)=>({itemId:40001680,x,y:1,orientationCode:8,...flags});
 const f={...a,items:[{itemId:40001680,quantity:4}],positions:[make(1,{storage:true,storageKnown:true,storageEmpty:true,storageRestorable:true}),make(2,{storage:true,storageKnown:true}),make(3,{storageKnown:true}),make(4,{storage:true,storageKnown:true,storageEmpty:true})]};
 assert.deepEqual(captureRoomRows(room,f,floor,[],new Map()),[{id:1,itemId:40001680,x:2,y:2,orientation:2}]);
});
