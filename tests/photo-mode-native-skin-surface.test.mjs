import test from 'node:test';
import assert from 'node:assert/strict';
import {unpackNativeSkinNormal,nativeSkinSurface,nativeSkinWorldNormal,nativeSkinDirectSpecular,nativeSkinGradientU} from '../src/lib/photo-mode/native-skin-surface.ts';
const near=(a,b)=>{assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<1e-12,[a,b])};
test('native packed normal uses red multiplied by alpha, green and clamped squared length',()=>{
 near(unpackNativeSkinNormal([1,.5,0,.5]),[0,0,1]);
 near(unpackNativeSkinNormal([.5,.75,1,.5]),[-.5,.5,Math.sqrt(.5)]);
 near(unpackNativeSkinNormal([1,1,0,1]),[1,1,1e-16]);
});
test('source tangent basis honors both handedness signs',()=>{
 near(nativeSkinWorldNormal([1,.75,0,.5],[0,0,1],[1,0,0,1],1),[0,.5,Math.sqrt(.75)]);
 near(nativeSkinWorldNormal([1,.75,0,.5],[0,0,1],[1,0,0,-1],1),[0,-.5,Math.sqrt(.75)]);
 near(nativeSkinWorldNormal([1,.75,0,.5],[0,0,1],[1,0,0,-1],-1),[0,.5,Math.sqrt(.75)]);
 assert.throws(()=>nativeSkinWorldNormal([1,.5,0,.5],[0,0,0],[1,0,0,1],1));
});
test('skin surface uses makeup maps green as coverage and blue as gloss, no alpha blending approximation',()=>{
 near(nativeSkinSurface([.8,.6,.4,0],[0,0,.5,0],[.1,.2,.3,0],[0,.25,.1,0],.8),[.7,.65,.6,.4]);
 near(nativeSkinSurface([.8,.6,.4,1],[0,0,.5,1],[.1,.2,.3,1],[0,.25,.1,1],.8),[.7,.65,.6,.4]);
});

test('native direct light uses squared roughness floor, normalization and clamped dot products',()=>{
 const expected=(g,nh,lh)=>{const a=Math.max((1-g)**2,.0078125);return a*a/((nh*nh*(a*a-1)+1.00001)**2*Math.max(.1,lh*lh)*(4*a+2))};
 for(const g of [0,.2,.6,1])for(const nh of [0,.5,1])for(const lh of [0,.5,1])assert.ok(Math.abs(nativeSkinDirectSpecular(g,nh,lh)-expected(g,nh,lh))<1e-12);
 assert.equal(nativeSkinDirectSpecular(.4,2,-1,.2),nativeSkinDirectSpecular(.4,1,0,.2));
 near([nativeSkinGradientU(-1,1),nativeSkinGradientU(0,1),nativeSkinGradientU(1,1),nativeSkinGradientU(1,.25)],[0,.5,1,.25]);
});
