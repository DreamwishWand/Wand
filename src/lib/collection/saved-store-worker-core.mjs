/**
 * Read-only, browser-Worker-owned native-first local save inspection.
 * The caller receives bounded ID/reference counts and a whitelisted
 * native CollectionSet discovery, ListInventory positive-stock and read-only
 * world-grid furniture-reference projections, never decoded JSON,
 * arbitrary save values, personal fields, amounts, or source ciphertext.
 * Discovery is NOT item ownership, entitlement, shop stock or codec roundtrip.
 */
import { decodeP1gPackagedProfile } from './private-p1g-codec.js';
import { parseSafeJson } from './safe-profile-json.mjs';
import { inspectDecodedWorldStores } from '../acquisition/world-store-save.mjs';
import { createSavedStorePreview } from './saved-store-preview.mjs';
import { createSavedCollectionPresence } from './saved-collection-presence.mjs';
import { projectSavedCollectionDiscovery } from './saved-collection-discovery.mjs';
import { projectPositiveListInventoryOwnership } from './saved-list-positive-ownership.mjs';
import { projectSavedGridFurnitureReferences } from './saved-grid-furniture-references.mjs';

const staticStallUnavailable = Object.freeze({ getStallStaticCatalog: () => null });
const MAX_ENCRYPTED_BYTES = 32 * 1024 * 1024;
const MAX_LOCAL_JSON_BYTES = 128 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8',{fatal:true});
function plaintext(bytes){
  let i=0;
  while(i<bytes.byteLength && [32,9,10,13].includes(bytes[i]))i++;
  return bytes[i]===123;
}

/**
 * Production calls supply the Rust/WASM decoder explicitly. Test-only/CLI
 * callers without a WASM runtime keep the strict reference path. Neither
 * native nor reference profile text may cross the Worker/page boundary.
 */
export async function inspectLocalSavedStore(source, decodeProfile=null) {
  if (!(source instanceof Uint8Array) || source.byteLength===0 ||
      source.byteLength>MAX_LOCAL_JSON_BYTES ||
      (!plaintext(source) &&
       (source.byteLength<16 || source.byteLength>MAX_ENCRYPTED_BYTES ||
        source.byteLength%16!==0))) {
    throw new TypeError('COLLECTION_LOCAL_SOURCE_INVALID');
  }
  if(decodeProfile!==null && typeof decodeProfile!=='function')
    throw new TypeError('COLLECTION_NATIVE_DECODER_REQUIRED');
  const decoded=decodeProfile!==null
    ? await decodeProfile(source)
    : plaintext(source)
      ? {jsonText:utf8.decode(source)}
      : await decodeP1gPackagedProfile(source);
  if(typeof decoded?.jsonText!=='string' || decoded.jsonText.length===0)
    throw new TypeError('COLLECTION_PROFILE_TEXT_INVALID');
  // Retain strict unsafe-number checks before projecting any JavaScript
  // Collection state. Rust already validated structure and duplicate keys.
  const root = parseSafeJson(decoded.jsonText);
  if (!root.GameInfo || typeof root.GameInfo!=='object' ||
      Array.isArray(root.GameInfo) || !root.Player ||
      typeof root.Player!=='object' || Array.isArray(root.Player) ||
      !root.World || typeof root.World!=='object' || Array.isArray(root.World))
    throw new TypeError('COLLECTION_REQUIRED_SECTIONS_MISSING');
  const evidence = inspectDecodedWorldStores(staticStallUnavailable, root);
  return Object.freeze({
    kind: 'saved-store-summary',
    saveSchema: Number.isSafeInteger(root.GameInfo?.Version)
      ? root.GameInfo.Version : null,
    summary: createSavedStorePreview(evidence, []),
    collection: createSavedCollectionPresence(root),
    discovery: projectSavedCollectionDiscovery(root),
    positiveOwnership: projectPositiveListInventoryOwnership(root),
    gridFurniture: projectSavedGridFurnitureReferences(root)
  });
}
/** Legacy test compatibility only. Browser Worker uses inspectLocalSavedStore
 * with its Rust/WASM decoder callback, not this P1G-only entry point. */
export async function inspectEncryptedSavedStore(ciphertext) {
  if(!(ciphertext instanceof Uint8Array)||ciphertext.byteLength<16||
    ciphertext.byteLength>MAX_ENCRYPTED_BYTES||ciphertext.byteLength%16!==0)
    throw new TypeError('LOCAL_P1G_INVALID_CIPHERTEXT');
  return inspectLocalSavedStore(ciphertext);
}
