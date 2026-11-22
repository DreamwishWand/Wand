import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb04NativeTagTaxonomyClient,DB04_NATIVE_TAG_TAXONOMY}
  from '../src/lib/world/native-tag-taxonomy.ts';
import {DB04_WORLD_TAGS,DB04_NATIVE_SCOPE_CLIENT}
  from '../src/lib/world/native-item-scope.ts';
import {DB01_LOCALES} from '../src/lib/items/index.ts';

const SHA='a'.repeat(64);
const worldTagKeys=[...DB04_WORLD_TAGS];
const names=(name)=>Object.fromEntries(DB01_LOCALES.map(locale=>
  [locale,locale==='ja'?('JP '+name):('EN '+name)]));
const row=(id,key)=>({
  itemId:id,nativeKey:key,nativeCategory:'Tag',
  catalogDomain:'definition_unclassified',
  sourceSha256:SHA,
  names:names(key),
  localizationKey:'Tag.'+key+'_DisplayName',
  verifiedIconGuid:null
});
function originalTags(){
  return [
    ...worldTagKeys.map((key,i)=>row(2001200028+i,key)),
    ...Array.from({length:67},(_,i)=>row(2000500001+i,'Universe'+(i+1))),
    ...Array.from({length:409-73},(_,i)=>row(2000001000+i,'Style'+i))
  ];
}
function catalog(records=originalTags()){
  let reads=0;
  return {
    source:{
      platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
      fullCorpusParsed:true,definitions:39067,
      nativeSourceManifestSha256:'b'.repeat(64),
      sourceItemsSha256:'c'.repeat(64)
    },
    async getCategory(name){
      assert.equal(name,'Tag');
      reads++;
      return records;
    },
    get reads(){return reads;}
  };
}
function originalScope(sourceHash=SHA){
  return {
    contract:DB04_NATIVE_SCOPE_CLIENT,
    source:{
      platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
      publicationAuthorized:false,originalTagSha256:sourceHash,
      auditSha256:'d'.repeat(64)
    }
  };
}
test('source exact 8-language World and Universe Tag labels reuse DB-01 once',async()=>{
  const db=catalog(),client=createDb04NativeTagTaxonomyClient(db,originalScope());
  assert.equal(client.contract,DB04_NATIVE_TAG_TAXONOMY);
  assert.equal(client.source.gameVersion,'1.26.2');
  assert.equal(client.source.nativeScopeCrosschecked,true);
  assert.equal(client.source.originalTagSha256,SHA);
  const worlds=await client.listWorldTags('ja');
  assert.equal(worlds.length,6);
  assert.deepEqual(worlds.map(x=>x.nativeKey),worldTagKeys);
  assert.equal(worlds[0].displayName,'JP IsDreamlightValley');
  assert.equal(worlds[0].sourceExactCurrentLocDbName,true);
  assert.equal(worlds[0].gameUiCollectionMembershipVerified,false);
  assert.equal(worlds[0].itemOriginWorldVerified,false);
  assert.equal(worlds[0].contentPackRelationVerified,false);
  assert.equal(worlds[0].dlcEntitlementVerified,false);
  const oneWorld=await client.getWorldTag('isHoneywood','en');
  assert.equal(oneWorld.displayName,'EN isHoneywood');
  assert.equal(oneWorld.kind,'world_context_tag');
  const universes=await client.listUniverseTags('ja');
  assert.equal(universes.length,67);
  assert.equal(universes[0].displayName,'JP Universe1');
  assert.equal(universes[0].kind,'disney_universe_tag');
  assert.equal(universes.at(-1).tagItemId,2000500067);
  const byId=await client.getUniverseTag(2000500001,'ja');
  assert.equal(byId?.nativeKey,'Universe1');
  const byKey=await client.getUniverseTagByKey('Universe67','fr');
  assert.equal(byKey?.tagItemId,2000500067);
  assert.equal(await client.getUniverseTag(2000500999,'ja'),null);
  assert.equal(await client.getUniverseTagByKey('Unknown','ja'),null);
  assert.equal(db.reads,1,'DB-01 original Tag category must be lazy and cached');
  assert.throws(()=>worlds.push({}),TypeError);
  assert.throws(()=>{worlds[0].displayName='Forged';},TypeError);
  assert.throws(()=>universes.push({}),TypeError);
});
test('independent owner-private original Tag sha contradictions fail closed',async()=>{
  const broken=createDb04NativeTagTaxonomyClient(catalog(),originalScope('0'.repeat(64)));
  await assert.rejects(()=>broken.listWorldTags('ja'),
    /INDEPENDENT_ORIGINAL_TAG_SHA_MISMATCH/);
  const wrongGame=catalog();wrongGame.source.gameVersion='1.26.1';
  assert.throws(()=>createDb04NativeTagTaxonomyClient(wrongGame),
    /DB01_PRIVATE_COMPLETE_SOURCE_REQUIRED/);
  const publicGame=catalog();publicGame.source.privateOnly=false;
  assert.throws(()=>createDb04NativeTagTaxonomyClient(publicGame),
    /DB01_PRIVATE_COMPLETE_SOURCE_REQUIRED/);
  const forgedScope=originalScope();forgedScope.source.publicationAuthorized=true;
  assert.throws(()=>createDb04NativeTagTaxonomyClient(catalog(),forgedScope),
    /SCOPE_ORIGINAL_SOURCE_REQUIRED/);
  const withoutScope=createDb04NativeTagTaxonomyClient(catalog());
  assert.equal(withoutScope.source.originalTagSha256,null);
  assert.equal(withoutScope.source.nativeScopeCrosschecked,false);
  assert.equal((await withoutScope.listWorldTags('ja')).length,6);
});
test('missing world definitions, duplicate identities and altered original categories fail closed',async()=>{
  const withoutWorld=originalTags().filter(x=>x.nativeKey!=='isSeaOfSecrets');
  const client=createDb04NativeTagTaxonomyClient(catalog([
    ...withoutWorld,row(2000009999,'UnknownWorldLikeTag')
  ]));
  await assert.rejects(()=>client.listWorldTags('ja'),
    /MISSING_NATIVE_WORLD_TAG/);
  const duplicate=originalTags();duplicate[407]={...duplicate[407],itemId:duplicate[1].itemId};
  await assert.rejects(()=>createDb04NativeTagTaxonomyClient(
    catalog(duplicate)).listWorldTags('ja'),/ORIGINAL_TAG_IDENTITY/);
  const wrongKind=originalTags();wrongKind[0]={...wrongKind[0],nativeCategory:'Furniture'};
  await assert.rejects(()=>createDb04NativeTagTaxonomyClient(
    catalog(wrongKind)).listWorldTags('ja'),/ORIGINAL_TAG_IDENTITY/);
  const wrongSha=originalTags();wrongSha[0]={...wrongSha[0],sourceSha256:'e'.repeat(64)};
  await assert.rejects(()=>createDb04NativeTagTaxonomyClient(
    catalog(wrongSha)).listWorldTags('ja'),/MIXED_ORIGINAL_TAG_SHA/);
  const absent=originalTags();absent[6].names.ja=null;
  await assert.rejects(()=>createDb04NativeTagTaxonomyClient(
    catalog(absent)).listUniverseTags('ja'),
    /CURRENT_EXACT_LOCDB_NAME_REQUIRED/);
});
test('unverified World ID or unsupported languages do not silently use fallback names',async()=>{
  const client=createDb04NativeTagTaxonomyClient(catalog());
  await assert.rejects(()=>client.listWorldTags('ru'),/INVALID_LOCALE/);
  await assert.rejects(()=>client.getWorldTag('not-a-world','ja'),/UNKNOWN_WORLD_TAG/);
  await assert.rejects(()=>client.getUniverseTag(-1,'ja'),/INVALID_UNIVERSE_TAG_ID/);
  await assert.rejects(()=>client.getUniverseTagByKey('has spaces','ja'),
    /INVALID_UNIVERSE_TAG_KEY/);
});
