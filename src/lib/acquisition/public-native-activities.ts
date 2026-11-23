/**
 * DB-02 source-native fishing/mining/timebending/growing result path index.
 *
 * Static game definitions establish a configured result Item ID. They DO NOT
 * prove an actual loot drop, a harvest, current location availability,
 * current eligibility, player item ownership or a guaranteed appearance.
 */
import type {ItemOrigin,OriginProvenance} from './origins.ts';

export const DB02_NATIVE_ACTIVITY_SCHEMA='wand.db02.native-activity-results@1' as const;
export const DB02_NATIVE_ACTIVITY_FILE='activity-result-paths-1.26.2.json' as const;
export const DB02_NATIVE_ACTIVITY_BYTES=34299 as const;
export const DB02_NATIVE_ACTIVITY_SHA256=
  '97d02a35dbe78dab637f4eda7d6fdf61cf528bb77aab6f684483a5cf542eebbb' as const;
const ORIGINAL_DATA_SHA='2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296';
const ORIGINAL_ITEM_SHA='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2';
const SOURCE_DATA=Object.freeze({
  sourceId:'src02:steam1262:activitydata:result-paths',
  kind:'verified_game_native' as const,
  sourceUrl:'/acquisition/public/'+DB02_NATIVE_ACTIVITY_FILE,
  checkedOn:'2026-11-23',gameVersion:'1.26.2',sha256:ORIGINAL_DATA_SHA
}) satisfies OriginProvenance;
const SOURCE_ITEM=Object.freeze({
  ...SOURCE_DATA,sourceId:'src02:steam1262:activityitem:seed-paths',
  sha256:ORIGINAL_ITEM_SHA
}) satisfies OriginProvenance;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const ID=/^[1-9][0-9]{0,15}$/;
const METHODS=Object.freeze(['fishing','mining','timebending','farming'] as const);
const PINNED=new WeakSet<object>();
const EMPTY_PATHS=Object.freeze([]) as readonly NativeActivityResultPath[];
const EMPTY_ORIGINS=Object.freeze([]) as readonly ItemOrigin[];
const EMPTY_IDS=Object.freeze([]) as readonly string[];
const WINDOW=Object.freeze({start:null,endExclusive:null});
const CONDITIONS=Object.freeze([
  'Original static acquisition path; an actual drop, harvest or live unlock is not guaranteed'
]);
export type NativeActivityMethod=typeof METHODS[number];
export type NativeActivityContext=
  | Readonly<{method:'fishing';areaIds:readonly number[];rarity:number|null}>
  | Readonly<{method:'mining';areaId:number|null;sceneId:number|null;rarity:number|null}>
  | Readonly<{method:'timebending';locations:readonly Readonly<{
       areaId:number|null;sceneId:number|null
     }>[];minHourglassLevel:number|null;amountRange:Readonly<{
       min:number;max:number
     }>|null}>
  | Readonly<{method:'farming';seedItemId:string;growthSeconds:number;
       villageAreaIds:readonly number[]}>;
export interface NativeActivityResultPath {
  readonly pathId:string;
  readonly definitionId:string;
  readonly resultItemId:string;
  readonly method:NativeActivityMethod;
  /** Source result count when explicitly serialized; NOT guaranteed harvest/drops. */
  readonly resultQuantity:number|null;
  readonly context:NativeActivityContext;
  readonly source:OriginProvenance;
  readonly occurrenceGuaranteed:false;
  readonly playerUnlockVerified:false;
  readonly currentAvailabilityVerified:false;
}
export interface NativeActivityResultIndex {
  readonly schema:typeof DB02_NATIVE_ACTIVITY_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly coverage:Readonly<{
    activityDataDefinitions:2630;
    activityItemDefinitions:4050;
    nativeResultPaths:763;
    fishingPaths:282;
    miningPaths:299;
    timebendingPaths:82;
    growingPaths:100;
    distinctResultItemIds:489;
    contextAvailabilityVerified:false;
    playerUnlockVerified:false;
    staticPathsNotGuaranteedDrops:true;
    allAcquisitionRoutesCovered:false;
  }>;
  readonly paths:readonly NativeActivityResultPath[];
  readonly origins:readonly ItemOrigin[];
  getDefinitionPath(definitionId:string|number):NativeActivityResultPath|null;
  getItemPaths(itemId:string|number):readonly NativeActivityResultPath[];
  getItemOrigins(itemId:string|number):readonly ItemOrigin[];
  getSeedPath(seedItemId:string|number):NativeActivityResultPath|null;
  listResultItemIds(method?:NativeActivityMethod):readonly string[];
}
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB02_NATIVE_ACTIVITY_'+code);
}
function object(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function id(raw:unknown):string{
  const value=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  check(typeof value==='string'&&ID.test(value)&&
    Number.isSafeInteger(Number(value)),'INVALID_ITEM_ID');
  return value;
}
function nonnegative(raw:unknown):number{
  check(typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>=0,
    'INVALID_NONNEGATIVE');
  return raw;
}
function optionalNonnegative(raw:unknown):number|null{
  return raw===null?null:nonnegative(raw);
}
function count(raw:unknown):number{
  const n=nonnegative(raw);
  check(n>0,'POSITIVE_QUANTITY');
  return n;
}
function list(raw:unknown):readonly number[]{
  check(Array.isArray(raw)&&raw.length<=256,'INVALID_AREA_LIST');
  return Object.freeze(raw.map(nonnegative));
}
function makeContext(
  kind:NativeActivityMethod,definitionId:string,args:unknown
):NativeActivityContext{
  check(Array.isArray(args),'CONTEXT_ARGS');
  if(kind==='fishing'){
    check(args.length===2,'FISHING_CONTEXT');
    return Object.freeze({
      method:'fishing' as const,areaIds:list(args[0]),
      rarity:optionalNonnegative(args[1])
    });
  }
  if(kind==='mining'){
    check(args.length===3,'MINING_CONTEXT');
    return Object.freeze({
      method:'mining' as const,areaId:optionalNonnegative(args[0]),
      sceneId:optionalNonnegative(args[1]),
      rarity:optionalNonnegative(args[2])
    });
  }
  if(kind==='timebending'){
    check(args.length===3&&Array.isArray(args[0])&&args[0].length<=128,
      'TIMEBENDING_CONTEXT');
    const locations=Object.freeze(args[0].map((x:unknown)=>{
      check(Array.isArray(x)&&x.length===2,'LOCATION_PAIR');
      return Object.freeze({areaId:optionalNonnegative(x[0]),
        sceneId:optionalNonnegative(x[1])});
    }));
    const range=args[2];
    check(range===null||(Array.isArray(range)&&range.length===2),
      'AMOUNT_RANGE');
    let amountRange:{min:number;max:number}|null=null;
    if(range!==null){
      check(Array.isArray(range),'AMOUNT_RANGE');
      const min=nonnegative(range[0]),max=nonnegative(range[1]);
      check(min<=max,'AMOUNT_RANGE_ORDER');
      amountRange=Object.freeze({min,max});
    }
    return Object.freeze({
      method:'timebending' as const,locations,
      minHourglassLevel:optionalNonnegative(args[1]),amountRange
    });
  }
  check(kind==='farming'&&args.length===3,'FARMING_CONTEXT');
  const seed=id(args[0]);
  check(seed===definitionId,'SEED_SOURCE_ID');
  const growthSeconds=args[1];
  check(typeof growthSeconds==='number'&&Number.isFinite(growthSeconds)&&
    growthSeconds>0,'GROWTH_SECONDS');
  return Object.freeze({method:'farming' as const,seedItemId:seed,
    growthSeconds,villageAreaIds:list(args[2])});
}
function add<T>(map:Map<string,T[]>,key:string,value:T):void{
  const previous=map.get(key);
  if(previous)previous.push(value);else map.set(key,[value]);
}
function freezeValues<T>(map:Map<string,T[]>):void{
  for(const items of map.values())Object.freeze(items);
}
function parse(raw:unknown):NativeActivityResultIndex{
  check(object(raw)&&raw.schema===DB02_NATIVE_ACTIVITY_SCHEMA&&
    object(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&object(raw.sources)&&
    object(raw.sources.activityData)&&object(raw.sources.activityItem)&&
    raw.sources.activityData.file==='ddv_Data/StreamingAssets/itemlist/ActivityData.json'&&
    raw.sources.activityData.sha256===ORIGINAL_DATA_SHA&&
    raw.sources.activityData.bytes===260627&&
    raw.sources.activityItem.file==='ddv_Data/StreamingAssets/itemlist/ActivityItem.json'&&
    raw.sources.activityItem.sha256===ORIGINAL_ITEM_SHA&&
    raw.sources.activityItem.bytes===1339476&&
    object(raw.coverage)&&Array.isArray(raw.paths)&&raw.paths.length===763&&
    object(raw.encoding)&&JSON.stringify(raw.encoding)===
      '{"0":"fishing","1":"mining","2":"timebending","3":"growing"}',
    'SOURCE_SCHEMA');
  const c=raw.coverage;
  check(c.activityDataDefinitions===2630&&c.activityItemDefinitions===4050&&
    c.nativeResultPaths===763&&c.fishingPaths===282&&
    c.miningPaths===299&&c.timebendingPaths===82&&
    c.growingPaths===100&&c.distinctResultItemIds===489&&
    c.contextAvailabilityVerified===false&&
    c.playerUnlockVerified===false&&
    c.staticPathsNotGuaranteedDrops===true&&
    c.allAcquisitionRoutesCovered===false,'SOURCE_CENSUS');

  const paths:NativeActivityResultPath[]=[];
  const origins:ItemOrigin[]=[];
  const byItem=new Map<string,NativeActivityResultPath[]>();
  const originsByItem=new Map<string,ItemOrigin[]>();
  const byDefinition=new Map<string,NativeActivityResultPath>();
  const bySeed=new Map<string,NativeActivityResultPath>();
  const kindIds=new Map<NativeActivityMethod,Set<string>>();
  const allIds=new Set<string>();
  const actualCount={fishing:0,mining:0,timebending:0,farming:0};
  let previous=0;
  for(const row of raw.paths){
    check(Array.isArray(row)&&row.length===5,'PATH_TUPLE');
    const n=count(row[0]);
    check(n>previous,'PATH_ORDER_OR_DUPLICATE');
    previous=n;
    const kindCode=row[1];
    check(typeof kindCode==='number'&&Number.isInteger(kindCode)&&
      kindCode>=0&&kindCode<=3,'PATH_KIND');
    const kind=METHODS[kindCode];
    check(kind==='farming'?n>=30000000&&n<40000000:
      kind==='fishing'?n>=2050100000&&n<2050200000:
      kind==='mining'?n>=2050200000&&n<2050300000:
      n>=2050400000&&n<2050500000,'PATH_NATIVE_ID');
    const definitionId=id(n),resultItemId=id(count(row[2]));
    check(kind==='farming'||kind==='timebending'||row[3]===null,
      'UNSUPPORTED_QUANTITY');
    const resultQuantity=row[3]===null?null:count(row[3]);
    if(kind==='farming')check(resultQuantity!==null,'GROWING_YIELD_REQUIRED');
    const context=makeContext(kind,definitionId,row[4]);
    const source=kind==='farming'?SOURCE_ITEM:SOURCE_DATA;
    const prefix=kind==='farming'?'growing':kind;
    const pathId=prefix+':'+definitionId;
    const data:NativeActivityResultPath=Object.freeze({
      pathId,definitionId,resultItemId,method:kind,
      resultQuantity,context,source,
      occurrenceGuaranteed:false,playerUnlockVerified:false,
      currentAvailabilityVerified:false
    });
    paths.push(data);
    byDefinition.set(definitionId,data);
    add(byItem,resultItemId,data);
    if(kind==='farming')bySeed.set(definitionId,data);
    const origin:ItemOrigin=Object.freeze({
      originId:'native:path:'+pathId,itemId:resultItemId,
      kind,routeStatus:'confirmed_source_link',campaignId:null,
      name:'Original '+prefix+' result path '+definitionId,
      productId:null,quantity:resultQuantity,price:null,
      accessTier:'not_applicable',window:WINDOW,
      salePeriods:Object.freeze([]),conditions:CONDITIONS,
      source,availability:'not_live_verified'
    });
    origins.push(origin);
    add(originsByItem,resultItemId,origin);
    actualCount[kind]++;
    allIds.add(resultItemId);
    const existing=kindIds.get(kind);
    if(existing)existing.add(resultItemId);else kindIds.set(kind,new Set([resultItemId]));
  }
  check(actualCount.fishing===282&&actualCount.mining===299&&
    actualCount.timebending===82&&actualCount.farming===100&&
    allIds.size===489&&paths.length===763&&bySeed.size===100,
    'PATH_TOTALS');
  freezeValues(byItem);freezeValues(originsByItem);
  const sorted=(raw:Set<string>)=>Object.freeze(
    [...raw].sort((a,b)=>Number(a)-Number(b)));
  const allResultIds=sorted(allIds);
  const byMethod=new Map<NativeActivityMethod,readonly string[]>();
  for(const kind of METHODS)byMethod.set(kind,sorted(kindIds.get(kind)??new Set()));
  const index:NativeActivityResultIndex=Object.freeze({
    schema:DB02_NATIVE_ACTIVITY_SCHEMA,gameVersion:'1.26.2' as const,
    coverage:Object.freeze({
      activityDataDefinitions:2630 as const,activityItemDefinitions:4050 as const,
      nativeResultPaths:763 as const,fishingPaths:282 as const,
      miningPaths:299 as const,timebendingPaths:82 as const,
      growingPaths:100 as const,distinctResultItemIds:489 as const,
      contextAvailabilityVerified:false as const,
      playerUnlockVerified:false as const,staticPathsNotGuaranteedDrops:true as const,
      allAcquisitionRoutesCovered:false as const
    }),
    paths:Object.freeze(paths),origins:Object.freeze(origins),
    getDefinitionPath(rawId:string|number){
      return byDefinition.get(id(rawId))??null;
    },
    getItemPaths(rawId:string|number){
      return byItem.get(id(rawId))??EMPTY_PATHS;
    },
    getItemOrigins(rawId:string|number){
      return originsByItem.get(id(rawId))??EMPTY_ORIGINS;
    },
    getSeedPath(rawId:string|number){
      return bySeed.get(id(rawId))??null;
    },
    listResultItemIds(kind?:NativeActivityMethod){
      check(kind===undefined||METHODS.includes(kind),'INVALID_KIND');
      return kind===undefined?allResultIds:byMethod.get(kind)??EMPTY_IDS;
    }
  });
  PINNED.add(index);
  return index;
}
export function hasPinnedNativeActivityEvidence(x:unknown):x is NativeActivityResultIndex{
  return x!==null&&typeof x==='object'&&PINNED.has(x);
}
export async function loadPinnedNativeActivityResults(
  basePath='',fetcher:typeof fetch=fetch
):Promise<NativeActivityResultIndex>{
  check(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  check(typeof fetcher==='function','FETCH_REQUIRED');
  const response=await fetcher(basePath+'/acquisition/public/'+DB02_NATIVE_ACTIVITY_FILE);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB02_NATIVE_ACTIVITY_BYTES,'BYTES');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  check(digest===DB02_NATIVE_ACTIVITY_SHA256,'SHA');
  return parse(JSON.parse(new TextDecoder().decode(bytes)));
}
