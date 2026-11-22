/**
 * Non-regression guard for the first final-architecture migration slice.
 * Does NOT claim the entire repository is already Rust-first.
 * Prevents the two production encrypted-save Workers from silently
 * returning to the legacy JavaScript crypto/ZIP implementation.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const collection=read('src/lib/collection/saved-store.worker.mjs');
const diagnostics=read('src/lib/save/save-diagnostics.worker.mjs');
const bridge=read('src/lib/collection/rust-p1g-profile-reader.ts');
const native=read('crates/ddv-p1g-codec/src/lib.rs');
const collectionCore=read('src/lib/collection/saved-store-worker-core.mjs');
const diagnosticsCore=read('src/lib/save/save-diagnostics-worker-core.mjs');
for(const [worker,code] of [['Collection',collection],['SaveDiagnostics',diagnostics]]){
  assert.match(code,/rust-p1g-profile-reader\.ts/,
    worker+' must import the Rust-only production codec');
  assert.match(code,/readRustP1gProfileInWorker/,
    worker+' must inject the Rust reader');
  assert.doesNotMatch(code,/from ['"][^'"]*private-p1g-codec\.js/,
    worker+' must not import the JavaScript P1G codec');
  assert.doesNotMatch(code,/decodeP1gPackagedProfile/,
    worker+' must not call the legacy JS P1G decoder');
}
assert.match(collection,/inspectEncryptedSavedStore\(ciphertext,\s*readRustP1gProfileInWorker\)/);
assert.match(diagnostics,/safeNativeP1gAudit,\s*readRustP1gProfileInWorker\)/);
assert.match(collectionCore,/decodeProfile\(ciphertext\)/);
assert.match(diagnosticsCore,/decodeEncryptedProfile\(bytes\)/);
assert.match(bridge,/WasmP1gProfileReader/);
assert.match(bridge,/\.append_chunk\(/);
assert.match(bridge,/\.finish_open\(/);
assert.match(bridge,/\.take_profile_chunk\(/);
assert.match(bridge,/new TextDecoder\('utf-8',\{fatal:true\}\)/);
assert.match(bridge,/profile\.fill\(0\)/);
assert.match(bridge,/reader\.close\(\)/);
assert.match(bridge,/reader\.free\(\)/);
assert.doesNotMatch(bridge,/private-p1g-codec|createDecipheriv|decryptAes|createInflate|inflateRaw|fallback/i,
  'production bridge must not reinstate JS crypto or fallback');
assert.match(native,/pub struct WasmP1gProfileReader/);
assert.match(native,/OpenedP1g::open\(&self\.ciphertext\)/);
assert.match(native,/pub fn take_profile_chunk/);
assert.match(native,/impl Drop for WasmP1gProfileReader/);
assert.match(native,/MAX_CIPHERTEXT: usize = 32 \* 1024 \* 1024/);
console.log('PASS: production encrypted Collection and Save Diagnostics Workers use Rust/WASM P1G');
