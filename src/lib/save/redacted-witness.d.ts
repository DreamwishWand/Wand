export type RedactedWitnessKind =
  'array' | 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'unverified';
export type RedactedWitnessDomain =
  'inventory' | 'chests' | 'collection' | 'grids' | 'appearance';
export interface RedactedWitnessDifference {
  readonly path: string;
  readonly relation: 'numeric_ambiguity' | 'type_conflict' | 'type_set_drift';
  readonly previousKinds: readonly RedactedWitnessKind[];
  readonly currentKinds: readonly RedactedWitnessKind[];
}
export interface RedactedWitnessDomainComparison {
  readonly domain: RedactedWitnessDomain;
  readonly status:
    'not_observed' | 'observed_type_conflict' | 'observed_witness_difference' |
    'same_observed_witnesses' | 'inconclusive';
  readonly sharedKnownPaths: number;
  readonly addedKnownPaths: readonly string[];
  readonly missingKnownPaths: readonly string[];
  readonly differingKinds: readonly RedactedWitnessDifference[];
  readonly unknownKindPaths: readonly string[];
  readonly writerAuthorized: false;
}
export interface RedactedWitnessComparison {
  readonly contract: 'wand.db05.redacted-witness-comparison@1';
  readonly comparisonBasis: 'redacted_known_field_shapes_only';
  readonly platformAndVersionUsedAsGates: false;
  readonly status:
    'invalid_or_unverified_root' | 'observed_type_conflict' |
    'observed_witness_difference' | 'inconclusive' | 'same_observed_witnesses';
  readonly domains: readonly RedactedWitnessDomainComparison[];
  readonly source: 'src06_lexical_scanner_via_db05_private_ingest';
  readonly authoritative: false;
  readonly complete: false;
  readonly strictDecoderVerified: false;
  readonly referenceClosureVerified: false;
  readonly writerAuthorized: false;
  readonly ownershipMutationAuthorized: false;
  readonly exportAuthorized: false;
}
export interface PrivateDb05SummaryInput {
  readonly schema: 'wand.db05.ingest@1';
  readonly safeForPublicRepository: false;
  readonly writerAuthorized: false;
  readonly current: {
    readonly publicWitnesses: readonly { readonly path: string; readonly type: string }[];
    readonly rootRequiredFieldsPresent: boolean;
    readonly rootRequiredObjectsObserved: boolean;
    readonly otherWitnessCount: number;
    readonly decoderAndBuildVerified: false;
    readonly writerAuthorized: false;
    readonly schemaObserved?: number | null;
  };
}
export const REDACTED_SAVE_WITNESS_CONTRACT: 'wand.db05.redacted-witness-comparison@1';
export function compareRedactedSaveWitnesses(
  previousSummary: PrivateDb05SummaryInput,
  currentSummary: PrivateDb05SummaryInput
): RedactedWitnessComparison;
