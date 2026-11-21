import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcquisitionCatalogJoin} from '../src/lib/acquisition/db00-join.mjs';
import {inspectSavedWorldStoreCollection, WORLD_STORE_COLLECTION_CONTRACT}
  from '../src/lib/acquisition/world-store-collection.mjs';

const sourceSha = 'a'.repeat(64);
const item = (id, {names={},nameStatus='unverified',nativeCategory='Furniture'} = {}) =>
  ({id, names, nameStatus, nativeCategory, category:null, subcategory:null,
    worlds:[],universes:[],contentIds:[],releaseIds:[],relations:[],sourceRefs:['src01']});
function join({complete=false, extraItems=[]}={}) {
  const snapshot={schema:'wand.game-db.snapshot@1',id:'native-source-catalog',
    target:{platform:'Steam',gameVersion:'1.26.2',buildId:null,sourceSha256:sourceSha},
    coverage:{scope:'four-native-families',complete,categories:['Furniture','Clothing']},
    sources:[{id:'src01',sha256:'b'.repeat(64),visibility:'private'}],
    publishable:false,releases:[],items:[
      item('345',{nameStatus:'verified', names:{ja:'確認済みの名称',en:'Verified name'}}),
      item('990',{nativeCategory:'Clothing'}),...extraItems]};
  const bundle={verified:true,privateSource:true,manifestSha256:'c'.repeat(64),
    manifest:{schema:'wand.src02@1',status:'partial_native_extraction',platform:'Steam',gameVersion:'1.26.2',source:{src01ManifestSha256:sourceSha,conditionSha256:'9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c'}},
    recipes:[],relatedItems:[],stallSources:[],lootTables:[]};
  for(const key of ['recipes','relatedItems','stallSources','lootTables'])Object.freeze(bundle[key]);
  Object.freeze(bundle.manifest.source);Object.freeze(bundle.manifest);Object.freeze(bundle);
  return createAcquisitionCatalogJoin(snapshot,bundle);
}
const save = stores => ({GameInfo:{Version:643},Player:{},World:stores===undefined?{}:{Stores:stores}});
const display = slots => ({DisplayItemID:789,DisplayInfo:{Slots:slots}});
const slot = (id,amount=1,IsAvailable=true) =>
  ({Item:id===null?null:{id,amount},IsAvailable,CurrencyId:90});
const store = (displays=[]) => ({BuildingItemID:201,Displays:displays,WeightedItems:{'345':8},
  LastRefresh:'2026-11-21T12:00:00Z'});

test('real DB-00/SRC-02 contract bridges two saved catalog item references',()=>{
  const view=inspectSavedWorldStoreCollection(join(),save([store([
    display([slot(345),slot(345,4),slot(990),slot(null),slot(777)])
  ])]));
  assert.equal(view.contract,WORLD_STORE_COLLECTION_CONTRACT);
  assert.deepEqual([view.savedStoreCount,view.savedDisplaySlotCount,view.savedSlotsWithoutItem,
    view.savedItemReferenceCount,view.distinctItemCount,view.matchedCatalogItemCount,
    view.unresolvedCatalogItemCount],[1,5,1,4,3,2,1]);
  assert.deepEqual(view.items.map(x=>x.itemId),['345','777','990']);
  assert.equal(view.items[0].savedDisplayReferenceCount,2);
  assert.deepEqual(view.items[0].savedDisplayReferences,[
    {storeIndex:0,displayIndex:0,slotIndex:0},
    {storeIndex:0,displayIndex:0,slotIndex:1}
  ]);
  assert.equal(view.items[1].catalogClassification,'unresolved_in_partial_catalog');
  assert.equal(view.items[2].nativeCategory,'Clothing');
});

test('verified labels available for private preview, unverified names never substituted',()=>{
  const x=inspectSavedWorldStoreCollection(join(),save([store([display([slot(990),slot(345)])])]));
  assert.deepEqual(x.items[0].names,{ja:'確認済みの名称',en:'Verified name'});
  assert.equal(x.items[0].nameStatus,'verified');
  assert.equal(x.items[1].nameStatus,'unverified');
  assert.deepEqual(x.items[1].names,{});
});

test('preserve source display indexes across distinct stores and displays',()=>{
  const x=inspectSavedWorldStoreCollection(join(),save([
    store([display([slot(345)]),display([slot(990)])]),
    store([display([slot(345)])])
  ]));
  assert.deepEqual(x.items[0].savedDisplayReferences,[
    {storeIndex:0,displayIndex:0,slotIndex:0},
    {storeIndex:1,displayIndex:0,slotIndex:0}
  ]);
  assert.deepEqual(x.items[1].savedDisplayReferences,[{storeIndex:0,displayIndex:1,slotIndex:0}]);
});

test('observed empty is not same as absence of the World.Stores field',()=>{
  const missing=inspectSavedWorldStoreCollection(join(),save());
  assert.equal(missing.status,'not_observed');assert.equal(missing.saveStoresFieldObserved,false);
  const empty=inspectSavedWorldStoreCollection(join(),save([]));
  assert.equal(empty.status,'observed_decoded_structure');assert.equal(empty.saveStoresFieldObserved,true);
  assert.equal(empty.distinctItemCount,0);
});

test('available=true with Item=null is not a saved merchandise reference',()=>{
  const x=inspectSavedWorldStoreCollection(join(),save([store([display([
    slot(null,0,true),slot(345,0,false)
  ])])]));
  assert.deepEqual([x.savedDisplaySlotCount,x.savedItemReferenceCount,x.savedSlotsWithoutItem],[2,1,1]);
  assert.equal(x.items[0].currentOfferVerified,false);
  assert.equal(x.items[0].acquiredFromShopVerified,false);
  assert.equal(x.items[0].playerOwnedVerified,false);
  assert.equal(x.items[0].collectionUnlockedVerified,false);
});

test('complete catalog absence is classified without asserting game-world absence',()=>{
  const x=inspectSavedWorldStoreCollection(join({complete:true}),save([store([display([slot(777)])])]));
  assert.equal(x.items[0].catalogClassification,'not_in_exact_catalog');
  assert.equal(x.items[0].nameStatus,'unresolved');
  assert.equal(x.unresolvedCatalogItemCount,1);
});

test('source and personal save game version are not asserted equivalent',()=>{
  const x=inspectSavedWorldStoreCollection(join(),save([store([display([slot(345)])])]));
  assert.deepEqual(x.source,{platform:'Steam',gameVersion:'1.26.2'});
  assert.equal(x.saveSourceVersionCompatibilityVerified,false);
  assert.equal(x.externalManifestPinCheckedByThisFunction,false);
  assert.equal(x.strictCodecVerified,false);
});

test('results contain no source World/WeightedItems, price or personal ownership assertion',()=>{
  const original=save([store([display([slot(345,6)])])]);
  const before=structuredClone(original);
  const x=inspectSavedWorldStoreCollection(join(),original);
  assert.deepEqual(original,before);
  assert.equal(x.items[0].priceVerified,false);
  assert.equal(x.items[0].salePrice,null);
  assert.equal(x.ownerCollectionVerified,false);
  assert.equal(x.liveOffersVerified,false);
  assert.equal(x.saveWriterAuthorized,false);
  assert.equal(x.publishable,false);
  assert.ok(!JSON.stringify(x).includes('WeightedItems'));
  assert.ok(!JSON.stringify(x).includes('LastRefresh'));
  assert.ok(!JSON.stringify(x).includes('serializedAmount'));
});

test('nested metadata and source arrays cannot be mutated or alter later results',()=>{
  const j=join(), root=save([store([display([slot(345)])])]);
  const a=inspectSavedWorldStoreCollection(j,root);
  assert.ok(Object.isFrozen(a.items[0]));
  assert.ok(Object.isFrozen(a.items[0].savedDisplayReferences[0]));
  assert.ok(Object.isFrozen(a.items[0].names));
  assert.throws(()=>{a.items[0].names.en='tampered'},TypeError);
  assert.throws(()=>{a.items[0].savedDisplayReferences.push({})},TypeError);
  const b=inspectSavedWorldStoreCollection(j,root);
  assert.equal(b.items[0].names.en,'Verified name');
});

test('rejects missing and untrusted/nonprivate catalog join',()=>{
  const j=join();
  assert.throws(()=>inspectSavedWorldStoreCollection({},save([])),/VERIFIED_JOIN_REQUIRED/);
  assert.throws(()=>inspectSavedWorldStoreCollection({...j,privateSource:false},save([])),/VERIFIED_JOIN_REQUIRED/);
  assert.throws(()=>inspectSavedWorldStoreCollection({...j,publishable:true},save([])),/VERIFIED_JOIN_REQUIRED/);
});

test('rejects misaligned catalog lookup without inventing a label or item',()=>{
  const j=join(),bad={...j,lookup:()=>({itemId:'999',classification:'catalog_item_candidate',catalogItem:null})};
  assert.throws(()=>inspectSavedWorldStoreCollection(bad,save([store([display([slot(345)])])])),/INVALID_CATALOG_LOOKUP/);
});

test('rejects malformed save data instead of returning misleading inventory state',()=>{
  assert.throws(()=>inspectSavedWorldStoreCollection(join(),{World:{Stores:[]}}),/WORLD_STORE_INVALID_DB05_ROOT/);
  assert.throws(()=>inspectSavedWorldStoreCollection(join(),save([store([display([{Item:{id:'345',amount:3}}])])])),/WORLD_STORE_INVALID_ITEM_ID/);
});

test('display definition IDs and currency IDs are never counted as merchandise',()=>{
  const x=inspectSavedWorldStoreCollection(join(),save([store([display([slot(null,0)])])]));
  assert.equal(x.distinctItemCount,0);
  assert.equal(x.savedSlotsWithoutItem,1);
});