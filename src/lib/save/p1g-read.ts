/**
 * Collection P1G read migration: strict Rust/WASM primary decoder.
 * Only the isolated browser Worker calls this. The unencrypted profile stays
 * inside that Worker; the Svelte UI receives only the redacted projections.
 *
 * The legacy read-only decoder is a temporary compatibility path ONLY for
 * ZIP features the currently supported Rust reader explicitly cannot handle.
 * Invalid/unauthenticated P1G, failed WASM initialization, malformed JSON and
 * CRC errors never fall back to JavaScript. No save Writer is exposed.
 */
import init, { WasmP1gReader } from './wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from './wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';

const MAX_INPUT = 32 * 1024 * 1024;
const MAX_PROFILE = 128 * 1024 * 1024;
const CHUNK = 1024 * 1024;
let initializing: Promise<unknown> | null = null;

export interface RustReadResult {
  readonly jsonText: string;
  readonly backend: 'rust_wasm' | 'legacy_unsupported_envelope';
}

export async function decodeP1gRustFirst(source: Uint8Array): Promise<RustReadResult> {
  if (!(source instanceof Uint8Array) || source.byteLength < 16 ||
      source.byteLength > MAX_INPUT || source.byteLength % 16 !== 0) {
    throw new TypeError('DB05_RUST_READ_INPUT_DENIED');
  }
  if (!initializing) {
    initializing = init(wasmUrl).catch(error => {
      initializing = null;
      throw error;
    });
  }
  await initializing;
  const reader = new WasmP1gReader();
  let legacyEnvelope = false;
  let profile: Uint8Array | null = null;
  try {
    for (let start = 0; start < source.byteLength; start += CHUNK) {
      reader.append_chunk(source.subarray(start, start + CHUNK));
    }
    let length: number;
    try {
      length = reader.finish_open();
    } catch (error) {
      legacyEnvelope = String(error).includes('DB05_RUST_READ_UNSUPPORTED_ENVELOPE');
      if (!legacyEnvelope) throw error;
      length = 0;
    }
    if (!legacyEnvelope) {
      if (!Number.isSafeInteger(length) || length < 1 || length > MAX_PROFILE)
        throw new TypeError('DB05_RUST_READ_PROFILE_LIMIT');
      profile = new Uint8Array(length);
      for (let start = 0; start < length; start += CHUNK) {
        const expected = Math.min(CHUNK, length - start);
        const part = reader.take_profile_chunk(expected);
        if (!(part instanceof Uint8Array) || part.byteLength !== expected)
          throw new TypeError('DB05_RUST_READ_CHUNK_MISMATCH');
        profile.set(part, start);
        part.fill(0);
      }
      const jsonText = new TextDecoder('utf-8', {fatal:true}).decode(profile);
      return {jsonText, backend: 'rust_wasm'};
    }
  } finally {
    profile?.fill(0);
    reader.close();
    reader.free();
  }
  // The legacy decoder is only reachable when Rust has explicitly recognized
  // a ZIP layout it does not yet support (e.g. multiple entries).
  // Remove this branch after the Rust codec covers that envelope.
  const {decodeP1gPackagedProfile} = await import('../collection/private-p1g-codec.js');
  const decoded = await decodeP1gPackagedProfile(source);
  return {jsonText: decoded.jsonText, backend: 'legacy_unsupported_envelope'};
}
