export interface SaveDiagnosticReferenceView {
  readonly id: string;
  readonly label: string;
  readonly status: 'observed_consistent'|'observed_anomaly'|
    'not_observed'|'insufficient_evidence'|'sampled_inconclusive'|'inconclusive';
  readonly observed: number;
  readonly resolved: number;
  readonly unresolved: number;
  readonly missing: number;
  readonly malformed: number;
  readonly typeIssues: number;
  readonly sampled: boolean;
}
export interface SaveDiagnosticShapeDomainView {
  readonly domain: string;
  readonly status: string;
  readonly registered: number;
  readonly observed: number;
  readonly conflicting: number;
  readonly sampled: boolean;
}
export interface SaveDiagnosticView {
  readonly contract: 'wand.db05.browser-readonly-diagnostics@1';
  readonly referenceStatus: string;
  readonly rootValid: true;
  readonly knownPublicTemplates: number;
  readonly referenceRules: readonly SaveDiagnosticReferenceView[];
  readonly shapeDomains: readonly SaveDiagnosticShapeDomainView[];
  readonly privateIdsIncluded: false;
  readonly privateValuesIncluded: false;
  readonly fullSchemaVerified: false;
  readonly strictDecoderVerified: false;
  readonly referenceClosureVerified: false;
  readonly ownershipVerified: false;
  readonly writerAuthorized: false;
  readonly exportAuthorized: false;
}
export interface SaveDiagnosticCatalogFamilyView {
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly observed: number;
  readonly matched: number;
  readonly db01Matches: number;
  readonly db04Matches: number;
  readonly unresolved: number;
  readonly notLookedUp: number;
  readonly malformed: number;
  readonly sampled: boolean;
}
export interface SaveDiagnosticCatalogView {
  readonly contract: 'wand.db05.browser-redacted-catalog-view@1';
  readonly status: string;
  readonly sourceLabelsEqual: boolean;
  readonly sourceJointlyVerified: false;
  readonly families: readonly SaveDiagnosticCatalogFamilyView[];
  readonly privateIdsIncluded: false;
  readonly privateValuesIncluded: false;
  readonly writerAuthorized: false;
  readonly exportAuthorized: false;
}
export const SAVE_DIAGNOSTIC_VIEW_CONTRACT: 'wand.db05.browser-readonly-diagnostics@1';
export function makeSaveDiagnosticView(decoded: unknown): SaveDiagnosticView;
export function makeSaveCatalogAuditView(audit: unknown): SaveDiagnosticCatalogView;
