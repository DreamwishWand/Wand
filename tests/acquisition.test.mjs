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