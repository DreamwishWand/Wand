/**
 * Privacy-preserving, in-memory preview of an independently decoded StoreInfo.
 * This is NOT Collection ownership, current shop stock, or a source-version join.
 * The optional public Switch 1.25.0 Collection rows are historical reference
 * labels only; the save's game-version equivalence is not established.
 */
export const SAVED_STORE_PREVIEW_CONTRACT = 'wand.collection.saved-store-preview@1';
const SOURCE_CONTRACT = 'wand.db02.world-store-save-evidence@1';
const positive = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const fail = code => { throw new TypeError(code); };

export function createSavedStorePreview(evidence, historicalRecords = []) {
  if (evidence?.contract !== SOURCE_CONTRACT ||
      evidence.strictCodecVerified !== false || evidence.liveInventoryVerified !== false ||
      evidence.salePricesVerified !== false || !Array.isArray(evidence.stores) ||
      !Number.isSafeInteger(evidence.serializedSlotCount) ||
      evidence.serializedSlotCount < 0 || evidence.serializedSlotCount > 16384)
    fail('SAVED_STORE_PREVIEW_SOURCE_REQUIRED');
  if (!Array.isArray(historicalRecords) || historicalRecords.length > 50000)
    fail('SAVED_STORE_PREVIEW_BAD_HISTORICAL_ROWS');
  const history = new Map();
  for (const row of historicalRecords) {
    if (!positive(row?.itemId) || history.has(row.itemId))
      fail('SAVED_STORE_PREVIEW_INVALID_HISTORICAL_ROW');
    history.set(row.itemId,row);
  }
  const grouped = new Map();
  let totalSlots = 0;
  let emptySlots = 0;
  for (const store of evidence.stores) {
    if (!Array.isArray(store?.slots)) fail('SAVED_STORE_PREVIEW_INVALID_STORE');
    for (const slot of store.slots) {
      totalSlots++;
      if (totalSlots > 16384) fail('SAVED_STORE_PREVIEW_SLOT_LIMIT');
      if (slot.itemId === null) { emptySlots++; continue; }
      if (!positive(slot.itemId)) fail('SAVED_STORE_PREVIEW_INVALID_ITEM_ID');
      const x=grouped.get(slot.itemId) ?? {itemId:slot.itemId, referenceCount:0, stores:new Set()};
      x.referenceCount++;
      x.stores.add(store.storeIndex);
      grouped.set(slot.itemId,x);
    }
  }
  if (totalSlots !== evidence.serializedSlotCount)
    fail('SAVED_STORE_PREVIEW_SLOT_COUNT_MISMATCH');
  const items = [...grouped.values()].sort((a,b)=>a.itemId-b.itemId).map(row => {
    const previous=history.get(row.itemId);
    return Object.freeze({itemId:row.itemId,referenceCount:row.referenceCount,
      storeReferenceCount:row.stores.size,
      // Only an ID equality to a different-version public index, not a verified
      // source-version match, label for the current game, or a proof of ownership.
      historicalMatch:!!previous,
      historicalLabel:previous && typeof previous.label==='string' && previous.label.trim()
        ? previous.label : null,
      historicalFamily:previous && typeof previous.family==='string' && previous.family.trim()
        ? previous.family : null,
      historicalReferenceOnly:true,playerOwnedVerified:false,
      availableForPurchaseVerified:false,shopPrice:null,publishable:false});
  });
  return Object.freeze({contract:SAVED_STORE_PREVIEW_CONTRACT,
    status:evidence.status,fieldObserved:evidence.fieldObserved,
    savedStoreCount:evidence.storeCount,savedSlotCount:totalSlots,
    savedSlotsWithoutItem:emptySlots,savedItemReferenceCount:totalSlots-emptySlots,
    distinctItemCount:items.length,
    historicalMatchedCount:items.filter(x=>x.historicalMatch).length,
    historicalCatalogSource:'Nintendo Switch v1.25.0',
    sourceVersionEquivalenceVerified:false,strictCodecVerified:false,
    ownershipVerified:false,liveInventoryVerified:false,pricesVerified:false,
    privateOnly:true,publishable:false,items:Object.freeze(items)});
}

/**
 * Attach optional *historical* public labels on the main thread, after the
 * Worker has already discarded the decoded save. Reject unexpected fields in
 * the worker's compact result rather than treating arbitrary data as items.
 * Never upgrades a label, image, saved offer, or collection ownership claim.
 */
export function attachHistoricalStoreLabels(summary, historicalRecords = []) {
  if (summary?.contract !== SAVED_STORE_PREVIEW_CONTRACT ||
      summary.privateOnly !== true || summary.publishable !== false ||
      summary.strictCodecVerified !== false ||
      summary.sourceVersionEquivalenceVerified !== false ||
      summary.ownershipVerified !== false || summary.liveInventoryVerified !== false ||
      summary.pricesVerified !== false || !Array.isArray(summary.items) ||
      !['observed_decoded_structure','not_observed'].includes(summary.status) ||
      !Number.isSafeInteger(summary.savedStoreCount) || summary.savedStoreCount < 0 || summary.savedStoreCount > 256 ||
      !Number.isSafeInteger(summary.savedSlotCount) || summary.savedSlotCount < 0 || summary.savedSlotCount > 16384 ||
      !Number.isSafeInteger(summary.savedSlotsWithoutItem) || summary.savedSlotsWithoutItem < 0 ||
      summary.savedSlotsWithoutItem > summary.savedSlotCount ||
      summary.savedItemReferenceCount !== summary.savedSlotCount - summary.savedSlotsWithoutItem ||
      summary.distinctItemCount !== summary.items.length || summary.items.length > 16384 ||
      summary.fieldObserved !== (summary.status === 'observed_decoded_structure'))
    fail('SAVED_STORE_PREVIEW_INVALID_WORKER_SUMMARY');
  if (!Array.isArray(historicalRecords) || historicalRecords.length > 50000)
    fail('SAVED_STORE_PREVIEW_BAD_HISTORICAL_ROWS');
  const history = new Map();
  for (const row of historicalRecords) {
    if (!positive(row?.itemId) || history.has(row.itemId))
      fail('SAVED_STORE_PREVIEW_INVALID_HISTORICAL_ROW');
    history.set(row.itemId,row);
  }
  const seen = new Set();
  let references = 0;
  const items = summary.items.map(item => {
    if (!positive(item?.itemId) || seen.has(item.itemId) ||
        !Number.isSafeInteger(item.referenceCount) || item.referenceCount < 1 ||
        !Number.isSafeInteger(item.storeReferenceCount) || item.storeReferenceCount < 1 ||
        item.storeReferenceCount > summary.savedStoreCount ||
        item.referenceCount < item.storeReferenceCount)
      fail('SAVED_STORE_PREVIEW_INVALID_WORKER_ITEM');
    seen.add(item.itemId);
    references += item.referenceCount;
    const historyRow=history.get(item.itemId);
    return Object.freeze({
      itemId:item.itemId,
      referenceCount:item.referenceCount,
      storeReferenceCount:item.storeReferenceCount,
      historicalMatch:!!historyRow,
      historicalLabel:historyRow && typeof historyRow.label==='string' && historyRow.label.trim()
        ? historyRow.label : null,
      historicalFamily:historyRow && typeof historyRow.family==='string' && historyRow.family.trim()
        ? historyRow.family : null,
      historicalReferenceOnly:true,
      playerOwnedVerified:false,availableForPurchaseVerified:false,
      shopPrice:null,publishable:false
    });
  });
  if (references !== summary.savedItemReferenceCount ||
      (summary.status === 'not_observed' && summary.savedStoreCount !== 0))
    fail('SAVED_STORE_PREVIEW_INVALID_WORKER_COUNTS');
  return Object.freeze({
    contract:SAVED_STORE_PREVIEW_CONTRACT,
    status:summary.status,fieldObserved:summary.fieldObserved,
    savedStoreCount:summary.savedStoreCount,
    savedSlotCount:summary.savedSlotCount,
    savedSlotsWithoutItem:summary.savedSlotsWithoutItem,
    savedItemReferenceCount:summary.savedItemReferenceCount,
    distinctItemCount:items.length,
    historicalMatchedCount:items.filter(item=>item.historicalMatch).length,
    historicalCatalogSource:'Nintendo Switch v1.25.0',
    sourceVersionEquivalenceVerified:false,strictCodecVerified:false,
    ownershipVerified:false,liveInventoryVerified:false,pricesVerified:false,
    privateOnly:true,publishable:false,items:Object.freeze(items)
  });
}