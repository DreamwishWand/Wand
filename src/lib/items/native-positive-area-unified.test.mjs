import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_TOTAL,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_MATCHED,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_UNRESOLVED,
  createDb01UnifiedPositiveAreaClient,
} from './native-positive-area-unified.ts';
import {
  DB01_FURNITURE_NATIVE_AREA_PREDICATES,
  DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS,
} from './furniture-positive-areas.ts';
import {
  DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA,
  DB01_WARDROBE_POSITIVE_AREA_CENSUS,
} from './wardrobe-native-has-tag.ts';

const area=[1,2,3,4,5,4097];
const wardrobeCounts={
  Clothing:{1:1792,2:19,3:42,4:25,5:132,4097:31},
  Trimming:{1:348,2:0,3:5,4:3,5:5,4097:4},
  Makeup:{1:0,2:0,3:0,4:0,5:0,4097:0},
};
function fixture(){
  const furnitureRows=[];
  let furnitureId=40_000_000;
  for(const [code,count] of Object.entries(
    DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS)){
    for(let i=0;i<count;i++){
      furnitureRows.push({id:furnitureId,category:'Furniture',
        nativeClass:'FurnitureItemData',codes:[Number(code)]});
      furnitureId+=2;
    }
  }
  for(let i=0;i<443;i++){
    furnitureRows.push({id:furnitureId,category:'Furniture',
      nativeClass:'FurnitureBlockerItemData',codes:[]});
    furnitureId+=2;
  }
  assert.equal(furnitureRows.length,6746);
  const wardrobeRows=[];
  let wardrobeId=40_000_001;
  for(const [category,counts] of Object.entries(wardrobeCounts)){
    for(const [code,count] of Object.entries(counts)){
      for(let i=0;i<count;i++){
        wardrobeRows.push({
          id:wardrobeId,category,
          nativeClass:category+'ItemData',codes:[Number(code)],
        });
        wardrobeId+=2;
      }
    }
    if(category==='Makeup'){
      for(let i=0;i<69;i++){
        wardrobeRows.push({
          id:wardrobeId,category,
          nativeClass:'MakeupItemData',codes:[],
        });
        wardrobeId+=2;
      }
    }
  }
  assert.equal(wardrobeRows.length,2475);
  const calls={f:[],w:[],coverage:0};
  const page=(rows,selection)=>{
    const selected=rows.filter(row=>
      (selection.nativeCategories===undefined||
        selection.nativeCategories.includes(row.category))&&
      (selection.areaCodes.includes(0)||
        row.codes.some(code=>selection.areaCodes.includes(code))));
    return {
      total:selected.length,
      itemIds:selected.slice(selection.offset,selection.offset+selection.limit)
        .map(row=>row.id),
      hasMore:selected.length>selection.offset+selection.limit,
    };
  };
  const furniture={
    contract:DB01_FURNITURE_NATIVE_AREA_PREDICATES,
    gameVersion:'1.26.2',
    async getItem(itemId){
      const row=furnitureRows.find(r=>r.id===itemId);
      return row?{
        itemId:row.id,originalNativeFurnitureClass:row.nativeClass,
        matchedPositiveAreaCodes:row.codes,
        firstProvenAreaCode:row.codes[0]??null,
        positiveNativeHasTagPredicatesVerified:true,
        originalAllAreasDefaultHasTagEvaluated:false,
        actualCollectionUiMembershipVerified:false,
        gameWorldAvailabilityVerified:false,
        playerEntitlementVerified:false,
      }:null;
    },
    async getCoverage(){
      calls.coverage++;
      return {
        gameVersion:'1.26.2',originalFurnitureCount:6746,
        anyPositiveAreaTagItems:6303,
        withoutPositiveAreaTagItems:443,
        originalPositiveHasTagPredicatesVerified:true,
        allAreasNativeDefaultTagVerified:false,
        nativeGameUiAreaMembershipVerified:false,
        sourceItemsByPositiveArea:DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS,
      };
    },
    async search(selection){
      calls.f.push(selection);
      return {...page(furnitureRows,selection),
        originalPositiveAreaNativeSourceOnly:true,
        actualCollectionUiMembershipVerified:false,
        areaDefaultNativePredicateEvaluated:false,
        playerOwnershipVerified:false,
        dlcEntitlementVerified:false,
      };
    },
  };
  const wardrobe={
    schema:DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA,
    gameVersion:'1.26.2',
    async getItem(itemId){
      const row=wardrobeRows.find(r=>r.id===itemId);
      return row?{
        original:{
          itemId:row.id,nativeCategory:row.category,
          originalNativeClass:row.nativeClass,
        },
        positiveAreaCodes:row.codes,
        sourceShardHashVerified:true,
        gameUiCollectionMembershipVerified:false,
        worldAvailabilityVerified:false,
        dlcEntitlementVerified:false,
      }:null;
    },
    async getCoverage(){
      calls.coverage++;
      return {
        sourceDefinitionCount:2475,
        sourceResolvedSetItemReferences:2405,
        positiveAreaItems:2406,sourceUnassignedPositiveAreaItems:69,
        sourceVerifiedPositiveAreaPredicates:true,
        originalAllAreasDefaultHasTagEvaluated:false,
        runtimeCollectionUiMembershipVerified:false,
        originalCategoryCounts:{
          Clothing:2041,Trimming:365,Makeup:69,
        },
        positiveAreaByCode:DB01_WARDROBE_POSITIVE_AREA_CENSUS,
      };
    },
    async search(selection){
      calls.w.push(selection);
      return {...page(wardrobeRows,selection),
        sourceNativeHasTagMatchesOnly:true,
        actualCollectionUiMembershipVerified:false,
        allAreasDefaultNativePredicateEvaluated:false,
        playerEntitlementVerified:false,
      };
    },
  };
  return {furniture,wardrobe,furnitureRows,wardrobeRows,calls};
}
const make=f=>createDb01UnifiedPositiveAreaClient(f.furniture,f.wardrobe);
const allSource=fixture();
const sorted=[...allSource.furnitureRows,...allSource.wardrobeRows]
  .sort((a,b)=>a.id-b.id);

test('original Steam 1.26.2 four-category source census is exact and distinct from game UI',()=>{
  assert.equal(DB01_NATIVE_POSITIVE_AREA_SOURCE_TOTAL,9221);
  assert.equal(DB01_NATIVE_POSITIVE_AREA_SOURCE_MATCHED,8709);
  assert.equal(DB01_NATIVE_POSITIVE_AREA_SOURCE_UNRESOLVED,512);
  assert.deepEqual(DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS,
    {Furniture:6746,Clothing:2041,Trimming:365,Makeup:69});
  assert.deepEqual(DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS,
    {1:6455,2:453,3:469,4:459,5:615,4097:258});
  assert.equal(Object.values(DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS)
    .reduce((a,b)=>a+b,0),9221);
  assert.equal(Object.values(DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS)
    .reduce((a,b)=>a+b,0),8709);
});

test('cross-reader original item lookup proves source class without inferring ID ranges',async()=>{
  const f=fixture(),c=make(f);
  assert.equal(c.schema,DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA);
  assert.equal(c.gameVersion,'1.26.2');
  const furniture=await c.getItem(f.furnitureRows[0].id);
  const wardrobe=await c.getItem(f.wardrobeRows[0].id);
  const makeup=await c.getItem(f.wardrobeRows.at(-1).id);
  assert.equal(furniture.originalNativeCategory,'Furniture');
  assert.equal(furniture.originalNativeClass,'FurnitureItemData');
  assert.deepEqual(furniture.positiveAreaCodes,[1]);
  assert.equal(wardrobe.originalNativeCategory,'Clothing');
  assert.deepEqual(wardrobe.positiveAreaCodes,[1]);
  assert.equal(makeup.originalNativeCategory,'Makeup');
  assert.deepEqual(makeup.positiveAreaCodes,[]);
  assert.equal(makeup.firstProvenPositiveAreaCode,null);
  assert.equal(makeup.allAreasNativeDefaultPredicateVerified,false);
  assert.equal(makeup.gameCollectionUiMembershipVerified,false);
  assert.equal(makeup.playerOwnershipVerified,false);
  assert.equal(makeup.dlcEntitlementVerified,false);
  assert.equal(Object.isFrozen(makeup),true);
  assert.equal(Object.isFrozen(makeup.positiveAreaCodes),true);
  assert.equal(await c.getItem(123456789),null);
  await assert.rejects(c.getItem(0),
    /DB01_UNIFIED_NATIVE_AREA_INVALID_ITEM_ID/);
});

test('four-source full original coverage validates both separate pinned readers',async()=>{
  const f=fixture(),c=make(f);
  const coverage=await c.getCoverage();
  assert.equal(coverage.sourceDefinitionCount,9221);
  assert.equal(coverage.positiveAreaItems,8709);
  assert.equal(coverage.unresolvedPositiveAreaItems,512);
  assert.deepEqual(coverage.positiveAreaByCode,
    DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS);
  assert.deepEqual(coverage.originalNativeCategoryCounts,
    DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS);
  assert.equal(coverage.verifiedOriginalNativeHasTagSource,true);
  assert.equal(coverage.allAreasNativeDefaultPredicateVerified,false);
  assert.equal(coverage.gameCollectionUiMembershipVerified,false);
  assert.equal(coverage.dlcEntitlementVerified,false);
  assert.equal(await c.getCoverage(),coverage);
  assert.equal(f.calls.coverage,2,'cache both underlying coverage scans');
});

test('unified original item search merges both sorted private source readers',async()=>{
  const f=fixture(),c=make(f);
  const queries=[
    {areaCodes:[0],offset:0,limit:0},
    {areaCodes:[0],offset:0,limit:100},
    {areaCodes:[0],offset:240,limit:70},
    {areaCodes:[0],offset:2000,limit:300},
    {areaCodes:[0],offset:7015,limit:250},
    {areaCodes:[0],offset:9200,limit:100},
    {areaCodes:[0],offset:999999,limit:20},
    {areaCodes:[1],offset:99,limit:55},
    {areaCodes:[2,4097],offset:50,limit:20},
    {areaCodes:[5,4],offset:610,limit:100},
  ];
  for(const query of queries){
    const expected=sorted.filter(row=>
      query.areaCodes.includes(0)||
      row.codes.some(code=>query.areaCodes.includes(code)));
    const result=await c.search(query);
    assert.equal(result.total,expected.length,JSON.stringify(query));
    assert.deepEqual(result.itemIds,
      expected.slice(query.offset,query.offset+query.limit)
        .map(row=>row.id),JSON.stringify(query));
    assert.equal(result.hasMore,
      expected.length>query.offset+result.itemIds.length);
    assert.equal(result.sourcePositiveNativeHasTagOnly,true);
    assert.equal(result.gameCollectionUiMembershipVerified,false);
    assert.equal(result.allAreasNativeDefaultPredicateVerified,false);
    assert.equal(result.worldAvailabilityVerified,false);
    assert.equal(result.playerOwnershipVerified,false);
    assert.equal(result.dlcEntitlementVerified,false);
    assert.equal(Object.isFrozen(result.itemIds),true);
  }
  const all=await c.search();
  assert.equal(all.total,9221);
  assert.equal(all.allAreasMeansUnfilteredOriginalSource,true);
  const single=await c.search({areaCodes:[1],limit:0});
  assert.equal(single.total,6455);
});

test('source native category selection never misclassifies Makeup as Dreamlight Valley',async()=>{
  const f=fixture(),c=make(f);
  const makeup=await c.search({nativeCategories:['Makeup'],areaCodes:[0]});
  assert.equal(makeup.total,69);
  assert.equal(f.calls.f.length,0);
  const makeupDreamlight=await c.search({
    nativeCategories:['Makeup'],areaCodes:[1],
  });
  assert.equal(makeupDreamlight.total,0);
  const wardrobe=await c.search({
    nativeCategories:['Clothing','Trimming'],areaCodes:[0],limit:0,
  });
  assert.equal(wardrobe.total,2406);
  assert.equal(f.calls.f.length,0);
  const furniture=await c.search({
    nativeCategories:['Furniture'],areaCodes:[0],limit:0,
  });
  assert.equal(furniture.total,6746);
  assert.equal(f.calls.w.length,4,
    'two-step source page requests from earlier Makeup queries remain cached, Furniture-only performs no wardrobe IO');
  const empty=await c.search({nativeCategories:[]});
  assert.equal(empty.total,0);
  assert.deepEqual(empty.itemIds,[]);
});

test('invalid original areas, malformed category selection and page bounds fail before IO',async()=>{
  const f=fixture(),c=make(f);
  for(const query of [
    {nativeCategories:['Companion']},
    {nativeCategories:['Furniture','Furniture']},
    {areaCodes:[0,1]},
    {areaCodes:[6]},
    {areaCodes:[2001200028]},
    {areaCodes:[]},
    {areaCodes:[1,1]},
    {limit:-1},
    {limit:1001},
    {offset:-1},
    {offset:1000001},
    {areaCodes:[null]},
  ]){
    await assert.rejects(c.search(query),/DB01_UNIFIED_NATIVE_AREA_/);
  }
  assert.equal(f.calls.f.length,0);
  assert.equal(f.calls.w.length,0);
});

test('tampered source coverage or reader version fails closed',async()=>{
  const f=fixture();
  f.wardrobe.getCoverage=async()=>({
    sourceDefinitionCount:2475,
    sourceResolvedSetItemReferences:2405,
    positiveAreaItems:2407,
    sourceUnassignedPositiveAreaItems:68,
    sourceVerifiedPositiveAreaPredicates:true,
    originalAllAreasDefaultHasTagEvaluated:false,
    runtimeCollectionUiMembershipVerified:false,
    originalCategoryCounts:{Clothing:2041,Trimming:365,Makeup:69},
    positiveAreaByCode:DB01_WARDROBE_POSITIVE_AREA_CENSUS,
  });
  await assert.rejects(make(f).getCoverage(),
    /DB01_UNIFIED_NATIVE_AREA_PINNED_SOURCE_CENSUS_OR_PROOF_DRIFT/);
  f.wardrobe.gameVersion='1.25.0';
  assert.throws(()=>make(f),
    /DB01_UNIFIED_NATIVE_AREA_PINNED_PRIVATE_ORIGINAL_SOURCE_CLIENTS_REQUIRED/);
});

test('unsorted or duplicate private source rows are rejected during merge',async()=>{
  const f=fixture(),c=make(f);
  const original=f.furniture.search;
  f.furniture.search=async query=>{
    const result=await original(query);
    return query.limit>0&&result.itemIds.length>1?
      {...result,itemIds:[result.itemIds[1],result.itemIds[0],
        ...result.itemIds.slice(2)]}:result;
  };
  await assert.rejects(c.search({areaCodes:[0],limit:20}),
    /DB01_UNIFIED_NATIVE_AREA_ORIGINAL_SOURCE_PAGE_CORRUPT_OR_UNSORTED/);
  const f2=fixture(),c2=make(f2);
  const normalWardrobe=f2.wardrobe.search;
  f2.wardrobe.search=async query=>{
    const res=await normalWardrobe(query);
    if(!res.itemIds.length)return res;
    return {...res,itemIds:[f2.furnitureRows[0].id,
      ...res.itemIds.slice(1)]};
  };
  await assert.rejects(c2.search({areaCodes:[0],limit:20}),
    /DB01_UNIFIED_NATIVE_AREA_DUPLICATE_ITEM_ID_ACROSS_ORIGINAL_SOURCES/);
});

test('source-local getItem ID collisions fail, even when numeric ranges overlap',async()=>{
  const f=fixture(),c=make(f);
  const same=f.furnitureRows[0].id;
  const original=f.wardrobe.getItem;
  f.wardrobe.getItem=async id=>
    id===same?{
      original:{itemId:id,nativeCategory:'Clothing',
        originalNativeClass:'ClothingItemData'},
      positiveAreaCodes:[1],sourceShardHashVerified:true,
      gameUiCollectionMembershipVerified:false,
      worldAvailabilityVerified:false,dlcEntitlementVerified:false,
    }:original(id);
  await assert.rejects(c.getItem(same),
    /DB01_UNIFIED_NATIVE_AREA_CROSS_SOURCE_ORIGINAL_ITEM_ID_COLLISION/);
});
