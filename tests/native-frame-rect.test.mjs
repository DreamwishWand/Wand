import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFrameRect} from '../src/lib/media/native-frame-rect.ts';
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
