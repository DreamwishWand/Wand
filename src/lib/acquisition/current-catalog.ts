/**
 * DB-02 full Item ID origin catalog for the exact, SHA-authenticated public
 * Steam v1.26.2 DB-00 release plus owner-local SHA-authenticated SRC-02 r5.
 *
 * No owner-private original game bytes are fetched, uploaded or published.
 * loadCurrentGameDatabase() independently hashes every DB-00 shard.
 * loadVerifiedSrc02OriginReader() independently hashes the supplied local r5 ZIP.
 * DB-03 owns optional private reward evidence verification.
 */
import {loadCurrentGameDatabase} from '../game-db/client.ts';
import {
  loadVerifiedSrc02OriginReader,
  type VerifiedSrc02OriginReader
} from './native-origins.ts';
import type {Src02IndependentPin} from './private-browser-bundle.mjs';
import {
  loadUnifiedAcquisitionOriginDatabase,
  type OriginDatabase
} from './origins.ts';
import {
  joinDb02OriginsWithDb00,
  type Db00PublishedSnapshot,type Db00OriginJoin
} from './db00-origins.ts';
import type {Db03NativeRewardCandidateIndex} from './db03-native-rewards.ts';
import {
  indexNativeLootSourceFamilies,
  type NativeLootSourceIndex
} from './native-loot-source-families.ts';
import {
  loadMissionLootQuestCandidates,
  type MissionLootQuestIndex
} from './mission-loot-quest-candidates.ts';
import type {PrivateQuestAcquisitionView} from './quest-item-bridge.mjs';
import {
  nativeLootObjectReferenceIndex,
  type NativeLootObjectReferenceIndex,
  type ItemLootObjectCandidate
} from './native-loot-object-references.ts';

export const DB02_CURRENT_CATALOG_SCHEMA='wand.db02.current-db00-origins@1' as const;
const RELEASE='steam-1.26.2-native-itemlist-v1';
const SOURCE_SHA='496782625e68fb53e018659bbabf0d8bb8bdc55f12037f4c568a7d32321f515b';
const ID=/^[1-9][0-9]{0,15}$/;
const DB00_SIZE=13202;

export interface CurrentDb02CatalogCoverage{
  readonly publishedDb00ItemIds:13202;
  readonly nativeItemIdsRequested:13202;
  readonly linkedPublishedItemIds:number;
  readonly linkedOutsidePublishedItemIds:number;
  readonly allLinkedItemIds:number;
  readonly allLinkedRoutes:number;
  readonly src02CatalogOrigins:number;
  readonly src02ConfirmedDefinitionLinks:number;
  readonly src02StaticCandidates:number;
  readonly src02LootContextCandidates:number;
  readonly nativeLootSourceFamilies:number;
  readonly nativeObjectLootTableReferences:375;
  readonly distinctNativeObjectReferencedLootTables:295;
  readonly distinctNativeLootTables:number;
  readonly src02StallSlotCandidates:number;
  readonly publicStarpathSourceLinks:number;
  readonly originCoverageComplete:false;
  readonly liveOfferAvailabilityVerified:false;
  readonly lootContextVerified:false;
  readonly privateSourcePublished:false;
}
export interface CurrentDb02OriginCatalog{
  readonly schema:typeof DB02_CURRENT_CATALOG_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly source:'verified_public_db00_and_local_private_src02_r5';
  readonly origins:OriginDatabase;
  readonly db00:Db00OriginJoin;
  /** Raw original LootTable.nameKey grouping (not a confirmed acquisition place). */
  readonly lootSources:NativeLootSourceIndex;
  /** 375 exact ActivityItem/Furniture field references, not verified drops. */
  readonly lootObjectSources:NativeLootObjectReferenceIndex;
  getItemPotentialLootObjects(itemId:string|number):readonly ItemLootObjectCandidate[];
  readonly coverage:CurrentDb02CatalogCoverage;
  /** Lazy public Guide join; no extra transfer until Guide/Collection asks. */
  loadMissionLootQuestIndex(
    fetcher?:typeof fetch,basePath?:string,
    questRefs?:PrivateQuestAcquisitionView|null
  ):Promise<MissionLootQuestIndex>;
  lookup(itemId:string|number):ReturnType<Db00OriginJoin['lookup']>;
}

/** Structural scope check; DOES NOT authenticate files by itself. */
export function currentDb00ItemIds(snapshot:Db00PublishedSnapshot):readonly string[]{
  if(!snapshot||snapshot.kind!=='db_snapshot'||snapshot.id!==RELEASE||
    snapshot.target?.platform!=='Steam'||
    snapshot.target.gameVersion!=='1.26.2'||
    snapshot.target.sourceSha256!==SOURCE_SHA||
    snapshot.coverage?.scope!=='steam-v1.26.2-native-itemlist'||
    snapshot.coverage.complete!==true||
    !Array.isArray(snapshot.items)||snapshot.items.length!==DB00_SIZE)
    throw new TypeError('DB02_CURRENT_CATALOG_EXACT_DB00_RELEASE_REQUIRED');
  const ids:string[]=[];
  const seen=new Set<string>();
  for(const item of snapshot.items){
    const key=item?.id;
    if(typeof key!=='string'||!ID.test(key)||
      !Number.isSafeInteger(Number(key))||seen.has(key))
      throw new TypeError('DB02_CURRENT_CATALOG_INVALID_OR_DUPLICATE_ITEM_ID');
    seen.add(key);
    ids.push(key);
  }
  return Object.freeze(ids);
}

function coverageSummary(
  ids:readonly string[],
  origins:OriginDatabase,
  db00:Db00OriginJoin,
  lootSources:NativeLootSourceIndex
):CurrentDb02CatalogCoverage{
  const joined=db00.getCoverage();
  let native=0,confirmed=0,candidates=0,loot=0,stalls=0,starpaths=0;
  // Count every published item origin once. The publicly known Star Path
  // rewards outside DB-00's ItemList are still queryable through origins.
  for(const item of ids){
    for(const route of origins.getItem(item).origins){
      if(route.source.sourceId==='src02:steam-1262:r5'){
        native++;
        if(route.routeStatus==='confirmed_source_link')confirmed++;
        else candidates++;
        if(route.nativeDetails?.family==='loot_table_candidate')loot++;
        if(route.nativeDetails?.family==='static_stall_candidate')stalls++;
      }
      if(route.source.kind==='verified_liveops_cache' &&
        route.originId.startsWith('starpath:'))starpaths++;
    }
  }
  const all=origins.getCoverage();
  return Object.freeze({
    publishedDb00ItemIds:DB00_SIZE as 13202,
    nativeItemIdsRequested:DB00_SIZE as 13202,
    linkedPublishedItemIds:joined.linkedDb00Items,
    linkedOutsidePublishedItemIds:joined.linkedOutsideDb00Items,
    allLinkedItemIds:all.linkedItemIds,
    allLinkedRoutes:all.linkedRoutes,
    src02CatalogOrigins:native,
    src02ConfirmedDefinitionLinks:confirmed,
    src02StaticCandidates:candidates,
    src02LootContextCandidates:loot,
    nativeLootSourceFamilies:lootSources.coverage.sourceFamilies,
    nativeObjectLootTableReferences:375,
    distinctNativeObjectReferencedLootTables:295,
    distinctNativeLootTables:lootSources.coverage.nativeLootTableIds,
    src02StallSlotCandidates:stalls,
    publicStarpathSourceLinks:starpaths,
    originCoverageComplete:false as const,
    liveOfferAvailabilityVerified:false as const,
    lootContextVerified:false as const,
    privateSourcePublished:false as const
  });
}

/**
 * Join an already SHA-checked DB-00 snapshot and an authenticated local SRC-02
 * reader. This function never fetches additional Item IDs or modifies DB-00.
 * The nested DB-00 join retains out-of-ItemList rewards separately.
 */
export async function joinCurrentDb02Catalog(
  db00:Db00PublishedSnapshot,
  src02:VerifiedSrc02OriginReader,
  fetcher:typeof fetch=fetch,
  basePath='',
  db03NativeRewards:Db03NativeRewardCandidateIndex|null=null
):Promise<CurrentDb02OriginCatalog>{
  const ids=currentDb00ItemIds(db00);
  const origins=await loadUnifiedAcquisitionOriginDatabase(
    fetcher,src02,basePath,ids,db03NativeRewards
  );
  const joined=joinDb02OriginsWithDb00(db00,origins);
  const lootSources=indexNativeLootSourceFamilies(origins,ids);
  const coverage=coverageSummary(ids,origins,joined,lootSources);
  if(coverage.src02LootContextCandidates!==lootSources.coverage.candidateRoutes)
    throw new TypeError('DB02_CURRENT_CATALOG_LOOT_SOURCE_INDEX_MISMATCH');
  return Object.freeze({
    schema:DB02_CURRENT_CATALOG_SCHEMA,
    gameVersion:'1.26.2' as const,
    source:'verified_public_db00_and_local_private_src02_r5' as const,
    origins,db00:joined,lootSources,coverage,
    lootObjectSources:nativeLootObjectReferenceIndex,
    getItemPotentialLootObjects(itemId:string|number){
      return nativeLootObjectReferenceIndex.getItemPotentialObjectSources(
        itemId,lootSources);
    },
    loadMissionLootQuestIndex(
      questFetcher:typeof fetch=fetch,questBasePath=basePath,
      refs:PrivateQuestAcquisitionView|null=null
    ){return loadMissionLootQuestCandidates(lootSources,questBasePath,questFetcher,refs);},
    lookup(itemId:string|number){return joined.lookup(itemId);}
  });
}

/**
 * Browser entrypoint. Accept a user-selected original SRC-02 archive; never
 * auto-fetch it. Public DB-00 and DB-03 static Star Path bytes are independently
 * checked by their existing first-party loaders.
 */
export async function loadCurrentDb02OriginCatalog(
  localSrc02Archive:Uint8Array,
  independentPins:Src02IndependentPin,
  basePath='',
  fetcher:typeof fetch=fetch,
  db03NativeRewards:Db03NativeRewardCandidateIndex|null=null
):Promise<CurrentDb02OriginCatalog>{
  const [snapshot,reader]=await Promise.all([
    loadCurrentGameDatabase(basePath,fetcher),
    loadVerifiedSrc02OriginReader(localSrc02Archive,independentPins)
  ]);
  if(snapshot.kind!=='db_snapshot')
    throw new TypeError('DB02_CURRENT_CATALOG_LEGACY_COLLECTION_NOT_SUPPORTED');
  // DB-00 target gameVersion is nullable in its cross-release transport type.
  // Only this exact versioned snapshot is admitted to the r5 native join.
  const typed=snapshot as Db00PublishedSnapshot;
  currentDb00ItemIds(typed);
  return joinCurrentDb02Catalog(typed,reader,fetcher,basePath,db03NativeRewards);
}
