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

test('body comparison keeps absolute time, view, playback and hidden actor preferences across missing actors',()=>{
  const create=(duration,pet)=>{
    const frames=[];
    const scene={duration,actors:[{id:'player',label:'Player',canHide:false},...(pet?[{id:'companion',label:'Pet',canHide:true}]:[])],primitives:[],jointCounts:[1],center:[0,0,0],radius:1,sample(t){return [new Float32Array(16).fill(t)]},dispose(){}};
    const session=new PoseSceneSession(scene,{draw(p,v,h){frames.push({time:p[0][0],view:{...v},hidden:[...h]})},dispose(){}});
    return {session,frames};
  };
  const first=create(4,true).session;
  first.clock.seek(2.5);first.clock.setSpeed(.5);first.clock.setLoop(false);first.clock.play();first.move(100,30,400,400);first.zoom(2);first.clock.setActorVisible('companion',false);
  let comparison=first.comparison();first.dispose();
  const short=create(2,false);short.session.restoreComparison(comparison);
  assert.equal(short.session.state.time,2);assert.equal(short.session.state.playing,false);assert.equal(short.session.state.speed,.5);assert.equal(short.session.state.loop,false);assert.deepEqual(short.session.camera,comparison.view);assert.deepEqual(short.frames.at(-1).hidden,[]);
  short.session.clock.seek(1);short.session.clock.play();comparison=short.session.comparison(comparison);short.session.dispose();
  const again=create(4,true);again.session.restoreComparison(comparison);
  assert.equal(again.session.state.time,1);assert.equal(again.session.state.playing,true);assert.deepEqual(again.frames.at(-1).hidden,['companion']);assert.deepEqual(again.frames.at(-1).view,comparison.view);
  again.session.clock.setActorVisible('companion',true);assert.deepEqual(again.session.comparison(comparison).hidden,[]);again.session.dispose();
});
