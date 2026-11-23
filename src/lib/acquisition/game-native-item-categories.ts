/**
 * DB-02 four acquisition categories, sourced ONLY from original DDV game files.
 *
 * This is a many-to-many Item ID classification, not a historical shop calendar.
 * No offer dates/prices, code tokens, Twitch campaigns, websites, server queries
 * or name-only matches are used. A category is never proof of live availability.
 *
 * Critically, native OnlineCategory.Premium/TimeLimited are broad metadata enums:
 * neither proves a Premium Shop offer nor identifies a Twitch Drop/redeem code.
 * They remain UNRESOLVED native hints, not false positive categories.
 */
import {
  ORIGIN_SCHEMA,type OriginDatabase,type ItemOrigin
} from './origins.ts';
import {hasPinnedPublicIapEvidence,type PublicIapSourceIndex}
  from './public-static-iap.ts';
import {STARPATH_PUBLIC_SHA} from '../guide/public-starpath.ts';
import {
  hasPinnedPublicEventFriendshipEvidence,
  type PublicEventFriendshipAcquisitionIndex
} from '../guide/public-event-friendship-acquisition.ts';
import {
  hasPinnedPublicNativeShopEvidence,
  type PinnedPublicNativeShopIndex
} from './public-native-shop.ts';
import {
  hasPinnedNativePetSourceEvidence,type NativePetSourceIndex,
  type NativePetSourceCategory
} from './public-pet-source-categories.ts';
import {
  hasPinnedNativeOnlineCategoryEvidence,
  type NativeOnlineCategoryIndex,type NativeOnlineCategory
} from './public-online-categories.ts';

export const DB02_GAME_NATIVE_ITEM_CATEGORIES_SCHEMA=
  'wand.db02.game-native-item-categories@1' as const;
const CATEGORIES=Object.freeze([
  'premium_shop','star_path','in_game_limited_event','real_time_limited_event',
  'iap_package_reward'
] as const);
export type GameNativeItemCategory=typeof CATEGORIES[number];
export type GameNativeCategoryEvidenceBasis=
  'original_shop_offer_item_id'|'original_star_path_reward_item_id'|
  'original_game_event_reward_item_id'|'original_pet_source_enum'|
  'original_iap_package_reward_item_id';
const ID=/^[1-9][0-9]{0,15}$/;
const EMPTY=Object.freeze([]) as readonly GameNativeCategoryEvidence[];
const EMPTY_CATEGORIES=Object.freeze([]) as readonly GameNativeItemCategory[];
const EMPTY_NATIVE=Object.freeze([]) as readonly NativeOnlineCategory[];
const EMPTY_IDS=Object.freeze([]) as readonly string[];
const BRAND=new WeakSet<object>();

export interface GameNativeCategoryEvidence {
  readonly itemId:string;
  readonly category:GameNativeItemCategory;
  readonly basis:GameNativeCategoryEvidenceBasis;
  /** The original Item ID is a configured offer/reward link or native enum. */
  readonly exactItemIdInOriginalSource:true;
  /** Explicit native enum, not an individual reward/offer association. */
  readonly originalCategoryOnly:boolean;
  /** Distinct from specific Twitch, code or other campaign identity. */
  readonly specificExternalCampaignVerified:false;
  readonly currentAvailabilityVerified:false;
}
export interface GameNativeItemCategoryRecord {
  readonly itemId:string;
  readonly categories:readonly GameNativeItemCategory[];
  readonly evidence:readonly GameNativeCategoryEvidence[];
  /** Original generic Premium/TimeLimited enum, NOT a specific category. */
  readonly unresolvedNativeOnlineCategories:readonly NativeOnlineCategory[];
  readonly unknownBecauseNoCategoryEvidence:boolean;
  readonly currentAvailabilityVerified:false;
}
export interface GameNativeItemCategoryIndex {
  readonly schema:typeof DB02_GAME_NATIVE_ITEM_CATEGORIES_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly originalGameFilesOnly:true;
  readonly complete:false;
  readonly coverage:Readonly<{
    originalShopItemOccurrences:284;
    nativeStarPathRewardOccurrences:67;
    nativeGameEventRewardOccurrences:202;
    originalIapPackageRewardOccurrences:291;
    nativePetPremiumShopRows:95;
    nativePetStarPathRows:7;
    nativePetGameEventRows:9;
    nativePetExclusivePromotionRows:14;
    unresolvedOriginalPremiumRows:1830;
    unresolvedOriginalTimeLimitedRows:368;
    distinctClassifiedItemIds:number;
    premiumShopItemIds:number;
    starPathItemIds:number;
    inGameLimitedEventItemIds:number;
    realTimeLimitedEventItemIds:number;
    iapPackageRewardItemIds:number;
    explicitlyMappedTwitchDropItemIds:0;
    explicitlyMappedCampaignCodeItemIds:0;
    dateOrPriceEvidenceUsed:false;
    thirdPartyOrOfficialWebEvidenceUsed:false;
    gameSourceCoverageComplete:false;
    currentAvailabilityVerified:false;
  }>;
  getItem(itemId:string|number):GameNativeItemCategoryRecord;
  listItemIds(category?:GameNativeItemCategory):readonly string[];
}
function check(value:unknown,why:string):asserts value{
  if(!value)throw new TypeError('DB02_GAME_NATIVE_CATEGORY_'+why);
}
function itemId(raw:unknown):string {
  const value=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  check(typeof value==='string'&&ID.test(value)&&
    Number.isSafeInteger(Number(value)),'INVALID_ITEM_ID');
  return value;
}
function sorted(values:Iterable<string>):readonly string[]{
  return Object.freeze([...new Set(values)].sort((a,b)=>Number(a)-Number(b)));
}
function validOriginalShopRelation(origin:ItemOrigin):boolean{
  return origin.kind==='premium_shop'&&
    origin.source.kind==='verified_liveops_cache'&&
    origin.source.sha256!==null&&
    origin.routeStatus==='confirmed_source_link';
}
function validOriginalRewardRelation(
  origin:ItemOrigin,kind:'starpath'|'event'
):boolean{
  return kind==='starpath'?
    ['star_path_free','star_path_premium','star_path_vault'].includes(origin.kind)&&
    origin.originId.startsWith('starpath:')&&
    origin.routeStatus==='confirmed_source_link'&&
    origin.source.kind==='verified_liveops_cache'&&
    origin.source.sha256===STARPATH_PUBLIC_SHA:
    origin.kind==='event_reward'&&
    origin.originId.startsWith('db03:source:event:')&&
    origin.routeStatus==='static_candidate_only'&&
    origin.source.kind==='verified_game_native'&&
    origin.source.sha256!==null;
}
function nativePetCategory(category:NativePetSourceCategory):GameNativeItemCategory|null{
  switch(category){
    case 'premium_shop':return 'premium_shop';
    case 'star_path':return 'star_path';
    case 'event':return 'in_game_limited_event';
    case 'exclusive_promotion':return 'real_time_limited_event';
    case 'quest':case 'timebending':return null;
  }
}
/**
 * Takes only authenticated original file projections. Does not use the mixed
 * OriginDatabase's official/publication/campaign records: only 67 source-pinned
 * Star Path reward Item IDs are selected from it.
 */
export function indexGameNativeItemCategories(
  origins:OriginDatabase,
  currentShop:PinnedPublicNativeShopIndex,
  archivedShop:PinnedPublicNativeShopIndex,
  iap:PublicIapSourceIndex,
  rewards:PublicEventFriendshipAcquisitionIndex,
  pets:NativePetSourceIndex,
  online:NativeOnlineCategoryIndex
):GameNativeItemCategoryIndex{
  check(origins?.schema===ORIGIN_SCHEMA&&
    origins.getCoverage().linkedRoutes===1255&&
    hasPinnedPublicNativeShopEvidence(currentShop)&&
    hasPinnedPublicNativeShopEvidence(archivedShop)&&
    currentShop.snapshotKey==='Shop20261118'&&
    archivedShop.snapshotKey==='Shop20260715'&&
    currentShop.origins.length===156&&archivedShop.origins.length===128&&
    currentShop.coverage.currentAvailabilityVerified===false&&
    archivedShop.coverage.currentAvailabilityVerified===false&&
    hasPinnedPublicIapEvidence(iap)&&
    iap.coverage.nativePackages===53&&
    iap.coverage.combinedRewardReferences===291&&
    iap.coverage.currentAvailabilityVerified===false&&
    hasPinnedPublicEventFriendshipEvidence(rewards)&&
    rewards.coverage.eventRewardCandidates===202&&
    rewards.coverage.guaranteedGrantsVerified===false&&
    hasPinnedNativePetSourceEvidence(pets)&&
    pets.coverage.explicitSourceRows===134&&
    pets.coverage.nativePremiumStorePetIds===95&&
    pets.coverage.nativeExclusivePromotionPetIds===14&&
    hasPinnedNativeOnlineCategoryEvidence(online)&&
    online.coverage.premiumCategoryRows===1830&&
    online.coverage.timeLimitedCategoryRows===368&&
    online.coverage.singleOfferOrCampaignLinkVerified===false,
    'ORIGINAL_SOURCE_REQUIRED');

  const byItem=new Map<string,GameNativeCategoryEvidence[]>();
  const unique=new Set<string>();
  function add(
    rawId:string,category:GameNativeItemCategory,
    basis:GameNativeCategoryEvidenceBasis,sourceKey:string,
    originalCategoryOnly:boolean
  ):void{
    const id=itemId(rawId),key=basis+':'+sourceKey;
    check(!unique.has(key),'DUPLICATE_ORIGINAL_RELATION');
    unique.add(key);
    const entry:GameNativeCategoryEvidence=Object.freeze({
      itemId:id,category,basis,exactItemIdInOriginalSource:true as const,
      originalCategoryOnly,
      specificExternalCampaignVerified:false as const,
      currentAvailabilityVerified:false as const
    });
    const rows=byItem.get(id);
    if(rows)rows.push(entry);else byItem.set(id,[entry]);
  }
  for(const source of [currentShop,archivedShop]){
    for(const origin of source.origins){
      check(validOriginalShopRelation(origin)&&
        source.getItemCandidates(origin.itemId).includes(origin),
        'INVALID_SHOP_SOURCE_ORIGIN');
      add(origin.itemId,'premium_shop','original_shop_offer_item_id',
        origin.originId,false);
    }
  }
  let iapCount=0;
  for(const origin of iap.origins){
    check(origin.kind==='purchase_bonus'&&
      origin.routeStatus==='confirmed_source_link'&&
      origin.source.kind==='verified_game_native'&&
      origin.source.sha256!==null&&
      iap.getItemOrigins(origin.itemId).includes(origin),
      'INVALID_IAP_SOURCE_ORIGIN');
    add(origin.itemId,'iap_package_reward',
      'original_iap_package_reward_item_id',origin.originId,false);
    iapCount++;
  }
  check(iapCount===291,'IAP_SOURCE_CENSUS');
  let starpathCount=0;
  for(const id of origins.listLinkedItemIds()){
    for(const origin of origins.getItem(id).origins){
      if(!origin.kind.startsWith('star_path_'))continue;
      check(validOriginalRewardRelation(origin,'starpath'),
        'INVALID_STARPATH_SOURCE_ORIGIN');
      add(origin.itemId,'star_path','original_star_path_reward_item_id',
        origin.originId,false);
      starpathCount++;
    }
  }
  check(starpathCount===67,'STARPATH_CENSUS');
  let eventCount=0;
  for(const origin of rewards.origins){
    if(origin.kind!=='event_reward')continue;
    check(validOriginalRewardRelation(origin,'event')&&
      rewards.getItemCandidates(origin.itemId).includes(origin),
      'INVALID_NATIVE_EVENT_ORIGIN');
    add(origin.itemId,'in_game_limited_event',
      'original_game_event_reward_item_id',origin.originId,false);
    eventCount++;
  }
  check(eventCount===202,'NATIVE_EVENT_CENSUS');
  let petClassified=0;
  for(const row of pets.classifications){
    const category=nativePetCategory(row.category);
    if(category===null)continue;
    check(row.sourceCategoryOnly===true&&
      row.campaignLinkVerified===false&&
      row.playerAcquisitionVerified===false,
      'INVALID_NATIVE_PET_SOURCE');
    add(row.itemId,category,'original_pet_source_enum',
      row.itemId+':'+row.category,true);
    petClassified++;
  }
  check(petClassified===125,'PET_SOURCE_CENSUS');

  const byCategory=new Map<GameNativeItemCategory,Set<string>>(
    CATEGORIES.map(c=>[c,new Set()])
  );
  for(const [id,entries] of byItem){
    for(const entry of entries)byCategory.get(entry.category)!.add(id);
    Object.freeze(entries);
  }
  const known=sorted(byItem.keys());
  const sortedByCategory=new Map<GameNativeItemCategory,readonly string[]>(
    CATEGORIES.map(c=>[c,sorted(byCategory.get(c)!)])
  );
  // Generic original OnlineCategory metadata is deliberately not converted
  // into a shop / event identity. We still let callers identify unresolved IDs.
  const nativeHints=new Map<string,readonly NativeOnlineCategory[]>();
  for(const row of online.rows){
    check(row.originalCategoryOnly===true&&
      row.specificOfferOrCampaignVerified===false,'INVALID_ONLINE_HINT');
    nativeHints.set(row.itemId,online.getItemCategories(row.itemId));
  }
  check(nativeHints.size===2198,'ONLINE_SOURCE_CENSUS');
  const records=new Map<string,GameNativeItemCategoryRecord>();
  for(const id of new Set([...byItem.keys(),...nativeHints.keys()])){
    const evidence=byItem.get(id)??EMPTY;
    const categories=Object.freeze(CATEGORIES.filter(c=>
      evidence.some(row=>row.category===c)
    ));
    const hints=nativeHints.get(id)??EMPTY_NATIVE;
    records.set(id,Object.freeze({
      itemId:id,categories,evidence,
      unresolvedNativeOnlineCategories:hints,
      unknownBecauseNoCategoryEvidence:evidence.length===0,
      currentAvailabilityVerified:false as const
    }));
  }
  const coverage=Object.freeze({
    originalShopItemOccurrences:284 as const,
    nativeStarPathRewardOccurrences:67 as const,
    nativeGameEventRewardOccurrences:202 as const,
    originalIapPackageRewardOccurrences:291 as const,
    nativePetPremiumShopRows:95 as const,
    nativePetStarPathRows:7 as const,
    nativePetGameEventRows:9 as const,
    nativePetExclusivePromotionRows:14 as const,
    unresolvedOriginalPremiumRows:1830 as const,
    unresolvedOriginalTimeLimitedRows:368 as const,
    distinctClassifiedItemIds:known.length,
    premiumShopItemIds:sortedByCategory.get('premium_shop')!.length,
    starPathItemIds:sortedByCategory.get('star_path')!.length,
    inGameLimitedEventItemIds:sortedByCategory.get('in_game_limited_event')!.length,
    realTimeLimitedEventItemIds:sortedByCategory.get('real_time_limited_event')!.length,
    iapPackageRewardItemIds:sortedByCategory.get('iap_package_reward')!.length,
    explicitlyMappedTwitchDropItemIds:0 as const,
    explicitlyMappedCampaignCodeItemIds:0 as const,
    dateOrPriceEvidenceUsed:false as const,
    thirdPartyOrOfficialWebEvidenceUsed:false as const,
    gameSourceCoverageComplete:false as const,
    currentAvailabilityVerified:false as const
  });
  const index:GameNativeItemCategoryIndex=Object.freeze({
    schema:DB02_GAME_NATIVE_ITEM_CATEGORIES_SCHEMA,
    gameVersion:'1.26.2' as const,originalGameFilesOnly:true as const,
    complete:false as const,coverage,
    getItem(raw:string|number){
      const id=itemId(raw);
      return records.get(id)??Object.freeze({
        itemId:id,categories:EMPTY_CATEGORIES,evidence:EMPTY,
        unresolvedNativeOnlineCategories:EMPTY_NATIVE,
        unknownBecauseNoCategoryEvidence:true as const,
        currentAvailabilityVerified:false as const
      });
    },
    listItemIds(category?:GameNativeItemCategory){
      if(category===undefined)return known;
      check(CATEGORIES.includes(category),'INVALID_CATEGORY');
      return sortedByCategory.get(category)??EMPTY_IDS;
    }
  });
  BRAND.add(index);
  return index;
}
export function hasGameNativeItemCategoryEvidence(
  value:unknown
):value is GameNativeItemCategoryIndex{
  return value!==null&&typeof value==='object'&&BRAND.has(value);
}
