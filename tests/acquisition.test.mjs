import test from 'node:test';
import assert from 'node:assert/strict';
import { createAcquisitionDatabase } from '../src/lib/acquisition/index.mjs';

const sample = () => ({
  manifest: { schema: 'wand.src02@1', platform: 'Steam', gameVersion: '1.26.2' },
  recipes: [{ recipeId: 2050300004, resultItemId: 31700009, type: 'crafting' }],
  acquisitions: [{ pathId: 'mining:2050200001', itemId: 31700017, type: 'mining' },
    { pathId: 'growing:30400010', itemId: 30200000, seedItemId: 30400010, type: 'growing' }],
  relatedItems: [
    { itemId: 30400010, inSrc01: true, recipesProducedBy: [], recipesUsedBy: [], acquisitionPaths: [], growPathsForSeed: ['growing:30400010'] },
    { itemId: 30200000, inSrc01: true, recipesProducedBy: [], recipesUsedBy: [], acquisitionPaths: ['growing:30400010'] },
    { itemId: 31700009, inSrc01: true, recipesProducedBy: [2050300004], recipesUsedBy: [], acquisitionPaths: [] },
    { itemId: 31700017, inSrc01: true, recipesProducedBy: [], recipesUsedBy: [2050300004], acquisitionPaths: ['mining:2050200001'] },
  ],
});

test('answers how to make a native Item ID', () => {
  const db = createAcquisitionDatabase(sample());
  assert.equal(db.getRecipesForItem(31700009)[0].recipeId, 2050300004);
  assert.equal(db.getAcquisitionPaths(31700017)[0].type, 'mining');
  assert.equal(db.getItem(31700017).usedBy[0].recipeId, 2050300004);
  assert.equal(db.getItem(30400010).growsInto[0].itemId, 30200000);
  assert.equal(db.getAcquisitionPaths(30200000)[0].seedItemId, 30400010);
});

test('empty source is unresolved, never claimed not obtainable', () => {
  const db = createAcquisitionDatabase(sample());
  assert.equal(db.getItem(12345).status, 'unresolved_or_no_verified_link');
  assert.equal(db.getItem(-1), null);
});

test('fails closed for invalid schema, duplicate IDs, and broken relation', () => {
  const a = sample(); a.manifest.schema = 'other';
  assert.throws(() => createAcquisitionDatabase(a));
  const b = sample(); b.recipes.push(b.recipes[0]);
  assert.throws(() => createAcquisitionDatabase(b));
  const c = sample(); c.relatedItems[0].recipesProducedBy = [1];
  assert.throws(() => createAcquisitionDatabase(c));
});


test('static stall loot is a candidate, not a current sales offer', () => {
  const input = sample();
  input.lootTables = [{ lootTableId: 2090000056, groups: [
    { index: 0, candidates: [
      { itemId: 31700017, conditionDigest: null },
      { itemId: 31700017, conditionDigest: 'opaque' },
    ], hasDynamicTypeFilters: false },
  ] }];
  input.stallSources = [{ stallId: 20100000, nameKey: 'Gardening_Stall2_Meadow',
    shopDataKey: 'GardeningStall', slotLootTableIds: [2090000056, 2090000056],
    inventoryStatus: 'static_loot_candidates_only' }];
  const db = createAcquisitionDatabase(input);
  const slots = db.getPossibleStallSlotsForItem(31700017);
  assert.equal(slots.length, 2); // preserve repeated slot references
  assert.deepEqual(slots.map(x => x.slotIndex), [0, 1]);
  assert.equal(slots[0].candidateGroupIndexes.length, 1); // duplicate within group deduped
  assert.equal(slots[0].hasConditionalFilter, true);
  const matches = db.getPossibleStallsForItem(31700017);
  assert.equal(matches.length, 1); // UI-level stall deduplication
  assert.equal(matches[0].slots.length, 2);
  assert.equal(matches[0].status, 'static_candidate_not_verified_for_sale');
  assert.equal(db.getItem(31700017).shopOffers.length, 0);
  assert.equal(db.getItem(31700017).possibleStalls.length, 1);
  assert.equal(db.getStallSource(20100000).shopDataKey, 'GardeningStall');
});

test('fails closed when static stall references missing loot table', () => {
  const input = sample();
  input.stallSources = [{ stallId: 20100000, slotLootTableIds: [2090000056],
    inventoryStatus: 'static_loot_candidates_only' }];
  assert.throws(() => createAcquisitionDatabase(input), /Unresolved stall loot table/);
});


test('content-addressed conditions preserve cross-referenced predicate structure without evaluating', () => {
  const input = sample();
  const digest = 'c'.repeat(64);
  input.recipes[0].conditionDigest = digest;
  input.conditionGates = [{ conditionDigest: digest, availabilityEvaluated: false,
    usedBy: [{kind:'recipe',recipeId:2050300004}],
    tree: {status:'static_predicate_structure_only',operator:'or', predicates:[
      {fieldNumber:5,kind:'commonConditions',payloadSha256:'a'.repeat(64),
        conditionId:2130000012,inversed:true}]}}];
  input.conditionDefinitions = [{conditionId:2130000012,conditionDigest:'b'.repeat(64),
    availabilityEvaluated:false,tree:{status:'static_predicate_structure_only',operator:'and',
    predicates:[{kind:'areaUnlocked',fieldNumber:30,payloadSha256:'d'.repeat(64)}]}}];
  const db = createAcquisitionDatabase(input);
  assert.equal(db.getRecipeCondition(2050300004)?.conditionDigest,digest);
  assert.equal(db.getConditionGate(digest).tree.predicates[0].conditionId,2130000012);
  assert.equal(db.getConditionDefinition(2130000012).availabilityEvaluated,false);
  assert.equal(db.getAcquisitionCondition('growing:30400010'),null);
  const missing=structuredClone(input);
  missing.conditionDefinitions=[];
  assert.throws(()=>createAcquisitionDatabase(missing),/Unresolved common condition/);
  const corrupt=structuredClone(input);
  corrupt.recipes[0].conditionDigest='e'.repeat(64);
  assert.throws(()=>createAcquisitionDatabase(corrupt),/Unresolved condition digest/);
  const cycle=structuredClone(input);
  cycle.conditionDefinitions[0].tree.predicates=[{fieldNumber:5,
    payloadSha256:'f'.repeat(64),conditionId:2130000012}];
  assert.throws(()=>createAcquisitionDatabase(cycle),/Cyclic common condition/);
});