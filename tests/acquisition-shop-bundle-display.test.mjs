import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadPinnedPublicNativeShopSnapshot,loadPinnedHistoricalNativeShopSnapshot,loadPinnedShopBundleSources} from '../src/lib/acquisition/public-native-shop.ts';
import {createShopBundleDisplay} from '../src/lib/acquisition/shop-bundle-display.ts';
import {openPublicItemMaster} from '../src/lib/items/public-item-master.ts';
import {createPublicItemMediaReader} from '../src/lib/items/public-item-media.ts';

const fetcher=async url=>new Response(await readFile('static'+url.replace(/^\/Wand/,'')));
async function snapshots(){
  return Promise.all([loadPinnedPublicNativeShopSnapshot('/Wand',fetcher),loadPinnedHistoricalNativeShopSnapshot('/Wand',fetcher)]);
}
test('Shop view preserves exact source components and native title precedence; uses only requested item name field',async()=>{
  const s=await snapshots();
  const read={async getItemFields(ids,fields){
    assert.deepEqual(fields,['names.ja']);
    return ids.map(itemId=>({itemId,values:{'names.ja':'Item '+itemId}}));
  }};
  let imageCalls=0;
  const media={async getItemImages(ids){imageCalls++;return ids.map(()=>null);}};
  const view=await createShopBundleDisplay(s,read,'ja',media);
  assert.equal(view.records.length,56);
  assert.equal(view.presetRecords.length,39);
  assert.equal(view.records.filter(r=>!r.presetDiscoveryCandidate).length,17);
  assert.equal(new Set(view.records.map(r=>r.nativeOfferId)).size,48);
  assert.equal(new Set(view.records.flatMap(r=>r.components.map(p=>p.itemId))).size,186);
  assert.equal(view.records.filter(r=>r.name.source==='native_title').length,37);
  assert.equal(view.records.filter(r=>r.name.source==='native_item_display_name').length,19);
  assert.equal(imageCalls,0);
  for(const r of view.records){
    const o=s.find(x=>x.snapshotKey===r.snapshotKey).getOffer(r.nativeOfferId);
    assert.deepEqual(r.components.map(p=>[String(p.itemId),p.quantity]),o.components.map(p=>[p.itemId,p.quantity]));
    assert.equal(r.name.requestedLocaleVerified,!o.title);
    assert.equal(r.artworkStatus,'not_verified');
    assert(!Object.hasOwn(r,'observedWindow'));
    assert(!Object.hasOwn(r,'saleDiscountPercent'));
    assert(!Object.hasOwn(r,'configuredAllocationTotal'));
    for(const p of r.components)assert(view.getItemBundles(p.itemId).includes(r));
  }
  const excluded=view.records.find(r=>!r.presetDiscoveryCandidate);
  assert(excluded);
  const component=excluded.components[0];
  assert(view.getItemBundles(component.itemId).includes(excluded));
  assert(!view.getPresetItemBundles(component.itemId).includes(excluded));
  const introduced=view.getBundlesForAddedItems([component.itemId,component.itemId]);
  const matched=introduced.find(x=>x.bundle===excluded);
  assert(matched);
  assert.deepEqual(matched.addedItemIds,[component.itemId]);
  assert.equal(matched.bundle.components.length,excluded.components.length);
  assert.deepEqual(view.getBundlesForAddedItems([]),[]);
  const row=view.records[0];
  assert.equal((await view.getComponentImages(row.snapshotKey,row.nativeOfferId)).length,row.components.length);
  assert.equal(imageCalls,1);
});
test('real Item DB can supply native fallback names without private cache or image publication',async()=>{
  const s=await snapshots();
  const master=await openPublicItemMaster('/Wand',fetcher,{scope:'complete'});
  const media=createPublicItemMediaReader(master);
  const view=await createShopBundleDisplay(s,master,'ja',media);
  const hero=view.getOfferAppearances('HeroItem_CandyHouse')[0];
  assert(hero);
  const expected=(await master.getItemFields([20500011],['names.ja']))[0]?.values['names.ja'];
  assert.equal(hero.name.text,expected??null);
  assert.equal(hero.name.source,expected?'native_item_display_name':'missing');
  assert.equal(view.historicalCoverageComplete,false);
});

test('four original-backed sources feed one price-free catalog and retain changed bundle contents',async()=>{
  const sources=await loadPinnedShopBundleSources('/Wand',fetcher);
  const read={async getItemFields(ids,fields){return ids.map(itemId=>({itemId,values:{[fields[0]]:'Item '+itemId}}));}};
  const view=await createShopBundleDisplay(sources,read,'en',{async getItemImages(ids){return ids.map(()=>null);}});
  assert.equal(view.records.length,111);
  assert.equal(new Set(view.records.map(r=>r.nativeOfferId)).size,81);
  assert.equal(new Set(view.records.flatMap(r=>r.components.map(p=>p.itemId))).size,256);
  assert.equal(new Set(view.presetRecords.map(r=>r.nativeOfferId)).size,72);
  assert.equal(view.getOfferAppearances('MegaBundle_SummerSeason').length,2);
  assert(view.getOfferAppearances('MegaBundle_RedRidingHood').some(x=>x.components.length===10));
  assert(view.getOfferAppearances('VanityBundle_0001').length>1);
  for(const r of view.records)assert(!Object.hasOwn(r,'observedWindow'));
  const bad=async url=>{const res=await fetcher(url);if(!url.includes('shop-bundles-Shop20260923'))return res;
    const bytes=new Uint8Array(await res.arrayBuffer());bytes[10]^=1;return new Response(bytes);};
  await assert.rejects(loadPinnedShopBundleSources('/Wand',bad),/CATALOG_SHA/);
});
