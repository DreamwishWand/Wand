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
test('DB-00 original ItemType and verified subtype are separate from UI category',async()=>{
  const original={...record,itemId:30_200_001,nativeKey:'Original!Crop'};
  const fullCatalog={...client,source:{...source,sourceItemsSha256:sha},
    getCategory:async category=>category==='ActivityItem'?[original]:[]};
  const typeRow={
    itemId:30_200_001,nativeCategory:'ActivityItem',sourceSha256:sha,
    itemTypeCode:3,itemTypeName:'ActivityItem',subtypeCode:2,
    subtypeEnumName:'ActivityItemType',subtypeName:'Crop',
    subtypeNameVerified:true,
  };
  const typed={
    source:{gameVersion:'1.26.2',sourceItemsSha256:sha,definitionCount:3,
      sourceItemTypeVerified:3,sourceIl2cppDumpSha256:'b'.repeat(64)},
    getItems:async ids=>ids.map(()=>typeRow),
  };
  const result=await createDb01Db00Patch(fullCatalog,target,undefined,typed);
  assert.equal(result.patch.items.length,1);
  assert.equal(result.patch.items[0].category,null);
  assert.equal(result.patch.items[0].subcategory,null);
  assert.deepEqual(result.patch.items[0].attributes.sourceItemType,{
    code:3,name:'ActivityItem',evidence:'current_original_il2cpp_enum'});
  assert.deepEqual(result.patch.items[0].attributes.sourceSubtype,{
    code:2,name:'Crop',enum:'ActivityItemType',verified:true});
  assert.deepEqual(result.patch.items[0].worlds,[]);
  assert.deepEqual(result.patch.items[0].contentIds,[]);
  assert.equal(result.patch.sources[1].id,'db01-original-il2cpp-types');
  assert.equal(result.patch.sources[1].visibility,'private');
  assert.equal(result.sourceItemTypeMetadataAdded,1);
  assert.equal(result.publishable,false);
  await assert.rejects(createDb01Db00Patch(fullCatalog,target,undefined,
    {...typed,source:{...typed.source,sourceItemsSha256:'f'.repeat(64)}}),
    /IL2CPP_SOURCE_MISMATCH/);
  await assert.rejects(createDb01Db00Patch(fullCatalog,target,undefined,
    {...typed,getItems:async()=>[{...typeRow,itemTypeName:'Furniture'}]}),
    /IL2CPP_ITEM_MISMATCH/);
});
test('TypeScript DB00 bridge rejects misclassified records and wrong item counts',async()=>{
  await assert.rejects(createDb01Db00Patch({...client,getCategory:async cat=>cat==='ActivityItem'?[{...record,catalogDomain:'definition_unclassified'}]:[]},target),/UNCLASSIFIED_PATCH_BLOCKED/);
  await assert.rejects(createDb01Db00Patch({...client,source:{...source,currentNativeItemDefinitions:2}},target),/NATIVE_ITEM_COUNT_MISMATCH/);
});

test('DB-00 retains direct source CollectionSubMenu labels without asserting actual game UI visibility',async()=>{
  const original={...record,itemId:30_200_001,nativeKey:'Original!Crop'};
  const current={...client,source:{...source,sourceItemsSha256:sha},
    getCategory:async cat=>cat==='ActivityItem'?[original]:[]};
  const membership={
    setId:2120000015,setKey:'IngredientsSpice',submenuCode:8,submenu:'Foraging',
    collectionLabelKey:'CollectionSet.ForagingSpice_CollectionName',groupIndex:0,
    evidence:'current_original_collectionset_explicit_item_list',
    gameUiVisibilityVerified:false,worldAvailabilityVerified:false,
    dlcOwnershipVerified:false,
  };
  const menus={
    source:{gameVersion:'1.26.2',sourceItemsSha256:sha,catalogDefinitions:3,
      sourceCollectionSetSha256:'b'.repeat(64),
      sourceIl2cppDumpSha256:'d'.repeat(64)},
    getDirectListingsBatch:async ids=>ids.map(()=>[membership]),
  };
  const result=await createDb01Db00Patch(current,target,undefined,undefined,menus);
  const item=result.patch.items[0];
  assert.equal(item.category,null);
  assert.equal(item.subcategory,null);
  assert.deepEqual(item.worlds,[]);
  assert.deepEqual(item.contentIds,[]);
  assert.equal(item.attributes.gameOriginalCollectionDirectListings[0].submenu,'Foraging');
  assert.equal(item.attributes.gameOriginalCollectionDirectListings[0].setId,2120000015);
  assert.equal(item.attributes.gameOriginalCollectionDirectListings[0].gameUiVisibilityVerified,false);
  assert.equal(result.sourceCollectionDirectListingsAdded,1);
  assert.equal(result.patch.sources[1].id,'db01-original-collection-menus');
  assert.equal(result.patch.sources[2].id,'db01-original-collection-submenus');
  await assert.rejects(createDb01Db00Patch(current,target,undefined,undefined,
    {...menus,source:{...menus.source,gameVersion:'1.25.0'}}),
    /COLLECTION_SOURCE_MISMATCH/);
  await assert.rejects(createDb01Db00Patch(current,target,undefined,undefined,
    {...menus,getDirectListingsBatch:async()=>[]}),
    /COLLECTION_BATCH_MISMATCH/);
});
