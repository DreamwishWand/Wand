/** Owner-private, read-only *historical* locale candidate overlay for DB-01.
 *  Current v1.26.2 ZIP member SHA-256 is NOT verified by size/CRC/prefix matches.
 */
import { ITEM_LOCALES, getLocalizedName } from './records.mjs';

export const DB01_HISTORICAL_CANDIDATES_SCHEMA = 'wand.db01.historical-locale-correlations@1';
const EXPECTED_SOURCE = 'wand.db01.partial-manifest@3';
const SHA = /^[0-9a-f]{64}$/;
const NONDISPLAY = /^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}/i;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const LOCALES = new Set(ITEM_LOCALES);
const BASELINE = '1.26.1';
const TARGET = '1.26.2';
function check(test, code) {
  if (!test) throw new TypeError(`DB01_HISTORICAL_${code}`);
}
function toId(value) {
  if (Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)))
    return Number(value);
  return null;
}

export function validateHistoricalCandidatesManifest(manifest) {
  check(isObject(manifest) && manifest.schema === DB01_HISTORICAL_CANDIDATES_SCHEMA,
    'INVALID_MANIFEST_SCHEMA');
  check(manifest.status === 'PRIVATE_HISTORICAL_CANDIDATE_NOT_CURRENT_OFFICIAL' &&
    manifest.publicationStatus === 'PRIVATE_ONLY' &&
    manifest.mergeIntoCanonicalPermitted === false, 'PUBLICATION_OR_PROMOTION_FORBIDDEN');
  check(manifest.historicalGameVersion === BASELINE &&
    manifest.targetGameVersion === TARGET &&
    SHA.test(manifest.historicalFullVersionSha256 ?? '') &&
    SHA.test(manifest.targetProbeSha256 ?? ''), 'INVALID_VERSION_EVIDENCE');
  check(manifest.sourceCatalog?.schema === EXPECTED_SOURCE &&
    manifest.sourceCatalog.platform === 'Steam' &&
    manifest.sourceCatalog.gameVersion === TARGET &&
    manifest.sourceCatalog.items === 33627 &&
    SHA.test(manifest.sourceCatalog.itemsSha256 ?? '') &&
    SHA.test(manifest.sourceCatalog.manifestSha256 ?? ''), 'UNVERIFIED_SOURCE_CATALOG');
  check(Array.isArray(manifest.locales) && manifest.locales.length === ITEM_LOCALES.length &&
    manifest.locales.every((locale, index) => locale === ITEM_LOCALES[index]),
    'INVALID_LOCALE_LIST');
  check(manifest.counts?.membersCorrelatedBySizeCrcAndPrefix === 120 &&
    Number.isSafeInteger(manifest.counts?.candidateDefinitions) &&
    manifest.counts.candidateDefinitions > 0 &&
    manifest.counts.candidateDefinitions <= manifest.sourceCatalog.items &&
    Number.isSafeInteger(manifest.counts?.allEightHistoricalNames) &&
    manifest.counts.allEightHistoricalNames <= manifest.counts.candidateDefinitions &&
    Number.isSafeInteger(manifest.counts?.officialCurrentValueComparisons),
    'BAD_PROVENANCE_COUNTS');
  check(SHA.test(manifest.outputSha256?.['historical-locale-candidates.jsonl'] ?? '') &&
    SHA.test(manifest.outputSha256?.['report.json'] ?? ''), 'MISSING_OUTPUT_HASH');
  check(isObject(manifest.memberComparisons) &&
    Object.keys(manifest.memberComparisons).length === ITEM_LOCALES.length,
    'INVALID_MEMBER_PROVENANCE');
  const categorySets = [];
  for (const locale of ITEM_LOCALES) {
    const record = manifest.memberComparisons[locale];
    check(isObject(record) && SHA.test(record.baselineZipSha256 ?? '') &&
      SHA.test(record.targetZipSha256FromProbe ?? '') &&
      record.targetZipSha256FromProbe !== record.baselineZipSha256 &&
      isObject(record.members) && Object.keys(record.members).length === 15,
      'INVALID_ARCHIVE_PROVENANCE');
    categorySets.push(Object.keys(record.members).sort().join(','));
    for (const member of Object.values(record.members)) {
      check(SHA.test(member.baselineFullMemberSha256 ?? '') &&
        SHA.test(member.currentMemberPrefixSha256 ?? '') &&
        Number.isSafeInteger(member.currentMemberBytesFromProbe) &&
        member.currentMemberBytesFromProbe > 0 &&
        Number.isSafeInteger(member.currentMemberPrefixBytes) &&
        member.currentMemberPrefixBytes > 0 &&
        member.currentMemberPrefixBytes <= member.currentMemberBytesFromProbe &&
        /^[a-f0-9]{8}$/.test(member.currentMemberCrc32FromProbe ?? '') &&
        typeof member.currentFullMemberSha256Verified === 'boolean' &&
        member.currentFullMemberSha256Verified ===
          (member.currentMemberPrefixBytes === member.currentMemberBytesFromProbe),
      'INVALID_MEMBER_PROOF');
    }
  }
  check(categorySets.every(categories => categories === categorySets[0]),
    'MISMATCHED_CATEGORY_SET');
  return manifest;
}

/** Bytes must be checked before JSONL can be used. Catalog must already have
 *  had its own raw 33,627-row JSONL verified by openPrivateItemCatalog().
 */
export async function openPrivateHistoricalCandidates(manifest, jsonlBytes, catalog) {
  validateHistoricalCandidatesManifest(manifest);
  check(catalog?.source?.privateOnly === true &&
    catalog.source.dataSha256Verified === true &&
    catalog.source.manifestSchema === EXPECTED_SOURCE &&
    catalog.source.gameVersion === TARGET &&
    catalog.source.dataSha256 === manifest.sourceCatalog.itemsSha256 &&
    typeof catalog.getItem === 'function', 'CURRENT_CATALOG_NOT_HASH_MATCHED');
  const bytes = jsonlBytes instanceof ArrayBuffer ? new Uint8Array(jsonlBytes) : jsonlBytes;
  check(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= 64*1024*1024,
    'INVALID_CANDIDATE_BYTES');
  check(globalThis.crypto?.subtle, 'SHA256_UNAVAILABLE');
  const rawHash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const sha = [...new Uint8Array(rawHash)].map(v => v.toString(16).padStart(2, '0')).join('');
  check(sha === manifest.outputSha256['historical-locale-candidates.jsonl'],
    'CANDIDATE_FILE_HASH_MISMATCH');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const lines = text.trimEnd().split('\n');
  check(lines.length === manifest.counts.candidateDefinitions &&
    lines.every(line => line.length > 0 && line.length <= 16384),
    'CANDIDATE_COUNT_MISMATCH');
  const byId = new Map();
  let namedAll = 0, confirmed = 0;
  for (const line of lines) {
    const row = JSON.parse(line);
    const id = toId(row.itemId);
    const current = id === null ? null : catalog.getItem(id);
    check(id !== null && !byId.has(id) && current &&
      row.nativeCategory === current.nativeCategory &&
      row.baselineGameVersion === BASELINE &&
      row.targetGameVersion === TARGET &&
      row.mergeIntoCanonicalPermitted === false &&
      row.otherLocaleEvidence ===
        'previous_version_full_source_correlated_with_current_size_crc32_prefix_only',
      'CANDIDATE_SOURCE_MISMATCH');
    const cat = current.nativeCategory;
    const expectedKey = ['ActivityItem', 'Furniture', 'Clothing', 'Trimming'].includes(cat)
      ? current.nativeNameField + '_DisplayName'
      : (current.localizationKey?.startsWith(cat + '.') ?
          current.localizationKey.slice(cat.length+1) : null);
    check(expectedKey && row.localizationKey === expectedKey &&
      Object.hasOwn(manifest.memberComparisons.en.members, cat),
      'NONEXACT_CURRENT_ITEM_KEY');
    check(isObject(row.namesHistorical) && Object.keys(row.namesHistorical).length === LOCALES.size &&
      Array.isArray(row.currentExactSourceVerifiedLocales) &&
      row.currentExactSourceVerifiedLocales.every(locale => LOCALES.has(locale)) &&
      new Set(row.currentExactSourceVerifiedLocales).size === row.currentExactSourceVerifiedLocales.length,
      'INVALID_LOCALE_CANDIDATE');
    const names = {};
    const verified = [];
    for (const locale of ITEM_LOCALES) {
      check(Object.hasOwn(row.namesHistorical, locale), 'MISSING_CANDIDATE_LOCALE');
      const value = row.namesHistorical[locale];
      check(value === null || (typeof value === 'string' && value.trim() && !NONDISPLAY.test(value)),
        'INVALID_CANDIDATE_LABEL');
      const official = getLocalizedName(current, locale);
      if (official !== null) {
        check(official === value, 'CURRENT_OFFICIAL_NAME_CONFLICT');
        verified.push(locale);
        confirmed++;
      }
      names[locale] = value;
    }
    check(JSON.stringify(verified) === JSON.stringify(row.currentExactSourceVerifiedLocales),
      'CURRENT_VERIFICATION_SCOPE_MISMATCH');
    if (ITEM_LOCALES.every(locale => names[locale])) namedAll++;
    byId.set(id, Object.freeze({itemId:id, nativeCategory:cat,
      namesHistorical:Object.freeze(names), currentExactSourceVerifiedLocales:Object.freeze(verified)}));
  }
  check(namedAll === manifest.counts.allEightHistoricalNames &&
    confirmed === manifest.counts.officialCurrentValueComparisons,
    'LOCALE_TOTALS_MISMATCH');
  const get = id => { const n = toId(id); return n === null ? null : byId.get(n) ?? null; };
  return Object.freeze({
    privateOnly:true, publishable:false, mergeIntoCanonicalPermitted:false,
    count:byId.size, historicalGameVersion:BASELINE, targetGameVersion:TARGET,
    /** Historical names are opt-in and returned with their verification state.
     *  With the default option, no historical labels appear as current names. */
    getName(id, locale, { allowHistorical=false }={}) {
      check(LOCALES.has(locale), 'UNKNOWN_LOCALE');
      const current = catalog.getItem(toId(id));
      if (!current) return null;
      const official = getLocalizedName(current, locale);
      if (official !== null) return Object.freeze({itemId:current.itemId, value:official,
        locale, status:'verified_current_locdb', currentVerified:true,
        gameVersion:TARGET});
      if (!allowHistorical) return null;
      const historical = get(id)?.namesHistorical[locale];
      if (!historical) return null;
      return Object.freeze({itemId:current.itemId, value:historical, locale,
        status:'historical_prefix_crc_correlated_unverified_current',
        currentVerified:false, gameVersion:BASELINE, candidateTargetVersion:TARGET});
    },
    /** Never expose historical candidates as claims of current ownership/collectibility. */
    getHistoricalRecord(id) { return get(id) ?? null; },
  });
}