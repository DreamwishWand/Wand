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
function selectorChoices(value) {
  if (value == null) return new Map();
  if (typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError('Invalid ingredient choices');
  }
  const choices = new Map();
  for (const [slot, target] of Object.entries(value)) {
    if (!/^[1-9][0-9]*:(?:0|[1-9][0-9]*)$/.test(slot) ||
        !Number.isSafeInteger(Number(slot.split(':')[0])) ||
        !Number.isSafeInteger(Number(slot.split(':')[1]))) {
      throw new TypeError('Invalid ingredient slot key');
    }
    choices.set(slot, itemId(target, 'ingredient choice Item ID'));
  }
  return choices;
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
  batches = 1, inventory = {}, recipeChoices = {}, ingredientChoices = {},
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
  const selectedIngredients = selectorChoices(ingredientChoices);
  const usedIngredientChoiceKeys = new Set();
  const selectorSelections = [];
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
    const membershipAvailable = db.ingredientMembershipScope === 'three_observed_cooking_native_classes';
    const candidatesFor = selectors => {
      if (!membershipAvailable || typeof db.getIngredientSelectorCandidates !== 'function') return [];
      const candidates = new Map();
      for (const selectorId of selectors) for (const member of db.getIngredientSelectorCandidates(selectorId)) {
        if (!Number.isSafeInteger(member.itemId) || member.itemId <= 0) {
          throw new TypeError('Invalid source-backed selector candidate');
        }
        if (!candidates.has(member.itemId)) candidates.set(member.itemId, new Set());
        candidates.get(member.itemId).add(selectorId);
      }
      return [...candidates.entries()].sort(([a], [b]) => a-b)
        .map(([id, tags]) => ({itemId:id,matchedSelectorIds:[...tags].sort((a,b)=>a-b)}));
    };
    for (let index = 0; index < recipe.ingredients.length; index++) {
      const ingredient = recipe.ingredients[index];
      const perBatch = quantity(ingredient.quantity, 'source ingredient quantity', 1);
      const total = checkedMultiply(perBatch, count);
      if (ingredient.kind === 'item') {
        needItem(itemId(ingredient.itemId, 'ingredient Item ID'), total, stack, depth);
      } else if (ingredient.kind === 'anyTag' || ingredient.kind === 'tagAlternatives' ||
                 ingredient.kind === 'itemAlternatives') {
        let selectorIds = [];
        let alternatives = [];
        if (ingredient.kind === 'anyTag') {
          selectorIds = [itemId(ingredient.tagId, 'source selector ID')];
        } else if (ingredient.kind === 'tagAlternatives') {
          if (!Array.isArray(ingredient.tagIds) || !ingredient.tagIds.length) {
            throw new TypeError('Empty tag selector alternatives');
          }
          selectorIds = ingredient.tagIds.map(id => itemId(id, 'source selector ID'));
        } else {
          if (!Array.isArray(ingredient.itemIds) || !ingredient.itemIds.length) {
            throw new TypeError('Empty item selector alternatives');
          }
          alternatives = ingredient.itemIds.map(id => itemId(id, 'source alternative Item ID'));
        }
        const candidates = ingredient.kind === 'itemAlternatives' ?
          [...new Set(alternatives)].sort((a,b)=>a-b).map(itemId => ({itemId,matchedSelectorIds:[]})) :
          candidatesFor(selectorIds);
        const key = `${recipe.recipeId}:${index}`;
        const pick = selectedIngredients.get(key);
        if (pick !== undefined) {
          usedIngredientChoiceKeys.add(key);
          const candidate = candidates.find(x => x.itemId === pick);
          if (!candidate) throw new TypeError(`Invalid selected ingredient for ${key}`);
          needItem(pick, total, stack, depth);
          selectorSelections.push({recipeId:recipe.recipeId,ingredientIndex:index,
            itemId:pick,quantity:total,matchedSelectorIds:candidate.matchedSelectorIds,
            availabilityVerified:false});
        } else {
          selectors.push({recipeId:recipe.recipeId,ingredientIndex:index,
            kind:ingredient.kind,
            ...(ingredient.kind === 'anyTag' ? {tagId:selectorIds[0]} :
              ingredient.kind === 'tagAlternatives' ? {tagIds:selectorIds} : {itemIds:alternatives}),
            quantity:total, candidateItemIds:candidates.map(x=>x.itemId),
            resolution:ingredient.kind === 'itemAlternatives' ? 'explicit_item_alternative_choice_required' :
              !membershipAvailable ? 'tag_item_membership_not_verified' :
              candidates.length ? 'partial_source_candidates_selection_required' :
                'not_found_in_partial_native_cooking_index',
            membershipCoverage:membershipAvailable ? 'three_observed_cooking_native_classes' : 'not_supplied',
            availabilityVerified:false});
        }
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
  if (usedIngredientChoiceKeys.size !== selectedIngredients.size) {
    throw new TypeError('Unused ingredient choice (not a source ingredient slot)');
  }
  return {
    schema: 'wand.db02.material-plan@1',
    source: { ...db.source },
    rootRecipeId: root.recipeId, rootResultItemId: root.resultItemId, batches,
    outputQuantity: root.resultQuantity == null ? null : checkedMultiply(batches, root.resultQuantity),
    status: blockers.length || selectors.length ? 'requires_explicit_choices' : 'static_material_quantities_resolved',
    materialsFullySpecified: !blockers.length && !selectors.length,
    recipeEligibilityEvaluated: false, acquisitionAvailabilityVerified: false,
    steps, unresolvedSelectors: selectors, selectorSelections, blockers,
    requiredMaterials: sortedRows(needs, ([id, entry]) => ({ ...entry,
      acquisitionPaths: db.getAcquisitionPaths(id),
      possibleStalls: db.getPossibleStallsForItem(id),
      acquisitionAvailabilityVerified: false })),
    inventoryUsed: sortedRows(usedInventory, ([itemId, quantity]) => ({ itemId, quantity })),
    remainingInventory: sortedRows(inventoryLeft, ([itemId, quantity]) => ({ itemId, quantity })),
    producedSurplus: sortedRows(producedSurplus, ([itemId, quantity]) => ({ itemId, quantity })),
  };
}