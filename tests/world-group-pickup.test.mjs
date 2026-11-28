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

test('group pickup includes only verified empty storage and refuses mixed selections containing filled storage',()=>{
 const storage={...p(2,'40001680'),object:{...p(2,'40001680').object,storage:true,storageEmpty:true}};
 const rows=groupPickupPlan([p(1),storage]);
 assert.equal(rows?.[1].includeStorage,true);
 assert.equal(groupPickupPlan([p(1),{...storage,object:{...storage.object,storageEmpty:false}}]),null);
 assert.equal(groupPickupPlan([p(1),{...storage,object:{...storage.object,storageEmpty:undefined}}]),null);
});

test('free pickup releases native game flags but retains structural constraints',()=>{
 const fixed={...p(1),object:{...p(1).object,editRestrictions:{select:'denied',remove:'denied',move:'denied'}}};
 const table={...fixed,object:{...fixed.object,subgrid:{status:'resolved_full',objectCount:2}}};
 assert.equal(groupPickupPlan([table]),null);assert.equal(groupPickupPlan([table],true)[0].includeSupport,true);
 assert.equal(groupPickupPlan([fixed,p(2)]),null);assert.equal(groupPickupPlan([fixed,p(2)],true).length,2);
 assert.equal(groupPickupPlan([{...table,object:{...table.object,subgrid:{status:'unresolved',objectCount:null}}}],true),null);
});
