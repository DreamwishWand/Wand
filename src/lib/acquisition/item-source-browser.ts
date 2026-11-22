/**
 * Browser-ready inverse Item ID acquisition search for Collection, Gallery,
 * Guide and Save Editor. No save bytes or private source files are loaded here.
 *
 * Only known ItemOrigin rows are indexed. Lack of a row means "unknown",
 * NEVER "unobtainable". Official Twitch / redeem name-only candidates belong
 * to the separate public-online-name-candidates reader.
 *
 * Filters are applied to the SAME origin relation, avoiding false positives
 * from different sources on the same Item ID. Route status is preserved.
 */
import type {
  OriginDatabase,ItemOrigin,OriginKind,RouteStatus,
  SourceKind,AccessTier
} from './origins.ts';
import {ORIGIN_SCHEMA} from './origins.ts';

export const DB02_ITEM_SOURCE_BROWSER_SCHEMA='wand.db02.item-source-browser@1' as const;
const ID=/^[1-9][0-9]{0,15}$/;
const SAFE_KEY=/^[a-zA-Z0-9][a-zA-Z0-9:._\/-]{0,127}$/;
const KINDS:readonly OriginKind[]=Object.freeze([
  'crafting','cooking','fishing','mining','timebending','foraging','farming',
  'loot','game_shop','quest_reward','event_reward','friendship_reward',
  'star_path_free','star_path_premium','star_path_vault','twitch_drop',
  'redeem_code','premium_shop','official_campaign','purchase_bonus','gift','other'
]);
const STATUSES:readonly RouteStatus[]=Object.freeze([
  'confirmed_source_link','static_candidate_only'
]);
const SOURCE_KINDS:readonly SourceKind[]=Object.freeze([
  'verified_liveops_cache','verified_game_native','official_publication',
  'verified_sale_snapshot','unhashed_structural_candidate'
]);
const TIERS:readonly AccessTier[]=Object.freeze(['free','premium','not_applicable']);
const EMPTY_ORIGINS=Object.freeze([]) as readonly ItemOrigin[];
const EMPTY_IDS=Object.freeze([]) as readonly string[];

export interface ItemSourceFilter{
  /** OR within a dimension, AND across dimensions, all against one row. */
  readonly kinds?:readonly OriginKind[];
  readonly routeStatuses?:readonly RouteStatus[];
  readonly sourceKinds?:readonly SourceKind[];
  readonly sourceIds?:readonly string[];
  readonly campaignIds?:readonly string[];
  readonly accessTiers?:readonly AccessTier[];
  /** Null selects unknown source build (e.g. July Shop); absence means any. */
  readonly gameVersion?:string|null;
}
export interface ItemSourceBrowserRow{
  readonly itemId:string;
  /** Only relations matching every supplied filter. */
  readonly origins:readonly ItemOrigin[];
  readonly confirmedSourceLinks:readonly ItemOrigin[];
  readonly staticCandidates:readonly ItemOrigin[];
  readonly availabilityVerified:false;
}
export interface ItemSourceBrowserResult{
  readonly items:readonly ItemSourceBrowserRow[];
  readonly offset:number;
  readonly limit:number;
  readonly totalItemIds:number;
  readonly totalOriginRelations:number;
  readonly hasMore:boolean;
  readonly originCoverageComplete:false;
  readonly liveAvailabilityVerified:false;
  readonly sourceEvidenceOnly:true;
}
export interface ItemSourceKindCount{
  readonly kind:OriginKind;
  readonly distinctItemIds:number;
  readonly sourceRelations:number;
  readonly confirmedSourceLinks:number;
  readonly staticCandidateRelations:number;
}
export interface ItemSourceBrowser {
  readonly schema:typeof DB02_ITEM_SOURCE_BROWSER_SCHEMA;
  readonly sourceEvidenceOnly:true;
  readonly originCoverageComplete:false;
  readonly liveAvailabilityVerified:false;
  /** Sorted Item IDs with >=1 native/published origin (not the full 13,202). */
  readonly knownLinkedItemIds:readonly string[];
  /** Includes all 22 source kinds; zero means no VERIFIED Item ID mapping. */
  readonly originKindCounts:readonly ItemSourceKindCount[];
  query(
    filter?:ItemSourceFilter,
    page?:Readonly<{offset?:number;limit?:number}>
  ):ItemSourceBrowserResult;
  getItem(itemId:string|number):ItemSourceBrowserRow;
  getKindItemIds(kind:OriginKind,status?:RouteStatus):readonly string[];
}

function assert(ok:unknown,why:string):asserts ok{
  if(!ok)throw new TypeError('DB02_ITEM_SOURCE_BROWSER_'+why);
}
function normalizeId(raw:string|number):string{
  const id=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  assert(typeof id==='string'&&ID.test(id)&&
    Number.isSafeInteger(Number(id)),'INVALID_ITEM_ID');
  return id;
}
function checkArray<T extends string>(
  values:readonly T[]|undefined,known:readonly T[]|null,
  code:string
):ReadonlySet<T>|null {
  if(values===undefined)return null;
  assert(Array.isArray(values)&&values.length<=10000,code);
  const seen=new Set<T>();
  for(const v of values){
    assert(typeof v==='string'&&(known!==null?
      known.includes(v):
      SAFE_KEY.test(v)),'INVALID_'+code);
    seen.add(v);
  }
  return seen;
}
function predicates(filter:ItemSourceFilter){
  assert(filter!==null&&typeof filter==='object'&&!Array.isArray(filter),
    'INVALID_FILTER');
  const kinds=checkArray(filter.kinds,KINDS,'KINDS');
  const statuses=checkArray(filter.routeStatuses,STATUSES,'ROUTE_STATUSES');
  const sources=checkArray(filter.sourceKinds,SOURCE_KINDS,'SOURCE_KINDS');
  const sourceIds=checkArray(filter.sourceIds,null,'SOURCE_IDS');
  const campaigns=checkArray(filter.campaignIds,null,'CAMPAIGN_IDS');
  const tiers=checkArray(filter.accessTiers,TIERS,'ACCESS_TIERS');
  if(filter.gameVersion!==undefined)
    assert(filter.gameVersion===null||
      typeof filter.gameVersion==='string'&&
      /^\d+\.\d+\.\d+$/.test(filter.gameVersion),'GAME_VERSION');
  return (origin:ItemOrigin)=>
    (kinds===null||kinds.has(origin.kind))&&
    (statuses===null||statuses.has(origin.routeStatus))&&
    (sources===null||sources.has(origin.source.kind))&&
    (sourceIds===null||sourceIds.has(origin.source.sourceId))&&
    (campaigns===null||origin.campaignId!==null&&campaigns.has(origin.campaignId))&&
    (tiers===null||tiers.has(origin.accessTier))&&
    (filter.gameVersion===undefined||
      origin.source.gameVersion===filter.gameVersion);
}
function makeRow(itemId:string,origins:readonly ItemOrigin[]):ItemSourceBrowserRow{
  return Object.freeze({
    itemId,origins:Object.freeze([...origins]),
    confirmedSourceLinks:Object.freeze(origins.filter(
      r=>r.routeStatus==='confirmed_source_link')),
    staticCandidates:Object.freeze(origins.filter(
      r=>r.routeStatus==='static_candidate_only')),
    availabilityVerified:false as const
  });
}
function checkPage(page:Readonly<{offset?:number;limit?:number}>):{
  offset:number;limit:number
}{
  assert(page!==null&&typeof page==='object'&&!Array.isArray(page),
    'INVALID_PAGE');
  const offset=page.offset??0,limit=page.limit??100;
  assert(Number.isSafeInteger(offset)&&offset>=0&&
    Number.isSafeInteger(limit)&&limit>=1&&limit<=500,'INVALID_PAGE_RANGE');
  return {offset,limit};
}

/**
 * Build once from the already authenticated/scope-checked OriginDatabase
 * supplied by DB-02. We reuse each original ItemOrigin by reference; do not
 * reconstruct a route or turn a candidate into a confirmed acquisition.
 */
export function indexItemSourceBrowser(ledger:OriginDatabase):ItemSourceBrowser{
  assert(ledger?.schema===ORIGIN_SCHEMA&&
    ledger.originCoverageComplete===false&&
    typeof ledger.listLinkedItemIds==='function'&&
    typeof ledger.getItem==='function'&&
    typeof ledger.getCoverage==='function','ORIGIN_LEDGER_REQUIRED');
  const ids=ledger.listLinkedItemIds();
  const coverage=ledger.getCoverage();
  assert(Array.isArray(ids)&&ids.length===coverage.linkedItemIds,
    'ORIGIN_ID_CENSUS');
  const byId=new Map<string,ItemSourceBrowserRow>();
  const perKind=new Map<OriginKind,{ids:Set<string>;count:number;confirmed:number;candidate:number}>();
  for(const kind of KINDS)perKind.set(kind,{
    ids:new Set(),count:0,confirmed:0,candidate:0
  });
  let relationCount=0,last=0;
  for(const raw of ids){
    const id=normalizeId(raw);
    assert(!byId.has(id)&&Number(id)>last,'SORTED_UNIQUE_IDS');
    last=Number(id);
    const source=ledger.getItem(id);
    assert(source.itemId===id&&source.originCoverageComplete===false&&
      Array.isArray(source.origins)&&source.origins.length>0,
      'ORIGIN_LEDGER_ROW');
    for(const relation of source.origins){
      assert(relation.itemId===id&&relation.availability==='not_live_verified'&&
        STATUSES.includes(relation.routeStatus)&&KINDS.includes(relation.kind),
        'ORIGIN_LEDGER_RELATION');
      const kind=perKind.get(relation.kind)!;
      kind.ids.add(id);kind.count++;
      if(relation.routeStatus==='confirmed_source_link')kind.confirmed++;
      else kind.candidate++;
    }
    relationCount+=source.origins.length;
    byId.set(id,makeRow(id,source.origins));
  }
  assert(relationCount===coverage.linkedRoutes,'ORIGIN_ROUTE_CENSUS');
  const counts=Object.freeze(KINDS.map(kind=>{
    const row=perKind.get(kind)!;
    return Object.freeze({
      kind,distinctItemIds:row.ids.size,
      sourceRelations:row.count,
      confirmedSourceLinks:row.confirmed,
      staticCandidateRelations:row.candidate
    });
  }));
  const knownLinkedItemIds=Object.freeze([...ids]);
  const itemKindCache=new Map<string,readonly string[]>();
  return Object.freeze({
    schema:DB02_ITEM_SOURCE_BROWSER_SCHEMA,
    sourceEvidenceOnly:true as const,
    originCoverageComplete:false as const,
    liveAvailabilityVerified:false as const,
    knownLinkedItemIds,originKindCounts:counts,
    getItem(raw:string|number){
      const id=normalizeId(raw);
      return byId.get(id)??makeRow(id,EMPTY_ORIGINS);
    },
    getKindItemIds(kind:OriginKind,status?:RouteStatus){
      assert(KINDS.includes(kind),'INVALID_KIND');
      assert(status===undefined||STATUSES.includes(status),'INVALID_STATUS');
      const key=kind+':'+(status??'all');
      const prior=itemKindCache.get(key);
      if(prior)return prior;
      const ids=knownLinkedItemIds.filter(id=>
        byId.get(id)!.origins.some(r=>r.kind===kind&&
          (status===undefined||r.routeStatus===status)));
      const result=ids.length?Object.freeze(ids):EMPTY_IDS;
      itemKindCache.set(key,result);
      return result;
    },
    query(filter:ItemSourceFilter={},page:Readonly<{offset?:number;limit?:number}>={}){
      const matches=predicates(filter);
      const {offset,limit}=checkPage(page);
      const matching:ItemSourceBrowserRow[]=[];
      let totalRelations=0;
      for(const id of knownLinkedItemIds){
        const row=byId.get(id)!;
        const selected=row.origins.filter(matches);
        if(selected.length===0)continue;
        totalRelations+=selected.length;
        matching.push(selected.length===row.origins.length?
          row:makeRow(id,selected));
      }
      const items=Object.freeze(matching.slice(offset,offset+limit));
      return Object.freeze({
        items,offset,limit,
        totalItemIds:matching.length,
        totalOriginRelations:totalRelations,
        hasMore:offset+items.length<matching.length,
        originCoverageComplete:false as const,
        liveAvailabilityVerified:false as const,
        sourceEvidenceOnly:true as const
      });
    }
  });
}
