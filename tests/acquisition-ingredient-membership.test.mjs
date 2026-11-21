import test from 'node:test';
import assert from 'node:assert/strict';
import { createAcquisitionDatabase } from '../src/lib/acquisition/index.mjs';
import { planRecipeRequirements } from '../src/lib/acquisition/planner.mjs';

const fields = {
  CropItemData: [302, 11, 30], FishItemData: [310, 10, 14],
  IngredientItemData: [311, 8, 13],
};
const member = (itemId, nativeClass, cookingIngredientTypeId, tagIds = []) => ({
  itemId, nativeClass, cookingIngredientTypeId, tagIds,
  source: { kind:'game_native', file:'itemlist/ActivityItem.json', definitionId:itemId,
    classEvidence:'observed_native_id_family_and_named_field_contract',
    cookingIngredientTypeField:fields[nativeClass][1], tagsField:fields[nativeClass][2] },
});
const a = member(30200000, 'CropItemData', 2001400014, [2001200019, 2001200028]);
const b = member(31000000, 'FishItemData', 2001400000, [2001200009]);
const c = member(31100000, 'IngredientItemData', 2001400006, [2001200019]);
const recipe = (id, ingredients) => ({ recipeId:id, resultItemId:30300000, resultQuantity:null,
  type:'cooking', ingredients, conditionDigest:null });
const fixed = (itemId, quantity=1) => ({kind:'item', itemId, quantity});
const any = (tagId) => ({kind:'anyTag',tagId,quantity:1});
function db(rows=[a,b,c], recipes=[recipe(2050000001,[any(2001400014),any(2001200019)])],
    overrides={}) {
  return createAcquisitionDatabase({
    manifest:{schema:'wand.src02@1',platform:'Steam',gameVersion:'1.26.2'},
    recipes, ingredientMembership:rows, ...overrides
  });
}
const requirements = p => Object.fromEntries(p.requiredMaterials.map(x=>[x.itemId,x.quantity]));

test('cooking ingredient types and native Tags are distinct selectors with exact item candidates', () => {
  const catalog=db();
  assert.equal(catalog.ingredientMembershipScope,'three_observed_cooking_native_classes');
  assert.deepEqual(catalog.getIngredientSelectorCandidates(2001400014).map(x=>x.itemId),[30200000]);
  assert.deepEqual(catalog.getIngredientSelectorCandidates(2001400000).map(x=>x.itemId),[31000000]);
  assert.deepEqual(catalog.getIngredientSelectorCandidates(2001200019).map(x=>x.itemId),[30200000,31100000]);
  assert.equal(catalog.getIngredientSelectorCandidates(2001200019)[0].matchedBy,'item_tag');
  assert.equal(catalog.getIngredientSelectorCandidates(2001400014)[0].matchedBy,'cooking_ingredient_type');
  assert.equal(catalog.getIngredientSelectorCandidates(2001400014)[0].availabilityVerified,false);
  assert.equal(catalog.getIngredientSelectorCandidates(2001200999).length,0);
});

test('without source membership data, no invented tag candidates or eligibility', () => {
  const catalog=db(null);
  assert.equal(catalog.ingredientMembershipScope,'not_supplied');
  const plan=planRecipeRequirements(catalog,2050000001);
  assert.equal(plan.materialsFullySpecified,false);
  assert.equal(plan.unresolvedSelectors[0].resolution,'tag_item_membership_not_verified');
  assert.deepEqual(plan.unresolvedSelectors[0].candidateItemIds,[]);
});

test('typed ingredient selector source fields must match IL2CPP field contract and ID family', () => {
  const tampered=structuredClone(a);tampered.source.cookingIngredientTypeField=13;
  assert.throws(()=>db([tampered]),/Invalid typed ingredient selector/);
  const badFamily=structuredClone(c);badFamily.itemId=31200000;badFamily.source.definitionId=31200000;
  assert.throws(()=>db([badFamily]),/Invalid typed ingredient selector/);
  const badType=structuredClone(b);badType.cookingIngredientTypeId=2001200009;
  assert.throws(()=>db([badType]),/Invalid typed ingredient selector/);
  const badTag=structuredClone(a);badTag.tagIds=[2001400014];
  assert.throws(()=>db([badTag]),/Invalid typed ingredient selector/);
  const duplicateTag=structuredClone(a);duplicateTag.tagIds=[2001200019,2001200019];
  assert.throws(()=>db([duplicateTag]),/Invalid typed ingredient selector/);
  assert.throws(()=>db([a,structuredClone(a)]),/duplicate itemId/);
});

test('manifest with membership ledger must contain corresponding verified data', () => {
  assert.throws(()=>db(null,[],{manifest:{schema:'wand.src02@1',gameVersion:'1.26.2',platform:'Steam',
    files:{'ingredient-selector-membership.jsonl':'a'.repeat(64)}}}),/membership dataset missing/);
  assert.throws(()=>db([a],[],{manifest:{schema:'wand.src02@1',gameVersion:'1.26.2',platform:'Steam',
    counts:{ingredientSelectorMembers:2}}}),/count does not match manifest/);
});

test('unselected tags show source-backed candidates but do not choose a material automatically', () => {
  const report=planRecipeRequirements(db(),2050000001,{batches:3});
  assert.deepEqual(requirements(report),{});
  assert.equal(report.unresolvedSelectors.length,2);
  assert.equal(report.unresolvedSelectors[0].resolution,'partial_source_candidates_selection_required');
  assert.deepEqual(report.unresolvedSelectors[0].candidateItemIds,[30200000]);
  assert.deepEqual(report.unresolvedSelectors[1].candidateItemIds,[30200000,31100000]);
  assert.equal(report.materialsFullySpecified,false);
  assert.equal(report.acquisitionAvailabilityVerified,false);
});

test('explicit source-member selection adds source-derived quantities to the material plan', () => {
  const catalog=db();
  const row=planRecipeRequirements(catalog,2050000001,{
    batches:3,ingredientChoices:{'2050000001:0':30200000,'2050000001:1':31100000},
    inventory:{30200000:1}
  });
  assert.equal(row.materialsFullySpecified,true);
  assert.equal(row.status,'static_material_quantities_resolved');
  assert.deepEqual(requirements(row),{30200000:2,31100000:3});
  assert.equal(row.selectorSelections.length,2);
  assert.equal(row.selectorSelections[0].availabilityVerified,false);
  assert.deepEqual(row.selectorSelections[1].matchedSelectorIds,[2001200019]);
  assert.deepEqual(catalog.getIngredientSelectorCandidates(2001200019).map(x=>x.itemId),[30200000,31100000]);
});

test('a wrong tag candidate, an unknown slot or an unused selection fails closed', () => {
  const catalog=db();
  assert.throws(()=>planRecipeRequirements(catalog,2050000001,{ingredientChoices:{'2050000001:0':31000000}}),/Invalid selected ingredient/);
  assert.throws(()=>planRecipeRequirements(catalog,2050000001,{ingredientChoices:{'2050000001:9':30200000}}),/Unused ingredient choice/);
  assert.throws(()=>planRecipeRequirements(catalog,2050000001,{ingredientChoices:{'2050000002:0':30200000}}),/Unused ingredient choice/);
  assert.throws(()=>planRecipeRequirements(catalog,2050000001,{ingredientChoices:{'2050000001:01':30200000}}),/Invalid ingredient slot key/);
  assert.throws(()=>planRecipeRequirements(catalog,2050000001,{ingredientChoices:{'2050000001:0':0}}),/Invalid ingredient choice/);
  assert.throws(()=>planRecipeRequirements(db(null),2050000001,{ingredientChoices:{'2050000001:0':30200000}}),/Invalid selected ingredient/);
});

test('tagAlternatives forms a union with no implicit category/availability inference', () => {
  const rec=recipe(2050000002,[{kind:'tagAlternatives',tagIds:[2001400014,2001400000],quantity:1}]);
  const catalog=db([a,b,c],[rec]);
  const unselected=planRecipeRequirements(catalog,2050000002);
  assert.deepEqual(unselected.unresolvedSelectors[0].candidateItemIds,[30200000,31000000]);
  assert.equal(unselected.materialsFullySpecified,false);
  const selected=planRecipeRequirements(catalog,2050000002,{ingredientChoices:{'2050000002:0':31000000}});
  assert.deepEqual(requirements(selected),{31000000:1});
  assert.equal(selected.materialsFullySpecified,true);
});

test('future explicit item alternatives use only enumerated source IDs', () => {
  const rec=recipe(2050000003,[{kind:'itemAlternatives',itemIds:[31100000,30200000],quantity:1}]);
  const catalog=db(null,[rec]);
  const plan=planRecipeRequirements(catalog,2050000003);
  assert.deepEqual(plan.unresolvedSelectors[0].candidateItemIds,[30200000,31100000]);
  const chosen=planRecipeRequirements(catalog,2050000003,{ingredientChoices:{'2050000003:0':31100000}});
  assert.deepEqual(requirements(chosen),{31100000:1});
  assert.throws(()=>planRecipeRequirements(catalog,2050000003,{ingredientChoices:{'2050000003:0':31000000}}),/Invalid selected ingredient/);
});

test('unknown tags never claim no game item exists', () => {
  const r=recipe(2050000004,[any(2001200999)]);
  const plan=planRecipeRequirements(db([a,b,c],[r]),2050000004);
  assert.equal(plan.unresolvedSelectors[0].resolution,'not_found_in_partial_native_cooking_index');
  assert.equal(plan.unresolvedSelectors[0].membershipCoverage,'three_observed_cooking_native_classes');
  assert.equal(plan.materialsFullySpecified,false);
});