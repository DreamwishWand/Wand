/** Static, source-version-preserving Steam 1.26.2 Guide composite evidence.
 * The verification files are held privately; the browser already checks the
 * actual raw quest-search and Condition v2 index bytes before this projection.
 * No game data is sent, altered or relabelled.
 */
import {guideVerifiedSourceBridge} from './client.mjs';
import {ORIGINAL_GUIDE_SHARD_AUDIT_SHA, ORIGINAL_GUIDE_SHARD_TOTAL_BYTES} from './shard-fingerprints.ts';
import {
  GUIDE_CONDITION_INDEX_V2_SHA, GUIDE_CONDITION_SOURCE_SHA,
  GUIDE_CONDITION_PROBE_SHA, GUIDE_CONDITION_V2_MISSION_REFERENCES
} from './current-conditions.mjs';

export const GUIDE_SOURCE_COMPOSITE_SCHEMA = 'wand.db03.guide-source-composite@1';
export const GUIDE_SOURCE_COMPOSITE_SHA = 'c38c436bddc0bab2f1d6237fd5536e14c778bf39159e55e3c081c74182fe2d38';
export const GUIDE_SOURCE_COMPOSITE_BYTES = 8748;
export const GUIDE_SOURCE_COMPOSITE_V2_SCHEMA = 'wand.db03.guide-source-composite@2';
export const GUIDE_SOURCE_COMPOSITE_V2_SHA = '96f937c8c07ac6d8b799458299a3014fc1b94d005df172dba03b6d76d298a88c';
export const GUIDE_SOURCE_COMPOSITE_V2_BYTES = 12664;
export const GUIDE_FRIENDSHIP_ORIGINAL_SHA = '90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22';
const ORIGINAL_QUEST_SHA = '26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d';

/** This helper accepts *already verified* source objects only: the actual
 * browser entry point below gets the bridge from the quest index WeakMap.
 * It deliberately does not claim completeness for live events, saves, other
 * data families or the current player state; complete owner-original
 * lazy shard bytes and the global friendship source are separately audited.
 */
export function composeVerifiedGuideSources(sourceBridge, currentConditions) {
  const b = sourceBridge, c = currentConditions;
  if (!b || b.baselineVersion !== '1.26.1' || b.targetVersion !== '1.26.2' ||
      b.originalSearchIndexSha256 !== ORIGINAL_QUEST_SHA ||
      !Array.isArray(b.compatibleFamilies) ||
      !b.compatibleFamilies.includes('Mission.json') ||
      !b.compatibleFamilies.includes('LocDB (8 payloads)') ||
      b.localePayloadsEqual !== 8 || b.conditionDefinitionsEquivalent !== false ||
      !c || c.evaluation !== 'static_native_definitions_only' ||
      c.formatVersion !== 2 || c.targetVersion !== '1.26.2' ||
      c.sourceSha256 !== GUIDE_CONDITION_SOURCE_SHA ||
      c.indexSha256 !== GUIDE_CONDITION_INDEX_V2_SHA ||
      c.count !== 5440 ||
      c.missionReferenceCount !== GUIDE_CONDITION_V2_MISSION_REFERENCES ||
      !(c.byMission instanceof Map)) return null;
  return Object.freeze({
    schema: GUIDE_SOURCE_COMPOSITE_V2_SCHEMA,
    targetGameVersion: '1.26.2',
    targetPlatform: 'Steam',
    questSearchOriginalVersion: '1.26.1',
    questSearchOriginalSha256: ORIGINAL_QUEST_SHA,
    questSearchNativeMissions: 733,
    questShardCountReferenced: 32,
    unchangedItemlistSourceFamilies: 8,
    currentReextractedConditionFamilies: 1,
    staticItemlistFamiliesCompared: 9,
    localeMemberPayloadsCompared: 142816,
    archivedProtoDbRecords: 2246,
    currentConditionDefinitions: c.count,
    currentConditionMissionMentions: c.missionReferenceCount,
    conditionIndexSha256: c.indexSha256,
    independentTargetProbeSha256: GUIDE_CONDITION_PROBE_SHA,
    ownerPrivateCompositeSha256: GUIDE_SOURCE_COMPOSITE_V2_SHA,
    baselineSourceCompositeSha256: GUIDE_SOURCE_COMPOSITE_SHA,
    ownerPrivateCompositeBytes: GUIDE_SOURCE_COMPOSITE_V2_BYTES,
    originalQuestShardAuditSha256: ORIGINAL_GUIDE_SHARD_AUDIT_SHA,
    totalOriginalQuestShardBytes: ORIGINAL_GUIDE_SHARD_TOTAL_BYTES,
    friendshipDefaultOriginalSha256: GUIDE_FRIENDSHIP_ORIGINAL_SHA,
    originalQuestFilesRelabelled: false,
    originalQuestShardBytesCheckedAtOpen: true,
    allQuestShardFileBytesAttestedByComposite: true,
    all733QuestDetailRecordsVerified: true,
    friendshipDefaultCrossVersionEqualityVerified: true,
    playerProgressVerified: false,
    runtimeConditionConsumptionVerified: false,
    serverOrLiveStarPathVerified: false,
    gameTextPublished: false
  });
}

export function guideVerifiedStaticComposite(searchIndex, currentConditions) {
  // guideVerifiedSourceBridge checks the private JSON file's *actual original*
  // SHA-256, stored outside user-editable JSON fields.
  if (!searchIndex || !currentConditions) return null;
  const verifiedBridge = guideVerifiedSourceBridge(searchIndex);
  return composeVerifiedGuideSources(verifiedBridge, currentConditions);
}
