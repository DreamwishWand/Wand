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
export interface SaveAchievementBridge {
  readonly contract: 'wand.db05.db03-duty-achievement-candidates@1';
  readonly source: SaveAchievementSource;
  auditSave(decoded: unknown, options?: Readonly<{maxReferences?: number}>): SaveAchievementAudit;
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
