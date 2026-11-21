#!/usr/bin/env node
// DB-00: reproducible, dependency-free snapshot builder. Never writes to game files.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { validateCollectionRuntimeIndex } from '../../src/lib/collection/catalog.mjs';
import { SNAPSHOT_SCHEMA, RELEASE_SCHEMA, ACTIVE_SCHEMA, validateSnapshot,
  legacyItem, nativeItem, diffSnapshots, searchItems, applyPatch } from '../../src/lib/game-db/model.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const text = (value) => JSON.stringify(value, null, 2) + '\n';
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function atomic(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temp = path + '.tmp-' + process.pid;
  await writeFile(temp, bytes);
  await rename(temp, path);
}
function opts(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error('Unexpected argument: ' + argv[i]);
    const key = argv[i].slice(2);
    if (['public', 'show-help'].includes(key)) result[key] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Missing argument for --' + key);
      result[key] = argv[++i];
    }
  }
  return result;
}
function required(options, key) {
  if (!options[key]) throw new Error('Missing --' + key);
  return options[key];
}
function safeRelative(path) {
  if (typeof path !== 'string' || !/^ddv\/[a-zA-Z0-9_.\/-]+$/.test(path) ||
      path.split('/').some((part) => part === '.' || part === '..' || !part)) {
    throw new Error('Invalid static relative path');
  }
  return path;
}
function target(platform, gameVersion, buildId, sourceSha256) {
  return { platform, gameVersion: gameVersion || null, buildId: buildId || null, sourceSha256 };
}
async function legacySnapshot(catalog) {
  const indexPath = join(catalog, 'index.json');
  const indexBytes = await readFile(indexPath);
  const index = validateCollectionRuntimeIndex(JSON.parse(indexBytes.toString('utf8')));
  let offset = 0;
  const items = [];
  const seen = new Set();
  for (const shard of index.shards) {
    const bytes = await readFile(join(catalog, shard.file));
    if (hash(bytes) !== shard.sha256 || bytes.length !== shard.bytes) throw new Error('Legacy shard digest mismatch: ' + shard.file);
    const payload = JSON.parse(bytes.toString('utf8'));
    if (payload.s !== 'wand.collection.records@1' || payload.offset !== offset ||
        payload.count !== shard.count || !Array.isArray(payload.r) || payload.r.length !== shard.count) {
      throw new Error('Legacy shard format mismatch: ' + shard.file);
    }
    for (const row of payload.r) {
      const item = legacyItem(index, row);
      if (seen.has(item.id)) throw new Error('Duplicate legacy Item ID ' + item.id);
      seen.add(item.id);
      items.push(item);
    }
    offset += shard.count;
  }
  if (items.length !== index.n) throw new Error('Legacy corpus count mismatch');
  const snapshot = {
    schema: SNAPSHOT_SCHEMA, id: 'legacy-switch-1.25.0',
    target: target(index.t.platform, index.t.gameVersion, index.t.buildID, hash(indexBytes)),
    coverage: { scope: 'collection-legacy-reference', complete: true, categories: [...index.f].sort() },
    publishable: true,
    sources: [{ id: 'legacy-collection-switch-1250', sha256: hash(indexBytes),
      visibility: 'public_reference', description: 'Already-public immutable Collection runtime index and SHA-pinned shards' }],
    releases: [], items: items.sort((a, b) => Number(a.id) - Number(b.id))
  };
  return validateSnapshot(snapshot);
}
async function nativeSnapshot(manifestPath, itemsPath) {
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema !== 'wand.src01.steam-native@1' ||
    manifest.status !== 'partial_native_extraction' ||
    manifest.languageNamesVerified !== false ||
    !Array.isArray(manifest.sourceFiles) || !manifest.sourceFiles.length) {
    throw new Error('Unsupported SRC-01 manifest or unsafe verified-name claim');
  }
  const bytes = await readFile(itemsPath);
  if (hash(bytes) !== manifest.itemsSha256) throw new Error('Native items SHA-256 mismatch');
  const seen = new Set();
  const items = [];
  for (const line of bytes.toString('utf8').split(/\r?\n/)) {
    if (!line) continue;
    const row = JSON.parse(line);
    const item = nativeItem(row);
    if (seen.has(item.id)) throw new Error('Duplicate native Item ID ' + item.id);
    if (row.source?.platform !== manifest.platform || row.source?.gameVersion !== manifest.gameVersion ||
      !manifest.sourceFiles.some((file) => file.path === row.source.file)) throw new Error('Native provenance mismatch: ' + item.id);
    seen.add(item.id);
    items.push(item);
  }
  if (items.length !== manifest.itemCount) throw new Error('Native source count mismatch');
  const snapshot = {
    schema: SNAPSHOT_SCHEMA, id: 'src01-steam-' + manifest.gameVersion.replace(/[^0-9.]/g, '-'),
    target: target(manifest.platform, manifest.gameVersion, null, hash(manifestBytes)),
    coverage: { scope: 'src01-partial-native-items', complete: false, categories: [...manifest.validatedNativeCategories].sort() },
    publishable: false, sources: [{ id: 'src01-steam-1262', sha256: hash(manifestBytes),
      visibility: 'private', description: 'Partial SHA-verified native extraction. Localized names unverified.' }],
    releases: [], items: items.sort((a, b) => Number(a.id) - Number(b.id))
  };
  return validateSnapshot(snapshot);
}
async function writeDistribution(snapshot, out, shardSize = 700) {
  validateSnapshot(snapshot);
  if (!snapshot.publishable) throw new Error('Cannot distribute private or unverified game data');
  if (!Number.isInteger(shardSize) || shardSize < 1 || shardSize > 5000) throw new Error('Invalid shard size');
  await mkdir(out, { recursive: true });
  const shards = [];
  for (let offset = 0, shardIndex = 0; offset < snapshot.items.length; offset += shardSize, shardIndex++) {
    const items = snapshot.items.slice(offset, offset + shardSize);
    const file = 'items-' + String(shardIndex).padStart(3, '0') + '.json';
    const payload = Buffer.from(JSON.stringify({ schema: SNAPSHOT_SCHEMA, offset, count: items.length, items }) + '\n', 'utf8');
    await atomic(join(out, file), payload);
    shards.push({ file, offset, count: items.length, bytes: payload.length, sha256: hash(payload) });
  }
  const index = {
    schema: RELEASE_SCHEMA, id: snapshot.id, target: snapshot.target,
    coverage: snapshot.coverage, sources: snapshot.sources, releases: snapshot.releases,
    count: snapshot.items.length, shards
  };
  await atomic(join(out, 'index.json'), text(index));
  return index;
}
async function verifyDistribution(root) {
  const index = await json(join(root, 'index.json'));
  if (index.schema !== RELEASE_SCHEMA || !Array.isArray(index.shards)) throw new Error('Invalid release index');
  let offset = 0;
  const all = [];
  for (const shard of index.shards) {
    if (!/^items-[0-9]{3,}\.json$/.test(shard.file) || shard.offset !== offset) throw new Error('Invalid release shard path/offset');
    const bytes = await readFile(join(root, shard.file));
    if (hash(bytes) !== shard.sha256 || bytes.length !== shard.bytes) throw new Error('Release SHA-256 failure: ' + shard.file);
    const payload = JSON.parse(bytes.toString('utf8'));
    if (payload.schema !== SNAPSHOT_SCHEMA || payload.offset !== offset || payload.count !== shard.count ||
      payload.items.length !== shard.count) throw new Error('Release shard contract failure');
    all.push(...payload.items);
    offset += shard.count;
  }
  if (offset !== index.count) throw new Error('Release count mismatch');
  return validateSnapshot({ schema: SNAPSHOT_SCHEMA, id: index.id, target: index.target,
    coverage: index.coverage, sources: index.sources, releases: index.releases,
    publishable: true, items: all });
}
async function activate(options) {
  const root = resolve(required(options, 'dir'));
  const index = await verifyDistribution(root);
  const path = safeRelative(required(options, 'path'));
  if (basename(path) !== 'index.json' || !path.includes('/releases/')) throw new Error('Activation requires an immutable releases/.../index.json');
  const bytes = await readFile(join(root, 'index.json'));
  const next = {
    schema: ACTIVE_SCHEMA, snapshot: index.id, kind: 'db_snapshot',
    path: path.slice(0, -'/index.json'.length), indexSha256: hash(bytes),
    target: { platform: index.target.platform, gameVersion: index.target.gameVersion, buildId: index.target.buildId },
    publication: 'validated_public_snapshot'
  };
  await atomic(required(options, 'out'), text(next));
  return next;
}
export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  const o = opts(args);
  if (!command || command === 'help') {
    console.log('Commands: import-legacy, import-native, validate, diff, merge, search, build, verify-build, activate');
    return;
  }
  if (command === 'import-legacy') {
    const snapshot = await legacySnapshot(resolve(required(o, 'catalog')));
    await atomic(required(o, 'out'), text(snapshot));
    console.log('Imported legacy Collection: ' + snapshot.items.length);
  } else if (command === 'import-native') {
    const snapshot = await nativeSnapshot(required(o, 'manifest'), required(o, 'items'));
    await atomic(required(o, 'out'), text(snapshot));
    console.log('Imported private native partial: ' + snapshot.items.length);
  } else if (command === 'validate') {
    const snap = validateSnapshot(await json(required(o, 'snapshot')));
    console.log('Validated snapshot: ' + snap.id + ' (' + snap.items.length + ')');
  } else if (command === 'diff') {
    const result = diffSnapshots(await json(required(o, 'old')), await json(required(o, 'new')));
    await atomic(required(o, 'out'), text(result));
    console.log('Diff comparable: ' + result.comparable);
  } else if (command === 'merge') {
    const next = applyPatch(await json(required(o, 'snapshot')), await json(required(o, 'patch')));
    await atomic(required(o, 'out'), text(next));
    console.log('Merged: ' + next.items.length);
  } else if (command === 'search') {
    const items = searchItems(await json(required(o, 'snapshot')), required(o, 'query'), o.locale ?? 'en');
    console.log(JSON.stringify(items.map((item) => ({ id: item.id, name: item.names[o.locale ?? 'en'] ?? null }))));
  } else if (command === 'build') {
    if (!o.public) throw new Error('Explicit --public is required; never publish private game sources');
    const index = await writeDistribution(await json(required(o, 'snapshot')), resolve(required(o, 'out')));
    console.log('Built public release: ' + index.count);
  } else if (command === 'verify-build') {
    const snapshot = await verifyDistribution(resolve(required(o, 'dir')));
    console.log('Verified SHA-pinned release: ' + snapshot.items.length);
  } else if (command === 'activate') {
    const current = await activate(o);
    console.log('Created pointer for ' + current.snapshot + '; deployment not modified');
  } else throw new Error('Unknown command: ' + command);
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
