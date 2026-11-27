import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeMaskedPreview} from '../src/lib/media/native-map-draw-plan.ts';
const quad=[4,0,0,4,0,0],identity=[1,0,0,1,0,0];
const background={node:'base',blockerAreaTypes:[],kind:'fill',unitQuadToCanvas:quad,rgba:[1,.5,0,.8]};
const overlay={node:'overlay',drawOrder:1,quad,mode:'area-lock',activeInPrefab:true,graphicEnabled:true,areaType:60,kind:'fill',rgba:[0,.5,1,.7],mask:{quad,kind:'solid-fallback'}};
const states=new Map([[60,true]]),alpha=new Map([['base',.3],['overlay',.5]]);
test('ordered preview applies inherited opacity only to draw alpha',()=>{
 const result=buildNativeMaskedPreview([background],[overlay],['base','overlay'],identity,states,()=>undefined,alpha);
 assert.equal(result.canvasGroupAlphaApplied,true);
 assert.equal(result.canvasGroupAlphaVerified,false);
 assert.equal(result.maskGpuVerified,false);
 assert.deepEqual(result.layers[0].rgba,[1,.5,0,.8*.3]);
 assert.deepEqual(result.layers[1].rgba,[0,.5,1,.7*.5]);
 assert.equal(result.layers[1].mask.kind,'rect');
 assert.equal(background.rgba[3],.8);
 assert.equal(overlay.rgba[3],.7);
});
test('missing or invalid opacity refuses preview without guessing',()=>{
 for(const invalid of [new Map(),new Map([['base',1],['overlay',NaN]]),new Map([['base',1.1],['overlay',1]])]){
  assert.throws(()=>buildNativeMaskedPreview([background],[overlay],['base','overlay'],identity,states,()=>undefined,invalid));
 }
 const unlocked=buildNativeMaskedPreview([background],[overlay],['base','overlay'],identity,new Map([[60,false]]),()=>undefined,new Map([['base',1]]));
 assert.equal(unlocked.layers.length,1);
 assert.equal(unlocked.layers[0].rgba[3],.8);
});
