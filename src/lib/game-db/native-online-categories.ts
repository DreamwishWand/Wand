/**
 * DB-00 on-demand projection of DB-02's SHA-pinned original ItemData
 * OnlineCategory enum. Source Premium / TimeLimited categories do NOT
 * identify a specific Shop offer, Twitch Drops, redeem code, sale window,
 * entitlement, or actual player grant.
 *
 * The original nine Steam itemlist source files and private saves stay local.
 */
import {canonicalId} from './model.ts';
import type {SharedGameDatabase,DbLocale} from './integrated.ts';
import type {Db00SourceJoinedReader,Db00SourceJoinedItem} from './source-join.ts';
import type {
  NativeOnlineCategoryIndex,NativeOnlineCategoryRow,
  NativeOnlineCategory,NativeOnlineFamily
} from '../acquisition/public-online-categories.ts';

export const DB00_NATIVE_ONLINE_CONTRACT=
  'wand.game-db.native-online-category@1' as const;
const FAMILY_NAMES=Object.freeze([
  'Furniture','Clothing','Trimming','MountGear','Makeup',
  'Tool','Character','Companion','Skin'
] as const);
const CATEGORIES=Object.freeze(['premium','time_limited'] as const);
const FAMILY=new Set<string>(FAMILY_NAMES);
const CATEGORY=new Set<string>(CATEGORIES);
const LOCALE=new Set<string>([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
const SHA=/^[0-9a-f]{64}$/;
const EMPTY=Object.freeze([]) as readonly NativeOnlineCategoryRow[];
function check(condition:unknown,code:string):asserts condition{
  if(!condition)throw new TypeError('DB00_NATIVE_ONLINE_'+code);
}

export interface Db00NativeOnlineItem{
  readonly itemId:string;
  readonly classifications:readonly NativeOnlineCategoryRow[];
  /** False means no *explicit* Premium/TimeLimited classification in source. */
  readonly hasExplicitSourceCategory:boolean;
  readonly item:Db00SourceJoinedItem;
  readonly originalCategoryOnly:true;
  readonly specificOfferOrCampaignVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerAcquisitionVerified:false;
  readonly gameUiCollectionMembershipVerified:false;
}
export interface Db00NativeOnlineSearchRequest{
  readonly category?:NativeOnlineCategory;
  readonly family?:NativeOnlineFamily;
  /** Numeric Item ID prefix OR exact published ItemList localized name. */
  readonly text?:string;
  readonly locale?:DbLocale;
  /** Native source IDs outside the public ItemList remain visible by default. */
  readonly publishedOnly?:true;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00NativeOnlineSearchResult{
  readonly scope:'native_online_category_source_only';
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00NativeOnlineItem[];
  readonly originalCategoryOnly:true;
  readonly specificOfferOrCampaignVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerAcquisitionVerified:false;
  readonly gameUiCollectionMembershipVerified:false;
  readonly allItemTypesCovered:false;
}
export interface Db00NativeOnlineReader{
  readonly contract:typeof DB00_NATIVE_ONLINE_CONTRACT;
  readonly snapshotId:string;
  readonly sourceRows:2198;
  readonly sourceFamilies:9;
  readonly originalCategoryOnly:true;
  readonly specificOfferOrCampaignVerified:false;
  readonly playerAcquisitionVerified:false;
  getItem(itemId:string|number):Db00NativeOnlineItem;
  search(request?:Db00NativeOnlineSearchRequest):Db00NativeOnlineSearchResult;
}
/** DB-02 has already verified the exact bytes and all nine original files. */
export function createDb00NativeOnlineReader(
  database:SharedGameDatabase,
  joined:Db00SourceJoinedReader,
  source:NativeOnlineCategoryIndex
):Db00NativeOnlineReader{
  check(database?.contract==='wand.game-db.shared@1' &&
    database.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    database.itemCount===13202 &&
    database.target.platform==='Steam' &&
    database.target.gameVersion==='1.26.2' &&
    joined?.contract==='wand.game-db.source-join@1' &&
    joined.snapshotId===database.snapshotId,'CURRENT_ITEMLIST_REQUIRED');
  check(source?.schema==='wand.db02.native-online-category@1' &&
    source.gameVersion==='1.26.2' &&
    source.nativeEnum==='Definitions.Items.OnlineCategory' &&
    source.coverage.sourceFamilies===9 &&
    source.coverage.sourceDefinitionRecords===10109 &&
    source.coverage.premiumCategoryRows===1830 &&
    source.coverage.timeLimitedCategoryRows===368 &&
    source.coverage.explicitNonzeroCategoryRows===2198 &&
    source.coverage.singleOfferOrCampaignLinkVerified===false &&
    source.coverage.currentAvailabilityVerified===false &&
    source.coverage.playerAcquisitionVerified===false &&
    source.coverage.allItemTypesCovered===false &&
    Array.isArray(source.rows) && source.rows.length===2198 &&
    typeof source.getItemClassifications==='function' &&
    typeof source.getCategoryItemIds==='function' &&
    typeof source.getFamilyCategoryItemIds==='function',
    'EXACT_DB02_CATEGORY_READER_REQUIRED');
  const rows=new Map<string,NativeOnlineCategoryRow>();
  const categoryCount=new Map<NativeOnlineCategory,number>();
  const familyCount=new Map<NativeOnlineFamily,number>();
  for(const row of source.rows){
    const id=canonicalId(row.itemId);
    check(!rows.has(id) && FAMILY.has(row.family) &&
      CATEGORY.has(row.category) &&
      row.sourceFile==='StreamingAssets/itemlist/'+row.family+'.json' &&
      SHA.test(row.originalSha256) &&
      Number.isSafeInteger(row.categoryFieldNumber) &&
      row.categoryFieldNumber>0 &&
      row.originalCategoryOnly===true &&
      row.specificOfferOrCampaignVerified===false &&
      row.currentAvailabilityVerified===false &&
      row.playerAcquisitionVerified===false &&
      source.getItemClassifications(id).length===1 &&
      source.getItemClassifications(id)[0]===row,
      'SOURCE_ROW_OR_REVERSE_MISMATCH');
    rows.set(id,row);
    categoryCount.set(row.category,(categoryCount.get(row.category)??0)+1);
    familyCount.set(row.family,(familyCount.get(row.family)??0)+1);
  }
  check(rows.size===2198 && categoryCount.get('premium')===1830 &&
    categoryCount.get('time_limited')===368 &&
    FAMILY_NAMES.every(family=>familyCount.has(family)),
    'RELATION_CENSUS_MISMATCH');
  for(const category of CATEGORIES){
    check(source.getCategoryItemIds(category).length===categoryCount.get(category),
      'CATEGORY_CENSUS_MISMATCH');
    for(const family of FAMILY_NAMES){
      const sourceIds=source.getFamilyCategoryItemIds(family,category);
      check(sourceIds.every(id=>rows.get(id)?.family===family &&
        rows.get(id)?.category===category),
        'FAMILY_CATEGORY_REVERSE_MISMATCH');
    }
  }
  const sorted=Object.freeze([...rows.keys()].sort((a,b)=>Number(a)-Number(b)));
  function getItem(raw:string|number):Db00NativeOnlineItem{
    const id=canonicalId(raw);
    const classification=rows.get(id);
    const item=joined.getItem(id);
    check(item.itemId===id && item.currentlyAvailableVerified===false &&
      item.playerOwnershipVerified===false,'ITEM_JOIN_MISMATCH');
    return Object.freeze({
      itemId:id,
      classifications:classification?Object.freeze([classification]):EMPTY,
      hasExplicitSourceCategory:classification!==undefined,
      item,originalCategoryOnly:true as const,
      specificOfferOrCampaignVerified:false as const,
      currentAvailabilityVerified:false as const,
      playerAcquisitionVerified:false as const,
      gameUiCollectionMembershipVerified:false as const
    });
  }
  function search(
    request:Db00NativeOnlineSearchRequest={}
  ):Db00NativeOnlineSearchResult{
    check(request!==null&&typeof request==='object'&&!Array.isArray(request),
      'INVALID_REQUEST');
    const category=request.category,family=request.family;
    check(category===undefined||CATEGORY.has(category),'INVALID_CATEGORY');
    check(family===undefined||FAMILY.has(family),'INVALID_FAMILY');
    const locale=request.locale??'en';
    check(LOCALE.has(locale),'INVALID_LOCALE');
    const raw=request.text??'';
    check(typeof raw==='string'&&raw.length<=120&&
      !/[\x00-\x1f]/.test(raw),'INVALID_TEXT');
    const needle=raw.normalize('NFKC').toLocaleLowerCase().trim();
    check(request.publishedOnly===undefined||
      request.publishedOnly===true,'INVALID_PUBLISHED_FILTER');
    const offset=request.offset??0,limit=request.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,'INVALID_PAGE');
    const matches=sorted.filter(id=>{
      const row=rows.get(id)!;
      if(category&&row.category!==category)return false;
      if(family&&row.family!==family)return false;
      const published=database.getItem(id);
      if(request.publishedOnly&&!published)return false;
      if(needle && !(id.startsWith(needle)||
        (published?.names[locale]!==undefined &&
          published.names[locale]!.normalize('NFKC')
            .toLocaleLowerCase().includes(needle))))return false;
      return true;
    });
    const selected=matches.slice(offset,offset+limit).map(getItem);
    const next=offset+selected.length;
    return Object.freeze({
      scope:'native_online_category_source_only' as const,
      snapshotId:database.snapshotId,
      total:matches.length,offset,
      nextOffset:next<matches.length?next:null,
      items:Object.freeze(selected),
      originalCategoryOnly:true as const,
      specificOfferOrCampaignVerified:false as const,
      currentAvailabilityVerified:false as const,
      playerAcquisitionVerified:false as const,
      gameUiCollectionMembershipVerified:false as const,
      allItemTypesCovered:false as const
    });
  }
  return Object.freeze({
    contract:DB00_NATIVE_ONLINE_CONTRACT,
    snapshotId:database.snapshotId,
    sourceRows:2198 as const,
    sourceFamilies:9 as const,
    originalCategoryOnly:true as const,
    specificOfferOrCampaignVerified:false as const,
    playerAcquisitionVerified:false as const,
    getItem,search
  });
}
