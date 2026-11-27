import test from 'node:test';
import assert from 'node:assert/strict';
import {intersects,validateLayer} from '../src/lib/media/native-map-renderer.ts';
const fill={kind:'fill',unitQuadToCanvas:[16,0,0,16,0,0],rgba:[0,0,1,.5]};
const sdf={...fill,kind:'sdf',size:[2,2],imageSha256:'a'.repeat(64),wrap:[1,1],colorSpace:'Linear'};
test('native candidate layers retain full affine and numeric SDF red metadata',()=>{
 for(const l of [fill,sdf,{...sdf,kind:'texture',colorSpace:'sRGB',wrap:[0,1]}])assert.doesNotThrow(()=>validateLayer(l));
 for(const l of [{...sdf,colorSpace:'sRGB'},{...sdf,size:[0,1]},{...sdf,wrap:[3,0]},{...sdf,imageSha256:'x'},{...fill,rgba:[0,0,0,2]},{...fill,unitQuadToCanvas:[0,0,0,1,0,0]}])assert.throws(()=>validateLayer(l));
});
test('viewport culling accounts for mirrored and rotated quads',()=>{
 const v={x:0,y:0,width:16,height:16};
 assert.equal(intersects(fill.unitQuadToCanvas,v),true);
 assert.equal(intersects([-16,0,0,16,16,0],v),true);
 assert.equal(intersects([0,16,-16,0,16,0],v),true);
 assert.equal(intersects([16,0,0,16,16,0],v),false);
 assert.equal(intersects([2,0,0,2,-5,-5],v),false);
});

import {NativeMapRenderer} from '../src/lib/media/native-map-renderer.ts';
function fakeContext(){
 const stats={created:0,deleted:0,uploads:0,draws:0};let id=0;
 const noOp=()=>{};
 const g=new Proxy({drawingBufferWidth:16,drawingBufferHeight:16,COMPILE_STATUS:1,LINK_STATUS:2,MAX_TEXTURE_SIZE:3,NO_ERROR:0,
  createShader:()=>({}),createProgram:()=>({}),createVertexArray:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:()=>({}),getParameter:()=>32768,isContextLost:()=>false,getError:()=>0,
  createTexture:()=>({id:++id,created:++stats.created}),deleteTexture:()=>{stats.deleted++;},texImage2D:()=>{stats.uploads++;},drawArrays:()=>{stats.draws++;}},
 {get:(t,k)=>k in t?t[k]:typeof k==='string'&&/^[A-Z_0-9]+$/.test(k)?10:noOp});
 return {canvas:{getContext:()=>g},stats};
}
const view={x:0,y:0,width:16,height:16};
const texture={...sdf,kind:'texture',colorSpace:'sRGB'};
const next={...texture,imageSha256:'b'.repeat(64)};
test('texture cache reuses GPU allocation and evicts least recently used within budget',async()=>{
 const {canvas,stats}=fakeContext(),r=new NativeMapRenderer(canvas,32);let loads=0,closed=0;
 const source=async()=>{loads++;return {width:2,height:2,close(){closed++;}};};
 await r.render([texture,next],view,source);
 await r.render([texture,next],view,source);
 assert.deepEqual(r.cacheStats,{textures:2,estimatedBytes:32});assert.equal(loads,2);assert.equal(stats.uploads,2);
 const third={...texture,imageSha256:'c'.repeat(64)};
 await r.render([texture,third],view,source);assert.equal(stats.deleted,1);
 await r.render([texture,next],view,source);assert.equal(loads,4);assert.equal(stats.deleted,2);
 r.releaseTextures();assert.deepEqual(r.cacheStats,{textures:0,estimatedBytes:0});assert.equal(stats.deleted,4);assert.equal(closed,loads);r.dispose();
});
test('source change, oversized textures and aborted upload release resources',async()=>{
 const {canvas,stats}=fakeContext(),r=new NativeMapRenderer(canvas,16);let closed=0;
 const source=async l=>({width:l.size[0],height:l.size[1],close(){closed++;}});
 await r.render([texture],view,source);
 await r.render([texture],view,async l=>source(l));assert.equal(stats.deleted,1);
 const large={...texture,size:[4,4]};await r.render([large],view,source);assert.equal(r.cacheStats.textures,0);assert.equal(stats.deleted,3);
 const c=new AbortController();await assert.rejects(r.render([texture],view,async l=>{c.abort();return source(l);},c.signal));
 assert.equal(closed,4);assert.equal(r.cacheStats.estimatedBytes,0);assert.equal(stats.uploads,3);r.dispose();
});
test('mask uses independent texture and keeps main texture leased through draw',async()=>{
 const {canvas,stats}=fakeContext(),r=new NativeMapRenderer(canvas,16);let closed=0;
 const source=async l=>({width:l.size[0],height:l.size[1],close(){closed++;}});
 const masked={...texture,mask:{kind:'alpha',overlayToMaskUv:[.5,0,0,.5,.25,.25],image:next}};
 await r.render([masked],view,source);assert.equal(stats.uploads,2);assert.equal(stats.deleted,1);assert.equal(stats.draws,1);assert.deepEqual(r.cacheStats,{textures:1,estimatedBytes:16});
 await r.render([masked],view,source);assert.equal(stats.uploads,3);assert.equal(stats.deleted,2);assert.equal(closed,3);
 await r.render([{...fill,mask:{kind:'rect',overlayToMaskUv:[2,0,0,2,-.5,-.5]}}],view,source);assert.equal(stats.uploads,3);
 r.dispose();assert.equal(stats.created,stats.deleted);
});
test('invalid mask and aborted second texture do not draw or leak',async()=>{
 const {canvas,stats}=fakeContext(),r=new NativeMapRenderer(canvas,0);const c=new AbortController();let closed=0;
 const masked={...texture,mask:{kind:'alpha',overlayToMaskUv:[1,0,0,1,0,0],image:next}};
 assert.throws(()=>validateLayer({...sdf,mask:masked.mask}));
 assert.throws(()=>validateLayer({...masked,mask:{...masked.mask,image:sdf}}));
 await assert.rejects(r.render([masked],view,async l=>{if(l===next)c.abort();return {width:2,height:2,close(){closed++;}};},c.signal));
 assert.equal(closed,2);assert.equal(stats.created,stats.deleted);assert.equal(stats.draws,0);r.dispose();
});
