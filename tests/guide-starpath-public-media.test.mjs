import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.ts';
import {
  STARPATH_MEDIA_ACTIVATION,validateStarpathMediaActivation,
  verifyStarpathMediaManifest,loadStarpathMedia,starpathMediaThumbnail
} from '../src/lib/guide/starpath-public-media.ts';

const snapshot=async()=>verifyPublicStarpath(JSON.parse(await readFile(
  new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url))));
const HASH_A='a'.repeat(64),HASH_B='b'.repeat(64);
const thumbnail={key:`images/${HASH_A}.webp`,sha256:HASH_A,bytes:4567,width:100,height:94};
const original={key:`images/${HASH_B}.webp`,sha256:HASH_B,bytes:19922,width:512,height:476};
const manifest=()=>({
  schema:'wand.db03.starpath-public-media@1',
  target:{platform:'Steam',gameVersion:'1.26.2',
    db01Release:'steam-1.26.2-native-itemlist-v1',src04Release:'steam-v1.26.2'},
  release:{state:'published',publicationAuthorized:true,publicObjectByteAudit:true,
    publicReadbackVerified:true,releaseId:'SRC04_20261122_REVIEWED',
    sourceCandidateSha256:'c'.repeat(64)},
  items:{'50800175':{thumbnail:{...thumbnail},original:{...original}}}
});
const pinFor=obj=>{
  const bytes=Buffer.from(JSON.stringify(obj)+'\n','utf8');
  const sha=createHash('sha256').update(bytes).digest('hex');
  return {bytes,activation:{state:'published',manifestPath:`guide/public/starpath-media-${sha.slice(0,12)}.json`,
    manifestSha256:sha,manifestBytes:bytes.length,publicOrigin:'https://media.dreamwishwand.com/'}};
};
const wire=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);

test('SRC-04 non-public staging never creates a browser request, image URL or private path',async()=>{
  const catalog=await snapshot();
  assert.deepEqual(STARPATH_MEDIA_ACTIVATION,{state:'unpublished',manifestPath:null,
    manifestSha256:null,manifestBytes:null,publicOrigin:null});
  assert.equal(validateStarpathMediaActivation(),null);
  let called=0;
  const media=await loadStarpathMedia('/Wand/',catalog,{fetcher:()=>{called++;throw Error('must not fetch')}});
  assert.equal(called,0);
  assert.equal(media,null);
  for(const id of ['50800175','80100000','100000778','__proto__'])
    assert.equal(starpathMediaThumbnail(media,id),null);
  assert.throws(()=>validateStarpathMediaActivation({...STARPATH_MEDIA_ACTIVATION,publicOrigin:'https://media.dreamwishwand.com'}),/unpublished release/);
});
test('published manifest only accepts exact Steam 1.26.2 reward ItemIDs and fully content-addressed variants',async()=>{
  const catalog=await snapshot();
  const candidate=manifest();
  assert.equal(verifyStarpathMediaManifest(candidate,catalog),candidate);
  const missingOriginal=manifest();delete missingOriginal.items['50800175'].original;
  assert.throws(()=>verifyStarpathMediaManifest(missingOriginal,catalog),/two variant policy/);
  const unauthorized=manifest();unauthorized.release.state='candidate_unpublished';
  assert.throws(()=>verifyStarpathMediaManifest(unauthorized,catalog),/unverified media publication/);
  const privateFile=manifest();privateFile.items['50800175'].thumbnail.key='private/staging/src04/example.webp';
  assert.throws(()=>verifyStarpathMediaManifest(privateFile,catalog),/non-content-addressed public path/);
  const misleading=manifest();misleading.items['50800175'].thumbnail.key=`media/steam-v1.26.1/thumbnail/aa/${HASH_A}.webp`;
  assert.throws(()=>verifyStarpathMediaManifest(misleading,catalog),/non-content-addressed public path/);
  const mismatch=manifest();mismatch.items['50800175'].original.sha256='d'.repeat(64);
  assert.throws(()=>verifyStarpathMediaManifest(mismatch,catalog),/non-content-addressed public path/);
  const bigThumb=manifest();bigThumb.items['50800175'].thumbnail.width=129;
  assert.throws(()=>verifyStarpathMediaManifest(bigThumb,catalog),/oversized thumbnail/);
  const unknownId=manifest();unknownId.items={'999999999':unknownId.items['50800175']};
  assert.throws(()=>verifyStarpathMediaManifest(unknownId,catalog),/no source-verified image association/);
  const currency=manifest();currency.items={'80100000':currency.items['50800175']};
  assert.throws(()=>verifyStarpathMediaManifest(currency,catalog),/no source-verified image association/);
  const privateLeak=manifest();privateLeak.secret='private/staging';
  assert.throws(()=>verifyStarpathMediaManifest(privateLeak,catalog),/schema or private fields/);
});
test('only SHA-pinned release manifest loaded from application origin can produce public images',async()=>{
  const catalog=await snapshot(),{bytes,activation}=pinFor(manifest());
  let sourceUrl='';
  const media=await loadStarpathMedia('/Wand/',catalog,{activation,fetcher:async url=>{
    sourceUrl=url;return {ok:true,arrayBuffer:async()=>wire(bytes)}
  }});
  assert.equal(sourceUrl,'/Wand/'+activation.manifestPath);
  assert.equal(starpathMediaThumbnail(media,'50800175'),
    'https://media.dreamwishwand.com/'+thumbnail.key);
  assert.equal(starpathMediaThumbnail(media,'100000778'),null,'unpublished motif artwork');
  assert.equal(starpathMediaThumbnail(media,'80100000'),null,'unpublished currency artwork');
  const changed=Buffer.from(bytes);changed[50]^=1;
  await assert.rejects(()=>loadStarpathMedia('/Wand/',catalog,{activation,fetcher:async()=>({
    ok:true,arrayBuffer:async()=>wire(changed)})}),/fingerprint mismatch/);
  const bytesShort=bytes.subarray(0,bytes.length-1);
  await assert.rejects(()=>loadStarpathMedia('/Wand/',catalog,{activation,fetcher:async()=>({
    ok:true,arrayBuffer:async()=>wire(bytesShort)})}),/byte count mismatch/);
});
test('image activation requires explicitly reviewed HTTPS content origin and pinned descriptor',async()=>{
  const {activation}=pinFor(manifest());
  for(const untrusted of [
    'http://media.dreamwishwand.com/',
    'https://dreamwishwand-media-private.r2.cloudflarestorage.com/',
    'https://media.dreamwishwand.com.evil.example/',
    'https://media.dreamwishwand.com/private/',
    'https://media.dreamwishwand.com/?token=abc',
    'https://user:pass@media.dreamwishwand.com/',
    'https://192.168.1.2/'
  ])assert.throws(()=>validateStarpathMediaActivation({...activation,publicOrigin:untrusted}),/unapproved media origin/);
  assert.throws(()=>validateStarpathMediaActivation({...activation,manifestPath:'guide/public/other.json'}),/unapproved manifest pin/);
  assert.throws(()=>validateStarpathMediaActivation({...activation,manifestPath:'guide/public/starpath-media-000000000000.json'}),/pinned fingerprint/);
  assert.equal(validateStarpathMediaActivation(activation).publicOrigin,'https://media.dreamwishwand.com');
});

test('typed media gate rejects forged reward catalog even when an Item ID appears to match',async()=>{
  const catalog=await snapshot();
  const counterfeit=structuredClone(catalog);
  counterfeit.seasons[0].id='HauntingElegance2025';
  assert.throws(()=>verifyStarpathMediaManifest(manifest(),counterfeit),
    /Public Star Path: season identity/);
  const substituted=structuredClone(catalog);
  substituted.source.fileSha256='0'.repeat(64);
  assert.throws(()=>verifyStarpathMediaManifest(manifest(),substituted),
    /Public Star Path: provenance/);
  const missing=structuredClone(catalog);
  missing.seasons[0].rewardPages[0].rewards.pop();
  assert.throws(()=>verifyStarpathMediaManifest(manifest(),missing),
    /Public Star Path: source reward census/);
  const modified=structuredClone(catalog);
  modified.seasons[0].tasks[0].id=modified.seasons[0].tasks[1].id;
  assert.throws(()=>verifyStarpathMediaManifest(manifest(),modified),
    /Public Star Path: task source identity|Public Star Path: duplicate task/);
});
test('typed gate refuses unapproved origins, malformed releases, non-source media and network on inactive state',async()=>{
  const catalog=await snapshot();
  for(const invalid of [null,[],{},'published',42,{state:'unpublished',
    manifestPath:null,manifestSha256:null,manifestBytes:1,publicOrigin:null}]){
    assert.throws(()=>validateStarpathMediaActivation(invalid),
      /activation record|unpublished release|unapproved manifest pin/);
  }
  const candidate=manifest();
  candidate.release.sourceCandidateSha256='xyz';
  assert.throws(()=>verifyStarpathMediaManifest(candidate,catalog),
    /unverified media publication/);
  const duplicated=manifest();
  duplicated.items['50800175'].thumbnail.key=duplicated.items['50800175'].original.key;
  assert.throws(()=>verifyStarpathMediaManifest(duplicated,catalog),
    /non-content-addressed public path/);
  const {activation,bytes}=pinFor(manifest());
  await assert.rejects(()=>loadStarpathMedia('/Wand/../',catalog,{
    activation,fetcher:async()=>({ok:true,arrayBuffer:async()=>wire(bytes)})
  }),/invalid application base/);
  assert.equal(starpathMediaThumbnail({manifest:manifest(),
    origin:'https://media.dreamwishwand.com.evil.example'},'50800175'),null);
  assert.equal(starpathMediaThumbnail({manifest:manifest(),
    origin:'https://cdn.dreamwishwand.com/'},'50800175'),
  'https://cdn.dreamwishwand.com/'+thumbnail.key);
});
