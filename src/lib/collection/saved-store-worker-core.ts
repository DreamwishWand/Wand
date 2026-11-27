/**
 * Read-only, browser-Worker-owned encrypted P1G inspection.
 * The caller receives bounded ID/reference counts and a whitelisted
 * native CollectionSet discovery, ListInventory positive-stock and read-only
 * world-grid furniture-reference projections, never decoded JSON,
 * arbitrary save values, personal fields, amounts, or source ciphertext.
 * Discovery is NOT item ownership, entitlement, shop stock or codec roundtrip.
 */
import { decodeP1gPackagedProfile } from './private-p1g-codec.js';
import {parseSafeJson} from './safe-profile-json.mjs';
import { inspectDecodedWorldStores } from '../acquisition/world-store-save.mjs';
import { createSavedStorePreview } from './saved-store-preview.mjs';
import { createSavedCollectionPresence } from './saved-collection-presence.mjs';
import type {SavedMemoryFlags} from '../media/saved-memory-flags.ts';
import type {SavedCollectionDiscoveryProjection} from './saved-collection-discovery.ts';
import { projectPositiveListInventoryOwnership } from './saved-list-positive-ownership.mjs';
import { projectSavedGridFurnitureReferences } from './saved-grid-furniture-references.mjs';

import type {SavedAvatarAppearance} from '../photo-mode/saved-avatar-appearance.ts';
const staticStallUnavailable = Object.freeze({ getStallStaticCatalog: () => null });
const MAX_ENCRYPTED_BYTES = 32 * 1024 * 1024;
export type SaveDiscoveryProjector=
  (decodedJson:string)=>Promise<SavedCollectionDiscoveryProjection & {memoryFlags?:SavedMemoryFlags;avatarAppearance?:SavedAvatarAppearance}>;

export async function inspectEncryptedSavedStore(
  ciphertext: Uint8Array,
  discovery:SaveDiscoveryProjector,
  decoder: (encrypted: Uint8Array) => Promise<{jsonText:string}> = decodeP1gPackagedProfile
) {
  if (!(ciphertext instanceof Uint8Array) || ciphertext.byteLength < 16 ||
      ciphertext.byteLength > MAX_ENCRYPTED_BYTES || (ciphertext.byteLength % 16) !== 0)
    throw new TypeError('LOCAL_P1G_INVALID_CIPHERTEXT');

  // Codec performs strict ZIP CRC, UTF-8, duplicate JSON key and number checks.
  // The second parse is of the already-validated JSON text. Everything remains
  // in the dedicated Worker, which is terminated after its single response.
  const decoded = await decoder(ciphertext);
  const root = parseSafeJson(decoded.jsonText);
  return projectSavedRoot(root,decoded.jsonText,discovery);
}

async function projectSavedRoot(
  root:any,decodedJson:string,discovery:SaveDiscoveryProjector
) {
  const evidence = inspectDecodedWorldStores(staticStallUnavailable, root);
  const projectedDiscovery=await discovery(decodedJson);
  return Object.freeze({
    kind: 'saved-store-summary',
    saveSchema: Number.isSafeInteger(root.GameInfo?.Version)
      ? root.GameInfo.Version : null,
    summary: createSavedStorePreview(evidence, []),
    collection: createSavedCollectionPresence(root),
    discovery: projectedDiscovery,
    ...(projectedDiscovery.memoryFlags?{memoryFlags:projectedDiscovery.memoryFlags}:{}),
    ...(projectedDiscovery.avatarAppearance?{avatarAppearance:projectedDiscovery.avatarAppearance}:{}),
    positiveOwnership: projectPositiveListInventoryOwnership(root),
    gridFurniture: projectSavedGridFurnitureReferences(root)
  });
}

/**
 * Browser Worker entry: detect actual local bytes (not .profile filename).
 * Rust owns both the plaintext structural validation and P1G envelope;
 * CollectionSet discovery is Rust/WASM; other legacy projections are
 * independently scheduled for migration.
 */
export async function inspectLocalSavedStore(
  source:Uint8Array,
  decodeEncrypted:(source:Uint8Array)=>Promise<{jsonText:string}>,
  decodePlain:(source:Uint8Array)=>Promise<{jsonText:string}>,
  discovery:SaveDiscoveryProjector
){
  if(!(source instanceof Uint8Array)||source.byteLength===0||
      source.byteLength>128*1024*1024)
    throw new TypeError('COLLECTION_LOCAL_SOURCE_INVALID');
  let start=0;
  while(start<source.length && [32,9,10,13].includes(source[start]))
    start++;
  const isPlain=source[start]===123;
  if(isPlain){
    // The Rust validator rejects malformed/plaintext duplicate-key JSON.
    const decoded=await decodePlain(source);
    return projectSavedRoot(
      parseSafeJson(decoded.jsonText),decoded.jsonText,discovery
    );
  }
  // P1G size and padding gates remain in the existing encrypted wrapper.
  return inspectEncryptedSavedStore(source,discovery,decodeEncrypted);
}
