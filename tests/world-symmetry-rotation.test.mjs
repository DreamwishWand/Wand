import test from 'node:test';import assert from 'node:assert/strict';
import {symmetricRotateDesign,reflectedDesignItem} from '../src/lib/world/design-symmetry.ts';
import {currentDesign,travelDesign} from '../src/lib/world/design-layout.ts';
const shape={width:1,height:1,cellCount:1,path:'M0 0h1v1H0Z',runs:[{x:0,y:0,width:1}]};
const g={itemId:40000001,name:'fixture',layer:'furniture',surfaceCapable:false,shapes:Object.fromEntries([0,4,8,12].map(n=>['40000001:'+n,shape]))};
const defs=new Map([[g.itemId,g]]),p={id:1,itemId:g.itemId,x:2,y:3,orientation:2},sym={mode:'vertical',x2:10,y2:0},other={id:2,...reflectedDesignItem(p,g,sym)};
const timeline={snapshots:[[p,other]],cursor:0,nextId:3},eligible=new Set([1,2]);
test('mirror rotation keeps both IDs, uses the reflected direction, and undoes atomically',()=>{
 const next=symmetricRotateDesign(timeline,[1],defs,sym,1,eligible,20,20);
 assert.ok(next);const a=currentDesign(next);assert.deepEqual(a.map(p=>p.id),[1,2]);assert.equal(a[0].orientation,1);assert.equal(a[1].orientation,3);assert.equal(a[1].x,7);assert.equal(next.cursor,1);assert.equal(next.nextId,3);assert.deepEqual(currentDesign(travelDesign(next,-1)),currentDesign(timeline));
});
test('rotation rejects locked, ambiguous, missing and contradictory reflected counterpart',()=>{
 assert.equal(symmetricRotateDesign(timeline,[1],defs,sym,1,new Set([1]),20,20),null);
 assert.equal(symmetricRotateDesign(timeline,[1,2],defs,sym,1,eligible,20,20),null);
 assert.equal(symmetricRotateDesign({...timeline,snapshots:[[p]]},[1],defs,sym,1,eligible,20,20),null);
 assert.equal(symmetricRotateDesign({...timeline,snapshots:[[p,other,{...other,id:3}]],nextId:4},[1],defs,sym,1,new Set([1,2,3]),20,20),null);
});
test('point symmetry rotates both sides by the same turn',()=>{
 const center={mode:'point',x2:10,y2:10},counter={id:2,...reflectedDesignItem(p,g,center)};
 const next=symmetricRotateDesign({...timeline,snapshots:[[p,counter]]},[1],defs,center,1,eligible,20,20);
 assert.ok(next);assert.equal(currentDesign(next)[0].orientation,1);assert.equal(currentDesign(next)[1].orientation,3);
});
