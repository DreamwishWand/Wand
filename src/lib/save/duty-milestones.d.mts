export type SaveDutyMilestoneStatus =
  'observed_value_kind_difference'|'sampled_inconclusive'|
  'not_observed'|'partially_typed_source_definitions'|
  'typed_numeric_threshold_witness';
export interface SaveDutyMilestoneWitness {
  readonly contract:'wand.db05.duty-milestone-numeric-witness@1';
  readonly status:SaveDutyMilestoneStatus;
  readonly savedRowsWithDefinition:number;
  readonly typedMilestoneDefinitionRows:number;
  readonly opaqueDefinitionRows:number;
  readonly noMilestoneFieldRows:number;
  readonly typedMilestoneEntries:number;
  readonly currentAmountComparisons:number;
  readonly currentAtOrAboveThreshold:number;
  readonly claimedMilestoneComparisons:number;
  readonly claimedAtOrAboveThreshold:number;
  readonly valueKindDifferences:number;
  readonly invalidSaveRows:number;
  readonly sampled:boolean;
  readonly sourceDefinitionType:'AchievementItemData.Milestones/AchievementMilestone';
  readonly thresholdComparisonsAreNumericOnly:true;
  readonly completeSourceDefinitionsVerified:false;
  readonly sourceOriginalBytesHashedByThisBridge:false;
  readonly privateIndexSourceMetadataValidated:true;
  readonly gameBuildSaveJointlyVerified:false;
  readonly completionVerified:false;
  readonly rewardClaimableVerified:false;
  readonly rewardGrantedVerified:false;
  readonly rewardOwnershipVerified:false;
  readonly missingRecordsAreNotCorruption:true;
  readonly ownerModifiedSaveMayOmitObjects:true;
  readonly writerAuthorized:false;
  readonly exportAuthorized:false;
}
export interface SaveDutyMilestoneBridge {
  readonly contract:'wand.db05.duty-milestone-numeric-witness@1';
  auditSave(decoded:unknown, options?:Readonly<{maxReferences?:number}>):SaveDutyMilestoneWitness;
}
export const SAVE_DUTY_MILESTONE_JOIN_CONTRACT:'wand.db05.duty-milestone-numeric-witness@1';
export function createSaveDutyMilestoneBridge(
  duties:unknown, projection:unknown
):SaveDutyMilestoneBridge;
export function getSaveDutyMilestoneWireContract():Readonly<{
  schema:'wand.db05.duty-milestone-wire-contract@1';
  sourceEvidence:Readonly<{
    fieldNumber:13;
    fieldName:'Milestones';
    elementFields:readonly Readonly<{
      number:1|2|3;
      name:'Milestone'|'RewardItem'|'RewardAmount';
      nativeType:'int';
    }>[];
  }>;
  policy:Readonly<{
    writerAuthorized:false;
    exportAuthorized:false;
  }>;
}>;
