// DB-05 -> DB-00: catalog membership candidates, never save ownership or Writer proof.
import { SNAPSHOT_SCHEMA, canonicalId, validateSnapshot } from '../game-db/model.mjs';
import { matchSaveBuild } from './registry.mjs';

export const SAVE_CATALOG_JOIN_CONTRACT = 'wand.db05.db00-candidate-join@1';
const DB_PLATFORMS = Object.freeze({
  switch: 'Nintendo Switch',
  'steam-windows': 'Steam'
});

/**
 * A strictly *catalog-only* relationship. The caller must separately validate
 * the decoded Save, provenance and original bytes with the existing Codec.
 * Unknown/missing references are never interpreted as save corruption.
 */
export function createSaveCatalogJoin(snapshot, declaredBuild) {
  if (snapshot?.schema !== SNAPSHOT_SCHEMA) throw new TypeError('DB00_SNAPSHOT_REQUIRED');
  validateSnapshot(snapshot);
  const build = matchSaveBuild(declaredBuild ?? {});
  if (!build) throw new TypeError('SAVE_BUILD_NOT_REGISTERED');
  const platform = DB_PLATFORMS[build.platform];
  if (snapshot.target.platform !== platform ||
      snapshot.target.gameVersion !== build.gameVersion ||
      snapshot.target.buildId == null ||
      snapshot.target.buildId !== build.identity) {
    throw new TypeError('SAVE_CATALOG_EXACT_TARGET_MISMATCH');
  }
  const index = new Map(snapshot.items.map(item => [item.id, item]));
  const complete = snapshot.coverage.complete === true;
  return Object.freeze({
    contract: SAVE_CATALOG_JOIN_CONTRACT,
    snapshotId: snapshot.id,
    buildCandidate: build.key,
    catalogCoverageComplete: complete,
    sourceAndSaveJointlyVerified: false,
    savedReferencesVerified: false,
    ownershipVerified: false,
    writerAuthorized: false,
    lookup(value) {
      // DB-00's own canonicalId enforces positive, decimal, safe integers,
      // accepting legacy numeric Collection IDs without fuzzy conversion.
      const itemId = canonicalId(value);
      const record = index.get(itemId) ?? null;
      return Object.freeze({
        itemId,
        classification: record
          ? 'catalog_item_candidate'
          : complete ? 'not_in_exact_catalog' : 'unresolved_in_partial_catalog',
        catalogItem: record,
        savedReferenceVerified: false,
        ownershipVerified: false,
        writerAuthorized: false
      });
    }
  });
}
