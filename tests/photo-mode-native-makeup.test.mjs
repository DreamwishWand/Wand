import test from 'node:test';
import assert from 'node:assert/strict';
import {NATIVE_MAKEUP_ORDER,resolveNativeMakeupLayers,compositeNativeMakeupPixel,bakeNativeMakeupPixel} from '../src/lib/photo-mode/native-makeup.ts';
const palette=Array.from({length:75},()=>[0,0,0,0]);palette[1]=[255,128,0,0];palette[2]=[0,255,0,0];
const defs={'1':{subtype:1,masks:{male:'m1',female:'f1'},defaultColorIndices:[1,2,2]},'2':{subtype:2,masks:{male:'m2',female:'f2'},defaultColorIndices:[2,1,1]}};
test('source order and asymmetric default color fallback',()=>{
 assert.deepEqual(NATIVE_MAKEUP_ORDER,[11,2,9,10,7,8,5,6,0,3,1,13,4]);
 const layers=resolveNativeMakeupLayers('female',palette,defs,{'1':{itemId:1,colorIndices:[-1,-1,-1],opacity:-1,gloss:0.5},'2':{itemId:2,colorIndices:[1,2,-1],opacity:0.5,gloss:0}});
 assert.deepEqual(layers.map(l=>l.mask),['f2','f1']);
 assert.equal(layers[1].opacity,1);assert.equal(layers[1].colors[0][0],1);assert.ok(Math.abs(layers[1].colors[0][1]-0.21586050011389926)<1e-12);
 assert.deepEqual(layers[1].colors.slice(1),[[0,0,0],[0,0,0]]);
 assert.deepEqual(layers[0].colors[1],[0,1,0]);assert.throws(()=>resolveNativeMakeupLayers('male',palette,defs,{'1':{itemId:2,colorIndices:[0,0,0],opacity:1,gloss:1}}));
});
test('native separate color and maps blend states',()=>{
 const d={color:[0.3,0.2,0.1,0.7],maps:[0,0.7,0.1,0.7]},s={color:[0.1,0.2,0,0.5],maps:[0,0.5,0.3,0.5]};
 const v=compositeNativeMakeupPixel(d,s);
 assert.ok(Math.abs(v.color[0]-0.25)<1e-12);assert.ok(Math.abs(v.color[1]-0.3)<1e-12);assert.equal(v.color[3],1);assert.deepEqual(v.maps,[0,1,0.4,1]);
 assert.deepEqual(bakeNativeMakeupPixel([],()=>[1,1,1,1]),{color:[0,0,0,0],maps:[0,0,0,0]});
});
