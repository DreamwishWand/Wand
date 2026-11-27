import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFrameRect,nativeFramePlan,nativeFrameCovers,nativeFrameCanSatisfy,nativeFrameSize} from '../src/lib/media/native-frame-rect.ts';
const full={x:0,y:0,width:4926,height:4988};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('full native map fits landscape viewport without stretching or clipping',()=>{
 const r=nativeFrameRect(full,full,1672,626);
 near(r.height,626);near(r.width,4926*626/4988);
 near(r.left,(1672-r.width)/2);near(r.top,0);
 assert.ok(r.left>=0&&r.left+r.width<=1672);
});
test('fit stays correct for portrait and square viewports',()=>{
 for(const [w,h] of [[360,800],[800,800],[2048,600]]){
  const r=nativeFrameRect(full,full,w,h);
  near(r.left+r.width/2,w/2);near(r.top+r.height/2,h/2);
  near(r.width/r.height,full.width/full.height);
  assert.ok(r.width<=w+1e-9&&r.height<=h+1e-9);
 }
});
test('a completed old frame moves with the current camera while redraw is pending',()=>{
 const view={x:800,y:500,width:2463,height:2494};
 const old={...view,x:1000,y:750};
 const fit=nativeFrameRect(view,view,1672,626);
 const r=nativeFrameRect(view,old,1672,626);
 near(r.left-fit.left,200*626/2494);
 near(r.top-fit.top,250*626/2494);
 near(r.width,fit.width);near(r.height,fit.height);
 const zoomed=nativeFrameRect(view,full,1672,626);
 near(zoomed.width,fit.width*2);near(zoomed.height,fit.height*2);
 near(zoomed.left,fit.left-800*626/2494);
 near(zoomed.top,fit.top-500*626/2494);
});

test('bounded guard band preserves requested pixel density and covers nearby pan only',()=>{
 const v={x:100,y:200,width:1000,height:800},p=nativeFramePlan(v,1000,800);
 assert.equal(p.w,1250);assert.equal(p.h,1000);near(p.view.width,1250);near(p.view.height,1000);
 assert.equal(nativeFrameCovers(p,{...v,x:200,y:250},1000,800),true);
 assert.equal(nativeFrameCovers(p,{...v,x:226},1000,800),false);
 assert.equal(nativeFrameCovers(p,{...v,width:500,height:400},1000,800),false);
 assert.equal(nativeFrameCovers(p,v,999,800),false);
});
test('guard band never reduces requested resolution or exceeds backing buffer cap',()=>{
 for(const [w,h] of [[2048,2048],[4096,512],[1920,1080],[4000,1000],[360,800]]){
  const v={x:0,y:0,width:2*w,height:2*h},p=nativeFramePlan(v,w,h);
  assert.ok(p.w>=w&&p.h>=h&&p.w<=4096&&p.h<=4096&&p.w*p.h<=4194304);
  near(p.w/p.view.width,w/v.width);near(p.h/p.view.height,h/v.height);
  assert.equal(nativeFrameCovers(p,v,w,h),true);
 }
});

test('in-flight frame can satisfy a later same-density pan but not another map or layer state',()=>{
 const layers=[],source=()=>{},view={x:0,y:0,width:1000,height:800};
 const identity={layers,source,key:'valley:unlocked'};
 const request={...identity,view,w:1000,h:800};
 const frame={...identity,...nativeFramePlan(view,1000,800)};
 assert.equal(nativeFrameCanSatisfy(frame,{...request,view:{...view,x:120,y:80}}),true);
 assert.equal(nativeFrameCanSatisfy(frame,{...request,view:{...view,x:126}}),false);
 assert.equal(nativeFrameCanSatisfy(frame,{...request,key:'valley:locked'}),false);
 assert.equal(nativeFrameCanSatisfy(frame,{...request,layers:[]}),false);
 assert.equal(nativeFrameCanSatisfy(frame,{...request,source:()=>{}}),false);
 assert.equal(nativeFrameCanSatisfy(frame,{...request,view:{...view,width:500,height:400}}),false);
});
test('rounded framebuffer size remains inside axis and area limits',()=>{
 for(const width of [1,17,503,1000,1999,2047,2048,2049,4096,8192]){
  for(const height of [1,73,499,999,2047,2049,4096,8000]){
   const v={x:0,y:0,width,height},size=nativeFrameSize(v,9000,9000);
   assert.ok(size.w>=1&&size.h>=1&&size.w<=4096&&size.h<=4096&&size.w*size.h<=4194304);
   const p=nativeFramePlan(v,size.w,size.h);
   assert.ok(p.w*p.h<=4194304&&p.w<=4096&&p.h<=4096);
  }
 }
});
