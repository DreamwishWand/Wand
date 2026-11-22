/**
 * Source-pinned Premium Shop appearance history, without an online storefront.
 *
 * Only recombines two already-SHA-checked native caches. Repeated offer IDs
 * mean that the SAME ID was recorded in two snapshots; they do not prove
 * that a product was continuously on sale or bought by the user.
 *
 * No network calls, save reading/writing, account access or private data.
 */
import {
  hasPinnedPublicNativeShopEvidence,
  type NativeShopOffer,
  type PinnedPublicNativeShopIndex
} from './public-native-shop.ts';
import type {ItemOrigin, OriginWindow, OriginProvenance} from './origins.ts';

export const DB02_SHOP_HISTORY_SCHEMA='wand.db02.shop-appearance-history@1' as const;
type SnapshotKey='Shop20260715'|'Shop20261118';
type AppearanceKind='archived_minimum_version_only'|'steam_1262_snapshot';
const ID=/^[1-9][0-9]{0,15}$/;
const EMPTY_ORIGINS=Object.freeze([]) as readonly ItemOrigin[];
const EMPTY_OFFERS=Object.freeze([]) as readonly ShopOfferAppearance[];

export interface ShopOfferAppearance {
  readonly snapshotKey:SnapshotKey;
  /** July's original full build was not identified. */
  readonly sourceGameVersion:string|null;
  readonly evidenceKind:AppearanceKind;
  readonly offer:NativeShopOffer;
  readonly nativeOfferId:string;
  readonly observedWindow:OriginWindow;
  readonly source:OriginProvenance;
  /** Pinned original component relation rows (no reconstructed grants). */
  readonly origins:readonly ItemOrigin[];
  /** Source component total, NOT a confirmed checkout transaction amount. */
  readonly configuredAllocationTotal:number;
  readonly saleDiscountPercent:number|null;
  readonly availability:'not_live_verified';
}
export interface ShopOfferHistory {
  readonly nativeOfferId:string;
  readonly appearances:readonly ShopOfferAppearance[];
  readonly firstObservedWindow:OriginWindow;
  readonly lastObservedWindow:OriginWindow;
  /** Same native ID in both caches, not proof of an uninterrupted sale. */
  readonly idObservedInMultipleSnapshots:boolean;
  /** Compares multiset of [ItemId,quantity] across observed versions. */
  readonly identicalRewardContentsAcrossSnapshots:boolean;
  /** Compares [ItemId,quantity,component allocation] across versions. */
  readonly identicalConfiguredPriceAllocationsAcrossSnapshots:boolean;
  /** Distinct component Item IDs over all observed appearances. */
  readonly distinctItemIds:readonly string[];
  readonly liveAvailabilityVerified:false;
}
export interface ShopItemHistory {
  readonly itemId:string;
  /** Repeated component rows and separate weeks are deliberately preserved. */
  readonly origins:readonly ItemOrigin[];
  readonly observedNativeOfferIds:readonly string[];
  readonly observedSnapshotKeys:readonly SnapshotKey[];
  readonly distinctOfferIds:number;
  readonly observedComponentOccurrences:number;
  readonly liveAvailabilityVerified:false;
}
export interface NativeShopHistoryCoverage {
  readonly observedSnapshots:2;
  readonly observedOffers:56;
  readonly distinctNativeOfferIds:48;
  readonly repeatedNativeOfferIds:8;
  readonly componentOccurrences:284;
  readonly distinctItemIds:186;
  readonly julyItemIdsAbsentFromNovember:50;
  readonly novemberItemIdsAbsentFromJuly:66;
  readonly fullHistoryVerified:false;
  readonly liveAvailabilityVerified:false;
  readonly ownedEntitlementsVerified:false;
  readonly checkoutPriceVerified:false;
  readonly julyFullGameVersionVerified:false;
}
export interface NativeShopHistoryIndex {
  readonly schema:typeof DB02_SHOP_HISTORY_SCHEMA;
  readonly sourceIntegrity:'both_native_shop_projections_sha_pinned';
  readonly coverage:NativeShopHistoryCoverage;
  readonly offers:readonly ShopOfferHistory[];
  readonly repeatedOffers:readonly ShopOfferHistory[];
  getOfferHistory(nativeOfferId:string):ShopOfferHistory|null;
  getItemHistory(itemId:number|string):ShopItemHistory|null;
  getItemOrigins(itemId:number|string):readonly ItemOrigin[];
  getOfferAppearance(snapshotKey:SnapshotKey,offerId:string):ShopOfferAppearance|null;
}
function assert(condition:unknown,why:string):asserts condition{
  if(!condition)throw new TypeError('DB02_SHOP_HISTORY_'+why);
}
function normalizeId(value:string|number):string|null{
  const s=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  return typeof s==='string'&&ID.test(s)&&Number.isSafeInteger(Number(s))
    ?s:null;
}
function contentsKey(offer:NativeShopOffer,prices:boolean):string{
  return JSON.stringify(offer.components.map(c=>prices?
    [c.itemId,c.quantity,c.componentMoonstoneAllocation]:
    [c.itemId,c.quantity]
  ).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
function freezeUnique(values:Iterable<string>):readonly string[]{
  return Object.freeze([...new Set(values)].sort());
}
/**
 * Build an immediately usable 2026-07 + 2026-11 offer and per-Item ID history.
 * The input capability tokens can only be constructed by the SHA-checking
 * original-projection loader, not by passing a user-authored lookalike object.
 */
export function indexNativeShopHistory(
  current:PinnedPublicNativeShopIndex,
  historical:PinnedPublicNativeShopIndex
):NativeShopHistoryIndex{
  assert(hasPinnedPublicNativeShopEvidence(current)&&
    hasPinnedPublicNativeShopEvidence(historical)&&
    current.snapshotKey==='Shop20261118'&&
    historical.snapshotKey==='Shop20260715'&&
    current.sourceIntegrity==='original_sha256_and_pinned_public_projection'&&
    historical.sourceIntegrity==='original_sha256_and_pinned_public_projection'&&
    current.coverage.sourceOffers===29&&
    current.coverage.sourceItemOccurrences===156&&
    current.coverage.distinctSourceItemIds===136&&
    current.coverage.fullGameVersionVerified===true&&
    historical.coverage.sourceOffers===27&&
    historical.coverage.sourceItemOccurrences===128&&
    historical.coverage.distinctSourceItemIds===120&&
    historical.coverage.fullGameVersionVerified===false&&
    current.coverage.currentAvailabilityVerified===false&&
    historical.coverage.currentAvailabilityVerified===false,
    'TWO_PINNED_NATIVE_SNAPSHOTS_REQUIRED');

  const offerAppearances=new Map<string,ShopOfferAppearance[]>();
  const appearancesBySnapshot=new Map<string,ShopOfferAppearance>();
  const itemRoutes=new Map<string,ItemOrigin[]>();
  const itemSnapshotKeys=new Map<string,Set<SnapshotKey>>();
  const itemOfferIds=new Map<string,Set<string>>();
  const perSnapshotItemIds:[Set<string>,Set<string>]=[new Set(),new Set()];

  for(const [index,source] of [historical,current].entries()){
    const snapshotKey=source.snapshotKey;
    const evidenceKind:AppearanceKind=index===0?
      'archived_minimum_version_only':'steam_1262_snapshot';
    for(const offer of source.offers){
      const origins=source.getOfferOrigins(offer.nativeOfferId);
      assert(origins.length>0&&origins.length===offer.components.length,
        'OFFER_COMPONENT_COUNT');
      const provenance=origins[0].source;
      assert(provenance.gameVersion===(index===0?null:'1.26.2')&&
        provenance.kind==='verified_liveops_cache',
        'SOURCE_GAME_VERSION');
      const appearance:ShopOfferAppearance=Object.freeze({
        snapshotKey,evidenceKind,
        sourceGameVersion:provenance.gameVersion,
        offer,nativeOfferId:offer.nativeOfferId,
        observedWindow:offer.observedWindow,
        source:provenance,origins,
        configuredAllocationTotal:offer.configuredAllocationTotal,
        saleDiscountPercent:offer.saleDiscountPercent,
        availability:'not_live_verified' as const
      });
      const key=snapshotKey+':'+offer.nativeOfferId;
      assert(!appearancesBySnapshot.has(key),'DUPLICATE_SNAPSHOT_OFFER');
      appearancesBySnapshot.set(key,appearance);
      const existing=offerAppearances.get(offer.nativeOfferId)??[];
      existing.push(appearance);
      offerAppearances.set(offer.nativeOfferId,existing);
      for(let slot=0;slot<origins.length;slot++){
        const route=origins[slot],part=offer.components[slot];
        assert(route.itemId===part.itemId&&route.quantity===part.quantity&&
          route.campaignId==='native-shop:'+snapshotKey+':'+offer.nativeOfferId&&
          route.originId.startsWith('db02:shop:'+snapshotKey+':')&&
          route.availability==='not_live_verified'&&
          route.source===provenance,
          'SOURCE_COMPONENT_MISMATCH');
        const routes=itemRoutes.get(route.itemId)??[];
        routes.push(route);itemRoutes.set(route.itemId,routes);
        const keys=itemSnapshotKeys.get(route.itemId)??new Set<SnapshotKey>();
        keys.add(snapshotKey);itemSnapshotKeys.set(route.itemId,keys);
        const offers=itemOfferIds.get(route.itemId)??new Set<string>();
        offers.add(offer.nativeOfferId);itemOfferIds.set(route.itemId,offers);
        perSnapshotItemIds[index].add(route.itemId);
      }
    }
  }

  const offerMap=new Map<string,ShopOfferHistory>();
  const histories:ShopOfferHistory[]=[];
  const repeated:ShopOfferHistory[]=[];
  for(const [nativeOfferId,all] of offerAppearances){
    assert(all.length>=1&&all.length<=2,'OFFER_HISTORY_COUNT');
    const sorted=Object.freeze([...all].sort((a,b)=>
      (a.observedWindow.start??'').localeCompare(b.observedWindow.start??'')));
    const first=sorted[0];
    const last=sorted[sorted.length-1];
    const sameContents=sorted.length===1||
      contentsKey(first.offer,false)===contentsKey(last.offer,false);
    const sameAllocations=sorted.length===1||
      contentsKey(first.offer,true)===contentsKey(last.offer,true);
    const history:ShopOfferHistory=Object.freeze({
      nativeOfferId,
      appearances:sorted,
      firstObservedWindow:first.observedWindow,
      lastObservedWindow:last.observedWindow,
      idObservedInMultipleSnapshots:sorted.length>1,
      identicalRewardContentsAcrossSnapshots:sameContents,
      identicalConfiguredPriceAllocationsAcrossSnapshots:sameAllocations,
      distinctItemIds:freezeUnique(sorted.flatMap(a=>
        a.offer.components.map(c=>c.itemId))),
      liveAvailabilityVerified:false as const
    });
    histories.push(history);
    if(history.idObservedInMultipleSnapshots)repeated.push(history);
    offerMap.set(nativeOfferId,history);
  }
  histories.sort((a,b)=>a.nativeOfferId.localeCompare(b.nativeOfferId));
  repeated.sort((a,b)=>a.nativeOfferId.localeCompare(b.nativeOfferId));
  const itemMap=new Map<string,ShopItemHistory>();
  for(const [itemId,rows] of itemRoutes){
    // Historic first, current second; preserve component slot order within each.
    const origins=Object.freeze(rows);
    const observedNativeOfferIds=freezeUnique(itemOfferIds.get(itemId)??[]);
    const observedSnapshotKeys=Object.freeze(
      [...itemSnapshotKeys.get(itemId)??[]].sort()) as readonly SnapshotKey[];
    itemMap.set(itemId,Object.freeze({
      itemId,origins,observedNativeOfferIds,observedSnapshotKeys,
      distinctOfferIds:observedNativeOfferIds.length,
      observedComponentOccurrences:origins.length,
      liveAvailabilityVerified:false as const
    }));
  }
  const julyOnly=[...perSnapshotItemIds[0]]
    .filter(id=>!perSnapshotItemIds[1].has(id)).length;
  const novemberOnly=[...perSnapshotItemIds[1]]
    .filter(id=>!perSnapshotItemIds[0].has(id)).length;
  assert(histories.length===48&&repeated.length===8&&
    [...itemRoutes.values()].reduce((n,rows)=>n+rows.length,0)===284&&
    itemMap.size===186&&julyOnly===50&&novemberOnly===66,
    'SOURCE_HISTORY_CENSUS');
  const coverage:NativeShopHistoryCoverage=Object.freeze({
    observedSnapshots:2 as const,observedOffers:56 as const,
    distinctNativeOfferIds:48 as const,repeatedNativeOfferIds:8 as const,
    componentOccurrences:284 as const,distinctItemIds:186 as const,
    julyItemIdsAbsentFromNovember:50 as const,
    novemberItemIdsAbsentFromJuly:66 as const,
    fullHistoryVerified:false as const,
    liveAvailabilityVerified:false as const,
    ownedEntitlementsVerified:false as const,
    checkoutPriceVerified:false as const,
    julyFullGameVersionVerified:false as const
  });
  return Object.freeze({
    schema:DB02_SHOP_HISTORY_SCHEMA,
    sourceIntegrity:'both_native_shop_projections_sha_pinned' as const,
    coverage,offers:Object.freeze(histories),
    repeatedOffers:Object.freeze(repeated),
    getOfferHistory(offerId:string){return offerMap.get(offerId)??null;},
    getOfferAppearance(key:SnapshotKey,id:string){
      return appearancesBySnapshot.get(key+':'+id)??null;
    },
    getItemHistory(raw:string|number){
      return itemMap.get(normalizeId(raw)??'')??null;
    },
    getItemOrigins(raw:string|number){
      return itemMap.get(normalizeId(raw)??'')?.origins??EMPTY_ORIGINS;
    }
  });
}
