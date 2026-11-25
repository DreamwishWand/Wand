/**
 * Public DB-01 Item-ID entry point with DB-02's verified six acquisition groups.
 *
 * The Item Master can select newer releases, but the DB-02 origin datasets
 * remain pinned to Steam 1.26.2. A cross-version join MUST fail closed, not
 * silently return 1.26.2 acquisition info for a newer Item definition.
 * Source sidecars remain on-demand within the supported release.
 */
import {
  openPublicItemMaster,
  openCurrentItemDatabase,
  type ItemMasterRecord,
  type ItemMasterRelease,
  type ItemMasterOpenOptions,
  type CompleteItemMasterRecord,
  type PublicCompleteItemMaster,
  type ItemMasterLocale,
  type ItemLocalizedTextRecord,
  type ItemFieldProjection,
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
  type Db01SourceRole,
  DB02_SOURCE_ROLES,
} from '../acquisition/db01-item-source-relations.ts';

export const PUBLIC_ITEM_DETAILS_CONTRACT =
  'wand.db01.public-item-details@1' as const;
/** DB-02 source datasets are independently verified only for this version. */
export const PUBLIC_ITEM_DETAILS_SOURCE_VERSION = '1.26.2' as const;

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
/** Full native source definition and all currently published acquisition links. */
export interface PublicCompleteItemDetails extends Omit<PublicItemDetailsWithSources,'definition'> {
  readonly definition: Readonly<CompleteItemMasterRecord>;
}
/** Locale-specific original text, resolved without loading other languages. */
export interface PublicLocalizedCompleteItemDetails extends PublicCompleteItemDetails {
  readonly locale: ItemMasterLocale;
  readonly localizedText: ItemLocalizedTextRecord;
}
/** Opt-in sparse join; omitted sides are never downloaded. */
export interface PublicItemSelectionOptions {
  readonly acquisition?: boolean;
  readonly sourceRelations?: boolean;
}
/** Exact configured source facts, not proof of a current grant or stock.
 * Source-specific friendship rewards are distinct from default rewards. */
export type AdditionalItemSource = Readonly<{
  kind:'character_friendship_reward'|'pet_friendship_reward';
  sourceId:number;
  level:number;
  rewardStage:'Tier1Reward';
  amount:number|null;
  sourceRecord:'Friendship'|'PetFriendship';
  sourceRecordIndex:number;
  sourceProtoDbSha256:string;
  currentAvailabilityVerified:false;
}> | Readonly<{
  kind:'configured_store_display'|'pre_dlc_store_list_member'|'design_challenge_catalog_unlock';
  sourceId:string;
  sourceRecordIndex:number;
  sourceField:string;
  sourcePosition?:number;
  sourceProtoDbSha256:string;
  currentAvailabilityVerified:false;
}>;
export interface CatalogAcquisitionFacts {
  readonly generatorExcluded:boolean|null;
  readonly syncOnline:boolean|null;
  readonly hidden:boolean|null;
  readonly onlineCategoryCode:number|null;
  readonly exclusionFlags:readonly string[];
  readonly flagsKnown:boolean;
  readonly gateStatus:'empty_source_gate'|'configured_source_gate';
  readonly catalogVisibilityConditions:Readonly<Record<string,unknown>>;
  readonly relatedConditions:readonly Readonly<{
    targetItemId:number;kind:string;sourcePath:string;predicate:Readonly<Record<string,unknown>>;
    commonConditionPath:readonly number[];resolved:boolean;
  }>[];
  readonly prerequisite:Readonly<{kind:'mission_completed';missionItemId:number}
    |{kind:'mission_step_completed';missionItemId:number;stepId:number}>|null;
  readonly storeMembershipVerified:false;
  readonly currentAvailabilityVerified:false;
}
/** Only the reviewed native furniture type, IIsHiddable and IAvailability gates.
 * Non-exclusion is not evidence of shop membership. */
export interface StoreDisplayScreen {
  readonly status:'excluded_by_furniture_type'|'excluded_by_hidden'|'excluded_by_generator'|'not_excluded_by_reviewed_gates'|'unresolved';
  readonly furnitureTypeGate:boolean|null;
  readonly hidden:boolean|null;
  readonly generatorExcluded:boolean|null;
  readonly scope:'generated_furniture_clothing_display';
  readonly otherNativeConditionsVerified:false;
  readonly storeMembershipVerified:false;
  readonly currentAvailabilityVerified:false;
}
export interface PublicSelectedItem extends ItemFieldProjection {
  readonly storeDisplayScreen?:Readonly<StoreDisplayScreen>;
  /** Original catalog predicates, not proof of store membership or live stock. */
  readonly catalogFacts?:Readonly<CatalogAcquisitionFacts>;
  /** Current source-derived categories including individual friendship rewards.
   * Legacy acquisition.categories retains its independently pinned census. */
  readonly effectiveCategories?:readonly GameNativeItemCategory[];
  /** New exact source facts when sourceRelations is requested. */
  readonly additionalSources?:readonly AdditionalItemSource[];
  readonly acquisition?: Readonly<Db01ItemAcquisition>;
  readonly sourceRelations?: Readonly<Db01ItemSourceRecord>;
  readonly acquisitionStatus: 'current'|'pending_update';
  readonly currentAvailabilityVerified: false;
}
export interface PublicItemDetailsClient {
  readonly contract: typeof PUBLIC_ITEM_DETAILS_CONTRACT;
  readonly release: ItemMasterRelease;
  /** A lagging acquisition projection never blocks access to current canonical fields. */
  readonly acquisitionStatus: 'current'|'pending_update';
  getItem(itemId: number): Promise<Readonly<PublicItemDetails> | null>;
  getItems(itemIds: readonly number[]): Promise<readonly (Readonly<PublicItemDetails> | null)[]>;
  /** Sparse Item IDs; an absent ID is unclassified, not unobtainable. */
  listItemIdsByAcquisition(
    category?: GameNativeItemCategory
  ): Promise<readonly number[]>;
  getAcquisitionCoverage(): Promise<Readonly<Db01ItemAcquisitionCoverage>>;
  /** Select only needed canonical fields and optional existing DB-02 links. */
  getSelectedItems(itemIds:readonly number[],fields:readonly string[],
    options?:PublicItemSelectionOptions):Promise<readonly (Readonly<PublicSelectedItem>|null)[]>;
  /**
   * Full native IDs, roles and occurrence positions are available on demand;
   * normal UI must resolve names/images rather than render technical IDs.
   * The original getItem/getItems remain lightweight for existing consumers.
   */
  /** All source IDs, including definitions that do not have an icon or
   * player-facing name. Existing v1/v2 readers are compatibility views. */
  getCompleteItem(itemId:number):Promise<Readonly<PublicCompleteItemDetails>|null>;
  getCompleteItems(itemIds:readonly number[]):Promise<readonly (Readonly<PublicCompleteItemDetails>|null)[]>;
  /** Opt-in source text for detail panels; null text values retain their original keys. */
  getLocalizedCompleteItem(itemId:number,locale:ItemMasterLocale):Promise<Readonly<PublicLocalizedCompleteItemDetails>|null>;
  getLocalizedCompleteItems(itemIds:readonly number[],locale:ItemMasterLocale):Promise<readonly (Readonly<PublicLocalizedCompleteItemDetails>|null)[]>;
  getItemWithSources(itemId: number):
    Promise<Readonly<PublicItemDetailsWithSources> | null>;
  getItemsWithSources(itemIds: readonly number[]):
    Promise<readonly (Readonly<PublicItemDetailsWithSources> | null)[]>;
  /** Exposes source-only IDs even when missing from the current Item master. */
  getSourceRelations(itemId: number): Promise<Readonly<Db01ItemSourceRecord>>;
  /** Reverse original Quest/Recipe/Star Path/etc. IDs to Item IDs. */
  getSourceItemIds(kind: Db01SourceKind, sourceId: string, role?:Db01SourceRole):
    Promise<readonly number[]>;
  listItemIdsWithSources(): Promise<readonly number[]>;
}

function assert(ok: unknown, code: string): asserts ok {
  if (!ok) throw new TypeError('DB01_PUBLIC_DETAILS_' + code);
}

export async function openPublicItemDetails(
  basePath: string = '',
  fetcher: typeof fetch = fetch,
  options: ItemMasterOpenOptions = {},
): Promise<PublicItemDetailsClient> {
  // The normal current reader must pin one immutable complete manifest.
  // Reopening the registry lazily can select a different revision even when
  // the game version is unchanged (for example an in-version DLC release).
  const currentMaster=options.gameVersion==='current'&&options.scope===undefined
    ?await openCurrentItemDatabase(basePath,fetcher):null;
  const master=currentMaster??await openPublicItemMaster(basePath, fetcher, options);
  const legacyAcquisitionCompatible=master.release.target.gameVersion===PUBLIC_ITEM_DETAILS_SOURCE_VERSION;
  const acquisitionStatus=(currentMaster?Boolean(currentMaster.release.acquisitionProjection):legacyAcquisitionCompatible)
    ?'current' as const:'pending_update' as const;
  // Compatibility-only explicit historical reads retain their strict contract.
  // Current product reads may still use the canonical attributes during a
  // lagging acquisition update, but must not join old acquisition facts.
  if(options.gameVersion!=='current')assert(acquisitionStatus==='current',
    'SOURCE_HANDOFF_VERSION_NOT_PUBLISHED');
  const publicBase = basePath && !basePath.startsWith('/')
    ? '/' + basePath : basePath;
  let sidecarTask: Promise<Db01ItemAcquisitionIndex> | null = null;
  let sourcesTask: Promise<Db01ItemSourceRelations> | null = null;
  let allSourceItemIds: readonly number[] | null = null;
  let completeTask: Promise<PublicCompleteItemMaster>|null=currentMaster?Promise.resolve(currentMaster):null;
  const combined = new Map<number, Readonly<PublicItemDetails>>();
  const combinedWithSources = new Map<number, Readonly<PublicItemDetailsWithSources>>();
  const idLists = new Map<GameNativeItemCategory | undefined, readonly number[]>();

  function complete():Promise<PublicCompleteItemMaster>{
    if(completeTask)return completeTask;
    const task=options.gameVersion==='current'
      ?openCurrentItemDatabase(basePath,fetcher).then(reader=>{
        assert(reader.release.target.gameVersion===master.release.target.gameVersion,
          'CURRENT_REVISION_CHANGED');return reader;
      })
      :openPublicItemMaster(basePath,fetcher,{
        scope:'complete',gameVersion:master.release.target.gameVersion
      });
    completeTask=task;
    void task.catch(()=>{if(completeTask===task)completeTask=null;});
    return task;
  }
  function combineComplete(definition:CompleteItemMasterRecord,
    origins:Db01ItemAcquisitionIndex,index:Db01ItemSourceRelations):Readonly<PublicCompleteItemDetails>{
    const acquisition=origins.getItem(definition.itemId);
    const sourceRelations=index.getItem(definition.itemId);
    assert(Number(acquisition.itemId)===definition.itemId&&
      Number(sourceRelations.itemId)===definition.itemId,'ITEM_ID_MISMATCH');
    assert(sourceRelations.categories.length===acquisition.categories.length&&
      sourceRelations.categories.every((value,i)=>value===acquisition.categories[i]),
      'ACQUISITION_SOURCE_CATEGORY_MISMATCH');
    return Object.freeze({itemId:definition.itemId,definition,acquisition,sourceRelations,
      currentAvailabilityVerified:false as const});
  }
  async function localizedCompleteItems(itemIds:readonly number[],locale:ItemMasterLocale):
    Promise<readonly (Readonly<PublicLocalizedCompleteItemDetails>|null)[]> {
    const reader=await complete();
    const [definitions,texts]=await Promise.all([
      reader.getItems(itemIds),reader.getLocalizedItemsText(itemIds,locale)
    ]);
    assert(definitions.length===texts.length,'LOCALIZED_ITEM_COUNT_MISMATCH');
    if(!definitions.some(Boolean))return Object.freeze(definitions.map(()=>null));
    const [origins,index]=await Promise.all([sidecar(),sources()]);
    return Object.freeze(definitions.map((definition,i)=>{
      const localizedText=texts[i];
      assert((definition===null)===(localizedText===null),'LOCALIZED_ITEM_MISMATCH');
      if(!definition||!localizedText)return null;
      return Object.freeze({...combineComplete(definition,origins,index),locale,localizedText});
    }));
  }
  function sidecar(): Promise<Db01ItemAcquisitionIndex> {
    if(!legacyAcquisitionCompatible||acquisitionStatus!=='current')return Promise.reject(new TypeError('DB01_PUBLIC_DETAILS_SOURCE_HANDOFF_VERSION_NOT_PUBLISHED'));
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
    if(!legacyAcquisitionCompatible||acquisitionStatus!=='current')return Promise.reject(new TypeError('DB01_PUBLIC_DETAILS_SOURCE_HANDOFF_VERSION_NOT_PUBLISHED'));
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
    acquisitionStatus,
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
      // Normal current service filtering uses the complete canonical source
      // projection (including individual friendship rewards). Explicit old
      // snapshot callers retain the original compatibility index.
      const reader=options.gameVersion==='current'?await complete():null;
      const available=reader&&(await reader.getFieldCatalog()).some(f=>f.field==='acquisition.effectiveCategories');
      const ids=available&&reader
        ?Object.freeze(category
          ?[...await reader.findItemIdsByField('acquisition.effectiveCategories',{kind:'contains',value:category})]
          :(await reader.getFieldRows('acquisition.effectiveCategories')).map(([id])=>id))
        :Object.freeze((await sidecar()).listItemIds(category).map(id=>Number(id)));
      idLists.set(category, ids);
      return ids;
    },
    async getAcquisitionCoverage() {
      return (await sidecar()).coverage;
    },
    async getSelectedItems(itemIds:readonly number[],fields:readonly string[],selection:PublicItemSelectionOptions={}){
      const reader=await complete();
      const projected=await reader.getItemFields(itemIds,fields);
      if(!projected.some(Boolean))return Object.freeze(projected.map(()=>null));
      // Current services use the same canonical content-addressed revision
      // for Item fields and acquisition. No whole acquisition sidecar is
      // fetched, even when both source relations and summary are requested.
      if(options.gameVersion==='current'){
        const publication=reader.release.acquisitionProjection;
        const status=publication?'current' as const:'pending_update' as const;
        const selectedFields:string[]=[];
        if(selection.acquisition&&publication?.summaryCount)selectedFields.push('acquisition.summary');
        if(selection.sourceRelations&&publication?.relationCount)selectedFields.push('acquisition.sourceRelations');
        if(selection.acquisition||selection.sourceRelations){
          const catalog=new Set((await reader.getFieldCatalog()).map(f=>f.field));
          if(selection.acquisition&&catalog.has('acquisition.effectiveCategories'))selectedFields.push('acquisition.effectiveCategories');
          if(selection.sourceRelations&&catalog.has('acquisition.additionalSources'))selectedFields.push('acquisition.additionalSources');
          if(selection.sourceRelations&&catalog.has('acquisition.catalogFacts'))selectedFields.push('acquisition.catalogFacts');
          if(selection.sourceRelations&&catalog.has('acquisition.storeDisplayScreen'))selectedFields.push('acquisition.storeDisplayScreen');
        }
        const knownIds=[...new Set(projected.flatMap(row=>row?[row.itemId]:[]))];
        const metadata=selectedFields.length
          ?await reader.getItemFields(knownIds,selectedFields):[];
        const byId=new Map(metadata.flatMap(row=>row?[[row.itemId,row.values] as const]:[]));
        return Object.freeze(projected.map(row=>{
          if(!row)return null;
          const values=byId.get(row.itemId);
          const itemId=String(row.itemId);
          // Missing sparse row means no known route in this projection,
          // NOT unobtainable. A missing entire projection is pending_update.
          const acquisition=publication&&selection.acquisition
            ?(values?.['acquisition.summary'] as unknown as Readonly<Db01ItemAcquisition>|undefined)
              ??Object.freeze({itemId,categories:Object.freeze([]),details:Object.freeze({}),
                unresolvedOnlineHints:Object.freeze([]),classified:false as const,currentAvailabilityVerified:false as const})
            :undefined;
          const sourceRelations=publication&&selection.sourceRelations
            ?(values?.['acquisition.sourceRelations'] as unknown as Readonly<Db01ItemSourceRecord>|undefined)
              ??Object.freeze({itemId,categories:Object.freeze([]),links:Object.freeze([]),
                identifiedSourceLinks:false as const,sourceCoverageComplete:false as const})
            :undefined;
          assert(!acquisition||acquisition.itemId===itemId,'ITEM_ID_MISMATCH');
          assert(!sourceRelations||sourceRelations.itemId===itemId,'SOURCE_ITEM_ID_MISMATCH');
          if(acquisition&&sourceRelations)assert(
            acquisition.categories.length===sourceRelations.categories.length&&
            acquisition.categories.every((value,i)=>value===sourceRelations.categories[i]),
            'ACQUISITION_SOURCE_CATEGORY_MISMATCH');
          const effectiveCategories=selection.acquisition&&selectedFields.includes('acquisition.effectiveCategories')
            ?(values?.['acquisition.effectiveCategories'] as unknown as readonly GameNativeItemCategory[]|undefined)??Object.freeze([])
            :undefined;
          const additionalSources=selection.sourceRelations&&selectedFields.includes('acquisition.additionalSources')
            ?(values?.['acquisition.additionalSources'] as unknown as readonly AdditionalItemSource[]|undefined)??Object.freeze([])
            :undefined;
          return Object.freeze({...row,...(acquisition?{acquisition}:{}),
            ...(sourceRelations?{sourceRelations}:{}),...(effectiveCategories?{effectiveCategories}:{}),
            ...(additionalSources?{additionalSources}:{}),
            ...(selection.sourceRelations&&values?.['acquisition.storeDisplayScreen']?{
              storeDisplayScreen:values['acquisition.storeDisplayScreen'] as unknown as Readonly<StoreDisplayScreen>
            }:{}),
            ...(selection.sourceRelations&&values?.['acquisition.catalogFacts']?{
              catalogFacts:values['acquisition.catalogFacts'] as unknown as Readonly<CatalogAcquisitionFacts>
            }:{}),acquisitionStatus:status,currentAvailabilityVerified:false as const});
        }));
      }
      const [origins,index]=await Promise.all([
        selection.acquisition&&acquisitionStatus==='current'?sidecar():null,
        selection.sourceRelations&&acquisitionStatus==='current'?sources():null
      ]);
      return Object.freeze(projected.map(row=>{
        if(!row)return null;
        const acquisition=origins?.getItem(row.itemId);
        const sourceRelations=index?.getItem(row.itemId);
        if(acquisition&&sourceRelations)assert(
          acquisition.categories.length===sourceRelations.categories.length&&
          sourceRelations.categories.every((value,i)=>value===acquisition.categories[i]),
          'ACQUISITION_SOURCE_CATEGORY_MISMATCH');
        return Object.freeze({...row,...(acquisition?{acquisition}:{}),
          ...(sourceRelations?{sourceRelations}:{}),acquisitionStatus,currentAvailabilityVerified:false as const});
      }));
    },
    async getCompleteItem(itemId:number){
      const definition=await (await complete()).getItem(itemId);
      if(!definition)return null;
      const [origins,index]=await Promise.all([sidecar(),sources()]);
      return combineComplete(definition,origins,index);
    },
    async getCompleteItems(itemIds:readonly number[]){
      const definitions=await (await complete()).getItems(itemIds);
      if(!definitions.some(Boolean))return definitions.map(()=>null);
      const [origins,index]=await Promise.all([sidecar(),sources()]);
      return definitions.map(definition=>definition?combineComplete(definition,origins,index):null);
    },
    async getLocalizedCompleteItem(itemId:number,locale:ItemMasterLocale) {
      return (await localizedCompleteItems([itemId],locale))[0]??null;
    },
    getLocalizedCompleteItems:localizedCompleteItems,
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
    async getSourceItemIds(kind: Db01SourceKind, sourceId: string, role?:Db01SourceRole) {
      assert(role===undefined||DB02_SOURCE_ROLES.includes(role),'INVALID_SOURCE_ROLE');
      const index=await sources();
      const ids=index.getSourceItemIds(kind,sourceId);
      const matches=role===undefined?ids:ids.filter(id=>index.getItem(id).links.some(
        link=>link.kind===kind&&link.sourceId===sourceId&&link.role===role));
      return Object.freeze(matches.map(id=>Number(id)));
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

/** Normal product entry point. Version selection is internal; use getSelectedItems
 * for current canonical fields and acquisition projections. Other methods are
 * legacy compatibility reads and retain the historical sidecar gate. */
export function openCurrentItemDetails(basePath:string='',fetcher:typeof fetch=fetch){
  return openPublicItemDetails(basePath,fetcher,{gameVersion:'current'});
}
