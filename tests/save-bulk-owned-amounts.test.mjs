import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_OWNED_AMOUNT_BATCH,planFilteredOwnedAmounts}
  from '../src/lib/save/bulk-owned-amounts.ts';

const inventory=(itemId,amount,inventoryId='100')=>
  ({kind:'inventory',inventoryId,itemId,amount});
const chest=(itemId,amount,slotIndex,containerId='202')=>
  ({kind:'chest',containerId,slotIndex,itemId,amount});
const target=slot=>slot.kind==='inventory'
  ?{kind:'inventory',inventoryId:slot.inventoryId,itemId:slot.itemId}
  :{kind:'chest',containerId:slot.containerId,slotIndex:slot.slotIndex,
    itemId:slot.itemId};

test('filtered bulk updates exact native Inventory and Chest slots, not just Item ID',()=>{
  const a=inventory('777',1);
  const b=chest(777,3,0);
  const c=chest(777,4,2);
  const d=inventory('777',15,'101');
  const plan=planFilteredOwnedAmounts([a,b,c,d],[], '999999');
  assert.equal(plan.status,'ready');
  assert.deepEqual(plan.added,[a,b,c,d].map(s=>({
    target:target(s),expected:s.amount,replacement:999999
  })));
  assert.equal(plan.added.length,4);
});

test('never overwrite existing individual drafts or stage unchanged values',()=>{
  const a=inventory('777',1);
  const b=chest(777,3,0);
  const c=chest(777,9,1);
  const queued=[{target:target(b),expected:3,replacement:800}];
  const plan=planFilteredOwnedAmounts([a,b,c],queued,'9');
  assert.equal(plan.status,'ready');
  assert.deepEqual(plan.added,[{target:target(a),expected:1,replacement:9}]);
  assert.equal(plan.alreadyQueued,1);
  assert.equal(plan.unchanged,1);
  assert.equal(queued[0].replacement,800);
});

test('reject whole batches over capacity, including currently undisplayed filtered slots',()=>{
  const rows=Array.from({length:17},(_,i)=>inventory(String(700+i),1));
  const plan=planFilteredOwnedAmounts(rows,[],'500');
  assert.deepEqual(plan,{status:'too-many',eligible:17,remaining:16});
  assert.equal(MAX_OWNED_AMOUNT_BATCH,16);
  const queued=rows.slice(0,15).map(s=>({
    target:target(s),expected:1,replacement:123
  }));
  const over=planFilteredOwnedAmounts([rows[15],rows[16]],queued,'500');
  assert.deepEqual(over,{status:'too-many',eligible:2,remaining:1});
  assert.equal(queued.length,15,'no queue may be mutated on failure');
});

test('respect save-structural uint32, not normal game stack caps',()=>{
  const rows=[inventory('550',3)];
  for(const invalid of ['', '0','1.2','-1','abc','01','4294967296',
    '999999999999999999999999999999']){
    assert.equal(planFilteredOwnedAmounts(rows,[],invalid).status,
      'invalid-quantity',invalid);
  }
  const max=planFilteredOwnedAmounts(rows,[],'4294967295');
  assert.equal(max.status,'ready');
  assert.equal(max.added[0].replacement,4294967295);
});

test('fail closed for stale queued originals or duplicate native source identities',()=>{
  const a=chest(440,2,1);
  const queued=[{target:target(a),expected:4,replacement:1000}];
  assert.equal(planFilteredOwnedAmounts([a],queued,'10').status,'stale');
  assert.equal(planFilteredOwnedAmounts([a,{...a}],[],'10').status,
    'duplicate');
  assert.equal(planFilteredOwnedAmounts([a],[],'2').status,'no-changes');
  assert.equal(planFilteredOwnedAmounts([],[],'2').status,'no-changes');
});
