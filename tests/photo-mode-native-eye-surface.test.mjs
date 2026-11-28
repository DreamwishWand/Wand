import test from 'node:test';import assert from 'node:assert/strict';
import {nativeEyeColor,nativeEyeHighlight,packNativeEyeColor,nativeEyePackedOutput} from '../src/lib/photo-mode/native-eye-surface.ts';
const c=[[1,0,0,1],[0,1,0,1],[0,0,1,1]];
test('eye native color: sequential blend, blue modulation and alpha preserve source',()=>{
 assert.deepEqual(nativeEyeColor([1,1,1,1],c),[1,0,0]);
 assert.deepEqual(nativeEyeColor([0,1,1,1],c),[0,1,0]);
 assert.deepEqual(nativeEyeColor([0,0,.5,1],c),[0,0,.5]);
 assert.deepEqual(nativeEyeColor([.5,.5,1,1],c),[.5,.25,.25]);
 assert.deepEqual(nativeEyeColor([.5,.5,1,0],c),[.5,.5,1]);
 assert.deepEqual(nativeEyeColor([.5,.5,1,.5],c),[.5,.375,.625]);
});
test('native eye highlight response is the clamped exponent, not generic PBR gloss',()=>{
 assert.equal(nativeEyeHighlight(1,.005,200),1);
 assert.ok(nativeEyeHighlight(.995,.005,200)===1);
 assert.ok(nativeEyeHighlight(.98,.005,200)<.05);
 assert.ok(nativeEyeHighlight(0,.005,200)>=0);
});

test('original combiner packs red and alpha, not green or blue, in half-float UV components',()=>{
 const p=packNativeEyeColor(new Float32Array([1,0,0,1,0,1,1,0,0,1,1,128/255]));
 assert.deepEqual([...p],[1,1,0,0,0,0.501953125]);
 assert.throws(()=>packNativeEyeColor(new Float32Array([0,1,2,1])));
});
test('eye shadow suppresses gloss and applies original premultiplied vertex alpha',()=>{
 assert.deepEqual(nativeEyePackedOutput([1,1,1],[.2,.2,.2],[0,.5]),[.48,.48,.48,.5]);
 assert.deepEqual(nativeEyePackedOutput([1,1,1],[.2,.2,.2],[0,0]),[0,0,0,0]);
 assert.deepEqual(nativeEyePackedOutput([0,0,0],[.2,.2,.2],[1,1]),[.2,.2,.2,1]);
});
