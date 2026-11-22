/**
 * Source-pinned IAP-to-IAP references extracted from original protoDb.bin.
 * Original IL2CPP schema:
 *   IAPData.NestedRewards = field 11 (string IAP pack key)
 *   IAPData.AdditionalIAPPacks = field 19
 *   AdditionalIAPPack.IapPack = field 1
 *   SupportedMarketplaceType = field 2 (enum 9 = AppleAppStore)
 *   UnsupportedMarketplaceType = field 3
 *
 * A reference is NOT proof of an ownership grant, paid DLC entitlement,
 * nested Item reward, available storefront, or account synchronization.
 * The 291 direct/extended Item origins stay in public-static-iap.ts.
 */
import {
  hasPinnedPublicIapEvidence,type PublicIapSourceIndex
} from './public-static-iap.ts';
import type {OriginProvenance} from './origins.ts';

export const DB02_IAP_PACK_LINKS_SCHEMA='wand.db02.public-iap-pack-references@1' as const;
export const DB02_IAP_PACK_LINKS_FILE='iap-pack-links-1.26.2.json' as const;
export const DB02_IAP_PACK_LINKS_BYTES=1501 as const;
export const DB02_IAP_PACK_LINKS_SHA=
  '13811ffa3a6e1f1a11aa418f229c0ac30101c942f65dad47cf48f3e635b075e6' as const;

const SOURCE_SHA='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const PACKAGE=/^[A-Za-z][A-Za-z0-9_]{1,95}$/;
const EMPTY=Object.freeze([]) as readonly NativeIapPackReference[];
const PINNED=new WeakSet<object>();

export type IapPackReferenceKind='nested_rewards'|'additional_pack';
export interface NativeIapPackReference{
  readonly fromPackageId:string;
  readonly toPackageId:string;
  readonly kind:IapPackReferenceKind;
  readonly originalFieldPath:'IAPData.NestedRewards[11]'|
    'IAPData.AdditionalIAPPacks[19].IapPack[1]';
  /** Numeric native SupportedMarketplaceType values, not inferred platform availability. */
  readonly supportedMarketplaces:readonly number[];
  readonly unsupportedMarketplaces:readonly number[];
  readonly declaredAppleAppStoreOnly:boolean;
  readonly source:OriginProvenance;
  readonly grantsNestedRewardsVerified:false;
  readonly grantsAdditionalPackageVerified:false;
  readonly accountEntitlementVerified:false;
  readonly currentStorefrontAvailabilityVerified:false;
}
export interface PinnedIapPackReferenceIndex{
  readonly schema:typeof DB02_IAP_PACK_LINKS_SCHEMA;
  readonly sourceIntegrity:'pinned_original_protoDb_and_independent_public_projection';
  readonly references:readonly NativeIapPackReference[];
  readonly coverage:Readonly<{
    readonly nativeIapPackages:53;
    readonly nativeNestedReferences:3;
    readonly nativeAdditionalReferences:3;
    readonly appleAppStoreOnlyAdditionalReferences:3;
    readonly totalPackReferences:6;
    readonly danglingPackReferences:0;
    readonly onlineRewardGrantsVerified:0;
    readonly accountEntitlementVerified:false;
    readonly storefrontAvailabilityVerified:false;
    readonly nestedRewardExpansionVerified:false;
  }>;
  getFromPackage(packageId:string):readonly NativeIapPackReference[];
  getToPackage(packageId:string):readonly NativeIapPackReference[];
  getNestedRewardPath(packageId:string):readonly string[]|null;
  /**
   * Only source-declared marketplace filters, not proof of live checkout or
   * actual entitlement. Marketplace 5=Steam; 9=AppleAppStore in IL2CPP.
   */
  getAdditionalForMarketplace(
    packageId:string,marketplaceEnum:number
  ):readonly NativeIapPackReference[];
}

function assert(x:unknown,why:string):asserts x{
  if(!x)throw new TypeError('DB02_IAP_PACK_LINKS_'+why);
}
function obj(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function safePackage(x:unknown):x is string{
  return typeof x==='string'&&PACKAGE.test(x);
}
function enumList(x:unknown):x is number[]{
  return Array.isArray(x)&&x.length<=64&&x.every(v=>
    typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=65535
  )&&new Set(x).size===x.length;
}
function authenticate(
  raw:unknown,url:string,iap:PublicIapSourceIndex
):PinnedIapPackReferenceIndex{
  assert(hasPinnedPublicIapEvidence(iap)&&
    iap.schema==='wand.db02.public-static-iap@1'&&
    iap.coverage.nativePackages===53&&
    iap.coverage.nestedPackageReferences===3&&
    iap.coverage.nestedRewardsExpanded===false,
    'AUTHENTICATED_NATIVE_IAP_REQUIRED');
  assert(obj(raw)&&raw.schema===DB02_IAP_PACK_LINKS_SCHEMA&&
    obj(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&obj(raw.source)&&
    obj(raw.coverage)&&Array.isArray(raw.relations)&&
    raw.relations.length===6,
    'PROJECTION_SCHEMA');
  const source=raw.source;
  const counts=raw.coverage;
  assert(source.originalSourceGameVersion==='1.26.1'&&
    source.originalFileEquivalentTo1262===true&&
    source.originalProtoDbSha256===SOURCE_SHA&&
    source.originalProtoDbBytes===1335720&&
    source.sourceFile==='StreamingAssets/protoDb.bin'&&
    source.sourceRecordType==='Definitions.IAPData'&&
    source.il2cppSchemaGameVersion==='1.26.1'&&
    source.checkedOn==='2026-11-23'&&
    source.nestedRewardsField===11&&
    source.additionalIapPacksField===19&&
    source.additionalPackIdField===1&&
    source.supportedMarketplaceField===2&&
    source.unsupportedMarketplaceField===3&&
    source.marketplaceEnum9==='AppleAppStore'&&
    source.accountEntitlementVerified===false&&
    source.nestedRewardGrantVerified===false&&
    source.additionalPackGrantVerified===false&&
    source.currentStorefrontAvailabilityVerified===false,
    'ORIGINAL_NATIVE_PROVENANCE');
  assert(counts.recordEnvelopes===2246&&
    counts.nativeIapPackages===53&&
    counts.nativeNestedReferences===3&&
    counts.nativeAdditionalReferences===3&&
    counts.appleAppStoreOnlyAdditionalReferences===3&&
    counts.totalPackReferences===6&&
    counts.danglingPackReferences===0&&
    counts.onlineRewardGrantsVerified===0,
    'ORIGINAL_NATIVE_CENSUS');

  const provenance:OriginProvenance=Object.freeze({
    sourceId:'db02:native:steam-1262:iap-pack-references',
    kind:'verified_game_native' as const,sourceUrl:url,
    checkedOn:'2026-11-23',gameVersion:'1.26.2',sha256:SOURCE_SHA
  });
  const references:NativeIapPackReference[]=[];
  const byFrom=new Map<string,NativeIapPackReference[]>();
  const byTo=new Map<string,NativeIapPackReference[]>();
  const seen=new Set<string>();
  let additional=0,nested=0,appleOnly=0;
  for(const value of raw.relations){
    assert(Array.isArray(value)&&value.length===5,'REFERENCE_TUPLE');
    const [from,kind,to,supported,unsupported]=value as unknown[];
    assert(safePackage(from)&&safePackage(to)&&
      (kind==='nested_rewards'||kind==='additional_pack')&&
      enumList(supported)&&enumList(unsupported)&&from!==to&&
      iap.getPackage(from)!==null&&iap.getPackage(to)!==null,
      'REFERENCE_FIELDS');
    const key=from+':'+kind+':'+to;
    assert(!seen.has(key),'DUPLICATE_REFERENCE');
    seen.add(key);
    if(kind==='nested_rewards'){
      nested++;
      assert(supported.length===0&&unsupported.length===0&&
        iap.getPackage(from)?.nestedPackageId===to,
        'NESTED_SOURCE_MISMATCH');
    }else{
      additional++;
      assert(supported.length===1&&supported[0]===9&&
        unsupported.length===0&&iap.getPackage(from)?.nestedPackageId===null,
        'PLATFORM_RESTRICTION');
      appleOnly++;
    }
    const record:NativeIapPackReference=Object.freeze({
      fromPackageId:from,toPackageId:to,kind,
      originalFieldPath:kind==='nested_rewards'?
        'IAPData.NestedRewards[11]':
        'IAPData.AdditionalIAPPacks[19].IapPack[1]',
      supportedMarketplaces:Object.freeze([...supported]),
      unsupportedMarketplaces:Object.freeze([...unsupported]),
      declaredAppleAppStoreOnly:kind==='additional_pack',
      source:provenance,
      grantsNestedRewardsVerified:false as const,
      grantsAdditionalPackageVerified:false as const,
      accountEntitlementVerified:false as const,
      currentStorefrontAvailabilityVerified:false as const
    });
    references.push(record);
    const forward=byFrom.get(from)??[];
    forward.push(record);byFrom.set(from,forward);
    const reverse=byTo.get(to)??[];
    reverse.push(record);byTo.set(to,reverse);
  }
  assert(additional===3&&nested===3&&appleOnly===3,'SOURCE_RELATION_CENSUS');
  for(const pkg of iap.packages){
    const nestedRefs=(byFrom.get(pkg.nativePackageId)??[]).filter(r=>
      r.kind==='nested_rewards');
    assert(nestedRefs.length===(pkg.nestedPackageId===null?0:1),
      'MISSING_NATIVE_NESTED_LINK');
  }
  // The source only defines structural references. Validate against cycles
  // before exposing traversal so malformed future input cannot loop forever.
  for(const packageId of byFrom.keys()){
    const trail=new Set([packageId]);
    let next=packageId;
    while(true){
      const edge=(byFrom.get(next)??[]).find(x=>x.kind==='nested_rewards');
      if(!edge)break;
      next=edge.toPackageId;
      assert(!trail.has(next),'CYCLIC_NESTED_SOURCE');
      trail.add(next);
    }
  }
  const paths=new Map<string,readonly string[]>();
  for(const packageInfo of iap.packages){
    const ids=[packageInfo.nativePackageId];
    while(true){
      const edge=(byFrom.get(ids[ids.length-1])??[]).find(x=>x.kind==='nested_rewards');
      if(!edge)break;
      ids.push(edge.toPackageId);
    }
    paths.set(packageInfo.nativePackageId,Object.freeze(ids));
  }
  for(const rows of byFrom.values())Object.freeze(rows);
  for(const rows of byTo.values())Object.freeze(rows);
  const index:PinnedIapPackReferenceIndex=Object.freeze({
    schema:DB02_IAP_PACK_LINKS_SCHEMA,
    sourceIntegrity:'pinned_original_protoDb_and_independent_public_projection' as const,
    references:Object.freeze(references),
    coverage:Object.freeze({
      nativeIapPackages:53 as const,nativeNestedReferences:3 as const,
      nativeAdditionalReferences:3 as const,
      appleAppStoreOnlyAdditionalReferences:3 as const,
      totalPackReferences:6 as const,danglingPackReferences:0 as const,
      onlineRewardGrantsVerified:0 as const,
      accountEntitlementVerified:false as const,
      storefrontAvailabilityVerified:false as const,
      nestedRewardExpansionVerified:false as const
    }),
    getFromPackage(id:string){return byFrom.get(id)??EMPTY;},
    getToPackage(id:string){return byTo.get(id)??EMPTY;},
    getNestedRewardPath(id:string){return paths.get(id)??null;},
    getAdditionalForMarketplace(id:string,marketplaceEnum:number){
      if(!Number.isSafeInteger(marketplaceEnum)||marketplaceEnum<0||
        marketplaceEnum>65535)return EMPTY;
      const matching=(byFrom.get(id)??[]).filter(edge=>
        edge.kind==='additional_pack'&&
        edge.supportedMarketplaces.includes(marketplaceEnum)&&
        !edge.unsupportedMarketplaces.includes(marketplaceEnum));
      return matching.length?Object.freeze(matching):EMPTY;
    }
  });
  PINNED.add(index);
  return index;
}

export function hasPinnedIapPackReferenceEvidence(
  x:unknown
):x is PinnedIapPackReferenceIndex{
  return x!==null&&typeof x==='object'&&PINNED.has(x);
}
/** Both public source projections are independently SHA-checked beforehand. */
export async function loadPinnedIapPackReferences(
  iap:PublicIapSourceIndex,basePath='',fetcher:typeof fetch=fetch
):Promise<PinnedIapPackReferenceIndex>{
  assert(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  assert(hasPinnedPublicIapEvidence(iap),'AUTHENTICATED_NATIVE_IAP_REQUIRED');
  const url=basePath+'/acquisition/public/'+DB02_IAP_PACK_LINKS_FILE;
  const response=await fetcher(url);
  assert(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  assert(bytes.byteLength===DB02_IAP_PACK_LINKS_BYTES,'PUBLIC_SIZE');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  assert(sha===DB02_IAP_PACK_LINKS_SHA,'PUBLIC_SHA');
  return authenticate(JSON.parse(new TextDecoder().decode(bytes)),url,iap);
}
