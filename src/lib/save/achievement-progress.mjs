/**
 * DB-05: schema-grounded, read-only AchievementData field observation.
 *
 * Private, possibly owner-edited saves are witnesses, not canonical game state.
 * Only public field names and anonymous counts leave this adapter. In
 * particular absent MissionSlots, deleted world objects, missing achievements,
 * opaque State names and unusual amounts do NOT imply corruption.
 */
import schema from '../../../data/ddv/save/achievement-observation-fields.v1.json' with { type:'json' };
import { inspectDecodedSave } from './registry.mjs';

export const SAVE_ACHIEVEMENT_PROGRESS_CONTRACT = 'wand.db05.achievement-field-observation@1';
const MAX_RECORDS = 256;
const MAX_NESTED_ELEMENTS = 128;
const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object,key);
const isInt32 = value => typeof value === 'number' &&
  Number.isSafeInteger(value) && value >= INT32_MIN && value <= INT32_MAX;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
deepFreeze(schema);

export function getSaveAchievementObservationFields() { return schema; }

function observeField(rows, field) {
  const name=field.path.split('/').at(-1);
  let observed=0, absent=0, typeIssues=0, checkedElements=0;
  let nestedTypeIssues=0, sampled=false;
  for (const row of rows) {
    if (!isRecord(row)) continue; // accounted for at the container level
    if (!has(row,name)) { absent++; continue; }
    observed++;
    const value=row[name];
    if (field.jsonKinds[0]==='integer') {
      if (!isInt32(value)) typeIssues++;
    } else if (field.jsonKinds[0]==='string') {
      // AchievementState is a native enum. Its names and meaning are opaque.
      if (typeof value !== 'string') typeIssues++;
    } else if (field.jsonKinds[0]==='array') {
      if (!Array.isArray(value)) { typeIssues++; continue; }
      if (value.length>MAX_NESTED_ELEMENTS) sampled=true;
      for(const element of value.slice(0,MAX_NESTED_ELEMENTS)) {
        checkedElements++;
        if (!isInt32(element)) nestedTypeIssues++;
      }
    }
  }
  return Object.freeze({
    id:field.id, path:field.path,
    observed, absent, typeIssues, checkedElements, nestedTypeIssues,
    sampled, observedKindOnly:true,
    semanticMeaningVerified:false,
    writable:false
  });
}

/**
 * Only an already-strictly-decoded JSON root should enter.
 * The scan never visits World.MissionSlots or attempts to synthesize it.
 * It deliberately does not evaluate completion, milestones or inventory.
 */
export function inspectSaveAchievementProgress(decoded, options={}) {
  if (!isRecord(options)) throw new TypeError('DB05_ACHIEVEMENT_PROGRESS_LIMIT_INVALID');
  const maxRecords=options.maxRecords??MAX_RECORDS;
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > MAX_RECORDS)
    throw new TypeError('DB05_ACHIEVEMENT_PROGRESS_LIMIT_INVALID');
  if (!inspectDecodedSave(decoded,null).rootShapeValid)
    throw new TypeError('DB05_ACHIEVEMENT_PROGRESS_SAVE_ROOT_INVALID');
  const exists=has(decoded.Player,'AchievementsData');
  const raw=exists ? decoded.Player.AchievementsData : undefined;
  const validContainer=Array.isArray(raw);
  const rows=validContainer ? raw.slice(0,maxRecords) : [];
  const inspectedRows=rows.length;
  const invalidRows=rows.reduce((total,row)=>total+(isRecord(row)?0:1),0);
  const sampled=validContainer && raw.length > maxRecords;
  const fields=Object.freeze(schema.fields.map(field=>observeField(rows,field)));
  const fieldTypeIssues=fields.reduce((n,f)=>n+f.typeIssues+f.nestedTypeIssues,0);
  const nestedSampled=fields.some(f=>f.sampled);
  const status=!exists ? 'not_observed' :
    !validContainer ? 'container_type_difference' :
    raw.length===0 ? 'observed_empty' :
    invalidRows||fieldTypeIssues ? 'observed_kind_difference' :
    sampled||nestedSampled ? 'sampled_observation' : 'observed_field_kinds';
  // Every count is about *observations*, never achievement completion.
  return Object.freeze({
    contract:SAVE_ACHIEVEMENT_PROGRESS_CONTRACT,
    status,
    evidenceBasis:'seven_native_field_kinds_only',
    registeredFields:fields.length,
    containerPresent:exists,
    containerKindValid:validContainer,
    inspectedRows,
    invalidRows,
    sampled:sampled||nestedSampled,
    fields,
    modifiedSaveMayOmitMissionObjects:true,
    absenceIsNotEvidenceOfCorruption:true,
    originalSourceBytesVerifiedByProbe:false,
    gameDefinitionsJoined:false,
    achievementSemanticsVerified:false,
    completionVerified:false,
    rewardEntitlementVerified:false,
    saveIntegrityVerified:false,
    codecRoundTripVerified:false,
    originalSavePreserved:true,
    writerAuthorized:false,
    exportAuthorized:false
  });
}
