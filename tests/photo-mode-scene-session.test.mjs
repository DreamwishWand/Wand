import test from 'node:test';
import assert from 'node:assert/strict';
import {PoseSceneSession,orbit} from '../src/lib/photo-mode/scene-session.ts';
import {cameraMatrix,validatePrimitive} from '../src/lib/photo-mode/gpu-renderer.ts';
test('camera can make repeated full turns without touching motion',()=>{
  const view={yaw:0,pitch:0,zoom:1};
  assert.deepEqual(orbit(view,720,0,360,240),view);
  assert.ok(Math.abs(orbit(view,-90,0,360,240).yaw-1.5*Math.PI)<1e-12);
  assert.ok(orbit(view,0,9999,360,240).pitch<Math.PI/2);
  const scene={center:[0,1,0],radius:1};
  assert.deepEqual(cameraMatrix(scene,view,400,400),cameraMatrix(scene,orbit(view,360,0,360,240),400,400));
});
test('visibility and camera changes never resample or restart synchronized actors',()=>{
  const times=[],frames=[];let released=0;
  const scene={duration:4,actors:[{id:'player',label:'Player',canHide:false},{id:'prop',label:'Prop',canHide:true},{id:'pet',label:'Pet',canHide:true}],primitives:[],jointCounts:[1],center:[0,0,0],radius:1,sample(t){times.push(t);return [new Float32Array(16).fill(t)]},dispose(){released++}};
  const s=new PoseSceneSession(scene,{draw(p,v,h){frames.push({value:p[0][0],view:{...v},hidden:[...h]})},dispose(){released++}});
  s.clock.setSpeed(.25);s.clock.play();s.clock.tick(2);const state=s.state;
  s.clock.setActorVisible('prop',false);s.clock.setActorVisible('pet',false);s.move(100,30,400,400);s.zoom(2);assert.deepEqual(s.state,state);assert.deepEqual(times,[0,.5]);assert.deepEqual(frames.at(-1).hidden,['prop','pet']);assert.equal(frames.at(-1).value,.5);
  s.clock.tick(2);assert.equal(frames.at(-1).value,1);assert.deepEqual(times,[0,.5,1]);assert.throws(()=>s.clock.setActorVisible('player',false));s.dispose();s.dispose();assert.equal(released,2);
});
test('geometry validation rejects invalid joint and triangle indices',()=>{
  const p={actorId:'a',positions:new Float32Array([0,0,0,1,0,0,0,1,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1]),uv:new Float32Array(6),joints:new Uint16Array(12),weights:new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0]),indices:new Uint16Array([0,1,2]),skin:0,color:[1,1,1,1]};
  validatePrimitive(p,[1]);p.joints[0]=1;assert.throws(()=>validatePrimitive(p,[1]));p.joints[0]=0;p.indices[2]=3;assert.throws(()=>validatePrimitive(p,[1]));
});
