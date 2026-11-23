/**
 * DB-00 read-only, on-demand native companion source-category join.
 *
 * The original Steam 1.26.2 PetItemData.Source field is an enum category.
 * Even 'premium_shop' and 'exclusive_promotion' DO NOT link to a concrete
 * offer, redemption code, Twitch campaign, owned pet or actual grant.
 *
 * Reuse DB-02's byte/SHA-verified public projection. No private original
 * Companion.json, save files, or new collection membership is introduced.
 */
import {canonicalId} from './model.ts';
import type {
  SharedGameDatabase,DbLocale
} from './integrated.ts';
import type {
  Db00SourceJoinedReader,Db00SourceJoinedItem
} from './source-join.ts';
import {
  hasPinnedNativePetSourceEvidence,
  type NativePetSourceIndex,type NativePetSourceClassification,
  type NativePetSourceCategory
} from '../acquisition/public-pet-source-categories.ts';

export const DB00_NATIVE_COMPANIONS_CONTRACT='wand.game-db.native-companions@1' as const;
const ORIGINAL_SHA='62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219';
const CATEGORIES:ReadonlySet<string>=new Set([
  'quest','timebending','event','star_path','premium_shop','exclusive_promotion'
]);
const LOCALES:ReadonlySet<string>=new Set([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB00_NATIVE_COMPANIONS_'+reason);
}
export interface Db00NativeCompanionItem{
  readonly itemId:string;
  readonly classifications:readonly NativePetSourceClassification[];
  /** null/empty was not a verified no-acquisition proof. */
  readonly sourceClassified:boolean;
  readonly originalSourceField:9;
  readonly item:Db00SourceJoinedItem;
  readonly sourceCategoryOnly:true;
  readonly specificCampaignLinkVerified:false;
  readonly playerAcquisitionVerified:false;
  readonly gameUiCollectionMembershipVerified:false;
}
export interface Db00NativeCompanionSearchRequest{
  readonly category?:NativePetSourceCategory;
  /** Item ID prefix OR currently published localized name substring. */
  readonly text?:string;
  readonly locale?:DbLocale;
  /** Without this option, include source-verified native IDs outside ItemList. */
  readonly publishedOnly?:true;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00NativeCompanionSearchResult{
  readonly scope:'native_companion_source_categories';
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00NativeCompanionItem[];
  readonly sourceCategoryOnly:true;
  readonly specificCampaignLinkVerified:false;
  readonly playerAcquisitionVerified:false;
  readonly gameUiCollectionMembershipVerified:false;
  readonly allItemTypesCovered:false;
}
export interface Db00NativeCompanionReader{
  readonly contract:typeof DB00_NATIVE_COMPANIONS_CONTRACT;
  readonly snapshotId:string;
  readonly categoryRows:134;
  readonly sourceCategoryOnly:true;
  readonly specificCampaignLinkVerified:false;
  readonly playerAcquisitionVerified:false;
  getItem(itemId:string|number):Db00NativeCompanionItem;
  search(request?:Db00NativeCompanionSearchRequest):Db00NativeCompanionSearchResult;
}

export function createDb00NativeCompanionReader(
  db:SharedGameDatabase,
  joined:Db00SourceJoinedReader,
  source:NativePetSourceIndex
):Db00NativeCompanionReader{
  check(db?.contract==='wand.game-db.shared@1'&&
    db.snapshotId==='steam-1.26.2-native-itemlist-v1'&&
    db.itemCount===13202&&db.target.platform==='Steam'&&
    db.target.gameVersion==='1.26.2'&&
    joined?.contract==='wand.game-db.source-join@1'&&
    joined.snapshotId===db.snapshotId,
    'CURRENT_PUBLIC_ITEMLIST_REQUIRED');
  check(hasPinnedNativePetSourceEvidence(source)&&
    source.schema==='wand.db02.native-pet-source-categories@1'&&
    source.gameVersion==='1.26.2'&&
    source.originalSha256===ORIGINAL_SHA&&
    source.coverage.explicitSourceRows===134&&
    source.coverage.nativePremiumStorePetIds===95&&
    source.coverage.nativeExclusivePromotionPetIds===14&&
    source.coverage.specificOnlineCampaignLinksVerified===0&&
    source.coverage.playerAcquisitionVerified===false&&
    source.coverage.allItemTypesCovered===false,
    'PINNED_NATIVE_PET_SOURCE_REQUIRED');
  const ids=new Set<string>();
  const classificationById=new Map<string,NativePetSourceClassification>();
  for(const row of source.classifications){
    check(!ids.has(row.itemId)&&
      row.sourceCategoryOnly===true&&
      row.campaignLinkVerified===false&&
      row.playerAcquisitionVerified===false&&
      row.originalFieldNumber===9&&
      CATEGORIES.has(row.category),
      'INVALID_COMPANION_SOURCE_REFERENCE');
    ids.add(row.itemId);classificationById.set(row.itemId,row);
    check(source.getItemClassifications(row.itemId).length===1&&
      source.getItemClassifications(row.itemId)[0]===row,
      'SOURCE_REVERSE_IDENTITY_MISMATCH');
  }
  check(ids.size===134,'SOURCE_CENSUS_MISMATCH');
  for(const category of CATEGORIES){
    const rowIds=source.getCategoryItemIds(category as NativePetSourceCategory);
    check(rowIds.every(id=>classificationById.get(id)?.category===category),
      'CATEGORY_REVERSE_MISMATCH');
  }
  const sortedIds=Object.freeze([...ids].sort((a,b)=>Number(a)-Number(b)));
  const EMPTY=Object.freeze([]) as readonly NativePetSourceClassification[];
  const getItem=(raw:string|number):Db00NativeCompanionItem=>{
    const id=canonicalId(raw);
    const classification=classificationById.get(id);
    const item=joined.getItem(id);
    check(item.itemId===id&&
      item.currentlyAvailableVerified===false&&
      item.playerOwnershipVerified===false,
      'ITEM_ID_OR_OWNERSHIP_MISMATCH');
    return Object.freeze({
      itemId:id,
      classifications:classification?Object.freeze([classification]):EMPTY,
      sourceClassified:classification!==undefined,
      originalSourceField:9 as const,
      item,
      sourceCategoryOnly:true as const,
      specificCampaignLinkVerified:false as const,
      playerAcquisitionVerified:false as const,
      gameUiCollectionMembershipVerified:false as const
    });
  };
  function search(
    request:Db00NativeCompanionSearchRequest={}
  ):Db00NativeCompanionSearchResult{
    check(request!==null&&typeof request==='object'&&!Array.isArray(request),
      'INVALID_REQUEST');
    const category=request.category;
    check(category===undefined||typeof category==='string'&&
      CATEGORIES.has(category),'INVALID_CATEGORY');
    const locale=request.locale??'en';
    check(typeof locale==='string'&&LOCALES.has(locale),'INVALID_LOCALE');
    const raw=request.text??'';
    check(typeof raw==='string'&&raw.length<=120&&
      !/[\x00-\x1f]/.test(raw),'INVALID_TEXT');
    const text=raw.normalize('NFKC').toLocaleLowerCase().trim();
    check(request.publishedOnly===undefined||
      request.publishedOnly===true,'INVALID_PUBLISHED_FILTER');
    const offset=request.offset??0,limit=request.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,'INVALID_PAGE');
    const matched=sortedIds.filter(id=>{
      if(category&&classificationById.get(id)?.category!==category)return false;
      const item=db.getItem(id);
      if(request.publishedOnly&&item===null)return false;
      if(text&&!(id.startsWith(text)||
        (item?.names[locale]!==undefined&&
          item.names[locale]!.normalize('NFKC').toLocaleLowerCase().includes(text))))
        return false;
      return true;
    });
    const page=matched.slice(offset,offset+limit).map(getItem);
    const next=offset+page.length;
    return Object.freeze({
      scope:'native_companion_source_categories' as const,
      snapshotId:db.snapshotId,total:matched.length,offset,
      nextOffset:next<matched.length?next:null,
      items:Object.freeze(page),
      sourceCategoryOnly:true as const,
      specificCampaignLinkVerified:false as const,
      playerAcquisitionVerified:false as const,
      gameUiCollectionMembershipVerified:false as const,
      allItemTypesCovered:false as const
    });
  }
  return Object.freeze({
    contract:DB00_NATIVE_COMPANIONS_CONTRACT,
    snapshotId:db.snapshotId,
    categoryRows:134 as const,
    sourceCategoryOnly:true as const,
    specificCampaignLinkVerified:false as const,
    playerAcquisitionVerified:false as const,
    getItem,search
  });
}
