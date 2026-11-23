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
  readonly hasPrivateGameSource:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  getItem(itemId:string|number):Db00SourceJoinedItem;
  getItems(itemIds:readonly (string|number)[]):readonly Db00SourceJoinedItem[];
  /** Search exact public names / Item IDs and source-qualified acquisition links. */
  searchItems(request?:Db00PublicItemSearchRequest):Db00PublicItemSearchResult;
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
  const questTargetTask=(async()=>{
    const res=await once(basePath+'/guide/public/quest-index.json');
    assert(res.ok,'QUEST_INDEX_DOWNLOAD_FAILED');
    return loadPublicQuestTargetReverse(
      await res.json(),
      basePath+'/guide/public/'+DB03_QUEST_TARGET_REVERSE_FILE,once
    );
  })();
  const [database,acquisition,guide,guideQuestTargets]=await Promise.all([
    openSharedGameDatabase(basePath,once),
    loadPublicSourceCatalog(basePath,once),
    loadGuideRewardIndex(basePath+'/guide/public/starpath-cache-2026-11-22.json',once),
    questTargetTask
  ]);
  const joined=joinCurrentGameSources(database,{
    origins:acquisition.origins,rewards:guide,
    staticContainers:acquisition.staticContainerSource,
    defaultInventories:acquisition.defaultInventorySource,
    questTargets:guideQuestTargets
  });
  const search=createDb00PublicItemSearch(
    database,joined,acquisition.origins,guide,acquisition.staticContainerSource,
    guideQuestTargets,acquisition.defaultInventorySource
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
    guide.evidence.integrity==='pinned_public_sha256' &&
    guide.coverage.currentAvailabilityVerified===false &&
    guideQuestTargets.schema==='wand.db03.public-quest-target-reverse@1' &&
    guideQuestTargets.coverage.sourceCandidateOccurrences===4897 &&
    guideQuestTargets.coverage.mandatoryRequirementVerified===false &&
    guideQuestTargets.coverage.playerProgressVerified===false &&
    joined.snapshotId===database.snapshotId,'CROSS_SOURCE_MISMATCH');
  return Object.freeze({
    schema:DB00_PUBLIC_SOURCES_SCHEMA,
    snapshotId:database.snapshotId,database,joined,acquisition,guide,
    guideQuestTargets,
    hasPrivateGameSource:false as const,
    currentAvailabilityVerified:false as const,
    playerOwnershipVerified:false as const,
    getItem:(id:string|number)=>joined.getItem(id),
    getItems:(ids:readonly (string|number)[])=>joined.getItems(ids),
    searchItems:search.searchItems,
    queryItems:(filters:readonly SharedDbFilter[]=[],
      page:Readonly<{offset?:number;limit?:number}>={})=>
      database.queryItems(filters,page),
    summarizeFacet:(request:SharedDbFacetRequest,filters:readonly SharedDbFilter[]=[])=>
      database.summarizeFacet(request,filters)
  });
}
