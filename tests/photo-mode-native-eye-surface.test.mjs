import test from 'node:test';import assert from 'node:assert/strict';
import {nativeEyeColor,nativeEyeHighlight} from '../src/lib/photo-mode/native-eye-surface.ts';
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
