/** DB-01 read-only cross-service Star Path Item-ID filters.
 *
 * The DB-03 pinned v1.26.2 LiveOps snapshot establishes a *configured reward
 * occurrence*. DB-02 independently records any number of acquisition routes
 * including Premium Shop reissues. These are distinct source relationships:
 * never overwrite either, invent a purchase, or treat a season as completed.
 */
import {STARPATH_SOURCE_SHA,STARPATH_PUBLIC_SHA} from '../guide/public-starpath.mjs';
import type {
  GuideRewardIndex,GuideStarpathSeason,GuideItemRelation,
} from '../guide/reward-relations.ts';
import type {ItemOrigin,OriginDatabase} from '../acquisition/origins.ts';
import type {Db01CatalogClient,Db01Item} from './index.ts';

export const DB01_STARPATH_ORIGIN_QUERY='wand.db01.starpath-item-origin-query@1' as const;

export interface Db01StarpathOriginItem{
  readonly itemId:number;
  readonly originalDefinition:Readonly<Db01Item>|null;
  /** All source roles including premium-access currency, never reclassified as rewards. */
  readonly starpathSourceRelations:readonly Readonly<GuideItemRelation>[];
  /** Null = DB-02 not connected. [] = DB-02 connected with no confirmed route. */
  readonly otherAcquisitionRoutes:readonly Readonly<ItemOrigin>[]|null;
  readonly historicalOriginsComplete:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly shopReissueItemIdLinkVerifiedByThisQuery:false;
}
export interface Db01SeasonQueryOptions{
  readonly includeVaultAlternativeCandidates?:boolean;
  /** Applies only to current definitions; source IDs lacking DB-01 remain visible without it. */
  readonly nativeCategories?:readonly string[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db01SeasonSourcePage{
  readonly season:Readonly<GuideStarpathSeason>;
  readonly itemIds:readonly number[];
  readonly items:readonly Readonly<Db01StarpathOriginItem>[];
  readonly total:number;
  readonly hasMore:boolean;
  readonly includeVaultAlternativeCandidates:boolean;
  readonly configuredRewardSourceOnly:true;
  readonly historicalSeasonCatalogComplete:false;
  readonly premiumShopReissueHistoryComplete:false;
  readonly currentAvailabilityVerified:false;
}
export interface Db01StarpathOriginClient{
  readonly contract:typeof DB01_STARPATH_ORIGIN_QUERY;
  readonly source:Readonly<{
    gameVersion:string;
    sourceItemsSha256:string;
    originalLiveopsSha256:string;
    originalPublicProjectionSha256:string;
    starpathSeasons:number;
    historicalSeasonCatalogComplete:false;
    premiumShopOriginsComplete:false;
  }>;
  getSeasons():readonly Readonly<GuideStarpathSeason>[];
  getItem(itemId:number):Promise<Readonly<Db01StarpathOriginItem>|null>;
  querySeason(seasonId:string,options?:Db01SeasonQueryOptions):
    Promise<Readonly<Db01SeasonSourcePage>>;
}
const goodId=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
const nonneg=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const word=(value:unknown):value is string=>
  typeof value==='string'&&/^[A-Za-z][A-Za-z0-9]*$/.test(value);
function require(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB01_STARPATH_ORIGIN_'+code);
}
function idsFor(
  guide:GuideRewardIndex,seasonId:string,
  alternatives:boolean
):readonly number[]{
  return Object.freeze(guide.itemIds.map(raw=>{
    const n=Number(raw);
    require(goodId(n)&&String(n)===raw,'SOURCE_ITEM_ID');
    return n;
  }).filter(id=>
    guide.getItemRelations(id).some(relation=>
      relation.seasonId===seasonId&&
      (relation.role==='configured_reward'||
       (alternatives&&relation.role==='vault_alternative_candidate'))
    )));
}
export function createDb01StarpathOriginClient(
  catalog:Db01CatalogClient,
  guide:GuideRewardIndex,
  origins?:OriginDatabase,
):Db01StarpathOriginClient{
  const source=catalog?.source;
  require(source?.privateOnly===true&&
    source.platform==='Steam'&&source.fullCorpusParsed===true&&
    typeof catalog.getItem==='function'&&
    typeof catalog.getItems==='function'&&
    guide?.contract==='wand.db03.reward-relations@1'&&
    guide.evidence?.platform==='Steam'&&
    guide.evidence.gameVersion===source.gameVersion&&
    guide.evidence.integrity==='pinned_public_sha256'&&
    guide.evidence.liveopsSourceSha256===STARPATH_SOURCE_SHA&&
    guide.evidence.publicProjectionSha256===STARPATH_PUBLIC_SHA&&
    guide.coverage?.historicalSeasonCatalogComplete===false&&
    guide.coverage.knownSeasonCount===guide.seasons?.length&&
    guide.coverage.knownSeasonCount>0&&
    Array.isArray(guide.itemIds)&&
    typeof guide.getItemRelations==='function'&&
    typeof guide.getSeason==='function',
    'SOURCE_VERSION_OR_LIVEOPS_INTEGRITY');
  if(origins){
    require(origins.schema==='wand.db02.item-origins@1'&&
      origins.originCoverageComplete===false&&
      typeof origins.getItem==='function','DB02_ORIGIN_CONTRACT');
  }
  const seasons=Object.freeze([...guide.seasons]);
  const known=new Map<string,Readonly<GuideStarpathSeason>>();
  for(const row of seasons){
    require(typeof row.id==='string'&&row.id.length>0&&
      !known.has(row.id),'DUPLICATE_OR_EMPTY_SEASON');
    known.set(row.id,row);
  }
  // Validate every source relation against an actual pinned DB-03 season,
  // including alternative Vault IDs and premium access currency references.
  for(const raw of guide.itemIds){
    const number=Number(raw);
    require(goodId(number)&&String(number)===raw,'MALFORMED_SOURCE_ID');
    for(const relation of guide.getItemRelations(raw)){
      require(relation.itemId===raw&&known.has(relation.seasonId)&&
        (relation.role==='configured_reward'||
         relation.role==='vault_alternative_candidate'||
         relation.role==='premium_access_currency')&&
        relation.configuredRewardOnly===true&&
        relation.guaranteedGrant===false&&
        relation.currentAvailabilityVerified===false&&
        relation.playerOwnershipVerified===false,
        'SOURCE_RELATION_PROVENANCE');
    }
  }
  const descriptor=Object.freeze({
    gameVersion:source.gameVersion,sourceItemsSha256:source.sourceItemsSha256,
    originalLiveopsSha256:guide.evidence.liveopsSourceSha256,
    originalPublicProjectionSha256:guide.evidence.publicProjectionSha256,
    starpathSeasons:seasons.length,
    historicalSeasonCatalogComplete:false as const,
    premiumShopOriginsComplete:false as const,
  });
  function assemble(itemId:number,definition:Readonly<Db01Item>|null){
    const relatives=guide.getItemRelations(itemId);
    const stored=origins?.getItem(itemId);
    require(stored===undefined||
      (stored.itemId===String(itemId)&&
       stored.originCoverageComplete===false&&
       Array.isArray(stored.origins)&&
       stored.origins.every(row=>row.itemId===String(itemId))),
      'DB02_ITEM_RELATION');
    const routes=stored===undefined?null:Object.freeze([...stored.origins]);
    if(!definition&&!relatives.length&&(!routes||!routes.length))
      return null;
    return Object.freeze({
      itemId,originalDefinition:definition,
      starpathSourceRelations:Object.freeze([...relatives]),
      otherAcquisitionRoutes:routes,
      historicalOriginsComplete:false as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      shopReissueItemIdLinkVerifiedByThisQuery:false as const,
    });
  }
  async function getItem(itemId:number){
    require(goodId(itemId),'ITEM_ID');
    return assemble(itemId,await catalog.getItem(itemId));
  }
  async function querySeason(
    seasonId:string,options:Db01SeasonQueryOptions={},
  ):Promise<Readonly<Db01SeasonSourcePage>>{
    require(typeof seasonId==='string'&&known.has(seasonId),'UNKNOWN_SEASON');
    require(options!==null&&typeof options==='object'&&
      !Array.isArray(options),'QUERY_OPTIONS');
    const alternatives=options.includeVaultAlternativeCandidates??false;
    require(typeof alternatives==='boolean','VAULT_ALTERNATIVE_FLAG');
    const categories=options.nativeCategories??[];
    require(Array.isArray(categories)&&categories.length<=64&&
      categories.every(word),'NATIVE_CLASS_SELECTION');
    const offset=options.offset??0,limit=options.limit??100;
    require(nonneg(offset)&&offset<=1_000_000&&nonneg(limit)&&limit<=1000,
      'QUERY_PAGING');
    const ids=idsFor(guide,seasonId,alternatives);
    // Do not collapse repeated reward *occurrences*: each returned Item ID
    // still carries every separate source slot in starpathSourceRelations.
    // Catalog validation also preserves missing source-reward IDs rather than
    // silently dropping them from the season.
    const definitions:(Readonly<Db01Item>|null)[]=[];
    for(let start=0;start<ids.length;start+=4096){
      const batch=ids.slice(start,start+4096);
      const records=await catalog.getItems(batch);
      require(records.length===batch.length,'CURRENT_DEFINITION_BATCH');
      definitions.push(...records);
    }
    require(definitions.length===ids.length,'CURRENT_DEFINITION_COVERAGE');
    const allowed=new Set(categories);
    const filtered=ids.map((id,i)=>({
      id,definition:definitions[i],
    })).filter(row=>!allowed.size||
      (row.definition!==null&&allowed.has(row.definition.nativeCategory)));
    const selected=filtered.slice(offset,offset+limit);
    const results=selected.map(row=>assemble(row.id,row.definition));
    require(results.every(Boolean),'MISSING_SEASON_LINK');
    return Object.freeze({
      season:known.get(seasonId)!,
      itemIds:Object.freeze(selected.map(row=>row.id)),
      items:Object.freeze(results as Readonly<Db01StarpathOriginItem>[]),
      total:filtered.length,hasMore:offset+selected.length<filtered.length,
      includeVaultAlternativeCandidates:alternatives,
      configuredRewardSourceOnly:true as const,
      historicalSeasonCatalogComplete:false as const,
      premiumShopReissueHistoryComplete:false as const,
      currentAvailabilityVerified:false as const,
    });
  }
  return Object.freeze({
    contract:DB01_STARPATH_ORIGIN_QUERY,source:descriptor,
    getSeasons:()=>seasons,getItem,querySeason,
  });
}
