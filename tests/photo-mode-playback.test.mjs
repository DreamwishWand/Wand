import test from 'node:test';
import assert from 'node:assert/strict';
import {PosePlayback} from '../src/lib/photo-mode/playback.ts';
function fixture(){
  const samples=[], visible=[];
  const player=new PosePlayback(4,{sample:t=>samples.push(t),setVisible:(id,v)=>visible.push([id,v])});
  return {player,samples,visible};
}
test('absolute synchronized time, speed, pause, seek, loop and restart',()=>{
  const {player,samples}=fixture();
  player.play(); player.setSpeed(.25); player.tick(4);
  assert.equal(player.snapshot.time,1);
  player.pause(); player.tick(5); assert.equal(player.snapshot.time,1);
  player.seek(3.5); player.setSpeed(.75); player.play(); player.tick(2);
  assert.equal(player.snapshot.time,1);
  player.setLoop(false); player.tick(10);
  assert.equal(player.snapshot.time,4); assert.equal(player.snapshot.playing,false);
  player.restart(); assert.equal(player.snapshot.time,0); assert.equal(player.snapshot.playing,true);
  assert.deepEqual(samples,[0,1,3.5,1,4,0]);
});
test('visibility changes never sample or reset time, speed, loop or playback',()=>{
  const {player,samples,visible}=fixture();
  player.setSpeed(.5); player.play(); player.tick(3);
  const before=player.snapshot;
  player.setActorVisible('prop',false); player.setActorVisible('companion',false);
  assert.deepEqual(player.snapshot,before);
  assert.deepEqual(samples,[0,1.5]);
  player.tick(1);
  assert.deepEqual(samples,[0,1.5,2]);
  assert.deepEqual(visible,[['prop',false],['companion',false]]);
});
test('invalid time and speed fail without changing state',()=>{
  const {player}=fixture();
  assert.throws(()=>player.seek(NaN),RangeError);
  assert.throws(()=>player.tick(-1),RangeError);
  assert.throws(()=>player.setSpeed(2),RangeError);
  assert.equal(player.snapshot.time,0);
});
