/**
 * Browser-Worker-only read-only DDV save diagnostics. Only anonymous
 * DB-05 counts and fixed public labels cross the Worker boundary.
 * Reuse the existing Collection P1G read Codec; no Writer or re-encoding.
 */
import { decodeP1gPackagedProfile } from '../collection/private-p1g-codec.js';
import { parseSafeJson } from '../collection/safe-profile-json.mjs';
import { makeSaveDiagnosticView } from './diagnostic-view.mjs';

export const SAVE_LOCAL_WORKER_CONTRACT = 'wand.db05.local-save-worker@1';
export const MAX_LOCAL_P1G_BYTES = 32 * 1024 * 1024;
export const MAX_LOCAL_JSON_BYTES = 128 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });

export async function inspectLocalSaveDiagnosticsBytes(format, bytes) {
  if (!(bytes instanceof Uint8Array) || (format !== 'p1g' && format !== 'json')) {
    throw new TypeError('DB05_LOCAL_SOURCE_INVALID');
  }
  if (format === 'p1g' ? (
    bytes.byteLength < 16 || bytes.byteLength > MAX_LOCAL_P1G_BYTES ||
    bytes.byteLength % 16 !== 0
  ) : (bytes.byteLength === 0 || bytes.byteLength > MAX_LOCAL_JSON_BYTES)) {
    throw new TypeError('DB05_LOCAL_SOURCE_SIZE_INVALID');
  }
  let root;
  if (format === 'p1g') {
    // Reuses Collection's strict CRC, ZIP, UTF-8, duplicate-key and
    // unsafe-number verification. The decrypted JSON stays in this Worker.
    const decoded = await decodeP1gPackagedProfile(bytes);
    root = JSON.parse(decoded.jsonText); // text was already strictly validated
  } else {
    root = parseSafeJson(decoder.decode(bytes));
  }
  const summary = makeSaveDiagnosticView(root);
  return Object.freeze({
    kind: 'save-diagnostics-summary',
    contract: SAVE_LOCAL_WORKER_CONTRACT,
    format,
    summary,
    strictDecoderRoundTripVerified: false,
    writerAuthorized: false,
    exportAuthorized: false,
  });
}
