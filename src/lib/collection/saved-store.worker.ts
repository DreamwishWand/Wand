/** One-shot, isolated local file reader. Never issues network requests. */
import { inspectEncryptedSavedStore } from './saved-store-worker-core.ts';
import { decodeP1gRustFirst } from '../save/p1g-read.ts';

let started = false;
self.onmessage = async ({ data }: MessageEvent<{command:string;ciphertext:Uint8Array}>) => {
  if (started) return;
  started = true;
  const ciphertext = data?.ciphertext;
  let response: {kind:'error'} | {kind:'result'; result: Awaited<ReturnType<typeof inspectEncryptedSavedStore>>} = {kind:'error'};
  try {
    if (data?.command !== 'inspect-local-p1g' ||
        !(ciphertext instanceof Uint8Array) ||
        Object.keys(data).sort().join(',') !== 'ciphertext,command')
      throw new TypeError('LOCAL_P1G_INVALID_WORKER_COMMAND');
    const result = await inspectEncryptedSavedStore(ciphertext, decodeP1gRustFirst);
    response = { kind: 'result', result };
  } catch {
    // Do not reveal source fields, file names or private decoder diagnostics.
  } finally {
    if (ciphertext instanceof Uint8Array && ciphertext.byteLength) ciphertext.fill(0);
  }
  self.postMessage(response);
  self.close();
};