/**
 * DB-02's authenticated, PUBLIC-ONLY native Premium Shop snapshot.
 * Original Steam v1.26.2 Cache/liveops/stores.dat stays private. The tiny
 * published projection preserves exact offer IDs, source category, Item IDs,
 * quantities, per-content price allocations and explicit sale discounts.
 *
 * This is a dated native CONFIGURATION, not proof of current availability,
 * purchase, owned entitlements, discounted checkout prices or complete history.
 */
import type {
  ItemOrigin, OfficialCampaign, OriginProvenance, OriginWindow
} from './origins.ts';

export const DB02_NATIVE_SHOP_SCHEMA='wand.db02.public-native-shop-snapshot@1' as const;
export const DB02_NATIVE_SHOP_FILE='shop-cache-2026-11-22.json' as const;
export const DB02_NATIVE_SHOP_SHA=
  '310e1f0cfc907efda4107b6d8602fbf6c5af92739edff6592d0ce10449a5ad07' as const;
export const DB02_NATIVE_SHOP_BYTES=6470 as const;
const SOURCE_SHA='233c03e73d22503dba2f6b0961ecaa8f36ac7ef16848bb88c35e2d86f696b1ff';
const SOURCE_ID='db02:steam-1262:shop-20261118';
const ID=/^[1-9][0-9]{0,15}$/;
const NATIVE_ID=/^[A-Za-z][A-Za-z0-9_]{1,99}$/;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const PINNED=new WeakSet<object>();
const EMPTY=Object.freeze([]) as readonly ItemOrigin[];

export interface NativeShopComponent {
  readonly itemId:string;
  readonly quantity:number;
  /** Original component price allocation, NOT a separately purchasable price. */
  readonly componentMoonstoneAllocation:number;
}
export interface NativeShopOffer {
  readonly nativeOfferId:string;
  readonly nativeStoreId:string|null;
  readonly sourceCategory:string;
  readonly title:string|null;
  readonly saleDiscountPercent:number|null;
  readonly configuredAllocationTotal:number;
  readonly components:readonly NativeShopComponent[];
  /** Cache observation window, not proof of an offer's independent expiration. */
  readonly observedWindow:OriginWindow;
}
export interface PinnedPublicNativeShopIndex {
  readonly schema:typeof DB02_NATIVE_SHOP_SCHEMA;
  readonly sourceIntegrity:'original_sha256_and_pinned_public_projection';
  readonly offers:readonly NativeShopOffer[];
  readonly origins:readonly ItemOrigin[];
  readonly campaigns:readonly OfficialCampaign[];
  readonly coverage:Readonly<{
    readonly sourceOffers:29;
    readonly sourceItemOccurrences:156;
    readonly distinctSourceItemIds:136;
    readonly sourceDiscountedOffers:2;
    readonly currentAvailabilityVerified:false;
    readonly accountOwnershipVerified:false;
    readonly discountCheckoutPriceVerified:false;
    readonly historicalCoverageComplete:false;
  }>;
  getOffer(nativeOfferId:string):NativeShopOffer|null;
  getOfferOrigins(nativeOfferId:string):readonly ItemOrigin[];
  getItemCandidates(itemId:string|number):readonly ItemOrigin[];
}
function assert(ok:unknown,why:string):asserts ok{
  if(!ok)throw new TypeError('DB02_NATIVE_SHOP_'+why);
}
function obj(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function validId(x:unknown):x is string{
  return typeof x==='string'&&ID.test(x)&&Number.isSafeInteger(Number(x));
}
function id(raw:string|number):string|null{
  const x=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  return validId(x)?x:null;
}
function positive(x:unknown):x is number{
  return typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
}
function readProjection(raw:unknown,url:string):PinnedPublicNativeShopIndex{
  assert(obj(raw)&&raw.schema===DB02_NATIVE_SHOP_SCHEMA&&
    obj(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&obj(raw.source),
    'SCHEMA_OR_VERSION');
  const sourceMeta=raw.source;
  assert(sourceMeta.originalSha256===SOURCE_SHA&&
    sourceMeta.originalBytes===72740&&
    sourceMeta.cachePath==='Cache/liveops/stores.dat'&&
    sourceMeta.snapshotKey==='Shop20261118'&&
    sourceMeta.nativeVersion===12604&&
    sourceMeta.nativeMinGameVersion==='1.26'&&
    sourceMeta.captureDate==='2026-11-22'&&
    sourceMeta.currencyItemId==='80100000'&&
    sourceMeta.configuredOnly===true&&
    sourceMeta.currentAvailabilityVerified===false&&
    sourceMeta.accountOwnershipVerified===false&&
    sourceMeta.historicalCoverageComplete===false,
    'ORIGINAL_SOURCE_PROVENANCE');
  assert(obj(raw.window)&&raw.window.startUtc==='2026-11-18T14:00:00.098979Z'&&
    raw.window.endUtcExclusive==='2026-11-25T14:00:00Z'&&
    obj(raw.counts)&&raw.counts.offers===29&&
    raw.counts.itemOccurrences===156&&
    raw.counts.distinctItemIds===136&&
    raw.counts.discountedOffers===2&&
    Array.isArray(raw.offers)&&raw.offers.length===29,
    'SOURCE_CENSUS');
  const window:OriginWindow=Object.freeze({
    start:raw.window.startUtc as string,
    endExclusive:raw.window.endUtcExclusive as string
  });
  const source:OriginProvenance=Object.freeze({
    sourceId:SOURCE_ID,kind:'verified_liveops_cache' as const,
    sourceUrl:url,checkedOn:'2026-11-22',
    gameVersion:'1.26.2',sha256:DB02_NATIVE_SHOP_SHA
  });
  const campaigns:OfficialCampaign[]=[];
  const offers:NativeShopOffer[]=[];
  const origins:ItemOrigin[]=[];
  const byOffer=new Map<string,ItemOrigin[]>();
  const byItem=new Map<string,ItemOrigin[]>();
  const offerMap=new Map<string,NativeShopOffer>();
  const distinct=new Set<string>();
  let discounted=0;
  for(const rawOffer of raw.offers){
    assert(Array.isArray(rawOffer)&&rawOffer.length===6,'OFFER_TUPLE');
    const [offerId,storeId,category,title,discount,parts]=rawOffer as unknown[];
    assert(typeof offerId==='string'&&NATIVE_ID.test(offerId)&&
      (storeId===null||typeof storeId==='string'&&NATIVE_ID.test(storeId))&&
      typeof category==='string'&&category.length>0&&category.length<=100&&
      (title===null||typeof title==='string'&&title.length>0&&title.length<=160)&&
      (discount===null||positive(discount)&&discount<100)&&
      Array.isArray(parts)&&parts.length>0&&parts.length<=100&&
      !offerMap.has(offerId),'OFFER_IDENTITY');
    if(discount!==null)discounted++;
    const components:NativeShopComponent[]=[];
    const routes:ItemOrigin[]=[];
    let allocatedTotal=0;
    for(let slot=0;slot<parts.length;slot++){
      const sourcePart=parts[slot];
      assert(Array.isArray(sourcePart)&&sourcePart.length===3&&
        validId(sourcePart[0])&&positive(sourcePart[1])&&
        positive(sourcePart[2]),'COMPONENT_TUPLE');
      const [itemId,quantity,allocation]=sourcePart as [string,number,number];
      distinct.add(itemId);
      allocatedTotal+=allocation;
      assert(Number.isSafeInteger(allocatedTotal),'ALLOCATION_OVERFLOW');
      components.push(Object.freeze({
        itemId,quantity,componentMoonstoneAllocation:allocation
      }));
      const label=title??offerId;
      const campaignId='native-shop:Shop20261118:'+offerId;
      const originId='db02:shop:Shop20261118:'+offerId+':'+slot;
      const conditions=[
        'Exact native Shop20261118 offer ItemId link; not a current sale, owned entitlement or granted item',
        'Native offer ID: '+offerId,
        'Source category: '+category,
        'Source stores.dat SHA-256: '+SOURCE_SHA,
        'Configured per-content Moonstone allocation: '+allocation+
          ' (not a separately purchasable price)'
      ];
      if(storeId!==null)conditions.push('Source store ID: '+storeId);
      if(discount!==null)
        conditions.push('Original sale discount: '+discount+
          '%; final checkout price NOT verified');
      routes.push(Object.freeze({
        originId,itemId,kind:'premium_shop' as const,
        routeStatus:'confirmed_source_link' as const,campaignId,
        name:'Premium Shop: '+label,productId:offerId,quantity,
        price:discount===null?Object.freeze({
          quantity:0,currency:'Moonstones',currencyItemId:'80100000'
        }):null,
        accessTier:'premium' as const,window,
        salePeriods:Object.freeze([window]),conditions:Object.freeze(conditions),
        source,availability:'not_live_verified' as const
      }));
    }
    const offer:NativeShopOffer=Object.freeze({
      nativeOfferId:offerId,nativeStoreId:storeId,
      sourceCategory:category,title,saleDiscountPercent:discount,
      configuredAllocationTotal:allocatedTotal,
      components:Object.freeze(components),observedWindow:window
    });
    // The source stores component-level price allocations. A bundle-level
    // subtotal is their SUM, not the price of an individual item. Discounted
    // final checkout totals may depend on account state and stay unverified.
    const priced=routes.map(route=>Object.freeze({
      ...route,
      price:discount===null?Object.freeze({
        quantity:allocatedTotal,currency:'Moonstones',currencyItemId:'80100000'
      }):null
    }));
    for(const origin of priced){
      origins.push(origin);
      const links=byItem.get(origin.itemId)??[];
      links.push(origin);byItem.set(origin.itemId,links);
    }
    byOffer.set(offerId,Object.freeze(priced));
    offers.push(offer);offerMap.set(offerId,offer);
    campaigns.push(Object.freeze({
      campaignId:'native-shop:Shop20261118:'+offerId,
      kind:'premium_shop' as const,name:title??offerId,
      code:null,productId:offerId,window,
      conditions:Object.freeze([
        'Steam 1.26.2 stores.dat snapshot; source-proven offer contents, not live stock or personal purchase',
        'Configured allocation sum: '+allocatedTotal+' Moonstones'+
          (discount===null?' (no source sale discount)':
            '; discount '+discount+'%, checkout price not verified'),
        'Source category: '+category,
        'Original stores.dat SHA-256: '+SOURCE_SHA
      ]),
      rewards:Object.freeze(components.map(x=>Object.freeze({
        name:'Item '+x.itemId,itemId:x.itemId,quantity:x.quantity,
        cumulativeWatchMinutes:null
      }))),source,availability:'not_live_verified' as const
    }));
  }
  assert(offers.length===29&&origins.length===156&&distinct.size===136&&
    discounted===2,'SOURCE_RELATION_CENSUS');
  for(const list of byItem.values())Object.freeze(list);
  const index:PinnedPublicNativeShopIndex=Object.freeze({
    schema:DB02_NATIVE_SHOP_SCHEMA,
    sourceIntegrity:'original_sha256_and_pinned_public_projection' as const,
    offers:Object.freeze(offers),origins:Object.freeze(origins),
    campaigns:Object.freeze(campaigns),
    coverage:Object.freeze({
      sourceOffers:29 as const,sourceItemOccurrences:156 as const,
      distinctSourceItemIds:136 as const,sourceDiscountedOffers:2 as const,
      currentAvailabilityVerified:false as const,
      accountOwnershipVerified:false as const,
      discountCheckoutPriceVerified:false as const,
      historicalCoverageComplete:false as const
    }),
    getOffer(nativeOfferId:string){return offerMap.get(nativeOfferId)??null;},
    getOfferOrigins(nativeOfferId:string){return byOffer.get(nativeOfferId)??EMPTY;},
    getItemCandidates(itemId:string|number){return byItem.get(id(itemId)??'')??EMPTY;}
  });
  PINNED.add(index);
  return index;
}
export function hasPinnedPublicNativeShopEvidence(x:unknown):x is PinnedPublicNativeShopIndex{
  return x!==null&&typeof x==='object'&&PINNED.has(x);
}
/** Public browser loader; never fetches private stores.dat or a user session. */
export async function loadPinnedPublicNativeShopSnapshot(
  basePath='',fetcher:typeof fetch=fetch
):Promise<PinnedPublicNativeShopIndex>{
  assert(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  const url=basePath+'/acquisition/public/'+DB02_NATIVE_SHOP_FILE;
  const response=await fetcher(url);
  assert(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  assert(bytes.byteLength===DB02_NATIVE_SHOP_BYTES,'PROJECTION_SIZE');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  assert(hash===DB02_NATIVE_SHOP_SHA,'PROJECTION_SHA');
  return readProjection(JSON.parse(new TextDecoder().decode(bytes)),url);
}
