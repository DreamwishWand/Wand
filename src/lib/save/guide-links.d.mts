export interface SaveGuideSource {
  readonly sourceSchema: 'wand.db03.quest-search@1';
  readonly subset: 'playable_missions_only';
  readonly indexMetadataValidated: true;
  readonly originalSourceBytesVerifiedByBridge: false;
  readonly nativeGuideSourceAndSaveJointlyVerified: false;
  readonly platformAndVersionUsedAsGates: false;
  readonly writerAuthorized: false;
  readonly exportAuthorized: false;
}
export interface SaveGuideAudit {
  readonly contract: 'wand.db05.db03-quest-slot-candidates@1';
  readonly family: 'active_mission_slot';
  readonly status:
    'observed_type_issue' | 'sampled_inconclusive' |
    'unresolved_in_playable_quest_subset' | 'not_observed' |
    'zero_sentinels_only' | 'native_mission_id_candidates';
  readonly observed: number;
  readonly matched: number;
  readonly unresolved: number;
  readonly malformed: number;
  readonly zeroSentinels: number;
  readonly typeIssues: number;
  readonly missing: number;
  readonly sampled: boolean;
  readonly distinctObserved: number;
  readonly source: SaveGuideSource;
  readonly sourceScope: 'source_attested_index_metadata_not_raw_source_bytes';
  readonly gameVersionMatchedToSave: null;
  readonly sourceAndSaveJointlyVerified: false;
  readonly questProgressVerified: false;
  readonly completedQuestHistoryVerified: false;
  readonly entitlementVerified: false;
  readonly writerAuthorized: false;
  readonly exportAuthorized: false;
}
export interface SaveGuideBridge {
  readonly contract: 'wand.db05.db03-quest-slot-candidates@1';
  readonly source: SaveGuideSource;
  auditSave(decoded: unknown, options?: Readonly<{maxReferences?: number}>): SaveGuideAudit;
}
export const SAVE_GUIDE_JOIN_CONTRACT: 'wand.db05.db03-quest-slot-candidates@1';
export function createSaveGuideProgressBridge(guideIndex: unknown): SaveGuideBridge;
export function getSaveGuideLinkRules(): Readonly<{
  schema: 'wand.db05.db03-quest-links@1';
  readonly families: readonly Readonly<{
    id: 'active_mission_slot';
    catalog: 'db03_playable_quest';
    path: '/World/MissionSlots/{id}/Slots[]/MissionId';
    extraction: 'positive_integer_value';
  }>[];
}>;
