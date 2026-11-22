export type EditorHandoffCatalog='DB-01'|'DB-03'|'DB-04';
export type EditorHandoffFieldStatus =
  'sampled_inconclusive'|'observed_kind_difference'|
  'candidate_field_observed'|'not_observed';
export interface EditorHandoffLinkRule {
  readonly id:string;
  readonly fieldId:string;
  readonly catalog:EditorHandoffCatalog;
  readonly sourceFamily:string|null;
  readonly evidence:string;
  readonly joinStrength:'candidate_only';
  readonly writable:false;
}
export interface EditorHandoffManifest {
  readonly schema:'wand.db05.editor-readonly-handoff@1';
  readonly sourceContracts:Readonly<Record<string,string>>;
  readonly handoffScope:Readonly<{
    sixObservedDomains:readonly string[];
    expectedReadsetTemplates:60;
    expectedReferenceRules:14;
    expectedExistingCandidateLinks:8;
    expectedUnverifiedReadsetOnlyCandidates:1;
    deferredCatalogFamilies:readonly string[];
    nativeSourceIdentifiersUsedAsWriteGrants:false;
  }>;
  readonly links:readonly Readonly<EditorHandoffLinkRule>[];
  readonly safety:Readonly<{
    inputMustComeFromStrictReadOnlyCodec:true;
    sourceOriginalsMustBeIndependentlyVerified:true;
    unknownFieldsMustRemainUntouched:true;
    differentGameVersionIsNotStructureFailure:true;
    sourceCatalogCoverageComplete:false;
    byteExactP1gRoundtripVerified:false;
    editorWriterAuthorized:false;
    exportAuthorized:false;
  }>;
}
export interface EditorHandoffObservation {
  readonly contract:'wand.db05.editor-readonly-handoff@1';
  readonly status:'sampled_inconclusive'|'observed_kind_difference'|'read_only_evidence';
  readonly registeredEditorFields:60;
  readonly readsetDomains:readonly Readonly<{
    domain:string;registered:number;observed:number;
    notObserved:number;observedKindDifference:number;sampled:boolean;
  }>[];
  readonly catalogCandidates:readonly Readonly<{
    id:string;catalog:EditorHandoffCatalog;evidence:string;
    status:EditorHandoffFieldStatus;observed:number;
    sourceIdMatchVerified:false;writerAuthorized:false;
  }>[];
  readonly referenceGraph:Readonly<{
    fixedRules:14;status:string;sampledRuleIds:readonly string[];
    diagnosticRuleIds:readonly string[];
    completeReferenceClosureVerified:false;
  }>;
  readonly strictCodecProvenanceExternallyRequired:true;
  readonly candidateCatalogSourceVerificationExternallyRequired:true;
  readonly ownerSaveWasCleanNotProven:true;
  readonly missingObjectsAreNotCorruption:true;
  readonly defaultDiffGridsAreNotPlayerEdits:true;
  readonly gameVersionIsNotCompatibilityGate:true;
  readonly sourceIdMatchVerified:false;
  readonly itemOwnershipOrEntitlementVerified:false;
  readonly unknownFieldsMustRemainUnmodified:true;
  readonly losslessUnknownFieldPreservationVerified:false;
  readonly originalP1gRoundtripVerified:false;
  readonly saveWriterAuthorized:false;
  readonly exportAuthorized:false;
}
export const SAVE_EDITOR_HANDOFF_CONTRACT:'wand.db05.editor-readonly-handoff@1';
export function getSaveEditorHandoff():Readonly<EditorHandoffManifest>;
export function inspectSaveEditorHandoff(decoded:unknown):Readonly<EditorHandoffObservation>;
