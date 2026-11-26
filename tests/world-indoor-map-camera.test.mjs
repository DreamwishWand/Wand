import test from 'node:test';import assert from 'node:assert/strict';import {roomCameraBounds,roomCameraZoom,roomCameraPan,roomCameraArt} from '../src/lib/world/indoor-map-camera.ts';
test('room zoom anchors to pointer and pans inside exact bounds',()=>{
 const b=roomCameraBounds('0 0 16 16'),v=roomCameraZoom(b,b,2,{x:4,y:4});
 assert.deepEqual(v,{x:2,y:2,w:8,h:8});
 assert.deepEqual(roomCameraPan(v,b,100,-100),{x:8,y:0,w:8,h:8});
 assert.deepEqual(roomCameraZoom(v,b,1/100),b);
 assert.equal(roomCameraZoom(b,b,1000).w,2);
 assert.deepEqual(roomCameraBounds('bad'),{x:0,y:0,w:1,h:1});
});
test('artwork uses known footprint intersection, not unknown anchors',()=>{
 const p=[{itemId:1,x:0,y:0,orientationCode:8},{itemId:2,x:3,y:3,orientationCode:8},{itemId:3,x:0,y:0,orientationCode:null}];
 assert.deepEqual(roomCameraArt(p,{'1:8':{width:2,height:2},'2:8':{width:1,height:1}},{x:1,y:1,w:2,h:2}).map(a=>a.index),[0]);
});
