/**
 * DB-02 public-only, source-pinned Item ID origin lookup for Wand services.
 *
 * Unlike the full SRC-02 archive view, this consumer works on GitHub Pages
 * without selecting any owner-private file. It composes existing DB-00,
 * DB-03 Star Path, DB-03 Quest rewards, DB-03 Event/default Friendship
 * rewards, source-pinned November and historical July Premium Shop offers,
 * original IAP reward definitions
 * and DB-02 online-name readers. Parsing, hash validation and origin semantics
 * remain owned by their existing modules.
 *
 * Online name equality and community-reported Premium Shop appearances are
 * separately labelled candidates, NOT ItemOrigin relations or native offers.
 */
import {loadCurrentGameDatabase} from '../game-db/client.ts';
import {loadPinnedPublicQuestAcquisition,
  type PublicQuestAcquisitionIndex} from '../guide/public-quest-acquisition.ts';
import {loadPinnedPublicEventFriendshipAcquisition,
  type PublicEventFriendshipAcquisitionIndex
} from '../guide/public-event-friendship-acquisition.ts';
import {loadUnifiedAcquisitionOriginDatabase,
  type OriginDatabase,type ItemOrigin,type OfficialCampaign} from './origins.ts';
import {joinDb02OriginsWithDb00,
  type Db00PublishedSnapshot,type Db00OriginJoin} from './db00-origins.ts';
import {historicalPremiumShop} from './premium-shop-history.ts';
import {
  loadPinnedPublicNativeShopSnapshot,loadPinnedHistoricalNativeShopSnapshot,
  type PinnedPublicNativeShopIndex
} from './public-native-shop.ts';
import {loadPinnedPublicIapSource,type PublicIapSourceIndex}
  from './public-static-iap.ts';
import {indexNativeShopHistory,type NativeShopHistoryIndex}
  from './shop-history-index.ts';
import {loadPinnedIapPackReferences,type PinnedIapPackReferenceIndex}
  from './public-iap-pack-references.ts';
import {
  indexItemSourceBrowser,indexExpandedNativeItemSourceBrowser,
  indexStaticCandidateItemSources,indexAllOriginalItemSources,
  type ItemSourceBrowser,type ExpandedNativeItemSourceBrowser,
  type StaticCandidateItemSourceBrowser,type AllOriginalItemSourceBrowser,
  type ItemSourceBrowserRow
} from './item-source-browser.ts';
import {loadPinnedStaticContainerContents,type PinnedStaticContainerContents}
  from './public-static-container.ts';
import {loadPinnedDefaultInventorySource,type PinnedDefaultInventorySource}
  from './public-default-inventories.ts';
import {loadPinnedNativePetSourceCategories,type NativePetSourceIndex}
  from './public-pet-source-categories.ts';
import {
  loadPinnedNativeCompanionIdentities,
  joinOfficialNativeCompanionNameCandidates,
  type PinnedNativeCompanionIdentityIndex,
  type CompanionOfficialNameCandidateIndex,
  type NativeCompanionIdentity,type CompanionOfficialNameCandidate
} from './public-native-companion-identities.ts';
import {loadPinnedNativeOnlineCategories,type NativeOnlineCategoryIndex}
  from './public-online-categories.ts';
import {indexDistributionScopes,
  type DistributionScopeIndex,type DistributionScopeItem
} from './distribution-scopes.ts';
import {loadPinnedNativeRecipeResults,
  type NativeRecipeIndex,type NativeRecipe}
  from './public-native-recipes.ts';
import {loadPinnedNativeActivityResults,
  type NativeActivityResultIndex,type NativeActivityResultPath}
  from './public-native-activities.ts';
import {
  loadPinnedNativeCookingMembers,joinNativeRecipeCookingMembers,
  type NativeCookingMemberIndex,type NativeCookingRecipeResolver
} from './public-cooking-members.ts';
import {
  loadPinnedNativeLootCandidates,
  type NativeLootCandidateIndex,type NativeLootCandidate
} from './public-native-loot.ts';
import {
  loadPinnedNativeLootNames,joinPinnedNativeLootNames,
  type NativeLootNameIndex,type NativeNamedLootIndex,
  type NamedNativeLootCandidate
} from './public-native-loot-names.ts';
import {
  loadPinnedNativeStallSlots,joinPinnedNativeStallLoot,
  type NativeStallSlotIndex,type NativeStallSourceIndex,
  type NativeStallItemCandidate
} from './public-native-stalls.ts';
import {joinPinnedNativeObjectLoot,
  type PublicNativeObjectLootIndex,
  type NativeObjectLootCandidate
} from './public-native-loot-objects.ts';
import {
  indexNativeLootContexts,
  type NativeLootContextIndex,type NativeLootContextItem
} from './native-loot-context-search.ts';
import {indexPublicOnlineNameCandidates,
  type PublicOnlineNameCandidateIndex,
  type PublicOnlineNameCandidate} from './public-online-name-candidates.ts';

export const DB02_PUBLIC_SOURCE_CATALOG_SCHEMA='wand.db02.public-source-catalog@1' as const;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

export interface PublicSourceCatalogCoverage {
  readonly publishedItemDefinitions:13202;
  readonly linkedPublishedItemIds:number;
  readonly linkedOutsidePublishedItemIds:number;
  readonly allSourceLinkedItemIds:number;
  readonly starPathSourceRoutes:67;
  readonly questSourceRoutes:395;
  readonly nativeEventSourceRoutes:202;
  readonly defaultFriendshipSourceRoutes:16;
  readonly nativeShopSourceRoutes:156;
  readonly nativeShopOffers:29;
  readonly nativeShopDistinctItemIds:136;
  readonly historicalNativeShopOffers:27;
  readonly historicalNativeShopSourceRoutes:128;
  readonly historicalNativeShopDistinctItemIds:120;
  readonly observedShopSnapshotOfferIds:56;
  readonly observedDistinctShopOfferIds:48;
  readonly observedRepeatedShopOfferIds:8;
  readonly combinedNativeShopItemIds:186;
  readonly nativeIapPackages:53;
  readonly nativeIapDirectRewardRoutes:150;
  readonly nativeIapExtendedRewardRoutes:141;
  readonly nativeIapSourceRoutes:291;
  readonly nativeIapNestedPackReferences:3;
  readonly nativeIapAdditionalPackReferences:3;
  readonly nativeIapAppleAppStoreOnlyPackReferences:3;
  /** Existing 1255 fully joined origins. Static container candidates are separate. */
  readonly combinedSourceRoutes:1255;
  readonly staticContainerDefinitions:88;
  readonly staticContainerCandidateRoutes:146;
  readonly staticContainerCandidateItemIds:115;
  readonly configuredDefaultInventoryGroups:15;
  readonly configuredDefaultInventoryEntries:289;
  readonly configuredDefaultInventoryItemIds:288;
  readonly totalPublishedOriginAndContainerCandidateRoutes:1401;
  /** All exact configured source relations: does not assert actual acquisition. */
  readonly totalPublishedSourceAndStaticCandidateRelations:1690;
  readonly publicNameOnlyCandidateRelations:number;
  readonly distinctNameOnlyCandidateItemIds:number;
  readonly verifiedOnlineNameAcquisitionLinks:0;
  readonly liveOfferAvailabilityVerified:false;
  readonly sourceCoverageComplete:false;
  readonly requiresPrivateGameArchive:false;
}
export type PublicSourceItemLookup=ReturnType<Db00OriginJoin['lookup']>&{
  readonly onlineNameCandidates:readonly PublicOnlineNameCandidate[];
  /** Independent static template evidence, not confirmed loot or player contents. */
  readonly staticContainerCandidates:readonly ItemOrigin[];
  /** Native configured defaults: never proof the user's save owns them. */
  readonly configuredDefaultInventoryCandidates:readonly ItemOrigin[];
  readonly originCoverageComplete:false;
};
export type PublicSourceItemOriginalEvidenceLookup=PublicSourceItemLookup&{
  readonly originalSourceEvidence:ItemSourceBrowserRow;
  readonly originalSourceEvidenceLoaded:true;
};
export type PublicSourceItemNativeLootContextsLookup=PublicSourceItemLookup&{
  readonly nativeLootContexts:NativeLootContextItem;
  readonly nativeLootContextsLoaded:true;
  readonly actualDropVerified:false;
  readonly liveStallStockVerified:false;
};
export type PublicSourceItemDistributionScopeLookup=PublicSourceItemLookup&{
  readonly distributionScope:DistributionScopeItem;
  readonly distributionScopeEvidenceLoaded:true;
};
export type PublicSourceItemRecipeLookup=PublicSourceItemLookup&{
  readonly nativeRecipes:readonly NativeRecipe[];
  /** Exact original recipe-result links, separate from the original 1255 routes. */
  readonly nativeRecipeOrigins:readonly ItemOrigin[];
  readonly nativeRecipeDefinitionsLoaded:true;
  readonly recipeUnlockVerified:false;
};
export type PublicSourceItemNativeAcquisitionLookup=PublicSourceItemRecipeLookup&{
  readonly nativeActivityPaths:readonly NativeActivityResultPath[];
  readonly nativeActivityOrigins:readonly ItemOrigin[];
  readonly nativeActivityDefinitionsLoaded:true;
  readonly contextAvailabilityVerified:false;
};
export type PublicSourceItemLootCandidateLookup=PublicSourceItemLookup&{
  /** Separate static LootTable candidates, never confirmed Item acquisition. */
  readonly nativeLootCandidates:readonly NativeLootCandidate[];
  readonly nativeLootStaticOrigins:readonly ItemOrigin[];
  readonly nativeLootSourceLoaded:true;
  readonly actualLootContextVerified:false;
};
export type PublicSourceItemStallCandidateLookup=PublicSourceItemLookup&{
  /** Source-linked stall slot candidates; NOT a verified live shop sale. */
  readonly nativeStallCandidates:readonly NativeStallItemCandidate[];
  readonly nativeStallStaticOrigins:readonly ItemOrigin[];
  readonly nativeStallSourcesLoaded:true;
  readonly liveStallStockVerified:false;
  readonly liveStallPriceVerified:false;
  readonly purchasingEligibleVerified:false;
};
export type PublicSourceItemObjectLootLookup=PublicSourceItemLookup&{
  /** Native objects reference a table with this Item: still only a candidate. */
  readonly nativeObjectLootCandidates:readonly NativeObjectLootCandidate[];
  readonly nativeObjectLootSourceLoaded:true;
  readonly objectTableReferenceVerified:true;
  readonly actualObjectDropVerified:false;
};
export type PublicSourceItemNamedLootLookup=PublicSourceItemLookup&{
  /** Exact original LootTable name label; never gameplay drop/source proof. */
  readonly nativeNamedLootCandidates:readonly NamedNativeLootCandidate[];
  readonly nativeLootNameKeysLoaded:true;
  readonly originalNameKeyVerified:true;
  readonly actualDropVerified:false;
  readonly localizedNameVerified:false;
};
export type PublicSourceItemCompanionNameLookup=PublicSourceItemLookup&{
  /** Original Companion definition outside the main ItemList DB-00 scope. */
  readonly nativeCompanionIdentity:NativeCompanionIdentity|null;
  /** Human-to-native name association: NOT an official numeric reward link. */
  readonly companionOfficialNameCandidates:readonly CompanionOfficialNameCandidate[];
  readonly nativeCompanionIdentitiesLoaded:true;
  readonly nativeCompanionDefinitionVerified:true;
  readonly numericCampaignRewardLinkVerified:false;
  readonly actualCompanionGrantVerified:false;
};
export interface PublicSourceCatalog{
  readonly schema:typeof DB02_PUBLIC_SOURCE_CATALOG_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly source:'sha_pinned_public_db00_starpath_quest_event_friendship_native_shop_history_iap_and_official_records';
  readonly origins:OriginDatabase;
  /** Browse actual source relations by type/status with no name-only promotions. */
  readonly itemSources:ItemSourceBrowser;
  /** Full 1,255+1,943+763 exact static Item-origin paths on demand.
   * Recipe unlock, live supply and actual catches are NOT verified. */
  loadExpandedNativeItemSources():Promise<ExpandedNativeItemSourceBrowser>;
  /** Original LootTable, fixed container and default-inventory *candidates*.
   * No live context or player grant is verified. */
  loadStaticCandidateItemSources():Promise<StaticCandidateItemSourceBrowser>;
  /** Union search over 3961 definition references and 4239 static candidates.
   * Each relation retains original provenance and candidate/confirmed status. */
  loadAllOriginalItemSources():Promise<AllOriginalItemSourceBrowser>;
  /** Per original LootTable candidate: exact object/stall referrers and
   * internal native source name. Neither context is a verified actual drop. */
  loadNativeLootContexts():Promise<NativeLootContextIndex>;
  lookupWithNativeLootContexts(
    itemId:string|number
  ):Promise<PublicSourceItemNativeLootContextsLookup>;
  lookupWithOriginalSourceEvidence(
    itemId:string|number
  ):Promise<PublicSourceItemOriginalEvidenceLookup>;
  readonly db00:Db00OriginJoin;
  readonly nameCandidates:PublicOnlineNameCandidateIndex;
  readonly questSource:PublicQuestAcquisitionIndex;
  readonly eventFriendshipSource:PublicEventFriendshipAcquisitionIndex;
  readonly nativeShopSource:PinnedPublicNativeShopIndex;
  readonly historicalNativeShopSource:PinnedPublicNativeShopIndex;
  /** Source-authenticated per-Item and per-offer appearance chronology. */
  readonly shopHistory:NativeShopHistoryIndex;
  readonly nativeIapSource:PublicIapSourceIndex;
  /** Exact inter-pack graph, NOT an expanded purchased entitlement or Item origin. */
  readonly nativeIapPackReferences:PinnedIapPackReferenceIndex;
  /** Source-native configured container template slots, never live contents. */
  readonly staticContainerSource:PinnedStaticContainerContents;
  readonly defaultInventorySource:PinnedDefaultInventorySource;
  /** Optional, source-pinned native PetItemData.Source categories. No eager fetch. */
  loadNativePetSources():Promise<NativePetSourceIndex>;
  /** All 394 original Companion Item IDs and exact internal keys. */
  loadNativeCompanionIdentities():Promise<PinnedNativeCompanionIdentityIndex>;
  /** Two Item IDs / three name-semantic official campaign candidates only. */
  loadOfficialCompanionNameCandidates():Promise<CompanionOfficialNameCandidateIndex>;
  lookupWithNativeCompanionNameCandidates(
    itemId:string|number
  ):Promise<PublicSourceItemCompanionNameLookup>;
  /** Native OnlineCategory enum: Premium/TimeLimited, not a specific sale. */
  loadNativeOnlineCategories():Promise<NativeOnlineCategoryIndex>;
  /** All 3961 pinned source links plus original online categories and name
   * candidates, grouped by ordinary/game time/real-world distribution.
   * Classification never proves exclusive rarity, a drop, or live availability. */
  loadDistributionScopes():Promise<DistributionScopeIndex>;
  lookupWithDistributionScopes(
    itemId:string|number
  ):Promise<PublicSourceItemDistributionScopeLookup>;
  /** Optional original 1943 cooking/crafting result links and ingredient rules. */
  loadNativeRecipeResults():Promise<NativeRecipeIndex>;
  /** Optional SHA-pinned fishing/mining/timebending/growing source routes. */
  loadNativeActivityResults():Promise<NativeActivityResultIndex>;
  /** Native 469 cooking member Item IDs, 13 recipe-used ingredient selectors. */
  loadNativeCookingMembers():Promise<NativeCookingMemberIndex>;
  /** Resolver joins original cooking recipes to source-native observed candidates. */
  loadCookingRecipeResolver():Promise<NativeCookingRecipeResolver>;
  /** Original 3804 LootTable candidates, with no verified gameplay context. */
  loadNativeLootCandidates():Promise<NativeLootCandidateIndex>;
  /** Optional original LootTable name keys, 960 tables and 28 native families. */
  loadNativeLootNames():Promise<NativeLootNameIndex>;
  /** Associate original keys with source-static LootTable candidate Item IDs. */
  loadNamedNativeLootSources():Promise<NativeNamedLootIndex>;
  lookupWithNamedNativeLootCandidates(
    itemId:string|number
  ):Promise<PublicSourceItemNamedLootLookup>;
  /** Original 375 object -> table refs with 698 static candidate Item entries. */
  loadNativeObjectLootSources():Promise<PublicNativeObjectLootIndex>;
  /** Item-ID reverse lookup of original Furniture/ActivityItem table referrers. */
  lookupWithNativeObjectLootCandidates(
    itemId:string|number
  ):Promise<PublicSourceItemObjectLootLookup>;
  lookupWithNativeLootCandidates(
    itemId:string|number
  ):Promise<PublicSourceItemLootCandidateLookup>;
  /** Original 65 native stall definitions and 335 ordered LootTable slots. */
  loadNativeStallSlots():Promise<NativeStallSlotIndex>;
  /** Source-verified slot -> table links, 1,385 candidate-only Item relations. */
  loadNativeStallSources():Promise<NativeStallSourceIndex>;
  lookupWithNativeStallCandidates(
    itemId:string|number
  ):Promise<PublicSourceItemStallCandidateLookup>;
  /** Item-ID lookup with optional source-pinned recipe routes (one new fetch). */
  lookupWithNativeRecipes(itemId:string|number):Promise<PublicSourceItemRecipeLookup>;
  /** Enrich one Item ID with both recipe and original activity paths on demand. */
  lookupWithNativeAcquisition(
    itemId:string|number
  ):Promise<PublicSourceItemNativeAcquisitionLookup>;
  readonly coverage:PublicSourceCatalogCoverage;
  lookup(itemId:string|number):PublicSourceItemLookup;
  getSourceOrigin(originId:string):readonly ItemOrigin[];
  getCampaign(campaignId:string):OfficialCampaign|null;
}
function ensure(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB02_PUBLIC_CATALOG_'+code);
}

/**
 * Load and SHA-check public data once for this shared view. The two independent
 * DB-03 sources are still loaded by their respective first-party loaders.
 * This entrypoint never touches a private ZIP, save, or server account state.
 */
export async function loadPublicSourceCatalog(
  basePath='',fetcher:typeof fetch=fetch
):Promise<PublicSourceCatalog>{
  ensure(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  const [
    rawDb00,questSource,eventFriendshipSource,nativeShopSource,nativeIapSource,
    historicalNativeShopSource,staticContainerSource,defaultInventorySource
  ]=await Promise.all([
    loadCurrentGameDatabase(basePath,fetcher),
    loadPinnedPublicQuestAcquisition(basePath,fetcher),
    loadPinnedPublicEventFriendshipAcquisition(basePath,fetcher),
    loadPinnedPublicNativeShopSnapshot(basePath,fetcher),
    loadPinnedPublicIapSource(basePath,fetcher),
    loadPinnedHistoricalNativeShopSnapshot(basePath,fetcher),
    loadPinnedStaticContainerContents(basePath,fetcher),
    loadPinnedDefaultInventorySource(basePath,fetcher)
  ]);
  ensure(rawDb00.kind==='db_snapshot'&&rawDb00.items.length===13202,
    'CURRENT_DB00_REQUIRED');
  // DB-00 has verified every shard SHA before returning; the existing
  // DB-02 join additionally validates exact release/version/source identity.
  const db00Snapshot=rawDb00 as Db00PublishedSnapshot;
  const [origins,nativeIapPackReferences]=await Promise.all([
    loadUnifiedAcquisitionOriginDatabase(
      fetcher,null,basePath,[],null,questSource,eventFriendshipSource,
      nativeShopSource,nativeIapSource,historicalNativeShopSource
    ),
    loadPinnedIapPackReferences(nativeIapSource,basePath,fetcher)
  ]);
  const itemSources=indexItemSourceBrowser(origins);
  const shopHistory=indexNativeShopHistory(
    nativeShopSource,historicalNativeShopSource
  );
  const db00=joinDb02OriginsWithDb00(db00Snapshot,origins);
  const nameCandidates=indexPublicOnlineNameCandidates(
    db00Snapshot,origins.listCampaigns(),historicalPremiumShop.offers
  );
  const originCoverage=origins.getCoverage();
  const joined=db00.getCoverage();
  ensure(questSource.coverage.totalItemOriginCandidates===395&&
    eventFriendshipSource.coverage.eventRewardCandidates===202&&
    eventFriendshipSource.coverage.friendshipDefaultCandidates===16&&
    eventFriendshipSource.coverage.totalCandidates===218&&
    eventFriendshipSource.coverage.liveEventAvailabilityVerified===false&&
    eventFriendshipSource.coverage.guaranteedGrantsVerified===false&&
    nativeShopSource.coverage.sourceOffers===29&&
    nativeShopSource.coverage.sourceItemOccurrences===156&&
    nativeShopSource.coverage.distinctSourceItemIds===136&&
    nativeShopSource.coverage.currentAvailabilityVerified===false&&
    nativeShopSource.snapshotKey==='Shop20261118'&&
    historicalNativeShopSource.snapshotKey==='Shop20260715'&&
    historicalNativeShopSource.coverage.sourceOffers===27&&
    historicalNativeShopSource.coverage.sourceItemOccurrences===128&&
    historicalNativeShopSource.coverage.distinctSourceItemIds===120&&
    historicalNativeShopSource.coverage.fullGameVersionVerified===false&&
    historicalNativeShopSource.coverage.currentAvailabilityVerified===false&&
    shopHistory.coverage.observedOffers===56&&
    shopHistory.coverage.distinctNativeOfferIds===48&&
    shopHistory.coverage.repeatedNativeOfferIds===8&&
    shopHistory.coverage.distinctItemIds===186&&
    shopHistory.coverage.liveAvailabilityVerified===false&&
    defaultInventorySource.coverage.groups===15&&
    defaultInventorySource.coverage.configuredEntries===289&&
    defaultInventorySource.coverage.distinctItemIds===288&&
    defaultInventorySource.coverage.playerInventoryVerified===false&&
    defaultInventorySource.coverage.newPlayerGrantVerified===false&&
    defaultInventorySource.coverage.privateSaveIncluded===false&&
    staticContainerSource.coverage.definitionRecords===88&&
    staticContainerSource.coverage.populatedDefinitions===84&&
    staticContainerSource.coverage.populatedSourceSlots===146&&
    staticContainerSource.coverage.distinctItemIds===115&&
    staticContainerSource.coverage.liveContentsVerified===false&&
    staticContainerSource.coverage.guaranteedLootVerified===false&&
    staticContainerSource.coverage.personalSaveContentsIncluded===false&&
    nativeIapSource.coverage.nativePackages===53&&
    nativeIapSource.coverage.directRewardReferences===150&&
    nativeIapSource.coverage.extendedRewardReferences===141&&
    nativeIapSource.coverage.combinedRewardReferences===291&&
    nativeIapSource.coverage.accountEntitlementVerified===false&&
    nativeIapPackReferences.coverage.nativeIapPackages===53&&
    nativeIapPackReferences.coverage.nativeNestedReferences===3&&
    nativeIapPackReferences.coverage.nativeAdditionalReferences===3&&
    nativeIapPackReferences.coverage.appleAppStoreOnlyAdditionalReferences===3&&
    nativeIapPackReferences.coverage.onlineRewardGrantsVerified===0&&
    nativeIapPackReferences.coverage.nestedRewardExpansionVerified===false&&
    originCoverage.linkedRoutes===1255&&
    itemSources.knownLinkedItemIds.length===originCoverage.linkedItemIds&&
    itemSources.query().totalOriginRelations===originCoverage.linkedRoutes&&
    itemSources.getKindItemIds('premium_shop').length===186&&
    itemSources.getKindItemIds('purchase_bonus').length===158&&
    itemSources.getKindItemIds('twitch_drop').length===0&&
    itemSources.getKindItemIds('redeem_code').length===0&&
    originCoverage.routesBySourceKind.verified_game_native===904&&
    originCoverage.routesBySourceKind.verified_liveops_cache===351&&
    joined.db00Items===13202&&
    joined.sourceLinkedItemIds===originCoverage.linkedItemIds&&
    nameCandidates.coverage.verifiedOnlineAcquisitionLinks===0,
    'PUBLIC_SOURCE_CENSUS');
  const coverage:PublicSourceCatalogCoverage=Object.freeze({
    publishedItemDefinitions:13202 as const,
    linkedPublishedItemIds:joined.linkedDb00Items,
    linkedOutsidePublishedItemIds:joined.linkedOutsideDb00Items,
    allSourceLinkedItemIds:originCoverage.linkedItemIds,
    starPathSourceRoutes:67 as const,
    questSourceRoutes:395 as const,
    nativeEventSourceRoutes:202 as const,
    defaultFriendshipSourceRoutes:16 as const,
    nativeShopSourceRoutes:156 as const,
    nativeShopOffers:29 as const,
    nativeShopDistinctItemIds:136 as const,
    historicalNativeShopOffers:27 as const,
    historicalNativeShopSourceRoutes:128 as const,
    historicalNativeShopDistinctItemIds:120 as const,
    observedShopSnapshotOfferIds:56 as const,
    observedDistinctShopOfferIds:48 as const,
    observedRepeatedShopOfferIds:8 as const,
    combinedNativeShopItemIds:186 as const,
    nativeIapPackages:53 as const,
    nativeIapDirectRewardRoutes:150 as const,
    nativeIapExtendedRewardRoutes:141 as const,
    nativeIapSourceRoutes:291 as const,
    nativeIapNestedPackReferences:3 as const,
    nativeIapAdditionalPackReferences:3 as const,
    nativeIapAppleAppStoreOnlyPackReferences:3 as const,
    combinedSourceRoutes:1255 as const,
    staticContainerDefinitions:88 as const,
    staticContainerCandidateRoutes:146 as const,
    staticContainerCandidateItemIds:115 as const,
    configuredDefaultInventoryGroups:15 as const,
    configuredDefaultInventoryEntries:289 as const,
    configuredDefaultInventoryItemIds:288 as const,
    totalPublishedOriginAndContainerCandidateRoutes:1401 as const,
    totalPublishedSourceAndStaticCandidateRelations:1690 as const,
    publicNameOnlyCandidateRelations:nameCandidates.coverage.totalCandidateRelations,
    distinctNameOnlyCandidateItemIds:nameCandidates.coverage.distinctCandidateItemIds,
    verifiedOnlineNameAcquisitionLinks:0 as const,
    liveOfferAvailabilityVerified:false as const,
    sourceCoverageComplete:false as const,
    requiresPrivateGameArchive:false as const
  });
  // Existing DB-00 and every current public consumer retain their original
  // asset requests; the 2 KB source is fetched only when explicitly requested.
  let nativePetSourcePromise:Promise<NativePetSourceIndex>|null=null;
  let nativeCompanionIdentityPromise:Promise<PinnedNativeCompanionIdentityIndex>|null=null;
  let officialCompanionNamePromise:Promise<CompanionOfficialNameCandidateIndex>|null=null;
  let nativeOnlineCategoryPromise:Promise<NativeOnlineCategoryIndex>|null=null;
  let distributionScopePromise:Promise<DistributionScopeIndex>|null=null;
  let nativeRecipePromise:Promise<NativeRecipeIndex>|null=null;
  let nativeActivityPromise:Promise<NativeActivityResultIndex>|null=null;
  let expandedNativeBrowserPromise:Promise<ExpandedNativeItemSourceBrowser>|null=null;
  let staticCandidateBrowserPromise:Promise<StaticCandidateItemSourceBrowser>|null=null;
  let allOriginalBrowserPromise:Promise<AllOriginalItemSourceBrowser>|null=null;
  let nativeLootContextPromise:Promise<NativeLootContextIndex>|null=null;
  let nativeCookingMembersPromise:Promise<NativeCookingMemberIndex>|null=null;
  let cookingRecipeResolverPromise:Promise<NativeCookingRecipeResolver>|null=null;
  let nativeLootPromise:Promise<NativeLootCandidateIndex>|null=null;
  let nativeLootNamesPromise:Promise<NativeLootNameIndex>|null=null;
  let namedLootSourcePromise:Promise<NativeNamedLootIndex>|null=null;
  let nativeObjectLootPromise:Promise<PublicNativeObjectLootIndex>|null=null;
  let nativeStallSlotsPromise:Promise<NativeStallSlotIndex>|null=null;
  let nativeStallSourcesPromise:Promise<NativeStallSourceIndex>|null=null;
  const loadCompanionIdentities=()=>nativeCompanionIdentityPromise??=
    loadPinnedNativeCompanionIdentities(basePath,fetcher);
  const loadCompanionNames=()=>officialCompanionNamePromise??=
    loadCompanionIdentities().then(native=>
      joinOfficialNativeCompanionNameCandidates(native,origins.listCampaigns())
    );
  const loadRecipes=()=>nativeRecipePromise??=
    loadPinnedNativeRecipeResults(basePath,fetcher);
  const loadActivities=()=>nativeActivityPromise??=
    loadPinnedNativeActivityResults(basePath,fetcher);
  const loadExpandedNativeBrowser=()=>expandedNativeBrowserPromise??=
    Promise.all([loadRecipes(),loadActivities()]).then(([recipes,activities])=>
      indexExpandedNativeItemSourceBrowser(origins,recipes,activities)
    );
  const loadCookingMembers=()=>nativeCookingMembersPromise??=
    loadPinnedNativeCookingMembers(basePath,fetcher);
  const loadCookingRecipeResolver=()=>cookingRecipeResolverPromise??=
    Promise.all([loadRecipes(),loadCookingMembers()]).then(
      ([recipes,members])=>joinNativeRecipeCookingMembers(recipes,members)
    );
  const loadLoot=()=>nativeLootPromise??=
    loadPinnedNativeLootCandidates(basePath,fetcher);
  const loadStaticCandidateBrowser=()=>staticCandidateBrowserPromise??=
    loadLoot().then(loot=>
      indexStaticCandidateItemSources(loot,staticContainerSource,
        defaultInventorySource)
    );
  const loadAllOriginalBrowser=()=>allOriginalBrowserPromise??=
    Promise.all([loadExpandedNativeBrowser(),loadStaticCandidateBrowser()]).then(
      ([original,candidates])=>indexAllOriginalItemSources(original,candidates)
    );
  const loadLootNames=()=>nativeLootNamesPromise??=
    loadPinnedNativeLootNames(basePath,fetcher);
  const loadNamedLoot=()=>namedLootSourcePromise??=
    Promise.all([loadLoot(),loadLootNames()]).then(
      ([loot,names])=>joinPinnedNativeLootNames(loot,names)
    );
  const loadObjectLoot=()=>nativeObjectLootPromise??=
    loadLoot().then(loot=>joinPinnedNativeObjectLoot(loot));
  const loadStallSlots=()=>nativeStallSlotsPromise??=
    loadPinnedNativeStallSlots(basePath,fetcher);
  const loadStallSources=()=>nativeStallSourcesPromise??=
    Promise.all([loadStallSlots(),loadLoot()]).then(
      ([stalls,loot])=>joinPinnedNativeStallLoot(stalls,loot)
    );
  const loadLootContexts=()=>nativeLootContextPromise??=
    Promise.all([
      loadAllOriginalBrowser(),loadLoot(),loadLootNames(),loadStallSlots()
    ]).then(([all,loot,names,stalls])=>
      indexNativeLootContexts(all,loot,names,stalls)
    );
  const loadPets=()=>nativePetSourcePromise??=
    loadPinnedNativePetSourceCategories(basePath,fetcher);
  const loadOnline=()=>nativeOnlineCategoryPromise??=
    loadPinnedNativeOnlineCategories(basePath,fetcher);
  const loadDistribution=()=>distributionScopePromise??=
    Promise.all([loadOnline(),loadPets(),loadExpandedNativeBrowser()]).then(
      ([online,pets,expanded])=>
        indexDistributionScopes(origins,online,pets,nameCandidates,expanded)
    );
  const lookupCurrent=(itemId:string|number):PublicSourceItemLookup=>{
    // db00.lookup validates IDs and keeps extra-ItemList Quest/Currency IDs.
    const row=db00.lookup(itemId);
    return Object.freeze({
      ...row,
      onlineNameCandidates:nameCandidates.getItemCandidates(row.itemId),
      staticContainerCandidates:staticContainerSource.getItemCandidates(row.itemId),
      configuredDefaultInventoryCandidates:
        defaultInventorySource.getItemCandidates(row.itemId),
      originCoverageComplete:false as const
    });
  };
  return Object.freeze({
    schema:DB02_PUBLIC_SOURCE_CATALOG_SCHEMA,
    gameVersion:'1.26.2' as const,
    source:'sha_pinned_public_db00_starpath_quest_event_friendship_native_shop_history_iap_and_official_records' as const,
    origins,db00,nameCandidates,questSource,eventFriendshipSource,
    nativeShopSource,nativeIapSource,historicalNativeShopSource,
    nativeIapPackReferences,staticContainerSource,defaultInventorySource,
    shopHistory,itemSources,coverage,
    loadNativePetSources(){return loadPets();},
    loadNativeCompanionIdentities(){return loadCompanionIdentities();},
    loadOfficialCompanionNameCandidates(){return loadCompanionNames();},
    async lookupWithNativeCompanionNameCandidates(itemId:string|number){
      const row=lookupCurrent(itemId);
      const source=await loadCompanionNames();
      return Object.freeze({
        ...row,
        nativeCompanionIdentity:source.native.getItem(row.itemId),
        companionOfficialNameCandidates:source.getItemCandidates(row.itemId),
        nativeCompanionIdentitiesLoaded:true as const,
        nativeCompanionDefinitionVerified:true as const,
        numericCampaignRewardLinkVerified:false as const,
        actualCompanionGrantVerified:false as const
      });
    },
    loadNativeOnlineCategories(){return loadOnline();},
    loadDistributionScopes(){return loadDistribution();},
    async lookupWithDistributionScopes(itemId:string|number){
      const row=lookupCurrent(itemId);
      const scopes=await loadDistribution();
      return Object.freeze({
        ...row,distributionScope:scopes.getItem(row.itemId),
        distributionScopeEvidenceLoaded:true as const
      });
    },
    loadNativeRecipeResults(){return loadRecipes();},
    loadNativeActivityResults(){return loadActivities();},
    loadExpandedNativeItemSources(){return loadExpandedNativeBrowser();},
    loadStaticCandidateItemSources(){return loadStaticCandidateBrowser();},
    loadAllOriginalItemSources(){return loadAllOriginalBrowser();},
    loadNativeLootContexts(){return loadLootContexts();},
    async lookupWithNativeLootContexts(itemId:string|number){
      const row=lookupCurrent(itemId);
      const contexts=await loadLootContexts();
      return Object.freeze({
        ...row,
        nativeLootContexts:contexts.getItem(row.itemId),
        nativeLootContextsLoaded:true as const,
        actualDropVerified:false as const,
        liveStallStockVerified:false as const
      });
    },
    async lookupWithOriginalSourceEvidence(itemId:string|number){
      const current=lookupCurrent(itemId);
      const browser=await loadAllOriginalBrowser();
      return Object.freeze({
        ...current,
        originalSourceEvidence:browser.getItem(current.itemId),
        originalSourceEvidenceLoaded:true as const
      });
    },
    loadNativeCookingMembers(){return loadCookingMembers();},
    loadCookingRecipeResolver(){return loadCookingRecipeResolver();},
    loadNativeLootCandidates(){return loadLoot();},
    loadNativeLootNames(){return loadLootNames();},
    loadNamedNativeLootSources(){return loadNamedLoot();},
    async lookupWithNamedNativeLootCandidates(itemId:string|number){
      const row=lookupCurrent(itemId);
      const source=await loadNamedLoot();
      return Object.freeze({
        ...row,
        nativeNamedLootCandidates:source.getItemNamedCandidates(row.itemId),
        nativeLootNameKeysLoaded:true as const,
        originalNameKeyVerified:true as const,
        actualDropVerified:false as const,
        localizedNameVerified:false as const
      });
    },
    loadNativeObjectLootSources(){return loadObjectLoot();},
    async lookupWithNativeObjectLootCandidates(itemId:string|number){
      const row=lookupCurrent(itemId);
      const objectLoot=await loadObjectLoot();
      return Object.freeze({
        ...row,
        nativeObjectLootCandidates:
          objectLoot.getItemObjectCandidates(row.itemId),
        nativeObjectLootSourceLoaded:true as const,
        objectTableReferenceVerified:true as const,
        actualObjectDropVerified:false as const
      });
    },
    loadNativeStallSlots(){return loadStallSlots();},
    loadNativeStallSources(){return loadStallSources();},
    async lookupWithNativeStallCandidates(itemId:string|number){
      const row=lookupCurrent(itemId);
      const stalls=await loadStallSources();
      return Object.freeze({
        ...row,
        nativeStallCandidates:stalls.getItemCandidates(row.itemId),
        nativeStallStaticOrigins:stalls.getItemStaticOrigins(row.itemId),
        nativeStallSourcesLoaded:true as const,
        liveStallStockVerified:false as const,
        liveStallPriceVerified:false as const,
        purchasingEligibleVerified:false as const
      });
    },
    async lookupWithNativeLootCandidates(itemId:string|number){
      const row=lookupCurrent(itemId);
      const loot=await loadLoot();
      return Object.freeze({
        ...row,
        nativeLootCandidates:loot.getItemCandidates(row.itemId),
        nativeLootStaticOrigins:loot.getItemStaticOrigins(row.itemId),
        nativeLootSourceLoaded:true as const,
        actualLootContextVerified:false as const
      });
    },
    lookup(itemId:string|number){return lookupCurrent(itemId);},
    async lookupWithNativeRecipes(itemId:string|number){
      const row=lookupCurrent(itemId);
      const source=await loadRecipes();
      return Object.freeze({
        ...row,
        nativeRecipes:source.getResultRecipes(row.itemId),
        nativeRecipeOrigins:source.getResultOrigins(row.itemId),
        nativeRecipeDefinitionsLoaded:true as const,
        recipeUnlockVerified:false as const
      });
    },
    async lookupWithNativeAcquisition(itemId:string|number){
      const row=lookupCurrent(itemId);
      const [recipes,activities]=await Promise.all([
        loadRecipes(),loadActivities()
      ]);
      return Object.freeze({
        ...row,
        nativeRecipes:recipes.getResultRecipes(row.itemId),
        nativeRecipeOrigins:recipes.getResultOrigins(row.itemId),
        nativeRecipeDefinitionsLoaded:true as const,
        recipeUnlockVerified:false as const,
        nativeActivityPaths:activities.getItemPaths(row.itemId),
        nativeActivityOrigins:activities.getItemOrigins(row.itemId),
        nativeActivityDefinitionsLoaded:true as const,
        contextAvailabilityVerified:false as const
      });
    },
    getSourceOrigin(originId:string){
      const native=origins.getOrigin(originId);
      if(native.length)return native;
      const containers=staticContainerSource.getOrigin(originId);
      return containers.length?containers:defaultInventorySource.getOrigin(originId);
    },
    getCampaign(campaignId:string){return origins.getCampaign(campaignId);}
  });
}
