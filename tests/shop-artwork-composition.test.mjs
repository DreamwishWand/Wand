import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SHOP_LIGHT_LAYOUTS,shopArtworkTemplate} from '../src/lib/media/shop-artwork-layout.ts';
import {resolveShopArtwork} from '../src/lib/media/shop-artwork-composition.ts';
const origin='https://media.dreamwishwand.com';
const a={kind:'shop',thumbnail:{sha256:'a'.repeat(64),width:512,height:256},
original:{sha256:'b'.repeat(64),width:1024,height:512},fill:'contain'};
test('native selector mappings and layout widths',()=>{
  for(const k of SHOP_LIGHT_LAYOUTS)assert(shopArtworkTemplate(k));
  assert.equal(shopArtworkTemplate('Single_22_Small'),null);
  assert.equal(shopArtworkTemplate(undefined),null);
  const m=shopArtworkTemplate('Light_Mega_111');
  assert.equal(m.slots.length,3);
  assert.deepEqual(m.slots.map(s=>s.binding),['MegaBundleImage1','MegaBundleImage2','MegaBundleImage3']);
  assert.equal(m.slots[0].x,10);
  assert.equal(m.separators[0].width,70);
  assert(Math.abs(m.slots.at(-1).x+m.slots.at(-1).width-490)<1e-9);
  const s=shopArtworkTemplate('Light_Single');
  assert.equal(s.slots[0].width,500);assert.equal(s.scroll.width,460);
  assert.equal(shopArtworkTemplate('Light_Dual').slots.length,1);
});
test('resolved native bindings reuse canonical assets without fallback',()=>{
  const data={publicationVerified:true,layout:'Light_Mega_11',bindings:{MegaBundleImage1:a,MegaBundleImage2:a}};
  const r=resolveShopArtwork(origin,data);
  assert.equal(r.slots[0].image.url,origin+'/images/'+'a'.repeat(64)+'.webp');
  assert.equal(r.slots[1].image.url,r.slots[0].image.url);
  assert.equal(resolveShopArtwork(origin,data,true).slots[0].image.url,origin+'/images/'+'b'.repeat(64)+'.webp');
  assert.equal(resolveShopArtwork(origin,{...data,bindings:{MegaBundleImage1:a}}),null);
  assert.equal(resolveShopArtwork(origin,{...data,publicationVerified:false}),null);
  assert.equal(resolveShopArtwork(origin,{...data,layout:'Single_Mega_11'}),null);
});
