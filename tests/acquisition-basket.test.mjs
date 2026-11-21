import test from 'node:test';
import assert from 'node:assert/strict';
import { createAcquisitionDatabase } from '../src/lib/acquisition/index.mjs';
import { planRecipeBasket, planRecipeRequirements } from '../src/lib/acquisition/planner.mjs';

const recipe = (recipeId, resultItemId, ingredients, resultQuantity = 1, type = 'crafting') =>
  ({ recipeId, resultItemId, ingredients, resultQuantity, type, conditionDigest: null });
const item = (itemId, quantity = 1) => ({ kind:'item', itemId, quantity });
function fixture(recipes, extras = {}) {
  const usedBy = new Map(), producedBy = new Map();
  for (const r of recipes) {
    if (!producedBy.has(r.resultItemId)) producedBy.set(r.resultItemId, []);
    producedBy.get(r.resultItemId).push(r.recipeId);
    for (const part of r.ingredients) if (part.kind === 'item') {
      if (!usedBy.has(part.itemId)) usedBy.set(part.itemId, []);
      usedBy.get(part.itemId).push(r.recipeId);
    }
  }
  const ids = new Set([...producedBy.keys(), ...usedBy.keys()]);
  return createAcquisitionDatabase({
    manifest: { schema:'wand.src02@1', platform:'Steam', gameVersion:'1.26.2' },
    recipes, relatedItems: [...ids].map(itemId => ({itemId, inSrc01:true,
      recipesProducedBy:producedBy.get(itemId) ?? [],recipesUsedBy:usedBy.get(itemId) ?? [],
      acquisitionPaths:[],growPathsForSeed:[]})), ...extras
  });
}
const required = report => Object.fromEntries(report.requiredMaterials.map(r=>[r.itemId,r.quantity]));
const sample = () => fixture([
  recipe(11, 101, [item(201,3), item(202,1)]),
  recipe(12, 102, [item(201,2), item(203,2)]),
  recipe(13, 201, [item(301,2)],4),
]);

test('basket pools common stock and intermediate surplus across distinct goals', () => {
  const result = planRecipeBasket(sample(), [{recipeId:11},{recipeId:12,batches:2}]);
  assert.equal(result.schema, 'wand.db02.material-basket@1');
  assert.deepEqual(result.goals, [
    {recipeId:11,resultItemId:101,batches:1,outputQuantity:1},
    {recipeId:12,resultItemId:102,batches:2,outputQuantity:2}
  ]);
  // 3+4=7 of intermediate 201 => two batches yielding 8; not a third batch.
  assert.deepEqual(required(result), {202:1,203:4,301:4});
  assert.deepEqual(result.steps.map(s=>[s.recipeId,s.batches]), [[13,1],[11,1],[13,1],[12,2]]);
  assert.deepEqual(result.producedSurplus, [{itemId:201,quantity:1}]);
  assert.equal(result.materialsFullySpecified, true);
});

test('basket deducts caller-supplied hypothetical inventory exactly once', () => {
  const result = planRecipeBasket(sample(), [{recipeId:11},{recipeId:12}], {
    inventory: {301:3,202:5,203:1,777:2}
  });
  assert.deepEqual(required(result), {203:1,301:1});
  assert.deepEqual(result.inventoryUsed, [
    {itemId:202,quantity:1},{itemId:203,quantity:1},{itemId:301,quantity:3}
  ]);
  assert.deepEqual(result.remainingInventory.find(r=>r.itemId===777), {itemId:777,quantity:2});
  assert.equal(result.acquisitionAvailabilityVerified,false);
  assert.equal(result.recipeEligibilityEvaluated,false);
});

test('same recipe repeated is aggregated before scaling and source order normalized', () => {
  const catalog=sample();
  const a = planRecipeBasket(catalog, [
    {recipeId:12,batches:1},{recipeId:11,batches:2},{recipeId:'12',batches:2}
  ]);
  const b = planRecipeBasket(catalog, [{recipeId:11,batches:2},{recipeId:12,batches:3}]);
  assert.deepEqual(a,b);
  assert.deepEqual(a.goals.map(g=>[g.recipeId,g.batches]),[[11,2],[12,3]]);
});

test('basket is one shared planning context, not a concatenation of single plans', () => {
  const catalog=sample();
  const a=planRecipeRequirements(catalog,11);
  const b=planRecipeRequirements(catalog,12);
  const basket=planRecipeBasket(catalog,[{recipeId:11},{recipeId:12}]);
  assert.equal(a.steps.filter(x=>x.recipeId===13).length,1);
  assert.equal(b.steps.filter(x=>x.recipeId===13).length,1);
  assert.equal(basket.steps.filter(x=>x.recipeId===13).length,2);
  // 3+2=5 of 201 -> two batches in either approach, but basket can reuse their surplus.
  assert.deepEqual(required(basket), {202:1,203:2,301:4});
  assert.equal(basket.producedSurplus[0].quantity,3);
});

test('shared ingredient choices apply to every execution of the same recipe', () => {
  const catalog=fixture([
    recipe(20, 200, [{kind:'itemAlternatives',itemIds:[301,302],quantity:2}]),
    recipe(21, 201, [item(200),item(401)]),
  ]);
  const pending=planRecipeBasket(catalog,[{recipeId:20,batches:2},{recipeId:21}]);
  assert.equal(pending.unresolvedSelectors.length,2);
  assert.equal(pending.materialsFullySpecified,false);
  const chosen=planRecipeBasket(catalog,[{recipeId:20,batches:2},{recipeId:21}], {
    ingredientChoices:{'20:0':301}
  });
  assert.deepEqual(required(chosen),{301:6,401:1});
  assert.equal(chosen.materialsFullySpecified,true);
  assert.equal(chosen.selectorSelections.length,2);
});

test('ambiguous nested recipes remain unresolved without an explicit choice', () => {
  const catalog=fixture([
    recipe(11,101,[item(201)]),recipe(12,102,[item(201)]),
    recipe(13,201,[item(301)]),recipe(14,201,[item(302)]),
  ]);
  const pending=planRecipeBasket(catalog,[{recipeId:11},{recipeId:12}]);
  assert.equal(pending.status,'requires_explicit_choices');
  assert.deepEqual(required(pending),{201:2});
  assert.deepEqual(pending.blockers.map(x=>x.recipeCandidateIds),[[13,14],[13,14]]);
  const chosen=planRecipeBasket(catalog,[{recipeId:11},{recipeId:12}],{recipeChoices:{201:14}});
  assert.deepEqual(required(chosen),{302:2});
  assert.equal(chosen.materialsFullySpecified,true);
});

test('unknown cooking yield remains null per goal rather than one fabricated item', () => {
  const catalog=fixture([recipe(11,101,[item(201,2)],null,'cooking'),recipe(12,102,[item(202)],3)]);
  const result=planRecipeBasket(catalog,[{recipeId:11,batches:3},{recipeId:12,batches:2}]);
  assert.deepEqual(result.goals.map(x=>x.outputQuantity),[null,6]);
  assert.deepEqual(required(result),{201:6,202:2});
});

test('valid single-goal basket and legacy single-recipe API return same material lists', () => {
  const catalog=sample();
  const basket=planRecipeBasket(catalog,[{recipeId:11,batches:2}], {inventory:{301:3}});
  const old=planRecipeRequirements(catalog,11,{batches:2,inventory:{301:3}});
  assert.deepEqual(basket.requiredMaterials,old.requiredMaterials);
  assert.deepEqual(basket.remainingInventory,old.remainingInventory);
  assert.deepEqual(basket.steps,old.steps);
  assert.deepEqual(basket.goals[0],{
    recipeId:old.rootRecipeId,resultItemId:old.rootResultItemId,
    batches:old.batches,outputQuantity:old.outputQuantity
  });
  assert.equal(old.schema,'wand.db02.material-plan@1');
});

test('rejects malformed, unknown, excessive and unsafe basket goals', () => {
  const catalog=sample();
  for (const goals of [[],null,{},[{}],[{recipeId:0}],[{recipeId:'001'}],
    [{recipeId:11,batches:0}],[{recipeId:11,batches:-1}],
    [{recipeId:11,batches:1_000_001}],[{recipeId:11,children:[12]}]]) {
    assert.throws(()=>planRecipeBasket(catalog,goals));
  }
  assert.throws(()=>planRecipeBasket(catalog,[{recipeId:999}]),/Unknown source-backed/);
  assert.throws(()=>planRecipeBasket(catalog,Array.from({length:201},()=>({recipeId:11}))),/200 goals/);
  assert.throws(()=>planRecipeBasket(catalog,[{recipeId:11,batches:600000},{recipeId:11,batches:600000}]),/Combined batches/);
  assert.throws(()=>planRecipeBasket(catalog,[{recipeId:11}],{ingredientChoices:{'11:0':123}}),/Unused ingredient choice/);
});

test('basket does not mutate any source-backed recipe or inventory object', () => {
  const catalog=sample(), source=structuredClone(catalog.getRecipe(11));
  const inventory={301:2};
  planRecipeBasket(catalog,[{recipeId:11},{recipeId:12}],{inventory});
  assert.deepEqual(catalog.getRecipe(11),source);
  assert.deepEqual(inventory,{301:2});
});