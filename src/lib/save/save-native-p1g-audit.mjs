/**
 * DB-05: Worker-local independent Rust/WASM P1G decrypt + strict read audit.
 * All ciphertext and plaintext stay inside the dedicated Save Worker.
 * The profile SHA-256 is compared locally and never returned to the UI.
 * Not a Writer, ZIP exporter, save download API or version compatibility gate.
 */
import init, { WasmP1gAudit } from './wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from './wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';

export const SAVE_NATIVE_P1G_AUDIT_CONTRACT='wand.db05.native-p1g-audit@1';
const LIMIT=32*1024*1024;
const CHUNK=1024*1024;
const hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
let initializing=null;
function status(value,executed=false) {
  return Object.freeze({
    contract:SAVE_NATIVE_P1G_AUDIT_CONTRACT,
    status:value,
    wasmExecuted:executed,
    originalProfileBytesEqual:value==='matched',
    profileDigestExposed:false,
    originalSaveBytesReencoded:false,
    writerAuthorized:false,
    exportAuthorized:false
  });
}

/**
 * Called only AFTER the independently strict JS P1G codec accepted the file.
 * The two paths must decrypt the same original UTF-8 profile bytes.
 * No raw decrypted data or private fingerprint is part of the return value.
 */
export async function probeNativeP1gAudit(encrypted,strictJsonText) {
  if(!(encrypted instanceof Uint8Array)||encrypted.byteLength===0||
      typeof strictJsonText!=='string')
    throw new TypeError('DB05_NATIVE_P1G_SOURCE_REQUIRED');
  if(encrypted.byteLength>LIMIT || strictJsonText.length>128*1024*1024)
    return status('skipped_large_save');
  if(!initializing)
    initializing=init(wasmUrl).catch(error=>{initializing=null;throw error;});
  await initializing;
  const audit=new WasmP1gAudit();
  try {
    for(let pos=0;pos<encrypted.byteLength;pos+=CHUNK) {
      audit.append_chunk(encrypted.subarray(pos,pos+CHUNK));
    }
    let nativeHex;
    try { nativeHex=audit.finish_sha256_hex(); }
    catch { return status('rejected_by_rust'); }
    // The canonical JSON text from the validated JS codec must be identical
    // at the byte level to Rust's independently extracted original profile.
    if(!globalThis.crypto?.subtle) return status('unavailable');
    const originalBytes=new TextEncoder().encode(strictJsonText);
    try {
      const jsHex=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',originalBytes)));
      return status(nativeHex===jsHex?'matched':'diverged',true);
    } finally {
      originalBytes.fill(0);
    }
  } finally {
    audit.close();
    audit.free();
  }
}

export function nativeP1gAuditUnavailable() {
  return status('unavailable');
}
