/** DB-01 owner-private, source-verified item catalog. No HTTP or public publishing. */
import { ITEM_LOCALES, indexItemRecords, getLocalizedName, getVerifiedIconGuid } from './records.mjs';

export const DB01_CANONICAL_SCHEMA = 'wand.db01.items@1';
export const DB01_PARTIAL_SCHEMA = 'wand.db01.partial-manifest@2';
export const DB01_RECOVERED_SCHEMA = 'wand.db01.partial-manifest@3';
const SHA = /^[0-9a-f]{64}$/;
const RECOVERED_TARGET_PROBE_SHA = '07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a';
const RECOVERED_OLDER_VERSION_SHA = 'a59c942d093c60740a447efb3bede638d3a3ee60c00ca01f898500413d670401';
const FILE = /^ddv_Data\/StreamingAssets\/itemlist\/([A-Za-z][A-Za-z0-9]*)\.json$/;
const FOUR_ITEM_CLASSES = new Set(['ActivityItem', 'Furniture', 'Clothing', 'Trimming']);
const NONDISPLAY = /^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}/i;
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function idNumber(id) {
  if (Number.isSafeInteger(id) && id > 0) return id;
  if (typeof id === 'string' && /^[1-9][0-9]*$/.test(id)) {
    const n = Number(id);
    if (Number.isSafeInteger(n)) return n;
  }
  return null;
}
function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const next of Object.values(value)) freezeDeep(next);
    Object.freeze(value);
  }
  return value;
}
function check(ok, label) { if (!ok) throw new TypeError(`DB01_${label}`); }

/** Only explicitly supported private-only, full-file-evidenced manifests are accepted.
 *  Diagnostic prefix-evidence inputs are categorically incompatible.
 */
export function validateDb01Manifest(manifest) {
  check(isObject(manifest), 'MANIFEST_REQUIRED');
  const canonical = manifest.schema === DB01_CANONICAL_SCHEMA;
  const partial = manifest.schema === DB01_PARTIAL_SCHEMA;
  const recovered = manifest.schema === DB01_RECOVERED_SCHEMA;
  check(canonical || partial || recovered, 'UNSUPPORTED_OR_SAMPLE_ONLY_SCHEMA');
  check(manifest.platform === 'Steam' && typeof manifest.gameVersion === 'string' &&
    /^\d+\.\d+\.\d+$/.test(manifest.gameVersion), 'INVALID_GAME_TARGET');
  check(manifest.publicationStatus === (canonical
    ? 'private_not_approved_for_public_catalog' : 'PRIVATE_ONLY_NO_PUBLIC_ITEMS'),
    'PRIVATE_ONLY_REQUIRED');
  if (partial) {
    check(manifest.status === 'partial_verified_native_plus_six_full_probe_classes' &&
      manifest.fullCorpusParsed === false && Array.isArray(manifest.sources) &&
      manifest.sources[0]?.schema === 'wand.src01.steam-native@1' &&
      SHA.test(manifest.sources[0].manifestSha256 ?? ''), 'UNVERIFIED_PARTIAL_SOURCE');
  } else if (recovered) {
    const source = manifest.sources?.[1];
    const native = manifest.sources?.[0];
    const proof = source?.reuseEvidence;
    check(manifest.status === 'private_38_of_39_full_native_source_evidence' &&
      manifest.fullCorpusParsed === false &&
      manifest.historicalReferenceJoined === false &&
      manifest.sourceFilesFullyShaVerified === 38 &&
      manifest.sourceFilesTotal === 39 &&
      manifest.unresolvedCategories?.length === 1 &&
      manifest.unresolvedCategories[0] === 'Condition' &&
      Array.isArray(manifest.sources) && manifest.sources.length === 2 &&
      native?.schema === 'wand.src01.steam-native@1' &&
      SHA.test(native.manifestSha256 ?? '') &&
      source?.schema === 'wand.src01.extended@1' &&
      SHA.test(source.manifestSha256 ?? '') &&
      SHA.test(source.itemsSha256 ?? '') &&
      source.probeSha256 === RECOVERED_TARGET_PROBE_SHA &&
      proof?.schema === 'wand.src01.identical-binary-reuse@1' &&
      proof.olderBaselineVersion === '1.26.1' &&
      proof.currentTargetVersion === manifest.gameVersion &&
      proof.olderFullVersionSha256 === RECOVERED_OLDER_VERSION_SHA &&
      proof.categoryFilesNotReusable?.length === 1 &&
      proof.categoryFilesNotReusable[0] === 'Condition.json' &&
      Array.isArray(proof.sameFullBytesSha256Files) &&
      proof.sameFullBytesSha256Files.length === 38 &&
      new Set(proof.sameFullBytesSha256Files).size === 38 &&
      manifest.gameVersion === '1.26.2' &&
      Array.isArray(native.verifiedCategories) &&
      native.verifiedCategories.length === FOUR_ITEM_CLASSES.size &&
      native.verifiedCategories.every(category => FOUR_ITEM_CLASSES.has(category)) &&
      manifest.verifiedCurrentLocalization?.fullCurrentLocaleMemberCount === 53 &&
      manifest.verifiedCurrentLocalization?.currentEightLocaleNamedDefinitions === 241 &&
      manifest.verifiedCurrentLocalization?.currentAnyLocaleNamedDefinitions === 506,
      'INVALID_REUSED_SOURCE_PROVENANCE');
  } else {
    check(SHA.test(manifest.inputs?.nativeManifest ?? '') &&
      SHA.test(manifest.inputs?.referenceIndex ?? ''), 'MISSING_CANONICAL_PROVENANCE');
  }
  check(isObject(manifest.byNativeCategory) &&
    Object.entries(manifest.byNativeCategory).every(([cat, count]) =>
      /^[A-Za-z][A-Za-z0-9]*$/.test(cat) && Number.isSafeInteger(count) && count >= 0),
    'BAD_NATIVE_CATEGORY_COUNTS');
  const count = canonical ? manifest.counts?.currentDefinitions : manifest.count;
  check(Number.isSafeInteger(count) && count > 0 && count <= 200000,
    'INVALID_DEFINITION_COUNT');
  check(Object.values(manifest.byNativeCategory).reduce((a, b) => a + b, 0) === count,
    'CATEGORY_TOTAL_MISMATCH');
  check(SHA.test(manifest.outputSha256?.['items.jsonl'] ?? ''), 'MISSING_ITEMS_SHA256');
  return manifest;
}

function makePrivateCatalog(manifest, records, dataSha256Verified) {
  validateDb01Manifest(manifest);
  check(Array.isArray(records), 'RECORDS_REQUIRED');
  const expected = manifest.schema === DB01_CANONICAL_SCHEMA
    ? manifest.counts.currentDefinitions : manifest.count;
  check(records.length === expected, 'RECORD_COUNT_MISMATCH');
  // A mutable consumer must not be able to change evidence after validation.
  const byId = indexItemRecords(records.map(row => structuredClone(row)));
  const counts = new Map();
  let itemCount = 0;
  let definitionCount = 0;
  for (const row of byId.values()) {
    const filename = FILE.exec(row.source?.file ?? '');
    check(filename && filename[1] === row.nativeCategory &&
      row.source.platform === manifest.platform &&
      row.source.gameVersion === manifest.gameVersion &&
      SHA.test(row.source.sha256 ?? ''), 'BAD_ROW_SOURCE');
    const isItem = FOUR_ITEM_CLASSES.has(row.nativeCategory);
    check(row.catalogDomain === (isItem ? 'item' : 'definition_unclassified'),
      'UNVERIFIED_CATALOG_DOMAIN');
    if (isItem) itemCount++; else definitionCount++;
    check(isObject(row.names) && isObject(row.verification?.names) &&
      Object.keys(row.names).length === ITEM_LOCALES.length &&
      Object.keys(row.verification.names).length === ITEM_LOCALES.length,
      'MISSING_LOCALE_CONTRACT');
    for (const locale of ITEM_LOCALES) {
      check(Object.hasOwn(row.names, locale) && Object.hasOwn(row.verification.names, locale),
        'MISSING_LOCALE');
      const name = row.names[locale];
      check((name === null && row.verification.names[locale] === 'unresolved') ||
        (typeof name === 'string' && name.trim() && !NONDISPLAY.test(name) &&
          row.verification.names[locale] === 'exact_locdb_join'), 'UNVERIFIED_NAME');
    }
    check(row.verification.itemId === 'native_frame_verified' &&
      row.verification.nativeCategory === 'native_file_verified' &&
      row.verification.currentVersionObserved === true &&
      !row.sampleOnlyLocalization && row.mergeIntoCanonicalPermitted !== false,
      'SAMPLE_OR_UNVERIFIED_RECORD');
    if (isItem) check(row.verification.iconGuid === 'native_wire_verified' &&
      getVerifiedIconGuid(row) !== null, 'NATIVE_ICON_EVIDENCE_MISSING');
    else check(row.verification.iconGuid === 'unresolved' &&
      row.image?.iconGuid === null, 'UNCLASSIFIED_ICON_NOT_VERIFIED');
    // A historical Switch record may be consulted, but never becomes a Steam classification.
    check(row.category === null && row.subcategory === null && row.worlds === null &&
      row.universes === null && row.expansions === null && row.attributes === null,
      'UNVERIFIED_CURRENT_SEMANTICS');
    if (row.historicalReference !== null && row.historicalReference !== undefined) {
      check(row.historicalReference?.source?.platform === 'Nintendo Switch' &&
        row.historicalReference?.source?.gameVersion !== manifest.gameVersion,
        'CURRENT_HISTORY_MIXUP');
    }
    counts.set(row.nativeCategory, (counts.get(row.nativeCategory) ?? 0) + 1);
  }
  for (const [category, count] of Object.entries(manifest.byNativeCategory)) {
    check((counts.get(category) ?? 0) === count, 'SOURCE_CATEGORY_COUNT_MISMATCH');
  }
  check(counts.size === Object.keys(manifest.byNativeCategory).length,
    'UNKNOWN_SOURCE_CATEGORY');
  if (manifest.schema === DB01_RECOVERED_SCHEMA) {
    const claims = manifest.sources[1].fullSourceBytesShaVerifiedCategories;
    const expectedFullFileNames = new Set([...FOUR_ITEM_CLASSES].map(cat => cat+'.json'));
    const originalFileNames = manifest.sources[1].reuseEvidence.sameFullBytesSha256Files;
    for (const name of claims ?? []) expectedFullFileNames.add(name);
    check(Array.isArray(claims) && claims.length === 34 &&
      claims.every(name => /^[A-Za-z][A-Za-z0-9]*\.json$/.test(name)) &&
      new Set(claims).size === claims.length &&
      claims.includes('ItemCondition.json') && !claims.includes('Condition.json') &&
      Array.isArray(originalFileNames) && originalFileNames.length === 38 &&
      originalFileNames.every(name => expectedFullFileNames.has(name)) &&
      expectedFullFileNames.size === 38 &&
      Object.keys(manifest.byNativeCategory).length === 37 &&
      !Object.hasOwn(manifest.byNativeCategory, 'Condition') &&
      Object.keys(manifest.byNativeCategory).every(cat => expectedFullFileNames.has(cat+'.json')),
      'INCOMPLETE_EXACT_SOURCE_COVERAGE');
    const current = manifest.verifiedCurrentLocalization.currentExactNamesByLocale;
    const actual = Object.fromEntries(ITEM_LOCALES.map(locale => [locale,0]));
    let namesInAll = 0, namesInAny = 0;
    for (const row of byId.values()) {
      let present = 0;
      for (const locale of ITEM_LOCALES) {
        if (typeof row.names[locale] === 'string') { actual[locale]++; present++; }
      }
      if (present === ITEM_LOCALES.length) namesInAll++;
      if (present) namesInAny++;
    }
    check(isObject(current) && Object.keys(current).length === ITEM_LOCALES.length &&
      ITEM_LOCALES.every(locale => Number.isSafeInteger(current[locale]) &&
        actual[locale] === current[locale]) &&
      namesInAll === manifest.verifiedCurrentLocalization.currentEightLocaleNamedDefinitions &&
      namesInAny === manifest.verifiedCurrentLocalization.currentAnyLocaleNamedDefinitions,
      'CURRENT_LOCALE_COUNTS_MISMATCH');
  }
  if (manifest.schema === DB01_CANONICAL_SCHEMA) {
    check(manifest.counts.verifiedFourNativeItems === itemCount &&
      manifest.counts.additionalDefinitionRecords === definitionCount,
      'CANONICAL_DOMAIN_COUNT_MISMATCH');
  } else {
    check(manifest.catalogDomains?.collectionItem === itemCount &&
      manifest.catalogDomains?.unclassifiedDefinition === definitionCount,
      'PARTIAL_DOMAIN_COUNT_MISMATCH');
  }

  const list = Object.freeze([...byId.values()].map(freezeDeep));
  const source = Object.freeze({platform:manifest.platform, gameVersion:manifest.gameVersion,
    manifestSchema:manifest.schema, fullCorpusParsed:false, privateOnly:true,
    publicationAuthorized:false, dataSha256Verified, itemCount, unclassifiedDefinitions:definitionCount,
    sourceManifestSha256: manifest.schema === DB01_CANONICAL_SCHEMA
      ? manifest.inputs.nativeManifest : manifest.sources[0].manifestSha256});
  return Object.freeze({
    source,
    getItem(id) { const key = idNumber(id); return key === null ? null : byId.get(key) ?? null; },
    getDisplayItem(id, locale, {fallback=null}={}) {
      check(ITEM_LOCALES.includes(locale), 'INVALID_LOCALE');
      const item = this.getItem(id);
      if (!item) return null;
      return Object.freeze({itemId:item.itemId, nativeCategory:item.nativeCategory,
        catalogDomain:item.catalogDomain,
        displayName:getLocalizedName(item,locale,{fallback}),
        iconGuid:getVerifiedIconGuid(item),
        hasVerifiedCurrentClassification:false,
        source:{platform:item.source.platform,gameVersion:item.source.gameVersion},
        historicMetadataAvailable:Boolean(item.historicalReference)});
    },
    search(query, {locale='en',fallback=null,limit=100,includeUnclassified=false}={}) {
      check(ITEM_LOCALES.includes(locale) &&
        (fallback===null || ITEM_LOCALES.includes(fallback)), 'INVALID_LOCALE');
      check(Number.isSafeInteger(limit) && limit >= 0 && limit <= 1000, 'INVALID_SEARCH_LIMIT');
      const q=String(query ?? '').trim().toLocaleLowerCase();
      const result=[];
      if (!q || limit === 0) return result;
      for (const item of list) {
        if (!includeUnclassified && item.catalogDomain !== 'item') continue;
        const name=getLocalizedName(item,locale,{fallback});
        if (String(item.itemId).includes(q) || name?.toLocaleLowerCase().includes(q)) {
          result.push(this.getDisplayItem(item.itemId,locale,{fallback}));
          if (result.length===limit) break;
        }
      }
      return result;
    },
    /** Raw records remain owner-private, and unclassified definitions are never auto-promoted. */
    currentNativeItems() { return list.filter(r=>r.catalogDomain==='item'); },
    unclassifiedDefinitions() { return list.filter(r=>r.catalogDomain==='definition_unclassified'); },
    historicalReference(id) { return this.getItem(id)?.historicalReference ?? null; },
  });
}

/** For pre-parsed trusted data. The returned catalog cannot be bridged to DB-00
 *  until the raw JSONL hash has been checked via openPrivateItemCatalog().
 */
export function createPrivateItemCatalog(manifest, records) {
  return makePrivateCatalog(manifest, records, false);
}

/** Prefer this path for local uploads; SHA-256 binds bytes to the manifest. */
export async function openPrivateItemCatalog(manifest, jsonlBytes) {
  validateDb01Manifest(manifest);
  const bytes = jsonlBytes instanceof ArrayBuffer ? new Uint8Array(jsonlBytes) : jsonlBytes;
  check(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= 128*1024*1024,
    'INVALID_ITEMS_FILE');
  check(globalThis.crypto?.subtle, 'SHA256_UNAVAILABLE');
  const sha = [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))]
    .map(v=>v.toString(16).padStart(2,'0')).join('');
  check(sha === manifest.outputSha256['items.jsonl'], 'ITEMS_HASH_MISMATCH');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const lines=text.split('\n');
  if (lines.at(-1)==='') lines.pop();
  check(lines.length>0 && lines.every(line=>line.length && line.length<=65536),
    'INVALID_JSONL_FRAMES');
  return makePrivateCatalog(manifest, lines.map(line=>JSON.parse(line)), true);
}
