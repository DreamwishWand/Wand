import test from 'node:test';import assert from 'node:assert/strict';
import {stockPlacement,stockPickup,ordinaryFurniture} from '../src/lib/world/save-furniture-placement.ts';
import {mainlandMapAnchor} from '../src/lib/world/mainland-world-coordinates.ts';
const g={key:'A',layoutId:'SceneLayouts/Village04/A.json',gridDataPath:'GridData/A.json',factor:1,sizeX:4,sizeY:4,origin:{position:[0,0,0]},bounds:{x:0,y:-4,w:4,h:4}};
const rasters=new Map([['A',{sizeX:4,sizeY:4,nativeFloorValues:new Uint32Array(16).fill(4)}]]);
const shape={width:2,height:1,cellCount:2,runs:[{x:0,y:0,width:2}],path:'M0 0h2v1H0Z',acceptedFloorTypesFlag:4};
const def={itemId:40005160,name:'Fixture',layer:'furniture',surfaceCapable:false,shapes:{'40005160:8':shape}},geometry=new Map([[1,def]]);
test('stock placement requires a unique complete native footprint and ordinary furniture',()=>{
 const q=stockPlacement([g],rasters,geometry,40005160,'GridOrientation_Down',1.5,-1.5);
 assert.equal(q.plan.action,'place');assert.equal(q.plan.x,1);assert.equal(q.plan.y,1);assert.equal(q.destination.factor,1);
 assert.equal(stockPlacement([g],rasters,geometry,40005160,'GridOrientation_Down',3.5,-1.5),null);
 assert.equal(stockPlacement([g],rasters,geometry,40700001,'GridOrientation_Down',1.5,-1.5),null);
 rasters.get('A').nativeFloorValues[6]=0;
 assert.equal(stockPlacement([g],rasters,geometry,40005160,'GridOrientation_Down',1.5,-1.5),null);
 rasters.get('A').nativeFloorValues[6]=4;
 const other={...g,key:'B'};assert.equal(stockPlacement([g,other],new Map([...rasters,['B',rasters.get('A')]]),geometry,40005160,'GridOrientation_Down',1.5,-1.5),null);
});
test('pickup and duplicate preserve original object address and reject surface or no-op',()=>{
 const p={area:'A',factor:1,shape,...mainlandMapAnchor(g,0,0),object:{localOrdinal:1,itemId:'40005160',x:0,y:0,orientation:'GridOrientation_Down',layer:'furniture',surfaceCapable:false}};
 assert.equal(stockPickup(p).plan.localOrdinal,1);
 assert.equal(stockPickup({...p,object:{...p.object,surfaceCapable:true}}),null);
 const q=stockPlacement([g],rasters,geometry,40005160,'GridOrientation_Down',1.5,-1.5,p);
 assert.equal(q.plan.action,'duplicate');assert.equal(q.plan.expectedX,0);
 assert.equal(stockPlacement([g],rasters,geometry,40005160,'GridOrientation_Down',.5,-.5,p),null);
});
