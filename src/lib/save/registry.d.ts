export { getSaveAchievementObservationFields, inspectSaveAchievementProgress, SAVE_ACHIEVEMENT_PROGRESS_CONTRACT } from './achievement-progress.mjs';
export type { SaveAchievementProgressObservation, SaveAchievementFieldObservation, SaveAchievementObservationFieldRule } from './achievement-progress.mjs';
export { createSaveAchievementBridge, getSaveAchievementLinkRules, SAVE_ACHIEVEMENT_JOIN_CONTRACT, getSaveAchievementNativeBehaviorEvidence, SAVE_DUTY_PROGRESS_EVIDENCE_CONTRACT } from './achievement-links.mjs';
export type { SaveAchievementBridge, SaveAchievementAudit, SaveAchievementSource, SaveDutyProgressEvidenceAudit, SaveDutyProgressFieldEvidence, SaveAchievementNativeBehaviorEvidence } from './achievement-links.mjs';
export { createSaveGuideProgressBridge, getSaveGuideLinkRules, SAVE_GUIDE_JOIN_CONTRACT } from './guide-links.mjs';
export type { SaveGuideBridge, SaveGuideAudit, SaveGuideSource } from './guide-links.mjs';
export { createSaveSourceCatalogBridge, getSaveCatalogLinkRules, SAVE_CROSS_CATALOG_CONTRACT, SAVE_CROSS_CATALOG_AUDIT_CONTRACT } from './catalog-links.mjs';
export { getSaveReferenceRelations, probeSaveReferences, compareSaveReferenceProbes, SAVE_REFERENCE_PROBE_CONTRACT, SAVE_REFERENCE_COMPARISON_CONTRACT } from './references.mjs';
export type SavePlatform = 'switch' | 'steam-windows';
export type SaveBuildIdentity = Readonly<{
  platform: SavePlatform;
  identityKind: 'switch_bid' | 'steam_full_version';
  identity: string;
  schemaVersion: number;
}>;
export type SaveBuildCandidate = SaveBuildIdentity & Readonly<{
  key: string;
  gameVersion: string;
  status: 'legacy_contract_candidate';
  evidence: string;
}>;
export type SaveAssessment = Readonly<{
  contract: 'wand.db05.save-readonly-inspection@1';
  buildCandidate: string | null;
  saveSchemaVersion: number | null;
  rootShapeValid: boolean;
  compatibilityBasis: 'decoded_field_shape';
  shapeProbe: SaveShapeProbe;
  issues: readonly string[];
  strictDecoderVerified: false;
  externalBuildVerified: false;
  referenceClosureVerified: false;
  writerAuthorized: false;
  ownershipMutationAuthorized: false;
  exportAuthorized: false;
}>;
export type SaveDomainShape = Readonly<{
  domain: 'inventory' | 'chests' | 'collection' | 'grids' | 'appearance';
  status: 'shape_candidate' | 'sampled_candidate' | 'shape_conflict' | 'not_observed';
  observedFieldCount: number;
  observedFields: readonly Readonly<{ path: string; kinds: readonly string[] }>[];
  conflictingPaths: readonly string[];
  sampled: boolean;
  source: 'legacy_rust_field_candidates_only';
  writerAuthorized: false;
}>;
export type SaveShapeProbe = Readonly<{
  contract: 'wand.db05.save-shape-probe@1';
  compatibilityBasis: 'decoded_field_shape';
  platformAndVersionUsedAsGates: false;
  domains: readonly SaveDomainShape[];
  exhaustive: false;
  codecVerified: false;
  writerAuthorized: false;
}>;
export type CommonSaveDomain = 'world' | 'progression' | 'cosmetics';
export type CommonSaveField = Readonly<{
  domain: CommonSaveDomain;
  path: string;
  type: string;
  publicSource: string;
  sourceStatus: 'historical_public_runtime_path_not_current_native_type_attestation';
  observedStatus: 'observed_type_in_three_private_626_643_saves';
  coverageScope: 'three_owner_originals_only';
  codecClosureVerified: false;
  writable: false;
}>;
export type CommonSaveProbeDomain = Readonly<{
  domain: CommonSaveDomain;
  status: 'shape_conflict' | 'shape_candidate' | 'sampled_candidate' | 'not_observed';
  observedFieldCount: number;
  observedFields: readonly Readonly<{path:string; kinds:readonly string[]}>[];
  conflictingPaths: readonly string[];
  sampled: boolean;
  writerAuthorized: false;
}>;
export type CommonSaveShapeProbe = Readonly<{
  contract: 'wand.db05.common-shape-probe@1';
  platformAndVersionUsedAsGates: false;
  completeness: 'known_16_templates_only';
  domains: readonly CommonSaveProbeDomain[];
  exhaustive: false;
  strictDecoderVerified: false;
  writerAuthorized: false;
}>;
export type CommonSaveComparisonDomain = Readonly<{
  domain: CommonSaveDomain;
  status: 'observed_type_conflict'|'insufficient_evidence'|'sampled_inconclusive'|'observed_witness_difference'|'same_known_common_shape';
  addedKnownPaths: readonly string[];
  missingKnownPaths: readonly string[];
  conflictingKnownPaths: readonly string[];
  writerAuthorized: false;
}>;
export type CommonSaveComparison = Readonly<{
  contract: 'wand.db05.common-shape-comparison@1';
  status: 'observed_type_conflict'|'inconclusive'|'observed_witness_difference'|'same_known_common_shape';
  platformAndVersionUsedAsGates: false;
  domains: readonly CommonSaveComparisonDomain[];
  exhaustive: false;
  strictDecoderVerified: false;
  writerAuthorized: false;
  exportAuthorized: false;
}>;
export function getCommonSaveFields(): Readonly<{schema:'wand.db05.common626643-field-witnesses@1';fields:readonly CommonSaveField[]}>;
export function probeCommonSaveStructure(decoded: unknown): CommonSaveShapeProbe;
export function compareCommonSaveStructures(previous: unknown,current: unknown): CommonSaveComparison;
export const SAVE_COMMON_SHAPE_PROBE_CONTRACT: 'wand.db05.common-shape-probe@1';
export const SAVE_COMMON_SHAPE_COMPARE_CONTRACT: 'wand.db05.common-shape-comparison@1';
export type NativeSaveFieldDomain = 'profile' | 'player' | 'world';
export type NativeSaveField = Readonly<{
  domain: NativeSaveFieldDomain;
  path: string;
  nativeMessage: 'Profile' | 'ProfilePlayer' | 'ProfileWorld';
  protobufFieldNumber: number;
  nativePropertyType: string;
  jsonType: 'array' | 'object' | 'integer' | 'boolean' | 'string';
  observedIn: readonly ('private_schema626' | 'private_schema643_A' | 'private_schema643_B')[];
  writerAuthorized: false;
}>;
export type NativeSaveShapeDomain = Readonly<{
  domain: NativeSaveFieldDomain;
  status: 'shape_conflict' | 'shape_candidate' | 'sampled_candidate' | 'not_observed';
  registeredFieldCount: number;
  observedFieldCount: number;
  observedFields: readonly Readonly<{ path: string; kinds: readonly string[] }>[];
  conflictingPaths: readonly string[];
  sampled: boolean;
  writerAuthorized: false;
}>;
export type NativeSaveShapeProbe = Readonly<{
  contract: 'wand.db05.native-shape-probe@1';
  compatibilityBasis: 'observed_native_field_types';
  nativeGameBuildAttested: false;
  platformAndVersionUsedAsGates: false;
  domains: readonly NativeSaveShapeDomain[];
  registeredFieldCount: number;
  exhaustive: false;
  strictDecoderVerified: false;
  writerAuthorized: false;
}>;
export type NativeSaveComparisonDomain = Readonly<{
  domain: NativeSaveFieldDomain;
  status: 'observed_type_conflict' | 'insufficient_evidence' | 'sampled_inconclusive' |
    'observed_witness_difference' | 'same_observed_native_fields';
  addedKnownPaths: readonly string[];
  missingKnownPaths: readonly string[];
  conflictingKnownPaths: readonly string[];
  writerAuthorized: false;
}>;
export type NativeSaveComparison = Readonly<{
  contract: 'wand.db05.native-shape-comparison@1';
  status: 'invalid_root' | 'observed_type_conflict' | 'inconclusive' |
    'observed_witness_difference' | 'same_observed_native_fields';
  domains: readonly NativeSaveComparisonDomain[];
  platformAndVersionUsedAsGates: false;
  sourceGameBuild: 'steam-1.26.1';
  currentGameNativeTypeAttestation: false;
  exhaustive: false;
  strictDecoderVerified: false;
  writerAuthorized: false;
  exportAuthorized: false;
}>;
export function getNativeSaveFields(): Readonly<{
  schema: 'wand.db05.native1261-observed-field-witnesses@1';
  fields: readonly NativeSaveField[];
}>;
export function probeNativeSaveStructure(decoded: unknown): NativeSaveShapeProbe;
export function compareNativeSaveStructures(previous: unknown, current: unknown): NativeSaveComparison;
export const SAVE_NATIVE_SHAPE_PROBE_CONTRACT: 'wand.db05.native-shape-probe@1';
export const SAVE_NATIVE_SHAPE_COMPARE_CONTRACT: 'wand.db05.native-shape-comparison@1';
export type NestedSaveDomain = 'player' | 'world';
export type NestedSaveField = Readonly<{
  domain: NestedSaveDomain;
  path: string;
  nativeMessage: string;
  protobufFieldNumber: number;
  nativePropertyType: string;
  observedJsonKinds: readonly ('object'|'array'|'integer'|'boolean'|'string'|'null')[];
  allowedJsonKinds: readonly ('object'|'array'|'integer'|'boolean'|'string'|'null')[];
  observedIn: readonly string[];
  sourceNativeBuild: 'steam-1.26.1';
  writable: false;
}>;
export type NestedSaveShapeDomain = Readonly<{
  domain: NestedSaveDomain;
  status: 'shape_conflict' | 'shape_candidate' | 'sampled_candidate' | 'not_observed';
  registeredFieldCount: number;
  observedFieldCount: number;
  observedFields: readonly Readonly<{path:string;kinds:readonly string[]}>[];
  conflictingPaths: readonly string[];
  sampled: boolean;
  writerAuthorized: false;
}>;
export type NestedSaveShapeProbe = Readonly<{
  contract: 'wand.db05.nested-shape-probe@1';
  registeredFieldCount: number;
  nativeGameBuildAttested: false;
  platformAndVersionUsedAsGates: false;
  exhaustive: false;
  strictDecoderVerified: false;
  domains: readonly NestedSaveShapeDomain[];
  writerAuthorized: false;
}>;
export type NestedSaveComparison = Readonly<{
  contract: 'wand.db05.nested-shape-comparison@1';
  status: 'invalid_root'|'observed_type_conflict'|'inconclusive'|
    'observed_witness_difference'|'same_observed_nested_fields';
  domains: readonly Readonly<{
    domain: NestedSaveDomain;
    status: 'observed_type_conflict'|'insufficient_evidence'|'sampled_inconclusive'|
      'observed_witness_difference'|'same_observed_nested_fields';
    addedKnownPaths: readonly string[];
    missingKnownPaths: readonly string[];
    conflictingKnownPaths: readonly string[];
    changedKindPaths: readonly string[];
    writerAuthorized: false;
  }>[];
  platformAndVersionUsedAsGates: false;
  sourceGameBuild: 'steam-1.26.1';
  currentGameNativeTypeAttestation: false;
  exhaustive: false;
  strictDecoderVerified: false;
  writerAuthorized: false;
  exportAuthorized: false;
}>;
export const SAVE_NESTED_SHAPE_PROBE_CONTRACT: 'wand.db05.nested-shape-probe@1';
export const SAVE_NESTED_SHAPE_COMPARE_CONTRACT: 'wand.db05.nested-shape-comparison@1';
export function getNestedSaveFields(): Readonly<{
  schema: 'wand.db05.native1261-nested-field-witnesses@1';
  fields: readonly NestedSaveField[];
}>;
export function probeNestedSaveStructure(decoded: unknown): NestedSaveShapeProbe;
export function compareNestedSaveStructures(previous: unknown,current: unknown): NestedSaveComparison;
export type DeepSaveField = Readonly<{
  domain: 'player' | 'world';
  path: string;
  nativeMessage: string;
  protobufFieldNumber: number;
  nativePropertyType: string;
  observedJsonKinds: readonly string[];
  allowedJsonKinds: readonly string[];
  observedIn: readonly string[];
  sourceNativeBuild: 'steam-1.26.1';
  writable: false;
}>;
export type UnifiedShapeDomain = Readonly<{
  domain: string;
  registeredFieldCount: number;
  observedFieldCount: number;
  status: 'shape_conflict' | 'not_observed' | 'sampled_candidate' | 'shape_candidate';
  observedFields: readonly Readonly<{path:string;kinds:readonly string[]}>[];
  conflictingPaths: readonly string[];
  sampled: boolean;
  writerAuthorized: false;
}>;
export type UnifiedShapeProbe = Readonly<{
  contract: 'wand.db05.unified-shape-probe@1';
  publicTemplateCount: number;
  platformAndVersionUsedAsGates: false;
  nativeBuildAttested: false;
  domains: readonly UnifiedShapeDomain[];
  exhaustive: false;
  strictDecoderVerified: false;
  writerAuthorized: false;
}>;
export type UnifiedShapeComparison = Readonly<{
  contract: 'wand.db05.unified-shape-comparison@1';
  status: 'invalid_root' | 'observed_type_conflict' | 'inconclusive' |
    'observed_witness_difference' | 'same_observed_witnesses';
  publicTemplateCount: number;
  domains: readonly Readonly<{
    domain: string;
    status: 'observed_type_conflict'|'insufficient_evidence'|
      'sampled_inconclusive'|'observed_witness_difference'|'same_observed_witnesses';
    addedKnownPaths: readonly string[];
    missingKnownPaths: readonly string[];
    changedKindPaths: readonly string[];
    conflictingKnownPaths: readonly string[];
    writerAuthorized: false;
  }>[];
  platformAndVersionUsedAsGates: false;
  nativeBuildAttested: false;
  exhaustive: false;
  strictDecoderVerified: false;
  writerAuthorized: false;
  exportAuthorized: false;
}>;
export const SAVE_UNIFIED_SHAPE_PROBE_CONTRACT: 'wand.db05.unified-shape-probe@1';
export const SAVE_UNIFIED_SHAPE_COMPARISON_CONTRACT: 'wand.db05.unified-shape-comparison@1';
export type DomainSaveField = Readonly<{
  domain: 'player' | 'world';
  path: string;
  nativeMessage: string;
  protobufFieldNumber: number;
  nativePropertyType: string;
  observedJsonKinds: readonly string[];
  allowedJsonKinds: readonly string[];
  sampledAtLeastOneOriginal: boolean;
  observedIn: readonly string[];
  sourceNativeBuild: 'steam-1.26.2-archived-dump';
  writable: false;
}>;
export function getDomainSaveFields(): Readonly<{
  schema: 'wand.db05.native1262-domain-fields@1';
  fields: readonly DomainSaveField[];
}>;
export function getDeepSaveFields(): Readonly<{
  schema: 'wand.db05.native1261-deep-field-witnesses@1';
  fields: readonly DeepSaveField[];
}>;
export function getUnifiedSaveShapeCatalog(): Readonly<{
  contract: 'wand.db05.unified-shape-catalog@1';
  publicTemplateCount: number;
  sourceCounts: Readonly<{legacy:number;common:number;native:number;nativeNested:number;nativeDeep:number;nativeDomain:number}>;
  domains: readonly string[];
  compatibilityGate: 'decoded_shape_not_build_or_platform';
  currentNativeBuildAttested: false;
  writerAuthorized: false;
}>;
export function probeUnifiedSaveStructure(decoded: unknown): UnifiedShapeProbe;
export function compareUnifiedSaveStructures(previous: unknown, current: unknown): UnifiedShapeComparison;
export type FieldWitness = Readonly<{ path: string; type: string }>;
export function getSaveRegistry(): Readonly<Record<string, unknown>>;
export type LegacyIdReference = Readonly<{namespace:string;catalog:string|null;extraction:'map_key'|'value';join:'exact_numeric_only';currentCatalogCoverageVerified:false;status:'legacy_source_only';note:string}>;
export type LegacyField = Readonly<{domain:string;path:string;type:string;builds:readonly string[];constraint:string;writable:false;idReference?:LegacyIdReference}>;
export function getLegacySaveFields(): Readonly<{schema:string;saveSchemaVersion:number;fields:ReadonlyArray<LegacyField>}>;
export function getLegacySaveIdReferences(namespace?: string): readonly LegacyField[];
export function matchSaveBuild(build: Partial<SaveBuildIdentity>): SaveBuildCandidate | null;
export function probeSaveStructure(decoded: unknown): SaveShapeProbe;
export type SaveStructureComparisonDomain = Readonly<{
  domain: SaveDomainShape['domain'];
  status: 'structural_conflict' | 'insufficient_evidence' | 'sampled_inconclusive' | 'observed_shape_drift' | 'same_known_field_shape';
  addedKnownPaths: readonly string[];
  removedKnownPaths: readonly string[];
  conflictingKnownPaths: readonly string[];
  previousObservedFieldCount: number;
  currentObservedFieldCount: number;
  writerAuthorized: false;
}>;
export type SaveStructureComparison = Readonly<{
  contract: 'wand.db05.save-structure-comparison@1';
  compatibilityBasis: 'decoded_field_shape';
  platformAndVersionUsedAsGates: false;
  status: 'invalid_root' | 'structural_conflict' | 'inconclusive' | 'observed_shape_drift' | 'same_known_field_shape';
  rootIssues: Readonly<{ previous: readonly string[]; current: readonly string[] }>;
  domains: readonly SaveStructureComparisonDomain[];
  knownPathsOnly: true;
  exhaustive: false;
  strictDecoderVerified: false;
  referenceClosureVerified: false;
  writerAuthorized: false;
  exportAuthorized: false;
}>;
export function compareSaveStructures(previous: unknown, current: unknown): SaveStructureComparison;
export function inspectDecodedSave(decoded: unknown, declaredBuild: Partial<SaveBuildIdentity> | null): SaveAssessment;
export function borrowUntouchedDecodedSave<T>(decoded: T, declaredBuild: Partial<SaveBuildIdentity> | null): { original: T; assessment: SaveAssessment };
export function makeGameIdIndex<T extends Record<string, unknown>>(rows: readonly T[], key?: string): Map<number, T>;
export function matchGameId<T>(index: Map<number, T>, id: unknown): T | null;
export function diffSaveWitnesses(previous: readonly FieldWitness[], current: readonly FieldWitness[]): {
  schema: string;
  added: FieldWitness[];
  removed: FieldWitness[];
  changed: { path: string; previousType: string; currentType: string }[];
  authoritative: false;
  basis: 'observed_witnesses_only';
};
export const SAVE_STRUCTURE_COMPARISON_CONTRACT: 'wand.db05.save-structure-comparison@1';
export const SAVE_SHAPE_PROBE_CONTRACT: 'wand.db05.save-shape-probe@1';
export const SAVE_REGISTRY_SCHEMA: 'wand.db05.save-registry@1';
export const SAVE_INSPECTION_CONTRACT: 'wand.db05.save-readonly-inspection@1';
