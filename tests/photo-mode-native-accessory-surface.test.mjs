import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeAccessorySurface,nativeClothingSurface,nativeAccessoryVisible,nativeAccessoryBackfaceNormal} from '../src/lib/photo-mode/native-accessory-surface.ts';
const near=(a,b)=>{assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<1e-12,[a,b])};
const main=[.2,.4,.8,.1],tint=[.5,.75,.25,0],decal=[.1,.2,.3,.9];
test('generic source mask controls tint and metal, with independent gloss',()=>{
 for(const r of [0,.25,.5,1]){
  const s=nativeAccessorySurface(main,[r,.6,.7,.8],tint,.8,1.1,.1);
  const a=main.slice(0,3).map((v,i)=>v*(1-r)+v*tint[i]*r),m=r*.8;
  near(s.albedo,a);near(s.diffuse,a.map(v=>v*.96*(1-m)));near(s.specular,a.map(v=>.04*(1-m)+v*m));near([s.metallic,s.gloss],[m,.87]);
 }
});
test('clothing uses green of decal maps, not decal alpha; additive source RGB',()=>{
 for(const g of [0,.4,1]){
  const s=nativeClothingSurface(main,[.7,.1,.6,.8],tint,decal,[.8,g,.1,.2],.5,-.1);
  const a=main.slice(0,3).map((v,i)=>v*tint[i]*(1-g)+decal[i]);
  near(s.albedo,a);near(s.diffuse,a.map(v=>v*.288));near(s.specular,a.map(v=>.012+v*.7));near([s.metallic,s.gloss],[.7,.2]);
 }
});
test('metal and gloss saturate, albedo stays HDR-capable',()=>{
 const s=nativeClothingSurface([1,1,1,1],[2,0,1,0],[1,1,1,1],[1,1,1,1],[0,0,0,0],2,1);
 near(s.albedo,[2,2,2]);near(s.diffuse,[0,0,0]);near(s.specular,[2,2,2]);near([s.metallic,s.gloss],[1,1]);
});

test('native cutout threshold is maps green 0.5, independent of all other channels',()=>{for(const a of [0,1]){assert.equal(nativeAccessoryVisible([1,.4999,1,a],true),false);assert.equal(nativeAccessoryVisible([0,.5,0,a],true),true);assert.equal(nativeAccessoryVisible([0,0,0,a],false),true)}});
test('backface changes only geometric Z contribution of the mapped normal',()=>{const packed=[.75,.625,0,1],n=[0,0,1],t=[1,0,0,1],front=nativeAccessoryBackfaceNormal(n,t,packed,true),back=nativeAccessoryBackfaceNormal(n,t,packed,false);near(front,[.5,.25,Math.sqrt(.6875)]);near(back,[.5,.25,-Math.sqrt(.6875)]);near(nativeAccessoryBackfaceNormal(n,[1,0,0,-1],packed,false),[.5,-.25,-Math.sqrt(.6875)])});
