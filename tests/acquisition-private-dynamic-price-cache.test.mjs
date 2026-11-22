import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB02_PRIVATE_DYNAMIC_PRICE_CACHE_CONTRACT,
  parseDynamicPriceCacheStructure,loadPrivateDynamicPriceCache
} from '../src/lib/acquisition/private-dynamic-price-cache.mjs';

const uint=x=>{let n=BigInt(x),o=[];do{let v=Number(n&127n);n>>=7n;if(n)v|=128;o.push(v);}while(n);return o;};
const scalar=(field,value)=>[...uint(field*8),...uint(value)];
const nested=(field,values)=>[...uint(field*8+2),...uint(values.length),...values];
const cost=(amount,present)=>nested(3,[
  ...scalar(1,80000000),...(present?scalar(2,amount):[])
]);
const item=(id,kind,amount,present=true)=>nested(1,[
  ...scalar(1,id),
  ...(kind==='sell'?cost(amount,present):
    nested(2,[...scalar(1,80000000),...scalar(2,amount)]))
]);
const bytes=(...parts)=>Uint8Array.from(parts.flat());
test('synthetic native cached purchase vs sell has independent semantics',()=>{
  const data=bytes(item(40100001,'buy',55),item(31500001,'sell',0),
    item(31500002,'sell',0,false));
  const r=parseDynamicPriceCacheStructure(data);
  assert.equal(r.cacheRowCount,3);
  assert.equal(r.purchaseOnlyRowCount,1);
  assert.equal(r.sellOnlyRowCount,2);
  assert.equal(r.bothPurchaseAndSellRowCount,0);
  assert.equal(r.sellCurrencyAmountFieldsPresent,1);
  assert.equal(r.sellCurrencyAmountFieldsAbsent,1);
  assert.equal(r.sourceAuthenticated,false);
  assert.equal(r.effectiveSellPricesVerified,false);
  assert.equal(r.lookup(40100001).cachedPurchaseRowPresent,true);
  assert.equal(r.lookup(40100001).cachedSellRowPresent,false);
  assert.equal(r.lookup(31500001).cachedSellRowPresent,true);
  assert.equal(r.lookup(31100053).cachedSellRowPresent,false);
  assert.equal(r.lookup(31100053).originalSourceAuthenticated,false);
  assert.equal(r.lookup(31500001).sellPrice,null);
  assert.ok(Object.isFrozen(r));
  assert.ok(Object.isFrozen(r.lookup(31500002)));
});
test('multiple cached row IDs, noncanonical, unsupported currencies fail closed',()=>{
  const invalid=[
    bytes(),
    bytes(item(31500001,'sell',5),item(31500001,'sell',10)),
    bytes(nested(1,scalar(1,0))),
    bytes(nested(1,[...scalar(1,31500001),...nested(3,[
      ...scalar(1,80000001),...scalar(2,50)])])),
    bytes(nested(1,[...scalar(1,31500001),
      ...cost(0,true),...cost(5,true)])),
    bytes([0x0a,0x80,0x00]),
    bytes([0x0a,0x04,0x08]),
    bytes(scalar(1,31500001)),
    new Uint8Array(240001)
  ];
  for(const bad of invalid)
    assert.throws(()=>parseDynamicPriceCacheStructure(bad),/DB02_DYNAMIC_CACHE_/);
});
test('lookup requires positive native ID',()=>{
  const r=parseDynamicPriceCacheStructure(bytes(item(31500001,'sell',0,false)));
  for(const bad of [0,-1,1.5,2147483648,Infinity,null,'31500001'])
    assert.throws(()=>r.lookup(bad),/DB02_DYNAMIC_CACHE_INVALID_LOOKUP_ID/);
});
test('same looking but unauthenticated blob cannot impersonate actual protoDb',async()=>{
  await assert.rejects(loadPrivateDynamicPriceCache(new Uint8Array()),
    /DB02_DYNAMIC_CACHE_ORIGINAL_BYTES_REQUIRED/);
  await assert.rejects(loadPrivateDynamicPriceCache(new Uint8Array(1335720)),
    /DB02_DYNAMIC_CACHE_ORIGINAL_PROTO_SHA/);
  assert.equal(DB02_PRIVATE_DYNAMIC_PRICE_CACHE_CONTRACT,
    'wand.db02.private-dynamic-price-cache@1');
});
