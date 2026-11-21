import test from 'node:test';
import assert from 'node:assert/strict';
import {createSavedStorePreview,SAVED_STORE_PREVIEW_CONTRACT} from '../src/lib/collection/saved-store-preview.mjs';
const slot=(itemId)=>({itemId});
const e=(stores,slotCount=stores.flatMap(x=>x.slots).length)=>({
 contract:'wand.db02.world-store-save-evidence@1',strictCodecVerified:false,
 liveInventoryVerified:false,salePricesVerified:false,
 status:'observed_decoded_structure',fieldObserved:true,storeCount:stores.length,
 serializedSlotCount:slotCount,stores});

test('groups saved merchandise IDs and distinguishes repeated slots, not owned items',()=>{
 const s=createSavedStorePreview(e([
  {storeIndex:0,slots:[slot(44),slot(44),slot(null)]},
  {storeIndex:1,slots:[slot(44),slot(55)]}
 ]),[{itemId:44,label:'Historical Name',family:'Furniture'}]);
 assert.equal(s.contract,SAVED_STORE_PREVIEW_CONTRACT);
 assert.equal(s.savedStoreCount,2);
 assert.equal(s.savedSlotCount,5);
 assert.equal(s.savedSlotsWithoutItem,1);
 assert.equal(s.savedItemReferenceCount,4);
 assert.equal(s.distinctItemCount,2);
 assert.equal(s.items[0].itemId,44);
 assert.equal(s.items[0].referenceCount,3);
 assert.equal(s.items[0].storeReferenceCount,2);
 assert.equal(s.items[0].historicalLabel,'Historical Name');
 assert.equal(s.items[1].historicalLabel,null);
 assert.equal(s.items[0].playerOwnedVerified,false);
 assert.equal(s.items[0].availableForPurchaseVerified,false);
 assert.equal(s.ownershipVerified,false);
 assert.equal(s.liveInventoryVerified,false);
 assert.equal(s.pricesVerified,false);
 assert.equal(s.sourceVersionEquivalenceVerified,false);
 assert.equal(s.privateOnly,true);
 assert.equal(s.publishable,false);
});
test('missing store field is not proof of no stores',()=>{
 const x=e([],0);x.status='not_observed';x.fieldObserved=false;
 const p=createSavedStorePreview(x);
 assert.equal(p.status,'not_observed');assert.equal(p.fieldObserved,false);
});
test('observed empty store list differs from absent field',()=>{
 const p=createSavedStorePreview(e([],0));
 assert.equal(p.status,'observed_decoded_structure');assert.equal(p.savedStoreCount,0);
});
test('rejects purported verified live stock / pricing and non-DB02 source',()=>{
 assert.throws(()=>createSavedStorePreview({...e([],0),liveInventoryVerified:true}),/SOURCE_REQUIRED/);
 assert.throws(()=>createSavedStorePreview({...e([],0),strictCodecVerified:true}),/SOURCE_REQUIRED/);
 assert.throws(()=>createSavedStorePreview({...e([],0),contract:'unknown'}),/SOURCE_REQUIRED/);
});
test('rejects invalid/duplicated historical rows without inferring names',()=>{
 assert.throws(()=>createSavedStorePreview(e([],0),[{itemId:1},{itemId:1}]),/INVALID_HISTORICAL_ROW/);
 assert.throws(()=>createSavedStorePreview(e([],0),[{itemId:1.5}]),/INVALID_HISTORICAL_ROW/);
 const p=createSavedStorePreview(e([{storeIndex:0,slots:[slot(10)]}]),[{itemId:10,label:'',family:'A'}]);
 assert.equal(p.items[0].historicalLabel,null);
});
test('preserves exact sorted IDs and never borrows mutable row references',()=>{
 const rows=[{itemId:55,label:'A',family:'Meals'}];
 const p=createSavedStorePreview(e([{storeIndex:0,slots:[slot(91),slot(55)]}]),rows);
 rows[0].label='CHANGED';
 assert.deepEqual(p.items.map(x=>x.itemId),[55,91]);
 assert.equal(p.items[0].historicalLabel,'A');
 assert.ok(Object.isFrozen(p.items[0]));assert.ok(Object.isFrozen(p.items));
 assert.throws(()=>{p.items[0].historicalLabel='X'},TypeError);
});
test('rejects slot count mismatches and invalid saved IDs',()=>{
 assert.throws(()=>createSavedStorePreview(e([{storeIndex:0,slots:[slot(12)]}],0)),/SLOT_COUNT_MISMATCH/);
 assert.throws(()=>createSavedStorePreview(e([{storeIndex:0,slots:[slot(-1)]}])),/INVALID_ITEM_ID/);
});
test('does not copy quantity, privacy fields, or saved flag from input slot',()=>{
 const evi=e([{storeIndex:0,slots:[{itemId:101,serializedAmount:999,secret:'person',serializedIsAvailable:true}]}]);
 const result=createSavedStorePreview(evi);
 const json=JSON.stringify(result);
 assert.ok(!json.includes('person'));assert.ok(!json.includes('999'));
 assert.ok(!json.includes('serializedIsAvailable'));
});