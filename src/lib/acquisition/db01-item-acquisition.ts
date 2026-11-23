/**
 * Read-only, DB-01-oriented six-category Item ID mapping produced by DB-02.
 * The published v1.26.2 JSON is built from SHA-pinned original game extracts.
 *
 * A missing Item ID means UNCLASSIFIED, never unobtainable. Native broad
 * OnlineCategory hints are kept separate and may not be relabelled as a
 * Premium Shop offer, Twitch Drop, or redemption code.
 */
import {
  DB02_ACQUISITION_CATEGORY_ORDER,
  type GameNativeItemCategory
} from './game-native-item-categories.ts';

export const DB02_DB01_ACQUISITION_SCHEMA=
  'wand.db02.db01-item-acquisition@1' as const;
export const DB02_DB01_ACQUISITION_FILE=
  'db01-item-acquisition-1.26.2.json' as const;
const CATEGORIES=DB02_ACQUISITION_CATEGORY_ORDER;
const HINTS=Object.freeze(['premium','time_limited'] as const);
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const ID=/^[1-9][0-9]{0,15}$/;
const EMPTY=Object.freeze([]) as readonly string[];
const EMPTY_CATEGORIES=Object.freeze([]) as readonly GameNativeItemCategory[];
const MARK=new WeakSet<object>();

type NativeHint=typeof HINTS[number];
export interface Db01ItemAcquisition {
  readonly itemId:string;
  readonly categories:readonly GameNativeItemCategory[];
  readonly details:Readonly<Partial<Record<GameNativeItemCategory,readonly string[]>>>;
  /** Original OnlineCategory.Premium/TimeLimited, not shop or campaign proof. */
  readonly unresolvedOnlineHints:readonly NativeHint[];
  readonly classified:boolean;
  readonly currentAvailabilityVerified:false;
}
export interface Db01ItemAcquisitionCoverage {
  readonly allGameItemIdsCovered:false;
  readonly missingItemIdMeans:'unclassified_not_unobtainable';
  readonly separateActiveAvailabilityVerified:false;
  readonly twitchDropItemIdLinks:0;
  readonly redeemCodeItemIdLinks:0;
  readonly distinctClassifiedItemIds:3247;
  readonly distinctOriginalOnlineHintItemIds:2198;
  readonly unclassifiedWithOriginalOnlineHints:1628;
  readonly recordsIncludingUnresolvedHints:4875;
  readonly itemIdsByCategory:Readonly<Record<GameNativeItemCategory,number>>;
  readonly sourceRelationOccurrences:Readonly<Record<string,number>>;
}
export interface Db01ItemAcquisitionIndex {
  readonly schema:typeof DB02_DB01_ACQUISITION_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly categoryOrder:typeof DB02_ACQUISITION_CATEGORY_ORDER;
  readonly coverage:Db01ItemAcquisitionCoverage;
  readonly complete:false;
  getItem(itemId:string|number):Db01ItemAcquisition;
  listItemIds(category?:GameNativeItemCategory):readonly string[];
}
function check(v:unknown,code:string):asserts v{
  if(!v)throw new TypeError('DB02_DB01_ACQUISITION_'+code);
}
function record(v:unknown):v is Record<string,unknown>{
  return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function id(raw:unknown):string{
  const s=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  check(typeof s==='string'&&ID.test(s)&&Number.isSafeInteger(Number(s)),
    'ITEM_ID');
  return s;
}
function sorted(values:Iterable<string>):readonly string[]{
  return Object.freeze([...values].sort((a,b)=>Number(a)-Number(b)));
}
export function parseDb01ItemAcquisition(raw:unknown):Db01ItemAcquisitionIndex{
  check(record(raw)&&raw.schema===DB02_DB01_ACQUISITION_SCHEMA&&
    record(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&
    Array.isArray(raw.categoryOrder)&&
    JSON.stringify(raw.categoryOrder)===JSON.stringify(CATEGORIES)&&
    record(raw.details)&&record(raw.detailEvidenceLevel)&&
    record(raw.sources)&&Object.keys(raw.sources).length===10&&
    record(raw.coverage)&&Array.isArray(raw.items),'SCHEMA');
  const coverage=raw.coverage;
  const expectedCount:Record<GameNativeItemCategory,number>={
    ordinary_gameplay:2667,premium_shop:272,star_path:64,
    in_game_limited_event:139,real_time_limited_event:14,
    iap_package_reward:158
  };
  check(coverage.allGameItemIdsCovered===false&&
    coverage.missingItemIdMeans==='unclassified_not_unobtainable'&&
    coverage.separateActiveAvailabilityVerified===false&&
    coverage.twitchDropItemIdLinks===0&&
    coverage.redeemCodeItemIdLinks===0&&
    coverage.distinctClassifiedItemIds===3247&&
    coverage.distinctOriginalOnlineHintItemIds===2198&&
    coverage.unclassifiedWithOriginalOnlineHints===1628&&
    coverage.recordsIncludingUnresolvedHints===4875&&
    record(coverage.itemIdsByCategory)&&
    CATEGORIES.every(c=>coverage.itemIdsByCategory[c]===expectedCount[c])&&
    record(coverage.sourceRelationOccurrences)&&
    raw.items.length===4875,'COVERAGE');
  const byItem=new Map<string,Db01ItemAcquisition>();
  const idsByCategory=new Map<GameNativeItemCategory,string[]>(
    CATEGORIES.map(c=>[c,[]])
  );
  const detailsCatalog=new Map<GameNativeItemCategory,readonly string[]>();
  for(const category of CATEGORIES){
    const details=raw.details[category];
    check(Array.isArray(details)&&details.length>0&&
      details.every((d:unknown)=>typeof d==='string'&&
        d.length>0&&typeof raw.detailEvidenceLevel[d]==='string')&&
      new Set(details).size===details.length,'DETAIL_CATALOG');
    detailsCatalog.set(category,details);
  }
  // Every row is a compact tuple: [Item ID, [[category, [details]]], [hints]].
  let previous=0,classified=0,withoutCategory=0;
  for(const tuple of raw.items){
    check(Array.isArray(tuple)&&tuple.length===3&&
      Array.isArray(tuple[1])&&Array.isArray(tuple[2]),'ROW');
    const key=id(tuple[0]);
    check(Number(key)>previous,'ROW_ORDER_OR_DUPLICATE');
    previous=Number(key);
    const categories:GameNativeItemCategory[]=[];
    const details:Partial<Record<GameNativeItemCategory,readonly string[]>>={};
    for(const group of tuple[1]){
      check(Array.isArray(group)&&group.length===2&&
        CATEGORIES.includes(group[0])&&
        !categories.includes(group[0])&&
        Array.isArray(group[1])&&group[1].length>0,'GROUP');
      const category=group[0] as GameNativeItemCategory;
      const allowable=detailsCatalog.get(category)!;
      const methods=group[1] as unknown[];
      check(methods.every(m=>typeof m==='string'&&allowable.includes(m))&&
        methods.every((m,i)=>i===0||
          allowable.indexOf(m as string)>allowable.indexOf(methods[i-1] as string))&&
        new Set(methods).size===methods.length,'DETAIL');
      details[category]=Object.freeze([...methods] as string[]);
      categories.push(category);
      idsByCategory.get(category)!.push(key);
    }
    check(JSON.stringify(categories)===JSON.stringify(
      CATEGORIES.filter(c=>categories.includes(c))),'GROUP_ORDER');
    const hints=tuple[2] as unknown[];
    check(hints.every(h=>HINTS.includes(h as NativeHint))&&
      new Set(hints).size===hints.length&&
      JSON.stringify(hints)===JSON.stringify(HINTS.filter(h=>hints.includes(h)))&&
      (categories.length>0||hints.length>0),'ONLINE_HINT');
    if(categories.length)classified++;else withoutCategory++;
    byItem.set(key,Object.freeze({
      itemId:key,categories:Object.freeze(categories),
      details:Object.freeze(details),
      unresolvedOnlineHints:Object.freeze([...hints] as NativeHint[]),
      classified:categories.length>0,
      currentAvailabilityVerified:false as const
    }));
  }
  check(classified===3247&&withoutCategory===1628&&
    [...byItem.values()].filter(r=>r.unresolvedOnlineHints.includes('premium')).length===
      1830&&
    [...byItem.values()].filter(r=>r.unresolvedOnlineHints.includes('time_limited')).length===
      368&&
    CATEGORIES.every(c=>idsByCategory.get(c)!.length===expectedCount[c])&&
    [...byItem.values()].filter(r=>r.categories.includes('real_time_limited_event'))
      .every(r=>r.details.real_time_limited_event?.every(x=>
        x==='exclusive_promotion_unspecified')),'RECOMPUTED_CENSUS');
  // This is a sparse join: DB-01 owns the canonical complete Item-ID census.
  const all=sorted(byItem.keys());
  const itemIdsByCategory=new Map<GameNativeItemCategory,readonly string[]>(
    CATEGORIES.map(c=>[c,Object.freeze(idsByCategory.get(c)!)])
  );
  const pinnedCoverage=Object.freeze({
    ...coverage,itemIdsByCategory:Object.freeze({...coverage.itemIdsByCategory}),
    sourceRelationOccurrences:Object.freeze({...coverage.sourceRelationOccurrences})
  }) as unknown as Db01ItemAcquisitionCoverage;
  const index:Db01ItemAcquisitionIndex=Object.freeze({
    schema:DB02_DB01_ACQUISITION_SCHEMA,
    gameVersion:'1.26.2' as const,
    categoryOrder:CATEGORIES,
    coverage:pinnedCoverage,complete:false as const,
    getItem(rawId:string|number){
      const key=id(rawId);
      return byItem.get(key)??Object.freeze({
        itemId:key,categories:EMPTY_CATEGORIES,
        details:Object.freeze({}) as Db01ItemAcquisition['details'],
        unresolvedOnlineHints:EMPTY as readonly NativeHint[],
        classified:false as const,currentAvailabilityVerified:false as const
      });
    },
    listItemIds(category?:GameNativeItemCategory){
      if(category===undefined)return all;
      check(CATEGORIES.includes(category),'CATEGORY');
      return itemIdsByCategory.get(category)!;
    }
  });
  MARK.add(index);
  return index;
}
export function hasDb01ItemAcquisitionHandoff(
  x:unknown
):x is Db01ItemAcquisitionIndex{
  return x!==null&&typeof x==='object'&&MARK.has(x);
}
/** Browser/worker-capable; DB-01 can also import the compact JSON offline. */
export async function loadDb01ItemAcquisitionHandoff(
  basePath='',fetcher:typeof fetch=fetch
):Promise<Db01ItemAcquisitionIndex>{
  check(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'BASE_PATH');
  const response=await fetcher(
    basePath+'/acquisition/public/'+DB02_DB01_ACQUISITION_FILE
  );
  check(response.ok,'DOWNLOAD_FAILED');
  const raw:unknown=await response.json();
  return parseDb01ItemAcquisition(raw);
}
