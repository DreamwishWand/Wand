#!/usr/bin/env node
/** DB-00 private adapter for the existing DB-01 SQLite v2 -> TypeScript read-shard contract.
 * No second SQLite parser, no original asset extraction, no public publication.
 * Run with: node --experimental-strip-types tools/db-00/import-db01-v2.mjs ...
 */
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb01CatalogClient, validateDb01Shards } from '../../src/lib/items/index.ts';
import { createDb01Db00Patch } from '../../src/lib/items/db00-join.ts';
import { SNAPSHOT_SCHEMA, validateSnapshot } from '../../src/lib/game-db/model.mjs';

const SHA = /^[0-9a-f]{64}$/;
const digest = (data) => createHash('sha256').update(data).digest('hex');
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CATEGORIES = Object.freeze(['ActivityItem', 'Furniture', 'Clothing', 'Trimming']);

function fail(code) { throw new Error('DB00_V2_' + code); }
function assert(value, code) { if (!value) fail(code); }
function options(argv) {
  const result = {};
  for (let i = 0; i < argv.length; ++i) {
    const key = argv[i];
    assert(/^--[a-z-]+$/.test(key) && argv[i + 1] && !argv[i + 1].startsWith('--'), 'INVALID_ARGUMENT');
    assert(!(key.slice(2) in result), 'DUPLICATE_ARGUMENT');
    result[key.slice(2)] = argv[++i];
  }
  const expected = ['shards', 'audit', 'expected-manifest-sha256',
    'expected-sqlite-sha256', 'expected-source-items-sha256', 'out'];
  assert(Object.keys(result).length === expected.length &&
    expected.every((key) => typeof result[key] === 'string'), 'REQUIRED_ARGUMENT_MISSING');
  for (const key of expected.filter((key) => key.startsWith('expected-'))) {
    assert(SHA.test(result[key]), 'INVALID_TRUSTED_SHA');
  }
  return result;
}
function isWithin(path, root) {
  const rel = relative(root, path);
  return !rel.startsWith('..' + sep) && rel !== '..' && !resolve(rel).startsWith('..' + sep) && !/^[A-Za-z]:/.test(rel);
}
async function inputFile(path) {
  const info = await lstat(path);
  assert(info.isFile() && !info.isSymbolicLink(), 'INVALID_INPUT_FILE');
  return readFile(path);
}
async function privateOutput(file, bytes) {
  const destination = resolve(file);
  assert(!isWithin(destination, ROOT), 'OUTPUT_INSIDE_CHECKOUT');
  let node = dirname(destination);
  while (true) {
    try {
      const s = await lstat(node);
      assert(!s.isSymbolicLink(), 'SYMLINKED_OUTPUT_PARENT');
      if (node === ROOT || (await lstat(resolve(node, '.git')).then(() => true, () => false)))
        fail('OUTPUT_INSIDE_GIT_CHECKOUT');
    } catch (error) {
      if (error.message?.startsWith('DB00_V2_')) throw error;
      if (error.code !== 'ENOENT') throw error;
    }
    if (node === dirname(node)) break;
    node = dirname(node);
  }
  await mkdir(dirname(destination), { recursive: true });
  // Refuse to overwrite private version evidence. A failed run cannot remove an older snapshot.
  const staging = destination + '.tmp-' + process.pid;
  try {
    const exists = await lstat(destination).then(() => true, (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    });
    assert(!exists, 'OUTPUT_ALREADY_EXISTS');
    await writeFile(staging, bytes, { flag: 'wx', mode: 0o600 });
    await rename(staging, destination);
  } finally {
    await rm(staging, { force: true });
  }
}
async function run(argv) {
  const args = options(argv);
  const root = resolve(args.shards);
  const folder = await lstat(root);
  assert(folder.isDirectory() && !folder.isSymbolicLink(), 'INVALID_PRIVATE_SHARD_DIRECTORY');
  const rootReal = await realpath(root);
  const manifestBytes = await inputFile(resolve(root, 'manifest.json'));
  const manifestSHA = digest(manifestBytes);
  assert(manifestSHA === args['expected-manifest-sha256'], 'SHARDS_MANIFEST_TRUST_PIN_MISMATCH');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  validateDb01Shards(manifest);
  assert(manifest.privateOnly === true && manifest.publicationAuthorized === false &&
    manifest.fullCorpusParsed === false, 'DB01_NOT_PARTIAL_PRIVATE_SOURCE');
  const audit = JSON.parse((await inputFile(resolve(args.audit))).toString('utf8'));
  assert(audit.schema === 'wand.db01.private-native-key-migration@1' &&
    audit.status === 'PASS' && audit.publicationAuthorized === false &&
    audit.sourceVersionCoverageComplete === false, 'AUDIT_NOT_PRIVATE_PASS');
  assert(audit.shardsManifestSha256 === manifestSHA &&
    audit.sqliteSha256 === args['expected-sqlite-sha256'] &&
    audit.sourceItemsSha256 === args['expected-source-items-sha256'] &&
    manifest.sourceItemsSha256 === audit.sourceItemsSha256 &&
    manifest.definitions === audit.definitions &&
    manifest.definitions === audit.nativeKeys &&
    Object.keys(manifest.files).length === audit.shardFilesVerified &&
    manifest.platform === audit.platform && manifest.gameVersion === audit.gameVersion, 'AUDIT_PROVENANCE_MISMATCH');
  // The DB-01 source reader deliberately exposes only four proven item categories.
  for (const category of CATEGORIES) assert(manifest.categories.includes(category), 'MISSING_ITEM_CATEGORY');
  const client = createDb01CatalogClient(manifest, async (path) => {
    assert(/^category\/[A-Za-z0-9]+\.json$/.test(path) &&
      Object.hasOwn(manifest.files, path), 'UNEXPECTED_PRIVATE_ASSET_PATH');
    const absolute = resolve(root, path);
    assert(isWithin(absolute, root), 'PATH_ESCAPE');
    const st = await lstat(absolute);
    assert(st.isFile() && !st.isSymbolicLink() && isWithin(await realpath(absolute), rootReal), 'INVALID_SHARD_FILE');
    return new Uint8Array(await readFile(absolute));
  });
  // Reuse the official DB-01 -> DB-00 bridge: no duplicate game parsing or label inference.
  const joined = await createDb01Db00Patch(client, {
    platform: manifest.platform, gameVersion: manifest.gameVersion,
    buildId: null, sourceSha256: manifest.nativeSourceManifestSha256
  });
  assert(joined.currentItemDefinitions === manifest.currentNativeItemDefinitions &&
    joined.excludedUnclassifiedDefinitions === manifest.definitions - joined.currentItemDefinitions &&
    joined.catalogCoverageComplete === false && joined.publishable === false &&
    joined.historicalMetadataCopied === false, 'BRIDGE_COVERAGE_MISMATCH');
  const compiledSourceId = 'db01-v2-' + manifestSHA.slice(0, 16);
  const nativeSourceId = 'src01-native-' + manifest.nativeSourceManifestSha256.slice(0, 16);
  const snapshot = validateSnapshot({
    schema: SNAPSHOT_SCHEMA,
    id: 'db01-' + manifest.platform.toLowerCase() + '-' + manifest.gameVersion.replaceAll('.', '-') + '-' +
      manifestSHA.slice(0, 16),
    target: joined.patch.target,
    coverage: { scope: 'src01-partial-native-items', complete: false,
      categories: [...CATEGORIES].sort() },
    publishable: false,
    sources: [
      { id: nativeSourceId, sha256: manifest.nativeSourceManifestSha256, visibility: 'private',
        description: 'Original SHA-pinned SRC-01 Steam item identity and icon evidence' },
      { id: compiledSourceId, sha256: manifestSHA, visibility: 'private',
        compilerSourceManifestSha256: manifest.sourceManifestSha256,
        sourceItemsSha256: manifest.sourceItemsSha256,
        description: 'Audited DB-01 SQLite v2 immutable private shards; current exact-name evidence only' }
    ],
    releases: [],
    items: joined.patch.items.map((item) => ({
      ...item, sourceRefs: [nativeSourceId, compiledSourceId]
    }))
  });
  const currentNamed = snapshot.items.filter((item) => Object.keys(item.names).length > 0).length;
  assert(snapshot.items.length === manifest.currentNativeItemDefinitions, 'ITEM_COUNT_CHANGED');
  await privateOutput(args.out, Buffer.from(JSON.stringify(snapshot) + '\n', 'utf8'));
  console.log(JSON.stringify({
    schema: 'wand.game-db.private-ingest-report@1',
    snapshotId: snapshot.id, platform: snapshot.target.platform,
    gameVersion: snapshot.target.gameVersion, buildId: null,
    verifiedItemDefinitions: snapshot.items.length,
    excludedUnclassifiedDefinitions: joined.excludedUnclassifiedDefinitions,
    currentlyNamedItems: currentNamed,
    publicationAuthorized: false, privateOnly: true,
    manifestSha256: manifestSHA, sqliteSha256: audit.sqliteSha256
  }));
}
run(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
