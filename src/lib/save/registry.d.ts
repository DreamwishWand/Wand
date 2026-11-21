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
  issues: readonly string[];
  strictDecoderVerified: false;
  externalBuildVerified: false;
  referenceClosureVerified: false;
  writerAuthorized: false;
  ownershipMutationAuthorized: false;
  exportAuthorized: false;
}>;
export type FieldWitness = Readonly<{ path: string; type: string }>;
export function getSaveRegistry(): Readonly<Record<string, unknown>>;
export function getLegacySaveFields(): Readonly<{schema: string; saveSchemaVersion: number; fields: ReadonlyArray<{domain:string;path:string;type:string;builds:string[];constraint:string;writable:false}>}>;
export function matchSaveBuild(build: Partial<SaveBuildIdentity>): SaveBuildCandidate | null;
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
export const SAVE_REGISTRY_SCHEMA: 'wand.db05.save-registry@1';
export const SAVE_INSPECTION_CONTRACT: 'wand.db05.save-readonly-inspection@1';
