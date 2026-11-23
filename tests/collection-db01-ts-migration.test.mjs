import test from 'node:test';
import assert from 'node:assert/strict';
import {DB01_PRIVATE_RELEASE as typedPin} from '../src/lib/collection/private-db01-release.ts';
import {DB01_PRIVATE_RELEASE as compatiblePin} from '../src/lib/collection/private-db01-release.mjs';
import {openPrivateDb01Zip as typedZip} from '../src/lib/collection/private-db01-zip.ts';
import {openPrivateDb01Zip as compatibleZip} from '../src/lib/collection/private-db01-zip.mjs';
import {inspectPrivateDb01Names as typedNames} from '../src/lib/collection/private-db01-names-worker-core.ts';
import {inspectPrivateDb01Names as compatibleNames} from '../src/lib/collection/private-db01-names-worker-core.mjs';
import {attachDb01PrivateNames as typedView} from '../src/lib/collection/private-db01-names-view.ts';
import {attachDb01PrivateNames as compatibleView} from '../src/lib/collection/private-db01-names-view.mjs';

test('DB-01 private names, source pins and ZIP execution now resolve to TypeScript only',()=>{
  assert.strictEqual(typedPin,compatiblePin);
  assert.strictEqual(typedZip,compatibleZip);
  assert.strictEqual(typedNames,compatibleNames);
  assert.strictEqual(typedView,compatibleView);
  assert.equal(typedPin.gameVersion,'1.26.2');
  assert.match(typedPin.manifestSha256,/^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(typedPin),true);
});
test('typed ZIP parser still fails closed for invalid bytes',()=>{
  assert.throws(()=>typedZip(new Uint8Array(100)),/DB01_PRIVATE_ZIP_BAD_DIRECTORY/);
  assert.throws(()=>typedZip(new Uint8Array(0)),/DB01_PRIVATE_ZIP_SIZE_LIMIT/);
});
test('typed private name resolver validates early without private source access',async()=>{
  await assert.rejects(typedNames(new Uint8Array(),[1,1]),/INVALID_ITEM_IDS/);
  await assert.rejects(typedNames(new Uint8Array(),[1],{
    ...typedPin,gameVersion:'1.25.0',
  }),/RELEASE_PIN_REQUIRED/);
});
