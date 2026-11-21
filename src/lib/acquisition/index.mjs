/** SRC-02 portable query API. Pass verified, version-matched private data at runtime. */
const validId = (id) => Number.isSafeInteger(id) && id > 0;

export function createAcquisitionDatabase({ manifest, recipes = [], acquisitions = [],
  lootTables = [], shopOffers = [], stallSources = [], relatedItems = [] }) {
  if (manifest?.schema !== 'wand.src02@1') throw new Error('Unsupported acquisition manifest');
  if (!manifest.gameVersion || !manifest.platform) throw new Error('Missing source version');
  const unique = (rows, key) => {
    const map = new Map();
    for (const row of rows) {
      const value = row[key];
      if (value == null || map.has(value)) throw new Error(`Invalid or duplicate ${key}`);
      map.set(value, row);
    }
    return map;
  };
  const byRecipe = unique(recipes, 'recipeId');
  const byPath = unique(acquisitions, 'pathId');
  const byLoot = unique(lootTables, 'lootTableId');
  const byShop = unique(shopOffers, 'offerId');
  const byStall = unique(stallSources, 'stallId');
  const byItem = unique(relatedItems, 'itemId');
  // A stall's slot table is a source-backed *candidate pool*, never a live offer.
  // Build once, so Guide/Collection queries do not repeatedly walk every loot table.
  const possibleStallsByItem = new Map();
  for (const [stallId, stall] of byStall) {
    if (!validId(stallId) || !Array.isArray(stall.slotLootTableIds) ||
        stall.slotLootTableIds.length === 0 ||
        stall.inventoryStatus !== 'static_loot_candidates_only') {
      throw new Error(`Invalid static stall source ${stallId}`);
    }
    stall.slotLootTableIds.forEach((lootTableId, slotIndex) => {
      const table = byLoot.get(lootTableId);
      if (!table || !Array.isArray(table.groups)) {
        throw new Error(`Unresolved stall loot table ${lootTableId}`);
      }
      const perSlot = new Map();
      for (const group of table.groups) {
        if (!Array.isArray(group.candidates)) throw new Error('Invalid loot group');
        for (const candidate of group.candidates) {
          if (!validId(candidate.itemId)) throw new Error('Invalid loot candidate Item ID');
          const previous = perSlot.get(candidate.itemId);
          if (!previous) {
            perSlot.set(candidate.itemId, {
              stallId, nameKey: stall.nameKey, shopDataKey: stall.shopDataKey,
              lootTableId, slotIndex, candidateGroupIndexes: [group.index],
              hasConditionalFilter: Boolean(candidate.conditionDigest ||
                group.eligibilityDigest || group.hasDynamicTypeFilters),
              status: 'static_candidate_not_verified_for_sale',
            });
          } else {
            if (!previous.candidateGroupIndexes.includes(group.index)) {
              previous.candidateGroupIndexes.push(group.index);
            }
            if (candidate.conditionDigest || group.eligibilityDigest ||
                group.hasDynamicTypeFilters) previous.hasConditionalFilter = true;
          }
        }
      }
      for (const [itemId, candidate] of perSlot) {
        if (!possibleStallsByItem.has(itemId)) possibleStallsByItem.set(itemId, []);
        possibleStallsByItem.get(itemId).push(candidate);
      }
    });
  }
  const possibleStallSlots = id => validId(id) ? (possibleStallsByItem.get(id) ?? []) : [];
  const possibleStalls = id => {
    const distinct = new Map();
    for (const slot of possibleStallSlots(id)) {
      if (!distinct.has(slot.stallId)) {
        distinct.set(slot.stallId, {
          stallId: slot.stallId, nameKey: slot.nameKey,
          shopDataKey: slot.shopDataKey, slots: [],
          hasConditionalFilter: false,
          status: 'static_candidate_not_verified_for_sale',
        });
      }
      const stall = distinct.get(slot.stallId);
      stall.slots.push({slotIndex: slot.slotIndex, lootTableId: slot.lootTableId,
        candidateGroupIndexes: slot.candidateGroupIndexes});
      stall.hasConditionalFilter ||= slot.hasConditionalFilter;
    }
    return [...distinct.values()];
  };
  for (const [itemId, rel] of byItem) {
    if (!validId(itemId)) throw new Error('Invalid Item ID');
    if ((rel.recipesProducedBy || []).some(id => !byRecipe.has(id)) ||
        (rel.recipesUsedBy || []).some(id => !byRecipe.has(id)) ||
        (rel.acquisitionPaths || []).some(id => !byPath.has(id)) ||
        (rel.growPathsForSeed || []).some(id => !byPath.has(id))) {
      throw new Error(`Broken reference for Item ID ${itemId}`);
    }
  }
  const getRecipe = id => byRecipe.get(id) ?? null;
  const forItem = id => {
    if (!validId(id)) return null;
    const links = byItem.get(id);
    return links ? {
      itemId: id,
      inSrc01: links.inSrc01,
      madeBy: (links.recipesProducedBy || []).map(getRecipe),
      usedBy: (links.recipesUsedBy || []).map(getRecipe),
      acquisitionPaths: (links.acquisitionPaths || []).map(key => byPath.get(key)),
      growsInto: (links.growPathsForSeed || []).map(key => byPath.get(key)),
      // Empty/unknown offers are not evidence an item is not for sale.
      shopOffers: [...byShop.values()].filter(row => row.itemId === id),
      possibleStalls: possibleStalls(id),
      source: { platform: manifest.platform, gameVersion: manifest.gameVersion },
    } : { itemId: id, status: 'unresolved_or_no_verified_link',
      possibleStalls: possibleStalls(id),
      source: { platform: manifest.platform, gameVersion: manifest.gameVersion } };
  };
  return Object.freeze({
    source: Object.freeze({ platform: manifest.platform, gameVersion: manifest.gameVersion }),
    getRecipe,
    getLootTable: id => byLoot.get(id) ?? null,
    getStallSource: id => byStall.get(id) ?? null,
    getPossibleStallsForItem: possibleStalls,
    getPossibleStallSlotsForItem: possibleStallSlots,
    getItem: forItem,
    getRecipesForItem: id => forItem(id)?.madeBy ?? [],
    getAcquisitionPaths: id => forItem(id)?.acquisitionPaths ?? [],
  });
}