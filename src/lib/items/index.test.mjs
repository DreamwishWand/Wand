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

test('SHA verification and JSON parsing use the same immutable bytes',async()=>{
  const f=fixture(false);
  const payload=f.raw.get('id/05.json');
  const originalCrypto=globalThis.crypto;
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  const originalDigest=originalCrypto.subtle.digest.bind(originalCrypto.subtle);
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{
    digest:async (...args)=>{
      const digest=await originalDigest(...args);
      // Simulate a loader reusing its own buffer after the async SHA calculation.
      payload.fill(32);
      return digest;
    },
  }}});
  try{
    const db=createDb01CatalogClient(f.manifest,f.load);
    assert.equal((await db.getItem(5))?.names.en,'Royal Cup');
    assert.equal(payload[0],32);
  }finally{
    if(descriptor) Object.defineProperty(globalThis,'crypto',descriptor);
    else delete globalThis.crypto;
  }
});
test('locale index validates duplicate rows even after search result limit',async()=>{
  const f=fixture(false);
  const path='locale/en.json';
  const data=new TextEncoder().encode(JSON.stringify([[5,'Royal Cup'],[5,'Duplicate']])+'\n');
  f.raw.set(path,data);
  f.manifest.files[path]={sha256:sha(data),bytes:data.length,count:2};
  const db=createDb01CatalogClient(f.manifest,f.load);
  await assert.rejects(db.searchExactNames('Royal','en',1),/DUPLICATE_NAME_INDEX_ID/);
});
test('historical candidate validates every record, including after matching item',async()=>{
  const f=fixture();
  const path='historical/06.json';
  const data=new TextEncoder().encode(JSON.stringify([
    [262,'ja','昔の名前','1.26.1'],[262,'ja','重複した名前','1.26.1'],
  ])+'\n');
  f.raw.set(path,data);
  f.manifest.files[path]={sha256:sha(data),bytes:data.length,count:2};
  const db=createDb01CatalogClient(f.manifest,f.load);
  await assert.rejects(db.getName(262,'ja',{allowHistorical:true}),/DUPLICATE_HISTORY_ENTRY/);
});
test('invalid source file coverage and historical baseline are rejected',async()=>{
  const f=fixture();
  assert.throws(()=>validateDb01Shards({...f.manifest,sourceFilesVerified:-1}),/INVALID_COVERAGE/);
  const path='historical/06.json';
  const data=new TextEncoder().encode(JSON.stringify([[262,'ja','昔の名前','unknown']])+'\n');
  f.raw.set(path,data);
  f.manifest.files[path]={sha256:sha(data),bytes:data.length,count:1};
  await assert.rejects(createDb01CatalogClient(f.manifest,f.load).getName(262,'ja',{allowHistorical:true}),/INVALID_HISTORY_ROW/);
});


test('bounded batch lookup preserves ID order, missing rows and duplicates with one load per bucket',async()=>{
  const f=fixture(false), db=createDb01CatalogClient(f.manifest,f.load);
  const rows=await db.getItems([262,5,999,5]);
  assert.deepEqual(rows.map(row=>row?.itemId??null),[262,5,null,5]);
  assert.equal(rows[1],rows[3]);
  assert.ok(Object.isFrozen(rows));
  assert.ok(rows[0] && Object.isFrozen(rows[0]));
  assert.deepEqual(new Set(f.calls),new Set(['id/06.json','id/05.json','id/e7.json']));
  assert.equal(f.calls.length,3);
  assert.equal((await db.getItem(5))?.itemId,5);
  assert.equal(f.calls.length,3);
});
test('batch rejects unbounded and invalid IDs without opening any private assets',async()=>{
  const f=fixture(), db=createDb01CatalogClient(f.manifest,f.load);
  assert.deepEqual(await db.getItems([]),[]);
  await assert.rejects(db.getItems([5,0]),/INVALID_BATCH_IDS/);
  await assert.rejects(db.getItems([5,1.1]),/INVALID_BATCH_IDS/);
  await assert.rejects(db.getItems([NaN]),/INVALID_BATCH_IDS/);
  await assert.rejects(db.getItems(Array(4097).fill(5)),/INVALID_BATCH_IDS/);
  await assert.rejects(db.getItems('5'),/INVALID_BATCH_IDS/);
  assert.deepEqual(f.calls,[]);
});
test('batch caps concurrent private shard loads at eight and validates 20 different buckets',async()=>{
  const f=fixture(false);
  let concurrent=0, maximum=0;
  const read=async path=>{
    concurrent++;
    maximum=Math.max(maximum,concurrent);
    try{
      await new Promise(resolve=>setImmediate(resolve));
      return f.load(path);
    }finally{concurrent--;}
  };
  const db=createDb01CatalogClient(f.manifest,read);
  const rows=await db.getItems(Array.from({length:20},(_,i)=>1000+i));
  assert.equal(rows.length,20);
  assert.ok(rows.every(row=>row===null));
  assert.equal(f.calls.length,20);
  assert.ok(maximum<=8 && maximum>1);
});
test('one invalid requested bucket rejects entire batch, without partial result',async()=>{
  const f=fixture(false);
  const wrong=[{...first,itemId:6}];
  const bytes=new TextEncoder().encode(JSON.stringify(wrong)+'\n');
  f.raw.set('id/05.json',bytes);
  f.manifest.files['id/05.json']={sha256:sha(bytes),bytes:bytes.length,count:1};
  const db=createDb01CatalogClient(f.manifest,f.load);
  await assert.rejects(db.getItems([262,5]),/WRONG_ID_BUCKET/);
});


test('private shard client freezes an independent caller-owned manifest snapshot',async()=>{
  const f=fixture(false);
  const db=createDb01CatalogClient(f.manifest,f.load);
  // Simulate UI code overwriting the original object after validation,
  // before the first asynchronous private file read.
  f.manifest.files['id/05.json'].sha256=sha('incorrect digest');
  f.manifest.files['id/05.json'].bytes=3;
  f.manifest.files['category/ActivityItem.json']={sha256:sha('wrong'),bytes:3,count:1};
  f.manifest.categories[0]='Tampered';
  f.manifest.locales[0]='xx';
  f.manifest.definitions=999;
  f.manifest.gameVersion='9.9.9';
  assert.equal(db.source.definitions,2);
  assert.equal(db.source.gameVersion,'1.26.2');
  assert.equal((await db.getItem(5))?.itemId,5);
  assert.equal((await db.getCategory('ActivityItem'))[0].itemId,5);
  assert.equal((await db.getName(5,'en'))?.value,'Royal Cup');
});
test('manifest catches inconsistent ID, category and native item totals before private reads',()=>{
  const broken=(fn,code)=>{
    const f=fixture();
    fn(f.manifest);
    assert.throws(()=>createDb01CatalogClient(f.manifest,f.load),new RegExp(code));
    assert.deepEqual(f.calls,[]);
  };
  broken(m=>{m.files['id/05.json'].count=0;},'SHARD_LEDGER_TOTAL_MISMATCH');
  broken(m=>{m.files['category/Character.json'].count=0;},'SHARD_LEDGER_TOTAL_MISMATCH');
  broken(m=>{m.currentNativeItemDefinitions=2;},'SHARD_LEDGER_TOTAL_MISMATCH');
  broken(m=>{m.files['locale/en.json'].count=3;},'LOCALE_LEDGER_OVERFLOW');
  broken(m=>{m.files['historical/06.json'].count=17;},'HISTORY_LEDGER_OVERFLOW');
  broken(m=>{m.fullCorpusParsed=true;},'INCOMPLETE_CORPUS_LEDGER');
  broken(m=>{m.files['id/05.json'].count=Number.MAX_SAFE_INTEGER+1;},'INVALID_ASSET_METADATA');
});
test('manifest resists an in-flight loader rewriting source verification metadata',async()=>{
  const f=fixture(false);
  const db=createDb01CatalogClient(f.manifest,async path=>{
    f.manifest.files[path].sha256=sha('changed during file access');
    f.manifest.files[path].bytes=1;
    return f.load(path);
  });
  assert.equal((await db.getItem(5))?.itemId,5);
  assert.equal(f.calls.length,1);
});


test('complete future source manifest remains valid when every source file is verified',()=>{
  const f=fixture(false);
  f.manifest.sourceFilesVerified=f.manifest.sourceFilesTotal;
  f.manifest.fullCorpusParsed=true;
  assert.doesNotThrow(()=>validateDb01Shards(f.manifest));
  const db=createDb01CatalogClient(f.manifest,f.load);
  assert.equal(db.source.fullCorpusParsed,true);
  assert.deepEqual(f.calls,[]);
});
