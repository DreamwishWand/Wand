import { createWorldCatalog, WORLD_SCHEMA } from './catalog.mjs';

// Private DB-04 ZIPs are local-only imports. Manifest hashes establish
// self-consistency, NOT authentication of the game installation or publisher.
const MAX_ZIP_BYTES = 96 * 1024 * 1024;
const MAX_MEMBER_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_MEMBERS = 80;
const encoder = new TextDecoder('utf-8', { fatal: true });
const FAMILY_FILES = ['objects', 'scenes', 'grids', 'layouts', 'worlds', 'areas', 'layoutObjects'];
const NAME_RE = /^[A-Za-z][A-Za-z0-9-]*\.json$/;
const SHA_RE = /^[0-9a-f]{64}$/;

function reject(message) {
  throw new TypeError('DB04_LOCAL_WORLD_ZIP: ' + message);
}
function u16(bytes, pos) {
  return bytes[pos] | (bytes[pos + 1] << 8);
}
function u32(bytes, pos) {
  return (bytes[pos] | (bytes[pos + 1] << 8) |
    (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0;
}
function bounds(bytes, pos, length) {
  if (!Number.isSafeInteger(pos) || !Number.isSafeInteger(length) ||
      pos < 0 || length < 0 || pos + length > bytes.length) {
    reject('invalid ZIP boundary');
  }
}
function zipEntries(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22 ||
      bytes.length > MAX_ZIP_BYTES) reject('invalid/oversized ZIP');
  let eocd = -1;
  const start = Math.max(0, bytes.length - 22 - 65535);
  for (let pos = bytes.length - 22; pos >= start; pos--) {
    if (u32(bytes, pos) === 0x06054b50 &&
        pos + 22 + u16(bytes, pos + 20) === bytes.length) {
      eocd = pos;
      break;
    }
  }
  if (eocd < 0) reject('missing ZIP central directory');
  if (u16(bytes, eocd + 4) !== 0 || u16(bytes, eocd + 6) !== 0 ||
      u16(bytes, eocd + 8) !== u16(bytes, eocd + 10)) {
    reject('multipart ZIP not supported');
  }
  const count = u16(bytes, eocd + 10);
  const centralSize = u32(bytes, eocd + 12);
  const centralOffset = u32(bytes, eocd + 16);
  if (count < 1 || count > MAX_MEMBERS || centralSize === 0xffffffff ||
      centralOffset === 0xffffffff || centralOffset + centralSize !== eocd) {
    reject('unsupported ZIP directory size');
  }
  bounds(bytes, centralOffset, centralSize);
  const result = new Map();
  let pos = centralOffset;
  let total = 0;
  for (let index = 0; index < count; index++) {
    bounds(bytes, pos, 46);
    if (u32(bytes, pos) !== 0x02014b50) reject('invalid ZIP central header');
    const flags = u16(bytes, pos + 8);
    const method = u16(bytes, pos + 10);
    const compressed = u32(bytes, pos + 20);
    const uncompressed = u32(bytes, pos + 24);
    const nameLength = u16(bytes, pos + 28);
    const extraLength = u16(bytes, pos + 30);
    const commentLength = u16(bytes, pos + 32);
    const disk = u16(bytes, pos + 34);
    const localOffset = u32(bytes, pos + 42);
    const next = pos + 46 + nameLength + extraLength + commentLength;
    if (next > eocd || nameLength < 1) reject('malformed ZIP member header');
    if (flags & (0x0001 | 0x0020 | 0x0040) || disk !== 0 ||
        ![0, 8].includes(method) || compressed === 0xffffffff ||
        uncompressed === 0xffffffff || localOffset === 0xffffffff ||
        uncompressed > MAX_MEMBER_BYTES ||
        (method === 0 && compressed !== uncompressed)) {
      reject('unsupported or oversized ZIP member');
    }
    const nameBytes = bytes.subarray(pos + 46, pos + 46 + nameLength);
    const name = encoder.decode(nameBytes);
    if (!NAME_RE.test(name) &&
        !/^diagnostics\/[A-Za-z][A-Za-z0-9-]*\.json$/.test(name)) {
      reject('unexpected ZIP entry path');
    }
    if (result.has(name)) reject('duplicate ZIP member');
    bounds(bytes, localOffset, 30);
    if (u32(bytes, localOffset) !== 0x04034b50 ||
        u16(bytes, localOffset + 8) !== method ||
        u16(bytes, localOffset + 6) !== flags) {
      reject('ZIP local/central header disagreement');
    }
    const localNameLength = u16(bytes, localOffset + 26);
    const localExtraLength = u16(bytes, localOffset + 28);
    if (localNameLength !== nameLength) reject('ZIP local member name mismatch');
    bounds(bytes, localOffset + 30, localNameLength + localExtraLength);
    const actualName = bytes.subarray(localOffset + 30,
      localOffset + 30 + localNameLength);
    if (!actualName.every((value, n) => value === nameBytes[n])) {
      reject('ZIP local member name mismatch');
    }
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    bounds(bytes, dataOffset, compressed);
    if (dataOffset + compressed > centralOffset) {
      reject('ZIP member overlaps central directory');
    }
    result.set(name, {
      offset: dataOffset, compressed, uncompressed, method,
      // Expected CRC is used only as a ZIP structure sanity check.
      crc32: u32(bytes, pos + 16),
    });
    total += uncompressed;
    if (total > MAX_TOTAL_BYTES) reject('oversized ZIP expansion');
    pos = next;
  }
  if (pos !== eocd) reject('invalid ZIP directory terminator');
  if (!result.has('manifest.json')) reject('missing DB-04 manifest');
  return result;
}

async function inflate(bytes, record) {
  const raw = bytes.subarray(record.offset, record.offset + record.compressed);
  if (record.method === 0) {
    if (raw.length !== record.uncompressed) reject('ZIP stored member size mismatch');
    return raw;
  }
  if (typeof DecompressionStream !== 'function') {
    reject('browser does not support local ZIP deflate');
  }
  const stream = new Blob([raw]).stream().pipeThrough(
    new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const parts = [];
  let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > record.uncompressed || length > MAX_MEMBER_BYTES) {
        reject('ZIP inflated member exceeds declared size');
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (length !== record.uncompressed) reject('ZIP inflated member size mismatch');
  const out = new Uint8Array(length);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.byteLength;
  }
  return out;
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) reject('secure browser SHA-256 unavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest),
    b => b.toString(16).padStart(2, '0')).join('');
}
function json(bytes, name) {
  try {
    return JSON.parse(encoder.decode(bytes));
  } catch {
    reject('invalid JSON in ' + name);
  }
}

/**
 * Import a locally selected package_snapshot.py ZIP without network traffic.
 *
 * All manifest-registered JSON bytes are independently SHA-256 checked before
 * any source records reach createWorldCatalog. This does not authenticate the
 * manifest itself. Original/source-version verification remains private
 * Python verify_bundle.py's responsibility.
 */
export async function openLocalWorldZip(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function' ||
      !Number.isSafeInteger(blob.size) || blob.size > MAX_ZIP_BYTES ||
      blob.size < 22) reject('invalid local ZIP file');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const entries = zipEntries(bytes);
  const manifestEntry = entries.get('manifest.json');
  if (manifestEntry.uncompressed > 2 * 1024 * 1024) {
    reject('oversized DB-04 manifest');
  }
  const manifest = json(await inflate(bytes, manifestEntry), 'manifest.json');
  if (!manifest || manifest.schema !== WORLD_SCHEMA ||
      manifest.status !== 'partial_game_native_evidence' ||
      typeof manifest.gameVersion !== 'string' ||
      !/^\d+\.\d+\.\d+$/.test(manifest.gameVersion) ||
      !manifest.outputSha256 || Array.isArray(manifest.outputSha256) ||
      typeof manifest.outputSha256 !== 'object') {
    reject('invalid DB-04 manifest');
  }
  const register = manifest.outputSha256;
  const names = Object.keys(register);
  if (names.length < FAMILY_FILES.length - 1 ||
      names.length > MAX_MEMBERS - 1 ||
      !names.every(name => NAME_RE.test(name) &&
        name !== 'manifest.json' &&
        typeof register[name] === 'string' && SHA_RE.test(register[name]) &&
        entries.has(name))) {
    reject('unregistered/missing/invalid manifest JSON member');
  }
  for (const name of entries.keys()) {
    if (name !== 'manifest.json' && !name.startsWith('diagnostics/') &&
        !Object.hasOwn(register, name)) reject('unexpected unregistered JSON');
  }
  const family = {};
  for (const name of FAMILY_FILES) {
    const member = name + '.json';
    if (!Object.hasOwn(register, member) && name !== 'layoutObjects') {
      reject('missing required world entity family');
    }
  }
  // The package's companion report/diff/unresolved files are still verified
  // even if the World browser UI does not consume their private content.
  for (const name of names) {
    const raw = await inflate(bytes, entries.get(name));
    if (await sha256(raw) !== register[name]) {
      reject('manifest SHA-256 mismatch: ' + name);
    }
    const short = name.slice(0, -5);
    if (FAMILY_FILES.includes(short)) family[short] = json(raw, name);
  }
  const catalog = createWorldCatalog({
    manifest, ...family, layoutObjects: family.layoutObjects ?? [],
  });
  return {
    catalog,
    gameVersion: manifest.gameVersion,
    platform: typeof manifest.platform === 'string' ? manifest.platform : 'unknown',
    sourceScopeVerified: manifest.sourceScopeVerified === true,
    manifestFilesVerified: names.length,
    integrity: 'manifest_sha256_self_consistent_not_original_source_authenticated',
    originalSourceAuthenticated: false,
    privateDataUploaded: false,
  };
}
