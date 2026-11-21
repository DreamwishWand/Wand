export interface SaveAchievementSource {
  readonly sourceSchema: 'wand.db03.native-guide@1';
  readonly nativeSourceFamily: 'duties';
  readonly metadataValidated: true;
  readonly originalSourceBytesVerifiedByBridge: false;
  readonly sourceAndSaveJointlyVerified: false;
  readonly coverageVerified: false;
  readonly platformAndVersionUsedAsGates: false;
  readonly progressVerified: false;
  readonly writerAuthorized: false;
  readonly exportAuthorized: false;
}
export interface SaveAchievementAudit {
  readonly contract: 'wand.db05.db03-duty-achievement-candidates@1';
  readonly family: 'achievement_duty_id';
  readonly source: SaveAchievementSource;
  readonly status: 'observed_type_issue' | 'sampled_inconclusive' |
    'unresolved_in_supplied_duty_index' | 'not_observed' |
    'zero_sentinels_only' | 'native_duty_id_candidates';
  readonly observed: number;
  readonly matched: number;
  readonly unresolved: number;
  readonly malformed: number;
  readonly zeroSentinels: number;
  readonly typeIssues: number;
  readonly missing: number;
  readonly sampled: boolean;
  readonly distinctObserved: number;
  readonly gameVersionMatchedToSave: null;
  readonly saveAndCatalogJointlyVerified: false;
  readonly entireAchievementHistoryVerified: false;
  readonly completionVerified: false;
  readonly progressVerified: false;
  readonly entitlementVerified: false;
  readonly ownershipVerified: false;
  readonly writerAuthorized: false;
  readonly exportAuthorized: false;
}
export interface SaveDutyProgressFieldEvidence {
  readonly field:'current_amount'|'max_amount'|'claimed_reward_milestone'|'state';
  readonly observed:number;
  readonly absent:number;
  readonly kindDifferent:number;
}
export interface SaveDutyProgressEvidenceAudit {
  readonly contract:'wand.db05.db03-duty-progress-observation@1';
  readonly status:'observed_kind_difference'|'sampled_inconclusive'|
    'no_exact_duty_matches'|'matched_native_duty_field_kinds';
  readonly nativeBehaviorEvidenceScope:'switch_1_26_1_static_only';
  readonly linkedIndexSource:'owner_private_db03_duties_metadata_only';
  readonly matchedRecords:number;
  readonly invalidRecords:number;
  readonly sampled:boolean;
  readonly fields:readonly SaveDutyProgressFieldEvidence[];
  readonly observedOnly:true;
  readonly gameSourceOriginalBytesRehashed:false;
  readonly gameBuildJointlyVerified:false;
  readonly completeNativeDutyThresholdsVerified:false;
  readonly stateMachineVerified:false;
  readonly achievementCompletionVerified:false;
  readonly rewardGrantVerified:false;
  readonly savePersistenceVerified:false;
  readonly ownerModifiedSaveMayOmitObjects:true;
  readonly missingAchievementsDoNotImplyIncomplete:true;
  readonly writerAuthorized:false;
  readonly exportAuthorized:false;
}
export interface SaveAchievementNativeBehaviorEvidence {
  readonly schema:'wand.db05.achievement-native-behavior-evidence@1';
  readonly sourceEvidence:Readonly<{
    observedPlatform:'Nintendo Switch';
    observedVersion:'1.26.1';
    evidenceStatus:'native_static_inspection_only';
    runtimeBehaviorVerified:false;
    savePersistenceVerified:false;
    sourceBuildAndSaveJointlyVerified:false;
    steam1262BehaviorVerified:false;
  }>;
  readonly fieldEvidence: readonly Readonly<{
    id:'current_amount'|'max_amount'|'claimed_reward_milestone'|'state';
    savePath:string;
    nativeMember:string;
    sourceSpecificObservation:string;
    inferenceBoundary:string;
  }>[];
  readonly policy:Readonly<{
    exactIdLookupOnly:true;
    noMissingRecordCompletionInference:true;
    noAutoRepair:true;
    writerAuthorized:false;
    exportAuthorized:false;
  }>;
}
export const SAVE_DUTY_PROGRESS_EVIDENCE_CONTRACT:'wand.db05.db03-duty-progress-observation@1';
export function getSaveAchievementNativeBehaviorEvidence():Readonly<SaveAchievementNativeBehaviorEvidence>;
export interface SaveAchievementBridge {
  readonly contract: 'wand.db05.db03-duty-achievement-candidates@1';
  readonly source: SaveAchievementSource;
  auditSave(decoded: unknown, options?: Readonly<{maxReferences?: number}>): SaveAchievementAudit;
  auditProgressEvidence(decoded: unknown, options?: Readonly<{maxReferences?: number}>): SaveDutyProgressEvidenceAudit;
}
export const SAVE_ACHIEVEMENT_JOIN_CONTRACT: 'wand.db05.db03-duty-achievement-candidates@1';
export function createSaveAchievementBridge(dutyIndex: unknown): SaveAchievementBridge;
export function getSaveAchievementLinkRules(): Readonly<{
  schema:'wand.db05.db03-duty-achievement-links@1';
  families: readonly Readonly<{
    id:'achievement_duty_id';
    catalog:'db03_native_duty_achievement';
    path:'/Player/AchievementsData[]/AchievementID';
    extraction:'positive_integer_value';
  }>[];
  policy:Readonly<{
    writerAuthorized:false;
    exportAuthorized:false;
  }>;
}>;
