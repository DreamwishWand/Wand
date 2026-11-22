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


const wasmStatus=new Set(['matched','diverged','skipped_large_save','unavailable']);
function sanitizeWasmEvidence(raw) {
  const obj=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const valid=obj.contract==='wand.db05.wasm-reference-parity@1' &&
    wasmStatus.has(obj.status) &&
    obj.writerAuthorized===false &&
    obj.exportAuthorized===false;
  const executed=valid && obj.wasmExecuted===true &&
    Number.isSafeInteger(obj.rulesCompared) && obj.rulesCompared===14;
  const status=valid && (obj.status==='matched'||obj.status==='diverged')
    ? (executed?(obj.status==='matched' && obj.wasmAndJsEqual!==true
        ? 'diverged':obj.status):'unavailable')
    : valid && (obj.status==='skipped_large_save'||obj.status==='unavailable')
      ? obj.status:'unavailable';
  return Object.freeze({
    contract:'wand.db05.wasm-reference-parity@1',
    status,
    wasmExecuted:executed,
    rulesCompared:executed?14:0,
    wasmAndJsEqual:status==='matched' && executed && obj.wasmAndJsEqual===true,
    strictDecodingPerformedByExistingCodec:true,
    originalSaveBytesReencoded:false,
    writerAuthorized:false,
    exportAuthorized:false
  });
}


const nativeP1gStatuses=new Set([
  'matched','diverged','rejected_by_rust','skipped_large_save','unavailable'
]);
function sanitizeNativeP1gAudit(raw) {
  const obj=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const valid=obj.contract==='wand.db05.native-p1g-audit@1' &&
    nativeP1gStatuses.has(obj.status) &&
    obj.writerAuthorized===false && obj.exportAuthorized===false &&
    obj.profileDigestExposed===false &&
    obj.originalSaveBytesReencoded===false;
  const executed=valid && obj.wasmExecuted===true &&
    (obj.status==='matched'||obj.status==='diverged');
  const resolved=valid?(executed?(obj.status==='matched' && obj.originalProfileBytesEqual!==true
    ? 'diverged':obj.status):
    ['matched','diverged'].includes(obj.status)?'unavailable':obj.status):'unavailable';
  return Object.freeze({
    contract:'wand.db05.native-p1g-audit@1',
    status:resolved,
    wasmExecuted:executed,
    originalProfileBytesEqual:executed && resolved==='matched' &&
      obj.originalProfileBytesEqual===true,
    profileDigestExposed:false,
    originalSaveBytesReencoded:false,
    writerAuthorized:false,
    exportAuthorized:false
  });
}

export async function inspectLocalSaveDiagnosticsBytes(format, bytes, verifyNative=null, verifyP1g=null) {
  if (verifyNative!==null && typeof verifyNative!=='function')
    throw new TypeError('DB05_LOCAL_WASM_CALLBACK_INVALID');
  if (verifyP1g!==null && typeof verifyP1g!=='function')
    throw new TypeError('DB05_LOCAL_P1G_CALLBACK_INVALID');
  if (!(bytes instanceof Uint8Array) || (format !== 'p1g' && format !== 'json')) {
    throw new TypeError('DB05_LOCAL_SOURCE_INVALID');
  }
  if (format === 'p1g' ? (
    bytes.byteLength < 16 || bytes.byteLength > MAX_LOCAL_P1G_BYTES ||
    bytes.byteLength % 16 !== 0
  ) : (bytes.byteLength === 0 || bytes.byteLength > MAX_LOCAL_JSON_BYTES)) {
    throw new TypeError('DB05_LOCAL_SOURCE_SIZE_INVALID');
  }
  let root,strictJsonText;
  if (format === 'p1g') {
    // Reuses Collection's strict CRC, ZIP, UTF-8, duplicate-key and
    // unsafe-number verification. The decrypted JSON stays in this Worker.
    const decoded = await decodeP1gPackagedProfile(bytes);
    strictJsonText=decoded.jsonText;
    root = JSON.parse(strictJsonText); // text was already strictly validated
  } else {
    strictJsonText=decoder.decode(bytes);
    root = parseSafeJson(strictJsonText);
  }
  const nativeP1gAudit=format==='p1g' && verifyP1g!==null ?
    sanitizeNativeP1gAudit(await verifyP1g(bytes,strictJsonText)):null;
  const summary = makeSaveDiagnosticView(root);
  const wasmReferenceParity=verifyNative===null?null:
    sanitizeWasmEvidence(await verifyNative(strictJsonText,root));
  return Object.freeze({
    kind: 'save-diagnostics-summary',
    contract: SAVE_LOCAL_WORKER_CONTRACT,
    format,
    summary,
    ...(wasmReferenceParity===null?{}:{wasmReferenceParity}),
    ...(nativeP1gAudit===null?{}:{nativeP1gAudit}),
    strictDecoderRoundTripVerified: false,
    writerAuthorized: false,
    exportAuthorized: false,
  });
}
