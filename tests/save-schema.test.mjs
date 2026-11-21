import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSaveRegistry, matchSaveBuild, inspectDecodedSave, borrowUntouchedDecodedSave,
  makeGameIdIndex, matchGameId, diffSaveWitnesses
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

test('unknown build, nonmatching save schema and invalid required root are fail closed', () => {
  assert.equal(inspectDecodedSave(synthetic(), { ...build, identity: 'not-registered' }).rootShapeValid, false);
  assert.ok(inspectDecodedSave(synthetic(), { ...build, schemaVersion: 643 }).issues.includes('BUILD_OR_SCHEMA_NOT_REGISTERED'));
  assert.ok(inspectDecodedSave({ ...synthetic(), GameInfo: { Version: 643 } }, build).issues.includes('SAVE_SCHEMA_MISMATCH'));
  assert.ok(inspectDecodedSave({ ...synthetic(), World: [] }, build).issues.includes('WORLD_MUST_BE_OBJECT'));
  assert.ok(inspectDecodedSave({ ...synthetic(), GameInfo: { Version: '626' } }, build).issues.includes('GAMEINFO_VERSION_MUST_BE_NONNEGATIVE_SAFE_INTEGER'));
  assert.throws(() => borrowUntouchedDecodedSave({}, build));
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
