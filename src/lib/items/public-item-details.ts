/**
 * Public DB-01 Item-ID entry point with DB-02's verified six acquisition groups.
 *
 * This joins the already-published Steam 1.26.2 releases; it does not copy
 * game definitions or guess missing acquisition methods. The detailed sidecar
 * is fetched once, on first use, while the master remains shard-lazy.
 */
import {
  openPublicItemMaster,
  type ItemMasterRecord,
  type ItemMasterRelease,
} from './public-item-master.ts';
import {
  loadDb01ItemAcquisitionHandoff,
  type Db01ItemAcquisition,
  type Db01ItemAcquisitionCoverage,
  type Db01ItemAcquisitionIndex,
} from '../acquisition/db01-item-acquisition.ts';
import type {GameNativeItemCategory} from
  '../acquisition/game-native-item-categories.ts';
import {
  loadDb01ItemSourceRelations,
  type Db01ItemSourceRecord,
  type Db01ItemSourceRelations,
  type Db01SourceKind,
} from '../acquisition/db01-item-source-relations.ts';

export const PUBLIC_ITEM_DETAILS_CONTRACT =
  'wand.db01.public-item-details@1' as const;

export interface PublicItemDetails {
  readonly itemId: number;
  /** Complete public Item-ID master row, including names, icon GUID and Tags. */
  readonly definition: Readonly<ItemMasterRecord>;
  /** Six source-backed acquisition groups or explicitly unclassified. */
  readonly acquisition: Readonly<Db01ItemAcquisition>;
  /** Neither group membership nor native Premium/TimeLimited implies availability. */
  readonly currentAvailabilityVerified: false;
}
/** Opt-in full native source-ID links, including non-acquisition roles. */
export interface PublicItemDetailsWithSources extends PublicItemDetails {
  readonly sourceRelations: Readonly<Db01ItemSourceRecord>;
}
export interface PublicItemDetailsClient {
  readonly contract: typeof PUBLIC_ITEM_DETAILS_CONTRACT;
  readonly release: ItemMasterRelease;
  getItem(itemId: number): Promise<Readonly<PublicItemDetails> | null>;
  getItems(itemIds: readonly number[]): Promise<readonly (Readonly<PublicItemDetails> | null)[]>;
  /** Sparse Item IDs; an absent ID is unclassified, not unobtainable. */
  listItemIdsByAcquisition(
    category?: GameNativeItemCategory
  ): Promise<readonly number[]>;
  getAcquisitionCoverage(): Promise<Readonly<Db01ItemAcquisitionCoverage>>;
  /**
   * Full native IDs, roles and occurrence positions are available on demand;
   * normal UI must resolve names/images rather than render technical IDs.
   * The original getItem/getItems remain lightweight for existing consumers.
   */
  getItemWithSources(itemId: number):
    Promise<Readonly<PublicItemDetailsWithSources> | null>;
  getItemsWithSources(itemIds: readonly number[]):
    Promise<readonly (Readonly<PublicItemDetailsWithSources> | null)[]>;
  /** Exposes source-only IDs even when missing from the current Item master. */
  getSourceRelations(itemId: number): Promise<Readonly<Db01ItemSourceRecord>>;
  /** Reverse original Quest/Recipe/Star Path/etc. IDs to Item IDs. */
  getSourceItemIds(kind: Db01SourceKind, sourceId: string):
    Promise<readonly number[]>;
  listItemIdsWithSources(): Promise<readonly number[]>;
}

function assert(ok: unknown, code: string): asserts ok {
  if (!ok) throw new TypeError('DB01_PUBLIC_DETAILS_' + code);
}

export async function openPublicItemDetails(
  basePath: string = '',
  fetcher: typeof fetch = fetch
): Promise<PublicItemDetailsClient> {
  // The public master accepts both "Wand" and "/Wand"; the DB-02 loader
  // expects an absolute app base. Validate with the master before normalizing.
  const master = await openPublicItemMaster(basePath, fetcher);
  const publicBase = basePath && !basePath.startsWith('/')
    ? '/' + basePath : basePath;
  let sidecarTask: Promise<Db01ItemAcquisitionIndex> | null = null;
  let sourcesTask: Promise<Db01ItemSourceRelations> | null = null;
  let allSourceItemIds: readonly number[] | null = null;
  const combined = new Map<number, Readonly<PublicItemDetails>>();
  const combinedWithSources = new Map<number, Readonly<PublicItemDetailsWithSources>>();
  const idLists = new Map<GameNativeItemCategory | undefined, readonly number[]>();

  function sidecar(): Promise<Db01ItemAcquisitionIndex> {
    if (sidecarTask) return sidecarTask;
    const task = loadDb01ItemAcquisitionHandoff(publicBase, fetcher)
      .then(index => {
        assert(index.gameVersion === master.release.target.gameVersion,
          'SOURCE_VERSION_MISMATCH');
        return index;
      });
    sidecarTask = task;
    // A transient fetch failure must not poison subsequent user retries.
    void task.catch(() => {
      if (sidecarTask === task) sidecarTask = null;
    });
    return task;
  }
  function sources(): Promise<Db01ItemSourceRelations> {
    if (sourcesTask) return sourcesTask;
    const task = loadDb01ItemSourceRelations(publicBase, fetcher)
      .then(index => {
        assert(index.gameVersion === master.release.target.gameVersion,
          'SOURCE_LINK_VERSION_MISMATCH');
        return index;
      });
    sourcesTask = task;
    void task.catch(() => {
      if (sourcesTask === task) sourcesTask = null;
    });
    return task;
  }
  function combineWithSourceLinks(
    detail: Readonly<PublicItemDetails>,
    index: Db01ItemSourceRelations
  ): Readonly<PublicItemDetailsWithSources> {
    const cached = combinedWithSources.get(detail.itemId);
    if (cached) return cached;
    const sourceRelations = index.getItem(detail.itemId);
    const categories = detail.acquisition.categories;
    assert(sourceRelations.categories.length === categories.length &&
      sourceRelations.categories.every((value, i) => value === categories[i]),
      'ACQUISITION_SOURCE_CATEGORY_MISMATCH');
    const enriched: Readonly<PublicItemDetailsWithSources> = Object.freeze({
      ...detail,
      sourceRelations,
    });
    combinedWithSources.set(detail.itemId, enriched);
    return enriched;
  }
  function combine(
    definition: ItemMasterRecord,
    origins: Db01ItemAcquisitionIndex
  ): Readonly<PublicItemDetails> {
    const cached = combined.get(definition.itemId);
    if (cached) return cached;
    const acquisition = origins.getItem(definition.itemId);
    assert(Number(acquisition.itemId) === definition.itemId,
      'ITEM_ID_MISMATCH');
    const detail: Readonly<PublicItemDetails> = Object.freeze({
      itemId: definition.itemId,
      definition,
      acquisition,
      currentAvailabilityVerified: false as const,
    });
    combined.set(definition.itemId, detail);
    return detail;
  }
  return Object.freeze({
    contract: PUBLIC_ITEM_DETAILS_CONTRACT,
    release: master.release,
    async getItem(itemId: number) {
      const definition = await master.getItem(itemId);
      if (!definition) return null;
      return combine(definition, await sidecar());
    },
    async getItems(itemIds: readonly number[]) {
      const definitions = await master.getItems(itemIds);
      if (!definitions.some(Boolean)) return definitions.map(() => null);
      const origins = await sidecar();
      return definitions.map(definition =>
        definition ? combine(definition, origins) : null);
    },
    async listItemIdsByAcquisition(category?: GameNativeItemCategory) {
      const existing = idLists.get(category);
      if (existing) return existing;
      const ids = Object.freeze((await sidecar()).listItemIds(category)
        .map(id => Number(id)));
      idLists.set(category, ids);
      return ids;
    },
    async getAcquisitionCoverage() {
      return (await sidecar()).coverage;
    },
    async getItemWithSources(itemId: number) {
      const definition = await master.getItem(itemId);
      if (!definition) return null;
      const [acquisition, sourceIndex] = await Promise.all([sidecar(), sources()]);
      return combineWithSourceLinks(combine(definition, acquisition), sourceIndex);
    },
    async getItemsWithSources(itemIds: readonly number[]) {
      const definitions = await master.getItems(itemIds);
      if (!definitions.some(Boolean)) return definitions.map(() => null);
      const [acquisition, sourceIndex] = await Promise.all([sidecar(), sources()]);
      return definitions.map(definition =>
        definition ? combineWithSourceLinks(combine(definition, acquisition), sourceIndex) : null);
    },
    async getSourceRelations(itemId: number) {
      return (await sources()).getItem(itemId);
    },
    async getSourceItemIds(kind: Db01SourceKind, sourceId: string) {
      const ids = (await sources()).getSourceItemIds(kind, sourceId);
      return Object.freeze(ids.map(id => Number(id)));
    },
    async listItemIdsWithSources() {
      if (allSourceItemIds) return allSourceItemIds;
      const ids = Object.freeze((await sources()).listItemIds()
        .map(id => Number(id)));
      allSourceItemIds = ids;
      return ids;
    },
  });
}
