import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb01Db00Patch } from './db00-join.ts';
import { DB01_LOCALES } from './index.ts';
const sha='c'.repeat(64);
const names=Object.fromEntries(DB01_LOCALES.map(l=>[l,l==='en'?'Synthetic Item':null]));
const record={itemId:5,nativeCategory:'ActivityItem',catalogDomain:'item',names,sourceSha256:sha};
const source={privateOnly:true,platform:'Steam',gameVersion:'1.26.2',nativeSourceManifestSha256:sha,
  currentNativeItemDefinitions:1,definitions:3};
const client={source,getCategory:async category=>category==='ActivityItem'?[record]:[]};
const target={platform:'Steam',gameVersion:'1.26.2',sourceSha256:sha,buildId:null};
test('TypeScript DB00 bridge preserves source exactness, private status and only item domain', async()=>{
  const result=await createDb01Db00Patch(client,target);
  assert.equal(result.patch.items.length,1);
  assert.equal(result.patch.items[0].names.en,'Synthetic Item');
  assert.equal(result.excludedUnclassifiedDefinitions,2);
  assert.equal(result.publishable,false);
  assert.equal(result.patch.sources[0].visibility,'private');
  assert.equal(result.saveWritingAuthorized,false);
});
test('TypeScript DB00 bridge forbids incorrect source or a build guess',async()=>{
  await assert.rejects(createDb01Db00Patch(client,{...target,sourceSha256:'a'.repeat(64)}),/EXACT_SOURCE_TARGET_REQUIRED/);
  await assert.rejects(createDb01Db00Patch(client,{...target,buildId:'0'}),/EXACT_SOURCE_TARGET_REQUIRED/);
  await assert.rejects(createDb01Db00Patch({...client,source:{...source,privateOnly:false}},target),/PRIVATE_CATALOG_REQUIRED/);
});
test('DB00 keeps verified original Tag facets and multiple universes without inferring DLC or world availability',async()=>{
  const original={...record,nativeKey:'Synthetic!Item'};
  const tagged={
    itemId:5,nativeCategory:'ActivityItem',nativeKey:'Synthetic!Item',sourceSha256:sha,
    tagReferences:[
      {tagId:2000500001,tagKey:'Mickey',wireField:30,facet:'disneyUniverse'},
      {tagId:2000500002,tagKey:'BeautyBeast',wireField:30,facet:'disneyUniverse'},
      {tagId:2001200029,tagKey:'IsEternityIsle',wireField:30,facet:'worldContextTag'},
    ],
    facets:{disneyUniverse:['Mickey','BeautyBeast'],worldContextTag:['IsEternityIsle']},
    wireSubtypeCode:3,wireSubtypeMeaningVerified:false,gameUiCategoryVerified:false,
    dlcOwnershipVerified:false,worldAvailabilityVerified:false,
  };
  const fullCatalog={...client,source:{...source,sourceItemsSha256:sha},
    getCategory:async category=>category==='ActivityItem'?[original]:[]};
  const metadata={source:{privateOnly:true,gameVersion:'1.26.2',
    sourceItemsSha256:sha,definitionCount:3,tagOriginalSha256:'a'.repeat(64)},
    getItems:async ids=>ids.map(()=>tagged)};
  const r=await createDb01Db00Patch(fullCatalog,target,metadata);
  assert.deepEqual(r.patch.items[0].universes,['Mickey','BeautyBeast']);
  assert.deepEqual(r.patch.items[0].worlds,[]);
  assert.deepEqual(r.patch.items[0].contentIds,[]);
  assert.equal(r.patch.items[0].category,null);
  assert.deepEqual(r.patch.items[0].attributes.gameOriginalTagFacets.worldContextTag,
    ['IsEternityIsle']);
  assert.equal(r.patch.items[0].attributes.gameUiCategoryVerified,false);
  assert.equal(r.patch.items[0].attributes.uninterpretedSubtypeCode,3);
  assert.equal(r.patch.sources[1].visibility,'private');
  assert.equal(r.sourceTagMetadataAdded,1);
  assert.equal(r.dlcOwnershipDerivedFromTags,false);
  await assert.rejects(createDb01Db00Patch(fullCatalog,target,
    {...metadata,source:{...metadata.source,gameVersion:'1.25.0'}}),/TAG_SOURCE_MISMATCH/);
  await assert.rejects(createDb01Db00Patch(fullCatalog,target,
    {...metadata,getItems:async()=>[{...tagged,nativeKey:'wrong'}]}),
    /TAG_NATIVE_IDENTITY_MISMATCH/);
});
test('TypeScript DB00 bridge rejects misclassified records and wrong item counts',async()=>{
  await assert.rejects(createDb01Db00Patch({...client,getCategory:async cat=>cat==='ActivityItem'?[{...record,catalogDomain:'definition_unclassified'}]:[]},target),/UNCLASSIFIED_PATCH_BLOCKED/);
  await assert.rejects(createDb01Db00Patch({...client,source:{...source,currentNativeItemDefinitions:2}},target),/NATIVE_ITEM_COUNT_MISMATCH/);
});