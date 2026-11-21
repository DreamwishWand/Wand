import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ITEM_LOCALES } from './records.mjs';
import { DB01_HISTORICAL_CANDIDATES_SCHEMA, validateHistoricalCandidatesManifest,
  openPrivateHistoricalCandidates } from './historical-candidates.mjs';

const sha = str => createHash('sha256').update(str).digest('hex');
const digest = char => char.repeat(64);
const categoryList = [ 'ActivityItem','Furniture','Clothing','Trimming','AvatarFeature','BoardGame',
  'Building','Character','Companion','Makeup','MountGear','PhotoMode','Skin','Tool','Upgrade' ];
const currentItem = {
  itemId:30000031,nativeCategory:'ActivityItem',nativeNameField:'Amethyst',
  names:Object.fromEntries(ITEM_LOCALES.map(loc => [loc,loc==='ja'?'アメジスト':null])),
  verification:{names:Object.fromEntries(ITEM_LOCALES.map(loc => [loc,loc==='ja'?'exact_locdb_join':'unresolved']))}
};
function fixture() {
  const row={itemId:30000031,nativeCategory:'ActivityItem',
    localizationKey:'Amethyst_DisplayName',baselineGameVersion:'1.26.1',targetGameVersion:'1.26.2',
    otherLocaleEvidence:'previous_version_full_source_correlated_with_current_size_crc32_prefix_only',
    mergeIntoCanonicalPermitted:false,
    namesHistorical:Object.fromEntries(ITEM_LOCALES.map(locale => [locale,locale==='ja'?'アメジスト':'Amethyst'])),
    currentExactSourceVerifiedLocales:['ja']};
  const bytes=new TextEncoder().encode(JSON.stringify(row)+'\n');
  const shaBytes=createHash('sha256').update(bytes).digest('hex');
  const member = {baselineFullMemberSha256:digest('a'),currentMemberPrefixSha256:digest('b'),
    currentMemberBytesFromProbe:20000,currentMemberPrefixBytes:8192,
    currentMemberCrc32FromProbe:'deadbeef',currentFullMemberSha256Verified:false};
  const manifest = {
    schema:DB01_HISTORICAL_CANDIDATES_SCHEMA,
    status:'PRIVATE_HISTORICAL_CANDIDATE_NOT_CURRENT_OFFICIAL',
    publicationStatus:'PRIVATE_ONLY',mergeIntoCanonicalPermitted:false,
    historicalGameVersion:'1.26.1',targetGameVersion:'1.26.2',
    historicalFullVersionSha256:digest('c'),targetProbeSha256:digest('d'),
    locales:[...ITEM_LOCALES],
    sourceCatalog:{schema:'wand.db01.partial-manifest@3',platform:'Steam',gameVersion:'1.26.2',
      items:33627,manifestSha256:digest('e'),itemsSha256:digest('f')},
    counts:{candidateDefinitions:1,allEightHistoricalNames:1,
      membersCorrelatedBySizeCrcAndPrefix:120,officialCurrentValueComparisons:1},
    memberComparisons:Object.fromEntries(ITEM_LOCALES.map(locale => [locale,{
      baselineZipSha256:digest('1'),targetZipSha256FromProbe:digest('2'),
      members:Object.fromEntries(categoryList.map(cat=>[cat,{...member}]))
    }])),
    outputSha256:{'historical-locale-candidates.jsonl':shaBytes,'report.json':digest('3')},
  };
  const catalog = {
    source:{privateOnly:true,dataSha256Verified:true,manifestSchema:'wand.db01.partial-manifest@3',
      gameVersion:'1.26.2',dataSha256:digest('f')},
    getItem(id) {return id===30000031?currentItem:null;}
  };
  return {manifest,row,bytes,catalog};
}

test('raw-data SHA and exact current catalog hash required',async()=>{
  const {manifest,bytes,catalog}=fixture();
  const patched=new Uint8Array(bytes);patched[25]^=1;
  await assert.rejects(openPrivateHistoricalCandidates(manifest,patched,catalog),/CANDIDATE_FILE_HASH_MISMATCH/);
  await assert.rejects(openPrivateHistoricalCandidates(manifest,bytes,{...catalog,
    source:{...catalog.source,dataSha256:digest('0')}}),/CURRENT_CATALOG_NOT_HASH_MATCHED/);
  await assert.rejects(openPrivateHistoricalCandidates(manifest,bytes,{...catalog,
    source:{...catalog.source,dataSha256Verified:false}}),/CURRENT_CATALOG_NOT_HASH_MATCHED/);
});

test('official current names are authoritative, historical candidates explicit opt-in',async()=>{
  const {manifest,bytes,catalog}=fixture();
  const overlay=await openPrivateHistoricalCandidates(manifest,bytes,catalog);
  assert.equal(overlay.count,1);
  assert.equal(overlay.privateOnly,true);
  assert.equal(overlay.publishable,false);
  assert.equal(overlay.getName(30000031,'ja').value,'アメジスト');
  assert.equal(overlay.getName(30000031,'ja').status,'verified_current_locdb');
  assert.equal(overlay.getName(30000031,'en'),null);
  const english=overlay.getName(30000031,'en',{allowHistorical:true});
  assert.equal(english.value,'Amethyst');
  assert.equal(english.status,'historical_prefix_crc_correlated_unverified_current');
  assert.equal(english.currentVerified,false);
  assert.equal(english.gameVersion,'1.26.1');
  assert.equal(overlay.getName(3,'en',{allowHistorical:true}),null);
  assert.throws(()=>overlay.getName(30000031,'xx'),/UNKNOWN_LOCALE/);
  assert.ok(Object.isFrozen(overlay.getHistoricalRecord(30000031).namesHistorical));
});

test('manifest refuses public use and fake current full-SHA claims',()=>{
  const {manifest}=fixture();
  assert.equal(validateHistoricalCandidatesManifest(manifest),manifest);
  assert.throws(()=>validateHistoricalCandidatesManifest({...manifest,publicationStatus:'PUBLIC'}),
    /PUBLICATION_OR_PROMOTION_FORBIDDEN/);
  assert.throws(()=>validateHistoricalCandidatesManifest({...manifest,targetGameVersion:'1.26.3'}),
    /INVALID_VERSION_EVIDENCE/);
  const tampered=structuredClone(manifest);
  tampered.memberComparisons.en.members.ActivityItem.currentFullMemberSha256Verified=true;
  assert.throws(()=>validateHistoricalCandidatesManifest(tampered),/INVALID_MEMBER_PROOF/);
});

test('mismatched verified current labels, duplicate IDs and markers reject',async()=>{
  const {manifest,row,catalog}=fixture();
  for (const bad of [
    {...row,namesHistorical:{...row.namesHistorical,ja:'間違い'}},
    {...row,namesHistorical:{...row.namesHistorical,en:'{DoNotTranslate}'}},
    {...row,currentExactSourceVerifiedLocales:[]},
    {...row,localizationKey:'Bad_DisplayName'},
  ]) {
    const bytes=new TextEncoder().encode(JSON.stringify(bad)+'\n');
    const metadata={...manifest,outputSha256:{...manifest.outputSha256,
      'historical-locale-candidates.jsonl':createHash('sha256').update(bytes).digest('hex')}};
    await assert.rejects(openPrivateHistoricalCandidates(metadata,bytes,catalog),/DB01_HISTORICAL_/);
  }
  const data=JSON.stringify(row)+'\n'+JSON.stringify(row)+'\n';
  const bytes=new TextEncoder().encode(data);
  const metadata={...manifest,counts:{...manifest.counts,candidateDefinitions:2,allEightHistoricalNames:2,
    officialCurrentValueComparisons:2},
    outputSha256:{...manifest.outputSha256,'historical-locale-candidates.jsonl':sha(data)}};
  await assert.rejects(openPrivateHistoricalCandidates(metadata,bytes,catalog),/CANDIDATE_SOURCE_MISMATCH/);
});