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

/** Optional same-target character labels from native extracted character definitions.
 * They enrich a local filter only; never change mission IDs or search coverage.
 */
export function guideCharacterLabels(payload, index) {
  validateGuideSearch(index);
  assert(isObj(payload) && payload.schema === 'wand.db03.native-guide@1' &&
    payload.family === 'characters' && sameTarget(payload.target, index.target) &&
    Array.isArray(payload.records) && payload.records.length > 0 && payload.records.length <= 10000,
    'character labels require a same-version native character source');
  const referenced = new Set(index.records.map(row => row.characterId).filter(Boolean));
  /** @type {Record<string, Record<string, string>>} */
  const labels = {};
  const seen = new Set();
  let sourceSha = null;
  for (const row of payload.records) {
    assert(isObj(row) && isId(row.id) && !seen.has(row.id) &&
      isHash(row.nativeWireSha256) && isObj(row.source) &&
      row.source.file === 'ddv_Data/StreamingAssets/itemlist/Character.json' &&
      isHash(row.source.sha256) && isObj(row.names) &&
      Object.entries(row.names).every(([lang, value]) => GUIDE_LOCALES.includes(lang) &&
        typeof value === 'string' && value.trim() && value.length <= 4096),
      'invalid or duplicate source character label');
    if (sourceSha !== null) assert(sourceSha === row.source.sha256, 'mixed character source fingerprints');
    sourceSha = row.source.sha256;
    seen.add(row.id);
    if (referenced.has(row.id)) labels[row.id] = row.names;
  }
  return labels;
}

/** Accept a locally selected Guide directory without uploading or preloading shards.
 *
 * A browser `webkitdirectory` selection returns File.webkitRelativePath paths
 * such as `guide/quest-search.json` or `snapshot/guide/quest-search.json`.
 * The path is treated as a relative grouping hint, never a filesystem URL.
 * Only one matching source index is allowed, and detail files must share its
 * parent prefix. No unrelated original files are read, and shard bytes stay
 * unread until the user opens an individual quest.
 */
export async function importGuideFolder(files) {
  assert(Array.isArray(files) && files.length > 0 && files.length <= 10000,
    'Guide folder must contain between 1 and 10000 files');
  const candidates = [];
  for (const file of files) {
    assert(file && typeof file.name === 'string' && typeof file.arrayBuffer === 'function' &&
      Number.isSafeInteger(file.size) && file.size >= 0, 'invalid Guide folder file');
    const path = typeof file.webkitRelativePath === 'string' && file.webkitRelativePath
      ? file.webkitRelativePath : file.name;
    assert(path.length <= 1024 && !path.includes('\\') && !path.includes('\0') &&
      path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..'),
      'invalid relative Guide file path');
    if (path === 'guide/quest-search.json' || path.endsWith('/guide/quest-search.json')) {
      candidates.push({path, file});
    }
  }
  assert(candidates.length === 1, 'Guide folder requires exactly one guide/quest-search.json');
  const chosen = candidates[0];
  const prefix = chosen.path.slice(0, -'guide/quest-search.json'.length);
  const index = await importGuideSearch(chosen.file);
  const characterPath = prefix + 'guide/characters.json';
  const characterFiles = files.filter(file => (file.webkitRelativePath || file.name) === characterPath);
  assert(characterFiles.length <= 1, 'duplicate native character data file');
  /** @type {Record<string, Record<string, string>>} */
  const characterNames = characterFiles.length
    ? guideCharacterLabels(await jsonFile(characterFiles[0], MAX_SEARCH_BYTES), index) : {};
  const needed = new Set(index.records.map(row => row.detail.file.split('/').at(-1)));
  /** @type {Record<string, File>} */
  /** @type {Record<string, File>} */
  const shardFiles = {};
  for (const file of files) {
    const path = typeof file.webkitRelativePath === 'string' && file.webkitRelativePath
      ? file.webkitRelativePath : file.name;
    if (!path.startsWith(prefix + 'guide/quest-shards/')) continue;
    const name = path.slice((prefix + 'guide/quest-shards/').length);
    if (!/^(?:part-(?:0\d|[12]\d|3[01])\.json)$/.test(name) || !needed.has(name)) continue;
    assert(!Object.prototype.hasOwnProperty.call(shardFiles, name),
      'duplicate Guide detail shard in selected folder: ' + name);
    assert(file.size > 0 && file.size <= MAX_SHARD_BYTES,
      'Guide detail shard missing or too large: ' + name);
    shardFiles[name] = file;
  }
  assert(Object.keys(shardFiles).length > 0, 'Guide folder has no matching detail shards');
  return {index, shardFiles, characterNames, matchedShards: Object.keys(shardFiles).length,
    requiredShards: needed.size};
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

/** Resolve only source-localized descriptions, never fabricate quest instructions. */
export function guideSourceText(definition, locale = 'ja') {
  assert(GUIDE_LOCALES.includes(locale), 'unsupported detail locale');
  if (!isObj(definition) || !isObj(definition.plainText)) return {text:'', locale:null};
  const sourceLocale = typeof definition.plainText[locale] === 'string' && definition.plainText[locale].trim()
    ? locale : typeof definition.plainText.en === 'string' && definition.plainText.en.trim() ? 'en' : null;
  if (!sourceLocale) return {text:'', locale:null};
  // Original plainText already strips <nobr> and soft hyphens; some game UI
  // markup survives. Render only literal text (Svelte escapes output).
  const text = definition.plainText[sourceLocale]
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/?(?:nobr|smallcaps|nbsp)\s*>/gi, '')
    .replace(/&nbsp;|\u00a0/gi, ' ')
    .replace(/[\u00ad\u200b-\u200d\ufeff]/g, '')
    .trim();
  return {text, locale:sourceLocale};
}

/** Show *source-defined candidates*, never interpret alternative items as all required. */
export function guideItemTargets(targets) {
  if (!isObj(targets) || targets.schema !== 'wand.db03.mission-items@1') {
    return {configuredQuantity:null, candidates:[], totalCandidates:0};
  }
  const amount = targets.amount;
  const configuredQuantity = isObj(amount) && amount.kind === 'value' &&
    Number.isSafeInteger(amount.value) && amount.value >= 0 ? amount.value : null;
  const candidates = [];
  const seen = new Set();
  for (const selector of Array.isArray(targets.selectors) ? targets.selectors : []) {
    for (const item of Array.isArray(selector?.itemCandidates) ? selector.itemCandidates : []) {
      if (!isId(item?.id)) continue;
      const role = item.role === 'direct' ? 'direct' : 'alternative';
      const key = item.id + ':' + role;
      if (seen.has(key)) continue;
      seen.add(key);
      if (candidates.length < 32) candidates.push({id:item.id, role});
    }
  }
  return {configuredQuantity, candidates, totalCandidates:seen.size};
}

/** Faithful, human-readable steps with individual original objective descriptions. */
export function detailStepRows(record, locale = 'ja') {
  assert(GUIDE_LOCALES.includes(locale), 'unsupported detail locale');
  const steps = record?.structured?.stepsDetailed;
  if (!Array.isArray(steps)) return [];
  return steps.map((step, i) => {
    const subs = Array.isArray(step.subSteps) ? step.subSteps : [];
    const description = guideSourceText(step.descriptions?.stepDescription ??
      step.descriptions?.stepDescriptionMobile, locale);
    const story = guideSourceText(step.descriptions?.storyDescription, locale);
    const objectives = [];
    for (const [subIndex, sub] of subs.entries()) {
      const subText = guideSourceText(sub.descriptions?.stepDescription ??
        sub.descriptions?.stepDescriptionMobile, locale);
      const nativeObjectives = Array.isArray(sub.objectives) ? sub.objectives : [];
      for (const [objectiveIndex, objective] of nativeObjectives.entries()) {
        const source = guideSourceText(objective.descriptions?.stepDescription ??
          objective.descriptions?.stepDescriptionMobile, locale);
        const inherited = source.text ? source : objectiveIndex === 0 ? subText : {text:'',locale:null};
        objectives.push({
          kind:String(objective.type ?? 'unknown'), id:String(objective.objectiveId ?? ''),
          text:inherited.text, textSource:inherited.locale,
          descriptionLevel:source.text ? 'objective' : inherited.text ? 'subStep' : null,
          subStepIndex:subIndex,
          ...guideItemTargets(objective.itemTargets)
        });
      }
    }
    return {id:String(step.stepId ?? i+1), title:String(step.stepName ?? `Step ${i+1}`),
      text:description.text, textSource:description.locale,
      storyText:story.text, storyTextSource:story.locale, objectives};
  });
}
