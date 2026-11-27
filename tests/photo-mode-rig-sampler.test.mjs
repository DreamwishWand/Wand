import test from 'node:test';
import assert from 'node:assert/strict';
import {RigSampler} from '../src/lib/photo-mode/rig-sampler.ts';
const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const node=(parent,translation=[0,0,0])=>({parent,translation,rotation:[0,0,0,1],scale:[1,1,1]});
test('absolute sampling combines parent and child transforms without state drift',()=>{
 const rig=new RigSampler([node(-1),node(0,[0,1,0])],[{joints:[1],inverseBind:identity}],[{node:0,path:'translation',times:new Float32Array([0,2]),values:new Float32Array([0,0,0,2,0,0])}]);
 const p=rig.sample(1)[0];assert.deepEqual([...p.slice(12,15)],[1,1,0]);rig.sample(2);assert.deepEqual(rig.sample(1)[0],p);assert.deepEqual([...rig.sample(-1)[0].slice(12,15)],[0,1,0]);
});
test('quaternion hemisphere continuity and invalid track rejection',()=>{
 const t={node:0,path:'rotation',times:new Float32Array([0,1]),values:new Float32Array([0,0,0,1,0,0,0,-1])};
 const skins=[{joints:[0],inverseBind:identity}];
 assert.deepEqual(new RigSampler([node(-1)],skins,[t]).sample(.5)[0],identity);
 assert.throws(()=>new RigSampler([node(-1)],skins,[t,t]),/Invalid track/);
 assert.throws(()=>new RigSampler([node(0)],skins,[t]),/Invalid rest transform/);
});
