import test from 'node:test';
import assert from 'node:assert/strict';
import {overlayToMaskUv,selectLockOverlayCandidates} from '../src/lib/media/native-map-mask-geometry.ts';
test('independent quads retain precise mask UV placement',()=>{
 assert.deepEqual(overlayToMaskUv([2,0,0,4,11,22],[4,0,0,8,10,20]),[.5,0,0,.5,.25,.25]);
 assert.deepEqual(overlayToMaskUv([0,2,-4,0,8,3],[0,2,-4,0,8,3]).map(n=>n||0),[1,0,0,1,0,0]);
 assert.throws(()=>overlayToMaskUv([1,0,0,1,0,0],[0,0,0,0,0,0]));
});
test('lock overlay plan never guesses missing state or activates uncontrolled inactive node',()=>{
 const m={quad:[2,0,0,2,0,0],kind:'graphic-alpha'};
 const row={node:'a',drawOrder:1,quad:[2,0,0,2,0,0],mode:'area-lock',activeInPrefab:false,graphicEnabled:true,areaType:60,mask:m};
 const inactive={...row,node:'b',drawOrder:2,mode:'inactive-uncontrolled'};
 assert.equal(selectLockOverlayCandidates([row,inactive],new Map([[60,true]])).length,1);
 assert.equal(selectLockOverlayCandidates([row,inactive],new Map([[60,false]])).length,0);
 assert.throws(()=>selectLockOverlayCandidates([row,inactive],new Map()));
 assert.throws(()=>selectLockOverlayCandidates([inactive,row],new Map([[60,true]])));
});
