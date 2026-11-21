import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sha = (data) => createHash('sha256').update(data).digest('hex');
const eight = ['en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR'];
const root = resolve(new URL('..', import.meta.url).pathname);
const tool = join(root, 'tools/db-00/import-db01-v2.mjs');
const sourceItemsSha = 'f'.repeat(64), nativeSha = 'b'.repeat(64), compilerSha = 'c'.repeat(64), sqliteSha = 'd'.repeat(64);

async function syntheticBundle(parent) {
  const shards = join(parent, 'private-shards');
  await mkdir(shards, { recursive: true });
  const cats = ['ActivityItem', 'Furniture', 'Clothing', 'Trimming'];
  const rows = cats.map((category, i) => ({
    itemId: [30000031,40000047,50000094,160000000][i],
    nativeCategory:category, catalogDomain:'item', localizationKey:i === 0 ? 'key' : null,
    nativeKey:'native-'+category, verifiedIconGuid:'guid:'+'a'.repeat(32),
    sourceSha256:'e'.repeat(64),
    names:Object.fromEntries(eight.map(locale=>[locale, locale === 'ja' && i === 0 ? '検証済み' : null]))
  }));
  const files = {};
  async function asset(name, records) {
    const bytes = Buffer.from(JSON.stringify(records) + '\n');
    const path = join(shards, name);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, bytes);
    files[name] = { sha256:sha(bytes), bytes:bytes.length, count:records.length };
  }
  for (let i=0; i<256; i++) await asset('id/'+i.toString(16).padStart(2,'0')+'.json',
    rows.filter(row=>row.itemId%256===i));
  for (let i=0; i<cats.length; i++) await asset('category/'+cats[i]+'.json', [rows[i]]);
  for (const locale of eight) await asset('locale/'+locale+'.json',
    rows.filter(row=>row.names[locale] !== null).map(row=>[row.itemId,row.names[locale]]));
  const manifest = {
    schema:'wand.db01.private-shards@2', platform:'Steam', gameVersion:'1.26.2',
    sourceManifestSha256:compilerSha, nativeSourceManifestSha256:nativeSha,
    sourceItemsSha256:sourceItemsSha, definitions:4,currentNativeItemDefinitions:4,
    sourceFilesVerified:38,sourceFilesTotal:39,fullCorpusParsed:false,
    privateOnly:true,publicationAuthorized:false,bucketCount:256,categories:cats,
    locales:eight,historicalCandidatesIncluded:false,historicalManifestSha256:null,files
  };
  const mb = Buffer.from(JSON.stringify(manifest));
  await writeFile(join(shards,'manifest.json'),mb);
  const audit = {
    schema:'wand.db01.private-native-key-migration@1',status:'PASS',
    publicationAuthorized:false,sourceVersionCoverageComplete:false,
    shardsManifestSha256:sha(mb), sqliteSha256:sqliteSha,
    sourceItemsSha256:sourceItemsSha, definitions:4,nativeKeys:4,
    shardFilesVerified:Object.keys(files).length,gameVersion:'1.26.2',platform:'Steam',
    exactNames:1
  };
  const auditPath=join(parent,'audit.json');
  await writeFile(auditPath,JSON.stringify(audit));
  return {shards,auditPath,manifestSha:sha(mb),sourceItemsSha,sqliteSha,out:join(parent,'db00-private.json')};
}
function invoke(x, changes={}) {
  const args = [
    '--shards',x.shards, '--audit',x.auditPath,
    '--expected-manifest-sha256',x.manifestSha,
    '--expected-sqlite-sha256',x.sqliteSha,
    '--expected-source-items-sha256',x.sourceItemsSha,
    '--out',x.out
  ];
  for (const [key,value] of Object.entries(changes)) {
    const position = args.indexOf('--'+key);
    assert.ok(position >= 0);
    args[position+1] = value;
  }
  return spawnSync(process.execPath,[
    '--experimental-strip-types',tool,...args
  ],{ cwd:root,encoding:'utf8',timeout:30000 });
}
test('DB-00 imports SHA-pinned DB-01 v2 shards using the existing TypeScript bridge', {timeout:40000}, async () => {
  const path=await mkdtemp(join(tmpdir(),'db00-v2-'));
  try {
    const bundle=await syntheticBundle(path);
    const run=invoke(bundle);
    assert.equal(run.status,0,run.stderr);
    const result=JSON.parse(run.stdout);
    const snapshot=JSON.parse(await readFile(bundle.out,'utf8'));
    assert.equal(result.verifiedItemDefinitions,4);
    assert.equal(result.excludedUnclassifiedDefinitions,0);
    assert.equal(result.currentlyNamedItems,1);
    assert.equal(result.publicationAuthorized,false);
    assert.equal(snapshot.publishable,false);
    assert.equal(snapshot.coverage.complete,false);
    assert.equal(snapshot.target.buildId,null);
    assert.equal(snapshot.target.sourceSha256,nativeSha);
    assert.deepEqual(snapshot.items.find(item=>item.id==='30000031').names,{ja:'検証済み'});
    assert.equal(snapshot.items[0].sourceRefs.length,2);
    assert.equal(JSON.stringify(snapshot).includes('native-ActivityItem'),false);
    assert.equal(JSON.stringify(snapshot).includes('verifiedIconGuid'),false);
    // Private immutable output must not overwrite its original.
    const second=invoke(bundle);
    assert.notEqual(second.status,0);
    assert.match(second.stderr,/OUTPUT_ALREADY_EXISTS/);
  } finally { await rm(path,{recursive:true,force:true}); }
});
test('DB-00 v2 importer fails closed on altered Shard and unpinned manifest', {timeout:40000}, async () => {
  const path=await mkdtemp(join(tmpdir(),'db00-v2-bad-'));
  try {
    const bundle=await syntheticBundle(path);
    const unpinned=invoke(bundle,{'expected-manifest-sha256':'0'.repeat(64)});
    assert.notEqual(unpinned.status,0);
    assert.match(unpinned.stderr,/TRUST_PIN_MISMATCH/);
    const category=join(bundle.shards,'category/ActivityItem.json');
    await writeFile(category,(await readFile(category,'utf8'))+' ');
    const mutated=invoke(bundle);
    assert.notEqual(mutated.status,0);
    assert.match(mutated.stderr,/ASSET_(HASH|SIZE)_MISMATCH/);
    await assert.rejects(readFile(bundle.out),/ENOENT/);
  } finally { await rm(path,{recursive:true,force:true}); }
});
