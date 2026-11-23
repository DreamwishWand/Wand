/** One-shot typed local Save Worker: Rust/WASM plaintext or P1G. Never issues network requests. */
import { inspectLocalSavedStore } from './saved-store-worker-core.ts';
import {projectCollectionDiscoveryRust,projectPositiveListInventoryRust}
  from './rust-collection-discovery.ts';
import { decodePlainProfileRust } from '../save/plain-profile-read';
import { decodeP1gRustFirst } from '../save/p1g-read.ts';

let started = false;
self.onmessage = async ({ data }: MessageEvent<{command:string;bytes:Uint8Array}>) => {
  if (started) return;
  started = true;
  const bytes = data?.bytes;
  let response: {kind:'error'} | {kind:'result'; result: Awaited<ReturnType<typeof inspectLocalSavedStore>>} = {kind:'error'};
  try {
    if (data?.command !== 'inspect-local-save' ||
        !(bytes instanceof Uint8Array) ||
        Object.keys(data).sort().join(',') !== 'bytes,command')
      throw new TypeError('LOCAL_P1G_INVALID_WORKER_COMMAND');
    const result = await inspectLocalSavedStore(bytes, decodeP1gRustFirst,
      decodePlainProfileRust, projectCollectionDiscoveryRust,
      projectPositiveListInventoryRust);
    response = { kind: 'result', result };
  } catch {
    // Do not reveal source fields, file names or private decoder diagnostics.
  } finally {
    if (bytes instanceof Uint8Array && bytes.byteLength) bytes.fill(0);
  }
  self.postMessage(response);
  self.close();
};