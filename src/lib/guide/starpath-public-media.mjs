/**
 * Fail-closed public SRC-04 thumbnail activation for the static v1.26.2 Star Path.
 *
 * Non-public/private R2 staging and SRC-04 distribution candidates are NEVER
 * image sources. This explicit source-controlled release pin is inert until
 * the media publisher provides a separately verified public release.
 */
import {VERIFIED_STARPATH_REWARD_NAMES} from './starpath-reward-names.mjs';

export const STARPATH_MEDIA_ACTIVATION = Object.freeze({
  state: 'unpublished',
  manifestPath: null,
  manifestSha256: null,
  manifestBytes: null,
  publicOrigin: null
});

const ID = /^[1-9][0-9]{0,15}$/;
const SHA = /^[a-f0-9]{64}$/;
const KEY = /^media\/steam-v1\.26\.2\/(thumbnail|original)\/([a-f0-9]{2})\/([a-f0-9]{64})\.webp$/;
const RELEASE_SCHEMA = 'wand.db03.starpath-public-media@1';
const DB01_RELEASE = 'steam-1.26.2-native-itemlist-v1';
const MEDIA_VERSION = 'steam-v1.26.2';
const fail = message => {throw new TypeError('Star Path public media: '+message)};
const assert = (condition, message) => {if(!condition)fail(message)};
const record = value => value!==null&&typeof value==='object'&&!Array.isArray(value);
const safeInt = value => Number.isSafeInteger(value)&&value>0;
const mediaDomain = /^(?:media|cdn)\.dreamwishwand\.com$/i;

function requireOriginalPublicOrigin(input){
  assert(typeof input==='string'&&input.length<200,'missing public origin');
  let url;
  try{url=new URL(input)}catch{fail('invalid public origin')}
  assert(url.protocol==='https:'&&mediaDomain.test(url.hostname)&&
    url.username===''&&url.password===''&&url.search===''&&url.hash===''&&
    url.pathname==='/'&&url.port==='','unapproved media origin');
  return url.origin;
}

export function validateStarpathMediaActivation(config=STARPATH_MEDIA_ACTIVATION){
  assert(record(config),'activation record');
  if(config.state==='unpublished'){
    assert(config.manifestPath===null&&config.manifestSha256===null&&
      config.manifestBytes===null&&config.publicOrigin===null,'unpublished release must have no URLs');
    return null;
  }
  assert(config.state==='published'&&
    typeof config.manifestPath==='string'&&
    /^guide\/public\/starpath-media-[a-f0-9]{12}\.json$/.test(config.manifestPath)&&
    SHA.test(config.manifestSha256)&&
    safeInt(config.manifestBytes)&&config.manifestBytes<=50000,'unapproved manifest pin');
  return {
    ...config,publicOrigin:requireOriginalPublicOrigin(config.publicOrigin)
  };
}

/** Validate *the entire* fixed 1.26.2 release; do not trust one matching ID. */
export function verifyStarpathMediaManifest(manifest,starpath){
  assert(record(manifest)&&manifest.schema===RELEASE_SCHEMA,'schema');
  assert(record(manifest.target)&&manifest.target.platform==='Steam'&&
    manifest.target.gameVersion==='1.26.2'&&
    manifest.target.db01Release===DB01_RELEASE&&
    manifest.target.src04Release===MEDIA_VERSION,'incorrect source version');
  assert(record(manifest.release)&&manifest.release.state==='published'&&
    manifest.release.publicationAuthorized===true&&
    manifest.release.publicObjectByteAudit===true&&
    manifest.release.publicReadbackVerified===true&&
    typeof manifest.release.releaseId==='string'&&
    /^[A-Za-z0-9_-]{8,80}$/.test(manifest.release.releaseId)&&
    SHA.test(manifest.release.sourceCandidateSha256),'unverified media publication');
  assert(Array.isArray(starpath?.seasons)&&starpath.seasons.length===2,'starpath snapshot');
  const allIds=new Set();
  for(const season of starpath.seasons){
    assert(Array.isArray(season.rewardPages)&&Array.isArray(season.bonusPages)&&
      Array.isArray(season.vaultRewards),'season rewards');
    for(const reward of [
      ...season.rewardPages.flatMap(page=>page.rewards),
      ...season.bonusPages.flatMap(page=>page.rewards),
      ...season.vaultRewards
    ]){
      allIds.add(reward.itemId);
      if(reward.alternateItemId)allIds.add(reward.alternateItemId);
    }
  }
  assert(allIds.size===60&&Object.keys(VERIFIED_STARPATH_REWARD_NAMES).length===43,'source reward census');
  assert(record(manifest.items),'image map');
  const rows=Object.entries(manifest.items);
  assert(rows.length>0&&rows.length<=43,'published item coverage');
  const seenKeys=new Map();
  for(const [id,row]of rows){
    assert(ID.test(id)&&allIds.has(id)&&Object.hasOwn(VERIFIED_STARPATH_REWARD_NAMES,id),
      'no source-verified image association');
    assert(record(row)&&Object.keys(row).length===2&&
      Object.hasOwn(row,'thumbnail')&&Object.hasOwn(row,'original'),'two variant policy');
    for(const variant of ['thumbnail','original']){
      const info=row[variant];
      assert(record(info)&&Object.keys(info).length===5&&
        typeof info.key==='string'&&typeof info.sha256==='string'&&
        safeInt(info.bytes)&&info.bytes<=16*1024*1024&&
        safeInt(info.width)&&safeInt(info.height)&&info.width<=8192&&info.height<=8192,
        'invalid media record');
      const path=KEY.exec(info.key);
      assert(path&&path[1]===variant&&path[2]===info.sha256.slice(0,2)&&
        path[3]===info.sha256&&SHA.test(info.sha256),'non-content-addressed public path');
      if(variant==='thumbnail')assert(info.width<=128&&info.height<=128,'oversized thumbnail');
      const prior=seenKeys.get(info.key);
      assert(!prior||prior.sha256===info.sha256&&prior.bytes===info.bytes&&
        prior.width===info.width&&prior.height===info.height,'conflicting shared image');
      seenKeys.set(info.key,info);
    }
  }
  return manifest;
}

/** Returns null and never fetches while publication gate is inactive. */
export async function loadStarpathMedia(base,starpath,{
  activation=STARPATH_MEDIA_ACTIVATION,
  fetcher=fetch
}={}){
  const pin=validateStarpathMediaActivation(activation);
  if(pin===null)return null;
  assert(typeof base==='string'&&/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base),
    'invalid application base');
  const response=await fetcher(base+pin.manifestPath);
  assert(response.ok,'public manifest unavailable');
  const bytes=await response.arrayBuffer();
  assert(bytes.byteLength===pin.manifestBytes,'manifest byte count mismatch');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(value=>value.toString(16).padStart(2,'0')).join('');
  assert(hash===pin.manifestSha256,'manifest fingerprint mismatch');
  const manifest=verifyStarpathMediaManifest(JSON.parse(new TextDecoder().decode(bytes)),starpath);
  return {manifest,origin:pin.publicOrigin};
}

export function starpathMediaThumbnail(media,id){
  if(!media||!ID.test(String(id)))return null;
  const key=String(id);
  const row=Object.hasOwn(media.manifest?.items||{},key)?media.manifest.items[key]:null;
  const path=row?.thumbnail?.key;
  if(!path||!KEY.test(path))return null;
  const url=media.origin;
  // Do not accept arbitrary URLs or prepublication sources even from a caller.
  if(typeof url!=='string')return null;
  try{return requireOriginalPublicOrigin(url)+'/'+path}catch{return null}
}
