import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadPinnedPublicNativeShopSnapshot,loadPinnedHistoricalNativeShopSnapshot} from '../src/lib/acquisition/public-native-shop.ts';
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
  assert.equal(view.records.length,39);
  assert.equal(new Set(view.records.map(r=>r.nativeOfferId)).size,39);
  assert.equal(new Set(view.records.flatMap(r=>r.components.map(p=>p.itemId))).size,103);
  assert.equal(view.records.filter(r=>r.name.source==='native_title').length,20);
  assert.equal(view.records.filter(r=>r.name.source==='native_item_display_name').length,19);
  assert.equal(imageCalls,0);
  for(const r of view.records){
    const o=s.find(x=>x.snapshotKey===r.snapshotKey).getOffer(r.nativeOfferId);
    assert.deepEqual(r.components.map(p=>[String(p.itemId),p.quantity]),o.components.map(p=>[p.itemId,p.quantity]));
    assert.equal(r.name.requestedLocaleVerified,!o.title);
    assert.equal(r.artworkStatus,'not_verified');
    for(const p of r.components)assert(view.getItemBundles(p.itemId).includes(r));
  }
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
