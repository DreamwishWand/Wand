/**
 * Public-only, cross-service Item ID search across current verified names,
 * configured acquisition origins, and configured Star Path rewards.
 *
 * Uses the existing DB-00, DB-02, DB-03 readers; no private source parsing,
 * inferred game UI taxonomy, current shop stock or player ownership claims.
 * Name-only online campaign candidates intentionally never enter the origin
 * filter: an exact native Item ID link is required.
 */
import type {
  SharedGameDatabase,SharedDbItem,DbLocale
} from './integrated.ts';
import type {
  Db00SourceJoinedReader,Db00SourceJoinedItem
} from './source-join.ts';
import type {
  OriginDatabase,OriginKind,RouteStatus
} from '../acquisition/origins.ts';
import type {GuideRewardIndex} from '../guide/reward-relations.ts';

export const DB00_PUBLIC_SEARCH_CONTRACT='wand.game-db.public-item-search@1' as const;

export interface Db00PublicItemSearchRequest {
  /** Exact current published locale; there is no guessed translation fallback. */
  readonly locale?:DbLocale;
  /** Current exact localized name substring OR numeric Item ID prefix. */
  readonly text?:string;
  /** OR across native ItemOrigin kinds; no online name-only candidate links. */
  readonly originKinds?:readonly OriginKind[];
  /** With or without originKinds, restrict to this source route evidence level. */
  readonly routeStatus?:RouteStatus;
  /** Exact pinned DB-03 configured reward links (excludes Vault alternatives and access currency). */
  readonly starPathSeasonId?:string;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00PublicItemSearchResult {
  readonly scope:'current_published_itemlist';
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00SourceJoinedItem[];
  /** Match count is within the 13,202 published native Items, not all game definitions. */
  readonly sourceCoverageComplete:false;
  readonly liveAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00PublicItemSearch {
  readonly contract:typeof DB00_PUBLIC_SEARCH_CONTRACT;
  searchItems(request?:Db00PublicItemSearchRequest):Db00PublicItemSearchResult;
}
const LOCALES=new Set<string>([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
const SHA=/^[1-9][0-9]{0,15}$/;
const ROUTES=new Set<string>(['confirmed_source_link','static_candidate_only']);
const ORIGIN_NAME=/^[a-z][a-z_]{1,31}$/;
interface SearchEntry {
  readonly itemId:string;
  readonly names:Readonly<Partial<Record<DbLocale,string>>>;
  readonly originKinds:ReadonlySet<OriginKind>;
  readonly originStatuses:ReadonlyMap<OriginKind,ReadonlySet<RouteStatus>>;
  readonly seasonIds:ReadonlySet<string>;
}
function assert(ok:unknown,code:string):asserts ok {
  if(!ok)throw new TypeError('DB00_PUBLIC_SEARCH_'+code);
}
function normalize(text:string):string {
  return text.normalize('NFKC').toLocaleLowerCase().trim();
}
/**
 * Index only already SHA-verified public data. Index lifetime is scoped to
 * this specific active snapshot, not shared between releases or browser tabs.
 */
export function createDb00PublicItemSearch(
  database:SharedGameDatabase,
  joined:Db00SourceJoinedReader,
  origins:OriginDatabase,
  guide:GuideRewardIndex
):Db00PublicItemSearch {
  assert(database?.contract==='wand.game-db.shared@1' &&
    database.itemCount===13202 &&
    joined?.contract==='wand.game-db.source-join@1' &&
    joined.snapshotId===database.snapshotId &&
    origins?.schema==='wand.db02.item-origins@1' &&
    origins.originCoverageComplete===false &&
    guide?.contract==='wand.db03.reward-relations@1' &&
    guide.evidence.integrity==='pinned_public_sha256' &&
    guide.evidence.gameVersion===database.target.gameVersion &&
    guide.coverage.currentAvailabilityVerified===false &&
    guide.coverage.playerProgressIncluded===false,
    'EXACT_CURRENT_PUBLIC_SOURCES_REQUIRED');
  let index:readonly SearchEntry[]|null=null;
  const prepare=():readonly SearchEntry[]=>{
    if(index)return index;
    const entries:SearchEntry[]=[];
    const seen=new Set<string>();
    for(let offset=0;offset<database.itemCount;offset+=500){
      const page=database.queryItems([],{offset,limit:500});
      assert(page.total===database.itemCount &&
        page.offset===offset && page.items.length>0,'PUBLISHED_INDEX_PAGINATION');
      for(const item of page.items){
        assert(!seen.has(item.id) && SHA.test(item.id),
          'DUPLICATE_OR_INVALID_ITEM_ID');
        seen.add(item.id);
        const source=origins.getItem(item.id);
        assert(source.itemId===item.id && source.originCoverageComplete===false,
          'ORIGIN_ID_MISMATCH');
        const statuses=new Map<OriginKind,Set<RouteStatus>>();
        for(const row of source.origins){
          assert(row.itemId===item.id && row.availability==='not_live_verified' &&
            ROUTES.has(row.routeStatus),'UNVERIFIED_ORIGIN_RELATION');
          const list=statuses.get(row.kind)??new Set<RouteStatus>();
          list.add(row.routeStatus);
          statuses.set(row.kind,list);
        }
        const rewardRelations=guide.getItemAcquisitionCandidates(item.id);
        assert(rewardRelations.every(relation=>
          relation.itemId===item.id &&
          relation.role==='configured_reward' &&
          relation.configuredRewardOnly===true &&
          relation.currentAvailabilityVerified===false &&
          relation.playerOwnershipVerified===false),
          'UNVERIFIED_STARPATH_RELATION');
        const seasons=new Set(rewardRelations.map(relation=>relation.seasonId));
        entries.push(Object.freeze({
          itemId:item.id,
          names:Object.freeze({...item.names}),
          originKinds:new Set(statuses.keys()),
          originStatuses:statuses,
          seasonIds:seasons
        }));
      }
    }
    assert(entries.length===database.itemCount,'PUBLISHED_INDEX_INCOMPLETE');
    index=Object.freeze(entries);
    return index;
  };
  function searchItems(request:Db00PublicItemSearchRequest={}):Db00PublicItemSearchResult{
    assert(request!==null && typeof request==='object' &&
      !Array.isArray(request),'INVALID_SEARCH_REQUEST');
    const locale=request.locale??'en';
    assert(typeof locale==='string' && LOCALES.has(locale),'INVALID_LOCALE');
    const raw=request.text??'';
    assert(typeof raw==='string' && raw.length<=120 && !/[\x00-\x1f]/.test(raw),
      'INVALID_SEARCH_TEXT');
    const text=normalize(raw);
    const kinds=request.originKinds;
    assert(kinds===undefined ||
      Array.isArray(kinds)&&kinds.length>0&&kinds.length<=12 &&
      kinds.every(kind=>typeof kind==='string' && ORIGIN_NAME.test(kind))&&
      new Set(kinds).size===kinds.length,'INVALID_ORIGIN_KINDS');
    const status=request.routeStatus;
    assert(status===undefined || ROUTES.has(status),'INVALID_ROUTE_STATUS');
    const season=request.starPathSeasonId;
    assert(season===undefined||
      typeof season==='string'&&season.length>0&&season.length<=128&&
      /^[A-Za-z][A-Za-z0-9_-]*$/.test(season),'INVALID_SEASON_ID');
    const offset=request.offset??0,limit=request.limit??100;
    assert(Number.isSafeInteger(offset)&&offset>=0 &&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,'INVALID_SEARCH_PAGE');
    // A valid but unknown season produces zero results; it never means that
    // no other seasons or rewards exist beyond the pinned 1.26.2 source scope.
    const hasKnownSeason=season===undefined||guide.getSeason(season)!==null;
    const matches:string[]=[];
    if(hasKnownSeason){
      for(const item of prepare()){
        if(text && !(item.itemId.startsWith(text) ||
          (item.names[locale]!==undefined &&
            normalize(item.names[locale]!).includes(text))))continue;
        if(season && !item.seasonIds.has(season))continue;
        if(kinds){
          if(!kinds.some(kind=>
            status?item.originStatuses.get(kind)?.has(status):
              item.originKinds.has(kind)))continue;
        }else if(status &&
          ![...item.originStatuses.values()].some(value=>value.has(status)))continue;
        matches.push(item.itemId);
      }
    }
    const selected=matches.slice(offset,offset+limit);
    const items=joined.getItems(selected);
    assert(items.every((item,i)=>item.itemId===selected[i] &&
      item.catalogStatus==='current_published_item'),'SOURCE_JOIN_ID_CONFLICT');
    const next=offset+selected.length;
    return Object.freeze({
      scope:'current_published_itemlist' as const,
      snapshotId:database.snapshotId,
      total:matches.length,offset,nextOffset:next<matches.length?next:null,
      items:Object.freeze([...items]),
      sourceCoverageComplete:false as const,
      liveAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const
    });
  }
  return Object.freeze({contract:DB00_PUBLIC_SEARCH_CONTRACT,searchItems});
}
