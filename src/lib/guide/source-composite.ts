/**
 * Source-only, typed Steam 1.26.2 Guide compatibility claims.
 *
 * The original private Quest search index and 32 original shards retain their
 * source identity as 1.26.1, even though Mission bytes match Steam 1.26.2.
 * Condition v2 is independently re-extracted from Steam 1.26.2. Do not
 * infer the player's unlock state, live events, entitlement or dependencies.
 */
import {guideVerifiedSourceBridge} from './client.mjs';
import {ORIGINAL_GUIDE_SHARD_AUDIT_SHA,ORIGINAL_GUIDE_SHARD_TOTAL_BYTES}
  from './shard-fingerprints.ts';
import {
  GUIDE_CONDITION_INDEX_V2_SHA,GUIDE_CONDITION_SOURCE_SHA,
  GUIDE_CONDITION_PROBE_SHA,GUIDE_CONDITION_V2_MISSION_REFERENCES
} from './current-conditions.ts';

export const GUIDE_SOURCE_COMPOSITE_SCHEMA='wand.db03.guide-source-composite@1' as const;
export const GUIDE_SOURCE_COMPOSITE_SHA='c38c436bddc0bab2f1d6237fd5536e14c778bf39159e55e3c081c74182fe2d38' as const;
export const GUIDE_SOURCE_COMPOSITE_BYTES=8748 as const;
export const GUIDE_SOURCE_COMPOSITE_V2_SCHEMA='wand.db03.guide-source-composite@2' as const;
export const GUIDE_SOURCE_COMPOSITE_V2_SHA='96f937c8c07ac6d8b799458299a3014fc1b94d005df172dba03b6d76d298a88c' as const;
export const GUIDE_SOURCE_COMPOSITE_V2_BYTES=12664 as const;
export const GUIDE_FRIENDSHIP_ORIGINAL_SHA='90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22' as const;
const ORIGINAL_QUEST_SHA='26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d' as const;

/** Provenance of the *previously* byte-authenticated original search index.
 * Arbitrary caller-created objects are not proof; only the verified-browser
 * entrypoint guideVerifiedStaticComposite obtains this from its WeakMap.
 */
export interface GuideSourceBridge{
  readonly baselineVersion:'1.26.1';
  readonly targetVersion:'1.26.2';
  readonly originalSearchIndexSha256:typeof ORIGINAL_QUEST_SHA;
  readonly compatibleFamilies:readonly string[];
  readonly localePayloadsEqual:8;
  readonly conditionDefinitionsEquivalent:false;
}
export interface GuideCurrentConditionSource{
  readonly evaluation:'static_native_definitions_only';
  readonly formatVersion:2;
  readonly targetVersion:'1.26.2';
  readonly sourceSha256:typeof GUIDE_CONDITION_SOURCE_SHA;
  readonly indexSha256:typeof GUIDE_CONDITION_INDEX_V2_SHA;
  readonly count:5440;
  readonly missionReferenceCount:typeof GUIDE_CONDITION_V2_MISSION_REFERENCES;
  readonly byMission:ReadonlyMap<string,unknown>;
}
/** Display-only source-evidence projection, not source bytes or progress. */
export interface GuideStaticSourceComposite{
  readonly schema:typeof GUIDE_SOURCE_COMPOSITE_V2_SCHEMA;
  readonly targetGameVersion:'1.26.2';
  readonly targetPlatform:'Steam';
  readonly questSearchOriginalVersion:'1.26.1';
  readonly questSearchOriginalSha256:typeof ORIGINAL_QUEST_SHA;
  readonly questSearchNativeMissions:733;
  readonly questShardCountReferenced:32;
  readonly unchangedItemlistSourceFamilies:8;
  readonly currentReextractedConditionFamilies:1;
  readonly staticItemlistFamiliesCompared:9;
  readonly localeMemberPayloadsCompared:142816;
  readonly archivedProtoDbRecords:2246;
  readonly currentConditionDefinitions:5440;
  readonly currentConditionMissionMentions:typeof GUIDE_CONDITION_V2_MISSION_REFERENCES;
  readonly conditionIndexSha256:typeof GUIDE_CONDITION_INDEX_V2_SHA;
  readonly independentTargetProbeSha256:typeof GUIDE_CONDITION_PROBE_SHA;
  readonly ownerPrivateCompositeSha256:typeof GUIDE_SOURCE_COMPOSITE_V2_SHA;
  readonly baselineSourceCompositeSha256:typeof GUIDE_SOURCE_COMPOSITE_SHA;
  readonly ownerPrivateCompositeBytes:typeof GUIDE_SOURCE_COMPOSITE_V2_BYTES;
  readonly originalQuestShardAuditSha256:typeof ORIGINAL_GUIDE_SHARD_AUDIT_SHA;
  readonly totalOriginalQuestShardBytes:typeof ORIGINAL_GUIDE_SHARD_TOTAL_BYTES;
  readonly friendshipDefaultOriginalSha256:typeof GUIDE_FRIENDSHIP_ORIGINAL_SHA;
  readonly originalQuestFilesRelabelled:false;
  readonly originalQuestShardBytesCheckedAtOpen:true;
  readonly allQuestShardFileBytesAttestedByComposite:true;
  readonly all733QuestDetailRecordsVerified:true;
  readonly friendshipDefaultCrossVersionEqualityVerified:true;
  readonly playerProgressVerified:false;
  readonly runtimeConditionConsumptionVerified:false;
  readonly serverOrLiveStarPathVerified:false;
  readonly gameTextPublished:false;
}
function record(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
/** Returns a read-only display projection only for jointly consistent
 * source-verification objects. The function cannot itself attest that a
 * caller-supplied source bridge was authenticated; use the browser entrypoint
 * below to obtain that assurance from the private-index SHA WeakMap.
 */
export function composeVerifiedGuideSources(
  sourceBridge:unknown,currentConditions:unknown
):Readonly<GuideStaticSourceComposite>|null{
  const b=sourceBridge,c=currentConditions;
  if(!record(b)||b.baselineVersion!=='1.26.1'||
    b.targetVersion!=='1.26.2'||
    b.originalSearchIndexSha256!==ORIGINAL_QUEST_SHA||
    !Array.isArray(b.compatibleFamilies)||
    !b.compatibleFamilies.includes('Mission.json')||
    !b.compatibleFamilies.includes('LocDB (8 payloads)')||
    b.localePayloadsEqual!==8||b.conditionDefinitionsEquivalent!==false||
    !record(c)||c.evaluation!=='static_native_definitions_only'||
    c.formatVersion!==2||c.targetVersion!=='1.26.2'||
    c.sourceSha256!==GUIDE_CONDITION_SOURCE_SHA||
    c.indexSha256!==GUIDE_CONDITION_INDEX_V2_SHA||
    c.count!==5440||
    c.missionReferenceCount!==GUIDE_CONDITION_V2_MISSION_REFERENCES||
    !(c.byMission instanceof Map))return null;
  const source:GuideStaticSourceComposite={
    schema:GUIDE_SOURCE_COMPOSITE_V2_SCHEMA,
    targetGameVersion:'1.26.2',
    targetPlatform:'Steam',
    questSearchOriginalVersion:'1.26.1',
    questSearchOriginalSha256:ORIGINAL_QUEST_SHA,
    questSearchNativeMissions:733,
    questShardCountReferenced:32,
    unchangedItemlistSourceFamilies:8,
    currentReextractedConditionFamilies:1,
    staticItemlistFamiliesCompared:9,
    localeMemberPayloadsCompared:142816,
    archivedProtoDbRecords:2246,
    currentConditionDefinitions:5440,
    currentConditionMissionMentions:GUIDE_CONDITION_V2_MISSION_REFERENCES,
    conditionIndexSha256:GUIDE_CONDITION_INDEX_V2_SHA,
    independentTargetProbeSha256:GUIDE_CONDITION_PROBE_SHA,
    ownerPrivateCompositeSha256:GUIDE_SOURCE_COMPOSITE_V2_SHA,
    baselineSourceCompositeSha256:GUIDE_SOURCE_COMPOSITE_SHA,
    ownerPrivateCompositeBytes:GUIDE_SOURCE_COMPOSITE_V2_BYTES,
    originalQuestShardAuditSha256:ORIGINAL_GUIDE_SHARD_AUDIT_SHA,
    totalOriginalQuestShardBytes:ORIGINAL_GUIDE_SHARD_TOTAL_BYTES,
    friendshipDefaultOriginalSha256:GUIDE_FRIENDSHIP_ORIGINAL_SHA,
    originalQuestFilesRelabelled:false,
    originalQuestShardBytesCheckedAtOpen:true,
    allQuestShardFileBytesAttestedByComposite:true,
    all733QuestDetailRecordsVerified:true,
    friendshipDefaultCrossVersionEqualityVerified:true,
    playerProgressVerified:false,
    runtimeConditionConsumptionVerified:false,
    serverOrLiveStarPathVerified:false,
    gameTextPublished:false
  };
  return Object.freeze(source);
}
/** Browser-only path: source bridge comes from SHA-verified original index,
 * not from caller-controlled JSON. No private file leaves the browser. */
export function guideVerifiedStaticComposite(
  searchIndex:unknown,currentConditions:unknown
):Readonly<GuideStaticSourceComposite>|null{
  if(!searchIndex||!currentConditions)return null;
  return composeVerifiedGuideSources(
    guideVerifiedSourceBridge(searchIndex),currentConditions);
}
