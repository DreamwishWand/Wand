import test from 'node:test';
import assert from 'node:assert/strict';
import { createAcquisitionDatabase } from '../src/lib/acquisition/index.mjs';
import { planRecipeRequirements } from '../src/lib/acquisition/planner.mjs';

const fixed = (recipeId, resultItemId, ingredients, resultQuantity = 1, type = 'crafting') =>
  ({ recipeId, resultItemId, type, resultQuantity, conditionDigest: null, ingredients });
const item = (itemId, quantity = 1) => ({ kind: 'item', itemId, quantity });
function db(recipes) {
  const byResult = new Map();
  const byUsed = new Map();
  for (const row of recipes) {
    if (!byResult.has(row.resultItemId)) byResult.set(row.resultItemId, []);
    byResult.get(row.resultItemId).push(row.recipeId);
    for (const ing of row.ingredients) if (ing.kind === 'item') {
      if (!byUsed.has(ing.itemId)) byUsed.set(ing.itemId, []);
      byUsed.get(ing.itemId).push(row.recipeId);
    }
  }
  const ids = [...new Set([...byResult.keys(), ...byUsed.keys()])];
  return createAcquisitionDatabase({
    manifest: { schema: 'wand.src02@1', platform: 'Steam', gameVersion: '1.26.2' },
    recipes,
    relatedItems: ids.map(itemId => ({ itemId, inSrc01: true,
      recipesProducedBy: byResult.get(itemId) ?? [], recipesUsedBy: byUsed.get(itemId) ?? [],
      acquisitionPaths: [], growPathsForSeed: [] })),
  });
}
const qty = report => Object.fromEntries(report.requiredMaterials.map(r => [r.itemId, r.quantity]));

test('multi-stage crafting, one shared material and per-batch multiplication', () => {
  const catalog = db([
    fixed(101, 501, [item(601, 3), item(602, 1), item(603, 1)]),
    fixed(102, 601, [item(701, 5), item(704, 1)]),
    fixed(103, 602, [item(702, 5), item(704, 1)]),
  ]);
  const report = planRecipeRequirements(catalog, 101, { batches: 2 });
  assert.deepEqual(qty(report), { 603: 2, 701: 30, 702: 10, 704: 8 });
  assert.deepEqual(report.steps.map(x => [x.recipeId, x.batches]), [[102, 6], [103, 2], [101, 2]]);
  assert.equal(report.materialsFullySpecified, true);
  assert.equal(report.recipeEligibilityEvaluated, false);
  assert.equal(report.acquisitionAvailabilityVerified, false);
});

test('inventory is hypothetical, consumed once, and source records remain unchanged', () => {
  const catalog = db([fixed(11, 101, [item(102, 4), item(103, 1)]),
    fixed(12, 102, [item(104, 2)], 3)]);
  const before = structuredClone(catalog.getRecipe(11));
  const report = planRecipeRequirements(catalog, 11, {
    batches: 2, inventory: { 102: 2, 104: 1, 103: 3, 999: 5 }
  });
  assert.deepEqual(qty(report), {104: 3}); // 6 missing 102 -> two batches -> 4x 104 minus one
  assert.deepEqual(report.inventoryUsed, [{itemId:102,quantity:2},{itemId:103,quantity:2},{itemId:104,quantity:1}]);
  assert.deepEqual(report.remainingInventory, [
    {itemId:102,quantity:0},{itemId:103,quantity:1},
    {itemId:104,quantity:0},{itemId:999,quantity:5}]);
  assert.deepEqual(catalog.getRecipe(11), before);
});

test('craft output surplus prevents repeated nested craft', () => {
  const catalog = db([fixed(11,101,[item(201,3),item(203,1)]),
    fixed(12,203,[item(201,1)]), fixed(13,201,[item(202,2)],4)]);
  // Initial need 3 of 201 produces four, consuming three; 203 consumes the remaining one.
  const report = planRecipeRequirements(catalog,11);
  assert.deepEqual(report.steps.map(x=>[x.recipeId,x.batches]),[[13,1],[12,1],[11,1]]);
  assert.deepEqual(qty(report),{202:2});
  assert.deepEqual(report.producedSurplus,[{itemId:201,quantity:0}]);
});

test('ambiguous recipes must be chosen and never imply availability', () => {
  const catalog = db([fixed(11,101,[item(201,2)]),fixed(12,201,[item(301)]),fixed(13,201,[item(302)])]);
  const pending = planRecipeRequirements(catalog,11);
  assert.equal(pending.materialsFullySpecified,false);
  assert.deepEqual(qty(pending),{201:2});
  assert.deepEqual(pending.blockers[0].recipeCandidateIds,[12,13]);
  const selected=planRecipeRequirements(catalog,11,{recipeChoices:{201:13}});
  assert.deepEqual(qty(selected),{302:2});
  assert.equal(selected.materialsFullySpecified,true);
  assert.throws(()=>planRecipeRequirements(catalog,11,{recipeChoices:{201:999}}),/Invalid selected recipe/);
});

test('cooking tag and tag alternative ingredients remain unresolved', () => {
  const catalog = db([
    fixed(11,101,[item(201),{kind:'anyTag',tagId:24001,quantity:1},
      {kind:'tagAlternatives',tagIds:[24001,24002],quantity:2}],null,'cooking')
  ]);
  const result=planRecipeRequirements(catalog,11,{batches:3});
  assert.deepEqual(qty(result),{201:3});
  assert.deepEqual(result.unresolvedSelectors.map(x=>[x.kind,x.quantity]),[['anyTag',3],['tagAlternatives',6]]);
  assert.equal(result.outputQuantity,null);
  assert.equal(result.materialsFullySpecified,false);
});

test('cycles are retained as blocked demand instead of infinite recursion', () => {
  const catalog = db([fixed(11,101,[item(201)]),fixed(12,201,[item(202)]),fixed(13,202,[item(201)])]);
  const result=planRecipeRequirements(catalog,11);
  assert.deepEqual(qty(result),{201:1});
  assert.equal(result.blockers[0].reason,'cyclic_recipe_chain');
  assert.equal(result.materialsFullySpecified,false);
});

test('maxDepth conservatively retains unexpanded material', () => {
  const catalog = db([fixed(11,101,[item(201)]),fixed(12,201,[item(301)]),fixed(13,301,[item(401)])]);
  const report=planRecipeRequirements(catalog,11,{maxDepth:1});
  assert.deepEqual(qty(report),{301:1});
  assert.equal(report.blockers[0].reason,'maximum_depth_reached');
});

test('source quantity overflow and malformed options fail closed', () => {
  const catalog=db([fixed(11,101,[item(201, Number.MAX_SAFE_INTEGER)])]);
  assert.throws(()=>planRecipeRequirements(catalog,11,{batches:2}),/Unsafe material quantity/);
  assert.throws(()=>planRecipeRequirements(catalog,11,{batches:0}),/batch/);
  assert.throws(()=>planRecipeRequirements(catalog,11,{batches:1_000_001}),/safety limit/);
  assert.throws(()=>planRecipeRequirements(catalog,11,{inventory:{'0201':2}}),/inventory Item ID/);
  assert.throws(()=>planRecipeRequirements(catalog,11,{inventory:{201:-1}}),/inventory quantity/);
  assert.throws(()=>planRecipeRequirements(catalog,11,{maxDepth:50}),/maximum recursion depth/);
  assert.throws(()=>planRecipeRequirements(catalog,999),/Unknown source-backed/);
});

test('selected non-crafting recipe is not used as nested source', () => {
  const catalog=db([fixed(11,101,[item(201)]),fixed(12,201,[item(301)],null,'cooking')]);
  const report=planRecipeRequirements(catalog,11);
  assert.deepEqual(qty(report),{201:1});
  assert.deepEqual(report.blockers,[]);
  assert.equal(report.materialsFullySpecified,true);
});

test('batch rounding preserves unused byproducts without claiming extra acquisition', () => {
  const catalog = db([fixed(11,101,[item(201,5)]),fixed(12,201,[item(301,2)],4)]);
  const result = planRecipeRequirements(catalog,11);
  assert.deepEqual(qty(result),{301:4});
  assert.deepEqual(result.steps.map(x=>[x.recipeId,x.batches,x.plannedOutputQuantity]),[[12,2,8],[11,1,1]]);
  assert.deepEqual(result.producedSurplus,[{itemId:201,quantity:3}]);
});

test('explicit expansion-disabled keeps ingredient and lists the one candidate', () => {
  const catalog=db([fixed(11,101,[item(201,2)]),fixed(12,201,[item(301)])]);
  const result=planRecipeRequirements(catalog,11,{expandSingleRecipe:false});
  assert.deepEqual(qty(result),{201:2});
  assert.equal(result.status,'requires_explicit_choices');
  assert.deepEqual(result.blockers[0].recipeCandidateIds,[12]);
  assert.deepEqual(planRecipeRequirements(catalog,11,{recipeChoices:{201:12},expandSingleRecipe:false}).requiredMaterials.map(x=>x.itemId),[301]);
});

test('candidate acquisition sources never imply current sale or availability', () => {
  const catalog = createAcquisitionDatabase({
    manifest:{schema:'wand.src02@1',platform:'Steam',gameVersion:'1.26.2'},
    recipes:[fixed(11,101,[item(201)])],
    acquisitions:[{pathId:'mining:12',itemId:201,type:'mining'}],
    relatedItems:[
      {itemId:101,recipesProducedBy:[11],recipesUsedBy:[],acquisitionPaths:[]},
      {itemId:201,recipesProducedBy:[],recipesUsedBy:[11],acquisitionPaths:['mining:12']}
    ]
  });
  const report = planRecipeRequirements(catalog,11);
  assert.equal(report.requiredMaterials[0].acquisitionPaths[0].type,'mining');
  assert.equal(report.requiredMaterials[0].acquisitionAvailabilityVerified,false);
  assert.equal(report.acquisitionAvailabilityVerified,false);
});