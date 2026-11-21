/**
 * Read-only, browser-Worker-owned encrypted P1G inspection.
 * The caller receives only an ID/reference-count summary, never decoded JSON,
 * personal save fields, saved quantities, or the original ciphertext.
 * This does not prove live shop offers, prices, owned items or codec round-trip.
 */
import { decodeP1gPackagedProfile } from './private-p1g-codec.js';
import { inspectDecodedWorldStores } from '../acquisition/world-store-save.mjs';
import { createSavedStorePreview } from './saved-store-preview.mjs';

const staticStallUnavailable = Object.freeze({ getStallStaticCatalog: () => null });
const MAX_ENCRYPTED_BYTES = 32 * 1024 * 1024;

export async function inspectEncryptedSavedStore(ciphertext) {
  if (!(ciphertext instanceof Uint8Array) || ciphertext.byteLength < 16 ||
      ciphertext.byteLength > MAX_ENCRYPTED_BYTES || (ciphertext.byteLength % 16) !== 0)
    throw new TypeError('LOCAL_P1G_INVALID_CIPHERTEXT');

  // Codec performs strict ZIP CRC, UTF-8, duplicate JSON key and number checks.
  // The second parse is of the already-validated JSON text. Everything remains
  // in the dedicated Worker, which is terminated after its single response.
  const decoded = await decodeP1gPackagedProfile(ciphertext);
  const root = JSON.parse(decoded.jsonText);
  const evidence = inspectDecodedWorldStores(staticStallUnavailable, root);
  return Object.freeze({
    kind: 'saved-store-summary',
    saveSchema: Number.isSafeInteger(root.GameInfo?.Version)
      ? root.GameInfo.Version : null,
    summary: createSavedStorePreview(evidence, [])
  });
}