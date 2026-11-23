/**
 * DB-02 -> DB-01 source-ID relations for every verified source occurrence.
 *
 * The six Owner-approved groups are ONLY a summary. Keep all Quest IDs,
 * Star Path season IDs, Recipe IDs, Event IDs, Offers, IAPs, Loot Tables,
 * Stall IDs and roles intact for lazy item details and expert mode.
 *
 * Technical IDs are not normal-mode UI copy. A null category means a known
 * item relationship (ingredient, Loot candidate, Vault alternative, etc.),
 * NOT a verified way to acquire the item.
 */
import {
  DB02_ACQUISITION_CATEGORY_ORDER,
  type GameNativeItemCategory
} from './game-native-item-categories.ts';

export const DB02_ITEM_SOURCE_RELATIONS_SCHEMA=
  'wand.db02.db01-item-source-relations@1' as const;
export const DB02_ITEM_SOURCE_RELATIONS_FILE=
  'db01-item-source-relations-1.26.2.json' as const;

export const DB02_SOURCE_KINDS=Object.freeze([
  'quest','star_path','event','friendship_default','recipe',
  'activity','shop_offer','iap_package','loot_table','stall',
  'native_pet_source'
] as const);
export const DB02_SOURCE_ROLES=Object.freeze([
  'quest_currency_reward','quest_additional_loot_candidate',
  'star_path_free_reward','star_path_premium_reward','star_path_vault_reward',
  'star_path_vault_alternative_candidate','star_path_premium_access_currency',
  'mini_event_reward_candidate','floating_festival_reward_candidate',
  'friendship_default_reward_candidate',
  'cooking_result','crafting_result','recipe_ingredient_item',
  'fishing_result','mining_result','timebending_result','farming_result',
  'premium_shop_component','archived_premium_shop_component',
  'iap_direct_reward','iap_extended_reward',
  'loot_table_candidate','stall_loot_pool_candidate',
  'native_pet_quest','native_pet_timebending','native_pet_event',
  'native_pet_star_path','native_pet_premium_shop',
  'native_pet_exclusive_promotion'
] as const);

const ROLE_CATEGORY=Object.freeze([
  0,0,2,2,2,null,null,3,3,0,0,0,null,0,0,0,0,1,1,
  5,5,null,null,0,0,3,2,1,4
] as const);

const EXPECTED_CATEGORY_COUNTS=Object.freeze([
  2667,272,64,139,14,158
] as const);
const EXPECTED_SOURCE_COUNTS=Object.freeze([
  395,82,202,16,8088,763,284,291,3804,1385,134
] as const);
const REQUIRED_PROJECTIONS=Object.freeze([
  'quest','quest_index','star_path','event_friendship','recipes',
  'activities','shop_current','shop_archive','iap','loot','stalls','pets'
] as const);
const ID=/^[1-9][0-9]{0,15}$/;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const MARK=new WeakSet<object>();
const EMPTY=Object.freeze([]) as readonly Db01ItemSourceLink[];
const EMPTY_CATS=Object.freeze([]) as readonly GameNativeItemCategory[];
const SHA=/^[a-f0-9]{64}$/;

export type Db01SourceKind=typeof DB02_SOURCE_KINDS[number];
export type Db01SourceRole=typeof DB02_SOURCE_ROLES[number];
export type Db01SourcePosition=string|number|null;

export interface Db01ItemSourceLink{
  readonly kind:Db01SourceKind;
  readonly sourceId:string;
  readonly role:Db01SourceRole;
  readonly category:GameNativeItemCategory|null;
  readonly occurrenceIndex:number;
  /** Position/parent references in the pinned original source projection. */
  readonly sourcePosition:readonly Db01SourcePosition[];
  readonly gameSourceOnly:true;
  readonly grantedVerified:false;
  readonly currentlyAvailableVerified:false;
}
export interface Db01ItemSourceRecord{
  readonly itemId:string;
  readonly categories:readonly GameNativeItemCategory[];
  readonly links:readonly Db01ItemSourceLink[];
  readonly identifiedSourceLinks:boolean;
  readonly sourceCoverageComplete:false;
}
export interface Db01ItemSourceRelations{
  readonly schema:typeof DB02_ITEM_SOURCE_RELATIONS_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly categoryOrder:typeof DB02_ACQUISITION_CATEGORY_ORDER;
  readonly sourceKinds:typeof DB02_SOURCE_KINDS;
  readonly roles:typeof DB02_SOURCE_ROLES;
  readonly itemIdsWithLinks:4137;
  readonly sourceLinks:15444;
  readonly sourceCoverageComplete:false;
  /** A missing Item ID means no link in this dataset, NOT unobtainable. */
  getItem(itemId:number|string):Db01ItemSourceRecord;
  /** Reverse lookup by one concrete native source ID, e.g. Quest ID. */
  getSourceItemIds(kind:Db01SourceKind,sourceId:string):readonly string[];
  listItemIds(category?:GameNativeItemCategory):readonly string[];
}

function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB02_DB01_SOURCE_RELATIONS_'+code);
}
function record(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function canonical(value:unknown):string{
  const s=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  check(typeof s==='string'&&ID.test(s)&&Number.isSafeInteger(Number(s)),
    'INVALID_ITEM_ID');
  return s;
}
function sourcePosition(value:unknown):value is Db01SourcePosition[]{
  return Array.isArray(value)&&value.length<=8&&
    value.every(x=>x===null||
      typeof x==='string'&&x.length<=256||
      typeof x==='number'&&Number.isSafeInteger(x)&&x>=0);
}
function sortedIds(ids:Iterable<string>):readonly string[]{
  return Object.freeze([...ids].sort((a,b)=>Number(a)-Number(b)));
}
const MISS=Object.freeze({}) as Readonly<Record<string,never>>;

export function parseDb01ItemSourceRelations(data:unknown):Db01ItemSourceRelations{
  check(record(data)&&data.schema===DB02_ITEM_SOURCE_RELATIONS_SCHEMA&&
    record(data.target)&&data.target.platform==='Steam'&&
    data.target.gameVersion==='1.26.2'&&
    data.linkKey==='itemId'&&
    JSON.stringify(data.categoryOrder)===
      JSON.stringify(DB02_ACQUISITION_CATEGORY_ORDER)&&
    JSON.stringify(data.sourceKinds)===JSON.stringify(DB02_SOURCE_KINDS)&&
    JSON.stringify(data.roles)===JSON.stringify(DB02_SOURCE_ROLES)&&
    JSON.stringify(data.roleCategory)===JSON.stringify(ROLE_CATEGORY)&&
    record(data.sourceProjections)&&
    REQUIRED_PROJECTIONS.length===Object.keys(data.sourceProjections).length&&
    REQUIRED_PROJECTIONS.every(k=>typeof data.sourceProjections[k]==='string'&&
      (data.sourceProjections[k] as string).startsWith('static/'))&&
    record(data.semantics)&&data.semantics.expertOnlyIds===true&&
    data.semantics.sourceDefinitionsOnly===true&&
    data.semantics.guaranteedItemGrantVerified===false&&
    data.semantics.currentAvailabilityVerified===false&&
    data.semantics.allOriginalSourcesCovered===false&&
    record(data.coverage)&&Array.isArray(data.items),'SCHEMA');
  const coverage=data.coverage;
  const categories=DB02_ACQUISITION_CATEGORY_ORDER;
  const sourceKinds=DB02_SOURCE_KINDS;
  const roles=DB02_SOURCE_ROLES;
  check(coverage.itemIdsWithLinks===4137&&
    coverage.classifiedItemIdsFromLinks===3247&&
    coverage.previousClassifiedItemIds===3247&&
    coverage.sourceLinks===15444&&
    coverage.sourceProjectionCount===12&&
    record(coverage.itemIdsByCategory)&&
    record(coverage.linksBySourceKind)&&
    record(coverage.linksByRole)&&
    data.items.length===4137&&
    categories.every((c,i)=>coverage.itemIdsByCategory[c]===EXPECTED_CATEGORY_COUNTS[i])&&
    sourceKinds.every((k,i)=>coverage.linksBySourceKind[k]===EXPECTED_SOURCE_COUNTS[i]),
    'COVERAGE');
  const byItem=new Map<string,Db01ItemSourceRecord>();
  const reverse=new Map<string,Set<string>>();
  const byCategory=new Map<GameNativeItemCategory,Set<string>>(
    categories.map(c=>[c,new Set<string>()])
  );
  const actualRoles=new Array<number>(roles.length).fill(0);
  const actualSources=new Array<number>(sourceKinds.length).fill(0);
  let prior=0,totalLinks=0,classCount=0;
  for(const raw of data.items){
    check(Array.isArray(raw)&&raw.length===2&&
      Array.isArray(raw[1])&&raw[1].length>0,'ITEM_SHAPE');
    const itemId=canonical(raw[0]);
    check(Number(itemId)>prior,'ITEM_ORDER_OR_DUPLICATE');
    prior=Number(itemId);
    const links:Db01ItemSourceLink[]=[];
    const grouped=new Set<GameNativeItemCategory>();
    for(const edge of raw[1]){
      check(Array.isArray(edge)&&edge.length===5&&
        Number.isInteger(edge[0])&&edge[0]>=0&&edge[0]<sourceKinds.length&&
        typeof edge[1]==='string'&&edge[1].length>0&&edge[1].length<=128&&
        Number.isInteger(edge[2])&&edge[2]>=0&&edge[2]<roles.length&&
        Number.isSafeInteger(edge[3])&&edge[3]>=0&&
        sourcePosition(edge[4]),'LINK_SHAPE');
      const kindIndex=edge[0] as number;
      const roleIndex=edge[2] as number;
      const catIdx=ROLE_CATEGORY[roleIndex];
      const category=catIdx===null?null:categories[catIdx];
      if(category){
        grouped.add(category);
        byCategory.get(category)!.add(itemId);
      }
      const kind=sourceKinds[kindIndex],role=roles[roleIndex];
      const link:Db01ItemSourceLink=Object.freeze({
        kind,sourceId:edge[1] as string,role,
        category:category??null,occurrenceIndex:edge[3] as number,
        sourcePosition:Object.freeze([...(edge[4] as Db01SourcePosition[])]),
        gameSourceOnly:true as const,
        grantedVerified:false as const,
        currentlyAvailableVerified:false as const,
      });
      links.push(link);
      actualRoles[roleIndex]++;
      actualSources[kindIndex]++;
      const reverseKey=kind+'|'+edge[1];
      let reverseIds=reverse.get(reverseKey);
      if(!reverseIds){reverseIds=new Set();reverse.set(reverseKey,reverseIds);}
      reverseIds.add(itemId);
      totalLinks++;
    }
    const categoryList=Object.freeze(categories.filter(c=>grouped.has(c)));
    if(categoryList.length)classCount++;
    byItem.set(itemId,Object.freeze({
      itemId,categories:categoryList,links:Object.freeze(links),
      identifiedSourceLinks:true as const,sourceCoverageComplete:false as const
    }));
  }
  check(classCount===3247&&totalLinks===15444&&
    actualSources.every((n,i)=>n===EXPECTED_SOURCE_COUNTS[i])&&
    roles.every((r,i)=>Number(coverage.linksByRole[r])===actualRoles[i])&&
    categories.every((c,i)=>byCategory.get(c)!.size===EXPECTED_CATEGORY_COUNTS[i]),
    'RECOMPUTED_COVERAGE');
  // Keep normal UI free of IDs; the UI can resolve names from existing
  // DB-01/DB-03 catalogs. Expert mode may show these original references.
  const sourceLookup=new Map<string,readonly string[]>(
    [...reverse].map(([k,v])=>[k,sortedIds(v)])
  );
  const all=sortedIds(byItem.keys());
  const categoryLookup=new Map<GameNativeItemCategory,readonly string[]>(
    [...byCategory].map(([k,v])=>[k,sortedIds(v)])
  );
  const absentCache=new Map<string,Db01ItemSourceRecord>();
  const index:Db01ItemSourceRelations=Object.freeze({
    schema:DB02_ITEM_SOURCE_RELATIONS_SCHEMA,
    gameVersion:'1.26.2' as const,
    categoryOrder:categories,
    sourceKinds,roles,
    itemIdsWithLinks:4137 as const,sourceLinks:15444 as const,
    sourceCoverageComplete:false as const,
    getItem(rawId:number|string):Db01ItemSourceRecord{
      const itemId=canonical(rawId);
      const known=byItem.get(itemId);
      if(known)return known;
      let missing=absentCache.get(itemId);
      if(missing)return missing;
      missing=Object.freeze({
        itemId,categories:EMPTY_CATS,links:EMPTY,
        identifiedSourceLinks:false as const,sourceCoverageComplete:false as const
      });
      if(absentCache.size<1024)absentCache.set(itemId,missing);
      return missing;
    },
    getSourceItemIds(kind:Db01SourceKind,sourceId:string){
      check(sourceKinds.includes(kind),'INVALID_SOURCE_KIND');
      check(typeof sourceId==='string'&&sourceId.length>0&&sourceId.length<=128,
        'INVALID_SOURCE_ID');
      return sourceLookup.get(kind+'|'+sourceId)??Object.freeze([]);
    },
    listItemIds(category?:GameNativeItemCategory){
      if(category===undefined)return all;
      check(categories.includes(category),'INVALID_CATEGORY');
      return categoryLookup.get(category)!;
    }
  });
  MARK.add(index);
  return index;
}
export function hasDb01ItemSourceRelations(value:unknown):
  value is Db01ItemSourceRelations{
  return value!==null&&typeof value==='object'&&MARK.has(value);
}
/** Browser/Worker lazy reader. File is generated offline from source SHA pins. */
export async function loadDb01ItemSourceRelations(
  basePath='',fetcher:typeof fetch=fetch
):Promise<Db01ItemSourceRelations>{
  check(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE');
  const response=await fetcher(
    basePath+'/acquisition/public/'+DB02_ITEM_SOURCE_RELATIONS_FILE
  );
  check(response.ok,'DOWNLOAD_FAILED');
  const raw:unknown=await response.json();
  return parseDb01ItemSourceRelations(raw);
}
