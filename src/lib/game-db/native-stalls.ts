/**
 * DB-00 source-qualified read model for original Steam v1.26.2 stall slots.
 *
 * The original Building -> LootTable reference proves ONLY a configured pool.
 * It is never evidence of current stock, purchase price, purchasing eligibility,
 * player ownership or a Collection/world classification.
 */
import {canonicalId} from './model.ts';
import type {DbLocale,SharedGameDatabase} from './integrated.ts';
import type {Db00SourceJoinedReader,Db00SourceJoinedItem} from './source-join.ts';
import {
  hasPinnedNativeStallSlotEvidence,DB02_NATIVE_STALL_SCHEMA,
  type NativeStallSourceIndex,type NativeStallItemCandidate,
  type NativeStallWithPools,type NativeStallLootSlot
} from '../acquisition/public-native-stalls.ts';
import {
  hasPinnedNativeLootCandidateEvidence
} from '../acquisition/public-native-loot.ts';
import type {ItemOrigin} from '../acquisition/origins.ts';

export const DB00_NATIVE_STALL_CONTRACT=
  'wand.game-db.native-stall-pool-join@1' as const;
const LOCALES=new Set<string>([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
function check(ok:unknown,reason:string):asserts ok {
  if(!ok)throw new TypeError('DB00_NATIVE_STALL_'+reason);
}
export interface Db00NativeStallItem{
  readonly itemId:string;
  readonly item:Db00SourceJoinedItem;
  /** Independent from the 1,255 original origins: configured pool candidates. */
  readonly staticSlotCandidates:readonly NativeStallItemCandidate[];
  readonly staticSlotOrigins:readonly ItemOrigin[];
  readonly staticPoolOnly:true;
  readonly currentShopStockVerified:false;
  readonly currentPricesVerified:false;
  readonly purchasingEligibilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface Db00NativeStallSlotEntry{
  readonly candidate:NativeStallItemCandidate;
  readonly item:Db00SourceJoinedItem;
  readonly staticPoolOnly:true;
  readonly currentShopStockVerified:false;
  readonly currentPricesVerified:false;
}
export interface Db00NativeStallSlot{
  readonly sourceSlot:NativeStallLootSlot;
  readonly entries:readonly Db00NativeStallSlotEntry[];
  readonly staticPoolOnly:true;
  readonly liveShopAvailabilityVerified:false;
}
export interface Db00NativeStallDefinition{
  readonly sourceStall:NativeStallWithPools;
  /** May be outside the 13,202 published ItemList; never omit if so. */
  readonly stallItem:Db00SourceJoinedItem;
  readonly slots:readonly Db00NativeStallSlot[];
  readonly staticPoolOnly:true;
  readonly liveShopAvailabilityVerified:false;
  readonly currentPricesVerified:false;
  readonly playerUnlockVerified:false;
}
export interface Db00NativeStallPageRequest{
  readonly text?:string;
  readonly locale?:DbLocale;
  readonly publishedOnly?:true;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00NativeStallItemPage{
  readonly scope:'original_stall_slot_candidates_only';
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00NativeStallItem[];
  readonly currentShopStockVerified:false;
  readonly currentPricesVerified:false;
  readonly purchasingEligibilityVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface Db00NativeStallReader{
  readonly contract:typeof DB00_NATIVE_STALL_CONTRACT;
  readonly snapshotId:string;
  readonly staticStalls:65;
  readonly originalSlotReferences:335;
  readonly staticSlotCandidateRelations:1385;
  readonly distinctCandidateItemIds:606;
  readonly staticPoolOnly:true;
  readonly liveShopAvailabilityVerified:false;
  readonly currentPricesVerified:false;
  readonly playerOwnershipVerified:false;
  getItem(itemId:string|number):Db00NativeStallItem;
  getStall(stallId:string|number):Db00NativeStallDefinition|null;
  /** Reverse original LootTable -> every distinct source stall slot. */
  getTableSlots(lootTableId:string|number):readonly Db00NativeStallSlot[];
  /** ShopData key is a literal original config key, NOT a localized shop. */
  getShopDataStalls(shopDataKey:string):readonly Db00NativeStallDefinition[];
  listShopDataKeys():readonly string[];
  searchItems(request?:Db00NativeStallPageRequest):Db00NativeStallItemPage;
}

/** Requires the DB-02's separately pinned Building and LootTable readers. */
export function createDb00NativeStallReader(
  database:SharedGameDatabase,
  joined:Db00SourceJoinedReader,
  source:NativeStallSourceIndex
):Db00NativeStallReader{
  check(database?.contract==='wand.game-db.shared@1' &&
    database.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    database.itemCount===13202 &&
    database.target.platform==='Steam' &&
    database.target.gameVersion==='1.26.2' &&
    joined?.contract==='wand.game-db.source-join@1' &&
    joined.snapshotId===database.snapshotId,
    'CURRENT_ITEMLIST_REQUIRED');
  const coverage=source?.coverage;
  check(source?.schema==='wand.db02.native-stall-loot-join@1' &&
    source.gameVersion==='1.26.2' &&
    hasPinnedNativeStallSlotEvidence(source.stallDefinitions) &&
    hasPinnedNativeLootCandidateEvidence(source.lootCandidates) &&
    source.stallDefinitions.schema===DB02_NATIVE_STALL_SCHEMA &&
    source.stallDefinitions.gameVersion==='1.26.2' &&
    source.stallDefinitions.source.sha256===
      'e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0' &&
    source.lootCandidates.source.sha256===
      '580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c' &&
    coverage?.nativeBuildingDefinitions===478 &&
    coverage.staticStallDefinitions===65 &&
    coverage.slotLootTableReferences===335 &&
    coverage.distinctReferencedLootTableIds===279 &&
    coverage.slotExpandedCandidateRelations===1385 &&
    coverage.distinctCandidateItemIds===606 &&
    coverage.distinctStallItemPairs===745 &&
    coverage.distinctStallTableItemTriples===1173 &&
    coverage.conditionalCandidateRelations===0 &&
    coverage.liveShopStockVerified===false &&
    coverage.livePurchasePriceVerified===false &&
    coverage.purchasabilityVerified===false &&
    coverage.playerUnlockVerified===false &&
    coverage.staticStorePoolOnly===true &&
    source.stallDefinitions.stalls.length===65 &&
    source.slotExpandedCandidates.length===1385 &&
    source.staticCandidateOrigins.length===1385 &&
    source.listCandidateItemIds().length===606 &&
    typeof source.getStall==='function' &&
    typeof source.getItemCandidates==='function',
    'PINNED_DB02_STALL_SOURCE_REQUIRED');

  function getItem(id:string|number):Db00NativeStallItem{
    const itemId=canonicalId(id);
    const item=joined.getItem(itemId);
    const staticSlotCandidates=source.getItemCandidates(itemId);
    const staticSlotOrigins=source.getItemStaticOrigins(itemId);
    check(item.itemId===itemId &&
      item.playerOwnershipVerified===false &&
      item.currentlyAvailableVerified===false &&
      staticSlotCandidates.length===staticSlotOrigins.length &&
      staticSlotCandidates.every(candidate=>
        candidate.itemId===itemId &&
        candidate.routeStatus==='static_candidate_only' &&
        candidate.staticStorePoolOnly===true &&
        candidate.stallSlotReferenceVerified===true &&
        candidate.itemInReferencedLootTableVerified===true &&
        candidate.liveStockVerified===false &&
        candidate.livePriceVerified===false &&
        candidate.purchaseEligibilityVerified===false &&
        staticSlotOrigins.some(origin=>
          origin.itemId===itemId &&
          origin.originId==='native:stall:'+candidate.stallId+':'+
            candidate.slotIndex+':'+candidate.lootGroupIndex+':'+
            candidate.lootCandidateOrdinal &&
          origin.routeStatus==='static_candidate_only' &&
          origin.kind==='game_shop' &&
          origin.price===null &&
          origin.availability==='not_live_verified')),
      'SOURCE_SLOT_ITEM_ID_OR_STATUS_MISMATCH');
    return Object.freeze({
      itemId,item,staticSlotCandidates,staticSlotOrigins,
      staticPoolOnly:true as const,
      currentShopStockVerified:false as const,
      currentPricesVerified:false as const,
      purchasingEligibilityVerified:false as const,
      playerOwnershipVerified:false as const,
      collectionUiMembershipVerified:false as const
    });
  }
  function wrapSlot(slot:NativeStallLootSlot):Db00NativeStallSlot{
    const entries=Object.freeze(slot.candidateRelations.map(candidate=>{
      check(candidate.stallId===slot.stallId &&
        candidate.slotIndex===slot.slotIndex &&
        candidate.lootTableId===slot.lootTableId,
        'SOURCE_SLOT_TABLE_ID_MISMATCH');
      const item=getItem(candidate.itemId);
      check(item.staticSlotCandidates.includes(candidate),
        'REVERSE_STALL_CANDIDATE_MISMATCH');
      return Object.freeze({
        candidate,item:item.item,staticPoolOnly:true as const,
        currentShopStockVerified:false as const,
        currentPricesVerified:false as const
      });
    }));
    check(slot.liveStockVerified===false &&
      entries.length===slot.candidateRelations.length,
      'SOURCE_SLOT_STOCK_STATUS_MISMATCH');
    return Object.freeze({
      sourceSlot:slot,entries,staticPoolOnly:true as const,
      liveShopAvailabilityVerified:false as const
    });
  }
  function wrapStall(store:NativeStallWithPools|null):
    Db00NativeStallDefinition|null{
    if(store===null)return null;
    const stallItem=joined.getItem(store.stall.stallId);
    const slots=Object.freeze(store.slots.map(wrapSlot));
    check(stallItem.itemId===store.stall.stallId &&
      slots.length===store.stall.slotLootTableIds.length &&
      slots.every((slot,index)=>
        slot.sourceSlot.slotIndex===index &&
        slot.sourceSlot.lootTableId===store.stall.slotLootTableIds[index]) &&
      store.liveStockVerified===false &&
      store.purchaseEligibilityVerified===false &&
      store.stall.liveStockVerified===false &&
      store.stall.currentPricesVerified===false,
      'SOURCE_STALL_SLOT_ORDER_OR_STATUS_MISMATCH');
    return Object.freeze({
      sourceStall:store,stallItem,slots,staticPoolOnly:true as const,
      liveShopAvailabilityVerified:false as const,
      currentPricesVerified:false as const,
      playerUnlockVerified:false as const
    });
  }
  function searchItems(request:Db00NativeStallPageRequest={}):
    Db00NativeStallItemPage{
    check(request!==null&&typeof request==='object'&&!Array.isArray(request),
      'INVALID_REQUEST');
    const locale=request.locale??'en';
    check(LOCALES.has(locale),'INVALID_LOCALE');
    const raw=request.text??'';
    check(typeof raw==='string'&&raw.length<=120 &&
      !/[\x00-\x1f]/.test(raw),'INVALID_TEXT');
    check(request.publishedOnly===undefined||request.publishedOnly===true,
      'INVALID_PUBLISHED_FILTER');
    const offset=request.offset??0,limit=request.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0 &&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,'INVALID_PAGE');
    const needle=raw.normalize('NFKC').toLocaleLowerCase().trim();
    const ids=source.listCandidateItemIds().filter(itemId=>{
      const published=database.getItem(itemId);
      if(request.publishedOnly&&!published)return false;
      return !needle||itemId.startsWith(needle)||
        !!published?.names[locale]?.normalize('NFKC')
          .toLocaleLowerCase().includes(needle);
    });
    const items=Object.freeze(ids.slice(offset,offset+limit).map(getItem));
    const next=offset+items.length;
    return Object.freeze({
      scope:'original_stall_slot_candidates_only' as const,
      snapshotId:database.snapshotId,total:ids.length,offset,
      nextOffset:next<ids.length?next:null,
      items,currentShopStockVerified:false as const,
      currentPricesVerified:false as const,
      purchasingEligibilityVerified:false as const,
      collectionUiMembershipVerified:false as const
    });
  }

  return Object.freeze({
    contract:DB00_NATIVE_STALL_CONTRACT,
    snapshotId:database.snapshotId,
    staticStalls:65 as const,originalSlotReferences:335 as const,
    staticSlotCandidateRelations:1385 as const,
    distinctCandidateItemIds:606 as const,
    staticPoolOnly:true as const,
    liveShopAvailabilityVerified:false as const,
    currentPricesVerified:false as const,
    playerOwnershipVerified:false as const,
    getItem,
    getStall:(id:string|number)=>wrapStall(source.getStall(canonicalId(id))),
    getTableSlots:(id:string|number)=>
      Object.freeze(source.getTableSlots(canonicalId(id)).map(wrapSlot)),
    getShopDataStalls:(key:string)=>
      Object.freeze(source.getShopDataStalls(key).map(store=>wrapStall(store)!)),
    listShopDataKeys:()=>source.stallDefinitions.listShopDataKeys(),
    searchItems
  });
}
