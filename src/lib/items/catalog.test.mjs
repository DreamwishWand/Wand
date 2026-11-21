import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ITEM_LOCALES } from './records.mjs';
import { DB01_CANONICAL_SCHEMA, DB01_PARTIAL_SCHEMA, validateDb01Manifest,
  createPrivateItemCatalog, openPrivateItemCatalog } from './catalog.mjs';
import { DB01_DB00_JOIN_CONTRACT, createDb01Db00Patch } from './db00-join.mjs';
import { applyPatch, SNAPSHOT_SCHEMA } from '../game-db/model.mjs';

const sha = letter => letter.repeat(64);
const names = () => Object.fromEntries(ITEM_LOCALES.map(loc => [loc,null]));
const checks = () => Object.fromEntries(ITEM_LOCALES.map(loc => [loc,'unresolved']));
function row(id, nativeCategory, domain) {
  const primary = domain === 'item';
  return {
    itemId:id, catalogDomain:domain, nativeCategory, nativeNameField:'Source!Name',
    names:names(), category:null, subcategory:null, worlds:null, universes:null,
    expansions:null, attributes:null, image:{iconGuid:primary?'guid:'+('a'.repeat(32)):null,
      mediaExtracted:false}, historicalReference:null,
    source:{platform:'Steam',gameVersion:'1.26.2',
      file:`ddv_Data/StreamingAssets/itemlist/${nativeCategory}.json`,sha256:sha('c')},
    verification:{itemId:'native_frame_verified',nativeCategory:'native_file_verified',
      currentVersionObserved:true,names:checks(),
      iconGuid:primary?'native_wire_verified':'unresolved'},
  };
}
function data() {
  const item=row(30000031,'ActivityItem','item');
  item.historicalReference={source:{platform:'Nintendo Switch',gameVersion:'1.25.0'},
    category:'Gems',names:{en:'Old unrelated name'},worlds:['Valley']};
  item.names.ja='公式名称';item.verification.names.ja='exact_locdb_join';
  const extra=row(180000001,'BoardGame','definition_unclassified');
  extra.names.en='Verified Board Game';extra.verification.names.en='exact_locdb_join';
  const rows=[item,extra];
  const bytes=new TextEncoder().encode(rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const hash=createHash('sha256').update(bytes).digest('hex');
  const manifest={schema:DB01_CANONICAL_SCHEMA,platform:'Steam',gameVersion:'1.26.2',
    publicationStatus:'private_not_approved_for_public_catalog',
    counts:{currentDefinitions:2,verifiedFourNativeItems:1,additionalDefinitionRecords:1},
    byNativeCategory:{ActivityItem:1,BoardGame:1},
    outputSha256:{'items.jsonl':hash},
    inputs:{nativeManifest:sha('d'),referenceIndex:sha('e')}};
  return {manifest,rows,bytes};
}

test('canonical private catalog distinguishes verified fields and historical reference', () => {
  const {manifest,rows}=data();
  const catalog=createPrivateItemCatalog(manifest,rows);
  assert.equal(catalog.source.privateOnly,true);
  assert.equal(catalog.source.dataSha256Verified,false);
  assert.equal(catalog.source.itemCount,1);
  assert.equal(catalog.source.unclassifiedDefinitions,1);
  assert.equal(catalog.getItem('30000031').itemId,30000031);
  assert.equal(catalog.getItem('030000031'),null);
  assert.equal(catalog.getDisplayItem('30000031','ja').displayName,'公式名称');
  assert.equal(catalog.getDisplayItem('30000031','en').displayName,null);
  assert.equal(catalog.getDisplayItem('30000031','en',{fallback:'ja'}).displayName,'公式名称');
  assert.equal(catalog.getDisplayItem('30000031','ja').hasVerifiedCurrentClassification,false);
  assert.equal(catalog.historicalReference(30000031).category,'Gems');
  assert.equal(catalog.search('Old unrelated name',{locale:'en'}).length,0);
  assert.equal(catalog.search('公式',{locale:'ja'}).length,1);
  assert.equal(catalog.search('Verified Board Game',{locale:'en'}).length,0);
  assert.equal(catalog.search('Verified Board Game',{locale:'en',includeUnclassified:true}).length,1);
  assert.equal(catalog.getDisplayItem(180000001,'en').iconGuid,null);
  assert.equal(catalog.currentNativeItems().length,1);
});

test('catalog clones and freezes every source row before making it queryable', () => {
  const {manifest,rows}=data();
  const catalog=createPrivateItemCatalog(manifest,rows);
  rows[0].names.ja='MUTATED';
  assert.equal(catalog.getDisplayItem(30000031,'ja').displayName,'公式名称');
  assert.equal(Object.isFrozen(catalog.getItem(30000031).names),true);
  assert.throws(()=>{catalog.getItem(30000031).names.ja='MUTATED'},TypeError);
});

test('verified raw JSONL hash gates the bridge to DB-00 and excludes ambiguous types', async () => {
  const {manifest,bytes}=data();
  const catalog=await openPrivateItemCatalog(manifest,bytes);
  assert.equal(catalog.source.dataSha256Verified,true);
  const target={platform:'Steam',gameVersion:'1.26.2',buildId:null,
    sourceSha256:manifest.inputs.nativeManifest};
  const result=createDb01Db00Patch(catalog,target);
  assert.equal(result.contract,DB01_DB00_JOIN_CONTRACT);
  assert.equal(result.patch.schema,'wand.game-db.patch@1');
  assert.equal(result.patch.items.length,1);
  assert.equal(result.excludedUnclassifiedDefinitions,1);
  assert.equal(result.patch.items[0].id,'30000031');
  assert.deepEqual(result.patch.items[0].names,{ja:'公式名称'});
  assert.equal(result.patch.items[0].category,null);
  assert.deepEqual(result.patch.items[0].worlds,[]);
  assert.equal(result.patch.items[0].nameStatus,'verified');
  assert.equal(result.patch.sources[0].visibility,'private');
  assert.equal(result.publishable,false);
  assert.equal(result.saveWritingAuthorized,false);
});

test('modified byte stream is rejected before records can be indexed',async () => {
  const {manifest,bytes}=data();
  const bad=new Uint8Array(bytes);bad[100]^=1;
  await assert.rejects(openPrivateItemCatalog(manifest,bad),/ITEMS_HASH_MISMATCH/);
});

test('unhashed parsed records cannot be promoted into DB-00', () => {
  const {manifest,rows}=data();
  const catalog=createPrivateItemCatalog(manifest,rows);
  assert.throws(()=>createDb01Db00Patch(catalog,{platform:'Steam',
    gameVersion:'1.26.2',buildId:null,sourceSha256:manifest.inputs.nativeManifest}),
    /DB01_PRIVATE_CATALOG_REQUIRED/);
});

test('source mismatches and non-null unverified build IDs block DB-00 import',async () => {
  const {manifest,bytes}=data();
  const c=await openPrivateItemCatalog(manifest,bytes);
  const target={platform:'Steam',gameVersion:'1.26.2',buildId:null,
    sourceSha256:manifest.inputs.nativeManifest};
  for(const bad of [{...target,sourceSha256:sha('f')},
    {...target,platform:'Nintendo Switch'}, {...target,gameVersion:'1.25.0'},
    {...target,buildId:'fake-build'}]) {
    assert.throws(()=>createDb01Db00Patch(c,bad),/EXACT_SOURCE_TARGET_REQUIRED/);
  }
});

test('sample-only and public manifests fail closed', () => {
  const {manifest,rows}=data();
  for(const bad of [{...manifest,schema:'wand.src01.prefix-evidence@1'},
    {...manifest,schema:'wand.src01.locale-prefix-evidence@1'},
    {...manifest,publicationStatus:'public'},
    {...manifest,counts:{...manifest.counts,currentDefinitions:1}},
    {...manifest,byNativeCategory:{ActivityItem:2,BoardGame:0}}]) {
    assert.throws(()=>createPrivateItemCatalog(bad,rows),/DB01_/);
  }
  assert.equal(validateDb01Manifest(manifest),manifest);
});

test('unverified source, icon, current taxonomy and locale strings are not accepted', () => {
  const {manifest,rows}=data();
  const checks=[
    r=>r[0].names.fr='Not backed by LocDB',
    r=>r[0].names.ja='{Placeholder}',
    r=>r[0].source.file='itemlist/Furniture.json',
    r=>r[0].category='Gems',
    r=>r[0].worlds=['Valley'],
    r=>r[0].verification.currentVersionObserved=false,
    r=>r[0].image.iconGuid=null,
    r=>r[1].image.iconGuid='guid:'+('c'.repeat(32)),
    r=>r[0].sampleOnlyLocalization=true,
    r=>r[0].historicalReference.source.platform='Steam',
  ];
  for(const mutate of checks){
    const changed=structuredClone(rows);mutate(changed);
    assert.throws(()=>createPrivateItemCatalog(manifest,changed),/DB01_|Missing current source evidence/);
  }
});

test('partial private manifest supports diagnostic browsing, never invents completeness',async () => {
  const {manifest,rows}=data();
  const partial={schema:DB01_PARTIAL_SCHEMA,platform:'Steam',gameVersion:'1.26.2',
    publicationStatus:'PRIVATE_ONLY_NO_PUBLIC_ITEMS',
    status:'partial_verified_native_plus_six_full_probe_classes',
    fullCorpusParsed:false,count:2,byNativeCategory:manifest.byNativeCategory,
    catalogDomains:{collectionItem:1,unclassifiedDefinition:1},
    outputSha256:manifest.outputSha256,
    sources:[{schema:'wand.src01.steam-native@1',manifestSha256:sha('d')}]};
  const catalog=await openPrivateItemCatalog(partial,new TextEncoder().encode(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'));
  assert.equal(catalog.source.manifestSchema,DB01_PARTIAL_SCHEMA);
  assert.equal(catalog.source.fullCorpusParsed,false);
  assert.equal(catalog.source.sourceManifestSha256,sha('d'));
  assert.equal(catalog.search('30000031').length,1);
});

test('unsupported locale/invalid search limits reject rather than silently fall back', () => {
  const {manifest,rows}=data(); const c=createPrivateItemCatalog(manifest,rows);
  assert.throws(()=>c.getDisplayItem(30000031,'ru'),/INVALID_LOCALE/);
  assert.throws(()=>c.search('test',{locale:'ru'}),/INVALID_LOCALE/);
  assert.throws(()=>c.search('test',{limit:1001}),/INVALID_SEARCH_LIMIT/);
  assert.deepEqual(c.search(''),[]);
});


test('DB-00 applies private same-source candidate patch without publishing', async () => {
  const {manifest,bytes}=data();
  const c=await openPrivateItemCatalog(manifest,bytes);
  const target={platform:'Steam',gameVersion:'1.26.2',buildId:null,
    sourceSha256:c.source.sourceManifestSha256};
  const join=createDb01Db00Patch(c,target);
  const snapshot={schema:SNAPSHOT_SCHEMA,id:'steam1262-private-candidates',target,
    coverage:{scope:'src01-four-native-categories',complete:false,
      categories:['ActivityItem','Furniture','Clothing','Trimming']},
    sources:[{id:'baseline-private',sha256:sha('f'),visibility:'private'}],
    releases:[],publishable:false,items:[]};
  const next=applyPatch(snapshot,join.patch);
  assert.equal(next.publishable,false);
  assert.equal(next.items.length,1);
  assert.deepEqual(next.items[0].names,{ja:'公式名称'});
  assert.equal(next.items[0].category,null);
});