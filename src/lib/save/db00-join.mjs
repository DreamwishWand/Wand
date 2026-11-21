// DB-05 -> DB-00: Item ID candidates are independent of save platform/build/version.
import { SNAPSHOT_SCHEMA, canonicalId, validateSnapshot } from '../game-db/model.mjs';
import { inspectDecodedSave } from './registry.mjs';

export const SAVE_CATALOG_JOIN_CONTRACT = 'wand.db05.db00-candidate-join@1';

/**
 * Only joins canonical Item IDs. The decoded save's root must satisfy the
 * structural read contract; a DB-00 snapshot must satisfy DB-00 validation.
 * Never use game version, platform or schema version to infer ID membership.
 * An item match does not verify the Save Codec, ownership, or Writer safety.
 */
export function createSaveCatalogJoin(snapshot, decodedSave) {
  if (snapshot?.schema !== SNAPSHOT_SCHEMA) throw new TypeError('DB00_SNAPSHOT_REQUIRED');
  validateSnapshot(snapshot);
  const shape = inspectDecodedSave(decodedSave, null);
  if (!shape.rootShapeValid) throw new TypeError('SAVE_ROOT_STRUCTURE_INVALID: ' + shape.issues.join(','));
  const index = new Map(snapshot.items.map(item => [item.id, item]));
  const complete = snapshot.coverage.complete === true;
  return Object.freeze({
    contract: SAVE_CATALOG_JOIN_CONTRACT,
    snapshotId: snapshot.id,
    saveShapeContract: shape.shapeProbe.contract,
    compatibilityBasis: 'decoded_field_shape',
    catalogCoverageComplete: complete,
    sourceAndSaveJointlyVerified: false,
    savedReferencesVerified: false,
    ownershipVerified: false,
    writerAuthorized: false,
    lookup(value) {
      const itemId = canonicalId(value);
      const record = index.get(itemId) ?? null;
      return Object.freeze({
        itemId,
        classification: record
          ? 'catalog_item_candidate'
          : complete ? 'not_in_catalog_snapshot' : 'unresolved_in_partial_catalog',
        catalogItem: record,
        savedReferenceVerified: false,
        ownershipVerified: false,
        writerAuthorized: false
      });
    }
  });
}
