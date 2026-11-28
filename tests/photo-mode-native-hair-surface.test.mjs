import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeHairSurface} from '../src/lib/photo-mode/native-hair-surface.ts';
const colors={base:[.2,.3,.4,1],one:[.9,.8,.7,.5],two:[.1,.2,.9,0],three:[.6,.5,.1,1]};
const near=(a,b)=>{assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<1e-12,[a,b])};
test('native mask channel order and color one alpha',()=>{
 const maps=[0,.4,.6,0];
 near(nativeHairSurface([0,0,0,0],maps,colors,0,0).albedo,colors.base.slice(0,3));
 near(nativeHairSurface([0,0,1,0],maps,colors,0,0).albedo,colors.three.slice(0,3));
 near(nativeHairSurface([0,1,1,0],maps,colors,0,0).albedo,colors.two.slice(0,3));
 near(nativeHairSurface([1,1,1,0],maps,colors,0,0).albedo,[.5,.5,.8]);
 near(nativeHairSurface([1,1,1,1],maps,{...colors,one:[.9,.8,.7,0]},0,0).albedo,colors.two.slice(0,3));
});
test('independent weighted expansion and exact channel semantics',()=>{
 for(const r of [0,.2,1])for(const g of [0,.3,1])for(const b of [0,.7,1])for(const a of [0,.4,1]){
  const c={...colors,one:[...colors.one.slice(0,3),a]},t=r*a;
  const expected=[0,1,2].map(i=>(1-t)*(1-g)*((1-b)*c.base[i]+b*c.three[i])+(1-t)*g*c.two[i]+t*c.one[i]);
  const s=nativeHairSurface([r,g,b,1],[.2,.35,.8,.9],c,1,.4);
  near(s.albedo,expected);near(s.diffuse,expected.map(x=>x*.96));
  near([s.gloss,s.occlusion,s.alpha],[1,1-g,.35]);
 }
 const s=nativeHairSurface([.1,.2,.3,.4],[.9,.2,.1,.8],colors,0,-.2);
 near([s.gloss,s.occlusion,s.alpha],[0,.8,1]);
});
