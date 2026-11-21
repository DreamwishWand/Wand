/**
 * Private, read-only Collection candidate view from DB-05 decoded StoreInfo.
 * Supply a DB-00/SRC-02 join built from a verified, externally pinned private
 * bundle. Saved merchandise displays are NOT player-owned collection records.
 */
import { inspectDecodedWorldStores } from './world-store-save.mjs';

export const WORLD_STORE_COLLECTION_CONTRACT = 'wand.db02.saved-store-collection@1';
const JOIN_CONTRACT = 'wand.db02.db00-candidate-join@1';
const SOURCE_LIMIT = 16_384;
const CLASSIFICATIONS = new Set([
  'catalog_item_candidate', 'unresolved_in_partial_catalog', 'not_in_exact_catalog'
]);
const LOCALES = new Set(['en','fr','it','de','es-ES','ja','zh-CN','pt-BR']);
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const error = code => { throw new TypeError(code); };
const immutable = Object.freeze;

function validateJoin(join) {
  if (join?.contract !== JOIN_CONTRACT || join.privateSource !== true ||
      join.publishable !== false || typeof join.lookup !== 'function' ||
      typeof join.getStallStaticCatalog !== 'function' ||
      typeof join.snapshotId !== 'string' || !join.snapshotId ||
      !plain(join.acquisitionSource) ||
      typeof join.acquisitionSource.platform !== 'string' ||
      typeof join.acquisitionSource.gameVersion !== 'string' ||
      typeof join.catalogCoverageComplete !== 'boolean') {
    error('WORLD_STORE_COLLECTION_VERIFIED_JOIN_REQUIRED');
  }
}

function limitedNameEvidence(catalogItem) {
  const found = catalogItem !== null;
  if (!found) return immutable({nameStatus:'unresolved',names:immutable({}),
    nativeCategory:null,category:null});
  if (catalogItem.nameStatus !== 'verified' && catalogItem.nameStatus !== 'unverified')
    error('WORLD_STORE_COLLECTION_INVALID_NAME_STATUS');
  const names = {};
  if (catalogItem.nameStatus === 'verified') {
    if (!plain(catalogItem.names)) error('WORLD_STORE_COLLECTION_INVALID_NAMES');
    for (const [locale, name] of Object.entries(catalogItem.names)) {
      if (!LOCALES.has(locale) || typeof name !== 'string' || !name.trim())
        error('WORLD_STORE_COLLECTION_INVALID_NAMES');
      names[locale] = name;
    }
  }
  for (const field of ['nativeCategory','category']) {
    if (catalogItem[field] != null && (typeof catalogItem[field] !== 'string' ||
        !catalogItem[field].trim())) error('WORLD_STORE_COLLECTION_INVALID_CATEGORY');
  }
  return immutable({nameStatus:catalogItem.nameStatus,names:immutable(names),
    nativeCategory:catalogItem.nativeCategory ?? null,
    category:catalogItem.category ?? null});
}

/**
 * @param {object} join A private createAcquisitionCatalogJoin() result.
 * @param {unknown} decodedSave An already decoded, private ProfileSave root.
 * @returns {object} Immutable, private ID-only saved-display evidence.
 */
export function inspectSavedWorldStoreCollection(join, decodedSave) {
  validateJoin(join);
  const stores = inspectDecodedWorldStores(join, decodedSave);
  if (stores.serializedSlotCount > SOURCE_LIMIT)
    error('WORLD_STORE_COLLECTION_SLOT_LIMIT');

  const occurrences = new Map();
  let unassignedSavedSlots = 0;
  for (const store of stores.stores) for (const slot of store.slots) {
    if (slot.itemId === null) { unassignedSavedSlots++; continue; }
    const id = String(slot.itemId);
    if (!occurrences.has(id)) occurrences.set(id, []);
    occurrences.get(id).push(immutable({storeIndex:slot.storeIndex,
      displayIndex:slot.displayIndex,slotIndex:slot.slotIndex}));
  }
  const items = [];
  let inCatalogCount = 0;
  for (const [id, references] of [...occurrences.entries()].sort(([a],[b])=>Number(a)-Number(b))) {
    const result = join.lookup(id);
    if (!plain(result) || result.itemId !== id ||
        !CLASSIFICATIONS.has(result.classification) ||
        (result.classification === 'catalog_item_candidate') !== (result.catalogItem !== null) ||
        (result.catalogItem && result.catalogItem.id !== id)) {
      error('WORLD_STORE_COLLECTION_INVALID_CATALOG_LOOKUP');
    }
    const label = limitedNameEvidence(result.catalogItem);
    const inCatalog = result.classification === 'catalog_item_candidate';
    if (inCatalog) inCatalogCount++;
    items.push(immutable({itemId:id,
      catalogClassification:result.classification,
      nameStatus:label.nameStatus,names:label.names,
      nativeCategory:label.nativeCategory,category:label.category,
      savedDisplayReferenceCount:references.length,
      savedDisplayReferences:immutable(references),
      // A displayed item is NOT the player's collected/owned item.
      playerOwnedVerified:false,collectionUnlockedVerified:false,
      acquiredFromShopVerified:false,currentOfferVerified:false,
      salePrice:null,priceVerified:false,publishable:false}));
  }
  return immutable({contract:WORLD_STORE_COLLECTION_CONTRACT,
    snapshotId:join.snapshotId,
    source:immutable({platform:join.acquisitionSource.platform,
      gameVersion:join.acquisitionSource.gameVersion}),
    saveSourceVersionCompatibilityVerified:false,
    externalManifestPinCheckedByThisFunction:false,
    status:stores.status,
    saveStoresFieldObserved:stores.fieldObserved,
    savedStoreCount:stores.storeCount,
    savedDisplaySlotCount:stores.serializedSlotCount,
    savedSlotsWithoutItem:unassignedSavedSlots,
    savedItemReferenceCount:stores.serializedSlotCount - unassignedSavedSlots,
    distinctItemCount:items.length,
    matchedCatalogItemCount:inCatalogCount,
    unresolvedCatalogItemCount:items.length-inCatalogCount,
    items:immutable(items),
    privateSource:true,publishable:false,
    ownerCollectionVerified:false,liveOffersVerified:false,
    salePricesVerified:false,strictCodecVerified:false,
    saveWriterAuthorized:false});
}