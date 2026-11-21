import test from 'node:test';
import assert from 'node:assert/strict';
import {readOriginalPriceReleaseZip,runPrivateShopRuntimeSmoke}
  from '../tools/src-02-acquisition/smoke_private_stall_price_runtime.mjs';

// No original proprietary bytes or user save records are in public tests.
test('exact private price ZIP reader rejects unauthenticated input',()=>{
  assert.throws(()=>readOriginalPriceReleaseZip(new Uint8Array(0)),
    /DB02_RUNTIME_SMOKE_INVALID_ARCHIVE/);
  assert.throws(()=>readOriginalPriceReleaseZip(new Uint8Array(22)),
    /DB02_RUNTIME_SMOKE_PRIVATE_PRICE_ZIP_SHA/);
  assert.throws(()=>readOriginalPriceReleaseZip(new Uint8Array(2*1024*1024+1)),
    /DB02_RUNTIME_SMOKE_INVALID_ARCHIVE/);
  assert.throws(()=>readOriginalPriceReleaseZip('private bytes'),
    /DB02_RUNTIME_SMOKE_INVALID_ARCHIVE/);
});
test('private runtime smoke requires owner-local original release files',async()=>{
  await assert.rejects(runPrivateShopRuntimeSmoke(
    '/this-path-does-not-exist/r5.zip','/this-path-does-not-exist/price.zip'
  ),/ENOENT/);
});
