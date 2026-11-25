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
/** July is an archived backup with a known minimum version, not a proven 1.26.2 live offer. */
export const DB02_ARCHIVED_SHOP_FILE='shop-cache-2026-07-15.json' as const;
export const DB02_ARCHIVED_SHOP_SHA=
  'fe10a2d69728b6f3cef8445922f4773f64d5946c6a7dbc01518d84f7fe960b1b' as const;
export const DB02_ARCHIVED_SHOP_BYTES=5838 as const;
const ARCHIVED_SOURCE_SHA='01a561793ecaa253457e89797da03e929ca8bb8e3dac7d257d786215584468a5';
const ARCHIVED_CORROBORATING_SHA='9553c37b141123b70550b64ef4bd683c7c08b84f52fc4a63e737b0e8e0a95138';
interface NativeShopSnapshotPolicy {
  readonly snapshotKey:'Shop20261118'|'Shop20260715';
  readonly file:string;
  readonly publicSha:string;
  readonly publicBytes:number;
  readonly sourceSha:string;
  readonly originalBytes:number;
  readonly sourcePath:string;
  readonly nativeVersion:number;
  readonly minVersion:string;
  readonly fullVersion:string|null;
  readonly captureDate:string;
  readonly first:string;
  readonly last:string;
  readonly offers:number;
  readonly itemRefs:number;
  readonly distinctIds:number;
  readonly discounts:number;
  readonly archived:boolean;
}
const CURRENT:NativeShopSnapshotPolicy=Object.freeze({
  snapshotKey:'Shop20261118',file:DB02_NATIVE_SHOP_FILE,
  publicSha:DB02_NATIVE_SHOP_SHA,publicBytes:DB02_NATIVE_SHOP_BYTES,
  sourceSha:SOURCE_SHA,originalBytes:72740,
  sourcePath:'Cache/liveops/stores.dat',nativeVersion:12604,
  minVersion:'1.26',fullVersion:'1.26.2',captureDate:'2026-11-22',
  first:'2026-11-18T14:00:00.098979Z',last:'2026-11-25T14:00:00Z',
  offers:29,itemRefs:156,distinctIds:136,discounts:2,archived:false
});
const ARCHIVED:NativeShopSnapshotPolicy=Object.freeze({
  snapshotKey:'Shop20260715',file:DB02_ARCHIVED_SHOP_FILE,
  publicSha:DB02_ARCHIVED_SHOP_SHA,publicBytes:DB02_ARCHIVED_SHOP_BYTES,
  sourceSha:ARCHIVED_SOURCE_SHA,originalBytes:70749,
  sourcePath:'Cache/liveops/stores.dat.backup-20260716',nativeVersion:12401,
  minVersion:'1.24',fullVersion:null,captureDate:'2026-07-16',
  first:'2026-07-15T13:00:00.632653200Z',last:'2026-07-22T13:00:00Z',
  offers:27,itemRefs:128,distinctIds:120,discounts:2,archived:true
});
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
  /** Native identity distinguishes reissues of the same offer ID across weeks. */
  readonly snapshotKey:'Shop20261118'|'Shop20260715';
  readonly sourceIntegrity:'original_sha256_and_pinned_public_projection';
  readonly offers:readonly NativeShopOffer[];
  readonly origins:readonly ItemOrigin[];
  readonly campaigns:readonly OfficialCampaign[];
  readonly coverage:Readonly<{
    readonly sourceOffers:number;
    readonly sourceItemOccurrences:number;
    readonly distinctSourceItemIds:number;
    readonly sourceDiscountedOffers:number;
    /** July is a local archive; full game-build identity is not established. */
    readonly fullGameVersionVerified:boolean;
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
function readProjection(
  raw:unknown,url:string,policy:NativeShopSnapshotPolicy
):PinnedPublicNativeShopIndex{
  assert(obj(raw)&&raw.schema===DB02_NATIVE_SHOP_SCHEMA&&
    obj(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion===policy.fullVersion&&obj(raw.source),
    'SCHEMA_OR_VERSION');
  const sourceMeta=raw.source;
  assert(sourceMeta.originalSha256===policy.sourceSha&&
    sourceMeta.originalBytes===policy.originalBytes&&
    sourceMeta.cachePath===policy.sourcePath&&
    sourceMeta.snapshotKey===policy.snapshotKey&&
    sourceMeta.nativeVersion===policy.nativeVersion&&
    sourceMeta.nativeMinGameVersion===policy.minVersion&&
    sourceMeta.captureDate===policy.captureDate&&
    (policy.archived?
      sourceMeta.fullGameVersionVerified===false&&
      sourceMeta.sourceIsArchivedBackup===true&&
      sourceMeta.corroboratingBackupSha256===ARCHIVED_CORROBORATING_SHA&&
      sourceMeta.backupDifferencesLimitedToUpdateTimestamps===true:
      sourceMeta.fullGameVersionVerified===undefined&&
      sourceMeta.sourceIsArchivedBackup===undefined)&&
    sourceMeta.currencyItemId==='80100000'&&
    sourceMeta.configuredOnly===true&&
    sourceMeta.currentAvailabilityVerified===false&&
    sourceMeta.accountOwnershipVerified===false&&
    sourceMeta.historicalCoverageComplete===false,
    'ORIGINAL_SOURCE_PROVENANCE');
  assert(obj(raw.window)&&raw.window.startUtc===policy.first&&
    raw.window.endUtcExclusive===policy.last&&
    obj(raw.counts)&&raw.counts.offers===policy.offers&&
    raw.counts.itemOccurrences===policy.itemRefs&&
    raw.counts.distinctItemIds===policy.distinctIds&&
    raw.counts.discountedOffers===policy.discounts&&
    Array.isArray(raw.offers)&&raw.offers.length===policy.offers,
    'SOURCE_CENSUS');
  const window:OriginWindow=Object.freeze({
    start:raw.window.startUtc as string,
    endExclusive:raw.window.endUtcExclusive as string
  });
  const source:OriginProvenance=Object.freeze({
    sourceId:policy.archived?'db02:shop-cache:Shop20260715':
      'db02:steam-1262:shop-20261118',
    kind:'verified_liveops_cache' as const,
    sourceUrl:url,checkedOn:policy.archived?'2026-11-23':'2026-11-22',
    gameVersion:policy.fullVersion,sha256:policy.publicSha
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
      const campaignId='native-shop:'+policy.snapshotKey+':'+offerId;
      const originId='db02:shop:'+policy.snapshotKey+':'+offerId+':'+slot;
      const conditions=[
        'Exact '+policy.snapshotKey+' cached offer ItemId link; not proof of a live sale, owned entitlement or granted item',
        'Native offer ID: '+offerId,
        'Source category: '+category,
        (policy.archived?'Source archived cache SHA-256: ':
          'Source stores.dat SHA-256: ')+policy.sourceSha,
        'Configured per-content Moonstone allocation: '+allocation+
          ' (not a separately purchasable price)'
      ];
      if(policy.archived)
        conditions.push('Archived cache only: source MinGameVersion '+policy.minVersion+
          ', full original game build and 1.26.2 storefront compatibility NOT verified');
      if(storeId!==null)conditions.push('Source store ID: '+storeId);
      if(discount!==null)
        conditions.push('Original sale discount: '+discount+
          '%; final checkout price NOT verified');
      routes.push(Object.freeze({
        originId,itemId,kind:'premium_shop' as const,
        routeStatus:'confirmed_source_link' as const,campaignId,
        name:(policy.archived?'Historical Premium Shop: ':'Premium Shop: ')+label,
        productId:offerId,quantity,
        price:null, // Only populate the offer-level subtotal after all components are read.
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
    byOffer.set(offerId,priced);
    Object.freeze(priced);
    offers.push(offer);offerMap.set(offerId,offer);
    campaigns.push(Object.freeze({
      campaignId:'native-shop:'+policy.snapshotKey+':'+offerId,
      kind:'premium_shop' as const,name:title??offerId,
      code:null,productId:offerId,window,
      conditions:Object.freeze([
        (policy.archived?
          'Archived Steam stores.dat backup, minimum game version 1.24; original build not proven, not verified available in v1.26.2':
          'Steam 1.26.2 stores.dat snapshot; source-proven offer contents, not live stock or personal purchase'),
        'Configured allocation sum: '+allocatedTotal+' Moonstones'+
          (discount===null?' (no source sale discount)':
            '; discount '+discount+'%, checkout price not verified'),
        'Source category: '+category,
        'Original cached stores.dat SHA-256: '+policy.sourceSha
      ]),
      rewards:Object.freeze(components.map(x=>Object.freeze({
        name:'Item '+x.itemId,itemId:x.itemId,quantity:x.quantity,
        cumulativeWatchMinutes:null
      }))),source,availability:'not_live_verified' as const
    }));
  }
  assert(offers.length===policy.offers&&origins.length===policy.itemRefs&&
    distinct.size===policy.distinctIds&&discounted===policy.discounts,
    'SOURCE_RELATION_CENSUS');
  for(const list of byItem.values())Object.freeze(list);
  const index:PinnedPublicNativeShopIndex=Object.freeze({
    schema:DB02_NATIVE_SHOP_SCHEMA,
    snapshotKey:policy.snapshotKey,
    sourceIntegrity:'original_sha256_and_pinned_public_projection' as const,
    offers:Object.freeze(offers),origins:Object.freeze(origins),
    campaigns:Object.freeze(campaigns),
    coverage:Object.freeze({
      sourceOffers:policy.offers,sourceItemOccurrences:policy.itemRefs,
      distinctSourceItemIds:policy.distinctIds,
      sourceDiscountedOffers:policy.discounts,
      fullGameVersionVerified:!policy.archived,
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
async function loadShopSnapshot(
  policy:NativeShopSnapshotPolicy,basePath:string,fetcher:typeof fetch
):Promise<PinnedPublicNativeShopIndex>{
  assert(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  const url=basePath+'/acquisition/public/'+policy.file;
  const response=await fetcher(url);
  assert(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  assert(bytes.byteLength===policy.publicBytes,'PROJECTION_SIZE');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  assert(hash===policy.publicSha,'PROJECTION_SHA');
  return readProjection(JSON.parse(new TextDecoder().decode(bytes)),url,policy);
}
/** Steam 1.26.2 source cache, without current live-availability claims. */
export function loadPinnedPublicNativeShopSnapshot(
  basePath='',fetcher:typeof fetch=fetch
):Promise<PinnedPublicNativeShopIndex>{
  return loadShopSnapshot(CURRENT,basePath,fetcher);
}
/** July 15–22 archived cache; original game build is NOT independently verified. */
export function loadPinnedHistoricalNativeShopSnapshot(
  basePath='',fetcher:typeof fetch=fetch
):Promise<PinnedPublicNativeShopIndex>{
  return loadShopSnapshot(ARCHIVED,basePath,fetcher);
}

/** Additional source-only bundle catalog projections. No sale dates or prices.
 * Existing pinned legacy sources remain accepted during migration; these new
 * snapshots do not populate the legacy sale-price or availability APIs. */
export interface ShopCatalogSource {
  readonly snapshotKey:string;
  readonly offers:readonly Readonly<{
    nativeOfferId:string;sourceCategory:string;title:string|null;
    components:readonly Readonly<{itemId:string;quantity:number}>[];
  }>[];
}
const CATALOG_SOURCE_PINS=[{"snapshotKey":"Shop20260923","sourceSha256":"d8e3d2bfe2707e8f00562adb19c98fb87efa21e9a6ac7d07370894712043b238","bytes":3905,"sha256":"41bf1546cdffa5ad6d88b71d4083e65bb50d934e5bb9ba62097beef7722961c4","count":28},{"snapshotKey":"Shop20260930","sourceSha256":"efed915841a02dcc5fa181a74b2064d2c8e1666014e495b4727182c04303162a","bytes":3950,"sha256":"6cf4b69888039fe13eb912dfa531548418bf4606bd6dfa1f563fdcfb9085ea9b","count":27}] as const;
const CATALOG_SOURCE_EVIDENCE=new WeakSet<object>();
export function hasPinnedShopCatalogEvidence(x:unknown):x is ShopCatalogSource {
  return hasPinnedPublicNativeShopEvidence(x)||(typeof x==='object'&&x!==null&&CATALOG_SOURCE_EVIDENCE.has(x));
}
export async function loadPinnedAdditionalShopCatalogSources(basePath='',fetcher:typeof fetch=fetch):Promise<readonly ShopCatalogSource[]>{
  assert(basePath===''||BASE.test(basePath),'INVALID_BASE_PATH');
  return Object.freeze(await Promise.all(CATALOG_SOURCE_PINS.map(async pin=>{
    const url=basePath+'/acquisition/public/shop-bundles-'+pin.snapshotKey+'.json';
    const response=await fetcher(url);
    assert(response.ok,'CATALOG_DOWNLOAD_FAILED');
    const bytes=await response.arrayBuffer();
    assert(bytes.byteLength===pin.bytes,'CATALOG_SIZE');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
    assert(hash===pin.sha256,'CATALOG_SHA');
    const d:unknown=JSON.parse(new TextDecoder().decode(bytes));
    assert(obj(d)&&d.schema==='wand.shop.bundle-catalog-source@1'&&d.snapshotKey===pin.snapshotKey&&
      d.sourceSha256===pin.sourceSha256&&d.sourceLocale==='en-US'&&Array.isArray(d.offers)&&d.offers.length===pin.count,'CATALOG_SOURCE');
    const seen=new Set<string>();
    const offers=d.offers.map((row:unknown)=>{
      assert(Array.isArray(row)&&row.length===4,'CATALOG_TUPLE');
      const [offerId,category,title,parts]=row;
      assert(typeof offerId==='string'&&NATIVE_ID.test(offerId)&&!seen.has(offerId)&&
        typeof category==='string'&&category.length>0&&category.length<=100&&
        (title===null||typeof title==='string'&&title.length>0&&title.length<=160)&&
        Array.isArray(parts)&&parts.length>0&&parts.length<=100,'CATALOG_OFFER');
      seen.add(offerId);
      const components=parts.map((part:unknown)=>{
        assert(Array.isArray(part)&&part.length===2&&positive(part[0])&&positive(part[1]),'CATALOG_COMPONENT');
        return Object.freeze({itemId:String(part[0]),quantity:part[1]});
      });
      return Object.freeze({nativeOfferId:offerId,sourceCategory:category,title,components:Object.freeze(components)});
    });
    const catalog:ShopCatalogSource=Object.freeze({snapshotKey:pin.snapshotKey,offers:Object.freeze(offers)});
    CATALOG_SOURCE_EVIDENCE.add(catalog);
    return catalog;
  })));
}
/** Shared catalog loader; all existing original-backed projections, without
 * forcing consumer code to use the legacy price or sale-period properties. */
export async function loadPinnedShopBundleSources(basePath='',fetcher:typeof fetch=fetch):Promise<readonly ShopCatalogSource[]>{
  const [current,historical,additional]=await Promise.all([
    loadPinnedPublicNativeShopSnapshot(basePath,fetcher),
    loadPinnedHistoricalNativeShopSnapshot(basePath,fetcher),
    loadPinnedAdditionalShopCatalogSources(basePath,fetcher)
  ]);
  return Object.freeze([historical,...additional,current]);
}
