import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeHairPropertyColors,validNativeHairPalette,validNativeHairInputs} from '../src/lib/photo-mode/native-hair-inputs.ts';
const a=[.1,.2,.3,1],b=[.4,.5,.6,.2],c=[.7,.8,.9,.3],h=[.2,.4,.6,.17];
const palette={base:[{index:0,displayOrder:1,baseColor:a,firstColor:b,secondColor:c},{index:1,displayOrder:0,baseColor:c,firstColor:a,secondColor:b}],highlight:[{index:0,displayOrder:1,baseColor:h},{index:1,displayOrder:0,baseColor:h}]};
test('native property block uses array index not display order; overwrites highlight alpha',()=>{
 assert.equal(validNativeHairPalette(palette),true);
 assert.deepEqual(nativeHairPropertyColors(palette,0,0),{base:a,three:b,two:c,one:[.2,.4,.6,0]});
 assert.deepEqual(nativeHairPropertyColors(palette,1,1),{base:c,three:a,two:b,one:[.2,.4,.6,1]});
 for(const index of [-1,2,.1,NaN]){assert.equal(nativeHairPropertyColors(palette,index,0),undefined);assert.equal(nativeHairPropertyColors(palette,0,index),undefined)}
 assert.equal(validNativeHairPalette({...palette,base:[{...palette.base[0],index:1},palette.base[1]]}),false);
 assert.equal(validNativeHairPalette({...palette,highlight:[{...palette.highlight[0],displayOrder:0},palette.highlight[1]]}),false);
});
test('native GPU input accepts only bounded opaque materials and verified mip layouts',()=>{
 const map={width:2,height:2,colorSpace:0,mipByteLengths:[16,4],pixels:new Uint8Array(20)};
 const hair={shader:'PBR/PBR Hair',dst:0,tangent:new Float32Array([1,0,0,-1]),uv:new Float32Array(2),mask:map,maps:map,normal:map,colors:nativeHairPropertyColors(palette,0,1)};
 assert.ok(validNativeHairInputs(hair,1));
 assert.ok(!validNativeHairInputs({...hair,dst:1},1));
 assert.ok(!validNativeHairInputs({...hair,normal:{...map,colorSpace:1}},1));
 assert.ok(!validNativeHairInputs({...hair,maps:{...map,mipByteLengths:[20]}},1));
 assert.ok(!validNativeHairInputs({...hair,tangent:new Float32Array([1,0,0,0])},1));
});
