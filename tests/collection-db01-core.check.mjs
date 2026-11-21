/** CI: invoke with --experimental-strip-types on Node 22 to exercise real DB-01 TS client. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {inspectPrivateDb01Names} from '../src/lib/collection/private-db01-names-worker-core.mjs';
const digest=buf=>createHash('sha256').update(buf).digest('hex');
const locales=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
const item={itemId:100,nativeCategory:'Furniture',catalogDomain:'item',nativeKey:'F-100',
  localizationKey:null,sourceSha256:'c'.repeat(64),verifiedIconGuid:'guid:'+'0'.repeat(32),
  names:{en:'Verified item',fr:null,it:null,de:null,'es-ES':null,ja:'正式確認名','zh-CN':null,'pt-BR':null}};
function packed(x){return Buffer.from(JSON.stringify(x)+'\n');}
function crc32(b){let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);}return(c^0xffffffff)>>>0;}
function zip(files){const local=[],central=[];let offset=0;
  for(const [path,payload] of files){const name=Buffer.from(path),body=deflateRawSync(payload),crc=crc32(payload);
    const lh=Buffer.alloc(30+name.length+body.length),ch=Buffer.alloc(46+name.length);
    lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(8,8);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(body.length,18);lh.writeUInt32LE(payload.length,22);lh.writeUInt16LE(name.length,26);name.copy(lh,30);body.copy(lh,30+name.length);
    ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(8,10);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(body.length,20);ch.writeUInt32LE(payload.length,24);ch.writeUInt16LE(name.length,28);ch.writeUInt32LE(offset,42);name.copy(ch,46);
    local.push(lh);central.push(ch);offset+=lh.length;
  }
  const cent=Buffer.concat(central),tail=Buffer.alloc(22);tail.writeUInt32LE(0x06054b50,0);tail.writeUInt16LE(files.length,8);tail.writeUInt16LE(files.length,10);tail.writeUInt32LE(cent.length,12);tail.writeUInt32LE(offset,16);
  return Buffer.concat([...local,cent,tail]);
}
function fixture({tamper=false}={}){
 const files={};
 for(let i=0;i<256;i++)files[`id/${i.toString(16).padStart(2,'0')}.json`]=packed(i===100?[item]:[]);
 files['category/Furniture.json']=packed([item]);
 for(const loc of locales)files[`locale/${loc}.json`]=packed(item.names[loc]?[[100,item.names[loc]]]:[]);
 const manifest={schema:'wand.db01.private-shards@2',platform:'Steam',gameVersion:'1.26.2',
  sourceManifestSha256:'a'.repeat(64),nativeSourceManifestSha256:'b'.repeat(64),sourceItemsSha256:'c'.repeat(64),
  definitions:1,currentNativeItemDefinitions:1,sourceFilesVerified:1,sourceFilesTotal:1,
  fullCorpusParsed:false,privateOnly:true,publicationAuthorized:false,bucketCount:256,categories:['Furniture'],
  locales,historicalCandidatesIncluded:false,historicalManifestSha256:null,
  files:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,{sha256:digest(v),bytes:v.length,count:JSON.parse(v).length}]))};
 const manifestBytes=packed(manifest);
 const trusted={platform:'Steam',gameVersion:'1.26.2',manifestSha256:digest(manifestBytes),
  nativeSourceManifestSha256:manifest.nativeSourceManifestSha256,sourceItemsSha256:manifest.sourceItemsSha256};
 if(tamper)files['id/64.json']=packed([{...item,names:{...item.names,en:'Verified name'}}]);
 const archive=zip([['private-shards/manifest.json',manifestBytes],...Object.entries(files).map(([k,v])=>['private-shards/'+k,v])]);
 return{archive,trusted};
}

test('real DB-01 TypeScript client returns only exact source names from independently pinned private ZIP',async()=>{
 const f=fixture();
 const res=await inspectPrivateDb01Names(f.archive,[100,101],f.trusted);
 assert.equal(res.kind,'db01-private-exact-names');
 assert.equal(res.sourceManifestSha256,f.trusted.manifestSha256);
 assert.deepEqual(res.items[0].exactNames,{en:'Verified item',ja:'正式確認名'});
 assert.deepEqual(res.items[0].historicalNames,{});
 assert.equal(res.items[0].nativeCategory,'Furniture');
 assert.deepEqual(res.items[1].exactNames,{});
 assert.equal(res.saveVersionParityVerified,false);
 assert.equal(res.historicalCandidatesImported,false);
 assert.equal(res.historicalCandidatesAreCurrentVerified,false);
 assert.equal(res.publicationAuthorized,false);
});
test('independent manifest pin rejects substituted ZIP',async()=>{
 const f=fixture();
 await assert.rejects(inspectPrivateDb01Names(f.archive,[100],{...f.trusted,manifestSha256:'0'.repeat(64)}),/MANIFEST_PIN_MISMATCH/);
});
test('SHA mismatch of a changed item shard fails closed',async()=>{
 const f=fixture({tamper:true});
 await assert.rejects(inspectPrivateDb01Names(f.archive,[100],f.trusted),/ASSET_HASH_MISMATCH/);
});
test('bad Item ID order, duplicate IDs and invalid version fail before source requests',async()=>{
 const f=fixture();
 await assert.rejects(inspectPrivateDb01Names(f.archive,[101,100],f.trusted),/INVALID_ITEM_IDS/);
 await assert.rejects(inspectPrivateDb01Names(f.archive,[100,100],f.trusted),/INVALID_ITEM_IDS/);
 await assert.rejects(inspectPrivateDb01Names(f.archive,[100],{...f.trusted,gameVersion:'1.26.3'}),/RELEASE_PIN_REQUIRED/);
});