import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExpressionClip,sampleExpression,decodeExpressionDeltas} from '../src/lib/photo-mode/expression-weights.ts';
test('native facial curves preserve cubic, dense, constants and unclamped weights',()=>{
 const clip={name:'native',start:0,end:2,loop:true,parameters:{smile_small:{kind:'stream',keys:[[-3.4028234663852886e38,[0,0,0,20]],[0,[0,0,100,30]]]},smile_medium:{kind:'dense',begin:0,rate:1,values:[-10,50,100]},wink_right:{kind:'constant',value:120}}};
 const c=parseExpressionClip(new TextEncoder().encode(JSON.stringify(clip)).buffer);
 assert.deepEqual(sampleExpression(c,1),[1.3,.5,0,0,1.2]);assert.deepEqual(sampleExpression(c,3,2),sampleExpression(c,1));assert.deepEqual(sampleExpression(c,9),[2.3,1,0,0,1.2]);assert.throws(()=>sampleExpression(c,NaN));
});
test('source sparse expression frames expand into separate GPU deltas',()=>{
 const b=new ArrayBuffer(44),v=new DataView(b);v.setUint32(0,0x314d4557,true);v.setUint32(4,2,true);v.setUint32(8,1,true);v.setUint32(12,1,true);v.setFloat32(16,2,true);v.setFloat32(20,-3,true);v.setFloat32(24,4,true);
 const d=decodeExpressionDeltas(b,2);assert.equal(d.length,5);assert.deepEqual([...d[0]],[0,0,0,2,-3,4]);assert.deepEqual([...d[4]],[0,0,0,0,0,0]);assert.throws(()=>decodeExpressionDeltas(b,1));v.setUint32(12,2,true);assert.throws(()=>decodeExpressionDeltas(b,2));
});
