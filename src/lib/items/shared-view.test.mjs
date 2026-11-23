import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb01SharedItemClient} from './shared-view.ts';

const sha='a'.repeat(64), sqlite='b'.repeat(64), dump='c'.repeat(64);
const fSource='d'.repeat(64), cSource='e'.repeat(64);
const locales=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
const furniture={
  itemId:40000047,nativeCategory:'Furniture',nativeKey:'Furniture!Synthetic',
  sourceSha256:fSource,catalogDomain:'item',
  localizationKey:'Furn.Test',verifiedIconGuid:'guid:'+'1'.repeat(32),
  names:Object.fromEntries(locales.map(l=>[l,l==='ja'?'合成家具':l==='en'?'Synthetic Furniture':null])),
};
const pet={
  itemId:120000001,nativeCategory:'Companion',nativeKey:'Companion!Synthetic',
  sourceSha256:cSource,catalogDomain:'definition_unclassified',
  localizationKey:null,verifiedIconGuid:null,
  names:Object.fromEntries(locales.map(l=>[l,l==='ja'?'合成ペット':null])),
};
const initial=[furniture,pet];
const sharedSource={
  platform:'Steam',gameVersion:'1.26.2',definitions:2,
  sourceItemsSha256:sha,privateOnly:true,fullCorpusParsed:true,
  nativeSourceManifestSha256:sha,currentNativeItemDefinitions:1,
};
const originalType=id=>id===furniture.itemId?{
  itemId:furniture.itemId,nativeCategory:'Furniture',sourceSha256:fSource,
  itemTypeCode:4,itemTypeName:'Furniture',subtypeCode:0,subtypeName:'Landscaping',
  subtypeEnumName:'FurnitureItemType',subtypeNameVerified:true,
}:{
  itemId:pet.itemId,nativeCategory:'Companion',sourceSha256:cSource,
  itemTypeCode:12,itemTypeName:'Companion',subtypeCode:0,subtypeName:null,
  subtypeEnumName:'CompanionItemType',subtypeNameVerified:false,
};
const tagInfo=id=>{
  const v=id===furniture.itemId?furniture:pet;
  return {itemId:id,nativeCategory:v.nativeCategory,nativeKey:v.nativeKey,
    sourceSha256:v.sourceSha256,tagReferences:[],
    facets:{disneyUniverse:id===furniture.itemId?['Mickey']:[]},
    wireSubtypeCode:null,wireSubtypeMeaningVerified:false,
    gameUiCategoryVerified:false,dlcOwnershipVerified:false,
    worldAvailabilityVerified:false};
};
const direct={setId:2120000024,setKey:'CollectionSet!Synthetic',submenu:'FurnitureSets',
  submenuCode:3,groupIndex:0,collectionLabelKey:'CollectionSet.FurnitureTest',
  evidence:'current_original_collectionset_explicit_item_list',
  gameUiVisibilityVerified:false,worldAvailabilityVerified:false,
  dlcOwnershipVerified:false,
};
const universeCandidate=(setId,groupIndex)=>({
  setId,groupIndex,nativeCategory:'Furniture',
  sourceSetItemId:2040000009,universeTagId:2000500001,universeTagKey:'Mickey',
  selectorField:3,rule:'source_item_set_disney_universe_tag_equals_collection_filter',
  sourcePredicateMatched:true,gameUiMembershipVerified:false,
  gameUiVisibilityVerified:false,worldAvailabilityVerified:false,
  dlcOwnershipVerified:false,
});
const specialMatch={
  setId:2120000024,submenuCode:17,groupIndex:2,selectorIndex:0,
  selectorKind:10,family:'Pet',nativeCategory:'Companion',
  originalField:'PetIsNotable',criterion:0,tagKey:null,
  evidence:'current_original_collection_static_predicate',
  sourcePredicateMatched:true,gameUiMembershipVerified:false,
  gameUiVisibilityVerified:false,worldAvailabilityVerified:false,
  dlcOwnershipVerified:false,
};
const negative={
  collectionSetId:2120000024,groupIndex:0,selectorIndex:3,
  criterion:2001100008,criterionName:'TimeBendingShardFurniture',
  sourceRecipeItemId:2050300548,
  sourceRule:'source_crafting_recipe_type_and_result_item_id',
  negative:true,gameUiMembershipVerified:false,
  evidence:'current_original_activity_or_crafting_predicate',
};
const positive={
  collectionSetId:2120000040,groupIndex:1,selectorIndex:1,
  activityCase:null,sourceField:'CraftingRecipeItemData.RecipeType',
  criterion:2001100001,criterionName:'RefinedMaterial',
  sourceRecipeItemId:2050300548,
  sourceRule:'source_crafting_recipe_type_and_result_item_id',
  evidence:'current_original_activity_or_crafting_predicate',
  sourcePredicateMatched:true,gameUiMembershipVerified:false,
  worldAvailabilityVerified:false,dlcOwnershipVerified:false,
};
function fixture(){
  const io={base:0,type:0,tags:0,direct:0,universe:0,special:0,crafting:0};
  const base={source:{...sharedSource},
    getItem:async id=>(initial.find(v=>v.itemId===id)??null),
    getItems:async ids=>{io.base++;return ids.map(id=>
      initial.find(v=>v.itemId===id)??null);}};
  return {
    io,
    catalog:base,
    itemTypes:{
      source:{gameVersion:'1.26.2',sourceItemsSha256:sha,
        sourceSqliteSha256:sqlite,sourceIl2cppDumpSha256:dump,
        definitionCount:2,sourceItemTypeVerified:2,sourceSubtypeNameVerified:1},
      getItems:async ids=>{io.type++;return ids.map(id=>
        initial.some(item=>item.itemId===id)?originalType(id):null);},
    },
    tags:{
      source:{gameVersion:'1.26.2',sourceItemsSha256:sha,
        sourceSqliteSha256:sqlite,definitionCount:2,taggedDefinitions:1,
        facetCoverage:{disneyUniverse:1},privateOnly:true},
      getItems:async ids=>{io.tags++;return ids.map(id=>
        initial.some(item=>item.itemId===id)?tagInfo(id):null);},
    },
    directMenus:{
      source:{gameVersion:'1.26.2',sourceItemsSha256:sha,
        sourceCollectionSetSha256:'f'.repeat(64),
        sourceIl2cppDumpSha256:dump,catalogDefinitions:2,
        collectionSetDefinitions:2,directListedItemIds:1,
        directListedAssociations:1,dynamicSelectorsUnresolved:1},
      getDirectListingsBatch:async ids=>{io.direct++;
        return ids.map(id=>id===furniture.itemId?[direct]:[]);},
      getMenus:async()=>[
        {setId:2120000024,setKey:'CollectionSet!Synthetic',
          submenuCode:3,submenu:'FurnitureSets',
          collectionLabelKey:'CollectionSet.FurnitureTest',
          sortPriority:1,groupCount:3,directListedItemCount:1,
          dynamicSelectorsUnresolved:2,gameUiVisibilityVerified:false},
        {setId:2120000040,setKey:'CollectionSet!Crafting',
          submenuCode:10,submenu:'Crafting',
          collectionLabelKey:'CollectionSet.Crafting',
          sortPriority:2,groupCount:2,directListedItemCount:0,
          dynamicSelectorsUnresolved:1,gameUiVisibilityVerified:false},
      ],
    },
    universePredicates:{
      source:{gameVersion:'1.26.2',sourceItemsSha256:sha,sourceSqliteSha256:sqlite,
        sourceIl2cppDumpSha256:dump,sourceDefinitionCount:2,
        collectionSetCount:1,dynamicSelectorCount:262,
        resolvedSourcePredicateSelectors:124,unresolvedDynamicSelectors:138,
        candidateItemIds:1,candidateMemberships:2},
      getItems:async ids=>{io.universe++;return ids.map(id=>
        id===furniture.itemId?[
          universeCandidate(2120000024,0),
          universeCandidate(2120000040,1),
        ]:[]);},
    },
    specialPredicates:{
      source:{gameVersion:'1.26.2',sourceItemsSha256:sha,sourceSqliteSha256:sqlite,
        sourceIl2cppDumpSha256:dump,definitionCount:2,
        collectionSetCount:1,totalDynamicSelectors:262,
        handledSourceSelectors:98,unresolvedDynamicSelectors:164,
        candidateItemIds:1,candidateMemberships:1},
      getItems:async ids=>{io.special++;return ids.map(id=>
        id===pet.itemId?[specialMatch]:[]);},
    },
    activityCrafting:{
      source:{gameVersion:'1.26.2',sourceItemsSha256:sha,sourceSqliteSha256:sqlite,
        sourceIl2cppDumpSha256:dump,definitionCount:2,sourceSelectorCount:40,
        resolvedActivitySelectors:12,resolvedCraftingSelectors:28,
        sourceMatchedPositiveItemIds:1,sourceMatchedNegativeItemIds:1},
      getItems:async ids=>{io.crafting++;return ids.map(id=>
        id===furniture.itemId?{itemId:id,nativeCategory:'Furniture',
          sourceSha256:fSource,positive:[positive],negative:[negative]}:null);},
    },
  };
}
test('one Item ID gives exact current names/icons/native type and independent display status',async()=>{
  const f=fixture(),client=createDb01SharedItemClient(f);
  const record=await client.getItem(furniture.itemId);
  assert.equal(record.itemId,furniture.itemId);
  assert.equal(record.nativeCategory,'Furniture');
  assert.equal(record.item.names.ja,'合成家具');
  assert.equal(record.item.verifiedIconGuid,furniture.verifiedIconGuid);
  assert.equal(record.originalItemType.subtypeName,'Landscaping');
  assert.deepEqual(record.originalTags.facets.disneyUniverse,['Mickey']);
  assert.equal(record.screenCategory,null);
  assert.equal(record.screenSubcategory,null);
  assert.equal(record.availableWorlds,null);
  assert.equal(record.dlcEntitlements,null);
  assert.equal(record.runtimeCollectionState,null);
  assert.equal(record.publicationAuthorized,false);
});
test('multiple same-item relations remain; only same-set/group negative predicate suppresses dynamic matches',async()=>{
  const f=fixture(),client=createDb01SharedItemClient(f);
  const row=await client.getItem(furniture.itemId);
  assert.equal(row.collection.direct.length,1);
  assert.equal(row.collection.setUniverse.length,2);
  assert.equal(row.collection.candidates.length,2);
  assert.equal(row.collection.candidates[0].sourceMenu.submenu,'Crafting');
  assert.equal(row.collection.candidates[1].sourceMenu.submenu,'Crafting');
  assert.deepEqual(row.collection.candidates.map(v=>v.origin),
    ['set-universe','activity-crafting']);
  assert.equal(row.collection.suppressed.length,1);
  assert.equal(row.collection.suppressed[0].candidate.origin,'set-universe');
  assert.equal(row.collection.suppressed[0].candidate.sourceMenu.submenu,
    'FurnitureSets');
  assert.equal(row.collection.suppressed[0].exclusions[0].sourceRecipeItemId,
    2050300548);
  assert.equal(row.collection.craftingExclusions,'available');
  assert.equal(row.collection.actualGameUiMembershipVerified,false);
  assert.equal(row.collection.direct[0].setId,2120000024);
  const coverage=client.getCoverage();
  assert.equal(coverage.sourceDynamicSelectorsResolved,262);
  assert.equal(coverage.sourceDynamicSelectorsTotal,262);
  assert.equal(coverage.itemTypeVerified,2);
  assert.equal(coverage.sourceCollectionSetDefinitions,2);
  assert.equal((await client.getSourceMenus()).length,2);
  assert.equal(coverage.tagAssociatedDefinitions,1);
  assert.equal(coverage.worldAvailabilityVerified,false);
});
test('non-inventory native definitions can be queried without forcing into four inventory classes',async()=>{
  const f=fixture(),client=createDb01SharedItemClient(f);
  const result=await client.getItems([pet.itemId,furniture.itemId,pet.itemId,9999999]);
  assert.equal(result.length,4);
  assert.equal(result[0].nativeCategory,'Companion');
  assert.equal(result[0].collection.special.length,1);
  assert.equal(result[0].collection.candidates[0].origin,'special');
  assert.equal(result[0].originalItemType.subtypeName,null);
  assert.equal(result[0].originalItemType.subtypeNameVerified,false);
  assert.equal(result[1].item.names.ja,'合成家具');
  assert.equal(result[2].itemId,pet.itemId);
  assert.equal(result[3],null);
  assert.equal(f.io.base,1);
  assert.equal(f.io.type,1);
  assert.equal(f.io.crafting,1);
});
test('absent optional source overlays are unknown, not no category/no DLC or no exclusions',async()=>{
  const f=fixture(),client=createDb01SharedItemClient({catalog:f.catalog,
    universePredicates:f.universePredicates});
  const row=await client.getItem(furniture.itemId);
  assert.equal(row.originalTags,null);
  assert.equal(row.originalItemType,null);
  assert.equal(row.collection.direct,null);
  assert.equal(row.collection.special,null);
  assert.equal(row.collection.activityCrafting,null);
  assert.equal(row.collection.candidates.length,2);
  assert.equal(row.collection.craftingExclusions,'unavailable');
  assert.equal(row.collection.candidates[0].sourceMenu,null);
  assert.equal(await client.getSourceMenus(),null);
  assert.equal(client.getCoverage().itemTypeVerified,null);
  assert.equal(client.getCoverage().sourceDynamicSelectorsResolved,124);
  assert.equal(client.getCoverage().sourceDynamicSelectorsTotal,262);
  assert.equal(f.io.crafting,0);
});
test('mixed source versions, SQLite sources and IL2CPP field maps fail closed before source reads',()=>{
  const f=fixture();
  assert.throws(()=>createDb01SharedItemClient({...f,itemTypes:{
    ...f.itemTypes,source:{...f.itemTypes.source,gameVersion:'1.25.0'},
  }}),/VERSION_OR_CATALOG_ITEM_TYPES/);
  assert.throws(()=>createDb01SharedItemClient({...f,specialPredicates:{
    ...f.specialPredicates,
    source:{...f.specialPredicates.source,sourceSqliteSha256:'9'.repeat(64)},
  }}),/SQLITE_SHA_CONFLICT/);
  assert.throws(()=>createDb01SharedItemClient({...f,directMenus:{
    ...f.directMenus,
    source:{...f.directMenus.source,sourceIl2cppDumpSha256:'9'.repeat(64)},
  }}),/IL2CPP_SHA_CONFLICT/);
  assert.throws(()=>createDb01SharedItemClient({...f,specialPredicates:{
    ...f.specialPredicates,
    source:{...f.specialPredicates.source,totalDynamicSelectors:263},
  }}),/SELECTOR_TOTAL_MISMATCH/);
});
test('altered canonical row identity rejected even if Item ID coincides',async()=>{
  const f=fixture();
  const wrong={...f.tags,getItems:async ids=>ids.map(id=>
    id===furniture.itemId?{...tagInfo(id),nativeKey:'Forged'}:
      id===pet.itemId?tagInfo(id):null)};
  const client=createDb01SharedItemClient({...f,tags:wrong});
  await assert.rejects(client.getItem(furniture.itemId),/TAG_NATIVE_KEY_MISMATCH/);
});
test('bounded batches and canonical invalid Item IDs rejected',async()=>{
  const c=createDb01SharedItemClient(fixture());
  await assert.rejects(c.getItems(Array(4097).fill(furniture.itemId)),
    /INVALID_IDS/);
  await assert.rejects(c.getItem(0),/INVALID_ID/);
  assert.deepEqual(await c.getItems([]),[]);
  assert.strictEqual(c.getCoverage(),c.getCoverage());
});

test('connected original CollectionSet index fails closed when a source predicate targets a missing set',async()=>{
  const f=fixture();
  const menus={...f.directMenus,getMenus:async()=>[{
    setId:2120000024,setKey:'CollectionSet!Synthetic',
    submenuCode:3,submenu:'FurnitureSets',
    collectionLabelKey:'CollectionSet.FurnitureTest',
    sortPriority:1,groupCount:3,directListedItemCount:1,
    dynamicSelectorsUnresolved:2,gameUiVisibilityVerified:false,
  },{
    setId:2120000999,setKey:'CollectionSet!Unrelated',
    submenuCode:3,submenu:'FurnitureSets',
    collectionLabelKey:'CollectionSet.Other',
    sortPriority:2,groupCount:1,directListedItemCount:0,
    dynamicSelectorsUnresolved:0,gameUiVisibilityVerified:false,
  }]};
  const c=createDb01SharedItemClient({...f,directMenus:menus});
  await assert.rejects(c.getItem(furniture.itemId),
    /COLLECTION_SET_NOT_IN_CURRENT_ORIGINAL/);
});

function nativeAreaFixture(){
  const counts={coverage:0,getItem:[]};
  const row=(item,positiveAreaCodes,sourceAreaEvidence)=>Object.freeze({
    itemId:item.itemId,nativeCategory:item.nativeCategory,
    sourceProtobufClass:item.nativeCategory+'ItemData',
    companionKind:item.nativeCategory==='Companion'?'critter':null,
    positiveAreaCodes,sourceAreaEvidence,
    critterLocationOneofFieldNumber:
      item.nativeCategory==='Companion'?6:null,
    originalSourceVerified:true,
    runtimeSkinClassIndependentlyVerified:false,
    runtimeCritterSceneResolved:false,
    nativeAllAreasDefaultVerified:false,
    gameCollectionUiMembershipVerified:false,
    worldAvailabilityVerified:false,
    playerOwnershipVerified:false,
    dlcEntitlementVerified:false,
  });
  const mapping=new Map([
    [furniture.itemId,row(furniture,[1],'native_positive_tag')],
    [pet.itemId,row(pet,null,'requires_profile_world_scene')],
  ]);
  const client={
    schema:'wand.db01.native-positive-area-six-category-steam-1262@1',
    gameVersion:'1.26.2',
    async getCoverage(){
      counts.coverage++;
      return {
        gameVersion:'1.26.2',sourceDefinitions:9778,
        sourcePositiveAreaItems:8976,
        sourceIHasTagsWithoutPositiveArea:673,
        sourceWithoutIHasTags:4,critterSceneUnresolved:125,
        nativeAllAreasDefaultVerified:false,
        gameCollectionUiMembershipVerified:false,
        runtimeSkinClassIndependentlyVerified:false,
        runtimeCritterSceneResolved:false,
      };
    },
    async getItem(id){counts.getItem.push(id);return mapping.get(id)??null;},
    async search(){throw new Error('unused synthetic search');},
  };
  return {client,counts,mapping};
}

test('optional native six-domain reader attaches source facts to existing shared Item records',async()=>{
  const f=fixture(),a=nativeAreaFixture();
  const shared=createDb01SharedItemClient({
    catalog:f.catalog,nativeAreas:a.client,
  });
  const ids=[furniture.itemId,pet.itemId,furniture.itemId,123456];
  const records=await shared.getItems(ids);
  assert.equal(records.length,4);
  assert.equal(records[0].nativeAreaSourceStatus,'original_source_record');
  assert.deepEqual(records[0].originalNativeAreas.positiveAreaCodes,[1]);
  assert.equal(records[0].originalNativeAreas.sourceAreaEvidence,'native_positive_tag');
  assert.equal(records[1].nativeAreaSourceStatus,'original_source_record');
  assert.equal(records[1].originalNativeAreas.sourceAreaEvidence,
    'requires_profile_world_scene');
  assert.equal(records[1].originalNativeAreas.positiveAreaCodes,null);
  assert.equal(records[1].availableWorlds,null);
  assert.equal(records[1].screenCategory,null);
  assert.equal(records[1].dlcEntitlements,null);
  assert.equal(records[2].originalNativeAreas,records[0].originalNativeAreas);
  assert.equal(records[3],null);
  assert.deepEqual(a.counts.getItem.sort(),[furniture.itemId,pet.itemId].sort());
  assert.equal(a.counts.coverage,1);
  const again=await shared.getItem(furniture.itemId);
  assert.equal(again.nativeAreaSourceStatus,'original_source_record');
  assert.equal(a.counts.coverage,1);
});

test('absence of native area reader and out-of-domain Item are not false no-tag matches',async()=>{
  const f=fixture();
  const disconnected=createDb01SharedItemClient({catalog:f.catalog});
  const r=await disconnected.getItem(furniture.itemId);
  assert.equal(r.nativeAreaSourceStatus,'reader_not_connected');
  assert.equal(r.originalNativeAreas,null);
  const x=nativeAreaFixture();
  const activity={
    ...furniture,itemId:20000042,nativeCategory:'ActivityItem',
    nativeKey:'ActivityItem!Synthetic',catalogDomain:'item',
  };
  const catalog={...f.catalog,
    getItems:async ids=>ids.map(id=>id===activity.itemId?activity:null),
  };
  const connected=createDb01SharedItemClient({
    catalog,nativeAreas:x.client,
  });
  const row=await connected.getItem(activity.itemId);
  assert.equal(row.nativeCategory,'ActivityItem');
  assert.equal(row.nativeAreaSourceStatus,'outside_six_verified_domains');
  assert.equal(row.originalNativeAreas,null);
  assert.equal(row.availableWorlds,null);
  assert.deepEqual(x.counts.getItem,[]);
  assert.equal(x.counts.coverage,1);
});

test('cross-version, count-drift, missing and forged source records fail closed',async()=>{
  const f=fixture(),a=nativeAreaFixture();
  assert.throws(()=>createDb01SharedItemClient({
    catalog:f.catalog,nativeAreas:{...a.client,gameVersion:'1.25.0'},
  }),/NATIVE_AREA_VERSION_OR_CONTRACT/);
  assert.throws(()=>createDb01SharedItemClient({
    catalog:f.catalog,nativeAreas:{...a.client,schema:'unknown'},
  }),/NATIVE_AREA_VERSION_OR_CONTRACT/);

  const census={...a.client,getCoverage:async()=>({
    ...await a.client.getCoverage(),sourcePositiveAreaItems:8975,
  })};
  await assert.rejects(
    createDb01SharedItemClient({catalog:f.catalog,nativeAreas:census})
      .getItem(furniture.itemId),
    /NATIVE_AREA_SOURCE_COVERAGE/,
  );
  assert.deepEqual(a.counts.getItem,[]);

  const identity={...a.client,getItem:async id=>{
    const v=await a.client.getItem(id);
    return {...v,nativeCategory:'Skin'};
  }};
  await assert.rejects(
    createDb01SharedItemClient({catalog:f.catalog,nativeAreas:identity})
      .getItem(furniture.itemId),
    /NATIVE_AREA_CANONICAL_IDENTITY_OR_PROOF/,
  );
  const negative={...a.client,getItem:async id=>{
    const v=await a.client.getItem(id);
    return {...v,positiveAreaCodes:[],sourceAreaEvidence:
      'native_ihastags_without_positive_tag'};
  }};
  await assert.rejects(
    createDb01SharedItemClient({catalog:f.catalog,nativeAreas:negative})
      .getItem(pet.itemId),
    /NATIVE_AREA_CANONICAL_IDENTITY_OR_PROOF/,
  );
  const missing={...a.client,getItem:async()=>null};
  await assert.rejects(
    createDb01SharedItemClient({catalog:f.catalog,nativeAreas:missing})
      .getItem(furniture.itemId),
    /NATIVE_AREA_CANONICAL_IDENTITY_OR_PROOF/,
  );
});
