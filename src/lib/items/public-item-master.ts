/**
 * Read-only public item master for Collection, Explore and World Editor.
 * Item ID is the persistent identity, independent of source version or saves.
 * Normal consumers openCurrentItemDatabase(); internally a manifest selects
 * the current verified projection. Historical snapshot reads are compatibility
 * tools. Exact-ID reads fetch one verified shard; batch reads are bounded.
 *
 * Original tags are facts; Collection source candidates are NOT proof of
 * visible game-screen membership or availability.
 */
import {createItemFieldReader,type ItemFieldReader} from './item-field-reader.ts';
export type {ItemFieldValue,ItemFieldScalar,ItemFieldInfo,ItemFieldProjection,ItemFieldMatch} from './item-field-reader.ts';

export const ITEM_MASTER_RELEASE = 'steam-1.26.2-item-id-master-v1' as const;
export const ITEM_MASTER_INDEX_PATH =
  'ddv/item-master/steam-1.26.2/index.json' as const;
/** Backward-compatible default until all dependent source DBs are versioned. */
export const ITEM_MASTER_DEFAULT_GAME_VERSION = '1.26.2' as const;
export const ITEM_MASTER_VERSIONS_PATH = 'ddv/item-master-releases.json' as const;
/** Pass "current" for the release selected by the public version catalog. */
export interface ItemMasterOpenOptions {
  readonly gameVersion?: string;
  /** Expanded view adds original collectibles without replacing the base snapshot. */
  readonly scope?: 'base' | 'expanded';
}
/** Complete source definitions include non-collectible and non-icon records. */
export interface CompleteItemMasterOpenOptions {
  readonly gameVersion?: string;
  readonly scope: 'complete';
  /** Internal current product storage, not a game-version choice. */
  readonly contentAddressed?: true;
}
export interface ItemMasterAcquisitionPins {
  readonly summarySha256:string;
  readonly relationsSha256:string;
}
export interface ItemMasterAcquisitionProjection extends ItemMasterAcquisitionPins {
  readonly sourceGameVersion:string;
  readonly summaryCount:number;
  readonly relationCount:number;
  readonly sourceOnlySummaryCount:number;
  readonly sourceOnlyRelationCount:number;
  readonly sourceLinks:number;
  readonly currentAvailabilityVerified:false;
  readonly coverageComplete:false;
}
export interface ItemMasterCompleteRelease {
  readonly acquisitionProjection?:Readonly<ItemMasterAcquisitionPins>;
  readonly release: string;
  readonly count: number;
  readonly archiveSha256: string;
  readonly parts: number;
  readonly introductionHistorySha256?: string;
  readonly attributesSha256?: string;
  readonly nativeSupplementSha256?: string;
  readonly referenceAttributesSha256?: string;
  readonly reviewedRootArraysSha256?: string;
  readonly reviewedMessagesSha256?: string;
  readonly reviewedMessageGroupsSha256?: string;
  readonly reviewedStructure?: Readonly<Record<'reviewed-structure'|'reviewed-quest-steps',string>>;
  readonly reviewedRootScalars?: readonly string[];
  readonly linkedLocalizations?: Readonly<Record<ItemMasterLocale,string>>;
  readonly localization?: Readonly<{parts:number;sha256:string}>;
}
export interface ItemMasterExpandedRelease {
  readonly release: string;
  readonly count: number;
  readonly extensionSha256: string;
}
export type ItemMasterUniverseStatus =
  'source_linked' | 'unresolved_source' | 'no_universe_in_verified_tag_fields';
export interface ItemMasterVersions {
  readonly schema: 'wand.item-master.versions@1';
  readonly current: string;
  readonly releases: readonly Readonly<{
    gameVersion: string;
    release: string;
    count: number;
    archiveSha256: string;
    expanded?: Readonly<ItemMasterExpandedRelease>;
    complete?: Readonly<ItemMasterCompleteRelease>;
  }>[];
}
export const ITEM_MASTER_LOCALES =
  ['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'] as const;
export type ItemMasterLocale = (typeof ITEM_MASTER_LOCALES)[number];

export interface ItemMasterTag {
  readonly id: number;
  readonly key: string;
  readonly facet: string;
  /** Original protobuf field, not an inferred product category. */
  readonly sourceField: number;
}
export interface ItemMasterType {
  readonly code: number;
  readonly name: string;
  readonly subtypeCode: number;
  readonly subtypeEnum: string | null;
  readonly subtypeName: string | null;
  readonly subtypeNameVerified: boolean;
}
export interface ItemMasterCollectionCandidate {
  readonly setId: number;
  readonly submenuCode?: number | null;
  readonly groupIndex: number;
  readonly evidence: string;
  readonly labelKey?: string | null;
  readonly sourceSetItemId?: number | null;
  readonly universeTagId?: number | null;
  readonly universeTagKey?: string | null;
  readonly criterion?: number | null;
  readonly criterionName?: string | null;
  readonly sourceRule?: string | null;
  readonly sourceField?: string | null;
  readonly tagKey?: string | null;
  readonly selectorIndex?: number;
  readonly sourceRecipeItemId?: number | null;
}
export interface ItemMasterRecord {
  readonly itemId: number;
  readonly names: Readonly<Record<ItemMasterLocale,string | null>>;
  readonly nameVerified: boolean;
  readonly nativeCategory: string;
  readonly nativeKey: string;
  /** GUID uniquely resolves the icon asset, not an active CDN URL. */
  readonly iconGuid: string;
  /** Exact original artwork addresses; MemoryShard retains image and mask. */
  readonly artwork?: Readonly<{
    iconGuid: string;
    imageGuid?: string | null;
    maskGuid?: string | null;
  }>;
  /** Numeric original universe references, not inferred ownership. */
  readonly universeTagIds?: readonly number[];
  readonly universeSourceStatus?: ItemMasterUniverseStatus;
  readonly itemType: Readonly<ItemMasterType>;
  readonly tags: readonly Readonly<ItemMasterTag>[];
  readonly collectionSourceCandidates: readonly Readonly<ItemMasterCollectionCandidate>[];
  readonly collectionMembershipVerified: false;
  readonly worldMembershipVerified: false;
  readonly availabilityVerified: false;
}
export type ItemDefinitionScope = 'source_candidate' | 'item_definition' | 'other_definition';
/** Canonical source record, not necessarily an obtainable item. A null icon
 * or name is valid and does not prevent resolving the native source ID. */
export type NativeSourceValue = number|boolean|string|readonly NativeSourceValue[]|NativeSourceObject;
export interface NativeSourceObject {readonly [key:string]:NativeSourceValue|undefined}
export interface NativeSourceAttributes extends NativeSourceObject {
  readonly GridAreaData?: Readonly<{
    SizeX?:number; SizeY?:number; Layers?:readonly number[];
    AcceptedFloorTypesFlag?:number; StrideOverride?:number;
    _unresolvedFields?:readonly number[];
  }>;
  readonly PriceOverride?: Readonly<{
    Currency?:number; Price?:Readonly<{Id?:number;Amount?:number}>;
    _unresolvedFields?:readonly number[];
  }>;
  readonly Result?: Readonly<{ItemID?:number;Amount?:number;_unresolvedFields?:readonly number[]}>;
  readonly ResultItemID?: number;
  readonly Ingredients?: readonly Readonly<{
    ItemID?:number; Amount?:number; Any?:number;
    ValidItemsList?:Readonly<{List?:readonly number[]}>;
    TagsList?:Readonly<{List?:readonly number[]}>;
    _unresolvedFields?:readonly number[];
  }>[];
  readonly Description?:string;
  readonly DescriptionText?:string;
  readonly DisplayName?:string;
  readonly ManaRecovered?:number;
  readonly CatalogVisibilityConditions?:NativeSourceObject;
  readonly GridEditRestriction?:NativeSourceObject;
  readonly AppearWhen?:NativeSourceObject;
}
export const ITEM_LOCALIZED_TEXT_FIELDS =
  ['Description','DescriptionText','EvolvingDescription','PluralDisplayName'] as const;
export type ItemLocalizedTextField = (typeof ITEM_LOCALIZED_TEXT_FIELDS)[number];
export interface ItemLocalizedText {
  readonly key: string;
  /** Original text in the requested language. Missing keys are never guessed. */
  readonly text: string|null;
}
export type ItemLocalizedTextRecord = Readonly<Partial<Record<ItemLocalizedTextField,Readonly<ItemLocalizedText>>>>;
export interface ItemLocalizationCoverage {
  readonly itemCount:number;
  readonly keyCount:number;
  readonly allLocalesKeyCount:number;
  readonly fieldCounts:Readonly<Partial<Record<ItemLocalizedTextField,number>>>;
  readonly localeCounts:Readonly<Record<ItemMasterLocale,number>>;
  readonly evidence:Readonly<Record<ItemMasterLocale,Readonly<{
    archiveSha256:string; members:Readonly<Record<string,string>>
  }>>>;
}
export interface NativeSourceAttributeCoverage {
  readonly itemCount:number;
  readonly fieldCount:number;
  readonly fieldOccurrences:number;
  readonly fields:Readonly<Record<string,number>>;
  readonly unmappedSourceClassCount:Readonly<Record<string,number>>;
  readonly allOriginalFieldSemanticsVerified:false;
  readonly gridLayerOccupancyVerified:false;
  readonly runtimePriceVerified:false;
}
export interface CompleteItemMasterRecord extends Omit<ItemMasterRecord,
  'iconGuid'|'artwork'|'universeTagIds'|'universeSourceStatus'> {
  readonly iconGuid: string | null;
  readonly artwork: Readonly<Partial<Record<
    'iconGuid'|'prefabGuid'|'imageGuid'|'maskGuid'|'maskDataGuid'|
    'blurredIconGuid'|'alternativeIconGuid',string>>>;
  readonly universeTagIds: readonly number[];
  readonly universeDirectTagIds: readonly number[];
  readonly universeSetTagIds: readonly number[];
  readonly universePredicateTagIds: readonly number[];
  readonly universeSourceStatus: ItemMasterUniverseStatus;
  readonly worldTagIds: readonly number[];
  readonly sourceSetItemId: number | null;
  readonly craftingRecipeItemIds: readonly number[];
  readonly collectionPositiveSourceLinks: readonly Readonly<ItemMasterCollectionCandidate>[];
  readonly collectionExclusions: readonly Readonly<ItemMasterCollectionCandidate>[];
  readonly definitionScope: ItemDefinitionScope;
  /** Selected native declaration. It is not a verified runtime dispatch table. */
  readonly sourceClass: string | null;
  /** Original file payload offset and byte length, for offline source lookup. */
  readonly sourceFrame: readonly [number,number];
  /** Observed field number, wire type and occurrence count, including unknown fields. */
  readonly observedFields: readonly (readonly [number,number,number])[];
  readonly nativeProperties: Readonly<Record<string,number|boolean>>;
  /** Additional explicitly present original fields; absence is not a default.
   * Grid layer values do not establish occupancy, PriceOverride is not live pricing.
   * _unresolvedFields lists nested field numbers not decoded. */
  readonly sourceAttributes?: NativeSourceAttributes;
}
export interface ItemMasterAsset {
  readonly count: number;
  readonly bytes: number;
  readonly sha256: string;
}
export interface ItemMasterTagLabel {
  readonly tagId: number;
  readonly key: string;
  readonly names: Readonly<Record<ItemMasterLocale,string|null>>;
}
export interface CompleteItemMasterFacets {
  readonly schema: 'wand.collection.db01-complete-source-facets@1';
  readonly release: string;
  readonly sourceItemCount: number;
  readonly nativeSubtypeItems: readonly (readonly [number,string,number,string|null])[];
  readonly definitionScopeItems: readonly (readonly [number,ItemDefinitionScope])[];
  readonly browseItems: readonly (readonly [number,string,number,string|null,ItemDefinitionScope])[];
  readonly items: readonly (readonly [number,readonly (readonly [string,string])[]])[];
  readonly categoryItems: readonly (readonly [number,readonly number[]])[];
  readonly activityTypeItems: readonly (readonly [number,number,string|null])[];
  readonly universeSourceItems: readonly (readonly [number,readonly string[]])[];
  readonly universeSourceTagItems: readonly (readonly [number,readonly number[]])[];
  readonly universeSourceStatusItems: readonly (readonly [number,ItemMasterUniverseStatus])[];
  readonly worldSourceTagItems: readonly (readonly [number,readonly number[]])[];
  readonly sourceSetItems: readonly (readonly [number,number])[];
  readonly craftingRecipeResultItems: readonly (readonly [number,readonly number[]])[];
  readonly universeTags: readonly ItemMasterTagLabel[];
  readonly worldTags: readonly ItemMasterTagLabel[];
  readonly gameRuntimeMembershipVerified: false;
}
export interface CompleteItemMasterRelations {
  readonly schema: 'wand.item-master.complete-source-relations@1';
  readonly release: string;
  readonly collectionMenus: readonly Readonly<{
    setId:number; setKey:string; submenuCode:number; submenu:string;
    collectionLabelKey:string|null; sortPriority:number; groupCount:number;
    directListedItemCount:number;
  }>[];
  /** Original selectors retain family-specific native criteria and polarity. */
  readonly collectionSelectors: readonly Readonly<Record<string,unknown>>[];
  readonly ignoredSentinels: readonly (readonly [number,number])[];
  readonly universeTags: readonly ItemMasterTagLabel[];
  readonly worldTags: readonly ItemMasterTagLabel[];
  readonly sourceFieldDeclarations: Readonly<Record<string,Readonly<Record<string,number>>>>;
  readonly gameRuntimeMembershipVerified: false;
}
export interface ItemMasterRelease {
  readonly acquisitionProjection?:Readonly<ItemMasterAcquisitionProjection>;
  readonly schema: 'wand.item-master.release@1';
  readonly version: string;
  readonly target: Readonly<{platform:'Steam';gameVersion:string}>;
  readonly count: number;
  readonly scope?: 'expanded'|'complete';
  readonly archiveSha256?: string;
  readonly introductionHistorySha256?: string;
  readonly attributesSha256?: string;
  readonly sourceAttributeCoverage?: NativeSourceAttributeCoverage;
  readonly nativeSupplementSha256?: string;
  readonly nativeSupplementCoverage?: Readonly<{strideOverrideCount:number;runtimeSemanticsVerified:false}>;
  readonly referenceAttributesSha256?: string;
  readonly referenceAttributeCoverage?: Readonly<{fields:Readonly<Record<string,number>>;runtimeSemanticsVerified:false}>;
  readonly reviewedRootArraysSha256?: string;
  readonly reviewedRootArrayCoverage?: Readonly<{fields:Readonly<Record<string,Readonly<{itemCount:number;valueCount:number;category:string;elementType:string}>>>;runtimeSemanticsVerified:false}>;
  readonly reviewedMessagesSha256?: string;
  readonly reviewedMessageCoverage?: Readonly<{fields:Readonly<Record<string,Readonly<{itemCount:number;occurrences:number;leafCount:number;category:string;declaredType:string}>>>;runtimeSemanticsVerified:false}>;
  readonly reviewedMessageGroupsSha256?: string;
  readonly reviewedMessageGroupCoverage?: Readonly<{fields:Readonly<Record<string,Readonly<{itemCount:number;occurrences:number;leafCount:number;category:string;declaredType:string}>>>;runtimeSemanticsVerified:false}>;
  readonly reviewedStructure?: Readonly<Record<'reviewed-structure'|'reviewed-quest-steps',string>>;
  readonly reviewedRootScalars?: readonly string[];
  readonly linkedLocalizations?: Readonly<Record<ItemMasterLocale,string>>;
  readonly reviewedRootScalarCoverage?: Readonly<{groupCount:number;itemCount:number;fieldPairs:number;occurrences:number;leafCount:number;existingPairs:number;addedPairs:number;identityOccurrences:number;runtimeSemanticsVerified:false}>;
  readonly reviewedStructureCoverage?: Readonly<{fields:Readonly<Record<string,Readonly<{itemCount:number;occurrences:number;leafCount:number;category:string;declaredType:string}>>>;runtimeSemanticsVerified:false}>;
  readonly localizationSha256?: string;
  readonly localizationCoverage?: ItemLocalizationCoverage;
  readonly linkedLocalizationCoverage?: Readonly<{keyCount:number;allLocalesKeyCount:number;localeCounts:Readonly<Record<ItemMasterLocale,number>>;sourceArchiveHashes:Readonly<Record<ItemMasterLocale,string>>;bucketCount:64}>;
  readonly sourceFilesVerified?: number;
  readonly sourceFilesSha256?: Readonly<Record<string,string>>;
  readonly sourceItemsSha256?: string;
  readonly sourceIl2cppDumpSha256?: string;
  readonly assets?: Readonly<Record<string,ItemMasterAsset>>;
  readonly baseRelease?: string;
  readonly baseCount?: number;
  readonly extensionCount?: number;
  readonly extensionSha256?: string;
  readonly bucketCount: 256;
  readonly coverage: Readonly<{
    itemNamesVerified: number;
    itemNamesUnverified: number;
    itemIconGuid: number;
    sourceTagReferences: number;
    itemsWithSourceTag: number;
    sourceCollectionCandidateReferences: number;
    itemsWithSourceCollectionCandidates: number;
    worldMembershipVerified: false;
    collectionMembershipVerified: false;
    acquisitionCoverageComplete: false;
    publishedR2ImageUrlAvailable: false;
    definitionCount?: number;
    nativeCategoryCount?: number;
    sourceSelectorCount?: number;
    positiveSourceLinks?: number;
    negativeSourceLinks?: number;
    worldTagItemIds?: number;
    recipeResultItemIds?: number;
    recipeResultLinks?: number;
    scalarProperties?: number;
    allOriginalFieldSemanticsVerified?: false;
  }>;
  readonly shards: Readonly<Record<string, Readonly<{
    count:number; bytes?:number; sha256?:string;
  }> | number>>;
}
export interface PublicItemMaster<T extends ItemMasterRecord|CompleteItemMasterRecord = ItemMasterRecord> {
  readonly release: ItemMasterRelease;
  getItem(itemId: number): Promise<T | null>;
  getItems(itemIds: readonly number[]): Promise<(T | null)[]>;
}
/** The other ItemID and the original occurrence path on the source definition. */
export type ItemReferenceOccurrence=readonly [otherItemId:number,sourcePath:string];
export type ItemReferenceDirection='incoming'|'outgoing';
export const NATIVE_ACQUISITION_ROLES = [
  'activity_result','produced_item','story_reward','board_game_reward','duty_reward',
  'conditional_grant','quest_currency_reward','quest_additional_loot_candidate','loot_table_candidate'
] as const;
export type NativeAcquisitionRole=(typeof NATIVE_ACQUISITION_ROLES)[number];
/** Original source definition and occurrence only; not a confirmed grant or availability. */
export type NativeAcquisitionCandidate=readonly [sourceItemId:number,role:NativeAcquisitionRole,sourcePath:string];

export interface PublicCompleteItemMaster extends PublicItemMaster<CompleteItemMasterRecord>, ItemFieldReader {
  /** Collection-only projection; fetch neither all shards nor all languages. */
  getCollectionFacets(): Promise<CompleteItemMasterFacets>;
  getBrowseNames(locale: ItemMasterLocale): Promise<readonly (readonly [number,string])[]>;
  /** Resolve description and other original text fields for one ItemID.
   * Loads only the requested language, never the full eight-language corpus. */
  getLocalizedItemText(itemId:number,locale:ItemMasterLocale):Promise<ItemLocalizedTextRecord|null>;
  getLocalizedItemsText(itemIds:readonly number[],locale:ItemMasterLocale):Promise<readonly (ItemLocalizedTextRecord|null)[]>;
  /** Resolve exact source keys (including nested quest/event keys) in order. Missing keys are null. */
  getLocalizedKeys(keys:readonly string[],locale:ItemMasterLocale):Promise<readonly (string|null)[]>;
  getSourceRelations(): Promise<CompleteItemMasterRelations>;
  /** Source-declared links in published canonical fields, not a proof of acquisition. */
  getItemReferences(itemId:number,direction:ItemReferenceDirection):Promise<readonly ItemReferenceOccurrence[]|null>;
  /** Ordered batch lookup, preserving duplicates, unknown IDs and empty edge lists. */
  getItemsReferences(itemIds:readonly number[],direction:ItemReferenceDirection):Promise<readonly (readonly ItemReferenceOccurrence[]|null)[]>;
  getNativeAcquisitionCandidates(itemIds:readonly number[]):Promise<readonly (readonly NativeAcquisitionCandidate[]|null)[]>;
}
const SHA = /^[0-9a-f]{64}$/;
const GAME_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const RELEASE_VERSION = /^steam-([0-9]+\.[0-9]+\.[0-9]+)-item-id-master-v[1-9][0-9]*$/;
const MAX_DEFINITIONS = 1_000_000;
const MAX_SHARD_BYTES = 16 * 1024 * 1024;
const GUID = /^[0-9a-f]{32}$/;
const ID = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
function assert(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error('ITEM_MASTER_' + reason);
}
function pathFor(id:number): string {
  return 'id/' + (id & 255).toString(16).padStart(2, '0') + '.json';
}
function isObject(x:unknown): x is Record<string,unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}
/** Freeze the shared per-shard Item objects so one consumer cannot corrupt others. */
function freezeItemRecord<T extends ItemMasterRecord|CompleteItemMasterRecord>(item:T):T {
  if('observedFields' in item)return deepFreeze(item);
  Object.freeze(item.names);
  Object.freeze(item.itemType);
  if(item.artwork)Object.freeze(item.artwork);
  if(item.universeTagIds)Object.freeze(item.universeTagIds);
  item.tags.forEach(tag=>Object.freeze(tag));
  Object.freeze(item.tags);
  item.collectionSourceCandidates.forEach(candidate=>Object.freeze(candidate));
  Object.freeze(item.collectionSourceCandidates);
  return Object.freeze(item);
}
function deepFreeze<T>(value:T):T {
  if(value!==null&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function validSourceValue(v:unknown,depth=0):boolean{
  if(depth>16)return false;
  if(typeof v==='boolean'||typeof v==='string'||typeof v==='number'&&Number.isFinite(v))return true;
  if(Array.isArray(v))return v.every(x=>validSourceValue(x,depth+1));
  return isObject(v)&&Object.entries(v).every(([k,x])=>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)&&!['__proto__','constructor','prototype'].includes(k)&&
    validSourceValue(x,depth+1));
}
function validRecord(raw:unknown, bucket:string, complete:boolean): raw is ItemMasterRecord|CompleteItemMasterRecord {
  if (!isObject(raw) || !ID(raw.itemId) || pathFor(raw.itemId) !== bucket ||
      typeof raw.nativeCategory !== 'string' ||
      typeof raw.nativeKey !== 'string' ||
      !(complete&&raw.iconGuid===null || typeof raw.iconGuid === 'string'&&GUID.test(raw.iconGuid)) ||
      !isObject(raw.itemType) || !isObject(raw.names) ||
      !Array.isArray(raw.tags) ||
      !Array.isArray(raw.collectionSourceCandidates) ||
      raw.collectionMembershipVerified !== false ||
      raw.worldMembershipVerified !== false ||
      raw.availabilityVerified !== false) return false;
  const artwork=raw.artwork;
  if(artwork!==undefined){
    if(!isObject(artwork)||(artwork.iconGuid??null)!==raw.iconGuid)return false;
    for(const key of ['imageGuid','maskGuid']){
      const value=artwork[key];
      if(value!==undefined&&value!==null&&
        (typeof value!=='string'||!GUID.test(value)))return false;
    }
  }
  if(raw.universeTagIds!==undefined && (!Array.isArray(raw.universeTagIds)||
      !raw.universeTagIds.every((id:unknown)=>ID(id)&&id>=2000500000&&id<2000600000)||
      new Set(raw.universeTagIds).size!==raw.universeTagIds.length))return false;
  if(raw.universeSourceStatus!==undefined &&
      !['source_linked','unresolved_source','no_universe_in_verified_tag_fields']
        .includes(String(raw.universeSourceStatus)))return false;
  const names = raw.names as Record<string,unknown>;
  if (!ITEM_MASTER_LOCALES.every(locale =>
    names[locale] === null ||
    (typeof names[locale] === 'string' && (names[locale] as string).length > 0)))
    return false;
  if (raw.tags.some((v:unknown) => !isObject(v) || !ID(v.id) ||
    typeof v.key !== 'string' || typeof v.facet !== 'string' ||
    !Number.isInteger(v.sourceField))) return false;
  const links=(rows:unknown)=>Array.isArray(rows)&&rows.every((v:unknown)=>
    isObject(v)&&ID(v.setId)&&Number.isInteger(v.groupIndex)&&typeof v.evidence==='string');
  if(!links(raw.collectionSourceCandidates))return false;
  if(!complete)return true;
  if(raw.sourceAttributes!==undefined&&(!isObject(raw.sourceAttributes)||
    !validSourceValue(raw.sourceAttributes)))return false;
  const validIds=(v:unknown)=>Array.isArray(v)&&v.every(ID)&&new Set(v).size===v.length;
  if(!isObject(artwork)||!Object.values(artwork).every(v=>typeof v==='string'&&GUID.test(v))||
    !validIds(raw.universeTagIds)||!validIds(raw.universeDirectTagIds)||
    !validIds(raw.universeSetTagIds)||!validIds(raw.universePredicateTagIds)||
    !validIds(raw.worldTagIds)||!validIds(raw.craftingRecipeItemIds)||
    !links(raw.collectionPositiveSourceLinks)||!links(raw.collectionExclusions)||
    !['source_candidate','item_definition','other_definition'].includes(String(raw.definitionScope))||
    !['source_linked','unresolved_source','no_universe_in_verified_tag_fields'].includes(String(raw.universeSourceStatus))||
    !(raw.sourceSetItemId===null||ID(raw.sourceSetItemId))||
    !(raw.sourceClass===null||typeof raw.sourceClass==='string')||
    !Array.isArray(raw.sourceFrame)||raw.sourceFrame.length!==2||
    !raw.sourceFrame.every(Number.isSafeInteger)||raw.sourceFrame[0]<0||raw.sourceFrame[1]<=0||
    !Array.isArray(raw.observedFields)||!raw.observedFields.every(v=>Array.isArray(v)&&v.length===3&&
      v.every(Number.isSafeInteger)&&v[0]>0&&v[2]>0&&[0,1,2,5].includes(v[1]))||
    !isObject(raw.nativeProperties)||!Object.values(raw.nativeProperties).every(v=>
      typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)))return false;
  return true;
}
async function checkedJson(url:string, meta?:Readonly<{bytes?:number;sha256?:string}>,
  fetcher:typeof fetch = fetch): Promise<unknown> {
  const response = await fetcher(url, {credentials:'same-origin',redirect:'error'});
  assert(response.ok && !response.redirected, 'ASSET_UNAVAILABLE');
  const bytes = await response.arrayBuffer();
  if (meta?.bytes !== undefined)
    assert(bytes.byteLength === meta.bytes, 'BYTE_LENGTH_MISMATCH');
  if (meta?.sha256 !== undefined) {
    assert(SHA.test(meta.sha256) && !!globalThis.crypto?.subtle,
      'SHA_UNAVAILABLE');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const actual = [...new Uint8Array(digest)]
      .map(n => n.toString(16).padStart(2,'0')).join('');
    assert(actual === meta.sha256, 'SHA_MISMATCH');
  }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
/**
 * Normal product entry point: one current canonical database, all native IDs.
 * Game version is provenance selected internally, not a consumer argument.
 * Explicit version/scope reads below are retained only for compatibility.
 */
export function openCurrentItemDatabase(
  basePath:string='',fetcher:typeof fetch=fetch
):Promise<PublicCompleteItemMaster>{
  return openPublicItemMaster(basePath,fetcher,{scope:'complete',gameVersion:'current',contentAddressed:true});
}

export function openPublicItemMaster(
  basePath: string|undefined, fetcher: typeof fetch|undefined,
  options: CompleteItemMasterOpenOptions
): Promise<PublicCompleteItemMaster>;
export function openPublicItemMaster(
  basePath?:string, fetcher?:typeof fetch, options?:ItemMasterOpenOptions
): Promise<PublicItemMaster>;
export async function openPublicItemMaster(
  basePath: string = '',
  fetcher: typeof fetch = fetch,
  options: ItemMasterOpenOptions|CompleteItemMasterOpenOptions = {},
):Promise<PublicItemMaster<ItemMasterRecord|CompleteItemMasterRecord>> {
  assert(typeof basePath === 'string' &&
    /^\/?(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(basePath),
    'INVALID_BASE_PATH');
  const base = basePath ? '/' + basePath.replace(/^\/+|\/+$/g,'') : '';
  const scope=options.scope??'base';
  assert(scope==='base'||scope==='expanded'||scope==='complete','INVALID_SCOPE');
  let gameVersion = options.gameVersion ?? ITEM_MASTER_DEFAULT_GAME_VERSION;
  let selected: Readonly<ItemMasterVersions['releases'][number]> | undefined;
  assert(typeof gameVersion === 'string', 'INVALID_GAME_VERSION');
  if (gameVersion === 'current') {
    const raw = await checkedJson(base+'/'+ITEM_MASTER_VERSIONS_PATH,undefined,fetcher);
    assert(isObject(raw) && raw.schema === 'wand.item-master.versions@1' &&
      typeof raw.current === 'string' && GAME_VERSION.test(raw.current) &&
      Array.isArray(raw.releases) && raw.releases.length>0,
      'INVALID_VERSIONS');
    const unique = new Set<string>();
    for (const entry of raw.releases) {
      assert(isObject(entry) && typeof entry.gameVersion === 'string' &&
        GAME_VERSION.test(entry.gameVersion) && !unique.has(entry.gameVersion) &&
        typeof entry.release === 'string' &&
        RELEASE_VERSION.test(entry.release) &&
        entry.release.startsWith('steam-'+entry.gameVersion+'-') &&
        typeof entry.count === 'number' &&
        Number.isSafeInteger(entry.count) && entry.count>0 &&
        entry.count<=MAX_DEFINITIONS &&
        typeof entry.archiveSha256 === 'string' &&
        SHA.test(entry.archiveSha256), 'INVALID_VERSIONS');
      if(entry.expanded!==undefined){
        const expanded=entry.expanded;
        assert(isObject(expanded)&&typeof expanded.release==='string'&&
          RELEASE_VERSION.test(expanded.release)&&
          expanded.release.startsWith('steam-'+entry.gameVersion+'-')&&
          expanded.release!==entry.release&&typeof expanded.count==='number'&&
          Number.isSafeInteger(expanded.count)&&expanded.count>entry.count&&
          expanded.count<=MAX_DEFINITIONS&&typeof expanded.extensionSha256==='string'&&
          SHA.test(expanded.extensionSha256),'INVALID_EXPANDED_RELEASE');
      }
      if(entry.complete!==undefined){
        const c=entry.complete;
        assert(isObject(c)&&typeof c.release==='string'&&
          RELEASE_VERSION.test(c.release)&&c.release.startsWith('steam-'+entry.gameVersion+'-')&&
          c.release!==entry.release&&typeof c.count==='number'&&
          Number.isSafeInteger(c.count)&&c.count>=entry.count&&c.count<=MAX_DEFINITIONS&&
          typeof c.archiveSha256==='string'&&SHA.test(c.archiveSha256)&&
          typeof c.parts==='number'&&Number.isSafeInteger(c.parts)&&c.parts>0&&c.parts<=100,
          'INVALID_COMPLETE_RELEASE');
        assert(c.acquisitionProjection===undefined||isObject(c.acquisitionProjection)&&
          Object.keys(c.acquisitionProjection).length===2&&
          typeof c.acquisitionProjection.summarySha256==='string'&&SHA.test(c.acquisitionProjection.summarySha256)&&
          typeof c.acquisitionProjection.relationsSha256==='string'&&SHA.test(c.acquisitionProjection.relationsSha256),
          'INVALID_ACQUISITION_PINS');
        assert(c.introductionHistorySha256===undefined||typeof c.introductionHistorySha256==='string'&&SHA.test(c.introductionHistorySha256),'INVALID_INTRODUCTION_HISTORY_DIGEST');
        assert(c.attributesSha256===undefined||
          typeof c.attributesSha256==='string'&&SHA.test(c.attributesSha256),'INVALID_ATTRIBUTE_DIGEST');
        assert(c.nativeSupplementSha256===undefined||
          typeof c.nativeSupplementSha256==='string'&&SHA.test(c.nativeSupplementSha256),'INVALID_NATIVE_SUPPLEMENT_DIGEST');
        assert(c.referenceAttributesSha256===undefined||
          typeof c.referenceAttributesSha256==='string'&&SHA.test(c.referenceAttributesSha256),'INVALID_REFERENCE_ATTRIBUTE_DIGEST');
        assert(c.reviewedRootArraysSha256===undefined||
          typeof c.reviewedRootArraysSha256==='string'&&SHA.test(c.reviewedRootArraysSha256),'INVALID_ROOT_ARRAY_DIGEST');
        assert(c.reviewedMessagesSha256===undefined||
          typeof c.reviewedMessagesSha256==='string'&&SHA.test(c.reviewedMessagesSha256),'INVALID_MESSAGE_DIGEST');
        assert(c.reviewedMessageGroupsSha256===undefined||
          typeof c.reviewedMessageGroupsSha256==='string'&&SHA.test(c.reviewedMessageGroupsSha256),'INVALID_MESSAGE_GROUP_DIGEST');
        assert(c.reviewedStructure===undefined||isObject(c.reviewedStructure)&&Object.keys(c.reviewedStructure).length===2&&
          ['reviewed-structure','reviewed-quest-steps'].every(k=>typeof (c.reviewedStructure as Record<string,unknown>)[k]==='string'&&SHA.test(String((c.reviewedStructure as Record<string,unknown>)[k]))),'INVALID_STRUCTURE_DIGESTS');
        assert(c.reviewedRootScalars===undefined||Array.isArray(c.reviewedRootScalars)&&c.reviewedRootScalars.length>0&&c.reviewedRootScalars.length<=100&&c.reviewedRootScalars.every(x=>typeof x==='string'&&SHA.test(x)),'INVALID_ROOT_SCALAR_DIGESTS');
        assert(c.linkedLocalizations===undefined||isObject(c.linkedLocalizations)&&Object.keys(c.linkedLocalizations).length===ITEM_MASTER_LOCALES.length&&
          ITEM_MASTER_LOCALES.every(l=>typeof (c.linkedLocalizations as Record<string,unknown>)[l]==='string'&&SHA.test(String((c.linkedLocalizations as Record<string,unknown>)[l]))),'INVALID_LINKED_LOCALIZATION_DIGESTS');
        if(c.localization!==undefined){
          const l=c.localization;
          assert(isObject(l)&&typeof l.parts==='number'&&Number.isSafeInteger(l.parts)&&l.parts>0&&l.parts<=100&&
            typeof l.sha256==='string'&&SHA.test(l.sha256),'INVALID_LOCALIZATION_METADATA');
        }
      }
      unique.add(entry.gameVersion);
    }
    gameVersion = raw.current;
    selected = (raw.releases as ItemMasterVersions['releases'])
      .find(entry => entry.gameVersion === gameVersion);
    assert(selected, 'CURRENT_RELEASE_MISSING');
  }
  assert(GAME_VERSION.test(gameVersion), 'INVALID_GAME_VERSION');
  if(scope==='expanded'&&selected)assert(selected.expanded,'EXPANDED_RELEASE_NOT_PUBLISHED');
  if(scope==='complete'&&selected)assert(selected.complete,'COMPLETE_RELEASE_NOT_PUBLISHED');
  const selectedView=scope==='complete'?selected?.complete:scope==='expanded'?selected?.expanded:selected;
  const contentAddressed='contentAddressed' in options&&options.contentAddressed===true;
  assert(!contentAddressed||scope==='complete'&&options.gameVersion==='current','INVALID_CURRENT_STORAGE');
  const root = base + '/ddv/item-master/' + (contentAddressed?'current':'steam-'+gameVersion+
    (scope==='base'?'':'-'+scope));
  const release = await checkedJson(root+'/index.json',undefined,fetcher);
  assert(!contentAddressed||isObject(release)&&release.storage==='content-addressed-current@1','INVALID_CURRENT_STORAGE');
  const objectUrl=(path:string,pin:Readonly<{sha256:string}>)=>contentAddressed
    ?base+'/ddv/item-master/objects/'+pin.sha256+'.json':root+'/'+path;
  assert(isObject(release) &&
    release.schema === 'wand.item-master.release@1' &&
    typeof release.version === 'string' &&
    RELEASE_VERSION.test(release.version) &&
    release.version.startsWith('steam-'+gameVersion+'-') &&
    typeof release.count === 'number' &&
    Number.isSafeInteger(release.count) &&
    release.count>0 && release.count<=MAX_DEFINITIONS &&
    release.bucketCount === 256 &&
    isObject(release.target) &&
    release.target.platform === 'Steam' &&
    release.target.gameVersion === gameVersion &&
    isObject(release.shards) &&
    (!selectedView || (release.version === selectedView.release &&
      release.count === selectedView.count)), 'INVALID_RELEASE');
  if(scope==='expanded'){
    assert(release.scope==='expanded'&&typeof release.baseRelease==='string'&&
      RELEASE_VERSION.test(release.baseRelease)&&
      release.baseRelease.startsWith('steam-'+gameVersion+'-')&&
      release.baseRelease!==release.version&&typeof release.baseCount==='number'&&
      Number.isSafeInteger(release.baseCount)&&release.baseCount>0&&
      typeof release.extensionCount==='number'&&Number.isSafeInteger(release.extensionCount)&&
      release.extensionCount>0&&release.baseCount+release.extensionCount===release.count&&
      typeof release.extensionSha256==='string'&&SHA.test(release.extensionSha256)&&
      (!selected||(release.baseRelease===selected.release&&release.baseCount===selected.count&&
        release.extensionSha256===selected.expanded?.extensionSha256)),
      'INVALID_EXPANDED_RELEASE');
  }else if(scope==='complete'){
    assert(release.scope==='complete'&&typeof release.archiveSha256==='string'&&
      SHA.test(release.archiveSha256)&&(!selected||release.archiveSha256===selected.complete?.archiveSha256)&&
      isObject(release.assets)&&isObject(release.sourceFilesSha256)&&
      typeof release.sourceFilesVerified==='number'&&Number.isSafeInteger(release.sourceFilesVerified)&&
      release.sourceFilesVerified===Object.keys(release.sourceFilesSha256).length&&
      Object.values(release.sourceFilesSha256).every(v=>typeof v==='string'&&SHA.test(v)),
      'INVALID_COMPLETE_RELEASE');
    const ap=release.acquisitionProjection;
    const pins=selected?.complete?.acquisitionProjection;
    assert((!selected||Boolean(ap)===Boolean(pins))&&
      (ap===undefined||isObject(ap)&&ap.sourceGameVersion===gameVersion&&
        typeof ap.summarySha256==='string'&&SHA.test(ap.summarySha256)&&
        typeof ap.relationsSha256==='string'&&SHA.test(ap.relationsSha256)&&
        (!pins||ap.summarySha256===pins.summarySha256&&ap.relationsSha256===pins.relationsSha256)&&
        [ap.summaryCount,ap.relationCount,ap.sourceOnlySummaryCount,ap.sourceOnlyRelationCount,ap.sourceLinks].every(
          v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)&&
        typeof ap.summaryCount==='number'&&ap.summaryCount<=release.count&&
        typeof ap.relationCount==='number'&&ap.relationCount<=release.count&&
        ap.currentAvailabilityVerified===false&&ap.coverageComplete===false),
      'INVALID_ACQUISITION_PROJECTION');
    assert((!selected||release.introductionHistorySha256===selected.complete?.introductionHistorySha256)&&
      (release.introductionHistorySha256===undefined||typeof release.introductionHistorySha256==='string'&&SHA.test(release.introductionHistorySha256)), 'INVALID_INTRODUCTION_HISTORY_RELEASE');
    assert((!selected||release.attributesSha256===selected.complete?.attributesSha256)&&
      (release.attributesSha256===undefined||typeof release.attributesSha256==='string'&&
        SHA.test(release.attributesSha256)&&isObject(release.sourceAttributeCoverage)&&
        release.sourceAttributeCoverage.allOriginalFieldSemanticsVerified===false&&
        release.sourceAttributeCoverage.gridLayerOccupancyVerified===false&&
        release.sourceAttributeCoverage.runtimePriceVerified===false),'INVALID_ATTRIBUTE_RELEASE');
    assert((!selected||release.nativeSupplementSha256===selected.complete?.nativeSupplementSha256)&&
      (release.nativeSupplementSha256===undefined||typeof release.nativeSupplementSha256==='string'&&
        SHA.test(release.nativeSupplementSha256)&&isObject(release.nativeSupplementCoverage)&&
        typeof release.nativeSupplementCoverage.strideOverrideCount==='number'&&
        Number.isSafeInteger(release.nativeSupplementCoverage.strideOverrideCount)&&
        release.nativeSupplementCoverage.strideOverrideCount>=0&&release.nativeSupplementCoverage.strideOverrideCount<=release.count&&
        release.nativeSupplementCoverage.runtimeSemanticsVerified===false),'INVALID_NATIVE_SUPPLEMENT_RELEASE');
    assert((!selected||release.referenceAttributesSha256===selected.complete?.referenceAttributesSha256)&&
      (release.referenceAttributesSha256===undefined||typeof release.referenceAttributesSha256==='string'&&
        SHA.test(release.referenceAttributesSha256)&&isObject(release.referenceAttributeCoverage)&&
        isObject(release.referenceAttributeCoverage.fields)&&
        Object.values(release.referenceAttributeCoverage.fields).every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=Number(release.count))&&
        release.referenceAttributeCoverage.runtimeSemanticsVerified===false),'INVALID_REFERENCE_ATTRIBUTE_RELEASE');
    assert((!selected||release.reviewedRootArraysSha256===selected.complete?.reviewedRootArraysSha256)&&
      (release.reviewedRootArraysSha256===undefined||typeof release.reviewedRootArraysSha256==='string'&&
        SHA.test(release.reviewedRootArraysSha256)&&isObject(release.reviewedRootArrayCoverage)&&
        isObject(release.reviewedRootArrayCoverage.fields)&&
        Object.values(release.reviewedRootArrayCoverage.fields).every(f=>isObject(f)&&
          typeof f.itemCount==='number'&&Number.isSafeInteger(f.itemCount)&&f.itemCount>0&&f.itemCount<=Number(release.count)&&
          typeof f.valueCount==='number'&&Number.isSafeInteger(f.valueCount)&&f.valueCount>=f.itemCount&&
          typeof f.category==='string'&&typeof f.elementType==='string')&&
        release.reviewedRootArrayCoverage.runtimeSemanticsVerified===false),'INVALID_ROOT_ARRAY_RELEASE');
    assert((!selected||release.reviewedMessagesSha256===selected.complete?.reviewedMessagesSha256)&&
      (release.reviewedMessagesSha256===undefined||typeof release.reviewedMessagesSha256==='string'&&
        SHA.test(release.reviewedMessagesSha256)&&isObject(release.reviewedMessageCoverage)&&
        isObject(release.reviewedMessageCoverage.fields)&&
        Object.values(release.reviewedMessageCoverage.fields).every(f=>isObject(f)&&
          typeof f.itemCount==='number'&&Number.isSafeInteger(f.itemCount)&&f.itemCount>0&&f.itemCount<=Number(release.count)&&
          typeof f.occurrences==='number'&&Number.isSafeInteger(f.occurrences)&&f.occurrences>=f.itemCount&&
          typeof f.leafCount==='number'&&Number.isSafeInteger(f.leafCount)&&f.leafCount>=0&&
          typeof f.category==='string'&&typeof f.declaredType==='string')&&
        release.reviewedMessageCoverage.runtimeSemanticsVerified===false),'INVALID_MESSAGE_RELEASE');
    assert((!selected||release.reviewedMessageGroupsSha256===selected.complete?.reviewedMessageGroupsSha256)&&
      (release.reviewedMessageGroupsSha256===undefined||typeof release.reviewedMessageGroupsSha256==='string'&&
        SHA.test(release.reviewedMessageGroupsSha256)&&isObject(release.reviewedMessageGroupCoverage)&&
        isObject(release.reviewedMessageGroupCoverage.fields)&&
        Object.values(release.reviewedMessageGroupCoverage.fields).every(f=>isObject(f)&&
          typeof f.itemCount==='number'&&Number.isSafeInteger(f.itemCount)&&f.itemCount>0&&f.itemCount<=Number(release.count)&&
          typeof f.occurrences==='number'&&Number.isSafeInteger(f.occurrences)&&f.occurrences>=f.itemCount&&
          typeof f.leafCount==='number'&&Number.isSafeInteger(f.leafCount)&&f.leafCount>=0&&
          typeof f.category==='string'&&typeof f.declaredType==='string')&&
        release.reviewedMessageGroupCoverage.runtimeSemanticsVerified===false),'INVALID_MESSAGE_GROUP_RELEASE');
    assert((!selected||JSON.stringify(release.reviewedStructure)===JSON.stringify(selected.complete?.reviewedStructure))&&
      (release.reviewedStructure===undefined||isObject(release.reviewedStructure)&&Object.keys(release.reviewedStructure).length===2&&
        ['reviewed-structure','reviewed-quest-steps'].every(k=>typeof (release.reviewedStructure as Record<string,unknown>)[k]==='string'&&SHA.test(String((release.reviewedStructure as Record<string,unknown>)[k])))&&
        isObject(release.reviewedStructureCoverage)&&isObject(release.reviewedStructureCoverage.fields)&&
        Object.values(release.reviewedStructureCoverage.fields).every(f=>isObject(f)&&
          typeof f.itemCount==='number'&&Number.isSafeInteger(f.itemCount)&&f.itemCount>0&&f.itemCount<=Number(release.count)&&
          typeof f.occurrences==='number'&&Number.isSafeInteger(f.occurrences)&&f.occurrences>=f.itemCount&&
          typeof f.leafCount==='number'&&Number.isSafeInteger(f.leafCount)&&f.leafCount>=0&&
          typeof f.category==='string'&&typeof f.declaredType==='string')&&
        release.reviewedStructureCoverage.runtimeSemanticsVerified===false),'INVALID_STRUCTURE_RELEASE');
    assert((!selected||JSON.stringify(release.reviewedRootScalars)===JSON.stringify(selected.complete?.reviewedRootScalars))&&
      (release.reviewedRootScalars===undefined||Array.isArray(release.reviewedRootScalars)&&release.reviewedRootScalars.length>0&&release.reviewedRootScalars.length<=100&&
        release.reviewedRootScalars.every(x=>typeof x==='string'&&SHA.test(x))&&isObject(release.reviewedRootScalarCoverage)&&
        ['groupCount','itemCount','fieldPairs','occurrences','leafCount','existingPairs','addedPairs','identityOccurrences'].every(k=>{
          const v=(release.reviewedRootScalarCoverage as Record<string,unknown>)[k];return typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
        })&&Number(release.reviewedRootScalarCoverage.existingPairs)+Number(release.reviewedRootScalarCoverage.addedPairs)===release.reviewedRootScalarCoverage.fieldPairs&&
        release.reviewedRootScalarCoverage.identityOccurrences===Number(release.count)*2&&release.reviewedRootScalarCoverage.runtimeSemanticsVerified===false),'INVALID_ROOT_SCALAR_RELEASE');
    assert((!selected||JSON.stringify(release.linkedLocalizations)===JSON.stringify(selected.complete?.linkedLocalizations))&&
      (release.linkedLocalizations===undefined||isObject(release.linkedLocalizations)&&
        Object.keys(release.linkedLocalizations).length===ITEM_MASTER_LOCALES.length&&
        ITEM_MASTER_LOCALES.every(l=>typeof (release.linkedLocalizations as Record<string,unknown>)[l]==='string'&&SHA.test(String((release.linkedLocalizations as Record<string,unknown>)[l])))&&
        isObject(release.linkedLocalizationCoverage)&&ID(release.linkedLocalizationCoverage.keyCount)&&
        release.linkedLocalizationCoverage.allLocalesKeyCount===release.linkedLocalizationCoverage.keyCount&&release.linkedLocalizationCoverage.bucketCount===64&&
        isObject(release.linkedLocalizationCoverage.localeCounts)&&isObject(release.linkedLocalizationCoverage.sourceArchiveHashes)&&
        ITEM_MASTER_LOCALES.every(l=>{
          const c=release.linkedLocalizationCoverage as Record<string,unknown>;
          return (c.localeCounts as Record<string,unknown>)[l]===c.keyCount&&
            typeof (c.sourceArchiveHashes as Record<string,unknown>)[l]==='string'&&SHA.test(String((c.sourceArchiveHashes as Record<string,unknown>)[l]));
        })),'INVALID_LINKED_LOCALIZATION_RELEASE');
    assert((!selected||release.localizationSha256===selected.complete?.localization?.sha256)&&
      (release.localizationSha256===undefined||
        typeof release.localizationSha256==='string'&&SHA.test(release.localizationSha256)&&
        isObject(release.localizationCoverage)&&isObject(release.localizationCoverage.localeCounts)),
      'INVALID_LOCALIZATION_RELEASE');
  }else assert(release.scope===undefined,'UNEXPECTED_EXPANDED_RELEASE');
  const source = release as unknown as ItemMasterRelease;
  // The caller may share this reader with Collection, Explorer and Save.
  // Snapshot all mutable release metadata before any lazy asynchronous read.
  const m:ItemMasterRelease = deepFreeze({
    ...source,
    target:Object.freeze({...source.target}),
    coverage:Object.freeze({...source.coverage}),
    shards:Object.freeze(Object.fromEntries(
      Object.entries(source.shards).map(([path,entry])=>[
        path, typeof entry === 'number' ? entry : Object.freeze({...entry}),
      ])
    )),
  });
  const expected = Array.from({length:256},(_,i) =>
    'id/'+i.toString(16).padStart(2,'0')+'.json');
  assert(Object.keys(m.shards).length === 256 &&
    expected.every(p => p in m.shards), 'INCOMPLETE_RELEASE');
  const meta = (path:string): Readonly<{count:number;bytes:number;sha256:string}> => {
    const raw = m.shards[path];
    assert(isObject(raw) && Number.isSafeInteger(raw.count) && raw.count>=0 &&
      typeof raw.bytes === 'number' &&
      Number.isSafeInteger(raw.bytes) && raw.bytes>0 &&
      raw.bytes<=MAX_SHARD_BYTES &&
      typeof raw.sha256 === 'string' && SHA.test(raw.sha256),
      'INVALID_SHARD_METADATA');
    return raw as unknown as {count:number;bytes:number;sha256:string};
  };
  assert(expected.every(p => !!meta(p)) &&
    expected.reduce((n,p)=>n+meta(p).count,0) === m.count,
    'RELEASE_COUNT_MISMATCH');

  const cache = new Map<string,Promise<ReadonlyMap<number,ItemMasterRecord|CompleteItemMasterRecord>>>();
  async function bucket(path:string):Promise<ReadonlyMap<number,ItemMasterRecord|CompleteItemMasterRecord>> {
    const previous = cache.get(path);
    if (previous) return previous;
    const task = (async()=>{
      const raw = await checkedJson(objectUrl(path,meta(path)),meta(path),fetcher);
      assert(isObject(raw) && raw.schema === 'wand.item-master.shard@1' &&
        raw.bucket === path.slice(3,5) && Array.isArray(raw.items) &&
        raw.items.length === meta(path).count,'INVALID_SHARD');
      const result = new Map<number,ItemMasterRecord|CompleteItemMasterRecord>();
      for (const value of raw.items) {
        assert(validRecord(value,path,scope==='complete') && !result.has(value.itemId),
          'INVALID_ITEM_ROW');
        result.set(value.itemId,freezeItemRecord(value));
      }
      return result;
    })();
    cache.set(path,task);
    try{return await task;}catch(e){cache.delete(path);throw e;}
  }
  const assetCache=new Map<string,Promise<unknown>>();
  async function asset(path:string):Promise<unknown>{
    assert(scope==='complete','COMPLETE_SCOPE_REQUIRED');
    const previous=assetCache.get(path);
    if(previous)return previous;
    const meta=m.assets?.[path];
    assert(meta&&Number.isSafeInteger(meta.bytes)&&meta.bytes>0&&meta.bytes<=MAX_SHARD_BYTES&&
      SHA.test(meta.sha256)&&Number.isSafeInteger(meta.count)&&meta.count>=0,'INVALID_ASSET_METADATA');
    const task=checkedJson(objectUrl(path,meta),meta,fetcher).then(value=>{
      assert(isObject(value)&&value.release===(contentAddressed?'wand.item-master.current':m.version),'ASSET_RELEASE_MISMATCH');
      return deepFreeze(contentAddressed?{...value,release:m.version}:value);
    });
    assetCache.set(path,task);
    try{return await task;}catch(e){assetCache.delete(path);throw e;}
  }
  const common = {
    release:m,
    async getItem(id:number){
      assert(ID(id),'INVALID_ITEM_ID');
      return (await bucket(pathFor(id))).get(id) ?? null;
    },
    async getItems(ids:readonly number[]){
      assert(Array.isArray(ids) && ids.length <= 10000 &&
        ids.every(ID),'INVALID_ITEM_BATCH');
      const groups = [...new Set(ids.map(pathFor))];
      const found = new Map<number,ItemMasterRecord|CompleteItemMasterRecord>();
      let next = 0;
      // Bound I/O to eight shards, even when 10,000 IDs span all 256 buckets.
      async function worker(): Promise<void> {
        while (next < groups.length) {
          const path = groups[next++];
          const records = await bucket(path);
          for (const [id,item] of records) found.set(id,item);
        }
      }
      await Promise.all(Array.from(
        {length:Math.min(8,groups.length)},()=>worker()
      ));
      return ids.map(id => found.get(id) ?? null);
    }
  };
  if(scope!=='complete')return Object.freeze(common);
  const localeCache=new Map<ItemMasterLocale,Promise<ReadonlyMap<string,string>>>();
  async function localizedTable(locale:ItemMasterLocale):Promise<ReadonlyMap<string,string>>{
    const cached=localeCache.get(locale);
    if(cached)return cached;
    const path='text/'+locale+'.json';
    const task=(async()=>{
      const v=await asset(path);
      assert(isObject(v)&&v.schema==='wand.item-master.localized-text@1'&&v.locale===locale&&
        Array.isArray(v.items)&&v.items.length===m.assets?.[path]?.count&&
        v.items.length===m.localizationCoverage?.localeCounts[locale],'INVALID_LOCALIZED_TEXT');
      const table=new Map<string,string>();
      for(const pair of v.items){
        assert(Array.isArray(pair)&&pair.length===2&&typeof pair[0]==='string'&&pair[0].length>0&&
          typeof pair[1]==='string'&&pair[1].trim().length>0&&pair[1].length<=8192&&
          !table.has(pair[0]),'INVALID_LOCALIZED_TEXT_ROW');
        table.set(pair[0],pair[1]);
      }
      return table as ReadonlyMap<string,string>;
    })();
    localeCache.set(locale,task);
    try{return await task;}catch(err){localeCache.delete(locale);throw err;}
  }
  const linkedCache=new Map<string,Promise<ReadonlyMap<string,string>>>();
  function linkedBucket(key:string):string{
    const ns=key.split('.',1)[0];let h=2166136261;
    for(let i=0;i<ns.length;i++)h=Math.imul(h^ns.charCodeAt(i),16777619);
    return (h&63).toString(16).padStart(2,'0');
  }
  async function linkedTable(locale:ItemMasterLocale,bucket:string):Promise<ReadonlyMap<string,string>>{
    const path='linked-text/'+locale+'/'+bucket+'.json';
    const previous=linkedCache.get(path);if(previous)return previous;
    const task=(async()=>{
      const v=await asset(path);
      assert(isObject(v)&&v.schema==='wand.item-master.linked-text-block@1'&&v.locale===locale&&v.bucket===bucket&&
        Array.isArray(v.items)&&v.items.length===m.assets?.[path]?.count,'INVALID_LINKED_TEXT_BLOCK');
      const table=new Map<string,string>();
      for(const pair of v.items){
        assert(Array.isArray(pair)&&pair.length===2&&typeof pair[0]==='string'&&pair[0].length>0&&pair[0].length<=1024&&
          linkedBucket(pair[0])===bucket&&typeof pair[1]==='string'&&pair[1].trim().length>0&&pair[1].length<=8192&&!table.has(pair[0]),'INVALID_LINKED_TEXT_ROW');
        table.set(pair[0],pair[1]);
      }
      return table as ReadonlyMap<string,string>;
    })();
    linkedCache.set(path,task);
    try{return await task;}catch(err){linkedCache.delete(path);throw err;}
  }
  async function getLocalizedKeys(keys:readonly string[],locale:ItemMasterLocale):Promise<readonly (string|null)[]>{
    assert(ITEM_MASTER_LOCALES.includes(locale),'INVALID_LOCALE');
    assert(Array.isArray(keys)&&keys.length<=10000&&keys.every(k=>typeof k==='string'&&k.length>0&&k.length<=1024),'INVALID_LOCALIZATION_KEYS');
    if(!keys.length)return Object.freeze([]);
    if(!m.linkedLocalizationCoverage){
      const table=m.localizationCoverage?await localizedTable(locale):null;
      return Object.freeze(keys.map(k=>table?.get(k)??null));
    }
    const groups=[...new Set(keys.map(linkedBucket))],tables=new Map<string,ReadonlyMap<string,string>>();
    for(let i=0;i<groups.length;i+=8)await Promise.all(groups.slice(i,i+8).map(async b=>{tables.set(b,await linkedTable(locale,b));}));
    return Object.freeze(keys.map(k=>tables.get(linkedBucket(k))?.get(k)??null));
  }
  const fieldReader=createItemFieldReader(m.count,m.assets,asset);
  async function localizedItems(ids:readonly number[],locale:ItemMasterLocale):Promise<readonly (ItemLocalizedTextRecord|null)[]>{
    assert(ITEM_MASTER_LOCALES.includes(locale),'INVALID_LOCALE');
    // Resolve only original text keys and category, not unrelated definitions.
    let keys: readonly (readonly (readonly [ItemLocalizedTextField,string])[]|null)[];
    if(m.assets?.['fields/index.json']){
      const fields=new Set((await fieldReader.getFieldCatalog()).map(x=>x.field));
      const selected=ITEM_LOCALIZED_TEXT_FIELDS.filter(field=>fields.has('source.'+field));
      const records=await fieldReader.getItemFields(ids,['nativeCategory',...selected.map(field=>'source.'+field)]);
      keys=records.map(record=>record===null?null:
        record.values.nativeCategory==='Dialogue'?[]:selected.flatMap(field=>{
          const key=record.values['source.'+field];
          return typeof key==='string'?[[field,key] as const]:[];
        }));
    }else{
      const records=await common.getItems(ids) as (CompleteItemMasterRecord|null)[];
      keys=records.map(record=>record===null?null:
        record.nativeCategory==='Dialogue'?[]:ITEM_LOCALIZED_TEXT_FIELDS.flatMap(field=>{
          const key=record.sourceAttributes?.[field];
          return typeof key==='string'?[[field,key] as const]:[];
        }));
    }
    // Resolve unique original keys via the same sparse API used by nested fields.
    const requested=[...new Set(keys.flatMap(row=>row?.map(([,key])=>key)??[]))];
    const found=new Map<string,string|null>();
    for(let i=0;i<requested.length;i+=10000){
      const batch=requested.slice(i,i+10000),values=await getLocalizedKeys(batch,locale);
      batch.forEach((k,j)=>found.set(k,values[j]));
    }
    return Object.freeze(keys.map(row=>row===null?null:deepFreeze(Object.fromEntries(
      row.map(([field,key])=>[field,{key,text:found.get(key)??null}])
    ))));
  }
  async function itemReferences(ids:readonly number[],direction:ItemReferenceDirection):Promise<readonly (readonly ItemReferenceOccurrence[]|null)[]>{
    assert(direction==='incoming'||direction==='outgoing','INVALID_REFERENCE_DIRECTION');
    const field='references.'+direction;
    const results=await fieldReader.getItemFields(ids,[field]);
    return Object.freeze(results.map(result=>{
      if(result===null)return null;
      const value=result.values[field]??[];
      assert(Array.isArray(value)&&value.every(v=>Array.isArray(v)&&v.length===2&&ID(v[0])&&
        typeof v[1]==='string'&&v[1].length>0),'INVALID_REFERENCE_OCCURRENCE');
      return deepFreeze(value as unknown as readonly ItemReferenceOccurrence[]);
    }));
  }
  return Object.freeze({
    ...common,
    ...fieldReader,
    async getItemReferences(id:number,direction:ItemReferenceDirection){
      return (await itemReferences([id],direction))[0];
    },
    getItemsReferences:itemReferences,
    async getNativeAcquisitionCandidates(ids:readonly number[]){
      const field='acquisition.nativeCandidates';
      const rows=await fieldReader.getItemFields(ids,[field]);
      return Object.freeze(rows.map(row=>{
        if(row===null)return null;
        const value=row.values[field]??[];
        assert(Array.isArray(value)&&value.every(v=>Array.isArray(v)&&v.length===3&&ID(v[0])&&
          NATIVE_ACQUISITION_ROLES.includes(v[1] as NativeAcquisitionRole)&&
          typeof v[2]==='string'&&v[2].startsWith('source.')),'INVALID_NATIVE_ACQUISITION_CANDIDATE');
        return deepFreeze(value as unknown as readonly NativeAcquisitionCandidate[]);
      }));
    },
    async getCollectionFacets():Promise<CompleteItemMasterFacets>{
      const value=await asset('collection-facets.json');
      assert(isObject(value)&&value.schema==='wand.collection.db01-complete-source-facets@1'&&
        value.sourceItemCount===m.count&&Array.isArray(value.nativeSubtypeItems)&&
        value.nativeSubtypeItems.length===m.count&&value.gameRuntimeMembershipVerified===false,
        'INVALID_COMPLETE_FACETS');
      return value as unknown as CompleteItemMasterFacets;
    },
    async getBrowseNames(locale:ItemMasterLocale):Promise<readonly (readonly [number,string])[]>{
      assert(ITEM_MASTER_LOCALES.includes(locale),'INVALID_LOCALE');
      const path='locale/'+locale+'.json',value=await asset(path);
      assert(isObject(value)&&value.schema==='wand.item-master.complete-browse-names@1'&&
        value.locale===locale&&Array.isArray(value.items)&&value.items.length===m.assets?.[path]?.count&&
        value.items.every(r=>Array.isArray(r)&&r.length===2&&ID(r[0])&&typeof r[1]==='string'),
        'INVALID_BROWSE_NAMES');
      return value.items as (readonly [number,string])[];
    },
    async getLocalizedItemText(id:number,locale:ItemMasterLocale):Promise<ItemLocalizedTextRecord|null>{
      return (await localizedItems([id],locale))[0]??null;
    },
    getLocalizedItemsText:localizedItems,
    getLocalizedKeys,
    async getSourceRelations():Promise<CompleteItemMasterRelations>{
      const value=await asset('source-relations.json');
      assert(isObject(value)&&value.schema==='wand.item-master.complete-source-relations@1'&&
        Array.isArray(value.collectionSelectors)&&value.collectionSelectors.length===m.coverage.sourceSelectorCount&&
        value.gameRuntimeMembershipVerified===false,'INVALID_SOURCE_RELATIONS');
      return value as unknown as CompleteItemMasterRelations;
    }
  });
}
