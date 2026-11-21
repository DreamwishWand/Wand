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
 * Build a single deterministic plan for a basket of explicit source recipes.
 * Identical goals are combined before calculation; all goals share one
 * inventory, one produced-surplus pool and one set of explicit decisions.
 * Nothing about the basket proves player progress or recipe availability.
 */
function validateDatabase(db) {
  if (!db || typeof db.getRecipe !== 'function' ||
      typeof db.getRecipesForItem !== 'function' ||
      typeof db.getAcquisitionPaths !== 'function' ||
      typeof db.getPossibleStallsForItem !== 'function' ||
      typeof db.source?.platform !== 'string' || !db.source.gameVersion) {
    throw new TypeError('Verified SRC-02 acquisition database required');
  }
}

/** Explicit source recipe executions (legacy basket contract). */
export function planRecipeBasket(db, goals, options = {}) {
  validateDatabase(db);
  if (!Array.isArray(goals) || !goals.length || goals.length > 200)
    throw new RangeError('Recipe basket must contain 1 to 200 goals');
  const goalCounts = new Map();
  for (const goal of goals) {
    if (!goal || typeof goal !== 'object' || Array.isArray(goal) ||
        Object.getPrototypeOf(goal) !== Object.prototype ||
        Object.keys(goal).some(k => k !== 'recipeId' && k !== 'batches')) {
      throw new TypeError('Invalid recipe basket goal');
    }
    const id = itemId(goal.recipeId, 'recipe ID');
    const batches = quantity(goal.batches ?? 1, 'batch count', 1);
    if (batches > MAX_BATCHES) throw new RangeError('Batch count exceeds safety limit');
    const combined = checkedAdd(goalCounts.get(id) ?? 0, batches);
    if (combined > MAX_BATCHES) throw new RangeError('Combined batches exceed safety limit');
    goalCounts.set(id, combined);
  }
  const targets = [...goalCounts.entries()].sort(([a], [b]) => a - b).map(([id, batches]) => {
    const recipe = db.getRecipe(id);
    if (!recipe) throw new RangeError('Unknown source-backed recipe');
    if (!['cooking', 'crafting'].includes(recipe.type)) throw new TypeError('Unsupported recipe type');
    if (itemId(recipe.resultItemId, 'result Item ID') !== recipe.resultItemId)
      throw new TypeError('Invalid source result Item ID');
    const count = recipe.resultQuantity === null || recipe.resultQuantity === undefined ? null :
      quantity(recipe.resultQuantity, 'source recipe yield', 1);
    return { recipe, recipeId: id, resultItemId: recipe.resultItemId,
      batches, outputQuantity: count === null ? null : checkedMultiply(batches, count) };
  });
  return planCore(db, targets, 'recipes', options);
}

/**
 * Collection/Guide entrypoint: specify native Item IDs and quantities, not
 * recipe executions. Only exact, known-yield crafting recipes may be expanded.
 * Cooking output yield is unknown in SRC-02; this remains blocked and explicit
 * recipe batches can instead be simulated through planRecipeBasket().
 */
export function planItemBasket(db, goals, options = {}) {
  validateDatabase(db);
  if (!Array.isArray(goals) || !goals.length || goals.length > 200)
    throw new RangeError('Item basket must contain 1 to 200 goals');
  const goalCounts = new Map();
  for (const goal of goals) {
    if (!goal || typeof goal !== 'object' || Array.isArray(goal) ||
        Object.getPrototypeOf(goal) !== Object.prototype ||
        Object.keys(goal).some(k => k !== 'itemId' && k !== 'quantity')) {
      throw new TypeError('Invalid item basket goal');
    }
    const id = itemId(goal.itemId, 'target Item ID');
    const count = quantity(goal.quantity ?? 1, 'target quantity', 1);
    if (count > MAX_BATCHES) throw new RangeError('Target quantity exceeds safety limit');
    const combined = checkedAdd(goalCounts.get(id) ?? 0, count);
    if (combined > MAX_BATCHES) throw new RangeError('Combined target quantity exceeds safety limit');
    goalCounts.set(id, combined);
  }
  const targets = [...goalCounts.entries()].sort(([a], [b]) => a - b)
    .map(([id, count]) => ({itemId:id,quantity:count}));
  return planCore(db, targets, 'items', options);
}

function planCore(db, targets, mode, {
  inventory = {}, recipeChoices = {}, ingredientChoices = {},
  expandSingleRecipe = true, maxDepth = 12,
} = {}) {
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
      // A requested prepared meal cannot be translated from Item count into
      // batches because native cooking recipes expose no verified yield.
      // Never imply a single batch supplies the requested meal quantity.
      const cooking = mode === 'items' && stack.length === 0 && !candidates.length ?
        db.getRecipesForItem(id).filter(r => r?.type === 'cooking' && r.resultItemId === id &&
          Number.isSafeInteger(r.recipeId)).sort((a,b) => a.recipeId - b.recipeId) : [];
      const reason = candidates.length ? 'recipe_choice_required' :
        cooking.length ? 'cooking_yield_unverified' : 'no_crafting_recipe';
      const recipeIds = (candidates.length ? candidates : cooking).map(r => r.recipeId);
      missing(id, count, reason, recipeIds);
      if (recipeIds.length) blockers.push({ itemId: id, quantity: count, reason,
        recipeCandidateIds: recipeIds });
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
  for (const target of targets) {
    if (mode === 'recipes') runRecipe(target.recipe, target.batches, [target.resultItemId], 0);
    else needItem(target.itemId, target.quantity, [], 0);
  }
  if (usedIngredientChoiceKeys.size !== selectedIngredients.size) {
    throw new TypeError('Unused ingredient choice (not a source ingredient slot)');
  }
  return {
    schema: mode === 'recipes' ? 'wand.db02.material-basket@1' : 'wand.db02.item-basket@1',
    source: { ...db.source },
    goals: mode === 'recipes' ?
      targets.map(({recipeId, resultItemId, batches, outputQuantity}) =>
        ({recipeId, resultItemId, batches, outputQuantity})) :
      targets.map(({itemId, quantity}) => ({itemId, quantity})),
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

/** Backward-compatible single-recipe view of the shared basket engine. */
export function planRecipeRequirements(db, recipeId, options = {}) {
  const { batches = 1, ...rest } = options;
  const plan = planRecipeBasket(db, [{ recipeId, batches }], rest);
  const [goal] = plan.goals;
  const { goals, ...fields } = plan;
  return {
    ...fields, schema: 'wand.db02.material-plan@1',
    rootRecipeId: goal.recipeId, rootResultItemId: goal.resultItemId,
    batches: goal.batches, outputQuantity: goal.outputQuantity,
  };
}

/** Convenience single-item view, analogous to planRecipeRequirements(). */
export function planItemRequirements(db, id, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('Invalid item plan options');
  const { quantity: requested = 1, ...rest } = options;
  const report = planItemBasket(db, [{itemId:id, quantity:requested}], rest);
  const [goal] = report.goals;
  const {goals, ...fields} = report;
  return { ...fields, schema:'wand.db02.item-plan@1',
    targetItemId:goal.itemId, targetQuantity:goal.quantity };
}