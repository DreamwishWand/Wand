/**
 * A source-derived material estimate, NOT proof that recipes are unlocked, offers
 * are live, or that inventory matches a player's save. Operates only on the
 * caller's verified private SRC-02 acquisition database.
 */
const MAX_BATCHES = 1_000_000;
const MAX_DEPTH = 24;
const ID = /^[1-9][0-9]*$/;

function itemId(value, label) {
  const id = typeof value === 'number' ? value :
    (typeof value === 'string' && ID.test(value) ? Number(value) : NaN);
  if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError(`Invalid ${label}`);
  return id;
}
function quantity(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > Number.MAX_SAFE_INTEGER)
    throw new TypeError(`Invalid ${label}`);
  return value;
}
function checkedAdd(a, b) {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new RangeError('Unsafe material quantity');
  return sum;
}
function checkedMultiply(a, b) {
  const sum = a * b;
  if (!Number.isSafeInteger(sum)) throw new RangeError('Unsafe material quantity');
  return sum;
}
function toMap(value, label, positive = false) {
  if (value == null) return new Map();
  if (typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    throw new TypeError(`Invalid ${label}`);
  const map = new Map();
  for (const [key, count] of Object.entries(value)) {
    const id = itemId(key, label + ' Item ID');
    map.set(id, quantity(count, label + ' quantity', positive ? 1 : 0));
  }
  return map;
}
function sortedRows(map, mapper) {
  return [...map.entries()].sort(([a], [b]) => a - b).map(mapper);
}

/**
 * Calculate ingredients for an explicit recipe and batch count. Only single
 * unambiguous crafting paths expand automatically; alternatives and tag
 * selectors are retained as unresolved choices, never guessed.
 *
 * `inventory` values are hypothetical user-supplied quantities, NOT read from
 * a save. `recipeChoices` maps numeric Item IDs to explicit recipe IDs.
 */
export function planRecipeRequirements(db, recipeId, {
  batches = 1, inventory = {}, recipeChoices = {},
  expandSingleRecipe = true, maxDepth = 12,
} = {}) {
  if (!db || typeof db.getRecipe !== 'function' ||
      typeof db.getRecipesForItem !== 'function' ||
      typeof db.getAcquisitionPaths !== 'function' ||
      typeof db.getPossibleStallsForItem !== 'function' ||
      typeof db.source?.platform !== 'string' || !db.source.gameVersion) {
    throw new TypeError('Verified SRC-02 acquisition database required');
  }
  const rootId = itemId(recipeId, 'recipe ID');
  const root = db.getRecipe(rootId);
  if (!root) throw new RangeError('Unknown source-backed recipe');
  if (!['cooking', 'crafting'].includes(root.type)) throw new TypeError('Unsupported recipe type');
  quantity(batches, 'batch count', 1);
  if (batches > MAX_BATCHES) throw new RangeError('Batch count exceeds safety limit');
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_DEPTH)
    throw new RangeError('Invalid maximum recursion depth');
  if (typeof expandSingleRecipe !== 'boolean') throw new TypeError('Invalid singleton expansion setting');
  const inventoryLeft = toMap(inventory, 'inventory');
  const choices = toMap(recipeChoices, 'recipe choices', true);
  const producedSurplus = new Map();
  const usedInventory = new Map();
  const needs = new Map();
  const steps = [];
  const selectors = [];
  const blockers = [];
  let operationCount = 0;

  function consume(id, requested) {
    const fromInventory = Math.min(inventoryLeft.get(id) ?? 0, requested);
    if (fromInventory) {
      inventoryLeft.set(id, inventoryLeft.get(id) - fromInventory);
      usedInventory.set(id, checkedAdd(usedInventory.get(id) ?? 0, fromInventory));
    }
    let remaining = requested - fromInventory;
    const fromProduction = Math.min(producedSurplus.get(id) ?? 0, remaining);
    if (fromProduction) producedSurplus.set(id, producedSurplus.get(id) - fromProduction);
    remaining -= fromProduction;
    return remaining;
  }
  function missing(id, count, reason, candidates = []) {
    const prev = needs.get(id);
    if (!prev) needs.set(id, { itemId: id, quantity: count, reasons: [reason],
      recipeCandidateIds: [...candidates] });
    else {
      prev.quantity = checkedAdd(prev.quantity, count);
      if (!prev.reasons.includes(reason)) prev.reasons.push(reason);
      prev.recipeCandidateIds = [...new Set([...prev.recipeCandidateIds, ...candidates])].sort((a, b) => a - b);
    }
  }
  function needItem(id, required, stack, depth) {
    if (!required) return;
    let count = consume(id, required);
    if (!count) return;
    const candidates = db.getRecipesForItem(id)
      .filter(r => r?.type === 'crafting' && r.resultItemId === id &&
        Number.isSafeInteger(r.recipeId)).sort((a, b) => a.recipeId - b.recipeId);
    const explicit = choices.get(id);
    let selected;
    if (explicit !== undefined) {
      selected = candidates.find(r => r.recipeId === explicit);
      if (!selected) throw new TypeError(`Invalid selected recipe for Item ID ${id}`);
    } else if (candidates.length === 1 && expandSingleRecipe) {
      selected = candidates[0];
    }
    if (!selected) {
      const reason = candidates.length ? 'recipe_choice_required' : 'no_crafting_recipe';
      missing(id, count, reason, candidates.map(r => r.recipeId));
      if (candidates.length) blockers.push({ itemId: id, quantity: count, reason,
        recipeCandidateIds: candidates.map(r => r.recipeId) });
      return;
    }
    if (stack.includes(id)) {
      missing(id, count, 'cyclic_recipe_chain', [selected.recipeId]);
      blockers.push({ itemId: id, quantity: count, reason: 'cyclic_recipe_chain',
        itemChain: [...stack, id] });
      return;
    }
    if (depth >= maxDepth) {
      missing(id, count, 'maximum_depth_reached', [selected.recipeId]);
      blockers.push({ itemId: id, quantity: count, reason: 'maximum_depth_reached' });
      return;
    }
    const yieldCount = selected.resultQuantity;
    if (!Number.isSafeInteger(yieldCount) || yieldCount <= 0) {
      missing(id, count, 'unknown_crafting_yield', [selected.recipeId]);
      blockers.push({ itemId: id, quantity: count, reason: 'unknown_crafting_yield' });
      return;
    }
    const nestedBatches = Math.ceil(count / yieldCount);
    if (nestedBatches > MAX_BATCHES) throw new RangeError('Nested batches exceed safety limit');
    const totalOutput = checkedMultiply(nestedBatches, yieldCount);
    runRecipe(selected, nestedBatches, [...stack, id], depth + 1);
    const remainder = totalOutput - count;
    if (remainder) producedSurplus.set(id, checkedAdd(producedSurplus.get(id) ?? 0, remainder));
  }
  function runRecipe(recipe, count, stack, depth) {
    if (++operationCount > 10000) throw new RangeError('Material plan too large');
    if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length)
      throw new TypeError(`Missing source ingredients for recipe ${recipe.recipeId}`);
    for (let index = 0; index < recipe.ingredients.length; index++) {
      const ingredient = recipe.ingredients[index];
      const perBatch = quantity(ingredient.quantity, 'source ingredient quantity', 1);
      const total = checkedMultiply(perBatch, count);
      if (ingredient.kind === 'item') {
        needItem(itemId(ingredient.itemId, 'ingredient Item ID'), total, stack, depth);
      } else if (ingredient.kind === 'anyTag' && Number.isSafeInteger(ingredient.tagId) && ingredient.tagId > 0) {
        selectors.push({ recipeId: recipe.recipeId, ingredientIndex: index,
          kind: 'anyTag', tagId: ingredient.tagId, quantity: total,
          resolution: 'tag_item_membership_not_verified' });
      } else if (ingredient.kind === 'tagAlternatives' && Array.isArray(ingredient.tagIds) &&
        ingredient.tagIds.length > 0 && ingredient.tagIds.every(id => Number.isSafeInteger(id) && id > 0)) {
        selectors.push({ recipeId: recipe.recipeId, ingredientIndex: index,
          kind: 'tagAlternatives', tagIds: [...ingredient.tagIds], quantity: total,
          resolution: 'tag_alternatives_not_verified' });
      } else {
        throw new TypeError(`Unrecognized source ingredient selector in recipe ${recipe.recipeId}`);
      }
    }
    const yieldCount = recipe.resultQuantity == null ? null :
      quantity(recipe.resultQuantity, 'source recipe yield', 1);
    steps.push({ recipeId: recipe.recipeId, resultItemId: recipe.resultItemId,
      type: recipe.type, batches: count, resultQuantityPerBatch: yieldCount,
      plannedOutputQuantity: yieldCount === null ? null : checkedMultiply(yieldCount, count),
      conditionDigest: recipe.conditionDigest ?? null,
      eligibilityEvaluated: false });
  }
  runRecipe(root, batches, [itemId(root.resultItemId, 'result Item ID')], 0);
  return {
    schema: 'wand.db02.material-plan@1',
    source: { ...db.source },
    rootRecipeId: root.recipeId, rootResultItemId: root.resultItemId, batches,
    outputQuantity: root.resultQuantity == null ? null : checkedMultiply(batches, root.resultQuantity),
    status: blockers.length || selectors.length ? 'requires_explicit_choices' : 'static_material_quantities_resolved',
    materialsFullySpecified: !blockers.length && !selectors.length,
    recipeEligibilityEvaluated: false, acquisitionAvailabilityVerified: false,
    steps, unresolvedSelectors: selectors, blockers,
    requiredMaterials: sortedRows(needs, ([id, entry]) => ({ ...entry,
      acquisitionPaths: db.getAcquisitionPaths(id),
      possibleStalls: db.getPossibleStallsForItem(id),
      acquisitionAvailabilityVerified: false })),
    inventoryUsed: sortedRows(usedInventory, ([itemId, quantity]) => ({ itemId, quantity })),
    remainingInventory: sortedRows(inventoryLeft, ([itemId, quantity]) => ({ itemId, quantity })),
    producedSurplus: sortedRows(producedSurplus, ([itemId, quantity]) => ({ itemId, quantity })),
  };
}