import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB02_MEAL_PRICE_EVIDENCE_CONTRACT,DB02_MEAL_PRICE_VIEW_CONTRACT,
  decodeMealItemStateEvidence,compareMealIngredientStates,loadPrivateMealPricingView
} from '../src/lib/acquisition/meal-price-evidence.mjs';
import {runPrivateMealPriceSmoke} from '../tools/src-02-acquisition/smoke_private_meal_state_runtime.mjs';

// Synthetic protobuf fragments: never real game assets or private saves.
const vint=x=>{
  let v=BigInt(x),o=[];
  do{let b=Number(v&127n);v>>=7n;if(v)b|=128;o.push(b);}while(v);
  return o;
};
const field=(n,v)=>[...vint(n*8),...vint(v)];
const nested=(n,bytes)=>[...vint(n*8+2),...vint(bytes.length),...bytes];
const bytes=(...parts)=>Uint8Array.from(parts.flat());
const meal=(ids,packed=true)=>bytes(nested(1,
  packed?nested(1,ids.flatMap(vint)):ids.flatMap(id=>field(1,id))));
const fake=new TextEncoder().encode('{"schema":"wand.src02@1"}');

test('native ItemState.MealData has per-instance ingredients, packed wire',()=>{
  const result=decodeMealItemStateEvidence(meal([31100053,30200045,31100053]));
  assert.equal(result.contract,DB02_MEAL_PRICE_EVIDENCE_CONTRACT);
  assert.equal(result.mealDataPresent,true);
  assert.deepEqual(result.serializedIngredientIds,[31100053,30200045,31100053]);
  assert.deepEqual(result.ingredientAmounts,[
    {itemId:30200045,count:1},{itemId:31100053,count:2}]);
  assert.equal(result.sourceStateOnly,true);
  assert.equal(result.saveCodecVerified,false);
  assert.equal(result.salePriceComputed,false);
  assert.equal(result.salePrice,null);
  assert.ok(Object.isFrozen(result.ingredientAmounts));
});
test('unpacked repeated ingredients and unknown native fields retain source semantics',()=>{
  const value=bytes(field(55,900),nested(1,
    [...field(1,31100053),...nested(99,[1,2,3]),...field(1,30200045)]));
  const actual=decodeMealItemStateEvidence(value);
  assert.deepEqual(actual.serializedIngredientIds,[31100053,30200045]);
  assert.equal(actual.distinctIngredientCount,2);
});
test('missing, empty and non-meal ItemState are not priced by assumption',()=>{
  const absent=decodeMealItemStateEvidence(bytes(field(99,7)));
  assert.equal(absent.mealDataPresent,false);
  assert.equal(absent.serializedIngredientIds,null);
  assert.equal(absent.salePrice,null);
  const empty=decodeMealItemStateEvidence(bytes(nested(1,[])));
  assert.equal(empty.mealDataPresent,true);
  assert.equal(empty.ingredientsRecorded,false);
  assert.deepEqual(empty.ingredientAmounts,[]);
  assert.throws(()=>decodeMealItemStateEvidence(bytes(field(2,1))),
    /DB02_MEAL_PRICE_MIXED_ONEOF_STATES/);
});
test('different ingredient combinations with the same Meal Item ID remain distinguishable',()=>{
  const a=decodeMealItemStateEvidence(meal([31100053,30200045]));
  const b=decodeMealItemStateEvidence(meal([30200045,31100053],false));
  const c=decodeMealItemStateEvidence(meal([31100053,30200092]));
  const pack=x=>({contract:DB02_MEAL_PRICE_EVIDENCE_CONTRACT,
    mealItemId:30300005,recordedIngredients:x.ingredientAmounts});
  const same=compareMealIngredientStates(pack(a),pack(b));
  assert.equal(same.sameSerializedIngredientMultiset,true);
  assert.equal(same.pricesCompared,false);
  assert.equal(same.pricesMayDiffer,true);
  assert.equal(same.priceEqualityVerified,false);
  assert.equal(same.ingredientDifferenceCouldAffectPrice,false);
  const different=compareMealIngredientStates(pack(a),pack(c));
  assert.equal(different.differentIngredientComposition,true);
  assert.equal(different.pricesMayDiffer,true);
  assert.equal(different.actualSellPrices,null);
  assert.throws(()=>compareMealIngredientStates(pack(a),
    {...pack(b),mealItemId:30300006}),/DB02_MEAL_PRICE_SAME_MEAL_CONTEXT_REQUIRED/);
});
test('truncated, noncanonical, duplicate and oversized wire data is rejected',()=>{
  const invalid=[
    Uint8Array.of(0x0a,0x04,0x08),
    Uint8Array.of(0x0a,0x80,0x00),
    bytes(nested(1,[]),nested(1,[])),
    bytes(nested(1,[]),field(2,1)),
    bytes(nested(1,[0x08,0x00])),
    bytes(nested(1,[0x08,0xff,0xff,0xff,0xff,0x0f])),
    bytes(nested(1,[0x08,0x80,0x00])),
    meal(Array(33).fill(31100053)),
    new Uint8Array(4097)
  ];
  for(const bad of invalid)
    assert.throws(()=>decodeMealItemStateEvidence(bad),/DB02_MEAL_PRICE_/);
});
test('private data loader rejects unauthenticated files, not converted to a price',async()=>{
  assert.equal(DB02_MEAL_PRICE_VIEW_CONTRACT,'wand.db02.private-meal-pricing-view@1');
  await assert.rejects(loadPrivateMealPricingView({}),/PRIVATE_SRC02_ARCHIVE_SIZE/);
  await assert.rejects(loadPrivateMealPricingView({
    acquisitionArchiveBytes:new Uint8Array(0),
    priceManifestBytes:fake,priceFiles:{}
  }),/PRIVATE_SRC02_ARCHIVE_SIZE/);
});

test('private real-source smoke never silently falls back to fake ZIPs',async()=>{
  await assert.rejects(runPrivateMealPriceSmoke(
    '/no-such-private-release/r5.zip','/no-such-private-release/prices.zip'),/ENOENT/);
});
