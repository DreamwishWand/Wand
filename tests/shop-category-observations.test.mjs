import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPinnedPublicNativeShopSnapshot} from '../src/lib/acquisition/public-native-shop.ts';
import {nativeShopPresentation,createShopCategoryObservations} from '../src/lib/media/shop-category-observations.ts';
test('native one-line and grid categories are not interchangeable',()=>{
 for(const c of ['Companion Bundles','Dream Bundles','Signature Bundles'])assert.equal(nativeShopPresentation(c),'one_line');
 for(const c of ['Seasonal Bundles','Featured','Spotlight Collection','Limited-Time Deals','Recommended'])assert.equal(nativeShopPresentation(c),'grid');
 assert.equal(nativeShopPresentation('unknown'),'unsupported');
 assert.throws(()=>createShopCategoryObservations([{snapshotKey:'fake',offers:[]}]),/SHOP_CATEGORY_SOURCE_REQUIRED/);
});
test('all 29 pinned November appearances match exact ordered current contents',async()=>{
 const bytes=readFileSync('static/acquisition/public/shop-cache-2026-11-22.json');
 const s=await loadPinnedPublicNativeShopSnapshot('',async()=>new Response(bytes));
 const lookup=createShopCategoryObservations([s]);
 const catalog=JSON.parse(readFileSync('data/ddv/item-master/premium-bundles-public.json','utf8'));
 let one=0,grid=0;
 for(const offer of s.offers){
   const definition=catalog.definitions.find(d=>d.bundleId===offer.nativeOfferId);
   assert(definition?.current,offer.nativeOfferId);
   const rows=lookup(definition,definition.current);
   assert.equal(rows.length,1,offer.nativeOfferId);
   if(rows[0].presentation==='one_line')one++;else if(rows[0].presentation==='grid')grid++;
   assert.equal(lookup(definition,{...definition.current,components:[]}).length,0);
 }
 assert.equal(one,9);assert.equal(grid,20);
});
