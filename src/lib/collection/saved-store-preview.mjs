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