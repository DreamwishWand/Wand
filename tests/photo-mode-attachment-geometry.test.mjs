import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeAttachmentPart,bindAttachments} from '../src/lib/photo-mode/attachment-geometry.ts';
import {RigSampler} from '../src/lib/photo-mode/rig-sampler.ts';
const ident=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const rest=(parent)=>({parent,translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]});
function fixture(){
 const n=3,ic=3,jc=1,raw=new ArrayBuffer(16+72*n+4*ic+64*jc),v=new DataView(raw);
 [0x31414857,n,ic,jc].forEach((x,i)=>v.setUint32(i*4,x,true));let off=16;
 function floats(a){for(const x of a){v.setFloat32(off,x,true);off+=4}}
 floats([0,0,0,1,0,0,0,1,0]);floats([0,0,1,0,0,1,0,0,1]);floats([0,0,1,0,0,1]);floats([1,0,0,-1,1,0,0,-1,1,0,0,-1]);off+=n*8;floats([1,0,0,0,1,0,0,0,1,0,0,0]);for(const x of [0,1,2]){v.setUint32(off,x,true);off+=4}floats(ident());assert.equal(off,raw.byteLength);
 return {raw,entry:{asset:{sha256:'0'.repeat(64),bytes:raw.byteLength},vertices:n,indices:ic,jointPaths:['root/head/hair']}};
}
test('WHA source mesh decoding validates counts, weights, indices and tangent handedness',()=>{
 const {raw,entry}=fixture();const g=decodeAttachmentPart(raw,entry);assert.deepEqual([...g.indices],[0,1,2]);assert.equal(g.tangent[3],-1);assert.deepEqual([...g.inverseBind],[...ident()]);
 assert.throws(()=>decodeAttachmentPart(raw,{...entry,vertices:4}));const corrupt=raw.slice(0);new DataView(corrupt).setFloat32(16+3*3*4+3*3*4+3*2*4+3*4*4+3*4*2,0,true);assert.throws(()=>decodeAttachmentPart(corrupt,entry));
});
test('attachment bones follow animation and share paths without changing existing node indices',()=>{
 const {raw,entry}=fixture();const geometry=decodeAttachmentPart(raw,entry);
 const nodes=[rest(-1),rest(0),rest(1),rest(-1)],paths=['body','root','root/head',undefined],skins=[{joints:[2],inverseBind:ident()}];
 const extra={path:'root/head/hair',parentPath:'root/head',translation:[0,.5,0],rotation:[0,0,0,1],scale:[1,1,1]};
 const p={extraNodes:[extra],parts:[{geometry,hair:{shader:'PBR/PBR Hair',dst:0}}]};
 const prim=bindAttachments(nodes,skins,paths,[p,p]);assert.equal(nodes.length,5);assert.equal(prim.length,2);assert.deepEqual(skins.map(s=>s.joints),[[2],[4],[4]]);
 const sampler=new RigSampler(nodes,skins,[{node:2,path:'translation',times:new Float32Array([0,1]),values:new Float32Array([0,0,0,2,0,0])}]);
 const a=sampler.sample(.5);assert.deepEqual([...a[0].slice(12,15)],[1,0,0]);assert.deepEqual([...a[1].slice(12,15)],[1,.5,0]);
 assert.throws(()=>bindAttachments(nodes,skins,paths,[{...p,extraNodes:[{...extra,translation:[0,1,0]}]}]));
});
