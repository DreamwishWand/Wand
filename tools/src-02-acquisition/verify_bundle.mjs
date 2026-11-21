#!/usr/bin/env node
/** Private SRC-02 bundle integrity gate. No network, writes, or public asset export. */
import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAcquisitionDatabase } from '../../src/lib/acquisition/index.mjs';
import { createAcquisitionCatalogJoin } from '../../src/lib/acquisition/db00-join.mjs';

const SHA = /^[0-9a-f]{64}$/;
// SHA-256 of original Steam 1.26.2 Condition.json from the independent SRC-01 format probe.
export const CURRENT_STEAM_1262_CONDITION_SHA256 = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const DATASETS = Object.freeze({
  'recipes.jsonl': 'recipes',
  'acquisitions.jsonl': 'acquisitions',
  'loot-tables.jsonl': 'lootTables',
  'shop-offers.jsonl': 'shopOffers',
  'stall-sources.jsonl': 'stallSources',
  'related-items.jsonl': 'relatedItems',
  'ingredient-selector-membership.jsonl': 'ingredientMembership',
  'condition-gates.jsonl': 'conditionGates',
  'condition-definitions.jsonl': 'conditionDefinitions',
  'report.json': 'report',
  'unresolved.json': 'unresolved',
});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, reason) => { if (!ok) throw new Error('SRC02_VERIFY_' + reason); };

/** Freeze every JSON source record after digest validation; no mutable alias escapes. */
function freezeParsedJson(root) {
  const seen = new WeakSet();
  const queue = [root];
  while (queue.length) {
    const value = queue.pop();
    if (value === null || typeof value !== 'object' || seen.has(value)) continue;
    const proto = Object.getPrototypeOf(value);
    check(Array.isArray(value) || proto === Object.prototype || proto === null,
      'UNEXPECTED_PARSED_OBJECT');
    seen.add(value);
    for (const child of Object.values(value)) {
      if (child !== null && typeof child === 'object') queue.push(child);
    }
    Object.freeze(value);
  }
  return root;
}

async function bytesFromRegularFile(path, max = MAX_FILE_BYTES) {
  const info = await lstat(path);
  check(info.isFile() && !info.isSymbolicLink() && info.size <= max,
    'NOT_REGULAR_FILE_OR_OVERSIZE_' + path.split(/[\\/]/).pop());
  return readFile(path);
}

function rows(bytes, filename) {
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return decoded.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    let value;
    try { value = JSON.parse(line); }
    catch { throw new Error(`SRC02_VERIFY_INVALID_JSONL_${filename}_${index + 1}`); }
    check(value !== null && typeof value === 'object' && !Array.isArray(value),
      'NON_OBJECT_JSONL_' + filename);
    return [value];
  });
}

function countChecks(bundle) {
  const { manifest, report, unresolved, recipes, acquisitions, lootTables,
    stallSources, shopOffers, relatedItems, conditionGates, conditionDefinitions, ingredientMembership } = bundle;
  const expected = manifest.counts;
  check(expected && typeof expected === 'object' && report.schema === 'wand.src02.report@1' &&
    report.status === manifest.status && JSON.stringify(expected) === JSON.stringify(report.counts),
    'REPORT_COUNTS_MISMATCH');
  const equality = (name, count) => check(expected[name] === count, 'COUNT_' + name);
  equality('recipes', recipes.length);
  equality('cooking', recipes.filter(r => r.type === 'cooking').length);
  equality('crafting', recipes.filter(r => r.type === 'crafting').length);
  equality('acquisitions', acquisitions.length);
  equality('growing', acquisitions.filter(r => r.type === 'growing').length);
  equality('lootTables', lootTables.length);
  equality('shopOffersVerified', shopOffers.length);
  equality('stallsWithStaticLoot', stallSources.length);
  equality('stallLootSlots', stallSources.reduce((n, row) => n + row.slotLootTableIds.length, 0));
  equality('distinctStallLootTables', new Set(stallSources.flatMap(row => row.slotLootTableIds)).size);
  equality('linkedItemIds', relatedItems.length);
  if (ingredientMembership !== null) {
    equality('ingredientSelectorMembers', ingredientMembership.length);
    check(expected.ingredientSelectorSourceDefinitions === 4050, 'INGREDIENT_SOURCE_DEFINITION_COUNT');
  }
  equality('conditionGates', conditionGates.length);
  equality('conditionDefinitions', conditionDefinitions.length);
  equality('conditionGateUsages', conditionGates.reduce((sum, gate) => sum + gate.usedBy.length, 0));
  check(Number.isSafeInteger(expected.conditionSourceDefinitions) &&
    expected.conditionSourceDefinitions >= conditionDefinitions.length,
    'CONDITION_SOURCE_DEFINITION_COUNT');
  check(unresolved.schema === 'wand.src02.unresolved@1' &&
    Array.isArray(unresolved.missingInPartialSrc01) &&
    Array.isArray(unresolved.unsupportedActivityDefinitions) &&
    unresolved.notAStatementOfAbsence === true, 'UNRESOLVED_SCHEMA');
  equality('unsupportedActivityDefinitions', unresolved.unsupportedActivityDefinitions.length);
  equality('unresolvedLinkedItemIds', unresolved.missingInPartialSrc01.length);
  const missing = new Set(unresolved.missingInPartialSrc01);
  if (ingredientMembership !== null) {
    check(Array.isArray(unresolved.selectorsNotFoundInObservedCookingFamilies) &&
      unresolved.selectorsNotFoundInObservedCookingFamilies.length === expected.ingredientSelectorIdsWithoutObservedMembers,
      'UNRESOLVED_INGREDIENT_SELECTORS');
  }
  check(missing.size === unresolved.missingInPartialSrc01.length &&
    relatedItems.every(row => row.inSrc01 === !missing.has(row.itemId)) &&
    relatedItems.filter(row => !row.inSrc01).length === missing.size &&
    relatedItems.every(row => Number.isSafeInteger(row.itemId) && row.itemId > 0),
    'SRC01_RELATION_MEMBERSHIP_MISMATCH');
}

/** The returned data is verified but still PRIVATE: callers must not publish it. */
export async function loadVerifiedAcquisitionBundle(directory, { src01ManifestPath, expectedManifestSha256 } = {}) {
  check(typeof directory === 'string' && directory.length > 0, 'MISSING_DIRECTORY');
  const root = resolve(directory);
  const info = await lstat(root);
  check(info.isDirectory() && !info.isSymbolicLink(), 'INVALID_DIRECTORY');
  const manifestBytes = await bytesFromRegularFile(join(root, 'manifest.json'), 1024 * 1024);
  const manifestSha256 = digest(manifestBytes);
  if (expectedManifestSha256 !== undefined) {
    check(typeof expectedManifestSha256 === 'string' && SHA.test(expectedManifestSha256),
      'INVALID_EXPECTED_MANIFEST_SHA256');
    check(manifestSha256 === expectedManifestSha256, 'TRUSTED_MANIFEST_SHA256_MISMATCH');
  }
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
  check(manifest.schema === 'wand.src02@1' && manifest.status === 'partial_native_extraction' &&
    manifest.platform === 'Steam' && manifest.gameVersion === '1.26.2' &&
    manifest.source && SHA.test(manifest.source.src01ManifestSha256) &&
    SHA.test(manifest.source.src01ItemsSha256) &&
    SHA.test(manifest.source.conditionSha256), 'UNSUPPORTED_MANIFEST');
  check(manifest.source.conditionSha256 === CURRENT_STEAM_1262_CONDITION_SHA256,
    'STALE_OR_UNVERIFIED_CONDITION_SOURCE');
  const hasMembership = manifest.files?.['ingredient-selector-membership.jsonl'] !== undefined;
  const dataSets = { ...DATASETS };
  if (!hasMembership) delete dataSets['ingredient-selector-membership.jsonl'];
  check(hasMembership === (manifest.counts?.ingredientSelectorMembers !== undefined),
    'INGREDIENT_MEMBERSHIP_LEDGER_STATUS');
  check(manifest.files && typeof manifest.files === 'object' &&
    JSON.stringify(Object.keys(manifest.files).sort()) === JSON.stringify(Object.keys(dataSets).sort()),
    'FILE_LEDGER_MISMATCH');
  const loaded = { manifest, ingredientMembership: null };
  for (const [file, key] of Object.entries(dataSets)) {
    check(SHA.test(manifest.files[file]), 'INVALID_DIGEST_' + file);
    const bytes = await bytesFromRegularFile(join(root, file));
    check(digest(bytes) === manifest.files[file], 'DIGEST_MISMATCH_' + file);
    loaded[key] = file.endsWith('.jsonl') ? rows(bytes, file) :
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }
  if (src01ManifestPath !== undefined) {
    const src01Bytes = await bytesFromRegularFile(src01ManifestPath, 1024 * 1024);
    check(digest(src01Bytes) === manifest.source.src01ManifestSha256, 'SRC01_MANIFEST_DIGEST_MISMATCH');
    const src01 = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(src01Bytes));
    check(src01.schema === 'wand.src01.steam-native@1' &&
      src01.platform === manifest.platform && src01.gameVersion === manifest.gameVersion &&
      src01.itemsSha256 === manifest.source.src01ItemsSha256 &&
      src01.itemCount === manifest.counts.sourceItems, 'SRC01_MANIFEST_TARGET_MISMATCH');
  }
  countChecks(loaded);
  // Fails closed for duplicated keys, missing recipes, broken loot refs and invalid stall links.
  createAcquisitionDatabase(loaded);
  freezeParsedJson(loaded);
  return Object.freeze({ ...loaded, verified: true, privateSource: true,
    manifestSha256 });
}

/**
 * The safe Node entrypoint for DB-00: a manifest hash from a separately
 * trusted source is mandatory, rather than trusting hashes stored alongside
 * data by the same potentially modified producer.
 */
export async function loadPinnedAcquisitionCatalogJoin(snapshot, {
  directory, expectedManifestSha256, src01ManifestPath,
} = {}) {
  check(typeof expectedManifestSha256 === 'string' && SHA.test(expectedManifestSha256),
    'TRUSTED_MANIFEST_SHA256_REQUIRED');
  const bundle = await loadVerifiedAcquisitionBundle(directory, {
    src01ManifestPath, expectedManifestSha256,
  });
  return createAcquisitionCatalogJoin(snapshot, bundle);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const options = {};
  let valid = argv[0] === 'verify' && argv.length >= 3 && argv.length <= 7 && argv.length % 2 === 1;
  const keys = { '--dir': 'directory', '--src01-manifest': 'src01ManifestPath',
    '--expected-manifest-sha256': 'expectedManifestSha256' };
  if (valid) for (let i = 1; i < argv.length; i += 2) {
    const name = keys[argv[i]];
    if (!name || name in options || !argv[i+1]) { valid = false; break; }
    options[name] = argv[i+1];
  }
  valid &&= Boolean(options.directory);
  if (!valid) {
    console.error('Usage: node tools/src-02-acquisition/verify_bundle.mjs verify --dir PRIVATE_DIR [--src01-manifest SRC01_MANIFEST] [--expected-manifest-sha256 TRUSTED_SHA256]');
    process.exitCode = 2;
  } else {
    loadVerifiedAcquisitionBundle(options.directory, options).then(bundle => {
      // Deliberately no records, local paths or proprietary payloads in stdout.
      console.log(JSON.stringify({ schema: 'wand.src02.bundle-verification@1',
        status: options.expectedManifestSha256 ? 'trusted_manifest_pinned_private' : 'internally_consistent_private',
        manifestSha256: bundle.manifestSha256,
        platform: bundle.manifest.platform, gameVersion: bundle.manifest.gameVersion,
        counts: bundle.manifest.counts }));
    }).catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}