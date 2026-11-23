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
import {indexItemSourceBrowser,type ItemSourceBrowser}
  from './item-source-browser.ts';
import {loadPinnedStaticContainerContents,type PinnedStaticContainerContents}
  from './public-static-container.ts';
import {loadPinnedDefaultInventorySource,type PinnedDefaultInventorySource}
  from './public-default-inventories.ts';
import {loadPinnedNativePetSourceCategories,type NativePetSourceIndex}
  from './public-pet-source-categories.ts';
import {loadPinnedNativeOnlineCategories,type NativeOnlineCategoryIndex}
  from './public-online-categories.ts';
import {loadPinnedNativeRecipeResults,
  type NativeRecipeIndex,type NativeRecipe}
  from './public-native-recipes.ts';
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
export type PublicSourceItemRecipeLookup=PublicSourceItemLookup&{
  readonly nativeRecipes:readonly NativeRecipe[];
  /** Exact original recipe-result links, separate from the original 1255 routes. */
  readonly nativeRecipeOrigins:readonly ItemOrigin[];
  readonly nativeRecipeDefinitionsLoaded:true;
  readonly recipeUnlockVerified:false;
};
export interface PublicSourceCatalog{
  readonly schema:typeof DB02_PUBLIC_SOURCE_CATALOG_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly source:'sha_pinned_public_db00_starpath_quest_event_friendship_native_shop_history_iap_and_official_records';
  readonly origins:OriginDatabase;
  /** Browse actual source relations by type/status with no name-only promotions. */
  readonly itemSources:ItemSourceBrowser;
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
  /** Native OnlineCategory enum: Premium/TimeLimited, not a specific sale. */
  loadNativeOnlineCategories():Promise<NativeOnlineCategoryIndex>;
  /** Optional original 1943 cooking/crafting result links and ingredient rules. */
  loadNativeRecipeResults():Promise<NativeRecipeIndex>;
  /** Item-ID lookup with optional source-pinned recipe routes (one new fetch). */
  lookupWithNativeRecipes(itemId:string|number):Promise<PublicSourceItemRecipeLookup>;
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
  let nativeOnlineCategoryPromise:Promise<NativeOnlineCategoryIndex>|null=null;
  let nativeRecipePromise:Promise<NativeRecipeIndex>|null=null;
  const loadRecipes=()=>nativeRecipePromise??=
    loadPinnedNativeRecipeResults(basePath,fetcher);
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
    loadNativePetSources(){
      return nativePetSourcePromise??=loadPinnedNativePetSourceCategories(
        basePath,fetcher
      );
    },
    loadNativeOnlineCategories(){
      return nativeOnlineCategoryPromise??=loadPinnedNativeOnlineCategories(
        basePath,fetcher
      );
    },
    loadNativeRecipeResults(){return loadRecipes();},
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
    getSourceOrigin(originId:string){
      const native=origins.getOrigin(originId);
      if(native.length)return native;
      const containers=staticContainerSource.getOrigin(originId);
      return containers.length?containers:defaultInventorySource.getOrigin(originId);
    },
    getCampaign(campaignId:string){return origins.getCampaign(campaignId);}
  });
}
