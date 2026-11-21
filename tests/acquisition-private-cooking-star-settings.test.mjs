import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB02_PRIVATE_COOKING_STAR_CONTRACT,
  parseCookingDataStarSettings,loadPrivateCookingStarSettings
} from '../src/lib/acquisition/private-cooking-star-settings.mjs';

const uint=x=>{let n=BigInt(x),o=[];do{let b=Number(n&127n);n>>=7n;if(n)b|=128;o.push(b);}while(n);return o;};
const field=(id,value)=>[...uint(id*8),...uint(value)];
const sub=(id,value)=>[...uint(id*8+2),...uint(value.length),...value];
const bytes=v=>Uint8Array.from(v);
const stars=()=>bytes([1,2,3,4,5].flatMap(star=>sub(5,[
  ...field(1,star),
  ...(star===1?[]:field(2,(star-1)*20)),
  ...field(3,star*20),
  ...field(4,95+star*11),
  ...field(5,125+star*11)
])));
test('synthetic five star settings are decoded, remain source-only',()=>{
  const data=parseCookingDataStarSettings(stars());
  assert.equal(data.starResults.length,5);
  assert.equal(data.sourceAuthenticated,false);
  assert.equal(data.sellPriceComputed,false);
  assert.equal(data.starResults[0].minDiscoveredInfoPercentage,null);
  assert.equal(data.starResults[0].minDiscoveredInfoFieldPresent,false);
  assert.equal(data.starResults[3].sellPriceIngredientPercentage,139);
  assert.equal(data.starResults[3].manaRecoveredIngredientPercentage,169);
  assert.equal(data.starResults[3].actualSellPriceFormulaVerified,false);
  assert.equal(data.starResults[3].roundingRuleVerified,false);
  assert.ok(Object.isFrozen(data.starResults));
  assert.ok(Object.isFrozen(data.starResults[3]));
});
test('incomplete, untyped, out-of-range and repeated native fields fail closed',()=>{
  const cases=[
    bytes([]),
    bytes(sub(5,[...field(1,1),...field(4,120),...field(5,160)])),
    bytes([ ...stars(),...sub(5,[...field(1,1),...field(4,100),...field(5,150)])]),
    bytes([ ...sub(5,[...field(1,1),...field(4,0),...field(5,150)]),
      ...[2,3,4,5].flatMap(star=>sub(5,[...field(1,star),...field(4,150),...field(5,170)]))]),
    bytes([ ...sub(5,[...field(1,1),...field(1,1),...field(4,110),...field(5,120)]),
      ...[2,3,4,5].flatMap(star=>sub(5,[...field(1,star),...field(4,150),...field(5,170)]))]),
    bytes([ ...sub(5,[...field(1,1),...field(2,80),...field(3,20),...field(4,100),...field(5,150)]),
      ...[2,3,4,5].flatMap(star=>sub(5,[...field(1,star),...field(4,150),...field(5,170)]))]),
    bytes([0x2a,0x05,0x08]), // truncated message
    bytes([0x2a,0x80,0x00]), // noncanonical length
    bytes([...field(5,1)]), // wrong repeated wire kind
    new Uint8Array(4097)
  ];
  for(const bad of cases)
    assert.throws(()=>parseCookingDataStarSettings(bad),/DB02_COOKING_STAR_/);
});
test('source originality is never satisfied by a forged or merely consistent blob',async()=>{
  await assert.rejects(loadPrivateCookingStarSettings(new Uint8Array()),
    /DB02_COOKING_STAR_INVALID_SOURCE_BYTES/);
  await assert.rejects(loadPrivateCookingStarSettings(new Uint8Array(1335720)),
    /DB02_COOKING_STAR_ORIGINAL_SOURCE_SHA/);
  assert.equal(DB02_PRIVATE_COOKING_STAR_CONTRACT,
    'wand.db02.private-cooking-star-settings@1');
});
