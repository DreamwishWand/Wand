export type SaveReferenceRelation = Readonly<{
  id: string;
  sourcePublicTemplate: string;
  traversalTemplate: string;
  mode: 'id_matches_map_key' | 'ref_exists';
  targetIndex: 'container' | 'grid' | null;
  note: string;
}>;
export type SaveReferenceRuleObservation = Readonly<{
  id: string;
  sourcePublicTemplate: string;
  mode: 'id_matches_map_key' | 'ref_exists';
  targetIndex: 'container' | 'grid' | null;
  status: 'not_observed' | 'observed_anomaly' | 'sampled_inconclusive' |
    'insufficient_evidence' | 'observed_consistent';
  observed: number;
  resolved: number;
  unresolved: number;
  missing: number;
  malformed: number;
  typeIssues: number;
  sampled: boolean;
  writerAuthorized: false;
}>;
export type SaveReferenceProbe = Readonly<{
  contract: 'wand.db05.save-reference-probe@1';
  status: 'invalid_root' | 'observed_anomaly' | 'inconclusive' | 'observed_consistent';
  rootValid: boolean;
  rules: readonly SaveReferenceRuleObservation[];
  indexSizes: Readonly<{ container: number; grid: number }>;
  platformAndVersionUsedAsGates: false;
  referenceClosureVerified: false;
  exhaustive: false;
  writerAuthorized: false;
  exportAuthorized: false;
}>;
export type SaveReferenceComparison = Readonly<{
  contract: 'wand.db05.save-reference-comparison@1';
  status: 'invalid_root' | 'observed_anomaly' |
    'observed_reference_difference' | 'same_observed_counts';
  changes: readonly Readonly<{
    id: string;
    status: 'insufficient_evidence' | 'changed_observation' | 'same_observed_counts';
    observedDelta: number | null;
    unresolvedDelta: number | null;
    writerAuthorized: false;
  }>[];
  comparisonBasis: 'counts_and_status_only_not_numeric_identity';
  platformAndVersionUsedAsGates: false;
  referenceClosureVerified: false;
  exhaustive: false;
  writerAuthorized: false;
  exportAuthorized: false;
}>;
export const SAVE_REFERENCE_PROBE_CONTRACT: 'wand.db05.save-reference-probe@1';
export const SAVE_REFERENCE_COMPARISON_CONTRACT: 'wand.db05.save-reference-comparison@1';
export function getSaveReferenceRelations(): Readonly<{
  schema: 'wand.db05.save-reference-relations@1';
  rules: readonly SaveReferenceRelation[];
}>;
export function probeSaveReferences(decoded: unknown): SaveReferenceProbe;
export function compareSaveReferenceProbes(previous: unknown, current: unknown): SaveReferenceComparison;
