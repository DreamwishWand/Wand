import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {VERIFIED_STARPATH_REWARD_NAMES} from '../src/lib/guide/starpath-reward-names.ts';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.ts';
import {
  verifyPromotionPlan,verifyMediaCandidate,createRewardSubset,
  auditPublicImages,publishableManifest
} from '../tools/src-03-guide/project-starpath-public-media.mjs';

const sha=buf=>createHash('sha256').update(buf).digest('hex');
const output=obj=>Buffer.from(JSON.stringify(obj)+'\n','utf8');
const privateManifest='fd2d07d541293a19ac7b845e996ccf4e3af41270c79daaa56b2ff74316a45e9f';
const prefix='private/staging/src04/steam-v1.26.2/'+privateManifest.slice(0,16)+'/';
const ids=Object.keys(VERIFIED_STARPATH_REWARD_NAMES);
function webp(width,height){
  const src=Buffer.alloc(26);
  src.write('RIFF',0);
  src.writeUInt32LE(src.length-8,4);
  src.write('WEBP',8);
  src.write('VP8L',12);
  src.writeUInt32LE(5,16);
  src[20]=0x2f;
  src.writeUInt32LE((width-1)|((height-1)<<14),21);
  return src;
}
const imageData={
  thumbnail:{bytes:webp(100,94),width:100,height:94},
  original:{bytes:webp(512,476),width:512,height:476}
};
const variants=Object.fromEntries(Object.entries(imageData).map(([kind,v])=>{
  const hash=sha(v.bytes);
  return [kind,{key:`${kind}/${hash.slice(0,2)}/${hash}.webp`,
    width:v.width,height:v.height,bytes:v.bytes.length,sha256:hash}];
}));
const plan=()=>({
  schema:'wand.media.private-promotion-plan@1',
  publicationAuthorized:false,sourceBucket:'dreamwishwand-media-private',
  sourceManifestSha256:privateManifest,targetRelease:'steam-v1.26.2',
  objects:Object.entries(variants).map(([kind,v])=>({
    source:prefix+'images-v2/'+kind+'/'+v.sha256.slice(0,2)+'/'+v.sha256+'.webp',
    target:v.key,sha256:v.sha256,bytes:v.bytes
  }))
});
function safeRow(id){
  return {id,thumbnail:{key:variants.thumbnail.key,width:100,height:94},
    original:{key:variants.original.key,width:512,height:476}};
}
async function candidateFixture(){
  const dir=await mkdtemp(join(tmpdir(),'db03-media-'));
  const root=join(dir,'distribution-candidate');
  await mkdir(join(root,'id'),{recursive:true});
  // 43 current source IDs + 13,159 disjoint synthetic IDs = 13,202 rows.
  const all=[...ids.map(Number),...Array.from({length:13159},(_,i)=>i+1)];
  assert.equal(new Set(all).size,13202);
  const buckets=Array.from({length:256},()=>[]);
  for(const id of all)buckets[id&255].push(safeRow(id));
  const entries={};
  for(let n=0;n<256;n++){
    const key=n.toString(16).padStart(2,'0');
    const bytes=output({schema:'wand.media.distribution-shard@1',bucket:key,items:buckets[n]});
    await writeFile(join(root,'id',key+'.json'),bytes);
    entries['id/'+key+'.json']={count:buckets[n].length,bytes:bytes.length,sha256:sha(bytes)};
  }
  const doc={schema:'wand.media.distribution-candidate@1',
    gameVersion:'steam-v1.26.2',releaseState:'candidate_unpublished',
    bucketCount:256,totalItems:13202,files:entries,cachePolicy:'immutable_content_addressed_media'};
  await writeFile(join(root,'manifest.json'),output(doc));
  const planPath=join(dir,'private-promotion-plan.json');
  await writeFile(planPath,output(plan()));
  return {dir,root,planPath};
}
const catalog=async()=>verifyPublicStarpath(JSON.parse(await readFile(
  new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url))));
const asBuffer=buf=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
function publicFetch({bad=false,type='image/webp'}={}){
  const expected=new Map(Object.entries(variants).map(([kind,v])=>[v.key,imageData[kind].bytes]));
  const seen=[];
  const fetcher=async (url,opts)=>{
    assert.match(url,/^https:\/\/media\.dreamwishwand\.com\/(?:thumbnail|original)\//);
    assert.equal(opts.redirect,'error');
    assert.equal(opts.credentials,'omit');
    seen.push(url);
    const key=url.replace('https://media.dreamwishwand.com/','');
    const bytes=expected.get(key);
    assert.ok(bytes);
    const raw=bad?Buffer.from(bytes):bytes;
    if(bad)raw[20]^=1; // Alter VP8L signature byte, not its already-zero padding.
    return {ok:true,status:200,headers:{get:()=>type},
      arrayBuffer:async()=>asBuffer(raw)};
  };
  return {seen,fetcher};
}

test('full candidate authenticates all 13,202 item IDs and builds only 43 source-verified Star Path joins',async()=>{
  const fixture=await candidateFixture();
  try{
    const {items,sourceCandidateSha256}=await verifyMediaCandidate(fixture.root);
    assert.equal(items.size,13202);
    assert.match(sourceCandidateSha256,/^[a-f0-9]{64}$/);
    const promotions=verifyPromotionPlan(plan());
    assert.equal(promotions.size,2);
    const result=createRewardSubset(items,promotions);
    assert.equal(Object.keys(result).length,43);
    assert.deepEqual(Object.keys(result).sort(),ids.sort());
    assert.equal(result['50800175'].thumbnail.bytes,imageData.thumbnail.bytes.length);
    assert.equal(result['50800175'].original.width,512);
    assert.equal(result['80100000'],undefined,'private currency records are not DB01 item images');
    const testRow={...items.get('50800175'),
      thumbnail:{...items.get('50800175').thumbnail,key:'private/source.png'}};
    const corrupt=new Map(items);corrupt.set('50800175',testRow);
    assert.throws(()=>createRewardSubset(corrupt,promotions),/INVALID_KEY/);
  }finally{await rm(fixture.dir,{recursive:true,force:true});}
});
test('candidate fingerprint and unpublished source state cannot be bypassed',async()=>{
  const fixture=await candidateFixture();
  try{
    const mark=join(fixture.root,'id','00.json');
    const original=await readFile(mark);
    const modified=Buffer.from(original);modified[20]^=1;
    await writeFile(mark,modified);
    await assert.rejects(()=>verifyMediaCandidate(fixture.root),/SHARD_DIGEST/);
    await writeFile(mark,original);
    const manifestPath=join(fixture.root,'manifest.json');
    const manifest=JSON.parse(await readFile(manifestPath));
    manifest.releaseState='published';
    await writeFile(manifestPath,output(manifest));
    await assert.rejects(()=>verifyMediaCandidate(fixture.root),/PRIVATE_CANDIDATE/);
    const source=plan();source.publicationAuthorized=true;
    assert.throws(()=>verifyPromotionPlan(source),/PRIVATE_PROMOTION_SOURCE/);
    const bad=plan();bad.objects[0].target='private/object.webp';
    assert.throws(()=>verifyPromotionPlan(bad),/PRIVATE_OBJECT_KEY/);
  }finally{await rm(fixture.dir,{recursive:true,force:true});}
});
test('public release requires explicit approval AND audits all public encoded bytes without private key leakage',async()=>{
  const fixture=await candidateFixture();
  try{
    const {fetcher,seen}=publicFetch();
    const snapshot=await catalog();
    await assert.rejects(()=>publishableManifest({candidateRoot:fixture.root,
      planPath:fixture.planPath,starpath:snapshot,
      origin:'https://media.dreamwishwand.com/',releaseId:'SRC04_20261122_1',
      approval:'',fetcher}),/OWNER_PUBLICATION_APPROVAL/);
    assert.equal(seen.length,0,'owner approval precedes public fetch');
    const result=await publishableManifest({candidateRoot:fixture.root,
      planPath:fixture.planPath,starpath:snapshot,
      origin:'https://media.dreamwishwand.com/',releaseId:'SRC04_20261122_1',
      approval:'I_APPROVE_PUBLIC_SRC04_IMAGE_RELEASE',fetcher});
    assert.equal(result.itemCount,43);
    assert.equal(result.auditedObjects,2,'shared image bytes audited once per content SHA');
    assert.equal(seen.length,2);
    assert.equal(result.sha,sha(result.bytes));
    assert.match(result.relPath,/^guide\/public\/starpath-media-[a-f0-9]{12}\.json$/);
    const doc=JSON.parse(result.bytes);
    assert.equal(doc.release.publicationAuthorized,true);
    assert.equal(doc.release.publicReadbackVerified,true);
    assert.equal(Object.keys(doc.items).length,43);
    assert.equal(result.bytes.toString().includes('private/staging'),false);
    assert.equal(result.bytes.toString().includes('dreamwishwand-media-private'),false);
    const broken=publicFetch({bad:true});
    await assert.rejects(()=>publishableManifest({candidateRoot:fixture.root,
      planPath:fixture.planPath,starpath:snapshot,
      origin:'https://media.dreamwishwand.com/',releaseId:'SRC04_20261122_1',
      approval:'I_APPROVE_PUBLIC_SRC04_IMAGE_RELEASE',fetcher:broken.fetcher}),/CDN_BYTE_MISMATCH/);
    const html=publicFetch({type:'text/html'});
    await assert.rejects(()=>publishableManifest({candidateRoot:fixture.root,
      planPath:fixture.planPath,starpath:snapshot,
      origin:'https://media.dreamwishwand.com/',releaseId:'SRC04_20261122_1',
      approval:'I_APPROVE_PUBLIC_SRC04_IMAGE_RELEASE',fetcher:html.fetcher}),/CDN_UNAVAILABLE_OR_WRONG_MIME/);
    const evil=publicFetch();
    await assert.rejects(()=>publishableManifest({candidateRoot:fixture.root,
      planPath:fixture.planPath,starpath:snapshot,
      origin:'https://media.dreamwishwand.com.evil.example/',releaseId:'SRC04_20261122_1',
      approval:'I_APPROVE_PUBLIC_SRC04_IMAGE_RELEASE',fetcher:evil.fetcher}),/PUBLIC_ORIGIN/);
    assert.equal(evil.seen.length,0);
  }finally{await rm(fixture.dir,{recursive:true,force:true});}
});
