import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  loadVerifiedNativeTagEvidence,
  DB02_NATIVE_TAG_EVIDENCE_CONTRACT,
  DB02_NATIVE_TAG_SOURCE_SHA256,
  DB02_NATIVE_TAG_PARENT_SHA256
} from '../src/lib/acquisition/native-tag-evidence.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
const encode = o => new TextEncoder().encode(JSON.stringify(o)+'\n');
const row=(id,name,recipe=false,member=false)=>({
  tagId:id,frameKey:id-2_000_000_000,nativeName:name,
  displayNameKey:'Tag.'+name+'_DisplayName',
  usedByRecipeSelector:recipe,usedByIngredientMembership:member
});
const goodRows=[row(2000700000,'SyntheticBlue',true),row(2000700001,'SyntheticGreen',true,true),row(2000700002,'SyntheticYellow',false,true)];
function fixture(rows=goodRows, overrides={}){
  const rawRows=new TextEncoder().encode(rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const counts={nativeTagDefinitions:rows.length,
    recipeSelectorTagIds:rows.filter(x=>x.usedByRecipeSelector).length,
    ingredientMembershipTagIds:rows.filter(x=>x.usedByIngredientMembership).length,
    uniqueReferencedTagIds:rows.filter(x=>x.usedByRecipeSelector||x.usedByIngredientMembership).length};
  const manifest={schema:DB02_NATIVE_TAG_EVIDENCE_CONTRACT,
    platform:'Steam',gameVersion:'1.26.2',privateOnly:true,publicationAuthorized:false,
    parentSrc02ManifestSha256:DB02_NATIVE_TAG_PARENT_SHA256,
    nativeTagSourceSha256:DB02_NATIVE_TAG_SOURCE_SHA256,
    conditionSourceSha256:'9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c',
    nativeNameField:2,displayNameKeyField:3,counts,
    files:{'tags.jsonl':sha(rawRows),'report.json':'a'.repeat(64)},
    ...overrides};
  const rawManifest=encode(manifest);
  return {rawRows,rawManifest,trusted:{expectedManifestSha256:sha(rawManifest)}};
}

test('source-tag identities resolve separate recipe and membership references without localization',async()=>{
  const {rawRows,rawManifest,trusted}=fixture();
  const db=await loadVerifiedNativeTagEvidence(rawManifest,rawRows,trusted);
  assert.equal(db.contract,DB02_NATIVE_TAG_EVIDENCE_CONTRACT);
  assert.equal(db.allTags.length,3);
  assert.equal(db.getTag(2000700000).nativeName,'SyntheticBlue');
  assert.equal(db.getTag(2000700000).displayNameKey,'Tag.SyntheticBlue_DisplayName');
  assert.equal(db.getRecipeSelectorTag(2000700000).usedByRecipeSelector,true);
  assert.equal(db.getIngredientMembershipTag(2000700000),null);
  assert.equal(db.getRecipeSelectorTag(2000700002),null);
  assert.deepEqual(db.recipeSelectorTagIds,[2000700000,2000700001]);
  assert.deepEqual(db.ingredientMembershipTagIds,[2000700001,2000700002]);
  assert.equal(db.namesLocalizedVerified,false);
  assert.equal(db.liveEligibilityVerified,false);
  assert.equal(db.playerOwnershipVerified,false);
  assert.equal(db.saveWritingAuthorized,false);
  assert.equal(db.publishable,false);
  assert.ok(Object.isFrozen(db.allTags));
  assert.ok(Object.isFrozen(db.getTag(2000700001)));
  assert.throws(()=>{db.getTag(2000700001).nativeName='WRONG';},TypeError);
});

test('refuses manifests without independent pin, and wrong independently pinned release',async()=>{
  const f=fixture();
  await assert.rejects(loadVerifiedNativeTagEvidence(f.rawManifest,f.rawRows,{}),/INDEPENDENT_SOURCE_PINS_REQUIRED/);
  await assert.rejects(loadVerifiedNativeTagEvidence(f.rawManifest,f.rawRows,{expectedManifestSha256:'0'.repeat(64)}),/MANIFEST_SHA256_MISMATCH/);
  await assert.rejects(loadVerifiedNativeTagEvidence(f.rawManifest,f.rawRows,{...f.trusted,expectedParentSrc02ManifestSha256:'a'.repeat(64)}),/INDEPENDENT_SOURCE_PINS_REQUIRED/);
});

test('refuses stale Tag original, wrong 1.26.1 Condition and unauthorized publication',async()=>{
  for(const overrides of [
    {nativeTagSourceSha256:'f'.repeat(64)},
    {conditionSourceSha256:'f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150'},
    {publicationAuthorized:true},
    {parentSrc02ManifestSha256:'0'.repeat(64)}
  ]){
    const f=fixture(goodRows,overrides);
    await assert.rejects(loadVerifiedNativeTagEvidence(f.rawManifest,f.rawRows,f.trusted),/SOURCE_VERSION_OR_PROVENANCE_MISMATCH/);
  }
});

test('refuses tampered row file even when manifest remains independently pinned',async()=>{
  const f=fixture();const changed=Uint8Array.from(f.rawRows);changed[15]^=1;
  await assert.rejects(loadVerifiedNativeTagEvidence(f.rawManifest,changed,f.trusted),/ROW_SHA256_MISMATCH/);
});

test('rejects malformed and duplicated Tag frames with internally consistent hashes',async()=>{
  const cases=[
    [goodRows[0],{...goodRows[0]}],
    [row(2000700001,'A'),row(2000700000,'B')],
    [{...goodRows[0],frameKey:42}],
    [{...goodRows[0],nativeName:'A\nB'}],
    [{...goodRows[0],usedByRecipeSelector:'yes'}],
    [{...goodRows[0],extraPrivateData:'leak'}],
  ];
  for(const rows of cases){
    const f=fixture(rows);
    await assert.rejects(loadVerifiedNativeTagEvidence(f.rawManifest,f.rawRows,f.trusted),/INVALID_NATIVE_TAG_ROW/);
  }
});

test('rejects inconsistent recipe selector/member tag counts',async()=>{
  const f=fixture(goodRows,{counts:{nativeTagDefinitions:3,recipeSelectorTagIds:1,
    ingredientMembershipTagIds:2,uniqueReferencedTagIds:3}});
  await assert.rejects(loadVerifiedNativeTagEvidence(f.rawManifest,f.rawRows,f.trusted),/REFERENCED_TAG_COUNT_MISMATCH/);
});

test('invalid query IDs cannot be interpreted as source Tag IDs',async()=>{
  const f=fixture();const db=await loadVerifiedNativeTagEvidence(f.rawManifest,f.rawRows,f.trusted);
  for(const id of [0,1,-1,2e9,2.5e9,NaN]){
    assert.throws(()=>db.getTag(id),/INVALID_QUERY_ID/);
  }
  assert.equal(db.getTag(2000709999),null);
});