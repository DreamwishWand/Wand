/**
 * Source-authenticated static IAP package -> Item ID reward definitions.
 *
 * Steam 1.26.1 original protoDb.bin, byte-equivalent to Steam 1.26.2, is kept
 * outside the public repository. The published projection is a SHA-pinned
 * extract of only Definitions.IAPData.Rewards (field 9) and
 * IAPData.Extended.Rewards (fields 10.3).
 *
 * These source-exact relations DO NOT prove purchase, account entitlement,
 * current platform availability, grant, or online item synchronization.
 * Nested package references are not expanded into direct reward links.
 */
import type {ItemOrigin,OfficialCampaign,OriginProvenance} from './origins.ts';

export const DB02_PUBLIC_IAP_SCHEMA='wand.db02.public-static-iap@1' as const;
export const DB02_PUBLIC_IAP_FILE='iap-rewards-1.26.2.json' as const;
export const DB02_PUBLIC_IAP_SHA=
  'b6de9c8d4798373cd57b1df149751a6b58286be9f3767bce92c88071e58920cf' as const;
export const DB02_PUBLIC_IAP_BYTES=10519 as const;
const ORIGINAL_SHA='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const ID=/^[1-9][0-9]{0,15}$/;
const PACKAGE=/^[A-Za-z][A-Za-z0-9_]{1,95}$/;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const SOURCE_ID='db02:native:steam-1262:iap';
const PINNED=new WeakSet<object>();
const EMPTY=Object.freeze([]) as readonly ItemOrigin[];
const NONE=Object.freeze([]) as readonly NativeIapReward[];
type RewardFamily='direct'|'extended';
export interface NativeIapReward{
  readonly itemId:string;
  readonly quantity:number;
  readonly family:RewardFamily;
  readonly sourceSlotIndex:number;
}
export interface NativeIapPackage{
  readonly sourceRecordName:string;
  readonly nativePackageId:string;
  readonly nativeIapType:number;
  readonly associatedExpansion:string|null;
  readonly availableGameVersion:string|null;
  /** Exact native pack-key reference, NOT expanded into an assumed grant. */
  readonly nestedPackageId:string|null;
  readonly premiumItemProvider:boolean;
  readonly isLocalEntitlement:boolean;
  readonly ownershipCheckRequired:boolean;
  readonly rewards:readonly NativeIapReward[];
  readonly directRewards:readonly NativeIapReward[];
  readonly extendedRewards:readonly NativeIapReward[];
}
export interface PublicIapSourceIndex{
  readonly schema:typeof DB02_PUBLIC_IAP_SCHEMA;
  readonly sourceIntegrity:'pinned_original_protoDb_and_sha256_public_projection';
  readonly packages:readonly NativeIapPackage[];
  readonly origins:readonly ItemOrigin[];
  readonly campaigns:readonly OfficialCampaign[];
  readonly coverage:Readonly<{
    readonly nativePackages:53;
    readonly directRewardReferences:150;
    readonly extendedRewardReferences:141;
    readonly combinedRewardReferences:291;
    readonly distinctRewardItemIds:158;
    readonly nestedPackageReferences:3;
    readonly embeddedPromoCodeDefinitions:0;
    readonly embeddedOnlineMessageDefinitions:0;
    readonly currentAvailabilityVerified:false;
    readonly accountEntitlementVerified:false;
    readonly onlineSyncVerified:false;
    readonly nestedRewardsExpanded:false;
  }>;
  getPackage(packageId:string):NativeIapPackage|null;
  getPackageOrigins(packageId:string):readonly ItemOrigin[];
  getItemOrigins(itemId:string|number):readonly ItemOrigin[];
}
function ensure(ok:unknown,why:string):asserts ok{
  if(!ok)throw new TypeError('DB02_PUBLIC_IAP_'+why);
}
function object(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function validId(x:unknown):x is string{
  return typeof x==='string'&&ID.test(x)&&Number.isSafeInteger(Number(x));
}
function itemId(x:string|number):string|null{
  const value=typeof x==='number'&&Number.isSafeInteger(x)?String(x):x;
  return validId(value)?value:null;
}
function positive(x:unknown):x is number{
  return typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
}
function safeName(x:unknown):x is string{
  return typeof x==='string'&&PACKAGE.test(x);
}
function optionalName(x:unknown):x is string|null{
  return x===null||safeName(x);
}
function optionalVersion(x:unknown):x is string|null{
  return x===null||typeof x==='string'&&/^\d+\.\d+(?:\.\d+)?$/.test(x);
}
function verifiedProjection(raw:unknown,url:string):PublicIapSourceIndex{
  ensure(object(raw)&&raw.schema===DB02_PUBLIC_IAP_SCHEMA&&
    object(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&object(raw.source),'SCHEMA_VERSION');
  const s=raw.source;
  ensure(s.originalSourceGameVersion==='1.26.1'&&
    s.originalFileEquivalentTo1262===true&&
    s.originalProtoDbSha256===ORIGINAL_SHA&&
    s.originalProtoDbBytes===1335720&&
    s.originalIl2CppGameVersion==='1.26.1'&&
    s.sourceFile==='StreamingAssets/protoDb.bin'&&
    s.sourceSchema==='Definitions.IAPData'&&
    s.checkedOn==='2026-11-23'&&
    s.staticallyConfiguredOnly===true&&
    s.currentStorefrontAvailabilityVerified===false&&
    s.accountEntitlementVerified===false&&
    s.onlineMessageDefinitionsIncluded===false&&
    s.onlinePromoCodeDefinitionsIncluded===false&&
    s.nestedRewardExpansionVerified===false,'ORIGINAL_SOURCE');
  ensure(object(raw.coverage)&&raw.coverage.recordEnvelopes===2246&&
    raw.coverage.iapPackages===53&&raw.coverage.directRewards===150&&
    raw.coverage.extendedRewards===141&&
    raw.coverage.totalRewardRelations===291&&
    raw.coverage.distinctRewardItemIds===158&&
    raw.coverage.nestedPackageReferences===3&&
    raw.coverage.embeddedPromoCodeRecords===0&&
    raw.coverage.embeddedOnlineMessageRecords===0&&
    Array.isArray(raw.packages)&&raw.packages.length===53,'SOURCE_CENSUS');
  const source:OriginProvenance=Object.freeze({
    sourceId:SOURCE_ID,kind:'verified_game_native' as const,
    sourceUrl:url,gameVersion:'1.26.2',checkedOn:'2026-11-23',
    sha256:ORIGINAL_SHA
  });
  const window=Object.freeze({start:null,endExclusive:null});
  const packages:NativeIapPackage[]=[];
  const origins:ItemOrigin[]=[];
  const campaigns:OfficialCampaign[]=[];
  const byPackage=new Map<string,NativeIapPackage>();
  const byPackageOrigins=new Map<string,readonly ItemOrigin[]>();
  const byItem=new Map<string,ItemOrigin[]>();
  const uniqueItemIds=new Set<string>();
  let directCount=0,extendedCount=0,nestedCount=0;
  for(const value of raw.packages){
    ensure(Array.isArray(value)&&value.length===11,'PACKAGE_TUPLE');
    const [
      name,key,type,expansion,version,nested,premium,local,checkOwnership,
      directRaw,extendedRaw
    ]=value as unknown[];
    ensure(safeName(name)&&safeName(key)&&
      typeof type==='number'&&Number.isInteger(type)&&type>=0&&type<=4&&
      optionalName(expansion)&&optionalVersion(version)&&optionalName(nested)&&
      typeof premium==='boolean'&&typeof local==='boolean'&&
      typeof checkOwnership==='boolean'&&
      Array.isArray(directRaw)&&Array.isArray(extendedRaw)&&
      !byPackage.has(key),'PACKAGE_IDENTITY');
    const familyRows=(parts:unknown[],family:RewardFamily)=>{
      const parsed:NativeIapReward[]=[];
      for(let i=0;i<parts.length;i++){
        const part=parts[i];
        ensure(Array.isArray(part)&&part.length===2&&
          validId(part[0])&&positive(part[1])&&part[1]<=2147483647,
          'REWARD_RECORD');
        parsed.push(Object.freeze({
          itemId:part[0] as string,quantity:part[1] as number,
          family,sourceSlotIndex:i
        }));
        uniqueItemIds.add(part[0] as string);
      }
      return Object.freeze(parsed);
    };
    const directRewards=familyRows(directRaw as unknown[],'direct');
    const extendedRewards=familyRows(extendedRaw as unknown[],'extended');
    const merged=Object.freeze([...directRewards,...extendedRewards]);
    if(nested!==null)nestedCount++;
    directCount+=directRewards.length;extendedCount+=extendedRewards.length;
    const p:NativeIapPackage=Object.freeze({
      sourceRecordName:name,nativePackageId:key,nativeIapType:type,
      associatedExpansion:expansion,availableGameVersion:version,
      nestedPackageId:nested,premiumItemProvider:premium,
      isLocalEntitlement:local,ownershipCheckRequired:checkOwnership,
      rewards:merged,directRewards,extendedRewards
    });
    const campaignId='native-iap:'+key;
    const entries:ItemOrigin[]=merged.map(reward=>{
      const path=reward.family==='direct'?
        'IAPData.Rewards[9]':'IAPData.Extended[10].Rewards[3]';
      const condition=[
        'Exact '+path+' static ItemAmount; not proof of a grant or an owned account entitlement',
        'Native IAP UniqueName: '+key,
        'Native IAP type: '+type,
        'Local entitlement flag: '+String(local)+'; not an online synchronization determination',
        'OwnershipCheckRequired flag: '+String(checkOwnership),
        'Original ProtoDB SHA-256: '+ORIGINAL_SHA
      ];
      if(expansion!==null)condition.push('Associated expansion: '+expansion);
      if(nested!==null)
        condition.push('Nested IAP reference: '+nested+' (NOT expanded here)');
      return Object.freeze({
        originId:'db02:iap:'+key+':'+reward.family+':'+reward.sourceSlotIndex,
        itemId:reward.itemId,kind:'purchase_bonus' as const,
        routeStatus:'confirmed_source_link' as const,
        campaignId,productId:key,
        name:'IAP package: '+name,quantity:reward.quantity,
        price:null,accessTier:'premium' as const,
        window,salePeriods:Object.freeze([]),conditions:Object.freeze(condition),
        source,availability:'not_live_verified' as const
      });
    });
    for(const origin of entries){
      origins.push(origin);
      const list=byItem.get(origin.itemId)??[];
      list.push(origin);byItem.set(origin.itemId,list);
    }
    const published=Object.freeze(entries);
    packages.push(p);byPackage.set(key,p);byPackageOrigins.set(key,published);
    campaigns.push(Object.freeze({
      campaignId,kind:'purchase_bonus' as const,name:'IAP: '+name,
      code:null,productId:key,window,
      conditions:Object.freeze([
        'Exact static IAP reward definition only; platform availability and ownership are not verified',
        'Native IAP type: '+type,
        'Local entitlement flag: '+String(local),
        'Ownership check required flag: '+String(checkOwnership),
        ...(nested!==null?['Nested pack '+nested+' is a reference, not an expanded reward']:[])
      ]),
      rewards:Object.freeze(merged.map(reward=>Object.freeze({
        name:'Item '+reward.itemId,itemId:reward.itemId,quantity:reward.quantity,
        cumulativeWatchMinutes:null
      }))),source,availability:'not_live_verified' as const
    }));
  }
  ensure(packages.length===53&&directCount===150&&extendedCount===141&&
    origins.length===291&&uniqueItemIds.size===158&&nestedCount===3,
    'REWARD_CENSUS');
  for(const rows of byItem.values())Object.freeze(rows);
  const index:PublicIapSourceIndex=Object.freeze({
    schema:DB02_PUBLIC_IAP_SCHEMA,
    sourceIntegrity:'pinned_original_protoDb_and_sha256_public_projection' as const,
    packages:Object.freeze(packages),origins:Object.freeze(origins),
    campaigns:Object.freeze(campaigns),
    coverage:Object.freeze({
      nativePackages:53 as const,
      directRewardReferences:150 as const,
      extendedRewardReferences:141 as const,
      combinedRewardReferences:291 as const,
      distinctRewardItemIds:158 as const,
      nestedPackageReferences:3 as const,
      embeddedPromoCodeDefinitions:0 as const,
      embeddedOnlineMessageDefinitions:0 as const,
      currentAvailabilityVerified:false as const,
      accountEntitlementVerified:false as const,
      onlineSyncVerified:false as const,
      nestedRewardsExpanded:false as const
    }),
    getPackage(key:string){return byPackage.get(key)??null;},
    getPackageOrigins(key:string){return byPackageOrigins.get(key)??EMPTY;},
    getItemOrigins(key:string|number){return byItem.get(itemId(key)??'')??EMPTY;}
  });
  PINNED.add(index);
  return index;
}
export function hasPinnedPublicIapEvidence(value:unknown):value is PublicIapSourceIndex{
  return value!==null&&typeof value==='object'&&PINNED.has(value);
}
/** Browser-only SHA-authenticated projection loader; never fetches original game files. */
export async function loadPinnedPublicIapSource(
  basePath='',fetcher:typeof fetch=fetch
):Promise<PublicIapSourceIndex>{
  ensure(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  const url=basePath+'/acquisition/public/'+DB02_PUBLIC_IAP_FILE;
  const response=await fetcher(url);
  ensure(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  ensure(bytes.byteLength===DB02_PUBLIC_IAP_BYTES,'PUBLIC_SIZE');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  ensure(sha===DB02_PUBLIC_IAP_SHA,'PUBLIC_SHA');
  return verifiedProjection(JSON.parse(new TextDecoder().decode(bytes)),url);
}
