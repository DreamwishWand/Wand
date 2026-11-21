import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DB02_NATIVE_TAG_EVIDENCE_CONTRACT,DB02_NATIVE_TAG_SOURCE_SHA256,DB02_NATIVE_TAG_PARENT_SHA256} from '../src/lib/acquisition/native-tag-evidence.mjs';
import {loadVerifiedNativeTagLocales,DB02_TAG_LOCALES,DB02_TAG_LOCALES_CONTRACT,
  DB02_TAG_LOCALE_ARCHIVE_SHA256,DB02_TAG_EVIDENCE_MANIFEST_SHA256} from '../src/lib/acquisition/native-tag-locales.mjs';

const sha = b=>createHash('sha256').update(b).digest('hex');
const enc=x=>new TextEncoder().encode(JSON.stringify(x)+'\n');
const fakeTags=[
 Object.freeze({tagId:2000700000,nativeName:'SyntheticZero',displayNameKey:'Tag.Zero_DisplayName',usedByRecipeSelector:true,usedByIngredientMembership:false}),
 Object.freeze({tagId:2000700001,nativeName:'SyntheticOne',displayNameKey:'Tag.One_DisplayName',usedByRecipeSelector:false,usedByIngredientMembership:true})
];
const parent=Object.freeze({
 contract:DB02_NATIVE_TAG_EVIDENCE_CONTRACT,verified:true,privateSource:true,publishable:false,
 manifestSha256:DB02_TAG_EVIDENCE_MANIFEST_SHA256,
 parentSrc02ManifestSha256:DB02_NATIVE_TAG_PARENT_SHA256,
 nativeTagSourceSha256:DB02_NATIVE_TAG_SOURCE_SHA256,
 allTags:Object.freeze(fakeTags)
});
const localize=(id,name)=>({tagId:id,localizedNames:Object.fromEntries(DB02_TAG_LOCALES.map(locale=>[locale,`${locale}-${name}`]))});
const rows=[localize(2000700000,'FakeZero'),localize(2000700001,'FakeOne')];
function fixture(data=rows,changes={}){
 const source=new TextEncoder().encode(data.map(x=>JSON.stringify(x)).join('\n')+'\n');
 const manifest={schema:DB02_TAG_LOCALES_CONTRACT,platform:'Steam',gameVersion:'1.26.2',
  privateOnly:true,publicationAuthorized:false,
  parentTagManifestSha256:DB02_TAG_EVIDENCE_MANIFEST_SHA256,
  parentSrc02R5ManifestSha256:DB02_NATIVE_TAG_PARENT_SHA256,
  nativeTagSha256:DB02_NATIVE_TAG_SOURCE_SHA256,
  localeArchiveSha256:{...DB02_TAG_LOCALE_ARCHIVE_SHA256},
  localizationCategory:'Tag.locbin',sourceKeyTransform:'Tag.<key> => <key> in Tag.locbin',
  counts:{nativeTagDefinitions:2,languages:8,translatedTagStrings:16},
  files:{'tag-locales.jsonl':sha(source),'report.json':'0'.repeat(64)},...changes};
 const raw=enc(manifest);
 return {source,raw,trusted:{expectedManifestSha256:sha(raw)}};
}

test('native tags and exact eight-locale names remain separate provenance with no availability inference',async()=>{
 const f=fixture();const db=await loadVerifiedNativeTagLocales(f.raw,f.source,parent,f.trusted);
 assert.equal(db.verified,true);assert.equal(db.privateSource,true);assert.equal(db.publishable,false);
 assert.equal(db.allTags.length,2);assert.equal(db.contract,DB02_TAG_LOCALES_CONTRACT);
 assert.equal(db.getTag(2000700000).displayNameKey,'Tag.Zero_DisplayName');
 assert.deepEqual(db.getDisplayName(2000700000,'ja'),{
  tagId:2000700000,locale:'ja',value:'ja-FakeZero',evidence:'steam1262_exact_tag_locbin',
  sourceGameVersion:'1.26.2',actualPlayerEligibilityVerified:false});
 assert.equal(db.getIngredientMembershipName(2000700000,'ja'),null);
 assert.equal(db.getRecipeSelectorName(2000700001,'ja'),null);
 assert.equal(db.getRecipeSelectorName(2000700000,'ja').value,'ja-FakeZero');
 assert.equal(db.getIngredientMembershipName(2000700001,'ja').value,'ja-FakeOne');
 assert.equal(db.completeGameLocalizationVerified,false);
 assert.equal(db.playerOwnershipVerified,false);
 assert.ok(Object.isFrozen(db.allTags[0].localizedNames));
 assert.throws(()=>{db.allTags[0].localizedNames.ja='TAMPER';},TypeError);
});

test('independent tag locale manifest SHA is required and tampering fails',async()=>{
 const f=fixture();
 await assert.rejects(loadVerifiedNativeTagLocales(f.raw,f.source,parent,{}),/TRUSTED_TAG_PARENT_REQUIRED/);
 await assert.rejects(loadVerifiedNativeTagLocales(f.raw,f.source,parent,{expectedManifestSha256:'0'.repeat(64)}),/MANIFEST_SHA256_MISMATCH/);
 const changed=Uint8Array.from(f.source);changed[45]^=1;
 await assert.rejects(loadVerifiedNativeTagLocales(f.raw,changed,parent,f.trusted),/ROWS_SHA256_MISMATCH/);
});

test('all eight independent current original ZIP SHA pins are required',async()=>{
 const f=fixture(rows,{localeArchiveSha256:{...DB02_TAG_LOCALE_ARCHIVE_SHA256,ja:'0'.repeat(64)}});
 await assert.rejects(loadVerifiedNativeTagLocales(f.raw,f.source,parent,f.trusted),/SOURCE_PROVENANCE_OR_ARCHIVE_MISMATCH/);
});

test('wrong parent v1.26.2 Tag source and historical source are rejected',async()=>{
 const f=fixture();
 for(const change of [
  {...parent,manifestSha256:'0'.repeat(64)},
  {...parent,nativeTagSourceSha256:'f'.repeat(64)},
  {...parent,privateSource:false}
 ]){
  await assert.rejects(loadVerifiedNativeTagLocales(f.raw,f.source,Object.freeze(change),f.trusted),/TRUSTED_TAG_PARENT_REQUIRED/);
 }
});

test('unmatched tag ids, missing translations, uncontrolled fields and invalid strings reject even if SHA is pinned',async()=>{
 const scenarios=[
  [localize(2000700001,'Wrong'),localize(2000700000,'Order')],
  [{...localize(2000700000,'X'),tagId:2000700030},localize(2000700001,'Y')],
  [{...localize(2000700000,'X'),localizedNames:{ja:'only'}},localize(2000700001,'Y')],
  [{...localize(2000700000,'X'),localizedNames:{...localize(2000700000,'X').localizedNames,ja:'\n'}},localize(2000700001,'Y')],
  [{...localize(2000700000,'X'),untrustedOwned:true},localize(2000700001,'Y')]
 ];
 for(const scenario of scenarios){const f=fixture(scenario);
  await assert.rejects(loadVerifiedNativeTagLocales(f.raw,f.source,parent,f.trusted),/INVALID_OR_UNMATCHED_TAG_LOCALIZATION/);
 }
});

test('invalid game version, publication authorization and wrong tag source are not accepted',async()=>{
 for(const change of [{gameVersion:'1.26.1'},{publicationAuthorized:true},{nativeTagSha256:'0'.repeat(64)}]){
  const f=fixture(rows,change);
  await assert.rejects(loadVerifiedNativeTagLocales(f.raw,f.source,parent,f.trusted),/SOURCE_PROVENANCE_OR_ARCHIVE_MISMATCH/);
 }
});