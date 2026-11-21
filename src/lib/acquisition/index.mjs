/** SRC-02 portable query API. Pass verified, version-matched private data at runtime. */
const validId = (id) => Number.isSafeInteger(id) && id > 0;

export function createAcquisitionDatabase({ manifest, recipes = [], acquisitions = [],
  lootTables = [], shopOffers = [], relatedItems = [] }) {
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
  const byItem = unique(relatedItems, 'itemId');
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
      source: { platform: manifest.platform, gameVersion: manifest.gameVersion },
    } : { itemId: id, status: 'unresolved_or_no_verified_link',
      source: { platform: manifest.platform, gameVersion: manifest.gameVersion } };
  };
  return Object.freeze({
    source: Object.freeze({ platform: manifest.platform, gameVersion: manifest.gameVersion }),
    getRecipe,
    getLootTable: id => byLoot.get(id) ?? null,
    getItem: forItem,
    getRecipesForItem: id => forItem(id)?.madeBy ?? [],
    getAcquisitionPaths: id => forItem(id)?.acquisitionPaths ?? [],
  });
}