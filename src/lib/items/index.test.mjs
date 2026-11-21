import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDb01CatalogClient, validateDb01Shards, DB01_LOCALES, DB01_SHARDS_SCHEMA } from './index.ts';

const sha = v => createHash('sha256').update(v).digest('hex');
const cats = ['ActivityItem', 'Character'];
const names = (en = null, ja = null) => ({en,fr:null,it:null,de:null,'es-ES':null,ja,'zh-CN':null,'pt-BR':null});
const first = {itemId:5,nativeCategory:'ActivityItem',catalogDomain:'item',localizationKey:'ActivityItem.X',nativeKey:'Crafting!SyntheticCup',sourceSha256:sha('source-A'),verifiedIconGuid:'guid:'+'1'.repeat(32),names:names('Royal Cup')};
const second = {itemId:262,nativeCategory:'Character',catalogDomain:'definition_unclassified',localizationKey:'Character.Y',nativeKey:'Character!Synthetic',sourceSha256:sha('source-B'),verifiedIconGuid:null,names:names(null,null)};
function fixture(history=true) {
  const raw = new Map();
  const files = {};
  function add(path, rows) {
    const bytes = new TextEncoder().encode(JSON.stringify(rows)+'\n');
    raw.set(path,bytes);
    files[path]={sha256:sha(bytes),bytes:bytes.length,count:rows.length};
  }
  for(let i=0;i<256;i++) {
    const hex=i.toString(16).padStart(2,'0');
    add(`id/${hex}.json`,[first,second].filter(r=>r.itemId%256===i));
    if(history) add(`historical/${hex}.json`, i===6?[[262,'ja','昔の名前','1.26.1']]:[]);
  }
  for(const cat of cats) add(`category/${cat}.json`,[first,second].filter(r=>r.nativeCategory===cat));
  for(const locale of DB01_LOCALES) add(`locale/${locale}.json`,locale==='en'?[[5,'Royal Cup']]:[]);
  const manifest={schema:DB01_SHARDS_SCHEMA,platform:'Steam',gameVersion:'1.26.2',
    sourceManifestSha256:sha('source-manifest'),nativeSourceManifestSha256:sha('native-manifest'),sourceItemsSha256:sha('source-items'),
    definitions:2,currentNativeItemDefinitions:1,sourceFilesVerified:38,sourceFilesTotal:39,fullCorpusParsed:false,
    privateOnly:true,publicationAuthorized:false,bucketCount:256,
    locales:[...DB01_LOCALES],categories:cats,historicalCandidatesIncluded:history,
    historicalManifestSha256:history?sha('history'):null,files};
  const calls=[];
  const load=async path=>{calls.push(path); return raw.get(path);};
  return {manifest,files,raw,calls,load};
}
test('TypeScript lazy API loads one ID bucket only, validates SHA and memoizes', async()=>{
  const f=fixture();
  const db=createDb01CatalogClient(f.manifest,f.load);
  assert.equal(db.source.definitions,2);
  assert.equal((await db.getItem(5)).nativeCategory,'ActivityItem');
  assert.deepEqual(f.calls,['id/05.json']);
  assert.equal((await db.getItem(5)).names.en,'Royal Cup');
  assert.equal((await db.getItem(773)),null);
  assert.deepEqual(f.calls,['id/05.json']);
  assert.ok(Object.isFrozen(await db.getItem(5)));
  assert.ok(Object.isFrozen((await db.getItem(5)).names));
});
test('category lookup loads only the category shard', async()=>{
  const f=fixture(false), db=createDb01CatalogClient(f.manifest,f.load);
  assert.deepEqual((await db.getCategory('Character')).map(x=>x.itemId),[262]);
  assert.deepEqual(f.calls,['category/Character.json']);
  await assert.rejects(db.getCategory('Condition'),/INVALID_CATEGORY/);
});
test('source-native identity lookup loads only its category and never infers item status', async()=>{
  const f=fixture(), db=createDb01CatalogClient(f.manifest,f.load);
  assert.equal((await db.getByNativeKey('ActivityItem','Crafting!SyntheticCup'))?.itemId,5);
  assert.equal((await db.getByNativeKey('Character','Character!Synthetic'))?.catalogDomain,'definition_unclassified');
  assert.equal(await db.getByNativeKey('Character','Unknown!Key'),null);
  assert.deepEqual(f.calls,['category/ActivityItem.json','category/Character.json']);
  await assert.rejects(db.getByNativeKey('Character',' BadKey '),/INVALID_NATIVE_KEY/);
  await assert.rejects(db.getByNativeKey('Condition','Anything'),/INVALID_CATEGORY/);
});
test('search index reads only selected locale and never historic candidates', async()=>{
  const f=fixture(), db=createDb01CatalogClient(f.manifest,f.load);
  assert.deepEqual((await db.searchExactNames('ROYAL','en')).map(x=>x.itemId),[5]);
  assert.deepEqual(await db.searchExactNames('昔','ja'),[]);
  assert.deepEqual(f.calls,['locale/en.json','locale/ja.json']);
});
test('historic candidate is opt-in, never replaces verified exact official name', async()=>{
  const f=fixture(), db=createDb01CatalogClient(f.manifest,f.load);
  assert.equal(await db.getName(262,'ja'),null);
  assert.equal((await db.getName(262,'ja',{allowHistorical:true})).evidence,'historical_prefix_crc_correlated_unverified_current');
  assert.equal((await db.getName(262,'ja',{allowHistorical:true})).baselineVersion,'1.26.1');
  assert.equal((await db.getName(5,'en',{allowHistorical:true})).evidence,'current_exact_locdb_join');
  assert.equal(f.calls.filter(x=>x.startsWith('historical/')).length,1);
});
test('history absent: opt-in does not fabricate or fetch data', async()=>{
  const f=fixture(false),db=createDb01CatalogClient(f.manifest,f.load);
  assert.equal(await db.getName(262,'ja',{allowHistorical:true}),null);
  assert.deepEqual(f.calls,['id/06.json']);
});
test('source bytes SHA, count, category provenance, and bucket boundary reject tampering',async()=>{
  const f=fixture();
  f.raw.set('id/05.json',new TextEncoder().encode('[{}]\n'));
  await assert.rejects(createDb01CatalogClient(f.manifest,f.load).getItem(5),/ASSET_SIZE_MISMATCH|ASSET_HASH_MISMATCH/);
  const x=fixture();
  const bad=[{...first,itemId:6}];
  const data=new TextEncoder().encode(JSON.stringify(bad)+'\n');
  x.raw.set('id/05.json',data);
  x.manifest.files['id/05.json']={sha256:sha(data),bytes:data.length,count:1};
  await assert.rejects(createDb01CatalogClient(x.manifest,x.load).getItem(5),/WRONG_ID_BUCKET/);
});
test('private source contract rejects scope changes and disallowed paths',()=>{
  const f=fixture();
  assert.doesNotThrow(()=>validateDb01Shards(f.manifest));
  assert.throws(()=>validateDb01Shards({...f.manifest,publicationAuthorized:true}),/PRIVATE_SCHEMA_REQUIRED/);
  assert.throws(()=>validateDb01Shards({...f.manifest,privateOnly:false}),/PRIVATE_SCHEMA_REQUIRED/);
  assert.throws(()=>validateDb01Shards({...f.manifest,sourceItemsSha256:'123'}),/UNVERIFIED_SOURCE/);
  assert.throws(()=>validateDb01Shards({...f.manifest,files:{...f.manifest.files,'../../leak.json':f.manifest.files['id/00.json']}}),/UNEXPECTED_ASSET_PATHS/);
});
test('invalid caller arguments rejected without downloads',async()=>{
  const f=fixture(),db=createDb01CatalogClient(f.manifest,f.load);
  await assert.rejects(db.getItem(0),/INVALID_ID/);
  await assert.rejects(db.getCategory('../../escape'),/INVALID_CATEGORY/);
  await assert.rejects(db.searchExactNames('x','en',0),/INVALID_SEARCH/);
  await assert.rejects(db.searchExactNames('x','xx'),/INVALID_LOCALE/);
  assert.deepEqual(f.calls,[]);
});