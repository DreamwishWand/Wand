#!/usr/bin/env node
/**
 * DB-03/SRC-04: compile the *verified public* Star Path thumbnail subset.
 *
 * Plan: offline source-candidate + private promotion-plan checks. No network.
 * Release: explicit owner approval AND public CDN GET+digest for every
 * referenced WebP; only then emit sanitized, immutable Guide manifest.
 *
 * NEVER commit the private promotion plan or the source R2 object keys.
 * No public object uploads, R2 credentials, ACL, or DNS changes occur here.
 */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {VERIFIED_STARPATH_REWARD_NAMES} from '../../src/lib/guide/starpath-reward-names.ts';
import {verifyPublicStarpath} from '../../src/lib/guide/public-starpath.ts';
import {verifyStarpathMediaManifest} from '../../src/lib/guide/starpath-public-media.ts';

const RELEASE='steam-v1.26.2';
const SOURCE_HASH='fd2d07d541293a19ac7b845e996ccf4e3af41270c79daaa56b2ff74316a45e9f';
const PRIVATE_PREFIX='private/staging/src04/steam-v1.26.2/'+SOURCE_HASH.slice(0,16)+'/';
const SHA=/^[a-f0-9]{64}$/;
const CONTENT_KEY=/^(thumbnail|original)\/([0-9a-f]{2})\/([a-f0-9]{64})\.webp$/;
const fail=code=>{throw new Error('DB03_SRC04_PROMOTION_'+code)};
const assert=(ok,code)=>{if(!ok)fail(code)};
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const utf8JSON=doc=>Buffer.from(JSON.stringify(doc)+'\n','utf8');
const allowed=new Set(['media.dreamwishwand.com','cdn.dreamwishwand.com']);
const basename=path=>path.split('/').at(-1);
function publicOrigin(origin){
  let url;
  try{url=new URL(origin)}catch{fail('PUBLIC_ORIGIN')}
  assert(url.protocol==='https:'&&allowed.has(url.hostname)&&url.pathname==='/'&&
    !url.search&&!url.hash&&!url.username&&!url.password&&!url.port,'PUBLIC_ORIGIN');
  return url.origin;
}
const checkKey=(key,kind)=>{
  const match=typeof key==='string'?CONTENT_KEY.exec(key):null;
  assert(match&&match[1]===kind&&match[2]===match[3].slice(0,2),'INVALID_KEY');
  return match[3];
};
function checkWebp(bytes,width,height){
  assert(bytes.length>=25&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&
    bytes.subarray(8,12).toString('ascii')==='WEBP'&&
    bytes.readUInt32LE(4)+8===bytes.length,'INVALID_WEBP');
  let pos=12,lossless=null;
  while(pos<bytes.length){
    assert(pos+8<=bytes.length,'WEBP_CHUNK');
    const name=bytes.toString('ascii',pos,pos+4);
    const size=bytes.readUInt32LE(pos+4);
    const start=pos+8,end=start+size;
    assert(end<=bytes.length,'WEBP_CHUNK');
    assert(name!=='VP8 '&&name!=='ANIM'&&name!=='ANMF','WEBP_NOT_LOSSLESS');
    if(name==='VP8L'){
      assert(lossless===null&&size>=5&&bytes[start]===0x2f,'WEBP_VP8L');
      const bits=bytes.readUInt32LE(start+1);
      lossless={width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};
    }
    pos=end+(size&1);
    assert(pos<=bytes.length,'WEBP_PADDING');
  }
  assert(pos===bytes.length&&lossless!==null&&
    lossless.width===width&&lossless.height===height,'WEBP_DIMENSIONS');
}
const rewardIds=Object.keys(VERIFIED_STARPATH_REWARD_NAMES);
assert(rewardIds.length===43,'GUIDE_SOURCE_CENSUS');

export function verifyPromotionPlan(plan){
  assert(isRecord(plan)&&plan.schema==='wand.media.private-promotion-plan@1'&&
    plan.publicationAuthorized===false&&
    plan.sourceBucket==='dreamwishwand-media-private'&&
    plan.sourceManifestSha256===SOURCE_HASH&&plan.targetRelease===RELEASE&&
    Array.isArray(plan.objects)&&plan.objects.length>0,'PRIVATE_PROMOTION_SOURCE');
  const objects=new Map();
  for(const obj of plan.objects){
    assert(isRecord(obj)&&typeof obj.source==='string'&&obj.source.startsWith(PRIVATE_PREFIX)&&
      typeof obj.target==='string'&&SHA.test(obj.sha256)&&
      Number.isSafeInteger(obj.bytes)&&obj.bytes>0&&obj.bytes<=16*1024*1024,'PRIVATE_OBJECT');
    const match=CONTENT_KEY.exec(obj.target);
    assert(match&&match[3]===obj.sha256&&match[2]===obj.sha256.slice(0,2)&&
      obj.source.startsWith(PRIVATE_PREFIX+'images-v2/'+match[1]+'/'),'PRIVATE_OBJECT_KEY');
    assert(!objects.has(obj.target),'DUPLICATE_OBJECT');
    objects.set(obj.target,{sha256:obj.sha256,bytes:obj.bytes});
  }
  return objects;
}

/** Source candidate closure: require all 256 source-authenticated item shards. */
export async function verifyMediaCandidate(root){
  const raw=await readFile(join(root,'manifest.json'));
  const meta=JSON.parse(raw);
  assert(isRecord(meta)&&meta.schema==='wand.media.distribution-candidate@1'&&
    meta.gameVersion===RELEASE&&meta.releaseState==='candidate_unpublished'&&
    meta.bucketCount===256&&meta.totalItems===13202&&
    isRecord(meta.files)&&Object.keys(meta.files).length===256,'PRIVATE_CANDIDATE');
  const items=new Map();
  for(let n=0;n<256;n++){
    const bucket=n.toString(16).padStart(2,'0'),rel='id/'+bucket+'.json';
    const mark=meta.files[rel];
    assert(isRecord(mark)&&SHA.test(mark.sha256)&&
      Number.isSafeInteger(mark.bytes)&&mark.bytes>0&&
      Number.isSafeInteger(mark.count)&&mark.count>=0,'SHARD_PIN');
    const bytes=await readFile(join(root,'id',bucket+'.json'));
    assert(bytes.length===mark.bytes&&digest(bytes)===mark.sha256,'SHARD_DIGEST');
    const part=JSON.parse(bytes);
    assert(part.schema==='wand.media.distribution-shard@1'&&
      part.bucket===bucket&&Array.isArray(part.items)&&part.items.length===mark.count,'SHARD_SCHEMA');
    for(const row of part.items){
      assert(isRecord(row)&&Number.isSafeInteger(row.id)&&row.id>0&&
        (row.id&255)===n&&!items.has(String(row.id)),'ITEM_ID');
      items.set(String(row.id),row);
    }
  }
  assert(items.size===13202,'ITEM_COUNT');
  for(const id of rewardIds)assert(items.has(id),'MISSING_REWARD_ID_'+id);
  return {sourceCandidateSha256:digest(raw),items};
}

export function createRewardSubset(rows,promotions){
  assert(rows instanceof Map&&promotions instanceof Map,'INPUT');
  const out={};
  for(const id of rewardIds){
    const row=rows.get(id);
    assert(isRecord(row)&&String(row.id)===id,'MISSING_REWARD_ID_'+id);
    const entry={};
    for(const kind of ['thumbnail','original']){
      const v=row[kind];
      assert(isRecord(v)&&typeof v.key==='string'&&
        Number.isSafeInteger(v.width)&&v.width>0&&v.width<=8192&&
        Number.isSafeInteger(v.height)&&v.height>0&&v.height<=8192,'IMAGE_META');
      if(kind==='thumbnail')assert(v.width<=128&&v.height<=128,'THUMBNAIL_DIMENSIONS');
      const sha=checkKey(v.key,kind);
      const promoted=promotions.get(v.key);
      assert(promoted&&promoted.sha256===sha,'MISSING_PROMOTION_OBJECT');
      entry[kind]={key:v.key,sha256:sha,bytes:promoted.bytes,width:v.width,height:v.height};
    }
    out[id]=entry;
  }
  return out;
}

export async function auditPublicImages(items,origin,{fetcher=fetch}={}){
  const originURL=publicOrigin(origin),seen=new Map();
  for(const row of Object.values(items)){
    for(const kind of ['thumbnail','original']){
      const image=row[kind];
      if(seen.has(image.key)){
        const old=seen.get(image.key);
        assert(old.bytes===image.bytes&&old.width===image.width&&
          old.height===image.height&&old.sha256===image.sha256,'DUPLICATE_CONFLICT');
      }else{seen.set(image.key,image);}
    }
  }
  let audited=0;
  for(const [key,expected] of seen){
    const url=originURL+'/'+key;
    const res=await fetcher(url,{redirect:'error',credentials:'omit',cache:'no-store'});
    assert(res.ok&&res.status===200&&
      res.headers?.get('content-type')?.toLowerCase().split(';')[0].trim()==='image/webp',
      'CDN_UNAVAILABLE_OR_WRONG_MIME');
    const raw=Buffer.from(await res.arrayBuffer());
    assert(raw.length===expected.bytes&&digest(raw)===expected.sha256,'CDN_BYTE_MISMATCH');
    checkWebp(raw,expected.width,expected.height);
    audited++;
  }
  return {audited,publicOrigin:originURL};
}

/** Release requires public bytes, explicit owner signal, and original Guide snapshot. */
export async function publishableManifest({candidateRoot,planPath,starpath,origin,
  approval,releaseId,fetcher=fetch}){
  const {items,sourceCandidateSha256}=await verifyMediaCandidate(candidateRoot);
  const promotions=verifyPromotionPlan(JSON.parse(await readFile(planPath)));
  const subset=createRewardSubset(items,promotions);
  assert(approval==='I_APPROVE_PUBLIC_SRC04_IMAGE_RELEASE','OWNER_PUBLICATION_APPROVAL');
  assert(typeof releaseId==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(releaseId),'RELEASE_ID');
  const audit=await auditPublicImages(subset,origin,{fetcher});
  const manifest={
    schema:'wand.db03.starpath-public-media@1',
    target:{platform:'Steam',gameVersion:'1.26.2',
      db01Release:'steam-1.26.2-native-itemlist-v1',src04Release:RELEASE},
    release:{state:'published',publicationAuthorized:true,
      publicObjectByteAudit:true,publicReadbackVerified:true,
      releaseId,sourceCandidateSha256},
    items:subset
  };
  verifyStarpathMediaManifest(manifest,starpath);
  const bytes=utf8JSON(manifest),sha=digest(bytes);
  assert(bytes.length<=50000,'MANIFEST_TOO_LARGE');
  return {bytes,sha,relPath:'guide/public/starpath-media-'+sha.slice(0,12)+'.json',
    auditedObjects:audit.audited,origin:audit.publicOrigin,itemCount:rewardIds.length};
}
function parseArgs(argv){
  const opts={};
  for(let i=0;i<argv.length;i++){
    const k=argv[i];assert(k.startsWith('--')&&i+1<argv.length,'ARGUMENT');
    assert(!Object.hasOwn(opts,k),'DUPLICATE_ARGUMENT');
    opts[k]=argv[++i];
  }
  return opts;
}
async function main(args){
  const opts=parseArgs(args);
  const root=resolve(opts['--candidate-root']||'');
  const plan=resolve(opts['--promotion-plan']||'');
  assert(Boolean(opts['--candidate-root'])&&Boolean(opts['--promotion-plan']),'INPUT_PATHS');
  const {items,sourceCandidateSha256}=await verifyMediaCandidate(root);
  const promotions=verifyPromotionPlan(JSON.parse(await readFile(plan)));
  const subset=createRewardSubset(items,promotions);
  const objects=new Set(Object.values(subset).flatMap(x=>[x.thumbnail.key,x.original.key]));
  if(opts['--mode']==='plan'){
    // Do not print private source object keys, credentials, or any private filenames.
    process.stdout.write(JSON.stringify({
      status:'awaiting_owner_approval_and_public_cdn_readback',
      sourceCandidateSha256,eligibleRewards:rewardIds.length,
      distinctPublicObjects:objects.size,published:false
    })+'\n');
    return;
  }
  assert(opts['--mode']==='release','MODE_REQUIRED');
  assert(typeof opts['--output-root']==='string','OUTPUT_REQUIRED');
  const snapshot=verifyPublicStarpath(JSON.parse(await readFile(
    new URL('../../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url))));
  const result=await publishableManifest({
    candidateRoot:root,planPath:plan,starpath:snapshot,
    origin:opts['--public-origin'],approval:opts['--approval'],
    releaseId:opts['--release-id']
  });
  const target=join(resolve(opts['--output-root']),result.relPath);
  await mkdir(resolve(opts['--output-root'],'guide','public'),{recursive:true});
  // Exclusive creation: never overwrite an immutable release.
  await writeFile(target,result.bytes,{flag:'wx'});
  process.stdout.write(JSON.stringify({
    status:'generated_locally_not_git_activated',
    relativePublicPath:result.relPath,manifestSha256:result.sha,
    manifestBytes:result.bytes.length,publicObjectsVerified:result.auditedObjects,
    itemCount:result.itemCount,mediaOrigin:result.origin
  })+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(e=>{process.stderr.write(String(e.message)+'\n');process.exitCode=1});
}
