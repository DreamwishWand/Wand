import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateCollectionRuntimeIndex } from '../src/lib/collection/catalog.mjs';
import { SNAPSHOT_SCHEMA, PATCH_SCHEMA, validateSnapshot, legacyItem, nativeItem,
  diffSnapshots, applyPatch, searchItems } from '../src/lib/game-db/model.mjs';
import { loadCurrentGameDatabase, loadActiveCollectionRuntime, loadActivePointer } from '../src/lib/game-db/client.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha = 'a'.repeat(64);
const copy = (value) => structuredClone(value);
function item(id, changes = {}) {
  return { id: String(id), names: { en: 'Item ' + id }, nameStatus: 'verified',
    category: 'Furniture', subcategory: null, worlds: [], universes: [],
    contentIds: [], releaseIds: [], relations: [], sourceRefs: ['sample'], ...changes };
}
function snapshot(id, items = [], overrides = {}) {
  return {
    schema: SNAPSHOT_SCHEMA, id,
    target: { platform: 'Steam', gameVersion: '1.26.2', buildId: null, sourceSha256: sha },
    coverage: { scope: 'fixture', complete: true, categories: ['Furniture'] },
    publishable: true, sources: [{ id: 'sample', sha256: sha, visibility: 'public_reference' }],
    releases: [], items, ...overrides
  };
}
function cli(...args) {
  const result = spawnSync(process.execPath, [join(root, 'tools/db-00/cli.mjs'), ...args], {
    cwd: root, encoding: 'utf8', timeout: 90000
  });
  return result;
}
test('DB-00 validates stable IDs, eight-locale restrictions and references', () => {
  assert.doesNotThrow(() => validateSnapshot(snapshot('sample-1', [item(10001)])));
  assert.throws(() => validateSnapshot(snapshot('sample-2', [item(10001), item(10001)])), /duplicate Item ID/);
  assert.throws(() => validateSnapshot(snapshot('sample-3', [item(10001, { relations: ['10002'] })])), /dangling/);
  assert.throws(() => validateSnapshot(snapshot('sample-4', [item(10001, { names: { xx: 'bad' } })])), /locale/);
  assert.throws(() => validateSnapshot(snapshot('sample-5', [item(10001, { releaseIds: ['dlc-x'] })])), /missing referenced release/);
  const withPacks = snapshot('sample-packs', [item(10001, { releaseIds: ['free-1', 'expansion-1', 'adventure-1'] })], {
    releases: [
      { id: 'free-1', kind: 'free_update', label: 'Free content', gameVersion: '1.26.2', contentIds: [] },
      { id: 'expansion-1', kind: 'expansion', label: 'Expansion', gameVersion: null, contentIds: ['Expansion03'] },
      { id: 'adventure-1', kind: 'adventure_pack', label: 'Adventure pack', gameVersion: null, contentIds: ['WinnieDLC'] }
    ]
  });
  assert.equal(validateSnapshot(withPacks).items[0].releaseIds.length, 3);
  assert.throws(() => validateSnapshot(snapshot('sample-private', [item(10001)], {
    sources: [{ id: 'sample', sha256: sha, visibility: 'private' }]
  })), /private sources/);
});
test('DB-00 makes only comparable coverage diffs and rejects inferred deletions', () => {
  const old = snapshot('old', [item(1), item(2), item(3)]);
  const next = snapshot('new', [item(1, { category: 'Clothing' }), item(3), item(4)]);
  const diff = diffSnapshots(old, next);
  assert.deepEqual(diff.added, ['4']);
  assert.deepEqual(diff.removed, ['2']);
  assert.deepEqual(diff.reclassified, ['1']);
  assert.deepEqual(diff.changed, ['1']);
  const partial = snapshot('partial', next.items, {
    coverage: { scope: 'fixture', complete: false, categories: ['Furniture'] },
    publishable: true
  });
  const partialDiff = diffSnapshots(old, partial);
  assert.deepEqual(partialDiff.removed, []);
  assert.deepEqual(partialDiff.oldOnlyUnverified, ['2']);
  assert.equal(diffSnapshots(old, snapshot('different', [], {
    coverage: { scope: 'other', complete: false, categories: ['Furniture'] }
  })).comparable, false);
});
test('DB-00 patch rejects conflicts and preserves validated IDs', () => {
  const base = snapshot('sample', [item(123)]);
  const matching = item(123);
  const patch = { schema: PATCH_SCHEMA, target: base.target, items: [matching, item(456)],
    sources: [], releases: [] };
  const merged = applyPatch(base, patch);
  assert.deepEqual(merged.items.map((row) => row.id), ['123', '456']);
  assert.deepEqual(searchItems(merged, 'item 456').map((row) => row.id), ['456']);
  assert.throws(() => applyPatch(base, { ...patch, items: [item(123, { category: 'Clothing' })] }), /conflicting/);
  assert.throws(() => applyPatch(base, { ...patch, target: { ...base.target, gameVersion: '1.25.0' } }), /target mismatch/);
});
test('existing public Collection is compatible with normalized DB-00 IDs and locales', async () => {
  const path = join(root, 'static/ddv/collection/v1.25');
  const index = validateCollectionRuntimeIndex(JSON.parse(await readFile(join(path, 'index.json'), 'utf8')));
  const shard = JSON.parse(await readFile(join(path, 'records-00.json'), 'utf8'));
  const record = legacyItem(index, shard.r[0]);
  assert.equal(record.id, String(shard.r[0][0]));
  assert.equal(record.names.ja, 'ベル');
  assert.equal(index.n, 12552);
  assert.equal(index.shards.length, 18);
});
test('SvelteKit client loads active pointer and immutable legacy corpus', async () => {
  async function fileFetch(url) {
    const relative = url.replace(/^\/Wand\//, '');
    try {
      const bytes = await readFile(join(root, 'static', relative));
      return new Response(bytes, { status: 200 });
    } catch (error) {
      if (error.code === 'ENOENT') return new Response('', { status: 404 });
      throw error;
    }
  }
  const pointer = await loadActivePointer('/Wand', fileFetch);
  assert.equal(pointer.snapshot, 'legacy-switch-1.25.0');
  const db = await loadCurrentGameDatabase('/Wand', fileFetch);
  assert.equal(db.items.length, 12552);
  assert.equal(db.items[0].id, String(db.legacy.rows[0][0]));
  const runtime = await loadActiveCollectionRuntime('/Wand', fileFetch);
  assert.equal(runtime.rows.length, 12552);
});
test('real 12,552-record import -> versioned SHA-pinned build -> verify is deterministic', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wand-db00-'));
  try {
    const source = join(root, 'static/ddv/collection/v1.25');
    const a = join(directory, 'a.json'), b = join(directory, 'b.json');
    for (const out of [a, b]) {
      const result = cli('import-legacy', '--catalog', source, '--out', out);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(hash(await readFile(a)), hash(await readFile(b)));
    const obj = JSON.parse(await readFile(a, 'utf8'));
    assert.equal(validateSnapshot(obj).items.length, 12552);
    const out = join(directory, 'release');
    const build = cli('build', '--snapshot', a, '--out', out, '--public');
    assert.equal(build.status, 0, build.stderr);
    const checked = cli('verify-build', '--dir', out);
    assert.equal(checked.status, 0, checked.stderr);
    const pointer = join(directory, 'active.json');
    const active = cli('activate', '--dir', out,
      '--path', 'ddv/game-db/releases/legacy-switch-1.25.0/index.json', '--out', pointer);
    assert.equal(active.status, 0, active.stderr);
    assert.equal(JSON.parse(await readFile(pointer, 'utf8')).kind, 'db_snapshot');
    const diffFile = join(directory, 'same-diff.json');
    const diff = cli('diff', '--old', a, '--new', b, '--out', diffFile);
    assert.equal(diff.status, 0, diff.stderr);
    assert.deepEqual(JSON.parse(await readFile(diffFile, 'utf8')).changed, []);
    // Published shards are independent of raw game sources.
    const data = JSON.parse(await readFile(join(out, 'index.json'), 'utf8'));
    assert.equal(data.count, 12552);
    assert.equal(data.shards.length, 18);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('SRC-01 partial native import retains unknown build ID and blocks public distribution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wand-db00-private-'));
  try {
    const row = { itemId: 30000001, rawNameField: 'INTERNAL_NAME_NOT_LOCALIZED',
      nativeCategory: 'ActivityItem', source: { platform: 'Steam', gameVersion: '1.26.2',
        file: 'ddv_Data/StreamingAssets/itemlist/ActivityItem.json' } };
    const bytes = Buffer.from(JSON.stringify(row) + '\n');
    const itemsPath = join(directory, 'items.jsonl');
    const manifestPath = join(directory, 'manifest.json');
    await writeFile(itemsPath, bytes);
    await writeFile(manifestPath, JSON.stringify({
      schema: 'wand.src01.steam-native@1', status: 'partial_native_extraction',
      platform: 'Steam', gameVersion: '1.26.2', languageNamesVerified: false,
      itemCount: 1, itemsSha256: hash(bytes),
      validatedNativeCategories: ['ActivityItem'],
      sourceFiles: [{ path: row.source.file, sha256: sha }]
    }));
    const snapshotPath = join(directory, 'native.json');
    const result = cli('import-native', '--manifest', manifestPath, '--items', itemsPath, '--out', snapshotPath);
    assert.equal(result.status, 0, result.stderr);
    const privateSnapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
    assert.equal(privateSnapshot.publishable, false);
    assert.equal(privateSnapshot.target.buildId, null);
    assert.deepEqual(privateSnapshot.items[0].names, {});
    assert.equal(JSON.stringify(privateSnapshot).includes('INTERNAL_NAME_NOT_LOCALIZED'), false);
    const publish = cli('build', '--snapshot', snapshotPath, '--out', join(directory, 'public'), '--public');
    assert.notEqual(publish.status, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
