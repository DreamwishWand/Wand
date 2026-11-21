import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDecodedWorldStores,WORLD_STORE_SAVE_CONTRACT} from '../src/lib/acquisition/world-store-save.mjs';

const root = stores => ({GameInfo:{Version:643},Player:{},World:stores === undefined ? {} : {Stores:stores}});
const db = {getStallStaticCatalog:id=>id===123 ? {stallId:123} : null};
const slot = (Id=345,Amount=2,IsAvailable=true,CurrencyId=99)=>
  ({Item:{Id,Amount},IsAvailable,CurrencyId});
const store = (id=123,slots=[slot()]) => ({BuildingItemID:id,
  Displays:[{DisplayItemID:789,DisplayInfo:{Slots:slots}}],
  LastRefresh:'2026-11-21T00:00:00Z',WeightedItems:{'123':2},
  CurrentSequenceIndexPerUpgrade:[0]});

test('World.Stores missing is not_observed, not known empty',()=>{
  const x=inspectDecodedWorldStores(db,root());
  assert.equal(x.status,'not_observed'); assert.equal(x.storeCount,0);
  assert.equal(x.liveInventoryVerified,false); assert.equal(x.publishable,false);
});
test('observed empty Stores differs from missing Stores',()=>{
  const x=inspectDecodedWorldStores(db,root([]));
  assert.equal(x.status,'observed_decoded_structure');assert.equal(x.fieldObserved,true);
});
test('native StoreDisplay/DisplayInfo/DisplaySlot/ItemAmount field map',()=>{
  const x=inspectDecodedWorldStores(db,root([store()]));
  assert.equal(x.contract,WORLD_STORE_SAVE_CONTRACT);
  assert.equal(x.storeCount,1);assert.equal(x.serializedSlotCount,1);
  assert.equal(x.stores[0].exactStaticStallIdMatch,123);
  assert.equal(x.stores[0].displays[0].displayItemId,789);
  assert.equal(x.stores[0].displays[0].displayItemIsMerchandise,false);
  const row=x.stores[0].slots[0];
  assert.deepEqual([row.itemId,row.serializedAmount,row.currencyId,row.serializedIsAvailable],[345,2,99,true]);
  assert.equal(row.priceVerified,false); assert.equal(row.salePrice,null);
  assert.equal(row.liveAvailabilityVerified,false);
  assert.equal(x.stores[0].staticSlotMappingVerified,false);
  assert.equal(x.strictCodecVerified,false);
});
test('multiple stores and displays retain source order and indexes',()=>{
  const x=inspectDecodedWorldStores(db,root([store(10,[slot(5),slot(6)]),store(123,[])]));
  assert.equal(x.storeCount,2);assert.equal(x.serializedSlotCount,2);
  assert.equal(x.stores[0].slots[1].slotIndex,1);
  assert.equal(x.stores[1].exactStaticStallIdMatch,123);
});
test('unknown static ID does not invalidate store record',()=>{
  const x=inspectDecodedWorldStores(db,root([store(999)]));
  assert.equal(x.stores[0].exactStaticStallIdMatch,null);
});
test('missing optional field values are not guessed or filled',()=>{
  const x=inspectDecodedWorldStores(db,root([{Displays:[{DisplayInfo:{Slots:[{}]}}]}]));
  assert.deepEqual([x.stores[0].slots[0].itemId,x.stores[0].slots[0].serializedAmount,
    x.stores[0].slots[0].serializedIsAvailable],[null,null,null]);
});
test('saved IsAvailable=false is still not verified live availability',()=>{
  const x=inspectDecodedWorldStores(db,root([store(123,[slot(99,0,false,0)])]));
  const row=x.stores[0].slots[0];
  assert.equal(row.serializedIsAvailable,false);assert.equal(row.liveAvailabilityVerified,false);
  assert.equal(row.currencyId,null);assert.equal(row.serializedAmount,0);
});
test('serialized -1 infinite sentinel preserved without stock inference',()=>{
  const x=inspectDecodedWorldStores(db,root([store(123,[slot(99,-1)])]));
  assert.equal(x.stores[0].slots[0].serializedInfiniteSentinel,true);
  assert.equal(x.stores[0].slots[0].stockVerified,false);
});
test('negative amounts below native Infinite sentinel rejected',()=>{
  assert.throws(()=>inspectDecodedWorldStores(db,root([store(123,[slot(1,-2)])])),/WORLD_STORE_INVALID_ITEM_AMOUNT/);
});
test('unknown/malformed boolean and currency rejected',()=>{
  assert.throws(()=>inspectDecodedWorldStores(db,root([store(123,[slot(1,2,'true')])])),/WORLD_STORE_INVALID_AVAILABILITY_FLAG/);
  assert.throws(()=>inspectDecodedWorldStores(db,root([store(123,[slot(1,2,true,-4)])])),/WORLD_STORE_INVALID_CURRENCY/);
});
test('too many stores and invalid display structures rejected',()=>{
  assert.throws(()=>inspectDecodedWorldStores(db,root(Array(257).fill(store()))),/WORLD_STORE_INVALID_STORES/);
  assert.throws(()=>inspectDecodedWorldStores(db,root([store(123,[{}])].map(s=>({...s,Displays:{}})))),/WORLD_STORE_INVALID_DISPLAYS/);
});
test('invalid decoded save root rejected by DB-05 structural contract',()=>{
  assert.throws(()=>inspectDecodedWorldStores(db,{World:{Stores:[]}}),/WORLD_STORE_INVALID_DB05_ROOT/);
  assert.throws(()=>inspectDecodedWorldStores(db,root([]).World),/WORLD_STORE_INVALID_DB05_ROOT/);
});
test('no mutable aliases or personal save payload in returned evidence',()=>{
  const save=root([store()]);
  const before=structuredClone(save);
  const x=inspectDecodedWorldStores(db,save);
  assert.deepEqual(save,before);assert.ok(Object.isFrozen(x.stores[0].slots));
  assert.ok(Object.isFrozen(x.stores[0].slots[0]));
  assert.throws(()=>{x.stores[0].slots[0].itemId=3},TypeError);
  assert.ok(!JSON.stringify(x).includes('WeightedItems'));
  assert.ok(!JSON.stringify(x).includes('2026-11-21T00:00:00Z'));
});

test('explicitly null Stores is invalid rather than absent',()=>{
  assert.throws(()=>inspectDecodedWorldStores(db,{GameInfo:{Version:643},Player:{},World:{Stores:null}}),/WORLD_STORE_INVALID_STORES/);
});