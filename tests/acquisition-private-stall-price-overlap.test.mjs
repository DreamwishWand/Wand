import test from 'node:test';
import assert from 'node:assert/strict';
import {DB02_STALL_PRICE_OVERLAP_CONTRACT,loadPrivateStallPriceOverlap}
  from '../src/lib/acquisition/private-stall-price-overlap.mjs';

// No private source, game data, prices or player saves are packaged into CI.
const text=x=>new TextEncoder().encode(x);
test('read-only private price-candidate overlap has a distinct contract',()=>{
  assert.equal(DB02_STALL_PRICE_OVERLAP_CONTRACT,
    'wand.db02.private-stall-price-overlap@1');
});
test('cannot trust an arbitrary, absent or forged source ZIP',async()=>{
  await assert.rejects(loadPrivateStallPriceOverlap({}),/PRIVATE_SRC02_ARCHIVE_SIZE/);
  await assert.rejects(loadPrivateStallPriceOverlap({
    acquisitionArchiveBytes:new Uint8Array(0),priceManifestBytes:text('{}'),
    priceFiles:{}
  }),/PRIVATE_SRC02_ARCHIVE_SIZE/);
  await assert.rejects(loadPrivateStallPriceOverlap({
    acquisitionArchiveBytes:Uint8Array.from([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,
      17,18,19,20,21,22,23]),priceManifestBytes:text('{}'),priceFiles:{}
  }),/PRIVATE_SRC02_EOCD_MISSING/);
});
test('private price release alone cannot substitute for source-pinned acquisition index',async()=>{
  await assert.rejects(loadPrivateStallPriceOverlap({
    acquisitionArchiveBytes:text('not an authenticated zip'),
    priceManifestBytes:text('{}'),priceFiles:{}
  }),/PRIVATE_SRC02_EOCD_MISSING/);
});
