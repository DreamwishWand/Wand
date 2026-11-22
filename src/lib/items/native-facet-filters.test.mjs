import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDb01NativeFacetFilterClient,
  DB01_NATIVE_FILTER_CONTRACT,
} from './native-facet-filters.ts';

const itemsSha='a'.repeat(64);
const sqliteSha='b'.repeat(64);
const dumpSha='c'.repeat(64);
const nativeSha={
  Furniture:'1'.repeat(64),Clothing:'2'.repeat(64),
  ActivityItem:'3'.repeat(64),Trimming:'4'.repeat(64),
};
const classes=['ActivityItem','Furniture','Clothing','Trimming'];
const ids={
  deco:40000047,painted:40000048,untagged:40000049,
  clothing:50700002,meal:30300014,wall:160000000,
};
const typeInfo={
  [ids.deco]:[4,'Furniture',0,'Essential'],
  [ids.painted]:[4,'Furniture',0,'Essential'],
  [ids.untagged]:[4,'Furniture',8,'Landscaping'],
  [ids.clothing]:[5,'Clothing',7,'CloTopOuter'],
  [ids.meal]:[3,'ActivityItem',3,'Meal'],
  [ids.wall]:[16,'Trimming',0,'Wall'],
};
const tagInfo={
  [ids.deco]:[
    ['furnitureKind',2000300006,'Storage',9],
    ['furnitureKind',2000300000,'Essential',9],
    ['furnitureStyle',2000200001,'F_Cute',10],
    ['furnitureStyle',2000200000,'F_Casual',10],
    ['color',2000700000,'Blue',9],
    ['color',2000700008,'Brown',9],
    ['color',2000700000,'Blue',10], // same tag, different native wire field
  ],
  [ids.painted]:[
    ['furnitureKind',2000300006,'Storage',9],
    ['furnitureStyle',2000200000,'F_Casual',10],
    ['color',2000700002,'Red',9],
  ],
  [ids.untagged]:[],
  [ids.clothing]:[
    ['clothingSlot',2000100009,'Coat',9],
    ['clothingStyle',2000000005,'A_Casual',9],
    ['color',2000700002,'Red',9],
  ],
  [ids.meal]:[
    ['mealKind',2001500000,'Appetizer',16],
    ['disneyUniverse',2000500001,'Mickey',16],
  ],
  [ids.wall]:[
    ['furnitureKind',2000300015,'Wallpaper',10],
    ['furnitureStyle',2000200003,'F_Modern',10],
    ['color',2000700004,'White',10],
    ['worldContextTag',2001200001,'IsDreamlightValley',10],
  ],
};
const locs=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
const categoryFor=id=>id===ids.clothing?'Clothing':
  id===ids.wall?'Trimming':id===ids.meal?'ActivityItem':'Furniture';
function fixture(){
  const calls={category:0,tags:0,types:0};
  const catalogRows=Object.values(ids).map(itemId=>({
    itemId,nativeCategory:categoryFor(itemId),
    nativeKey:'Synthetic!'+itemId,catalogDomain:'item',
    localizationKey:'Item.'+itemId,
    sourceSha256:nativeSha[categoryFor(itemId)],
    verifiedIconGuid:'guid:'+'f'.repeat(32),
    names:Object.fromEntries(locs.map(l=>[l,l==='ja'?'日本語'+itemId:null])),
  }));
  const map=new Map(catalogRows.map(v=>[v.itemId,v]));
  const tagsRows=new Map(catalogRows.map(row=>{
    const refs=tagInfo[row.itemId].map(([facet,tagId,tagKey,wireField])=>({
      facet,tagId,tagKey,wireField,
    }));
    const facets={};
    for(const ref of refs){
      if(ref.facet==='otherTag')continue;
      const group=facets[ref.facet]??(facets[ref.facet]=[]);
      if(!group.includes(ref.tagKey))group.push(ref.tagKey);
    }
    return [row.itemId,{
      itemId:row.itemId,nativeCategory:row.nativeCategory,
      nativeKey:row.nativeKey,sourceSha256:row.sourceSha256,
      tagReferences:refs,facets,
      wireSubtypeCode:null,wireSubtypeMeaningVerified:false,
      gameUiCategoryVerified:false,worldAvailabilityVerified:false,
      dlcOwnershipVerified:false,
    }];
  }));
  const typeRows=new Map(catalogRows.map(row=>{
    const [itemTypeCode,itemTypeName,subtypeCode,subtypeName]=typeInfo[row.itemId];
    return [row.itemId,{
      itemId:row.itemId,nativeCategory:row.nativeCategory,
      sourceSha256:row.sourceSha256,itemTypeCode,itemTypeName,
      subtypeCode,subtypeEnumName:itemTypeName+'ItemType',
      subtypeName,subtypeNameVerified:true,
      sourceIl2cppDumpSha256:dumpSha,
      gameUiCategoryVerified:false,worldAvailabilityVerified:false,
      dlcOwnershipVerified:false,
    }];
  }));
  return {
    calls,
    catalog:{
      source:{
        platform:'Steam',gameVersion:'1.26.2',
        privateOnly:true,fullCorpusParsed:true,
        definitions:6,currentNativeItemDefinitions:6,
        sourceItemsSha256:itemsSha,
        nativeSourceManifestSha256:itemsSha,
      },
      getCategory:async category=>{
        calls.category++;
        return catalogRows.filter(v=>v.nativeCategory===category);
      },
      getItems:async selected=>selected.map(id=>map.get(id)??null),
    },
    tags:{
      source:{
        privateOnly:true,gameVersion:'1.26.2',
        sourceItemsSha256:itemsSha,sourceSqliteSha256:sqliteSha,
        definitionCount:6,taggedDefinitions:5,
      },
      getItems:async selected=>{
        calls.tags++;
        return selected.map(id=>tagsRows.get(id)??null);
      },
    },
    types:{
      source:{
        gameVersion:'1.26.2',sourceItemsSha256:itemsSha,
        sourceSqliteSha256:sqliteSha,sourceIl2cppDumpSha256:dumpSha,
        definitionCount:6,sourceItemTypeVerified:6,sourceSubtypeNameVerified:6,
      },
      getItems:async selected=>{
        calls.types++;
        return selected.map(id=>typeRows.get(id)??null);
      },
    },
    map,tagsRows,typeRows,
  };
}
test('complete native class and subtype rules use exact original IL2CPP enum values',async()=>{
  const f=fixture();
  const c=createDb01NativeFacetFilterClient(f.catalog,f.tags,f.types);
  assert.equal(c.contract,DB01_NATIVE_FILTER_CONTRACT);
  const coverage=await c.getCoverage();
  assert.equal(coverage.fullNativeDefinitions,6);
  assert.equal(coverage.byNativeCategory.Furniture,3);
  assert.equal(coverage.byNativeCategory.Clothing,1);
  assert.equal(coverage.namedSourceSubtypes,6);
  assert.equal(coverage.gameUiFilterVerified,false);
  assert.equal(coverage.worldAvailabilityVerified,false);
  assert.equal(coverage.dlcEntitlementVerified,false);
  const options=await c.getSubtypeOptions('Furniture');
  assert.deepEqual(options.map(v=>[v.subtypeCode,v.matchingNativeItemIds]),[[0,2],[8,1]]);
  const r=await c.search({nativeCategories:['Furniture'],subtypes:[
    {nativeCategory:'Furniture',subtypeCode:8},
  ]});
  assert.deepEqual(r.itemIds,[ids.untagged]);
  assert.equal(r.originalNativeMatchesOnly,true);
  assert.equal((await c.getItem(ids.untagged)).originalFacets.color,undefined);
  assert.equal(await c.getItem(2050300001),null);
});
test('AND across furniture kind/style/color and OR within a facet, keeping all multivalued tags',async()=>{
  const f=fixture();
  const c=createDb01NativeFacetFilterClient(f.catalog,f.tags,f.types);
  const result=await c.search({nativeCategories:['Furniture'],facets:{
    furnitureKind:[2000300006],
    furnitureStyle:[2000200000,2000200001],
    color:[2000700000,2000700002],
  }});
  assert.equal(result.total,2);
  assert.deepEqual(result.itemIds,[ids.deco,ids.painted]);
  const narrower=await c.search({nativeCategories:['Furniture'],facets:{
    furnitureKind:[2000300006],furnitureStyle:[2000200001],
    color:[2000700000],
  }});
  assert.deepEqual(narrower.itemIds,[ids.deco]);
  const item=await c.getItem(ids.deco);
  assert.deepEqual(item.originalFacets.color,['Blue','Brown']);
  assert.equal(item.tagReferences.length,7);
  assert.equal(item.definition.names.ja,'日本語40000047');
  const colours=await c.getFacetOptions('color','Furniture');
  assert.deepEqual(colours.map(o=>[o.originalTagKey,o.matchingNativeItemIds]),
    [['Blue',1],['Red',1],['Brown',1]]);
  assert.equal(colours[0].sourceTagAssociationVerified,true);
  assert.equal(colours[0].gameUiFilterVerified,false);
});
test('cross-class tag filters preserve original native classes, not UI grouping',async()=>{
  const f=fixture();
  const c=createDb01NativeFacetFilterClient(f.catalog,f.tags,f.types);
  const red=await c.search({facets:{color:[2000700002]}});
  assert.deepEqual(red.itemIds,[ids.painted,ids.clothing]);
  const trim=await c.search({nativeCategories:['Trimming'],facets:{
    furnitureKind:[2000300015],worldContextTag:[2001200001],
  }});
  assert.deepEqual(trim.itemIds,[ids.wall]);
  assert.equal(trim.worldAvailabilityVerified,false);
  const originalWorld=await c.getFacetOptions('worldContextTag');
  assert.equal(originalWorld.length,1);
  assert.equal(originalWorld[0].originalTagKey,'IsDreamlightValley');
});
test('paged stable numerical Item ID order, unknown Tag ID returns no matches',async()=>{
  const c=createDb01NativeFacetFilterClient(fixture().catalog,
    fixture().tags,fixture().types);
  const first=await c.search({nativeCategories:['Furniture'],offset:0,limit:1});
  assert.equal(first.total,3);
  assert.deepEqual(first.itemIds,[ids.deco]);
  assert.equal(first.hasMore,true);
  const next=await c.search({nativeCategories:['Furniture'],offset:1,limit:2});
  assert.deepEqual(next.itemIds,[ids.painted,ids.untagged]);
  assert.equal(next.hasMore,false);
  assert.deepEqual((await c.search({facets:{color:[99999999]}})).itemIds,[]);
  assert.deepEqual((await c.search({nativeCategories:[]})).itemIds,[]);
});
test('native sources are indexed once for repeated requests, without re-fetching private shards',async()=>{
  const f=fixture(),c=createDb01NativeFacetFilterClient(f.catalog,f.tags,f.types);
  await Promise.all([
    c.getCoverage(),c.getItem(ids.deco),c.getFacetOptions('color'),
    c.getSubtypeOptions('Furniture'),c.search(),
  ]);
  assert.equal(f.calls.category,4);
  assert.equal(f.calls.tags,4);
  assert.equal(f.calls.types,4);
  await c.search({facets:{color:[2000700002]}});
  assert.equal(f.calls.tags,4);
  assert.equal(f.calls.types,4);
});
test('incompatible original source, forged native type and catalog count fail closed',async()=>{
  const f=fixture();
  assert.throws(()=>createDb01NativeFacetFilterClient(f.catalog,{
    ...f.tags,source:{...f.tags.source,gameVersion:'1.25.0'},
  },f.types),/SOURCE_VERSION_OR_SQLITE_IDENTITY/);
  assert.throws(()=>createDb01NativeFacetFilterClient(f.catalog,f.tags,{
    ...f.types,source:{...f.types.source,sourceSqliteSha256:'f'.repeat(64)},
  }),/SOURCE_VERSION_OR_SQLITE_IDENTITY/);
  await assert.rejects(createDb01NativeFacetFilterClient({
    ...f.catalog,source:{...f.catalog.source,currentNativeItemDefinitions:7},
  },f.tags,f.types).getCoverage(),/INCOMPLETE_NATIVE_SCAN/);
  const bad={
    ...f.types,getItems:async selected=>selected.map(id=>{
      const row=f.typeRows.get(id);
      return id===ids.deco?{...row,nativeCategory:'Clothing'}:row;
    }),
  };
  await assert.rejects(createDb01NativeFacetFilterClient(
    f.catalog,f.tags,bad).search(),/SOURCE_ROW_MISMATCH/);
});
test('invalid facet and pagination cannot make claims',async()=>{
  const f=fixture(),c=createDb01NativeFacetFilterClient(f.catalog,f.tags,f.types);
  await assert.rejects(c.search({facets:{colour:[2000700002]}}),
    /FACETS_FILTER/);
  await assert.rejects(c.search({facets:{color:['red']}}),/TAG_IDS/);
  await assert.rejects(c.search({limit:10000}),/PAGING/);
  await assert.rejects(c.getFacetOptions('madeUp'),/FACET_OPTION_SELECTION/);
  await assert.rejects(c.getSubtypeOptions('not-a-class'),/SUBTYPE_OPTION_CATEGORY/);
});
