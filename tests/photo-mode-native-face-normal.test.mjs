import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {decodeNormalPixels,selectedNormalMaps} from '../src/lib/photo-mode/native-face-normal.ts';
const hash=b=>createHash('sha256').update(b instanceof ArrayBuffer?new Uint8Array(b):b).digest('hex');
test('original eyes, nose, mouth, jaw and region mask are selected in native order',()=>{
 const male=Array.from({length:8},(_,i)=>({i,b:'m'})),female=Array.from({length:8},(_,i)=>({i,b:'f'})),mask={i:9};const index={bodies:{male,female},mask};
 assert.deepEqual(selectedNormalMaps(index,'female',4,[1,6,2]),[female[4],female[1],female[6],female[2],mask]);assert.throws(()=>selectedNormalMaps(index,'male',8));
});
test('normal decode keeps RGB values even at zero alpha; bounded, digest checked',async()=>{
 const rgba=new Uint8Array(1024*1024*4);rgba.set([15,88,255,0,120,11,5,3]);const z=deflateSync(rgba);const raw=new Uint8Array(z).buffer;
 const m={width:1024,height:1024,rgbaSha256:hash(rgba),asset:{bytes:raw.byteLength,sha256:hash(raw)}};
 const signal=new AbortController().signal;const a=await decodeNormalPixels(raw,m,signal);
 assert.deepEqual(a.rgba,rgba);await assert.rejects(decodeNormalPixels(raw,{...m,rgbaSha256:'0'.repeat(64)},signal));
 const oversized=deflateSync(new Uint8Array(rgba.length+1));await assert.rejects(decodeNormalPixels(new Uint8Array(oversized).buffer,{...m,asset:{bytes:oversized.length,sha256:hash(oversized)}},signal));
});
