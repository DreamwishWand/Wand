/** Worker-local, ID-only read projection; never returns save plaintext. */
import { decodeP1gPackagedProfile } from './private-p1g-codec.js';
import { inspectDecodedWorldStores } from '../acquisition/world-store-save.mjs';
import { createSavedStorePreview } from './saved-store-preview.mjs';
import { createSavedCollectionPresence } from './saved-collection-presence.mjs';
import { projectSavedCollectionDiscovery } from './saved-collection-discovery.mjs';
import { projectPositiveListInventoryOwnership } from './saved-list-positive-ownership.mjs';
import { projectSavedGridFurnitureReferences } from './saved-grid-furniture-references.mjs';

const staticStallUnavailable = Object.freeze({ getStallStaticCatalog: () => null });
const MAX_ENCRYPTED_BYTES = 32 * 1024 * 1024;

/** Production Worker injects the Rust/WASM reader. Default remains only
 * for existing Node synthetic codec-parity tests during migration. */
export async function inspectEncryptedSavedStore(
  ciphertext, decodeProfile=decodeP1gPackagedProfile
) {
  if(typeof decodeProfile!=='function')
    throw new TypeError('LOCAL_P1G_RUST_READER_REQUIRED');
  if (!(ciphertext instanceof Uint8Array) || ciphertext.byteLength < 16 ||
      ciphertext.byteLength > MAX_ENCRYPTED_BYTES || (ciphertext.byteLength % 16) !== 0)
    throw new TypeError('LOCAL_P1G_INVALID_CIPHERTEXT');

  // Codec performs strict ZIP CRC, UTF-8, duplicate JSON key and number checks.
  // The second parse is of the already-validated JSON text. Everything remains
  // in the dedicated Worker, which is terminated after its single response.
  const decoded = await decodeProfile(ciphertext);
  const root = JSON.parse(decoded.jsonText);
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