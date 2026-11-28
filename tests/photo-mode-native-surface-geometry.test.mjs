import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeNativeSurfaceGeometry,reflectedSkinTangents,surfaceGeometryBytes} from '../src/lib/photo-mode/native-surface-geometry.ts';
function raw(mask,values){const b=new ArrayBuffer(12+4*values.length),v=new DataView(b);v.setUint32(0,0x31475357,true);v.setUint32(4,1,true);v.setUint32(8,mask,true);values.forEach((x,i)=>v.setFloat32(12+4*i,x,true));return b}
test('source tangent and optional channels are preserved without manufactured UVs',()=>{
 const a=decodeNativeSurfaceGeometry(raw(4,[1,0,0,0]),1,4);
 assert.deepEqual([...a.tangent],[1,0,0,0]);assert.equal(a.uv1,undefined);assert.equal(a.uv2,undefined);
 const b=decodeNativeSurfaceGeometry(raw(108,[1,0,0,-1,1,0,0,1,.25,.75,.5,.125]),1,108);
 assert.deepEqual([...b.color],[1,0,0,1]);assert.deepEqual([...b.uv1],[.25,.75]);assert.deepEqual([...b.uv2],[.5,.125]);
 assert.equal(surfaceGeometryBytes(1,108),60);
});
test('reflect using original native shader tangent sign rule including zero',()=>{
 assert.deepEqual([...reflectedSkinTangents(new Float32Array([1,2,3,1,1,2,3,-1,1,2,3,0]))],[-1,2,3,-1,-1,2,3,1,-1,2,3,1]);
});
test('reject mismatched counts, invalid masks and malformed values',()=>{
 assert.throws(()=>decodeNativeSurfaceGeometry(raw(4,[1,0,0,1]),2,4));
 assert.throws(()=>decodeNativeSurfaceGeometry(raw(4,[1,0,0,.5]),1,4));
 assert.throws(()=>decodeNativeSurfaceGeometry(raw(4,[NaN,0,0,1]),1,4));
 assert.throws(()=>surfaceGeometryBytes(1,8));assert.throws(()=>surfaceGeometryBytes(1,128|4));
});
