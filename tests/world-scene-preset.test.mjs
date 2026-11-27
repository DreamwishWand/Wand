import test from 'node:test';import assert from 'node:assert/strict';
import {captureScene,parseScene,sceneOrigin} from '../src/lib/world/scene-preset.ts';
import {emptyDesign,pasteDesign,currentDesign,travelDesign} from '../src/lib/world/design-layout.ts';
test('Scene retains relative geometry, anchor and atomic paste',()=>{const s={width:2,height:1,cellCount:2,path:'',runs:[{x:0,y:0,width:2}]},defs=new Map([[40000001,{itemId:40000001,name:'fixture',layer:'furniture',surfaceCapable:false,shapes:{'40000001:8':s}}]]),source={snapshots:[[{id:42,itemId:40000001,x:10,y:20,orientation:2},{id:99,itemId:40000001,x:13,y:22,orientation:2}]],cursor:0,nextId:100};
const scene=captureScene(source,[42,99],defs,1),text=JSON.stringify(scene),parsed=parseScene(text,1);assert.equal(parsed.items[1].dx,3);assert.deepEqual(sceneOrigin({x:10,y:10},'center',parsed.items,defs),{x:8,y:9});const next=pasteDesign(emptyDesign(),parsed.items,defs,8,9,30,30);assert.deepEqual(currentDesign(next).map(p=>p.id),[1,2]);assert.equal(currentDesign(travelDesign(next,-1)).length,0);assert.throws(()=>parseScene(text,2));assert.equal(captureScene(source,[42,777],defs,1),null);});

import {sceneFromClip,sceneHasDiagonal,convertSceneFactor,parseSceneAnyFactor} from '../src/lib/world/scene-preset.ts';
test('flat Scene preserves all eight directions and old cardinal values without extra fields',()=>{
 const items=Array.from({length:8},(_,i)=>({itemId:40000001,dx:i*2,dy:0,orientation:i/2}));
 const doc=sceneFromClip(items,2),unit=convertSceneFactor(doc,1);
 assert.deepEqual(parseSceneAnyFactor(JSON.stringify(doc)),doc);assert.deepEqual(convertSceneFactor(unit,2),doc);
 assert.equal(sceneHasDiagonal(doc.items),true);assert.equal(sceneHasDiagonal(doc.items.filter(p=>Number.isInteger(p.orientation))),false);
 for(const v of [-0.5,0.25,4,4.5,'2.5'])assert.throws(()=>sceneFromClip([{itemId:40000001,dx:0,dy:0,orientation:v}],1));
 for(const itemId of [20500001,40100001,40200001,40700001])assert.throws(()=>sceneFromClip([{itemId,dx:0,dy:0,orientation:1.5}],1));
 assert.deepEqual(sceneFromClip([{itemId:40000001,dx:0,dy:0,orientation:2}],1).items,[{itemId:40000001,dx:0,dy:0,orientation:2}]);
});
