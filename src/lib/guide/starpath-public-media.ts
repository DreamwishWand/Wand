/**
 * SRC-04 Star Path public art: explicit SHA-pinned publication only.
 *
 * Owner-private files, R2 candidates and staging paths NEVER become image
 * sources. The default is deliberately unpublished and performs no network
 * request. Static rewards are not current server availability or ownership.
 */
import {VERIFIED_STARPATH_REWARD_NAMES} from './starpath-reward-names.ts';
import {verifyPublicStarpath,type PublicStarpathSnapshot} from './public-starpath.ts';

export interface UnpublishedStarpathMediaActivation{
  readonly state:'unpublished';
  readonly manifestPath:null;
  readonly manifestSha256:null;
  readonly manifestBytes:null;
  readonly publicOrigin:null;
}
export interface PublishedStarpathMediaActivation{
  readonly state:'published';
  readonly manifestPath:string;
  readonly manifestSha256:string;
  readonly manifestBytes:number;
  readonly publicOrigin:string;
}
export type StarpathMediaActivation=
  UnpublishedStarpathMediaActivation|PublishedStarpathMediaActivation;

export const STARPATH_MEDIA_ACTIVATION:Readonly<UnpublishedStarpathMediaActivation>=Object.freeze({
  state:'unpublished',
  manifestPath:null,
  manifestSha256:null,
  manifestBytes:null,
  publicOrigin:null
});

export interface PublishedStarpathMediaVariant{
  readonly key:string;
  readonly sha256:string;
  readonly bytes:number;
  readonly width:number;
  readonly height:number;
}
export interface PublishedStarpathMediaItem{
  readonly thumbnail:PublishedStarpathMediaVariant;
  readonly original:PublishedStarpathMediaVariant;
}
export interface StarpathMediaManifest{
  readonly schema:'wand.db03.starpath-public-media@1';
  readonly target:Readonly<{
    platform:'Steam';
    gameVersion:'1.26.2';
    db01Release:'steam-1.26.2-native-itemlist-v1';
    src04Release:'steam-v1.26.2';
  }>;
  readonly release:Readonly<{
    state:'published';
    publicationAuthorized:true;
    publicObjectByteAudit:true;
    publicReadbackVerified:true;
    releaseId:string;
    sourceCandidateSha256:string;
  }>;
  readonly items:Readonly<Record<string,Readonly<PublishedStarpathMediaItem>>>;
}
export interface StarpathMediaRelease{
  readonly manifest:StarpathMediaManifest;
  readonly origin:string;
}
type ByteResponse=Pick<Response,'ok'|'arrayBuffer'>;
const ID=/^[1-9][0-9]{0,15}$/;
const SHA=/^[a-f0-9]{64}$/;
const KEY=/^(?:media\/steam-v1\.26\.2\/)?(thumbnail|original)\/([a-f0-9]{2})\/([a-f0-9]{64})\.webp$/;
const RELEASE_SCHEMA='wand.db03.starpath-public-media@1' as const;
const DB01_RELEASE='steam-1.26.2-native-itemlist-v1' as const;
const MEDIA_VERSION='steam-v1.26.2' as const;
const MEDIA_DOMAIN=/^(?:media|cdn)\.dreamwishwand\.com$/i;
const VARIANTS=['thumbnail','original'] as const;

function check(condition:unknown,message:string):asserts condition{
  if(!condition)throw new TypeError('Star Path public media: '+message);
}
function record(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function positive(value:unknown):value is number{
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
}
function originalPublicOrigin(input:unknown):string{
  check(typeof input==='string'&&input.length<200,'missing public origin');
  let url:URL;
  try{url=new URL(input);}catch{
    throw new TypeError('Star Path public media: invalid public origin');
  }
  check(url.protocol==='https:'&&MEDIA_DOMAIN.test(url.hostname)&&
    url.username===''&&url.password===''&&url.search===''&&url.hash===''&&
    url.pathname==='/'&&url.port==='','unapproved media origin');
  return url.origin;
}
/** Explicitly reviewed publisher-controlled release; never infer publication. */
export function validateStarpathMediaActivation(
  config:unknown=STARPATH_MEDIA_ACTIVATION
):PublishedStarpathMediaActivation|null{
  check(record(config),'activation record');
  if(config.state==='unpublished'){
    check(config.manifestPath===null&&config.manifestSha256===null&&
      config.manifestBytes===null&&config.publicOrigin===null,
      'unpublished release must have no URLs');
    return null;
  }
  check(config.state==='published'&&
    typeof config.manifestPath==='string'&&
    /^guide\/public\/starpath-media-[a-f0-9]{12}\.json$/.test(config.manifestPath)&&
    typeof config.manifestSha256==='string'&&SHA.test(config.manifestSha256)&&
    positive(config.manifestBytes)&&config.manifestBytes<=50000,
    'unapproved manifest pin');
  check(config.manifestPath==='guide/public/starpath-media-'+
    config.manifestSha256.slice(0,12)+'.json',
    'manifest path must contain pinned fingerprint');
  return {
    state:'published',manifestPath:config.manifestPath,
    manifestSha256:config.manifestSha256,
    manifestBytes:config.manifestBytes,
    publicOrigin:originalPublicOrigin(config.publicOrigin)
  };
}
/** Validate the whole exact Steam release, NOT a single matching Item ID. */
export function verifyStarpathMediaManifest(
  manifest:unknown,starpath:unknown
):StarpathMediaManifest{
  check(record(manifest)&&manifest.schema===RELEASE_SCHEMA&&
    Object.keys(manifest).sort().join(',')==='items,release,schema,target',
    'schema or private fields');
  const target=manifest.target;
  check(record(target)&&
    Object.keys(target).sort().join(',')==='db01Release,gameVersion,platform,src04Release'&&
    target.platform==='Steam'&&target.gameVersion==='1.26.2'&&
    target.db01Release===DB01_RELEASE&&target.src04Release===MEDIA_VERSION,
    'incorrect source version');
  const release=manifest.release;
  check(record(release)&&
    Object.keys(release).sort().join(',')==='publicObjectByteAudit,publicReadbackVerified,publicationAuthorized,releaseId,sourceCandidateSha256,state'&&
    release.state==='published'&&release.publicationAuthorized===true&&
    release.publicObjectByteAudit===true&&release.publicReadbackVerified===true&&
    typeof release.releaseId==='string'&&
    /^[A-Za-z0-9_-]{8,80}$/.test(release.releaseId)&&
    typeof release.sourceCandidateSha256==='string'&&
    SHA.test(release.sourceCandidateSha256),'unverified media publication');

  // Source-census, identity, reward IDs, and original SHA must all be exact.
  // No fabricated snapshot can turn a staging image into a real reward image.
  const verified:PublicStarpathSnapshot=verifyPublicStarpath(starpath);
  const ids=new Set<string>();
  for(const season of verified.seasons){
    for(const reward of [
      ...season.rewardPages.flatMap(page=>page.rewards),
      ...season.bonusPages.flatMap(page=>page.rewards),
      ...season.vaultRewards
    ]){
      ids.add(reward.itemId);
      if(reward.alternateItemId)ids.add(reward.alternateItemId);
    }
  }
  check(ids.size===60&&Object.keys(VERIFIED_STARPATH_REWARD_NAMES).length===43,
    'source reward census');
  check(record(manifest.items),'image map');
  const items=Object.entries(manifest.items);
  check(items.length>0&&items.length<=43,'published item coverage');
  const used=new Map<string,PublishedStarpathMediaVariant>();
  for(const [id,row] of items){
    check(ID.test(id)&&Number.isSafeInteger(Number(id))&&ids.has(id)&&
      Object.hasOwn(VERIFIED_STARPATH_REWARD_NAMES,id),
      'no source-verified image association');
    check(record(row)&&Object.keys(row).length===2&&
      Object.hasOwn(row,'thumbnail')&&Object.hasOwn(row,'original'),
      'two variant policy');
    for(const variant of VARIANTS){
      const source=row[variant];
      check(record(source)&&Object.keys(source).length===5&&
        typeof source.key==='string'&&
        typeof source.sha256==='string'&&
        positive(source.bytes)&&source.bytes<=16*1024*1024&&
        positive(source.width)&&positive(source.height)&&
        source.width<=8192&&source.height<=8192,
        'invalid media record');
      const matched=KEY.exec(source.key);
      check(matched&&matched[1]===variant&&
        matched[2]===source.sha256.slice(0,2)&&
        matched[3]===source.sha256&&SHA.test(source.sha256),
        'non-content-addressed public path');
      if(variant==='thumbnail')
        check(source.width<=128&&source.height<=128,'oversized thumbnail');
      const previous=used.get(source.key);
      check(!previous||(previous.sha256===source.sha256&&
        previous.bytes===source.bytes&&previous.width===source.width&&
        previous.height===source.height),'conflicting shared image');
      used.set(source.key,{
        key:source.key,sha256:source.sha256,bytes:source.bytes,
        width:source.width,height:source.height
      });
    }
  }
  return manifest as unknown as StarpathMediaManifest;
}
/** No public release => no fetch, no speculative image URL. */
export async function loadStarpathMedia(
  base:string,starpath:unknown,
  {activation=STARPATH_MEDIA_ACTIVATION,fetcher=fetch}:{
    activation?:unknown;
    fetcher?:(url:string)=>Promise<ByteResponse>;
  }={}
):Promise<StarpathMediaRelease|null>{
  const pin=validateStarpathMediaActivation(activation);
  if(!pin)return null;
  check(typeof base==='string'&&/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base),
    'invalid application base');
  const response=await fetcher(base+pin.manifestPath);
  check(response.ok,'public manifest unavailable');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===pin.manifestBytes,'manifest byte count mismatch');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  check(sha===pin.manifestSha256,'manifest fingerprint mismatch');
  return {
    manifest:verifyStarpathMediaManifest(JSON.parse(
      new TextDecoder('utf-8',{fatal:true}).decode(bytes)),starpath),
    origin:pin.publicOrigin
  };
}
/** Return an audited public object URL only, never private staging URLs. */
export function starpathMediaThumbnail(
  media:StarpathMediaRelease|null|undefined,id:string|number
):string|null{
  if(!media||!ID.test(String(id)))return null;
  const key=String(id);
  const row=Object.hasOwn(media.manifest?.items??{},key)
    ?media.manifest.items[key]:null;
  const path=row?.thumbnail?.key;
  if(!path||!KEY.test(path))return null;
  if(typeof media.origin!=='string')return null;
  try{return originalPublicOrigin(media.origin)+'/'+path;}
  catch{return null;}
}
