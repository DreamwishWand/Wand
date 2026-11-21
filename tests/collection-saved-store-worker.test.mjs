import test from 'node:test';
import assert from 'node:assert/strict';
import { createSavedStorePreview, attachHistoricalStoreLabels } from '../src/lib/collection/saved-store-preview.mjs';

const data = stores => ({
  contract:'wand.db02.world-store-save-evidence@1',
  strictCodecVerified:false, liveInventoryVerified:false, salePricesVerified:false,
  status:'observed_decoded_structure',fieldObserved:true,storeCount:stores.length,
  serializedSlotCount:stores.flatMap(s=>s.slots).length, stores
});
const row = id => ({ itemId:id });
const workerSummary = () => createSavedStorePreview(data([
  {storeIndex:0, slots:[row(402), row(401), row(null)]},
  {storeIndex:1, slots:[row(401)]}
]));

test('Worker only emits ID/reference-count summary without private profile values',()=>{
  const w=workerSummary();
  assert.equal(w.distinctItemCount,2);
  assert.equal(w.savedItemReferenceCount,3);
  assert.equal(w.items[0].historicalLabel,null);
  assert.equal(w.items[0].historicalReferenceOnly,true);
  assert.equal(w.ownershipVerified,false);
  assert.equal(w.liveInventoryVerified,false);
});

test('UI attaches historical labels only by exact numeric ID and remains private',()=>{
  const raw=workerSummary();
  const records=[{itemId:401,label:'Historic item name',family:'Furniture'}];
  const out=attachHistoricalStoreLabels(structuredClone(raw),records);
  records[0].label='CHANGED';
  assert.deepEqual(out.items.map(x=>x.itemId),[401,402]);
  assert.equal(out.items[0].historicalLabel,'Historic item name');
  assert.equal(out.items[1].historicalLabel,null);
  assert.equal(out.historicalMatchedCount,1);
  assert.equal(out.historicalCatalogSource,'Nintendo Switch v1.25.0');
  assert.equal(out.sourceVersionEquivalenceVerified,false);
  assert.equal(out.ownershipVerified,false);
  assert.equal(out.pricesVerified,false);
  assert.equal(out.privateOnly,true);
  assert.ok(Object.isFrozen(out.items));
  assert.ok(Object.isFrozen(out.items[0]));
  assert.throws(()=>{out.items[0].historicalLabel='false label'},TypeError);
});

test('no source slot quantities or arbitrary worker fields forwarded into result',()=>{
  const raw=structuredClone(workerSummary());
  raw.untrustedPersonalInfo='sensitive-non-public-value';
  raw.items[0].untrustedItemData='private amount 9999';
  const out=attachHistoricalStoreLabels(raw,[]);
  const dump=JSON.stringify(out);
  assert.ok(!dump.includes('sensitive-non-public-value'));
  assert.ok(!dump.includes('private amount 9999'));
});

test('worker reply count forgery and malformed status rejected',()=>{
  const s=structuredClone(workerSummary());
  assert.throws(()=>attachHistoricalStoreLabels({...s,savedItemReferenceCount:2}),/INVALID_WORKER_SUMMARY/);
  assert.throws(()=>attachHistoricalStoreLabels({...s,savedStoreCount:257}),/INVALID_WORKER_SUMMARY/);
  assert.throws(()=>attachHistoricalStoreLabels({...s,publishable:true}),/INVALID_WORKER_SUMMARY/);
  assert.throws(()=>attachHistoricalStoreLabels({...s,status:'current_offers'}),/INVALID_WORKER_SUMMARY/);
  assert.throws(()=>attachHistoricalStoreLabels({...s,ownershipVerified:true}),/INVALID_WORKER_SUMMARY/);
  assert.throws(()=>attachHistoricalStoreLabels({...s,fieldObserved:false}),/INVALID_WORKER_SUMMARY/);
});

test('worker reply item IDs/counts validated before historical join',()=>{
  const s=structuredClone(workerSummary());
  assert.throws(()=>attachHistoricalStoreLabels({...s,items:[{...s.items[0],itemId:-1},s.items[1]]}),/INVALID_WORKER_ITEM/);
  assert.throws(()=>attachHistoricalStoreLabels({...s,items:[s.items[0],{...s.items[1],itemId:s.items[0].itemId}]}),/INVALID_WORKER_ITEM/);
  assert.throws(()=>attachHistoricalStoreLabels({...s,items:[{...s.items[0],referenceCount:99},s.items[1]]}),/INVALID_WORKER_COUNTS/);
  assert.throws(()=>attachHistoricalStoreLabels({...s,items:[{...s.items[0],storeReferenceCount:300},s.items[1]]}),/INVALID_WORKER_ITEM/);
});

test('missing World.Stores remains not_observed, never proof of empty game store',()=>{
  const s=structuredClone(createSavedStorePreview({...data([]),status:'not_observed',fieldObserved:false}));
  const out=attachHistoricalStoreLabels(s,[]);
  assert.equal(out.status,'not_observed');
  assert.equal(out.distinctItemCount,0);
});

test('historical label duplication is rejected instead of merged',()=>{
  assert.throws(()=>attachHistoricalStoreLabels(workerSummary(),[
    {itemId:401,label:'A'},{itemId:401,label:'B'}
  ]),/INVALID_HISTORICAL_ROW/);
});