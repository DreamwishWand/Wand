/** One-shot isolated diagnostics. Never post decrypted Profile or save values. */
import { inspectLocalSaveDiagnosticsBytes } from './save-diagnostics-worker-core.mjs';
import {probeWasmReferenceParity,wasmReferenceUnavailable} from './save-wasm-reference.mjs';

async function safeWasmProbe(strictJsonText,root){
  try { return await probeWasmReferenceParity(strictJsonText,root); }
  catch { return wasmReferenceUnavailable(); }
}

let started = false;
self.onmessage = async ({ data }) => {
  if (started) return;
  started = true;
  const bytes = data?.bytes;
  let response = { kind: 'error' };
  try {
    if (data?.command !== 'inspect-local-save-diagnostics' ||
        (data.format !== 'json' && data.format !== 'p1g') ||
        !(bytes instanceof Uint8Array) ||
        Object.keys(data).sort().join(',') !== 'bytes,command,format') {
      throw new TypeError('DB05_LOCAL_WORKER_COMMAND_INVALID');
    }
    response = { kind: 'result', result:
      await inspectLocalSaveDiagnosticsBytes(data.format, bytes, safeWasmProbe) };
  } catch {
    // Never relay parser or P1G Codec exceptions (may include source details).
  } finally {
    if (bytes instanceof Uint8Array && bytes.byteLength) bytes.fill(0);
  }
  self.postMessage(response);
  self.close();
};
