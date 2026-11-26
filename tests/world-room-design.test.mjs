import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {roomDesignTemplates,isRoomDesign,roomDesignValid} from '../src/lib/world/room-design.ts';
import {designDraftLocation} from '../src/lib/world/design-draft.ts';
const catalog=JSON.parse(readFileSync(new URL('../static/ddv/world/steam-1.26.2/room-terrain.json',import.meta.url),'utf8'));
test('room design templates come only from source floor masks and have separate local identities',()=>{
 const rooms=roomDesignTemplates(catalog);assert.equal(rooms.length,39);assert.equal(rooms.filter(t=>t.kind==='floor').length,28);assert.equal(rooms.filter(t=>t.kind==='wall').length,11);assert.equal(new Set(rooms.map(t=>t.grid.key)).size,39);
 for(const t of rooms){assert.ok(isRoomDesign(t.grid));assert.equal(t.raster.nativeFloorValues.length,t.grid.sizeX*t.grid.sizeY);assert.equal(t.grid.gridIdNative,0);assert.equal(t.grid.factor,2);assert.ok(designDraftLocation(t.grid,null).key.startsWith('area:room-design:'));}
 assert.throws(()=>roomDesignTemplates({...catalog,gameVersion:'unknown'}));
 assert.throws(()=>roomDesignTemplates({...catalog,grids:[catalog.grids[0],catalog.grids[0]]}));
});
test('room design checks native masks, actual occupancy and all recovered history',()=>{
 const {grid,raster}=roomDesignTemplates(catalog).find(t=>t.grid.gridDataPath.endsWith('/Room8x8-GridData.json'));
 const itemId=40000001,shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:1024,path:'M0 0h1v1H0Z'};
 const defs=new Map([[itemId,{itemId,name:null,layer:'furniture',surfaceCapable:false,shapes:{[itemId+':8']:shape}}]]);
 const row={id:1,itemId,x:4,y:4,orientation:2},t={snapshots:[[row]],cursor:0,nextId:2};
 assert.equal(roomDesignValid(t,grid,raster,defs),true);
 assert.equal(roomDesignValid({...t,snapshots:[[row,{...row,id:2}]]},grid,raster,defs),false);
 assert.equal(roomDesignValid({...t,snapshots:[[{...row,x:100}],[row]],cursor:1},grid,raster,defs,true),false);
 assert.equal(roomDesignValid(t,grid,{...raster,nativeFloorValues:new Uint32Array(raster.nativeFloorValues.length)},defs),false);
 assert.equal(roomDesignValid(t,grid,raster,new Map([[itemId,{...defs.get(itemId),surfaceCapable:true}]])),false);
});
test('wall templates use the source wall mask, not a floor or invented room mapping',()=>{
 const {grid,raster}=roomDesignTemplates(catalog).find(t=>t.grid.gridDataPath.endsWith('/Wall8x9-GridData.json'));
 assert.ok([...raster.nativeFloorValues].every(v=>v===2048));
 const itemId=40000001,shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:2048,path:'M0 0h1v1H0Z'};
 const geometry={itemId,name:null,layer:'furniture',surfaceCapable:false,shapes:{[itemId+':8']:shape}};
 const row={id:1,itemId,x:4,y:4,orientation:2},t={snapshots:[[row]],cursor:0,nextId:2};
 assert.ok(roomDesignValid(t,grid,raster,new Map([[itemId,geometry]])));
 assert.equal(roomDesignValid(t,grid,raster,new Map([[itemId,{...geometry,shapes:{[itemId+':8']:{...shape,acceptedFloorTypesFlag:1024}}}]])),false);
});
