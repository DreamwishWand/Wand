import type { Db02CatalogJoin, VerifiedAcquisitionBundle } from '../../src/lib/acquisition/db00-join';

export interface PrivateBundleReadOptions {
  /** Optional exact SRC-01 manifest path, byte-verified against SRC-02 provenance. */
  readonly src01ManifestPath?: string;
  /** SHA-256 obtained independently from a trusted release pointer, not from the bundle itself. */
  readonly expectedManifestSha256?: string;
}

export interface VerifiedPrivateAcquisitionBundle extends VerifiedAcquisitionBundle {
  readonly acquisitions: ReadonlyArray<Record<string, unknown>>;
  readonly lootTables: ReadonlyArray<Record<string, unknown>>;
  readonly shopOffers: ReadonlyArray<Record<string, unknown>>;
  readonly stallSources: ReadonlyArray<Record<string, unknown>>;
  readonly ingredientMembership: ReadonlyArray<Record<string, unknown>> | null;
  readonly conditionGates: ReadonlyArray<Record<string, unknown>>;
  readonly conditionDefinitions: ReadonlyArray<Record<string, unknown>>;
  readonly report: Readonly<Record<string, unknown>>;
  readonly unresolved: Readonly<Record<string, unknown>>;
}

/** Validates all dataset SHA hashes, source references, counts and types; freezes
 * the parsed source graph. Without expectedManifestSha256, only internal
 * consistency, not independently anchored provenance, has been established. */
export function loadVerifiedAcquisitionBundle(
  directory: string,
  options?: PrivateBundleReadOptions
): Promise<VerifiedPrivateAcquisitionBundle>;

/** Node-only entrypoint with a mandatory independently trusted manifest SHA. */
export function loadPinnedAcquisitionCatalogJoin(
  db00Snapshot: Record<string, unknown>,
  options: PrivateBundleReadOptions & {
    readonly directory: string;
    readonly expectedManifestSha256: string;
  }
): Promise<Db02CatalogJoin>;