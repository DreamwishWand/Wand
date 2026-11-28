import test from 'node:test';
import assert from 'node:assert/strict';
import {shopOneLineArtworkTemplate} from '../src/lib/media/shop-artwork-layout.ts';
import {inspectOneLineShopArtwork} from '../src/lib/media/shop-artwork-inspection.ts';
test('native fixed one-line prefab scales from caller dimensions, not serialized width',()=>{
 const t=shopOneLineArtworkTemplate(1500,508);
 assert.deepEqual(t.main,{binding:'CurrentImage',x:-14,y:-14,width:928,height:538,fill:'cover'});
 assert.deepEqual(t.scroll,{x:902,y:0,width:598,height:444,itemWidth:300,fill:'contain'});
 assert.equal(t.preferredHeight,508);assert.equal(t.serializedRootWidth,1320);
 assert.equal(shopOneLineArtworkTemplate(1800,600).scroll.width,898);
 assert.equal(shopOneLineArtworkTemplate(1800,600).scroll.height,536);
 assert.equal(shopOneLineArtworkTemplate(902,508),null);
 assert.equal(shopOneLineArtworkTemplate(1500,64),null);
 assert.equal(shopOneLineArtworkTemplate(NaN,508),null);
});
test('one-line Icon uses Sprite, independent of grid layout and component expansion',()=>{
 const calls=[],reader={get:(address,kind)=>{calls.push([address,kind]);return {address,kind};}};
 const v={gameVersion:'1.26.2',artwork:{image:'guid:main',adjustImage:true,imageAdjustment:{MarginTop:70}},components:[{itemId:1,image:'guid:first'},{itemId:2,image:'guid:second'}]};
 const r=inspectOneLineShopArtwork(v,reader,1500,508);
 assert.deepEqual(calls,[['guid:main','Sprite'],['guid:first','Sprite']]);
 assert.equal(r.template.main.fill,'cover');assert.equal(r.renderingVerified,false);assert.equal(r.runtimeOrderVerified,false);
 assert.equal(inspectOneLineShopArtwork({...v,gameVersion:'1.24.1'},reader,1500,508),null);
});
