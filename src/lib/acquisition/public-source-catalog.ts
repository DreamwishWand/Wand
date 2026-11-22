/**
 * DB-02 public-only, source-pinned Item ID origin lookup for Wand services.
 *
 * Unlike the full SRC-02 archive view, this consumer works on GitHub Pages
 * without selecting any owner-private file. It composes existing DB-00,
 * DB-03 Star Path, DB-03 Quest rewards and DB-02 published online-name
 * readers. Parsing, source hash validation and origin semantics remain owned
 * by their existing modules.
 *
 * Online name equality and community-reported Premium Shop appearances are
 * separately labelled candidates, NOT ItemOrigin relations or native offers.
 */
import {loadCurrentGameDatabase} from '../game-db/client.ts';
import {loadPinnedPublicQuestAcquisition,
  type PublicQuestAcquisitionIndex} from '../guide/public-quest-acquisition.ts';
import {loadUnifiedAcquisitionOriginDatabase,
  type OriginDatabase,type ItemOrigin,type OfficialCampaign} from './origins.ts';
import {currentDb00ItemIds} from './current-catalog.ts';
import {joinDb02OriginsWithDb00,
  type Db00PublishedSnapshot,type Db00OriginJoin} from './db00-origins.ts';
import {historicalPremiumShop} from './premium-shop-history.ts';
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
  readonly combinedSourceRoutes:462;
  readonly publicNameOnlyCandidateRelations:number;
  readonly distinctNameOnlyCandidateItemIds:number;
  readonly verifiedOnlineNameAcquisitionLinks:0;
  readonly liveOfferAvailabilityVerified:false;
  readonly sourceCoverageComplete:false;
  readonly requiresPrivateGameArchive:false;
}
export type PublicSourceItemLookup=ReturnType<Db00OriginJoin['lookup']>&{
  readonly onlineNameCandidates:readonly PublicOnlineNameCandidate[];
  readonly originCoverageComplete:false;
};
export interface PublicSourceCatalog{
  readonly schema:typeof DB02_PUBLIC_SOURCE_CATALOG_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly source:'sha_pinned_public_db00_starpath_quest_and_official_records';
  readonly origins:OriginDatabase;
  readonly db00:Db00OriginJoin;
  readonly nameCandidates:PublicOnlineNameCandidateIndex;
  readonly questSource:PublicQuestAcquisitionIndex;
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
  const [rawDb00,questSource]=await Promise.all([
    loadCurrentGameDatabase(basePath,fetcher),
    loadPinnedPublicQuestAcquisition(basePath,fetcher)
  ]);
  ensure(rawDb00.kind==='db_snapshot','CURRENT_DB00_REQUIRED');
  const db00Snapshot=rawDb00 as Db00PublishedSnapshot;
  const ids=currentDb00ItemIds(db00Snapshot);
  ensure(ids.length===13202,'DB00_ITEM_CENSUS');
  const origins=await loadUnifiedAcquisitionOriginDatabase(
    fetcher,null,basePath,[],null,questSource
  );
  const db00=joinDb02OriginsWithDb00(db00Snapshot,origins);
  const nameCandidates=indexPublicOnlineNameCandidates(
    db00Snapshot,origins.listCampaigns(),historicalPremiumShop.offers
  );
  const originCoverage=origins.getCoverage();
  const joined=db00.getCoverage();
  ensure(questSource.coverage.totalItemOriginCandidates===395&&
    originCoverage.linkedRoutes===462&&
    originCoverage.linkedRoutes-questSource.origins.length===67&&
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
    combinedSourceRoutes:462 as const,
    publicNameOnlyCandidateRelations:nameCandidates.coverage.totalCandidateRelations,
    distinctNameOnlyCandidateItemIds:nameCandidates.coverage.distinctCandidateItemIds,
    verifiedOnlineNameAcquisitionLinks:0 as const,
    liveOfferAvailabilityVerified:false as const,
    sourceCoverageComplete:false as const,
    requiresPrivateGameArchive:false as const
  });
  return Object.freeze({
    schema:DB02_PUBLIC_SOURCE_CATALOG_SCHEMA,
    gameVersion:'1.26.2' as const,
    source:'sha_pinned_public_db00_starpath_quest_and_official_records' as const,
    origins,db00,nameCandidates,questSource,coverage,
    lookup(itemId:string|number){
      // db00.lookup validates IDs and keeps extra-ItemList Quest/Currency IDs.
      const row=db00.lookup(itemId);
      return Object.freeze({
        ...row,
        onlineNameCandidates:nameCandidates.getItemCandidates(row.itemId),
        originCoverageComplete:false as const
      });
    },
    getSourceOrigin(originId:string){return origins.getOrigin(originId);},
    getCampaign(campaignId:string){return origins.getCampaign(campaignId);}
  });
}
