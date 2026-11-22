import type {SaveCleanBaselineComparison} from './clean-baseline.mjs';
export type CleanRegressionStatus =
  'sampled_inconclusive'|'observed_kind_difference'|
  'optional_fields_not_observed'|'observed_count_or_relation_drift'|
  'same_observed_structural_counts';
export interface CleanRegressionReference {
  readonly contract:'wand.db05.clean-save-regression@1';
  readonly cleanClaim:'owner_declared_clean_observed';
  readonly ownerDeclarationTechnicallyVerified:false;
  readonly knownStructureTemplates:number;
  readonly editorReadsetTemplates:number;
  readonly referenceRelationRules:number;
  readonly baselineReadset:readonly Readonly<{
    domain:string;registered:number;observed:number;notObserved:number;
    observedKindDifference:number;sampled:boolean;
  }>[];
  readonly baselineReferenceStatus:string;
  readonly platformOrVersionGated:false;
  readonly actualSaveBuildVerified:false;
  readonly sameAccountHistoryVerified:false;
  readonly actualSourceValuesCaptured:false;
  readonly writerAuthorized:false;
  readonly exportAuthorized:false;
}
export interface CleanRegressionResult {
  readonly contract:'wand.db05.clean-save-regression@1';
  readonly status:CleanRegressionStatus;
  readonly observedSaveSchema:number|null;
  readonly baseline:Readonly<SaveCleanBaselineComparison>;
  readonly editorReadset:Readonly<{
    fixedTemplates:number;changedCardinalityFields:number;
    newlyUnobservedFields:number;newKindDifferenceCandidates:number;
    changedFieldIds:readonly string[];
    missingFieldIds:readonly string[];
    typeCandidateIds:readonly string[];
    sampledFieldIds:readonly string[];
    domains:readonly Readonly<{
      domain:string;fieldTemplates:number;cardinalityDrift:number;
      newlyUnobserved:number;newKindDifferenceCandidates:number;sampled:number;
    }>[];
  }>;
  readonly referenceGraph:Readonly<{
    fixedRelations:number;baselineStatus:string;candidateStatus:string;
    changedRuleIds:readonly string[];sampledRuleIds:readonly string[];
  }>;
  readonly comparisonBasis:'fixed_structural_counts_not_record_identity';
  readonly twoSavesMayBelongToDifferentPlayers:true;
  readonly noContinuousSaveHistoryEstablished:true;
  readonly unchangedCountsDoNotImplyIdenticalSaves:true;
  readonly absenceDoesNotProveCorruption:true;
  readonly driftDoesNotProveCheatsOrIllegalObjectEdits:true;
  readonly observedKindDifferenceIsOnlyDiagnostic:true;
  readonly sourceVersionIsNotCompatibilityGate:true;
  readonly onlySourceNativeIdCandidatesKnown:true;
  readonly unknownFieldsNotReconstructed:true;
  readonly writerAuthorized:false;
  readonly exportAuthorized:false;
}
export interface CleanSaveRegression {
  readonly contract:'wand.db05.clean-save-regression@1';
  readonly reference:Readonly<CleanRegressionReference>;
  compare(candidateDecoded:unknown):Readonly<CleanRegressionResult>;
}
export const SAVE_CLEAN_REGRESSION_CONTRACT:'wand.db05.clean-save-regression@1';
export function createCleanSaveRegression(cleanDecoded:unknown,ownerDeclaration:Readonly<{
  ownerDeclaredClean:true;
  ownerDeclaredNoCheats:true;
  ownerDeclaredNoRestrictedObjectEdits:true;
}>):CleanSaveRegression;
