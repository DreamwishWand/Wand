import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB02_PRIVATE_SHOP_PRICES_CONTRACT,DB02_PRIVATE_SHOP_PRICE_RELEASE_SHA256,
  DB02_PRIVATE_SHOP_SOURCE_SHA256,loadPrivateShopPriceView
} from '../src/lib/acquisition/private-shop-prices.mjs';

const bytes=x=>new TextEncoder().encode(x);
const fake=bytes('{"schema":"wand.db02.protodb-shops@1","privateOnly":true}');
const source=(manifestBytes=bytes('{}'))=>({
  manifestBytes,
  files:{
    'shop-definitions.jsonl':bytes('{}\n'),
    'static-item-prices.jsonl':bytes('{}\n'),
    'stall-shop-joins.jsonl':bytes('{}\n'),
    'dynamic-price-source.jsonl':bytes('{}\n')
  }
});
test('separate public static definitions from private live offers',()=>{
  assert.equal(DB02_PRIVATE_SHOP_PRICES_CONTRACT,'wand.db02.private-shop-prices@1');
  assert.equal(DB02_PRIVATE_SHOP_PRICE_RELEASE_SHA256,
    '641f1b5c5268f136de7bf345f372f06bde923ce0f1f24871225a97913091e975');
  assert.equal(DB02_PRIVATE_SHOP_SOURCE_SHA256,
    'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623');
});
test('unauthenticated local inputs cannot assert prices or shop availability',async()=>{
  await assert.rejects(loadPrivateShopPriceView(source()),/DB02_PRIVATE_SHOP_PRICES_MANIFEST_SHA256_MISMATCH/);
  await assert.rejects(loadPrivateShopPriceView(source(fake)),/DB02_PRIVATE_SHOP_PRICES_MANIFEST_SHA256_MISMATCH/);
  await assert.rejects(loadPrivateShopPriceView(source(new Uint8Array())),/DB02_PRIVATE_SHOP_PRICES_INVALID_FILE_BYTES/);
  await assert.rejects(loadPrivateShopPriceView({manifestBytes:fake,files:null}),/DB02_PRIVATE_SHOP_PRICES_FILES_REQUIRED/);
  await assert.rejects(loadPrivateShopPriceView({manifestBytes:fake,files:{}}),/DB02_PRIVATE_SHOP_PRICES_MANIFEST_SHA256_MISMATCH/);
});
