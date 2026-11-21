export interface SaveCleanFieldObservation {
  readonly id:string;
  readonly observed:number;
  readonly expectedKind:'object'|'array'|'string'|'integer';
  readonly kindDifferences:number;
  readonly childCount:number;
  readonly branchIssues:number;
  readonly sampled:boolean;
}
export interface SaveCleanBaselineReference {
  readonly contract:'wand.db05.clean-save-structural-baseline@1';
  readonly status:'owner_declared_clean_observed';
  readonly fieldCount:number;
  readonly observations:readonly SaveCleanFieldObservation[];
  readonly ownerDeclaredClean:true;
  readonly ownerDeclarationNotTechnicallyVerifiable:true;
  readonly sourceBuildValidated:false;
  readonly encryptedRoundtripValidated:false;
  readonly rawValuesRetained:false;
  readonly rawIdsRetained:false;
  readonly versionUsedAsCompatibilityGate:false;
  readonly writerAuthorized:false;
  readonly exportAuthorized:false;
}
export interface SaveCleanBaselineComparison {
  readonly contract:'wand.db05.clean-save-structural-baseline@1';
  readonly status:'sampled_inconclusive'|'observed_kind_difference'|
    'optional_fields_not_observed'|'cardinality_drift_only'|'observed_shapes_same';
  readonly fieldsCompared:number;
  readonly optionalFieldsNotObserved:readonly string[];
  readonly typeDifferenceCandidates:readonly string[];
  readonly cardinalityDifferentFields:readonly string[];
  readonly sampledFields:readonly string[];
  readonly rawIdsExposed:false;
  readonly rawValuesExposed:false;
  readonly absenceDoesNotImplyCorruption:true;
  readonly countDriftDoesNotImplyCheats:true;
  readonly countDriftDoesNotImplyUserObjectEdits:true;
  readonly differentSchemaVersionIsNotIncompatibleByItself:true;
  readonly ownerModificationHistoryNotInferred:true;
  readonly completeEditorSchemaVerified:false;
  readonly strictRoundtripVerified:false;
  readonly writerAuthorized:false;
  readonly exportAuthorized:false;
}
export interface SaveCleanBaseline {
  readonly contract:'wand.db05.clean-save-structural-baseline@1';
  readonly reference:SaveCleanBaselineReference;
  compare(candidate:unknown):Readonly<SaveCleanBaselineComparison>;
}
export const SAVE_CLEAN_BASELINE_CONTRACT:'wand.db05.clean-save-structural-baseline@1';
export function getCleanSaveBaselineRules():readonly Readonly<{
  id:string;path:string;kind:'object'|'array'|'string'|'integer';
}>[];
export function createCleanSaveBaseline(decoded:unknown,claim:Readonly<{
  ownerDeclaredClean:true;
  ownerDeclaredNoCheats:true;
  ownerDeclaredNoRestrictedObjectEdits:true;
}>):SaveCleanBaseline;
