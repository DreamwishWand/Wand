/**
 * DB-05 -> DB-03 source-native DutyAch candidate join.
 * Input: already strictly decoded local save + owner-supplied private
 * guide/duties.json. The audit output carries only fixed labels/counts.
 * No actual achievement IDs, map keys, localized source text or state values.
 */
import rules from '../../../data/ddv/save/achievement-link-rules.v1.json' with { type: 'json' };
import { inspectDecodedSave } from './registry.mjs';

export const SAVE_ACHIEVEMENT_JOIN_CONTRACT = 'wand.db05.db03-duty-achievement-candidates@1';
const GUIDE_SCHEMA = 'wand.db03.native-guide@1';
const DUTY_SOURCE = 'ddv_Data/StreamingAssets/itemlist/DutyAch.json';
const MAX_DUTY_ROWS = 100_000;
const MAX_ACHIEVEMENTS = 256;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[1-9][0-9]*$/;
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const has = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
const validId = x => typeof x === 'number' && Number.isSafeInteger(x) && x > 0;

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
freezeDeep(rules);
export function getSaveAchievementLinkRules() { return rules; }

function validSourceId(value) {
  return typeof value === 'string' && ID.test(value) &&
    Number.isSafeInteger(Number(value)) && Number(value) > 0 &&
    String(Number(value)) === value;
}

/**
 * The DB-03 exporter creates a source-backed snapshot. This adapter validates
 * the JSON contract and uniform SHA metadata but cannot independently verify
 * that private original DutyAch.json bytes match a claimed source hash.
 */
function validateDuties(input) {
  if (!record(input) || input.schema !== GUIDE_SCHEMA ||
      input.family !== 'duties' || !record(input.target) ||
      typeof input.target.platform !== 'string' || !input.target.platform.trim() ||
      typeof input.target.gameVersion !== 'string' || !input.target.gameVersion.trim() ||
      !Array.isArray(input.records) || input.records.length === 0 ||
      input.records.length > MAX_DUTY_ROWS) {
    throw new TypeError('DB05_DB03_NATIVE_DUTIES_REQUIRED');
  }
  let sourceHash = null;
  const ids = new Set();
  for (const row of input.records) {
    if (!record(row) || !validSourceId(row.id) || ids.has(row.id) ||
        typeof row.rawName !== 'string' || row.rawName.length === 0 ||
        row.rawName.length > 1024 ||
        !HASH.test(row.nativeWireSha256 ?? '') ||
        !record(row.source) || row.source.file !== DUTY_SOURCE ||
        !HASH.test(row.source.sha256 ?? '') ||
        !Number.isSafeInteger(row.source.frameIndex) ||
        row.source.frameIndex < 0 || row.source.frameIndex >= MAX_DUTY_ROWS ||
        (sourceHash !== null && row.source.sha256 !== sourceHash)) {
      throw new TypeError('DB05_DB03_NATIVE_DUTIES_REQUIRED');
    }
    sourceHash = row.source.sha256;
    ids.add(row.id);
  }
  return ids;
}

function auditAchievementRows(save, knownIds, cap) {
  let observed=0, matched=0, unresolved=0, malformed=0;
  let zeroSentinels=0, typeIssues=0, missing=0, sampled=false;
  const distinct = new Set();
  const player=save.Player;
  if (!has(player,'AchievementsData')) {
    return {observed,matched,unresolved,malformed,zeroSentinels,typeIssues,
      missing,sampled,distinctObserved:0};
  }
  const rows=player.AchievementsData;
  if (!Array.isArray(rows)) {
    typeIssues++;
    return {observed,matched,unresolved,malformed,zeroSentinels,typeIssues,
      missing,sampled,distinctObserved:0};
  }
  sampled = rows.length > cap;
  for(const row of rows.slice(0,cap)) {
    if (!record(row)) {typeIssues++;continue;}
    if (!has(row,'AchievementID')) {missing++;continue;}
    observed++;
    const value=row.AchievementID;
    if (value===0) {zeroSentinels++;continue;}
    if (!validId(value)) {malformed++;continue;}
    const key=String(value);
    distinct.add(key);
    if (knownIds.has(key)) matched++;
    else unresolved++;
  }
  return {observed,matched,unresolved,malformed,zeroSentinels,typeIssues,
    missing,sampled,distinctObserved:distinct.size};
}

/**
 * Input index remains caller-private. Only numeric ID candidates are compared;
 * non-playable quest Mission IDs are intentionally excluded from this lookup.
 */
export function createSaveAchievementBridge(dutyIndex) {
  const dutyIds=validateDuties(dutyIndex);
  const source=Object.freeze({
    sourceSchema: GUIDE_SCHEMA,
    nativeSourceFamily:'duties',
    metadataValidated:true,
    originalSourceBytesVerifiedByBridge:false,
    sourceAndSaveJointlyVerified:false,
    coverageVerified:false,
    platformAndVersionUsedAsGates:false,
    progressVerified:false,
    writerAuthorized:false,
    exportAuthorized:false
  });
  return Object.freeze({
    contract:SAVE_ACHIEVEMENT_JOIN_CONTRACT,
    source,
    auditSave(decoded,options={}) {
      if (!record(options)) throw new TypeError('DB05_ACHIEVEMENT_AUDIT_LIMIT_INVALID');
      const cap=options.maxReferences??MAX_ACHIEVEMENTS;
      if (!Number.isSafeInteger(cap) || cap<1 || cap>MAX_ACHIEVEMENTS)
        throw new TypeError('DB05_ACHIEVEMENT_AUDIT_LIMIT_INVALID');
      if (!inspectDecodedSave(decoded,null).rootShapeValid)
        throw new TypeError('DB05_ACHIEVEMENT_SAVE_ROOT_INVALID');
      const counters=auditAchievementRows(decoded,dutyIds,cap);
      const {observed,malformed,typeIssues,sampled,unresolved,zeroSentinels}=counters;
      const status=malformed||typeIssues ? 'observed_type_issue' :
        sampled ? 'sampled_inconclusive' :
        unresolved ? 'unresolved_in_supplied_duty_index' :
        !observed ? 'not_observed' :
        zeroSentinels===observed ? 'zero_sentinels_only' :
        'native_duty_id_candidates';
      return Object.freeze({
        contract:SAVE_ACHIEVEMENT_JOIN_CONTRACT,
        family:'achievement_duty_id',
        source, status, ...counters,
        gameVersionMatchedToSave:null,
        saveAndCatalogJointlyVerified:false,
        entireAchievementHistoryVerified:false,
        completionVerified:false,
        progressVerified:false,
        entitlementVerified:false,
        ownershipVerified:false,
        writerAuthorized:false,
        exportAuthorized:false
      });
    }
  });
}
