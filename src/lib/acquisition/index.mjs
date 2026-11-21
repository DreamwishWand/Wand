/** SRC-02 portable query API. Pass verified, version-matched private data at runtime. */
import { createStaticStallCatalogIndex } from './stall-catalog.mjs';
const validId = (id) => Number.isSafeInteger(id) && id > 0;
const SHA = /^[0-9a-f]{64}$/;

export function createAcquisitionDatabase({ manifest, recipes = [], acquisitions = [],
  lootTables = [], shopOffers = [], stallSources = [], relatedItems = [],
  conditionGates = null, conditionDefinitions = null, ingredientMembership = null }) {
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
  const shopOffersByItem = new Map();
  for (const offer of byShop.values()) {
    if (!validId(offer.itemId)) throw new Error('Invalid shop offer Item ID');
    if (!shopOffersByItem.has(offer.itemId)) shopOffersByItem.set(offer.itemId, []);
    shopOffersByItem.get(offer.itemId).push(offer);
  }
  const ingredientEvidencePresent = ingredientMembership !== null;
  if (manifest.files?.['ingredient-selector-membership.jsonl'] && !ingredientEvidencePresent) {
    throw new Error('Ingredient selector membership dataset missing');
  }
  const selectorMembers = new Map();
  const byIngredientMember = unique(ingredientMembership ?? [], 'itemId');
  const classes = { CropItemData: [302, 11, 30], FishItemData: [310, 10, 14],
    IngredientItemData: [311, 8, 13] };
  const link = (selectorId, member, kind) => {
    if (!selectorMembers.has(selectorId)) selectorMembers.set(selectorId, []);
    selectorMembers.get(selectorId).push({ itemId: member.itemId, nativeClass: member.nativeClass,
      matchedBy: kind, source: member.source, availabilityVerified: false });
  };
  for (const member of byIngredientMember.values()) {
    const fields = classes[member.nativeClass];
    if (!validId(member.itemId) || !fields || Math.floor(member.itemId / 100000) !== fields[0] ||
        !Number.isSafeInteger(member.cookingIngredientTypeId) ||
        member.cookingIngredientTypeId < 2001400000 || member.cookingIngredientTypeId >= 2001500000 ||
        !Array.isArray(member.tagIds) || new Set(member.tagIds).size !== member.tagIds.length ||
        member.tagIds.some(id => !Number.isSafeInteger(id) || id < 2001200000 || id >= 2001300000) ||
        member.source?.kind !== 'game_native' ||
        member.source.classEvidence !== 'observed_native_id_family_and_named_field_contract' ||
        member.source.file !== 'itemlist/ActivityItem.json' ||
        member.source.definitionId !== member.itemId ||
        member.source.cookingIngredientTypeField !== fields[1] ||
        member.source.tagsField !== fields[2]) {
      throw new Error(`Invalid typed ingredient selector membership ${member.itemId}`);
    }
    link(member.cookingIngredientTypeId, member, 'cooking_ingredient_type');
    for (const tag of member.tagIds) link(tag, member, 'item_tag');
  }
  // Derived candidate indexes must be immutable too: the verified source JSON
  // is deeply frozen, but these arrays and link wrappers were created afterward.
  for (const [id, value] of selectorMembers) {
    value.sort((a, b) => a.itemId - b.itemId);
    selectorMembers.set(id, Object.freeze(value.map(row => Object.freeze(row))));
  }
  if (ingredientEvidencePresent && manifest.counts?.ingredientSelectorMembers !== undefined &&
      manifest.counts.ingredientSelectorMembers !== byIngredientMember.size) {
    throw new Error('Ingredient selector count does not match manifest');
  }
  if (ingredientEvidencePresent && manifest.counts?.ingredientSelectorIdsReferenced !== undefined) {
    const used = new Set();
    let uses = 0;
    for (const recipe of byRecipe.values()) for (const ing of recipe.ingredients ?? []) {
      const ids = ing.kind === 'anyTag' ? [ing.tagId] :
        ing.kind === 'tagAlternatives' ? ing.tagIds : [];
      for (const id of ids) { used.add(id); uses++; }
    }
    const count = name => manifest.counts[name];
    if (count('ingredientSelectorIdsReferenced') !== used.size ||
        count('ingredientSelectorUses') !== uses ||
        count('ingredientSelectorIdsWithObservedMembers') !== [...used].filter(id => selectorMembers.has(id)).length ||
        count('ingredientSelectorIdsWithoutObservedMembers') !== [...used].filter(id => !selectorMembers.has(id)).length) {
      throw new Error('Ingredient selector usage count does not match manifest');
    }
  }
  if ((conditionGates === null) !== (conditionDefinitions === null)) {
    throw new Error('Incomplete condition evidence pair');
  }
  const conditionEvidence = conditionGates !== null;
  const byGate = unique(conditionGates ?? [], 'conditionDigest');
  const byCondition = unique(conditionDefinitions ?? [], 'conditionId');
  if (conditionEvidence) {
    const checkTree = (tree, seen = new Set()) => {
      if (tree?.status !== 'static_predicate_structure_only' ||
          !['and', 'or', 'not'].includes(tree.operator) ||
          !Array.isArray(tree.predicates)) throw new Error('Invalid condition tree');
      for (const node of tree.predicates) {
        if (!Number.isInteger(node.fieldNumber) || !SHA.test(node.payloadSha256)) {
          throw new Error('Invalid condition predicate');
        }
        if (node.fieldNumber === 5) {
          if (!validId(node.conditionId) || !byCondition.has(node.conditionId)) {
            throw new Error('Unresolved common condition ' + node.conditionId);
          }
          if (seen.has(node.conditionId)) throw new Error('Cyclic common condition');
          checkTree(byCondition.get(node.conditionId).tree, new Set([...seen, node.conditionId]));
        } else if (node.fieldNumber === 10) checkTree(node.subConditions, seen);
      }
    };
    for (const [digest, gate] of byGate) {
      if (!SHA.test(digest) || gate.availabilityEvaluated !== false ||
          !Array.isArray(gate.usedBy) || !gate.usedBy.length) throw new Error('Invalid condition gate');
      checkTree(gate.tree);
    }
    for (const [id, def] of byCondition) {
      if (!validId(id) || !SHA.test(def.conditionDigest) || def.availabilityEvaluated !== false) {
        throw new Error('Invalid condition definition');
      }
      checkTree(def.tree, new Set([id]));
    }
    const checkDigest = digest => {
      if (digest && (!SHA.test(digest) || !byGate.has(digest))) {
        throw new Error('Unresolved condition digest ' + digest);
      }
    };
    for (const recipe of byRecipe.values()) checkDigest(recipe.conditionDigest);
    for (const path of byPath.values()) checkDigest(path.conditionDigest);
    for (const loot of byLoot.values()) for (const group of loot.groups) {
      checkDigest(group.eligibilityDigest);
      for (const candidate of group.candidates) checkDigest(candidate.conditionDigest);
    }
  }
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
  for (const [id, slots] of possibleStallsByItem) {
    for (const slot of slots) {
      Object.freeze(slot.candidateGroupIndexes);
      Object.freeze(slot);
    }
    possibleStallsByItem.set(id, Object.freeze(slots));
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
  const stallCatalogs = createStaticStallCatalogIndex({manifest, stallSources, lootTables});
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
      shopOffers: [...(shopOffersByItem.get(id) ?? [])],
      possibleStalls: possibleStalls(id),
      source: { platform: manifest.platform, gameVersion: manifest.gameVersion },
    } : { itemId: id, status: 'unresolved_or_no_verified_link',
      possibleStalls: possibleStalls(id),
      source: { platform: manifest.platform, gameVersion: manifest.gameVersion } };
  };
  return Object.freeze({
    source: Object.freeze({ platform: manifest.platform, gameVersion: manifest.gameVersion }),
    getRecipe,
    ingredientMembershipScope: ingredientEvidencePresent ? 'three_observed_cooking_native_classes' : 'not_supplied',
    getIngredientSelectorCandidates: id => validId(id) ? (selectorMembers.get(id) ?? []) : [],
    getIngredientSelectorMembership: id => byIngredientMember.get(id) ?? null,
    getLootTable: id => byLoot.get(id) ?? null,
    getStallSource: id => byStall.get(id) ?? null,
    getStallStaticCatalog: stallCatalogs.getStallStaticCatalog,
    getStallsByShopDataKey: stallCatalogs.getStallsByShopDataKey,
    listStallStaticCatalogs: stallCatalogs.listStallStaticCatalogs,
    getConditionGate: digest => byGate.get(digest) ?? null,
    getConditionDefinition: id => byCondition.get(id) ?? null,
    getRecipeCondition: id => byGate.get(byRecipe.get(id)?.conditionDigest) ?? null,
    getAcquisitionCondition: pathId => byGate.get(byPath.get(pathId)?.conditionDigest) ?? null,
    getLootGroupCondition: (tableId, groupIndex) => {
      const group = byLoot.get(tableId)?.groups?.[groupIndex];
      return byGate.get(group?.eligibilityDigest) ?? null;
    },
    getPossibleStallsForItem: possibleStalls,
    getPossibleStallSlotsForItem: possibleStallSlots,
    getItem: forItem,
    getRecipesForItem: id => forItem(id)?.madeBy ?? [],
    getAcquisitionPaths: id => forItem(id)?.acquisitionPaths ?? [],
  });
}