/** DB-02 -> DB-00: exact-source membership join, not proof of stock or entitlement. */
import { SNAPSHOT_SCHEMA, canonicalId, validateSnapshot } from '../game-db/model.mjs';
import { createAcquisitionDatabase } from './index.mjs';

export const ACQUISITION_DB00_JOIN_CONTRACT = 'wand.db02.db00-candidate-join@1';
const STEAM_1262_CONDITION_SHA256 = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';

export function createAcquisitionCatalogJoin(snapshot, bundle) {
  if (snapshot?.schema !== SNAPSHOT_SCHEMA) throw new TypeError('DB00_SNAPSHOT_REQUIRED');
  validateSnapshot(snapshot);
  if (bundle?.verified !== true || bundle.privateSource !== true ||
      !/^[a-f0-9]{64}$/.test(bundle.manifestSha256 ?? '') ||
      !Object.isFrozen(bundle) || !Object.isFrozen(bundle.manifest) ||
      !Object.isFrozen(bundle.recipes) || !Object.isFrozen(bundle.relatedItems)) {
    throw new TypeError('SRC02_VERIFIED_PRIVATE_BUNDLE_REQUIRED');
  }
  if (bundle?.manifest?.schema !== 'wand.src02@1' || bundle.manifest.status !== 'partial_native_extraction')
    throw new TypeError('SRC02_BUNDLE_MANIFEST_REQUIRED');
  if (bundle.manifest.platform === 'Steam' && bundle.manifest.gameVersion === '1.26.2' &&
      bundle.manifest.source?.conditionSha256 !== STEAM_1262_CONDITION_SHA256) {
    throw new TypeError('SRC02_DB00_STALE_CONDITION_SOURCE');
  }
  if (bundle.manifest.platform !== snapshot.target.platform ||
      bundle.manifest.gameVersion !== snapshot.target.gameVersion ||
      bundle.manifest.source?.src01ManifestSha256 !== snapshot.target.sourceSha256) {
    throw new TypeError('SRC02_DB00_EXACT_SOURCE_MISMATCH');
  }
  const catalog = new Map(snapshot.items.map(item => [item.id, item]));
  const db = createAcquisitionDatabase(bundle);
  return Object.freeze({
    contract: ACQUISITION_DB00_JOIN_CONTRACT,
    snapshotId: snapshot.id,
    acquisitionSource: db.source,
    catalogCoverageComplete: snapshot.coverage.complete,
    acquisitionCoverageComplete: false,
    privateSource: true,
    publishable: false,
    liveStockVerified: false,
    pricesVerified: false,
    eligibilityVerified: false,
    lookup(value) {
      const itemId = canonicalId(value);
      const catalogItem = catalog.get(itemId) ?? null;
      const sourceRow = db.getItem(Number(itemId));
      return Object.freeze({
        itemId, catalogItem,
        classification: catalogItem ? 'catalog_item_candidate' :
          snapshot.coverage.complete ? 'not_in_exact_catalog' : 'unresolved_in_partial_catalog',
        acquisition: sourceRow,
        acquisitionLinksVerifiedFromNativeData: Boolean(sourceRow && !sourceRow.status),
        currentAvailabilityVerified: false,
        shopOfferVerified: false,
        ownedOrUnlocked: 'unknown',
        publishable: false,
      });
    },
    getRecipe: db.getRecipe,
    getPossibleStallsForItem: db.getPossibleStallsForItem,
    getPossibleStallSlotsForItem: db.getPossibleStallSlotsForItem,
    getStallStaticCatalog: db.getStallStaticCatalog,
    getStallsByShopDataKey: db.getStallsByShopDataKey,
    listStallStaticCatalogs: db.listStallStaticCatalogs,
    getConditionGate: db.getConditionGate,
    getConditionDefinition: db.getConditionDefinition,
    getRecipeCondition: db.getRecipeCondition,
    getAcquisitionCondition: db.getAcquisitionCondition,
    getLootGroupCondition: db.getLootGroupCondition,
  });
}