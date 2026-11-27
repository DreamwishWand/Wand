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
