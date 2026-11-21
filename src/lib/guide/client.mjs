/** DB-03 browser-only Guide reader. No remote uploads or account calls. */
export const GUIDE_SEARCH_SCHEMA = 'wand.db03.quest-search@1';
export const GUIDE_DETAIL_SCHEMA = 'wand.db03.quest-detail-shards@1';
export const GUIDE_LOCALES = Object.freeze(['ja', 'en', 'fr', 'it', 'de', 'es-ES', 'zh-CN', 'pt-BR']);
export const MAX_SEARCH_BYTES = 16 * 1024 * 1024;
export const MAX_SHARD_BYTES = 16 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const NATIVE_ID = /^[1-9][0-9]{0,15}$/;
const SHARD = /^quest-shards\/part-(\d{2})\.json$/;
const SOURCE_FILE = 'ddv_Data/StreamingAssets/itemlist/Mission.json';

function assert(ok, message) { if (!ok) throw new TypeError('Guide: ' + message); }
function clean(value) { return String(value ?? '').normalize('NFKC').toLowerCase().trim(); }
function isObj(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function isId(value) { return typeof value === 'string' && NATIVE_ID.test(value); }
function isHash(value) { return typeof value === 'string' && HASH.test(value); }
function sameTarget(a, b) {
  return isObj(a) && isObj(b) && typeof a.gameVersion === 'string' && a.gameVersion.length > 0 &&
    typeof a.platform === 'string' && a.platform.length > 0 && a.gameVersion === b.gameVersion && a.platform === b.platform;
}

/** Structure is checked before the UI accepts user-selected data. No 1.26.1-only count assumptions. */
export function validateGuideSearch(index) {
  assert(isObj(index) && index.schema === GUIDE_SEARCH_SCHEMA, 'unsupported search index schema');
  assert(isObj(index.target) && typeof index.target.gameVersion === 'string' && index.target.gameVersion.length > 0 &&
    typeof index.target.platform === 'string' && index.target.platform.length > 0, 'source version/platform missing');
  assert(isObj(index.source) && index.source.file === SOURCE_FILE && isHash(index.source.sha256), 'source provenance missing');
  const c = index.counts;
  assert(isObj(c) && Number.isSafeInteger(c.missions) && c.missions > 0 && c.missions <= 50000 &&
    Number.isSafeInteger(c.sourceNativeRecords) && c.sourceNativeRecords >= c.missions &&
    Number.isSafeInteger(c.excludedQuestGroups) && c.excludedQuestGroups >= 0 &&
    Number.isSafeInteger(c.excludedUnclassified) && c.excludedUnclassified >= 0 &&
    c.missions + c.excludedQuestGroups + c.excludedUnclassified === c.sourceNativeRecords &&
    Array.isArray(index.records) && index.records.length === c.missions, 'incomplete source-record census');
  const seen = new Set();
  for (const row of index.records) {
    assert(isObj(row) && isId(row.id) && !seen.has(row.id), 'invalid or duplicate quest ID');
    seen.add(row.id);
    assert(isObj(row.names) && Object.entries(row.names).every(([lang, value]) =>
      GUIDE_LOCALES.includes(lang) && typeof value === 'string' && value.trim() && value.length <= 4096), 'invalid source localization');
    assert(row.internalName == null || (typeof row.internalName === 'string' && row.internalName.length <= 1024), 'invalid internal name');
    assert(row.groupId == null || isId(row.groupId), 'invalid source group ID');
    assert(row.characterId == null || isId(row.characterId), 'invalid source character ID');
    assert(row.sourceUpdateGroup == null || (typeof row.sourceUpdateGroup === 'string' && row.sourceUpdateGroup.length <= 256), 'invalid update group');
    assert(Array.isArray(row.objectiveKinds) && row.objectiveKinds.every(x => typeof x === 'string' && x.length <= 100), 'invalid objective kinds');
    assert(Array.isArray(row.sourceScopeTokens) && row.sourceScopeTokens.every(x => typeof x === 'string' && x.length <= 120), 'invalid scope tags');
    const locator = row.detail;
    const m = isObj(locator) && typeof locator.file === 'string' ? SHARD.exec(locator.file) : null;
    assert(m && +m[1] < 32 && isHash(locator.recordSha256) && isHash(locator.nativeWireSha256), 'invalid private shard locator');
  }
  return index;
}

function labelFor(row, locale) {
  if (row.names[locale]) return { text: row.names[locale], source: locale };
  if (row.names.en) return { text: row.names.en, source: 'en' };
  return { text: row.internalName || row.id, source: 'internalName' };
}

/** Client-side deterministic search, no network dependency. */
export function searchGuide(index, { query = '', locale = 'ja', character = '', group = '', update = '',
  objective = '', allLocales = false, offset = 0, limit = 40 } = {}) {
  validateGuideSearch(index);
  assert(GUIDE_LOCALES.includes(locale), 'unsupported locale');
  assert(typeof query === 'string' && query.length <= 128, 'invalid query');
  assert((!character || isId(character)) && (!group || isId(group)), 'invalid filter ID');
  assert([update, objective].every(v => typeof v === 'string' && v.length <= 256), 'invalid filter string');
  assert(typeof allLocales === 'boolean' && Number.isInteger(offset) && offset >= 0 &&
    Number.isInteger(limit) && limit > 0 && limit <= 100, 'invalid pagination/options');
  const q = clean(query), words = q.split(/\s+/).filter(Boolean), found = [];
  for (const row of index.records) {
    if ((character && row.characterId !== character) || (group && row.groupId !== group) ||
        (update && row.sourceUpdateGroup !== update) || (objective && !row.objectiveKinds.includes(objective))) continue;
    const display = labelFor(row, locale);
    let rank = 0, matched = null;
    if (words.length) {
      if (q === row.id) { rank = -1; matched = 'nativeId'; }
      else {
        const labels = [[locale, row.names[locale]]];
        if (allLocales) labels.push(...Object.entries(row.names).filter(([key]) => key !== locale));
        else if (locale !== 'en') labels.push(['en', row.names.en]);
        const matches = labels.filter(([, value]) => typeof value === 'string' && words.every(w => clean(value).includes(w)))
          .map(([lang, value]) => ({lang, rank:clean(value) === q ? 0 : clean(value).startsWith(q) ? 1 : clean(value).includes(q) ? 2 : 3}));
        if (!matches.length) continue;
        matches.sort((a,b) => a.rank - b.rank || a.lang.localeCompare(b.lang));
        rank = matches[0].rank; matched = matches[0].lang;
      }
    }
    found.push({...row, displayName:display.text, displayNameSource:display.source, matchedLocale:matched, _rank:rank});
  }
  found.sort((a,b) => a._rank - b._rank || clean(a.displayName).localeCompare(clean(b.displayName), locale) || Number(a.id) - Number(b.id));
  const rows = found.slice(offset, offset + limit).map(({_rank, ...row}) => row);
  return {total:found.length, results:rows, nextOffset:offset + limit < found.length ? offset + limit : null};
}

/** Python's json.dumps(..., sort_keys=True, ensure_ascii=False, separators=(',', ':')) for source record JSON. */
export function canonicalQuestRecord(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalQuestRecord).join(',') + ']';
  if (isObj(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalQuestRecord(value[key])).join(',') + '}';
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  throw new TypeError('Guide: unsupported source record value');
}

async function digestText(value) {
  assert(!!globalThis.crypto?.subtle, 'SHA-256 unavailable in this browser');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function jsonFile(file, maxSize) {
  assert(file && typeof file.arrayBuffer === 'function' && Number.isSafeInteger(file.size) &&
    file.size > 0 && file.size <= maxSize, 'file missing or too large');
  const bytes = await file.arrayBuffer();
  assert(bytes.byteLength <= maxSize && bytes.byteLength === file.size, 'file byte count mismatch');
  return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
}

export async function importGuideSearch(file) {
  return validateGuideSearch(await jsonFile(file, MAX_SEARCH_BYTES));
}

/** Verify chosen file, native identity and full 64-digit record content digest. */
export async function importGuideDetail(index, id, file) {
  validateGuideSearch(index);
  assert(isId(id), 'invalid quest selection');
  const row = index.records.find(x => x.id === id);
  assert(row, 'quest not in loaded source index');
  const expectedName = row.detail.file.split('/').at(-1);
  assert(file && file.name === expectedName, 'wrong detail shard selected: expected ' + expectedName);
  const doc = await jsonFile(file, MAX_SHARD_BYTES);
  assert(isObj(doc) && doc.schema === GUIDE_DETAIL_SCHEMA &&
    sameTarget(doc.target, index.target) && isObj(doc.source) &&
    doc.source.file === index.source.file && doc.source.sha256 === index.source.sha256 &&
    doc.evaluation === 'static_definition_only' &&
    Number.isInteger(doc.bucket) && String(doc.bucket).padStart(2, '0') === expectedName.slice(5, 7) &&
    Array.isArray(doc.records) && doc.records.length > 0 && doc.records.length <= 50000,
    'detail shard target or source mismatch');
  const matching = doc.records.filter(x => x?.id === id);
  assert(matching.length === 1 && matching[0].recordKind === 'mission', 'selected quest absent or not a mission');
  const record = matching[0];
  assert(record.nativeWireSha256 === row.detail.nativeWireSha256 &&
    record.source?.sha256 === index.source.sha256 && record.source?.file === index.source.file,
    'native source fingerprint mismatch');
  assert(await digestText(canonicalQuestRecord(record)) === row.detail.recordSha256,
    'quest detail SHA-256 mismatch');
  return record;
}

export function detailStepRows(record, locale = 'ja') {
  assert(GUIDE_LOCALES.includes(locale), 'unsupported detail locale');
  const steps = record?.structured?.stepsDetailed;
  if (!Array.isArray(steps)) return [];
  return steps.map((step, i) => {
    const subs = Array.isArray(step.subSteps) ? step.subSteps : [];
    const descriptions = step.descriptions ?? {};
    const text = Object.values(descriptions).flatMap(d => d?.plainText?.[locale] || d?.plainText?.en || []).find(Boolean) || '';
    return {id:String(step.stepId ?? i+1), title:String(step.stepName ?? `Step ${i+1}`), text,
      objectives: subs.flatMap(sub => Array.isArray(sub.objectives) ? sub.objectives.map(o =>
        ({kind:String(o.type ?? 'unknown'), id:String(o.objectiveId ?? '')})) : [])};
  });
}
