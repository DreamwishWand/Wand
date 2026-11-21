/** DB-05 -> DB-03: native MissionSlot IDs vs. private playable quest search.
 * Read-only candidate join. Nothing derived from the actual save or private
 * Guide index, except anonymous counts, crosses this reporting boundary.
 */
import rules from '../../../data/ddv/save/guide-link-rules.v1.json' with { type: 'json' };
import { validateGuideSearch } from '../guide/client.mjs';
import { inspectDecodedSave } from './registry.mjs';

export const SAVE_GUIDE_JOIN_CONTRACT = 'wand.db05.db03-quest-slot-candidates@1';
const MAX_MISSION_SLOTS_MAP = 512;
const MAX_SLOTS_PER_MAP = 512;
const MAX_REFERENCES = 256;
const MAX_NODE_VISITS = 16_384;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj,key);
const positiveSafe = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const sub of Object.values(value)) deepFreeze(sub);
    Object.freeze(value);
  }
  return value;
}
deepFreeze(rules);

/** Public native source path and safety policy; never includes actual map keys. */
export function getSaveGuideLinkRules() { return rules; }

function inspectSlots(root, knownIds, limit) {
  let observed=0, matched=0, unresolved=0, malformed=0;
  let zeroSentinels=0, typeIssues=0, missing=0, sampled=false, visits=0;
  const seen=new Set();
  const slots = root.World.MissionSlots;
  if (slots === undefined) return {observed,matched,unresolved,malformed,
    zeroSentinels,typeIssues,missing,sampled,distinctObserved:0};
  if (!object(slots)) {
    typeIssues++;
    return {observed,matched,unresolved,malformed,
      zeroSentinels,typeIssues,missing,sampled,distinctObserved:0};
  }
  const keys=Object.keys(slots);
  if (keys.length>MAX_MISSION_SLOTS_MAP) sampled=true;
  outer: for (const key of keys.slice(0,MAX_MISSION_SLOTS_MAP)) {
    if (++visits>MAX_NODE_VISITS) {sampled=true;break;}
    const container=slots[key];
    if (!object(container)) {typeIssues++;continue;}
    if (!has(container,'Slots')) {missing++;continue;}
    if (!Array.isArray(container.Slots)) {typeIssues++;continue;}
    const list=container.Slots;
    if (list.length>MAX_SLOTS_PER_MAP) sampled=true;
    for(const slot of list.slice(0,MAX_SLOTS_PER_MAP)) {
      if (++visits>MAX_NODE_VISITS || observed>=limit) {
        sampled=true;break outer;
      }
      if (!object(slot)) {typeIssues++;continue;}
      if (!has(slot,'MissionId')) {missing++;continue;}
      observed++;
      const value=slot.MissionId;
      if (value===0) {zeroSentinels++;continue;}
      if (!positiveSafe(value)) {malformed++;continue;}
      const id=String(value);
      seen.add(id);
      if (knownIds.has(id)) matched++;
      else unresolved++;
    }
    if (list.length>MAX_SLOTS_PER_MAP) sampled=true;
  }
  return {observed,matched,unresolved,malformed,zeroSentinels,
    typeIssues,missing,sampled,distinctObserved:seen.size};
}

/**
 * The Guide index has already been generated from a native Mission source
 * privately; validate its metadata, all record IDs and source locator contract.
 * This code cannot independently re-hash the original proprietary Mission.json.
 * Quest group / unclassified IDs are deliberately excluded from this index.
 */
export function createSaveGuideProgressBridge(guideIndex) {
  try { validateGuideSearch(guideIndex); }
  catch { throw new TypeError('DB05_DB03_VERIFIED_QUEST_SEARCH_REQUIRED'); }
  const knownIds=new Set(guideIndex.records.map(row=>row.id));
  const guideSource=Object.freeze({
    sourceSchema:'wand.db03.quest-search@1',
    subset:'playable_missions_only',
    indexMetadataValidated:true,
    originalSourceBytesVerifiedByBridge:false,
    nativeGuideSourceAndSaveJointlyVerified:false,
    platformAndVersionUsedAsGates:false,
    writerAuthorized:false,
    exportAuthorized:false
  });
  return Object.freeze({
    contract: SAVE_GUIDE_JOIN_CONTRACT,
    source: guideSource,
    auditSave(decoded, options={}) {
      if (!object(options)) throw new TypeError('DB05_DB03_AUDIT_LIMIT_INVALID');
      const limit=options.maxReferences??MAX_REFERENCES;
      if (!Number.isSafeInteger(limit) || limit<1 || limit>MAX_REFERENCES)
        throw new TypeError('DB05_DB03_AUDIT_LIMIT_INVALID');
      const valid=inspectDecodedSave(decoded,null);
      if (!valid.rootShapeValid)
        throw new TypeError('DB05_DB03_SAVE_ROOT_INVALID');
      const row=inspectSlots(decoded,knownIds,limit);
      const status=row.malformed||row.typeIssues ? 'observed_type_issue' :
        row.sampled ? 'sampled_inconclusive' :
        row.unresolved ? 'unresolved_in_playable_quest_subset' :
        !row.observed ? 'not_observed' :
        row.zeroSentinels===row.observed ? 'zero_sentinels_only' :
        'native_mission_id_candidates';
      // Only static, locally checked catalog labels and integer counts.
      return Object.freeze({
        contract:SAVE_GUIDE_JOIN_CONTRACT,
        family:'active_mission_slot',
        source:guideSource,
        status,...row,
        sourceScope:'source_attested_index_metadata_not_raw_source_bytes',
        gameVersionMatchedToSave:null,
        sourceAndSaveJointlyVerified:false,
        questProgressVerified:false,
        completedQuestHistoryVerified:false,
        entitlementVerified:false,
        writerAuthorized:false,
        exportAuthorized:false
      });
    }
  });
}
