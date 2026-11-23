/** DB-03 source-only local Guide file reader.
 * The original 1.26.1 search and Quest shards retain their source identity;
 * a SHA-pinned original may match Steam 1.26.2 without relabelling it.
 * No Save, server, current unlock, game text or private file is uploaded.
 */
export type GuideLanguage='ja'|'en'|'fr'|'it'|'de'|'es-ES'|'zh-CN'|'pt-BR';
export interface LocalGuideFile{
  readonly name:string;
  readonly size:number;
  readonly webkitRelativePath?:string;
  arrayBuffer():Promise<ArrayBuffer>;
}
export interface OriginalGuideQuestRow{
  readonly id:string;
  readonly names:Readonly<Record<string,string>>;
  readonly internalName:string|null;
  readonly characterId:string|null;
  readonly groupId:string|null;
  readonly sourceUpdateGroup:string|null;
  readonly objectiveKinds:readonly string[];
  readonly sourceScopeTokens:readonly string[];
  readonly detail:Readonly<{file:string;recordSha256:string;nativeWireSha256:string}>;
}
export interface OriginalGuideSearch{
  readonly schema:'wand.db03.quest-search@1';
  readonly target:Readonly<{gameVersion:string;platform:string}>;
  readonly source:Readonly<{file:string;sha256:string}>;
  readonly counts:Readonly<{missions:number;sourceNativeRecords:number;excludedQuestGroups:number;excludedUnclassified:number}>;
  readonly records:readonly OriginalGuideQuestRow[];
}
export interface OriginalGuideGroup{
  readonly id:string;
  readonly rawName:string;
  readonly names:Readonly<Record<string,string>>;
  readonly missionIds:readonly string[];
}
export interface OriginalGuideSearchOptions{
  readonly query?:string;
  readonly locale?:string;
  readonly character?:string;
  readonly group?:string;
  readonly update?:string;
  readonly objective?:string;
  readonly scopeToken?:string;
  readonly allLocales?:boolean;
  readonly characterNames?:Readonly<Record<string,Readonly<Record<string,string>>>>;
  readonly groupInfo?:Readonly<Record<string,OriginalGuideGroup>>;
  readonly offset?:number;
  readonly limit?:number;
}
export interface OriginalGuideSearchRow extends OriginalGuideQuestRow{
  readonly displayName:string;
  readonly displayNameSource:string;
  readonly matchedLocale:string|null;
}
export interface OriginalGuideSearchResult{
  readonly total:number;
  readonly results:readonly OriginalGuideSearchRow[];
  readonly nextOffset:number|null;
}
export interface OriginalGuideSourceBridge{
  readonly baselineVersion:'1.26.1';
  readonly targetVersion:'1.26.2';
  readonly compatibleFamilies:readonly string[];
  readonly localePayloadsEqual:8;
  readonly changedConditionRecords:1;
  readonly addedConditionRecords:1;
  readonly conditionDefinitionsEquivalent:false;
  readonly originalSearchIndexSha256:string;
}
export interface OriginalGuideFolder{
  readonly index:OriginalGuideSearch;
  readonly shardFiles:Readonly<Record<string,LocalGuideFile>>;
  readonly characterNames:Readonly<Record<string,Readonly<Record<string,string>>>>;
  readonly groupInfo:Readonly<Record<string,OriginalGuideGroup>>;
  readonly currentConditionFiles:Readonly<{indexFile:LocalGuideFile;manifestFile:LocalGuideFile}>|null;
  readonly matchedShards:number;
  readonly requiredShards:number;
}
export interface OriginalGuideMission{
  readonly id:string;
  readonly recordKind:'mission';
  readonly nativeWireSha256:string;
  readonly source:Readonly<{file:string;sha256:string}>;
  readonly structured?:Record<string,any>;
  readonly [key:string]:any;
}
export interface OriginalGuideItemTarget{
  readonly configuredQuantity:number|null;
  readonly candidates:readonly {id:string;role:'direct'|'alternative'}[];
  readonly totalCandidates:number;
}
export interface OriginalGuideStep{
  readonly id:string;
  readonly title:string;
  readonly text:string;
  readonly textSource:string|null;
  readonly storyText:string;
  readonly storyTextSource:string|null;
  readonly objectives:readonly (OriginalGuideItemTarget&{
    kind:string;id:string;text:string;textSource:string|null;
    descriptionLevel:'objective'|'subStep'|null;subStepIndex:number;
  })[];
}
export interface OriginalGuideMissionReference{
  readonly id:string;
  readonly predicate:string;
  readonly section:string;
  readonly sourcePath:string;
  readonly targetInSearchIndex:boolean;
  readonly targetName:string|null;
  readonly targetNameSource:string|null;
  readonly targetRow:OriginalGuideQuestRow|null;
}
type Raw=Record<string,any>;
import {expectedOriginalGuideShardSha} from './shard-fingerprints.ts';

/** DB-03 browser-only Guide reader. No remote uploads or account calls. */
export const GUIDE_SEARCH_SCHEMA = 'wand.db03.quest-search@1' as const;
export const GUIDE_DETAIL_SCHEMA = 'wand.db03.quest-detail-shards@1' as const;
export const GUIDE_LOCALES:readonly string[]=Object.freeze(['ja', 'en', 'fr', 'it', 'de', 'es-ES', 'zh-CN', 'pt-BR']);
export const MAX_SEARCH_BYTES = 16 * 1024 * 1024;
export const MAX_SHARD_BYTES = 16 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const NATIVE_ID = /^[1-9][0-9]{0,15}$/;
const SHARD = /^quest-shards\/part-(\d{2})\.json$/;
const SOURCE_FILE = 'ddv_Data/StreamingAssets/itemlist/Mission.json';

/** Private original search-index bytes are hashed at import and tracked out-of-band.
 * Callers cannot provide this provenance through a JSON field or UI property.
 */
const GUIDE_SEARCH_FINGERPRINTS=new WeakMap<object,string>();
const VERIFIED_1262_BRIDGE = Object.freeze({
  baselineVersion:'1.26.1',
  targetVersion:'1.26.2',
  platform:'Steam',
  originalSearchSha256:'26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d',
  missionSourceSha256:'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24',
  searchableMissions:733, questGroups:289, unclassifiedRecords:8,
  localePayloadsEqual:8,
  changedConditionRecords:1, addedConditionRecords:1,
  conditionDefinitionsEquivalent:false
});

function assert(ok:unknown,message:string):asserts ok{ if (!ok) throw new TypeError('Guide: ' + message); }
function clean(value:unknown):string{ return String(value ?? '').normalize('NFKC').toLowerCase().trim(); }
function isObj(value:unknown):value is Raw{ return value !== null && typeof value === 'object' && !Array.isArray(value); }
function isId(value:unknown):value is string{ return typeof value === 'string' && NATIVE_ID.test(value); }
function isHash(value:unknown):value is string{ return typeof value === 'string' && HASH.test(value); }
function sameTarget(a:unknown,b:unknown):boolean{
  return isObj(a) && isObj(b) && typeof a.gameVersion === 'string' && a.gameVersion.length > 0 &&
    typeof a.platform === 'string' && a.platform.length > 0 && a.gameVersion === b.gameVersion && a.platform === b.platform;
}

/** Structure is checked before the UI accepts user-selected data. No 1.26.1-only count assumptions. */
export function validateGuideSearch(index:unknown):OriginalGuideSearch{
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
  const seen=new Set<string>();
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
  return index as unknown as OriginalGuideSearch;
}

function labelFor(row:OriginalGuideQuestRow,locale:string):{text:string;source:string}{
  if (row.names[locale]) return { text: row.names[locale], source: locale };
  if (row.names.en) return { text: row.names.en, source: 'en' };
  return { text: row.internalName || row.id, source: 'internalName' };
}

/** Client-side deterministic search, no network dependency. */
export function searchGuide(index:OriginalGuideSearch,{ query = '', locale = 'ja', character = '', group = '', update = '',
  objective = '', scopeToken = '', allLocales = false, characterNames = {}, groupInfo = {}, offset = 0, limit = 40 }:OriginalGuideSearchOptions = {}):OriginalGuideSearchResult{
  validateGuideSearch(index);
  assert(GUIDE_LOCALES.includes(locale), 'unsupported locale');
  assert(typeof query === 'string' && query.length <= 128, 'invalid query');
  assert((!character || isId(character)) && (!group || isId(group)), 'invalid filter ID');
  assert([update, objective, scopeToken].every(v => typeof v === 'string' && v.length <= 256), 'invalid filter string');
  assert(typeof allLocales === 'boolean' && Number.isInteger(offset) && offset >= 0 &&
    Number.isInteger(limit) && limit > 0 && limit <= 100, 'invalid pagination/options');
  const q=clean(query),words=q.split(/\s+/).filter(Boolean);
  const found:Array<OriginalGuideSearchRow & {_rank:number}>=[];
  for (const row of index.records) {
    if ((character && row.characterId !== character) || (group && row.groupId !== group) ||
        (update && row.sourceUpdateGroup !== update) || (objective && !row.objectiveKinds.includes(objective)) ||
        (scopeToken && !row.sourceScopeTokens.includes(scopeToken))) continue;
    const display = labelFor(row, locale);
    let rank = 0, matched = null;
    if (words.length) {
      if (q === row.id) { rank = -1; matched = 'nativeId'; }
      else {
        const labels:Array<[string,string|undefined,number]>=[[locale,row.names[locale],0]];
        if (allLocales) labels.push(...Object.entries(row.names).filter(([key]) => key !== locale)
          .map(([lang,value]) => [lang, value, 0]));
        else if (locale !== 'en') labels.push(['en', row.names.en, 0]);
        const charLabels = characterNames[row.characterId] ?? {};
        if (charLabels[locale]) labels.push(['character:' + locale, charLabels[locale], 4]);
        if (locale !== 'en' && charLabels.en) labels.push(['character:en', charLabels.en, 4]);
        const groupRecord = groupInfo[row.groupId];
        if (groupRecord?.rawName) labels.push(['sourceGroup', groupRecord.rawName, 7]);
        if (groupRecord?.names?.[locale]) labels.push(['group:' + locale, groupRecord.names[locale], 7]);
        if (locale !== 'en' && groupRecord?.names?.en) labels.push(['group:en', groupRecord.names.en, 7]);
        const matches = labels.filter(([, value]) => typeof value === 'string' && words.every(w => clean(value).includes(w)))
          .map(([lang, value, base]) => ({lang, rank:base + (clean(value) === q ? 0 : clean(value).startsWith(q) ? 1 : clean(value).includes(q) ? 2 : 3)}));
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
export function canonicalQuestRecord(value:unknown):string{
  if (Array.isArray(value)) return '[' + value.map(canonicalQuestRecord).join(',') + ']';
  if (isObj(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalQuestRecord(value[key])).join(',') + '}';
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value)!;
  throw new TypeError('Guide: unsupported source record value');
}

async function digestBytes(bytes:BufferSource):Promise<string>{
  assert(!!globalThis.crypto?.subtle, 'SHA-256 unavailable in this browser');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function digestText(value:string):Promise<string>{
  return digestBytes(new TextEncoder().encode(value));
}

/** Return a partial, exact-source compatibility claim *only* for the authentic
 * original private 1.26.1 search-index bytes. Do not relabel the dataset to 1.26.2.
 * The verified target Condition definitions differ and remain unevaluated.
 */
export function guideVerifiedSourceBridge(index:unknown):OriginalGuideSourceBridge|null{
  const verified=validateGuideSearch(index);
  const pin=VERIFIED_1262_BRIDGE;
  if (GUIDE_SEARCH_FINGERPRINTS.get(verified) !== pin.originalSearchSha256 ||
      verified.target.platform !== pin.platform ||
      verified.target.gameVersion !== pin.baselineVersion ||
      verified.source.sha256 !== pin.missionSourceSha256 ||
      verified.counts.missions !== pin.searchableMissions ||
      verified.counts.excludedQuestGroups !== pin.questGroups ||
      verified.counts.excludedUnclassified !== pin.unclassifiedRecords ||
      verified.counts.sourceNativeRecords !== 1030) return null;
  return {
    baselineVersion:pin.baselineVersion,
    targetVersion:pin.targetVersion,
    compatibleFamilies:['Mission.json','LocDB (8 payloads)'],
    localePayloadsEqual:pin.localePayloadsEqual,
    changedConditionRecords:pin.changedConditionRecords,
    addedConditionRecords:pin.addedConditionRecords,
    conditionDefinitionsEquivalent:false,
    originalSearchIndexSha256:pin.originalSearchSha256
  };
}



async function jsonFile(file:LocalGuideFile,maxSize:number,withSourceDigest=false,expectedFullFileSha256:string|null=null):Promise<unknown>{
  assert(file && typeof file.arrayBuffer === 'function' && Number.isSafeInteger(file.size) &&
    file.size > 0 && file.size <= maxSize, 'file missing or too large');
  const bytes = await file.arrayBuffer();
  assert(bytes.byteLength <= maxSize && bytes.byteLength === file.size, 'file byte count mismatch');
  if (expectedFullFileSha256) {
    assert(await digestBytes(bytes) === expectedFullFileSha256,
      'owner-original quest detail shard full-file SHA-256 mismatch');
  }
  const parsed = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
  if (withSourceDigest && isObj(parsed)) {
    GUIDE_SEARCH_FINGERPRINTS.set(parsed, await digestBytes(bytes));
  }
  return parsed;
}

export async function importGuideSearch(file:LocalGuideFile):Promise<OriginalGuideSearch>{
  return validateGuideSearch(await jsonFile(file, MAX_SEARCH_BYTES, true));
}

/** Optional same-target character labels from native extracted character definitions.
 * They enrich a local filter only; never change mission IDs or search coverage.
 */
export function guideCharacterLabels(payload:unknown,index:OriginalGuideSearch):Record<string,Record<string,string>>{
  validateGuideSearch(index);
  assert(isObj(payload) && payload.schema === 'wand.db03.native-guide@1' &&
    payload.family === 'characters' && sameTarget(payload.target, index.target) &&
    Array.isArray(payload.records) && payload.records.length > 0 && payload.records.length <= 10000,
    'character labels require a same-version native character source');
  const referenced = new Set(index.records.map(row => row.characterId).filter(Boolean));
  const labels:Record<string,Record<string,string>>={};
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

/** Join an optional same-source quest catalogue to the compact verified index.
 * Group membership is an original listing relation, not a prerequisite or play order.
 */
export function guideGroupInfo(payload:unknown,index:OriginalGuideSearch):Record<string,OriginalGuideGroup>{
  validateGuideSearch(index);
  const counts = payload?.counts;
  assert(isObj(payload) && payload.schema === 'wand.db03.quest-catalogue@1' &&
    sameTarget(payload.target, index.target) && isObj(payload.source) &&
    payload.source.file === index.source.file && payload.source.sha256 === index.source.sha256 &&
    isObj(counts) && counts.missions === index.counts.missions &&
    counts.questGroups === index.counts.excludedQuestGroups &&
    counts.unclassified === index.counts.excludedUnclassified &&
    counts.nativeSourceRecords === index.counts.sourceNativeRecords &&
    Array.isArray(payload.missions) && payload.missions.length === index.records.length &&
    Array.isArray(payload.questGroups) && payload.questGroups.length === counts.questGroups,
    'source quest catalogue is incomplete or from another build');
  const expected = new Map(index.records.map(row => [row.id, row]));
  const foundMissions = new Set();
  for (const mission of payload.missions) {
    const row = expected.get(mission?.id);
    assert(row && !foundMissions.has(mission.id) && mission.nativeWireSha256 === row.detail.nativeWireSha256 &&
      mission.groupId === row.groupId, 'quest catalogue mission identity/group mismatch');
    foundMissions.add(mission.id);
  }
  const groups:Record<string,OriginalGuideGroup>={};
  const referenced = new Set();
  for (const group of payload.questGroups) {
    assert(isObj(group) && isId(group.id) && !Object.hasOwn(groups,group.id) &&
      group.recordKind === 'questGroup' && isHash(group.nativeWireSha256) &&
      typeof group.rawName === 'string' && group.rawName.length > 0 && group.rawName.length <= 512 &&
      isObj(group.names) && Object.entries(group.names).every(([lang,value]) =>
        GUIDE_LOCALES.includes(lang) && typeof value === 'string' && value.trim() && value.length <= 4096) &&
      Array.isArray(group.missionIds) && group.missionIds.length <= index.records.length,
      'invalid or duplicate original quest group');
    const memberSet = new Set();
    for (const id of group.missionIds) {
      const mission = expected.get(id);
      assert(isId(id) && mission && mission.groupId === group.id && !memberSet.has(id) &&
        !referenced.has(id), 'quest group contains absent/duplicate/wrong-group mission');
      memberSet.add(id);
      referenced.add(id);
    }
    groups[group.id] = {id:group.id,rawName:group.rawName,names:group.names,missionIds:group.missionIds};
  }
  for (const mission of index.records) {
    assert(!mission.groupId || (Object.hasOwn(groups,mission.groupId) && referenced.has(mission.id)),
      'quest group membership coverage incomplete');
  }
  return groups;
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
export async function importGuideFolder(files:LocalGuideFile[]):Promise<OriginalGuideFolder>{
  assert(Array.isArray(files) && files.length > 0 && files.length <= 10000,
    'Guide folder must contain between 1 and 10000 files');
  const candidates:Array<{path:string;file:LocalGuideFile}>=[];
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
  const characterNames = characterFiles.length
    ? guideCharacterLabels(await jsonFile(characterFiles[0], MAX_SEARCH_BYTES), index) : {};
  const cataloguePath = prefix + 'guide/quest-catalogue.json';
  const catalogues = files.filter(file => (file.webkitRelativePath || file.name) === cataloguePath);
  assert(catalogues.length <= 1, 'duplicate quest catalogue file');
  const groupInfo = catalogues.length
    ? guideGroupInfo(await jsonFile(catalogues[0], MAX_SEARCH_BYTES), index) : {};
  const needed = new Set(index.records.map(row => row.detail.file.split('/').at(-1)));
  const shardFiles:Record<string,LocalGuideFile>={};
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

  // A privately assembled Guide folder may carry original current Condition
  // files beside guide/. Do not read or trust them here: the caller must
  // authenticate both raw files through importCurrentGuideConditions.
  // Only exact sibling paths under this verified quest-search root qualify.
  const sidecars=new Map<string,LocalGuideFile>();
  for (const file of files) {
    const path = typeof file.webkitRelativePath === 'string' && file.webkitRelativePath
      ? file.webkitRelativePath : file.name;
    if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) continue;
    const name = path.slice(prefix.length);
    if (!['condition-native-index-v2.json','condition-native-index-manifest-v2.json',
          'condition-native-index.json','condition-native-index-manifest.json'].includes(name)) continue;
    assert(!sidecars.has(name), 'duplicate Guide Condition sidecar: ' + name);
    sidecars.set(name, file);
  }
  const pairs = [
    ['condition-native-index-v2.json','condition-native-index-manifest-v2.json'],
    ['condition-native-index.json','condition-native-index-manifest.json']
  ];
  for (const [first,second] of pairs) {
    assert(sidecars.has(first) === sidecars.has(second),
      'Guide folder contains an incomplete Condition index/manifest pair');
  }
  const preferred = pairs.find(([first]) => sidecars.has(first));
  const currentConditionFiles = preferred
    ? {indexFile:sidecars.get(preferred[0])!, manifestFile:sidecars.get(preferred[1])!} : null;
  return {index, shardFiles, characterNames, groupInfo, currentConditionFiles,
    matchedShards: Object.keys(shardFiles).length, requiredShards: needed.size};
}

/** Verify chosen file, native identity and full 64-digit record content digest. */
export async function importGuideDetail(index:OriginalGuideSearch,id:string,file:LocalGuideFile):Promise<OriginalGuideMission>{
  validateGuideSearch(index);
  assert(isId(id), 'invalid quest selection');
  const row = index.records.find(x => x.id === id);
  assert(row, 'quest not in loaded source index');
  const expectedName = row.detail.file.split('/').at(-1);
  assert(file && file.name === expectedName, 'wrong detail shard selected: expected ' + expectedName);
  // Only the exact original privately sourced search index activates the
  // 32 complete-shard byte pins; synthetic/custom indexes retain existing
  // per-record hash semantics without pretending to be owner originals.
  const originalOwnerIndex = GUIDE_SEARCH_FINGERPRINTS.get(index) ===
    VERIFIED_1262_BRIDGE.originalSearchSha256 &&
    index.target.platform === 'Steam' && index.target.gameVersion === '1.26.1' &&
    index.source.sha256 === VERIFIED_1262_BRIDGE.missionSourceSha256;
  const doc = await jsonFile(file, MAX_SHARD_BYTES, false,
    originalOwnerIndex ? expectedOriginalGuideShardSha(expectedName) : null);
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
  return record as OriginalGuideMission;
}

/** Resolve only source-localized descriptions, never fabricate quest instructions. */
export function guideSourceText(definition:unknown,locale:string='ja'):{text:string;locale:string|null}{
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
export function guideItemTargets(targets:unknown):OriginalGuideItemTarget{
  if (!isObj(targets) || targets.schema !== 'wand.db03.mission-items@1') {
    return {configuredQuantity:null, candidates:[], totalCandidates:0};
  }
  const amount = targets.amount;
  const configuredQuantity = isObj(amount) && amount.kind === 'value' &&
    Number.isSafeInteger(amount.value) && amount.value >= 0 ? amount.value : null;
  const candidates:Array<{id:string;role:'direct'|'alternative'}>=[];
  const seen=new Set<string>();
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

/** Render the original boolean AST without evaluating it or promoting it to a prerequisite DAG. */
export function formatGuideConditionTree(tree:unknown):string|null{
  if (!isObj(tree) || !Array.isArray(tree.conditions)) return null;
  const lines = [];
  function visit(node:unknown,depth:number):void{
    assert(depth <= 24 && isObj(node) && Array.isArray(node.conditions),
      'invalid source condition tree');
    const indent = '  '.repeat(depth);
    // Parenthesized groups retain AND/OR/NOT, including empty original groups.
    lines.push(indent + String(node.operator ?? 'Unknown') + ' [');
    for (const child of node.conditions) {
      if (!isObj(child)) {
        lines.push(indent + '  Unknown (opaque condition)');
        continue;
      }
      if (child.type === 'SubConditions' && isObj(child.nested)) {
        lines.push(indent + '  SubConditions:');
        visit(child.nested, depth + 2);
        continue;
      }
      const metadata = Object.entries(child)
        .filter(([key, value]) => !['type', 'nested', 'nativeWireSha256',
          'wireSha256', 'protobufField'].includes(key) &&
          (typeof value === 'string' || typeof value === 'number' ||
           typeof value === 'boolean') && value !== null)
        .map(([key, value]) => key + '=' + JSON.stringify(value));
      // Unknown leaves are opaque, even when the corresponding source digest exists.
      lines.push(indent + '  ' + String(child.type ?? 'Unknown') +
        (metadata.length ? ' (' + metadata.join(', ') + ')' : ''));
    }
    lines.push(indent + ']');
  }
  visit(tree, 0);
  return lines.join('\n');
}

/** Static quest metadata only: no player progress, unlock evaluation or granted rewards. */
export function guideStaticFacts(record:OriginalGuideMission|null|undefined,locale:string='ja'):{conditions:Array<{label:string;expression:string}>;policies:Array<{label:string;note:string;expression:string|null}>;rewards:Array<{label:string;min:number|null;max:number|null}>}{
  assert(GUIDE_LOCALES.includes(locale), 'unsupported detail locale');
  const typed = isObj(record?.structured) ? record.structured : {};
  const conditions:Array<{label:string;expression:string}>=[];
  const policies:Array<{label:string;note:string;expression:string|null}>=[];
  const rewards:Array<{label:string;min:number|null;max:number|null}>=[];
  const sourceConditions = isObj(typed.conditions) ? typed.conditions : {};
  for (const [key, label] of [
    ['availableConditions', '原本の利用条件'], ['unlockConditions', '原本の解放条件']
  ]) {
    const expression = formatGuideConditionTree(sourceConditions[key]);
    if (expression !== null) conditions.push({label, expression});
  }
  const sourcePolicies = isObj(typed.activationPolicies) ? typed.activationPolicies : {};
  for (const [key, label] of [
    ['autoAcceptOptions', '自動受諾オプション'],
    ['uiUnlockConditions', 'UI表示条件'],
    ['ownerOverrides', '担当キャラクターの上書き設定']
  ]) {
    const entries = Array.isArray(sourcePolicies[key]) ? sourcePolicies[key] : [];
    for (const [index, entry] of entries.entries()) {
      if (!isObj(entry)) continue;
      const qualifiers = [];
      if (key === 'autoAcceptOptions' && typeof entry.choice === 'string')
        qualifiers.push('choice=' + entry.choice +
          (entry.choiceFromProtoDefault === true ? ' (protobuf既定値)' : ''));
      if (key === 'ownerOverrides') {
        if (entry.ownerKind === 'character' && isId(entry.characterId))
          qualifiers.push('characterId=' + entry.characterId);
        else if (entry.ownerKind === 'custom')
          qualifiers.push('custom (不透明な原本設定)');
        else qualifiers.push('ownerKind=' + String(entry.ownerKind ?? 'unknown'));
      }
      if (key === 'uiUnlockConditions') {
        const localized = guideSourceText(entry.text, locale);
        if (localized.text) qualifiers.push('原文=' + localized.text +
          (localized.locale !== locale ? ' (' + localized.locale + ')' : ''));
        else if (typeof entry.textKey === 'string') qualifiers.push('textKey=' + entry.textKey);
      }
      policies.push({
        label: label + ' ' + (index + 1),
        note: qualifiers.join(' · '),
        expression: formatGuideConditionTree(entry.conditions)
      });
    }
  }
  const sourceRewards = isObj(typed.rewardsDecoded) ? typed.rewardsDecoded : {};
  const friendship = sourceRewards.friendshipOverride;
  if (isObj(friendship) && (Number.isSafeInteger(friendship.min) ||
      Number.isSafeInteger(friendship.max))) {
    rewards.push({label:'原本の親密度報酬設定（上書き値）',
      min:Number.isSafeInteger(friendship.min) ? friendship.min : null,
      max:Number.isSafeInteger(friendship.max) ? friendship.max : null});
  }
  for (const [index, currency] of (Array.isArray(sourceRewards.currency) ? sourceRewards.currency : []).entries()) {
    if (!isObj(currency)) continue;
    rewards.push({label:'原本の通貨報酬候補 ' + (index + 1) +
      '（Currency ID: ' + String(currency.currencyId ?? '未指定') + '）',
      min:Number.isSafeInteger(currency.amountMin) ? currency.amountMin : null,
      max:Number.isSafeInteger(currency.amountMax) ? currency.amountMax : null});
  }
  return {conditions, policies, rewards};
}

/** Only source-typed Mission predicates can navigate to another playable quest.
 * An edge is a *mention in a condition branch*, not proof of a required prerequisite.
 * This runs only after importGuideDetail has verified the original record hash.
 */
export function guideMissionReferences(record:unknown,index:OriginalGuideSearch,locale:string='ja'):OriginalGuideMissionReference[]{
  validateGuideSearch(index);
  assert(GUIDE_LOCALES.includes(locale), 'unsupported reference locale');
  const doc=isObj(record)?record:null;
  const sourceRow=doc&&index.records.find(row=>row.id===doc.id);
  assert(sourceRow&&doc&&doc.recordKind==='mission'&&
    doc.nativeWireSha256===sourceRow.detail.nativeWireSha256&&
    doc.source?.file===index.source.file&&
    doc.source?.sha256===index.source.sha256,
    'mission reference source mismatch');
  const typed = isObj(doc.structured) ? doc.structured : {};
  const byId = new Map(index.records.map(row => [row.id, row]));
  const allowed:ReadonlySet<string> = new Set([
    'MissionAvailable', 'MissionCompleted', 'MissionOngoing', 'MissionStatus',
    'MissionStepCompleted', 'MissionStepStatus', 'MissionObjectiveCompleted',
    'MissionObjectiveStatus', 'MissionObjectiveSkipped', 'MissionObjectiveProgression'
  ]);
  const references:OriginalGuideMissionReference[]=[];
  function walk(tree:unknown,section:string,path:string,depth:number):void{
    if (!isObj(tree) || !Array.isArray(tree.conditions)) return;
    assert(depth <= 24, 'source reference tree too deep');
    for (const [i, condition] of tree.conditions.entries()) {
      if (!isObj(condition)) continue;
      const field = path + '.conditions[' + i + ']';
      if (condition.type === 'SubConditions') {
        walk(condition.nested, section, field + '.SubConditions', depth + 1);
        continue;
      }
      if (!allowed.has(condition.type) || !isId(condition.missionId)) continue;
      const row = byId.get(condition.missionId) ?? null;
      const label = row ? labelFor(row, locale) : null;
      references.push({
        id:condition.missionId, predicate:condition.type, section,
        sourcePath:field, targetInSearchIndex:row !== null,
        targetName:label?.text ?? null, targetNameSource:label?.source ?? null,
        targetRow:row
      });
    }
  }
  const roots = isObj(typed.conditions) ? typed.conditions : {};
  for (const [key, title] of [
    ['availableConditions', '利用条件'], ['unlockConditions', '解放条件']
  ]) walk(roots[key], title, key, 0);
  const policies = isObj(typed.activationPolicies) ? typed.activationPolicies : {};
  for (const [key, label] of [
    ['autoAcceptOptions', '自動受諾オプション'],
    ['uiUnlockConditions', 'UI表示条件'],
    ['ownerOverrides', '担当キャラクター上書き設定']
  ]) {
    const entries = Array.isArray(policies[key]) ? policies[key] : [];
    for (const [i, entry] of entries.entries()) {
      if (isObj(entry)) walk(entry.conditions, label + ' ' + (i + 1),
        key + '[' + i + ']', 0);
    }
  }
  return references;
}

/** Faithful, human-readable steps with individual original objective descriptions. */
export function detailStepRows(record:OriginalGuideMission|null|undefined,locale:string='ja'):OriginalGuideStep[]{
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
