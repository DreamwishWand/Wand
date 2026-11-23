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
  createDb00NativeOnlineReader,type Db00NativeOnlineReader
} from './native-online-categories.ts';
import {
  createDb00NativeRecipeReader,type Db00NativeRecipeReader
} from './native-recipes.ts';
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
  createDb00PublicItemSearch,
  type Db00PublicItemSearchRequest,type Db00PublicItemSearchResult
} from './public-search.ts';

export const DB00_PUBLIC_SOURCES_SCHEMA='wand.game-db.public-sources@1' as const;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

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
  /** Optional SHA-pinned 9-family original OnlineCategory source classification. */
  loadNativeOnlineCategories():Promise<Db00NativeOnlineReader>;
  /** SHA-pinned original cooking/crafting results, loaded only on demand. */
  loadNativeRecipeSources():Promise<Db00NativeRecipeReader>;
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
  let nativeOnline:Promise<Db00NativeOnlineReader>|null=null;
  const loadNativeOnlineCategories=():Promise<Db00NativeOnlineReader>=>
    nativeOnline??=acquisition.loadNativeOnlineCategories().then(source=>
      createDb00NativeOnlineReader(database,joined,source)
    );
  let nativeRecipes:Promise<Db00NativeRecipeReader>|null=null;
  const loadNativeRecipeSources=():Promise<Db00NativeRecipeReader>=>
    nativeRecipes??=acquisition.loadNativeRecipeResults().then(source=>
      createDb00NativeRecipeReader(database,joined,source)
    );
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
  return Object.freeze({
    schema:DB00_PUBLIC_SOURCES_SCHEMA,
    snapshotId:database.snapshotId,database,joined,acquisition,guide,
    guideQuestTargets,guideEvents,originalCollectionAreas,
    hasPrivateGameSource:false as const,
    currentAvailabilityVerified:false as const,
    playerOwnershipVerified:false as const,
    getItem:(id:string|number)=>joined.getItem(id),
    getItems:(ids:readonly (string|number)[])=>joined.getItems(ids),
    searchItems:search.searchItems,
    searchOutsideSourceItems,loadNativeCompanionSources,
    loadNativeOnlineCategories,loadNativeRecipeSources,
    loadStarpathRewardCrosswalk,
    queryItems:(filters:readonly SharedDbFilter[]=[],
      page:Readonly<{offset?:number;limit?:number}>={})=>
      database.queryItems(filters,page),
    summarizeFacet:(request:SharedDbFacetRequest,filters:readonly SharedDbFilter[]=[])=>
      database.summarizeFacet(request,filters)
  });
}
