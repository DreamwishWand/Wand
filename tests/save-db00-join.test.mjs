import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveCatalogJoin } from '../src/lib/save/db00-join.mjs';

const build = {
  platform: 'switch', identityKind: 'switch_bid',
  identity: '9A239D3DB569756D', schemaVersion: 626
};
const sha = 'a'.repeat(64);
const snapshot = (complete = false) => ({
  schema: 'wand.game-db.snapshot@1',
  id: 'synthetic-626',
  target: {
    platform: 'Nintendo Switch',
    gameVersion: '1.25.3', buildId: '9A239D3DB569756D', sourceSha256: sha
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

test('DB-05 joins canonical DB-00 Item IDs for exact Build only', () => {
  const joined = createSaveCatalogJoin(snapshot(), build);
  assert.equal(joined.contract, 'wand.db05.db00-candidate-join@1');
  assert.equal(joined.lookup(40000001).catalogItem.id, '40000001');
  assert.equal(joined.lookup('40000001').classification, 'catalog_item_candidate');
  assert.equal(joined.lookup(40000001).savedReferenceVerified, false);
  assert.equal(joined.ownershipVerified, false);
  assert.equal(joined.writerAuthorized, false);
});

test('unmatched ID in partial DB-00 coverage is unresolved, not absent from save', () => {
  const joined = createSaveCatalogJoin(snapshot(), build);
  assert.equal(joined.lookup(50000001).classification, 'unresolved_in_partial_catalog');
  assert.equal(joined.lookup('50000001').catalogItem, null);
  assert.equal(createSaveCatalogJoin(snapshot(true), build).lookup(50000001).classification, 'not_in_exact_catalog');
});

test('mismatched game version, platform, unverified Build, and absent Build all fail closed', () => {
  assert.throws(() => createSaveCatalogJoin(snapshot(), {...build, schemaVersion: 643}), /SAVE_BUILD_NOT_REGISTERED/);
  assert.throws(() => createSaveCatalogJoin({ ...snapshot(), target: {...snapshot().target, gameVersion:'1.26.2'} },build), /EXACT_TARGET_MISMATCH/);
  assert.throws(() => createSaveCatalogJoin({ ...snapshot(), target: {...snapshot().target, platform:'Steam'} },build), /EXACT_TARGET_MISMATCH/);
  assert.throws(() => createSaveCatalogJoin({ ...snapshot(), target: {...snapshot().target, buildId:null} },build), /EXACT_TARGET_MISMATCH/);
  assert.throws(() => createSaveCatalogJoin({},build), /DB00_SNAPSHOT_REQUIRED/);
});

test('canonical DB-00 IDs reject aliases and unsafe saved references', () => {
  const joined = createSaveCatalogJoin(snapshot(), build);
  for(const value of ['040000001','4e7','40000001.0',0,-1,Number.MAX_SAFE_INTEGER + 1,NaN,null]) {
    assert.throws(() => joined.lookup(value), TypeError);
  }
});
