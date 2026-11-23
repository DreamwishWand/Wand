/**
 * DB-00 public-only, browser-ready shared Item-ID data entrypoint.
 *
 * Existing DB-00 / DB-02 / DB-03 source-pinned loaders remain authoritative.
 * Concurrent loads share the same immutable HTTP response bytes per URL:
 * no redundant network downloads, no skipped SHA-256 validation.
 *
 * Native world / Collection UI memberships and player state remain unknown.
 */
import {
  openSharedGameDatabase,
  type SharedGameDatabase,type SharedDbFilter,type SharedDbQueryResult,
  type SharedDbFacetRequest,type SharedDbFacetSummary
} from './integrated.ts';
import {
  joinCurrentGameSources,
  type Db00SourceJoinedReader,type Db00SourceJoinedItem
} from './source-join.ts';
import {
  loadPublicSourceCatalog,type PublicSourceCatalog
} from '../acquisition/public-source-catalog.ts';
import {loadGuideRewardIndex,type GuideRewardIndex}
  from '../guide/reward-relations.ts';
import {
  loadPublicQuestTargetReverse,DB03_QUEST_TARGET_REVERSE_FILE,
  type PublicQuestTargetReverseReader
} from '../guide/public-quest-target-reverse.ts';
import {
  loadPublicEventFriendshipRewards,DB03_EVENT_FRIENDSHIP_REWARD_FILE
} from '../guide/public-event-friendship-rewards.ts';
import {
  loadPublicEventQuestLinks,DB03_EVENT_QUEST_FILE
} from '../guide/public-event-quest-links.ts';
import {
  loadPublicEventDutyLinks,DB03_EVENT_DUTY_FILE
} from '../guide/public-event-duty-links.ts';
import {
  loadPublicEventSceneLinks,DB03_EVENT_SCENE_FILE
} from '../guide/public-event-scene-links.ts';
import {
  createDb00PublicEventSources,type Db00PublicEventSources
} from './event-relations.ts';
import {
  createDb00OutsideSourceSearch,
  type Db00OutsideSourceSearch,
  type Db00OutsideSearchRequest,
  type Db00OutsideSearchResult
} from './outside-item-search.ts';
import {
  createDb00NativeCompanionReader,type Db00NativeCompanionReader
} from './native-companions.ts';
import {
  createDb00CompanionIdentityReader,
  type Db00CompanionIdentityReader,type Db00CompanionIdentityItem
} from './native-companion-identities.ts';
import {
  createDb00NativeOnlineReader,type Db00NativeOnlineReader
} from './native-online-categories.ts';
import {
  createDb00DistributionSourceReader,
  type Db00DistributionSourceReader,
  type Db00DistributionSourceItem,
  type Db00DistributionSearchRequest,
  type Db00DistributionSearchPage
} from './distribution-sources.ts';
import {
  createDb00NativeRecipeReader,
  type Db00NativeRecipeReader,type Db00NativeRecipeResult
} from './native-recipes.ts';
import {
  createDb00NativeActivityReader,
  type Db00NativeActivityReader,type Db00NativeActivityItem
} from './native-activities.ts';
import {
  createDb00NativeLootReader,
  type Db00NativeLootReader,type Db00NativeLootItem
} from './native-loot.ts';
import {
  createDb00CookingIngredientReader,
  type Db00CookingIngredientReader
} from './native-cooking.ts';
import {
  createDb00NativeStallReader,
  type Db00NativeStallReader,type Db00NativeStallItem
} from './native-stalls.ts';
import {
  createDb00NativeLootContextReader,
  type Db00NativeLootContextReader,type Db00NativeLootContextItem
} from './native-loot-context.ts';
import {
  createDb00QuestReader,
  type Db00QuestReader,type Db00QuestItemEvidence
} from './native-quests.ts';
import {verifyPublicQuestIndex} from '../guide/public-guide.ts';
import {
  loadPublicQuestConditions,PUBLIC_QUEST_CONDITIONS_FILE
} from '../guide/public-quest-conditions.ts';
import {
  loadPublicQuestRewards,DB03_QUEST_REWARDS_FILE
} from '../guide/public-quest-rewards.ts';
import {loadPublicStarpath} from '../guide/public-starpath.ts';
import {
  loadStarpathRewardExtras,STARPATH_EXTRA_RELEASE
} from '../guide/starpath-reward-extras.ts';
import {
  createDb00StarpathRewardReader,type Db00StarpathRewardReader
} from './starpath-reward-crosswalk.ts';
import {
  createDb00OriginalCollectionAreaReader,
  type Db00OriginalCollectionAreaReader
} from './collection-area-sources.ts';
import {
  joinDb00SixOriginalCollectionAreas,
  type Db00SixOriginalAreaReader
} from './local-six-category-areas.ts';
import type {Db01SixSourceClient}
  from '../items/native-positive-area-six-categories.ts';
import {
  createDb00PublicItemSearch,
  type Db00PublicItemSearchRequest,type Db00PublicItemSearchResult
} from './public-search.ts';

export const DB00_PUBLIC_SOURCES_SCHEMA='wand.game-db.public-sources@1' as const;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

export interface Db00NativeAcquisitionEvidence {
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  readonly recipes:Db00NativeRecipeResult;
  readonly activities:Db00NativeActivityItem;
  /** Counts only source-defined recipe/path links, not possible live grants. */
  readonly nativeResultDefinitionCount:number;
  readonly staticSourceOnly:true;
  readonly acquisitionRouteCoverageComplete:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
}
/** Three mutually distinct native-source evidence families, no live Item grants. */
export interface Db00AllNativeAcquisitionEvidence extends Db00NativeAcquisitionEvidence {
  readonly loot:Db00NativeLootItem;
  readonly staticLootCandidateCount:number;
  readonly actualLootContextVerified:false;
  readonly guaranteedLootDropVerified:false;
}
/** Original stall-slot candidates are independent of live or historical sales. */
export interface Db00NativeStallCandidateEvidence {
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  readonly stalls:Db00NativeStallItem;
  readonly staticStallSlotCandidateCount:number;
  readonly staticStorePoolOnly:true;
  readonly liveShopStockVerified:false;
  readonly livePurchasePriceVerified:false;
  readonly purchasingEligibilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface PublicSharedGameSources{
  readonly schema:typeof DB00_PUBLIC_SOURCES_SCHEMA;
  readonly snapshotId:string;
  readonly database:SharedGameDatabase;
  readonly joined:Db00SourceJoinedReader;
  readonly acquisition:PublicSourceCatalog;
  readonly guide:GuideRewardIndex;
  readonly guideQuestTargets:PublicQuestTargetReverseReader;
  readonly guideEvents:Db00PublicEventSources;
  /** Seven verified original Collection-area config records (not Item membership). */
  readonly originalCollectionAreas:Db00OriginalCollectionAreaReader;
  /** Explicit owner-local only: attach DB-01 SHA-verified original shards.
   * No private origin/file download and no change to public startup IO.
   * Use a Worker for broad original-source searches.
   */
  connectOwnerLocalSixAreaSource(
    source:Db01SixSourceClient
  ):Db00SixOriginalAreaReader;
  readonly hasPrivateGameSource:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  getItem(itemId:string|number):Db00SourceJoinedItem;
  getItems(itemIds:readonly (string|number)[]):readonly Db00SourceJoinedItem[];
  /** Search exact public names / Item IDs and source-qualified acquisition links. */
  searchItems(request?:Db00PublicItemSearchRequest):Db00PublicItemSearchResult;
  /** Separately discover native source links omitted from the 13,202 ItemList. */
  searchOutsideSourceItems(
    request?:Db00OutsideSearchRequest
  ):Db00OutsideSearchResult;
  /** Optional 2-KB SHA-pinned native Companion source index, fetched on demand. */
  loadNativeCompanionSources():Promise<Db00NativeCompanionReader>;
  /** Original 394 Companion definitions + 134 Pet.Source enums, if requested. */
  loadNativeCompanionIdentitySources():Promise<Db00CompanionIdentityReader>;
  /** One Item ID -> original Companion identity and unverified official names. */
  getNativeCompanionIdentityEvidence(
    itemId:string|number
  ):Promise<Db00CompanionIdentityItem|null>;
  /** Optional SHA-pinned 9-family original OnlineCategory source classification. */
  loadNativeOnlineCategories():Promise<Db00NativeOnlineReader>;
  /** Three non-exclusive Item acquisition/availability source groups from DB-02. */
  loadDistributionSourceSearch():Promise<Db00DistributionSourceReader>;
  /** Item ID lookup with all source/evidence statuses, including no known evidence. */
  getItemDistributionEvidence(
    itemId:string|number
  ):Promise<Db00DistributionSourceItem>;
  /** Source-backed search, including original Item IDs absent from ItemList. */
  searchDistributionSources(
    request?:Db00DistributionSearchRequest
  ):Promise<Db00DistributionSearchPage>;
  /** SHA-pinned original cooking/crafting results, loaded only on demand. */
  loadNativeRecipeSources():Promise<Db00NativeRecipeReader>;
  /** Optional original fishing/mining/timebending/growing source paths. */
  loadNativeActivitySources():Promise<Db00NativeActivityReader>;
  /** SHA-pinned 3,804 original LootTable entries; static candidates, NOT drops. */
  loadNativeLootCandidateSources():Promise<Db00NativeLootReader>;
  /** Native LootTable names + original Furniture/ActivityItem references. */
  loadNativeLootContextSources():Promise<Db00NativeLootContextReader>;
  /** Static Quest conditions, Item objectives and reward candidates. */
  loadNativeQuestSources():Promise<Db00QuestReader>;
  /** A shared Item ID -> original Quest targets and reward candidates. */
  getNativeQuestItemEvidence(
    itemId:string|number
  ):Promise<Db00QuestItemEvidence>;
  /** One Item ID -> named static LootTable / original referring objects. */
  getNativeLootContextEvidence(
    itemId:string|number
  ):Promise<Db00NativeLootContextItem>;
  /** Original 469 cooking members and 238 ingredient selector uses. */
  loadNativeCookingIngredientSources():Promise<Db00CookingIngredientReader>;
  /** SHA-pinned 65 original stalls and 335 pool slots, loaded on demand. */
  loadNativeStallPoolSources():Promise<Db00NativeStallReader>;
  /** Per-Item original stall pool references, not proof of a sale. */
  getNativeStallCandidateEvidence(
    itemId:string|number
  ):Promise<Db00NativeStallCandidateEvidence>;
  /** One cross-service Item lookup, with both optional sources loaded lazily. */
  getNativeAcquisitionEvidence(
    itemId:string|number
  ):Promise<Db00NativeAcquisitionEvidence>;
  /** Recipes + activities + isolated static LootTable candidates. */
  getAllNativeAcquisitionEvidence(
    itemId:string|number
  ):Promise<Db00AllNativeAcquisitionEvidence>;
  /** Optional verified 60-reward name/category crosswalk, including unnamed motifs. */
  loadStarpathRewardCrosswalk():Promise<Db00StarpathRewardReader>;
  queryItems(filters?:readonly SharedDbFilter[],
    page?:Readonly<{offset?:number;limit?:number}>):SharedDbQueryResult;
  summarizeFacet(request:SharedDbFacetRequest,
    filters?:readonly SharedDbFilter[]):SharedDbFacetSummary;
}
function assert(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB00_PUBLIC_SOURCES_'+code);
}

/**
 * One public-only call for Collection, Guide, Gallery, Save and World readers.
 * Fetch deduplication is scoped to this call: switching active.json in a later
 * call cannot reuse a stale cache. Each consumer still parses and checks its
 * own exact source-provenanced response independently.
 */
export async function openPublicSharedGameSources(
  basePath='',fetcher:typeof fetch=fetch
):Promise<PublicSharedGameSources>{
  assert(typeof basePath==='string'&&
    (basePath===''||BASE.test(basePath)),'INVALID_BASE_PATH');
  assert(typeof fetcher==='function','FETCH_REQUIRED');
  const prefix=basePath+'/';
  const seen=new Map<string,Promise<Response>>();
  const once:typeof fetch=(input,init)=>{
    assert(typeof input==='string' && input.startsWith(prefix) &&
      !input.includes('..') &&
      init===undefined,'INVALID_ASSET_REQUEST');
    let existing=seen.get(input);
    if(!existing){
      existing=Promise.resolve().then(()=>fetcher(input));
      seen.set(input,existing);
    }
    // No caller receives the original response body; clones can each verify
    // the immutable source bytes without a duplicate HTTP request.
    return existing.then(response=>{
      assert(response instanceof Response,'INVALID_FETCH_RESPONSE');
      return response.clone();
    });
  };
  // Quest catalogue is already requested by DB-02. Share the exact HTTP
  // response bytes with its verified loader, then let DB-03 independently
  // validate the quest catalogue and SHA-pinned target reverse index.
  const questCatalogueTask=(async()=>{
    const res=await once(basePath+'/guide/public/quest-index.json');
    assert(res.ok,'QUEST_INDEX_DOWNLOAD_FAILED');
    return res.json();
  })();
  const questTargetTask=questCatalogueTask.then(catalogue=>
    loadPublicQuestTargetReverse(
      catalogue,
      basePath+'/guide/public/'+DB03_QUEST_TARGET_REVERSE_FILE,once
    )
  );
  const eventSourceTask=loadPublicEventFriendshipRewards(
    basePath+'/guide/public/'+DB03_EVENT_FRIENDSHIP_REWARD_FILE,once
  );
  const eventTask=Promise.all([questCatalogueTask,eventSourceTask])
    .then(async ([catalogue,events])=>{
      const [quest,duty,scene]=await Promise.all([
        loadPublicEventQuestLinks(
          events,catalogue,basePath+'/guide/public/'+DB03_EVENT_QUEST_FILE,once
        ),
        loadPublicEventDutyLinks(
          events,basePath+'/guide/public/'+DB03_EVENT_DUTY_FILE,once
        ),
        loadPublicEventSceneLinks(
          events,basePath+'/guide/public/'+DB03_EVENT_SCENE_FILE,once
        )
      ]);
      return createDb00PublicEventSources(events,quest,duty,scene);
    });
  const [database,acquisition,guide,guideQuestTargets,guideEvents,questCatalogue]=await Promise.all([
    openSharedGameDatabase(basePath,once),
    loadPublicSourceCatalog(basePath,once),
    loadGuideRewardIndex(basePath+'/guide/public/starpath-cache-2026-11-22.json',once),
    questTargetTask,eventTask,questCatalogueTask
  ]);
  const originalCollectionAreas=createDb00OriginalCollectionAreaReader();
  const joined=joinCurrentGameSources(database,{
    origins:acquisition.origins,rewards:guide,
    staticContainers:acquisition.staticContainerSource,
    defaultInventories:acquisition.defaultInventorySource,
    officialNameCandidates:acquisition.nameCandidates,
    questTargets:guideQuestTargets
  });
  let outsideSearch:Db00OutsideSourceSearch|null=null;
  const searchOutsideSourceItems=(request:Db00OutsideSearchRequest={}):
    Db00OutsideSearchResult=>{
    if(!outsideSearch){
      // DB-03's SHA-pinned target reader has already verified this exact
      // public Quest index. Never enumerate IDs from private Mission archives.
      outsideSearch=createDb00OutsideSourceSearch(
        database,joined,acquisition,guide,guideQuestTargets,
        questCatalogue.quests.map((row:{id:string})=>row.id)
      );
    }
    return outsideSearch.search(request);
  };
  let companions:Promise<Db00NativeCompanionReader>|null=null;
  const loadNativeCompanionSources=():Promise<Db00NativeCompanionReader>=>
    companions??=acquisition.loadNativePetSources().then(pets=>
      createDb00NativeCompanionReader(database,joined,pets)
    );
  let companionIdentity:Promise<Db00CompanionIdentityReader>|null=null;
  const loadNativeCompanionIdentitySources=():Promise<Db00CompanionIdentityReader>=>
    companionIdentity??=Promise.all([
      loadNativeCompanionSources(),
      acquisition.loadNativeCompanionIdentities(),
      acquisition.loadOfficialCompanionNameCandidates()
    ]).then(([petSource,identities,officialNames])=>
      createDb00CompanionIdentityReader(
        database,joined,petSource,identities,officialNames
      ));
  const getNativeCompanionIdentityEvidence=async(
    itemId:string|number
  ):Promise<Db00CompanionIdentityItem|null>=>{
    // Validate the Item ID before fetching any optional projection.
    const shared=joined.getItem(itemId);
    const row=(await loadNativeCompanionIdentitySources()).getItem(shared.itemId);
    assert(row===null||
      (row.itemId===shared.itemId&&
        row.shared.itemId===shared.itemId&&
        row.originalIdentityVerified===true&&
        row.numericCampaignRewardLinkVerified===false&&
        row.campaignGrantVerified===false&&
        row.playerOwnershipVerified===false),
      'NATIVE_COMPANION_IDENTITY_JOIN_MISMATCH');
    return row;
  };
  let nativeOnline:Promise<Db00NativeOnlineReader>|null=null;
  const loadNativeOnlineCategories=():Promise<Db00NativeOnlineReader>=>
    nativeOnline??=acquisition.loadNativeOnlineCategories().then(source=>
      createDb00NativeOnlineReader(database,joined,source)
    );
  let distributionSearch:Promise<Db00DistributionSourceReader>|null=null;
  const loadDistributionSourceSearch=():Promise<Db00DistributionSourceReader>=>
    distributionSearch??=acquisition.loadDistributionScopes().then(source=>
      createDb00DistributionSourceReader(database,joined,source)
    );
  const getItemDistributionEvidence=async(
    itemId:string|number
  ):Promise<Db00DistributionSourceItem>=>{
    // Validate Item ID before the optional source projections download.
    const shared=joined.getItem(itemId);
    const row=(await loadDistributionSourceSearch()).getItem(shared.itemId);
    assert(row.itemId===shared.itemId&&
      row.shared.itemId===shared.itemId&&
      row.sourceCoverageComplete===false&&
      row.exclusiveTimeLimitedItemVerified===false&&
      row.currentAvailabilityVerified===false&&
      row.playerOwnershipVerified===false,
      'DISTRIBUTION_ITEM_ID_OR_PROOF_DRIFT');
    return row;
  };
  const searchDistributionSources=async(
    request:Db00DistributionSearchRequest={}
  ):Promise<Db00DistributionSearchPage>=>{
    // Query validation lives with the bounded, source-backed reader.
    return (await loadDistributionSourceSearch()).search(request);
  };
  let nativeRecipes:Promise<Db00NativeRecipeReader>|null=null;
  const loadNativeRecipeSources=():Promise<Db00NativeRecipeReader>=>
    nativeRecipes??=acquisition.loadNativeRecipeResults().then(source=>
      createDb00NativeRecipeReader(database,joined,source)
    );
  let nativeActivities:Promise<Db00NativeActivityReader>|null=null;
  const loadNativeActivitySources=():Promise<Db00NativeActivityReader>=>
    nativeActivities??=acquisition.loadNativeActivityResults().then(source=>
      createDb00NativeActivityReader(database,joined,source)
    );
  const getNativeAcquisitionEvidence=async(
    itemId:string|number
  ):Promise<Db00NativeAcquisitionEvidence>=>{
    // Validate IDs through the existing DB-00 reader before optional fetches.
    const shared=joined.getItem(itemId);
    const [recipeReader,activityReader]=await Promise.all([
      loadNativeRecipeSources(),loadNativeActivitySources()
    ]);
    const recipes=recipeReader.getResult(shared.itemId);
    const activities=activityReader.getItem(shared.itemId);
    assert(recipes.itemId===shared.itemId &&
      activities.itemId===shared.itemId &&
      recipes.item.itemId===shared.itemId &&
      activities.item.itemId===shared.itemId &&
      recipes.sourceRecipeOrigins.length===recipes.recipes.length &&
      activities.sourcePathOrigins.length===activities.sourcePaths.length &&
      recipes.recipeUnlockedVerified===false &&
      activities.currentAvailabilityVerified===false,
      'NATIVE_ACQUISITION_JOIN_MISMATCH');
    return Object.freeze({
      itemId:shared.itemId,shared,recipes,activities,
      nativeResultDefinitionCount:recipes.recipes.length+
        activities.sourcePaths.length,
      staticSourceOnly:true as const,
      acquisitionRouteCoverageComplete:false as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      collectionUiMembershipVerified:false as const
    });
  };
  let nativeLoot:Promise<Db00NativeLootReader>|null=null;
  const loadNativeLootCandidateSources=():Promise<Db00NativeLootReader>=>
    nativeLoot??=acquisition.loadNativeLootCandidates().then(source=>
      createDb00NativeLootReader(database,joined,source)
    );
  const getAllNativeAcquisitionEvidence=async(
    itemId:string|number
  ):Promise<Db00AllNativeAcquisitionEvidence>=>{
    // Validate before requesting any optional source file.
    const item=joined.getItem(itemId);
    const [existing,lootReader]=await Promise.all([
      getNativeAcquisitionEvidence(item.itemId),
      loadNativeLootCandidateSources()
    ]);
    const loot=lootReader.getItem(item.itemId);
    assert(existing.itemId===item.itemId &&
      loot.itemId===item.itemId &&
      loot.item.itemId===item.itemId &&
      loot.candidates.length===loot.staticCandidateOrigins.length &&
      loot.sourceCandidateOnly===true &&
      loot.guaranteedDropVerified===false &&
      loot.actualGameplayContextVerified===false,
      'NATIVE_LOOT_CROSS_SOURCE_MISMATCH');
    return Object.freeze({
      ...existing,loot,staticLootCandidateCount:loot.candidates.length,
      actualLootContextVerified:false as const,
      guaranteedLootDropVerified:false as const
    });
  };
  let nativeQuestSources:Promise<Db00QuestReader>|null=null;
  const loadNativeQuestSources=():Promise<Db00QuestReader>=>
    nativeQuestSources??=(async()=>{
      const index=verifyPublicQuestIndex(questCatalogue);
      const [conditions,rewards]=await Promise.all([
        loadPublicQuestConditions(index,
          basePath+'/guide/public/'+PUBLIC_QUEST_CONDITIONS_FILE,once),
        loadPublicQuestRewards(index,
          basePath+'/guide/public/'+DB03_QUEST_REWARDS_FILE,once)
      ]);
      return createDb00QuestReader(
        database,joined,index,conditions,rewards,guideQuestTargets
      );
    })();
  const getNativeQuestItemEvidence=async(itemId:string|number):
    Promise<Db00QuestItemEvidence>=>{
    // Validate before fetching optional Quest conditions/reward projections.
    const shared=joined.getItem(itemId);
    const item=(await loadNativeQuestSources()).getItem(shared.itemId);
    assert(item.itemId===shared.itemId &&
      item.shared.itemId===shared.itemId &&
      item.staticSourceOnly===true &&
      item.mandatoryRequirementVerified===false &&
      item.guaranteedRewardVerified===false &&
      item.playerOwnershipVerified===false,
      'NATIVE_QUEST_ITEM_ID_OR_STATUS_MISMATCH');
    return item;
  };
  let nativeLootContext:Promise<Db00NativeLootContextReader>|null=null;
  const loadNativeLootContextSources=():Promise<Db00NativeLootContextReader>=>
    nativeLootContext??=Promise.all([
      acquisition.loadNamedNativeLootSources(),
      acquisition.loadNativeObjectLootSources()
    ]).then(([named,objects])=>
      createDb00NativeLootContextReader(database,joined,named,objects));
  const getNativeLootContextEvidence=async(itemId:string|number):
    Promise<Db00NativeLootContextItem>=>{
    // Canonicalise through DB-00 prior to optional source downloads.
    const shared=joined.getItem(itemId);
    const item=(await loadNativeLootContextSources()).getItem(shared.itemId);
    assert(item.itemId===shared.itemId &&
      item.shared.itemId===shared.itemId &&
      item.originalSourceCandidatesOnly===true &&
      item.actualGameplayDropVerified===false &&
      item.liveAvailabilityVerified===false,
      'NATIVE_LOOT_CONTEXT_ITEM_ID_MISMATCH');
    return item;
  };
  let nativeCooking:Promise<Db00CookingIngredientReader>|null=null;
  const loadNativeCookingIngredientSources=():
    Promise<Db00CookingIngredientReader>=>
    nativeCooking??=Promise.all([
      acquisition.loadNativeRecipeResults(),
      acquisition.loadNativeCookingMembers()
    ]).then(([recipes,members])=>
      createDb00CookingIngredientReader(database,joined,recipes,members));
  let nativeStallSources:Promise<Db00NativeStallReader>|null=null;
  const loadNativeStallPoolSources=():Promise<Db00NativeStallReader>=>
    nativeStallSources??=acquisition.loadNativeStallSources().then(source=>
      createDb00NativeStallReader(database,joined,source)
    );
  const getNativeStallCandidateEvidence=async(
    itemId:string|number
  ):Promise<Db00NativeStallCandidateEvidence>=>{
    // Reject invalid IDs without fetching optional original source files.
    const shared=joined.getItem(itemId);
    const stalls=(await loadNativeStallPoolSources()).getItem(shared.itemId);
    assert(stalls.itemId===shared.itemId &&
      stalls.item.itemId===shared.itemId &&
      stalls.staticSlotCandidates.length===stalls.staticSlotOrigins.length &&
      stalls.staticPoolOnly===true &&
      stalls.currentShopStockVerified===false &&
      stalls.currentPricesVerified===false,
      'NATIVE_STALL_ITEM_JOIN_MISMATCH');
    return Object.freeze({
      itemId:shared.itemId,shared,stalls,
      staticStallSlotCandidateCount:stalls.staticSlotCandidates.length,
      staticStorePoolOnly:true as const,
      liveShopStockVerified:false as const,
      livePurchasePriceVerified:false as const,
      purchasingEligibilityVerified:false as const,
      playerOwnershipVerified:false as const
    });
  };
  let starpathCrosswalk:Promise<Db00StarpathRewardReader>|null=null;
  const loadStarpathRewardCrosswalk=():Promise<Db00StarpathRewardReader>=>
    starpathCrosswalk??=(async()=>{
      // Re-fetch from this entrypoint's per-call cloned-response cache:
      // the same source bytes are independently SHA checked by DB-03,
      // without downloading the 34-KB season cache a second time.
      const raw=await loadPublicStarpath(
        basePath+'/guide/public/starpath-cache-2026-11-22.json',once
      );
      const extras=await loadStarpathRewardExtras(
        basePath+'/guide/public/'+STARPATH_EXTRA_RELEASE.file,raw,once
      );
      return createDb00StarpathRewardReader(database,joined,guide,extras);
    })();
  const search=createDb00PublicItemSearch(
    database,joined,acquisition.origins,guide,acquisition.staticContainerSource,
    guideQuestTargets,acquisition.defaultInventorySource,
    acquisition.nameCandidates
  );
  assert(acquisition.gameVersion==='1.26.2' &&
    acquisition.coverage.publishedItemDefinitions===database.itemCount &&
    acquisition.coverage.combinedSourceRoutes===1255 &&
    acquisition.coverage.staticContainerCandidateRoutes===146 &&
    acquisition.coverage.staticContainerCandidateItemIds===115 &&
    acquisition.coverage.configuredDefaultInventoryEntries===289 &&
    acquisition.coverage.configuredDefaultInventoryItemIds===288 &&
    acquisition.coverage.requiresPrivateGameArchive===false &&
    acquisition.coverage.sourceCoverageComplete===false &&
    acquisition.coverage.liveOfferAvailabilityVerified===false &&
    acquisition.coverage.verifiedOnlineNameAcquisitionLinks===0 &&
    acquisition.nameCandidates.evidence==='name_only_no_grant_or_sale_proof' &&
    acquisition.nameCandidates.coverage.verifiedOnlineAcquisitionLinks===0 &&
    guide.evidence.integrity==='pinned_public_sha256' &&
    guide.coverage.currentAvailabilityVerified===false &&
    guideQuestTargets.schema==='wand.db03.public-quest-target-reverse@1' &&
    guideQuestTargets.coverage.sourceCandidateOccurrences===4897 &&
    guideQuestTargets.coverage.mandatoryRequirementVerified===false &&
    guideQuestTargets.coverage.playerProgressVerified===false &&
    guideEvents.gameVersion==='1.26.2' &&
    guideEvents.counts.publicEvents===23 &&
    guideEvents.counts.eventQuestReferences===62 &&
    guideEvents.counts.eventDutyReferences===79 &&
    guideEvents.counts.festivalSceneReferences===17 &&
    guideEvents.counts.expansionVillageSceneReferences===6 &&
    guideEvents.sourceConfigurationOnly===true &&
    guideEvents.currentAvailabilityVerified===false &&
    guideEvents.playerProgressVerified===false &&
    joined.snapshotId===database.snapshotId,'CROSS_SOURCE_MISMATCH');
  const publicReader:PublicSharedGameSources=Object.freeze({
    schema:DB00_PUBLIC_SOURCES_SCHEMA,
    snapshotId:database.snapshotId,database,joined,acquisition,guide,
    guideQuestTargets,guideEvents,originalCollectionAreas,
    connectOwnerLocalSixAreaSource:(source:Db01SixSourceClient)=>
      joinDb00SixOriginalCollectionAreas(publicReader,source),
    hasPrivateGameSource:false as const,
    currentAvailabilityVerified:false as const,
    playerOwnershipVerified:false as const,
    getItem:(id:string|number)=>joined.getItem(id),
    getItems:(ids:readonly (string|number)[])=>joined.getItems(ids),
    searchItems:search.searchItems,
    searchOutsideSourceItems,loadNativeCompanionSources,
    loadNativeCompanionIdentitySources,getNativeCompanionIdentityEvidence,
    loadNativeOnlineCategories,
    loadDistributionSourceSearch,getItemDistributionEvidence,
    searchDistributionSources,loadNativeRecipeSources,
    loadNativeActivitySources,getNativeAcquisitionEvidence,
    loadNativeLootCandidateSources,getAllNativeAcquisitionEvidence,
    loadNativeLootContextSources,getNativeLootContextEvidence,
    loadNativeQuestSources,getNativeQuestItemEvidence,
    loadNativeCookingIngredientSources,
    loadNativeStallPoolSources,getNativeStallCandidateEvidence,
    loadStarpathRewardCrosswalk,
    queryItems:(filters:readonly SharedDbFilter[]=[],
      page:Readonly<{offset?:number;limit?:number}>={})=>
      database.queryItems(filters,page),
    summarizeFacet:(request:SharedDbFacetRequest,filters:readonly SharedDbFilter[]=[])=>
      database.summarizeFacet(request,filters)
  });
  return publicReader;
}
