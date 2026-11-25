import test from 'node:test';import assert from 'node:assert/strict';
import {groupPickupPlan} from '../src/lib/world/group-pickup.ts';
const p=(localOrdinal,itemId='40000001')=>({area:'A',x:0,y:0,factor:1,shape:{width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],path:''},object:{localOrdinal,itemId,x:1,y:2,layer:'furniture',orientation:'GridOrientation_Down'}});
test('group pickup includes every selected item, checks poses and rejects unsafe members',()=>{
 assert.deepEqual(groupPickupPlan([p(2),p(1)]),[{localOrdinal:1,itemId:'40000001',expectedX:1,expectedY:2,expectedOrientation:'GridOrientation_Down'},{localOrdinal:2,itemId:'40000001',expectedX:1,expectedY:2,expectedOrientation:'GridOrientation_Down'}]);
 assert.equal(groupPickupPlan([p(1),p(1)]),null);
 assert.equal(groupPickupPlan([p(1),p(2,'40100068')]),null);
 assert.equal(groupPickupPlan([p(1),{...p(2),object:{...p(2).object,subgrid:{}}}]),null);
 assert.equal(groupPickupPlan([p(1),{...p(2),object:{...p(2).object,orientation:null}}]),null);
});
