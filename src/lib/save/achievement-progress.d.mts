export interface SaveAchievementFieldObservation {
  readonly id: string;
  readonly path: string;
  readonly observed: number;
  readonly absent: number;
  readonly typeIssues: number;
  readonly checkedElements: number;
  readonly nestedTypeIssues: number;
  readonly sampled: boolean;
  readonly observedKindOnly: true;
  readonly semanticMeaningVerified: false;
  readonly writable: false;
}
export interface SaveAchievementProgressObservation {
  readonly contract: 'wand.db05.achievement-field-observation@1';
  readonly status: 'not_observed' | 'container_type_difference' |
    'observed_empty' | 'observed_kind_difference' |
    'sampled_observation' | 'observed_field_kinds';
  readonly evidenceBasis: 'seven_native_field_kinds_only';
  readonly registeredFields: number;
  readonly containerPresent: boolean;
  readonly containerKindValid: boolean;
  readonly inspectedRows: number;
  readonly invalidRows: number;
  readonly sampled: boolean;
  readonly fields: readonly SaveAchievementFieldObservation[];
  readonly modifiedSaveMayOmitMissionObjects: true;
  readonly absenceIsNotEvidenceOfCorruption: true;
  readonly originalSourceBytesVerifiedByProbe: false;
  readonly gameDefinitionsJoined: false;
  readonly achievementSemanticsVerified: false;
  readonly completionVerified: false;
  readonly rewardEntitlementVerified: false;
  readonly saveIntegrityVerified: false;
  readonly codecRoundTripVerified: false;
  readonly originalSavePreserved: true;
  readonly writerAuthorized: false;
  readonly exportAuthorized: false;
}
export interface SaveAchievementObservationFieldRule {
  readonly id: string;
  readonly path: string;
  readonly nativeMessage: 'AchievementData';
  readonly fieldNumber: number;
  readonly nativeType: string;
  readonly jsonKinds: readonly ('integer' | 'array' | 'string')[];
  readonly itemKind?: 'integer';
  readonly meaning: string;
}
export const SAVE_ACHIEVEMENT_PROGRESS_CONTRACT: 'wand.db05.achievement-field-observation@1';
export function getSaveAchievementObservationFields(): Readonly<{
  schema: 'wand.db05.achievement-observation-fields@1';
  parent: '/Player/AchievementsData';
  readonly fields: readonly SaveAchievementObservationFieldRule[];
  readonly policy: Readonly<{
    missingMissionObjectsAreOptional: true;
    noDefaultReconstruction: true;
    nativeSemanticsOfProgressAndStateNotAttested: true;
    writerAuthorized: false;
    exportAuthorized: false;
  }>;
}>;
export function inspectSaveAchievementProgress(
  decoded: unknown,
  options?: Readonly<{maxRecords?: number}>
): SaveAchievementProgressObservation;
