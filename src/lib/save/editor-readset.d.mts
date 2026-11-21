export type EditorReadsetDomain =
 'inventory'|'chests'|'collection'|'achievements'|'missions'|'world';
export interface EditorReadsetRule {
  readonly id:string;
  readonly domain:EditorReadsetDomain;
  readonly path:string;
  readonly allowedJsonKinds:readonly string[];
  readonly observationEvidence:'owner_declared_clean_schema643_structural_observation';
  readonly referenceCandidate:string|null;
  readonly requiredInAllSaves:false;
  readonly writable:false;
}
export interface EditorReadsetManifest {
  readonly schema:'wand.db05.editor-readset@1';
  readonly evidence:Readonly<{
    platform:'Nintendo Switch';
    gameVersion:'1.26.2';
    schemaVersionObserved:643;
    sourceBuildIndependentlyVerified:false;
    actualIDsAndValuesExcluded:true;
  }>;
  readonly domains:readonly EditorReadsetDomain[];
  readonly fields:readonly EditorReadsetRule[];
  readonly policy:Readonly<{
    unobservedDoesNotImplyCorruption:true;
    sourceJoinIsCandidateOnly:true;
    unknownFieldsMustNotBeReconstructed:true;
    editorWriterAuthorized:false;
    exportAuthorized:false;
  }>;
}
export interface EditorReadsetFieldObservation {
  readonly id:string;
  readonly domain:EditorReadsetDomain;
  readonly observed:number;
  readonly mismatched:number;
  readonly branchTypeIssues:number;
  readonly children:number;
  readonly sampled:boolean;
  readonly notObserved:boolean;
}
export interface EditorReadsetDomainObservation {
  readonly domain:EditorReadsetDomain;
  readonly registered:number;
  readonly observed:number;
  readonly notObserved:number;
  readonly observedKindDifference:number;
  readonly sampled:boolean;
}
export interface EditorReadsetObservation {
  readonly contract:'wand.db05.editor-readset-observation@1';
  readonly status:'sampled_inconclusive'|'observed_kind_difference'|
    'not_observed'|'observed_field_kinds_only';
  readonly fields:readonly EditorReadsetFieldObservation[];
  readonly domains:readonly EditorReadsetDomainObservation[];
  readonly knownFieldTemplateCount:number;
  readonly unknownFieldsNotInterpreted:true;
  readonly ownerDeclaredCleanHistoryNotTechnicallyVerified:true;
  readonly ownerModificationsNotInferred:true;
  readonly absentObjectsAreNotCorruption:true;
  readonly initialDiffGridModificationsAreNotUserEdits:true;
  readonly nullableContainerParentIsExpected:true;
  readonly gameVersionIsNotShapeGate:true;
  readonly mapKeysAndSaveIdsNotExposed:true;
  readonly sourceBuildIndependentlyVerified:false;
  readonly strictCodecRoundtripVerified:false;
  readonly editorWriterAuthorized:false;
  readonly exportAuthorized:false;
}
export const SAVE_EDITOR_READSET_CONTRACT:'wand.db05.editor-readset-observation@1';
export function getEditorReadset():Readonly<EditorReadsetManifest>;
export function inspectEditorReadset(decoded:unknown):Readonly<EditorReadsetObservation>;
