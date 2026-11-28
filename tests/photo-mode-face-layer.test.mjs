import test from 'node:test';
import assert from 'node:assert/strict';
import {RigSampler} from '../src/lib/photo-mode/rig-sampler.ts';
import {bindFaceLayer,parseFaceLayer} from '../src/lib/photo-mode/face-layer.ts';
const c=v=>({kind:'constant',value:v});
const clip={body:'male',number:0,name:'face_center_bashful_smile_01',sourceSha256:'a'.repeat(64),start:0,duration:6.666667,loop:true,tracks:Array.from({length:32},(_,i)=>[1,2,3].map(attribute=>({path:'root/Bip001 Head/face'+i,attribute,curves:(attribute===2?[0,0,0,1]:attribute===1?[1,2,3]:[1,1,1]).map(c)}))).flat(),parameters:{}};
test('normal native face layer resolves player paths only and reflects source coordinates',()=>{
 const layer=parseFaceLayer(new TextEncoder().encode(JSON.stringify(clip)).buffer,'male',0,clip.sourceSha256);
 const paths=[undefined,...Array.from({length:32},(_,i)=>'root/Bip001 Head/face'+i),undefined];
 const bound=bindFaceLayer(layer,paths);const tracks=bound.sample(2);
 assert.deepEqual(tracks[0],{node:1,path:'translation',value:[-1,2,3]});assert.deepEqual(tracks[1].value,[0,-0,-0,1]);assert.deepEqual(bound.sample(2+clip.duration),tracks);assert.deepEqual(bound.weights(0),[0,0,0,0,0]);
 assert.throws(()=>bindFaceLayer(layer,paths.slice(0,10)));assert.throws(()=>bindFaceLayer(layer,[...paths,paths[1]]));
});
test('layer overrides face transforms without modifying base body or actor animation',()=>{
 const id=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),node=parent=>({parent,translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]});
 const rig=new RigSampler([node(-1),node(0),node(-1)],[{joints:[0,1,2],inverseBind:new Float32Array([...id,...id,...id])}],[{node:0,path:'translation',times:new Float32Array([0,1]),values:new Float32Array([0,0,0,2,0,0])},{node:2,path:'translation',times:new Float32Array([0,1]),values:new Float32Array([0,0,0,0,2,0])}]);
 const plain=rig.sample(.5)[0],layer=rig.sample(.5,[{node:1,path:'translation',value:[0,3,0]}])[0];
 assert.deepEqual([...layer.slice(0,16)],[...plain.slice(0,16)]);assert.deepEqual([...layer.slice(32,48)],[...plain.slice(32,48)]);assert.equal(layer[16+13],3);assert.deepEqual(rig.sample(.5)[0],plain);
});
