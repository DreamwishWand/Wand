import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSaveRegistry, matchSaveBuild, inspectDecodedSave, borrowUntouchedDecodedSave,
  makeGameIdIndex, matchGameId, diffSaveWitnesses, probeSaveStructure
} from '../src/lib/save/registry.mjs';

const build = { platform: 'switch', identityKind: 'switch_bid', identity: '9A239D3DB569756D', schemaVersion: 626 };
const synthetic = () => ({
  GameInfo: { Version: 626, UnknownFuture: { nested: true } },
  Player: { Inventory: { '999': { Amount: 10, UnknownFuture: 'keep' } } },
  World: { Other: [1, 2] },
  FutureRoot: { untouched: true }
});

test('registry exposes only candidate builds and denies all writer privileges', () => {
  const registry = getSaveRegistry();
  assert.equal(registry.schema, 'wand.db05.save-registry@1');
  assert.equal(registry.policy.writerAuthorized, false);
  assert.equal(registry.builds.length, 3);
  assert.equal(registry.saveContainers.find(x => x.schemaCandidate === 643).status, 'filename_only_opaque');
  assert.equal(matchSaveBuild(build)?.key, 'switch-1.25.3-626');
});

test('synthetic schema witness does not authorize mutation, export or build', () => {
  const witness = inspectDecodedSave(synthetic(), build);
  assert.equal(witness.rootShapeValid, true);
  assert.equal(witness.writerAuthorized, false);
  assert.equal(witness.exportAuthorized, false);
  assert.equal(witness.strictDecoderVerified, false);
  assert.equal(witness.externalBuildVerified, false);
});

test('original object and nested unknown fields survive untouched', () => {
  const source = synthetic();
  const baseline = structuredClone(source);
  const borrow = borrowUntouchedDecodedSave(source, build);
  assert.equal(borrow.original, source);
  assert.equal(borrow.original.Player.Inventory['999'], source.Player.Inventory['999']);
  assert.deepEqual(source, baseline);
});

test('structure is primary; platform, Build and save version are metadata only', () => {
  const unregistered = inspectDecodedSave(synthetic(), { ...build, identity: 'not-registered' });
  assert.equal(unregistered.rootShapeValid, true);
  assert.equal(unregistered.buildCandidate, null);
  const later = inspectDecodedSave({ ...synthetic(), GameInfo: { Version: 643 } }, build);
  assert.equal(later.rootShapeValid, true);
  assert.equal(later.saveSchemaVersion, 643);
  assert.equal(later.compatibilityBasis, 'decoded_field_shape');
  assert.equal(later.shapeProbe.platformAndVersionUsedAsGates, false);
  assert.equal(inspectDecodedSave(synthetic(), null).rootShapeValid, true);
  assert.ok(inspectDecodedSave({ ...synthetic(), World: [] }, build).issues.includes('WORLD_MUST_BE_OBJECT'));
  assert.ok(inspectDecodedSave({ ...synthetic(), GameInfo: { Version: '626' } }, build).issues.includes('GAMEINFO_VERSION_MUST_BE_NONNEGATIVE_SAFE_INTEGER'));
  assert.throws(() => borrowUntouchedDecodedSave({}, build));
});

test('same structural fields are compatible candidates across version/platform labels', () => {
  const save = {
    GameInfo: { Version: 643 }, World: { GridCollection: { DiffGrids: {} } },
    Player: {
      ListInventories: { '3': { ID: 3, Inventory: {'40000001': { Amount: 5 }} } },
      ContainerInventories: { '10': { ID: 10, Inventory: [{ ItemID: 40000001, Amount: 5 }] } },
      CollectionSets: [{ CollectionDefinitionID: 21200001, GroupData: [] }],
      MaleAvatar: { HairColorIndex: 1 }, AvatarIsMale: true
    }
  };
  const shape = probeSaveStructure(save);
  for (const domain of ['inventory','chests','collection','grids','appearance']) {
    const row = shape.domains.find(d => d.domain === domain);
    assert.equal(row.status, 'shape_candidate');
    assert.ok(row.observedFieldCount > 0);
  }
  assert.equal(shape.exhaustive, false);
  assert.equal(shape.writerAuthorized, false);
  assert.equal(inspectDecodedSave(save, null).rootShapeValid, true);
});

test('only observed field/type mismatch invalidates a domain shape candidate', () => {
  const save = synthetic();
  assert.equal(probeSaveStructure(save).domains.find(d => d.domain === 'chests').status, 'not_observed');
  save.Player.ContainerInventories = []; // historical schema expects a map
  const chest = probeSaveStructure(save).domains.find(d => d.domain === 'chests');
  assert.equal(chest.status, 'shape_conflict');
  assert.deepEqual(chest.conflictingPaths, ['/Player/ContainerInventories']);
  assert.equal(inspectDecodedSave(save, null).rootShapeValid, true);
});

test('large save arrays are sampled and never promoted to exhaustive proof', () => {
  const save = synthetic();
  save.Player.CollectionSets = Array.from({ length: 64 }, () => ({
    CollectionDefinitionID: 21200001, GroupData: []
  }));
  const domain = probeSaveStructure(save).domains.find(d => d.domain === 'collection');
  assert.equal(domain.status, 'sampled_candidate');
  assert.equal(domain.sampled, true);
  assert.equal(domain.writerAuthorized, false);
});

test('ID references require exact numeric match and reject collisions', () => {
  const row = { itemId: 40000000, category: 'Furniture' };
  const index = makeGameIdIndex([row]);
  assert.equal(matchGameId(index, 40000000), row);
  assert.equal(matchGameId(index, '40000000'), null);
  assert.equal(matchGameId(index, 40000001), null);
  assert.equal(matchGameId(index, 0), null);
  assert.throws(() => makeGameIdIndex([{itemId:1},{itemId:1}]), /DUPLICATE/);
  assert.throws(() => makeGameIdIndex([{itemId:'1'}]), /INVALID/);
  assert.throws(() => makeGameIdIndex([{itemId:0}]), /INVALID/);
  assert.throws(() => makeGameIdIndex([{itemId:-1}]), /INVALID/);
});

test('deterministic schema difference reports adds, removals, type changes, never authority', () => {
  const diff = diffSaveWitnesses(
    [{path:'/A',type:'object'},{path:'/Gone',type:'number'}],
    [{path:'/A',type:'array'},{path:'/Added',type:'string'}]
  );
  assert.deepEqual(diff.added, [{path:'/Added',type:'string'}]);
  assert.deepEqual(diff.removed, [{path:'/Gone',type:'number'}]);
  assert.deepEqual(diff.changed, [{path:'/A',previousType:'object',currentType:'array'}]);
  assert.equal(diff.authoritative, false);
  assert.throws(() => diffSaveWitnesses([{path:'/A',type:'object'},{path:'/A',type:'object'}], []));
});

test('bridges existing Collection runtime records by exact Item ID without save writes', async () => {
  const { decodeCollectionRecord } = await import('../src/lib/collection/catalog.mjs');
  const collectionIndex = { f: ['Furniture'], c: ['unspecified'], m: ['unknown'], w: [], u: [], e: [] };
  const row = [40000000, 0, 0, 0, [], [], [], Array(8).fill('Fixture chair')];
  const record = decodeCollectionRecord(collectionIndex, row, 'ja');
  const index = makeGameIdIndex([record]);
  assert.equal(matchGameId(index, 40000000)?.family, 'Furniture');
  assert.equal(matchGameId(index, 40000001), null);
});

test('legacy Rust field map covers schema626 without authorizing editing or current builds', async () => {
  const { getLegacySaveFields } = await import('../src/lib/save/registry.mjs');
  const map = getLegacySaveFields();
  assert.equal(map.schema, 'wand.db05.legacy626-fields@1');
  assert.equal(map.saveSchemaVersion, 626);
  assert.equal(map.fields.length, 66);
  assert.ok(map.fields.some(x => x.path === '/Player/MaleAvatar/Eyeball/ColorIndex2'));
  assert.ok(map.fields.some(x => x.path === '/Player/FemaleAvatar/ClothingCustomization/{itemId}'));
  assert.ok(map.fields.every(x => x.writable === false && x.observedStatus === 'legacy_source_code_only'));
  const amount = map.fields.find(x => x.path === '/Player/ContainerInventories/{containerId}/Inventory[]/Amount');
  assert.deepEqual(amount.builds, ['steam-1.25.3-626', 'switch-1.25.3-626']);
  assert.equal(map.fields.some(x => x.builds.includes('switch-643')), false);
  assert.equal(map.fields.filter(x => x.domain === 'chests' && x.builds.includes('switch-1.25.3-626')).length, 9);
});

test('registry sources are deeply immutable at runtime', async () => {
  const { getLegacySaveFields } = await import('../src/lib/save/registry.mjs');
  const source = getSaveRegistry();
  const legacy = getLegacySaveFields();
  assert.equal(Object.isFrozen(source), true);
  assert.equal(Object.isFrozen(source.builds[0]), true);
  assert.equal(Object.isFrozen(legacy.fields), true);
  assert.equal(Object.isFrozen(legacy.fields[0]), true);
  assert.throws(() => { source.builds[0].schemaVersion = 643; }, TypeError);
});

test('legacy ID witnesses do not conflate grid, world, quest, and catalog Item IDs', async () => {
  const { getLegacySaveIdReferences } = await import('../src/lib/save/registry.mjs');
  const all = getLegacySaveIdReferences();
  const items = getLegacySaveIdReferences('item');
  assert.equal(all.length, 17);
  assert.equal(items.length, 14);
  assert.ok(items.every(x => x.idReference.catalog === 'DB-01'));
  assert.ok(items.every(x => x.idReference.join === 'exact_numeric_only' && x.idReference.currentCatalogCoverageVerified === false));
  assert.equal(getLegacySaveIdReferences('quest').length, 0);
  const grid = getLegacySaveIdReferences('grid');
  assert.equal(grid.length, 1);
  assert.equal(grid[0].idReference.catalog, null);
  assert.throws(() => getLegacySaveIdReferences(626), TypeError);
});
