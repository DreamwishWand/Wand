import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeStallDataEvidence,inspectSavedStallShop,STALL_SAVE_EVIDENCE_CONTRACT} from '../src/lib/acquisition/stall-save.mjs';
import {createAcquisitionDatabase} from '../src/lib/acquisition/index.mjs';

// Synthetic native wire fragments, never a user's raw save or proprietary content.
function varint(value) {
  let v=BigInt(value);
  if (v<0n) v=BigInt.asUintN(64,v);
  const out=[];
  do {let b=Number(v&127n);v>>=7n;if(v)b|=128;out.push(b);}while(v);
  return out;
}
const val=(n,v)=>[(n<<3)|0,...varint(v)];
const obj=(n,content)=>[(n<<3)|2,...varint(content.length),...content];
const buf=(...arrays)=>Uint8Array.from(arrays.flat());
const amount=(id,quantity)=>[...val(1,id),...val(2,quantity)];
const shopSlot=({id=0,item=31,count=4,max=5,regen=null}={})=>[
  ...val(1,id),...(item===null?[]:obj(2,amount(item,count))),
  ...(max===null?[]:val(3,max)),...(regen===null?[]:obj(4,val(1,regen)))
];
const shop=(slots=[shopSlot()])=>[
  ...obj(1,val(1,1600000000)),...val(2,5),...slots.flatMap(x=>obj(3,x)),...val(4,7)
];
const stall=(slots=[shopSlot()])=>buf(obj(2,shop(slots)));
const db=()=>createAcquisitionDatabase({
  manifest:{schema:'wand.src02@1',platform:'Steam',gameVersion:'1.26.2'},
  stallSources:[{stallId:20100000,nameKey:'SampleStall',shopDataKey:'GardeningStall',
    inventoryStatus:'static_loot_candidates_only',slotLootTableIds:[2090000001,2090000002],
    unlockCosts:[],upgrades:[]}],
  lootTables:[
    {lootTableId:2090000001,groups:[{index:0,candidates:[{itemId:31}],hasDynamicTypeFilters:false}]},
    {lootTableId:2090000002,groups:[{index:0,candidates:[],hasDynamicTypeFilters:true}]},
  ],
});

test('native StallData field2, ShopData fields1-4 and ShopSlot fields1-4 parsed by exact wire type',()=>{
  const result=decodeStallDataEvidence(stall([shopSlot({id:0,item:31,count:4,max:7,regen:3600})]));
  assert.equal(result.contract,STALL_SAVE_EVIDENCE_CONTRACT);
  assert.equal(result.shopDataPresent,true);
  assert.equal(result.shop.lastRefreshTimestamp.seconds,'1600000000');
  assert.equal(result.shop.serializedRefreshCount,5);
  assert.equal(result.shop.slots[0].slotId,0);
  assert.equal(result.shop.slots[0].itemId,31);
  assert.equal(result.shop.slots[0].serializedItemAmount,4);
  assert.equal(result.shop.slots[0].serializedMaxAmount,7);
  assert.equal(result.shop.slots[0].serializedRegenDuration.seconds,'3600');
  assert.equal(result.shop.slots[0].offerPrice,null);
  assert.equal(result.shop.slots[0].stockVerified,false);
  assert.equal(result.liveInventoryVerified,false);
  assert.equal(result.writable,false);
});

test('native ItemAmount -1 infinite sentinel is retained without claiming unlimited retail stock',()=>{
  const s=decodeStallDataEvidence(stall([shopSlot({count:-1})])).shop.slots[0];
  assert.equal(s.serializedItemAmount,-1);
  assert.equal(s.serializedInfiniteSentinel,true);
  assert.equal(s.stockVerified,false);
});

test('empty slot and missing shop data are not falsely rendered as a live sold-out offer',()=>{
  const s=decodeStallDataEvidence(stall([shopSlot({id:1,item:null,max:null})]));
  assert.equal(s.shop.slots[0].itemId,null);
  assert.equal(s.shop.slots[0].serializedItemAmount,null);
  assert.equal(s.shop.slots[0].serializedMaxAmount,null);
  const missing=decodeStallDataEvidence(buf(obj(1,[])));
  assert.equal(missing.shopDataPresent,false);
  assert.equal(missing.shop,null);
});

test('unknown outer fields are skipped but the decoded evidence remains immutable',()=>{
  const raw=buf(val(100,88),obj(2,shop()),obj(101,[0,1,2]));
  const data=decodeStallDataEvidence(raw);
  assert.deepEqual(data.shop.slots.map(x=>x.itemId),[31]);
  assert.ok(Object.isFrozen(data));
  assert.ok(Object.isFrozen(data.shop));
  assert.ok(Object.isFrozen(data.shop.slots));
  assert.ok(Object.isFrozen(data.shop.slots[0]));
  assert.throws(()=>{data.shop.slots[0].itemId=99},TypeError);
  raw.fill(0);
  assert.equal(data.shop.slots[0].itemId,31);
});

test('duplicate serialized slot ids are rejected rather than conflating offers',()=>{
  assert.throws(()=>decodeStallDataEvidence(stall([shopSlot({id:0}),shopSlot({id:0})])),
    /STALL_SAVE_DUPLICATE_SLOT_ID/);
});

test('duplicate scalar fields are rejected',()=>{
  assert.throws(()=>decodeStallDataEvidence(buf(obj(2,[...val(2,2),...val(2,3)]))),
    /STALL_SAVE_DUPLICATE_SCALAR/);
});

test('cross-namespace ShopData invalid wire kind is rejected',()=>{
  assert.throws(()=>decodeStallDataEvidence(buf(val(2,200))),
    /STALL_SAVE_FIELD_WIRE_MISMATCH/);
});

test('truncated, noncanonical and overflowing varints are rejected',()=>{
  assert.throws(()=>decodeStallDataEvidence(Uint8Array.from([0x12,0x08,0x01])),
    /STALL_SAVE_TRUNCATED_FIELD/);
  assert.throws(()=>decodeStallDataEvidence(Uint8Array.from([0x12,0x80,0x00])),
    /STALL_SAVE_NONCANONICAL_VARINT/);
  assert.throws(()=>decodeStallDataEvidence(Uint8Array.from([0x10,...new Array(9).fill(0xff),0x02])),
    /STALL_SAVE_VARINT_OVERFLOW/);
});

test('rejects invalid numeric amounts and suspiciously large input',()=>{
  assert.throws(()=>decodeStallDataEvidence(stall([shopSlot({count:-2})])),
    /STALL_SAVE_INVALID_AMOUNT/);
  assert.throws(()=>decodeStallDataEvidence(new Uint8Array(128*1024+1)),
    /STALL_SAVE_INVALID_BYTES/);
  assert.throws(()=>decodeStallDataEvidence(new Uint8Array(0)),
    /STALL_SAVE_INVALID_BYTES/);
});

test('save snapshot item linked to an explicit static stall candidate is only a candidate match',()=>{
  const result=inspectSavedStallShop(db(),20100000,stall([shopSlot({id:0,item:31})]));
  assert.equal(result.slots[0].staticCandidateListed,true);
  assert.equal(result.slots[0].candidateRelationStatus,'listed_static_candidate');
  assert.equal(result.slots[0].sourceSlotMappingVerified,false);
  assert.equal(result.slots[0].availableForPurchaseVerified,false);
  assert.equal(result.liveInventoryVerified,false);
  assert.equal(result.salePricesVerified,false);
  assert.equal(result.saveCodecVerified,false);
  assert.equal(result.publishable,false);
});

test('unlisted/unknown item and unknown slot index are explicitly inconclusive',()=>{
  const result=inspectSavedStallShop(db(),20100000,stall([
    shopSlot({id:0,item:999}),shopSlot({id:1,item:32}),shopSlot({id:999,item:31})]));
  assert.equal(result.slots.length,3);
  assert.ok(result.slots.every(x=>x.candidateRelationStatus==='not_listed_not_proof_invalid'));
  assert.ok(result.slots.every(x=>x.availableForPurchaseVerified===false));
});

test('missing catalogue or unknown stall id cannot be silently accepted',()=>{
  assert.throws(()=>inspectSavedStallShop({},20100000,stall()),/STALL_SAVE_CATALOG_REQUIRED/);
  assert.throws(()=>inspectSavedStallShop(db(),20100001,stall()),/STALL_SAVE_UNKNOWN_STALL_ID/);
});

test('real recorded slot count is not inferred from static stall slot count',()=>{
  const result=inspectSavedStallShop(db(),20100000,stall([shopSlot({id:0,item:31})]));
  assert.equal(result.slotCount,1);
  assert.equal(db().getStallStaticCatalog(20100000).slotCount,2);
});