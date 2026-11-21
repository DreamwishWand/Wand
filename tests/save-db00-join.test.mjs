import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveCatalogJoin } from '../src/lib/save/db00-join.mjs';

const sha = 'a'.repeat(64);
const save = (version = 626) => ({
  GameInfo: { Version: version },
  Player: {
    ListInventories: {
      '1': { Inventory: {'40000001': {Amount: 5}} }
    }
  },
  World: {}
});
const snapshot = (complete = false, platform = 'Steam', version = '1.26.2') => ({
  schema: 'wand.game-db.snapshot@1',
  id: 'synthetic-catalog',
  target: {
    platform, gameVersion: version, buildId: null, sourceSha256: sha
  },
  coverage: { scope: 'synthetic-furniture', complete, categories: ['Furniture'] },
  sources: [{ id: 'fixture', sha256: sha, visibility: 'public_reference' }],
  releases: [],
  publishable: true,
  items: [{
    id: '40000001', names: { en: 'Synthetic Furniture' }, nameStatus: 'verified',
    category: 'Furniture', subcategory: null, worlds: [], universes: [],
    contentIds: [], releaseIds: [], relations: [], sourceRefs: ['fixture']
  }]
});

test('DB-05 joins exact canonical IDs regardless of platform and game version labels', () => {
  const joined = createSaveCatalogJoin(snapshot(), save(626));
  assert.equal(joined.contract, 'wand.db05.db00-candidate-join@1');
  assert.equal(joined.compatibilityBasis, 'decoded_field_shape');
  assert.equal(joined.saveShapeContract, 'wand.db05.save-shape-probe@1');
  assert.equal(joined.lookup(40000001).catalogItem.id, '40000001');
  assert.equal(joined.lookup('40000001').classification, 'catalog_item_candidate');
  assert.equal(joined.lookup(40000001).savedReferenceVerified, false);
  assert.equal(joined.ownershipVerified, false);
  assert.equal(joined.writerAuthorized, false);
  const switchCatalog = createSaveCatalogJoin(snapshot(false, 'Nintendo Switch', '1.25.0'), save(643));
  assert.equal(switchCatalog.lookup(40000001).catalogItem.id, '40000001');
});

test('unmatched ID in partial DB-00 coverage is unresolved, not save corruption', () => {
  const joined = createSaveCatalogJoin(snapshot(), save());
  assert.equal(joined.lookup(50000001).classification, 'unresolved_in_partial_catalog');
  assert.equal(joined.lookup('50000001').catalogItem, null);
  assert.equal(createSaveCatalogJoin(snapshot(true), save(643)).lookup(50000001).classification, 'not_in_catalog_snapshot');
});

test('missing or wrong decoded root and invalid DB-00 snapshot fail closed', () => {
  assert.throws(() => createSaveCatalogJoin(snapshot(), {}), /SAVE_ROOT_STRUCTURE_INVALID/);
  assert.throws(() => createSaveCatalogJoin(snapshot(), {GameInfo: {Version: 643},Player:{},World:[]}), /SAVE_ROOT_STRUCTURE_INVALID/);
  assert.throws(() => createSaveCatalogJoin({}, save()), /DB00_SNAPSHOT_REQUIRED/);
  assert.throws(() => createSaveCatalogJoin({...snapshot(),items:[{id:'1'}]}, save()), TypeError);
});

test('canonical DB-00 IDs reject aliases and unsafe save references', () => {
  const joined = createSaveCatalogJoin(snapshot(), save());
  for (const value of ['040000001','4e7','40000001.0',0,-1,Number.MAX_SAFE_INTEGER + 1,NaN,null]) {
    assert.throws(() => joined.lookup(value), TypeError);
  }
});
