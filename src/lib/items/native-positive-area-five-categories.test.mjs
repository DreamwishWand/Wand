import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS,
} from './native-positive-area-unified.ts';
import {
  DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA,
  DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS,
  DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS,
} from './companion-native-has-tag.ts';
import {
  DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA,
  DB01_FIVE_CATEGORY_SOURCE_COUNTS,
  DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS,
  DB01_FIVE_CATEGORY_SOURCE_TOTAL,
  DB01_FIVE_CATEGORY_NATIVE_POSITIVE,
  DB01_FIVE_CATEGORY_NATIVE_TAG_NO_POSITIVE,
  DB01_FIVE_CATEGORY_CRITTER_SCENE_UNKNOWN,
  createDb01FiveCategorySourceClient,
} from './native-positive-area-five-categories.ts';

const areaCodes=[1,2,3,4,5,4097];
const fourCensus={
  Furniture:{1:4315,2:434,3:422,4:431,5:478,4097:223,unknown:443},
  Clothing:{1:1792,2:19,3:42,4:25,5:132,4097:31,unknown:0},
  Trimming:{1:348,2:0,3:5,4:3,5:5,4097:4,unknown:0},
  Makeup:{1:0,2:0,3:0,4:0,5:0,4097:0,unknown:69},
};
function originalRows(){
  const four=[],companion=[];
  let base=300_000_000;
  for(const [category,counts] of Object.entries(fourCensus)){
    for(const [area,count] of Object.entries(counts)){
      for(let i=0;i<count;i++){
        four.push({
          id:base,category,
          cls:category+'ItemData',
          kind:null,
          codes:area==='unknown'?[]:[Number(area)],
          oneof:null,
        });
        base+=2;
      }
    }
  }
  let next=300_000_001;
  for(const [area,count] of Object.entries({
    1:170,2:20,3:16,4:14,5:17,4097:4,
  })){
    for(let i=0;i<count;i++){
      companion.push({
        id:next,category:'Companion',
        cls:'PetItemData',kind:'pet',
        codes:[Number(area)],oneof:null,
      });
      next+=2;
    }
  }
  for(let i=0;i<28;i++){
    companion.push({
      id:next,category:'Companion',
      cls:'MountItemData',kind:'mount',
      codes:i<5?[4]:[],oneof:null,
    });
    next+=2;
  }
  for(let i=0;i<125;i++){
    companion.push({
      id:next,category:'Companion',
      cls:'CritterItemData',kind:'critter',
      codes:null,oneof:i<105?6:7,
    });
    next+=2;
  }
  assert.equal(four.length,9221);
  assert.equal(companion.length,394);
  return {four,companion};
}
const rows=originalRows();
const sorted=[...rows.four,...rows.companion].sort((a,b)=>a.id-b.id);
const mapping=new Map(sorted.map(x=>[x.id,x]));
const page=(source,filter,offset,limit)=>{
  const matches=source.filter(filter);
  return {
    total:matches.length,
    itemIds:matches.slice(offset,offset+limit).map(x=>x.id),
    hasMore:matches.length>offset+limit,
  };
};
function fake(){
  const calls={fourSearch:[],companionSearch:[],coverage:0};
  const four={
    schema:DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA,
    gameVersion:'1.26.2',
    async getItem(id){
      const item=rows.four.find(x=>x.id===id);
      return item?{
        itemId:id,originalNativeCategory:item.category,
        originalNativeClass:item.cls,
        positiveAreaCodes:item.codes,
        firstProvenPositiveAreaCode:item.codes[0]??null,
        sourceOriginalIHasTagsAndSetSemanticsVerified:true,
        allAreasNativeDefaultPredicateVerified:false,
        gameCollectionUiMembershipVerified:false,
        worldAvailabilityVerified:false,
        playerOwnershipVerified:false,
        dlcEntitlementVerified:false,
      }:null;
    },
    async getCoverage(){
      calls.coverage++;
      return {
        gameVersion:'1.26.2',
        sourceDefinitionCount:9221,
        originalNativeCategoryCounts:DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS,
        positiveAreaItems:8709,unresolvedPositiveAreaItems:512,
        positiveAreaByCode:DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS,
        verifiedOriginalNativeHasTagSource:true,
        allAreasNativeDefaultPredicateVerified:false,
        gameCollectionUiMembershipVerified:false,
      };
    },
    async search(query){
      calls.fourSearch.push(query);
      return {
        ...page(rows.four,x=>
          query.nativeCategories.includes(x.category)&&
          (query.areaCodes.includes(0)||
            x.codes.some(code=>query.areaCodes.includes(code))),
        query.offset,query.limit),
        sourcePositiveNativeHasTagOnly:true,
        gameCollectionUiMembershipVerified:false,
        allAreasNativeDefaultPredicateVerified:false,
        worldAvailabilityVerified:false,
        playerOwnershipVerified:false,
        dlcEntitlementVerified:false,
      };
    },
  };
  const companion={
    schema:DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA,
    gameVersion:'1.26.2',
    async getItem(id){
      const item=rows.companion.find(x=>x.id===id);
      return item?{
        source:{
          itemId:id,nativeCategory:'Companion',
          originalNativeClass:item.cls,
          nativeKind:item.kind,
          critterLocationOneofFieldNumber:item.oneof,
          runtimeCritterWorldSceneVerified:false,
        },
        positiveNativeAreaCodes:item.codes,
        originalIHasTagsInterface:item.kind!=='critter',
        needsRuntimeCritterSceneEvaluation:item.kind==='critter',
        sourceShardHashVerified:true,
        sourceOriginalNativeClassVerified:true,
        actualCollectionUiMembershipVerified:false,
        nativeAllAreasDefaultPredicateVerified:false,
        playerEntitlementVerified:false,
      }:null;
    },
    async getCoverage(){
      calls.coverage++;
      return {
        sourceDefinitions:394,
        sourceNativeTaggedPositiveAreaItems:246,
        sourceNativeTaggedWithoutPositiveArea:23,
        sourceCritterRuntimeWorldUnknown:125,
        sourceCritterLocationOneofCase6:105,
        sourceCritterSceneOneofCase7:20,
        nativeClassAndInterfaceSourceVerified:true,
        critterRuntimeCollectionAreaVerified:false,
        nativeAllAreasDefaultTagVerified:false,
        actualGameUiMembershipVerified:false,
        sourcePositiveAreaByCode:DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS,
      };
    },
    async search(query){
      calls.companionSearch.push(query);
      return {
        ...page(rows.companion,x=>
          query.kinds.includes(x.kind)&&
          (query.areaCodes.includes(0)||
            x.codes?.some(code=>query.areaCodes.includes(code))),
        query.offset,query.limit),
        sourceNativePetAndMountTagOnly:true,
        critterProfileWorldAreaUnresolved:true,
        actualCollectionUiMembershipVerified:false,
        nativeAllAreasDefaultPredicateVerified:false,
        playerEntitlementVerified:false,
      };
    },
  };
  return {four,companion,calls};
}
const client=f=>createDb01FiveCategorySourceClient(f.four,f.companion);

test('five native original categories keep 9,615 / 8,955 / 535 / 125 separate',()=>{
  assert.equal(DB01_FIVE_CATEGORY_SOURCE_TOTAL,9615);
  assert.equal(DB01_FIVE_CATEGORY_NATIVE_POSITIVE,8955);
  assert.equal(DB01_FIVE_CATEGORY_NATIVE_TAG_NO_POSITIVE,535);
  assert.equal(DB01_FIVE_CATEGORY_CRITTER_SCENE_UNKNOWN,125);
  assert.deepEqual(DB01_FIVE_CATEGORY_SOURCE_COUNTS,{
    Furniture:6746,Clothing:2041,Trimming:365,Makeup:69,Companion:394,
  });
  assert.deepEqual(DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS,{
    1:6625,2:473,3:485,4:478,5:632,4097:262,
  });
  assert.equal(
    Object.values(DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS)
      .reduce((a,b)=>a+b,0),8955);
  assert.equal(8955+535+125,9615);
});

test('source item lookup differentiates original Critter no-IHasTags from genuine no positive Tag',async()=>{
  const f=fake(),api=client(f);
  assert.equal(api.schema,DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA);
  const clothing=await api.getItem(rows.four.find(x=>x.category==='Clothing').id);
  const makeup=await api.getItem(rows.four.find(x=>x.category==='Makeup').id);
  const pet=await api.getItem(rows.companion[0].id);
  const untaggedMount=await api.getItem(rows.companion[246].id);
  const critter=await api.getItem(rows.companion[269].id);
  const sceneCritter=await api.getItem(rows.companion[374].id);
  assert.equal(clothing.sourceAreaEvidence,'native_positive_tag');
  assert.deepEqual(clothing.positiveAreaCodes,[1]);
  assert.equal(makeup.sourceAreaEvidence,
    'native_ihastags_without_positive_tag');
  assert.deepEqual(makeup.positiveAreaCodes,[]);
  assert.equal(pet.companionKind,'pet');
  assert.equal(pet.sourceAreaEvidence,'native_positive_tag');
  assert.equal(untaggedMount.companionKind,'mount');
  assert.equal(untaggedMount.sourceAreaEvidence,
    'native_ihastags_without_positive_tag');
  assert.deepEqual(untaggedMount.positiveAreaCodes,[]);
  assert.equal(critter.companionKind,'critter');
  assert.equal(critter.sourceAreaEvidence,'requires_profile_world_scene');
  assert.equal(critter.positiveAreaCodes,null);
  assert.equal(critter.firstProvenPositiveAreaCode,null);
  assert.equal(critter.critterLocationOneofFieldNumber,6);
  assert.equal(sceneCritter.critterLocationOneofFieldNumber,7);
  assert.equal(critter.critterRuntimeProfileSceneResolved,false);
  assert.equal(critter.gameCollectionUiMembershipVerified,false);
  assert.equal(critter.playerOwnershipVerified,false);
  assert.equal(critter.dlcEntitlementVerified,false);
  assert.ok(Object.isFrozen(critter));
  assert.equal(await api.getItem(99887766),null);
  await assert.rejects(api.getItem(0),/DB01_FIVE_NATIVE_AREA_INVALID_ITEM_ID/);
});

test('complete cross-source original coverage uses existing verified API contracts and exact counts',async()=>{
  const f=fake(),api=client(f);
  const coverage=await api.getCoverage();
  assert.equal(coverage.gameVersion,'1.26.2');
  assert.equal(coverage.sourceDefinitions,9615);
  assert.equal(coverage.sourcePositiveNativeAreaItems,8955);
  assert.equal(coverage.sourceIHasTagsWithoutPositiveArea,535);
  assert.equal(coverage.sourceCritterNeedsProfileWorldScene,125);
  assert.deepEqual(coverage.sourcePositiveByOriginalArea,
    DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS);
  assert.deepEqual(coverage.byOriginalNativeCategory,
    DB01_FIVE_CATEGORY_SOURCE_COUNTS);
  assert.equal(coverage.nativeAllAreasDefaultVerified,false);
  assert.equal(coverage.runtimeCritterSceneResolved,false);
  assert.equal(coverage.gameCollectionUiMembershipVerified,false);
  assert.equal(coverage.playerOwnershipVerified,false);
  assert.equal(await api.getCoverage(),coverage);
  assert.equal(f.calls.coverage,2);
});

test('two source readers globally merge 9615 original IDs in ascending order with deep pagination',async()=>{
  const api=client(fake());
  const queries=[
    {areaCodes:[0],offset:0,limit:0},
    {areaCodes:[0],offset:0,limit:30},
    {areaCodes:[0],offset:120,limit:300},
    {areaCodes:[0],offset:350,limit:1000},
    {areaCodes:[0],offset:3200,limit:100},
    {areaCodes:[0],offset:9600,limit:30},
    {areaCodes:[0],offset:10000,limit:40},
    {areaCodes:[1],offset:10,limit:50},
    {areaCodes:[4,4097],offset:400,limit:80},
    {areaCodes:[2,3,5],offset:100,limit:100},
  ];
  for(const query of queries){
    const candidates=sorted.filter(row=>
      query.areaCodes.includes(0)||
      row.codes?.some(code=>query.areaCodes.includes(code)));
    const expected=candidates.slice(query.offset,query.offset+query.limit)
      .map(row=>row.id);
    const actual=await api.search(query);
    assert.equal(actual.total,candidates.length,JSON.stringify(query));
    assert.deepEqual(actual.itemIds,expected,JSON.stringify(query));
    assert.equal(actual.hasMore,
      candidates.length>query.offset+expected.length);
    assert.equal(actual.nativeAllAreasDefaultVerified,false);
    assert.equal(actual.gameCollectionUiMembershipVerified,false);
    assert.equal(actual.dlcEntitlementVerified,false);
    assert.equal(actual.playerOwnershipVerified,false);
    assert.equal(actual.selectedCritterSceneCandidatesUnresolved,
      !query.areaCodes.includes(0));
    assert.ok(Object.isFrozen(actual.itemIds));
  }
  assert.equal((await api.search()).total,9615);
});

test('Companion-only / Critter-only category and positive tag searches keep unknown semantics',async()=>{
  const f=fake(),api=client(f);
  const all=await api.search({nativeCategories:['Companion']});
  assert.equal(all.total,394);
  assert.equal(all.allAreasMeansUnfilteredOriginalSource,true);
  assert.equal(f.calls.fourSearch.length,0);
  const critters=await api.search({
    nativeCategories:['Companion'],companionKinds:['critter'],
    areaCodes:[0],
  });
  assert.equal(critters.total,125);
  assert.equal(critters.selectedCritterSceneCandidatesUnresolved,false);
  const critterPositive=await api.search({
    nativeCategories:['Companion'],companionKinds:['critter'],
    areaCodes:[1],
  });
  assert.equal(critterPositive.total,0);
  assert.equal(critterPositive.selectedCritterSceneCandidatesUnresolved,true);
  const knownTagged=await api.search({
    nativeCategories:['Companion'],areaCodes:[1,2,3,4,5,4097],
  });
  assert.equal(knownTagged.total,246);
  assert.equal(knownTagged.selectedCritterSceneCandidatesUnresolved,true);
  const noCritters=await api.search({
    nativeCategories:['Companion'],companionKinds:['pet','mount'],
    areaCodes:[1,2,3,4,5,4097],
  });
  assert.equal(noCritters.total,246);
  assert.equal(noCritters.selectedCritterSceneCandidatesUnresolved,false);
  const noCompanion=await api.search({
    nativeCategories:['Furniture'],areaCodes:[0],limit:0,
  });
  assert.equal(noCompanion.total,6746);
  assert.equal(f.calls.companionSearch.length,9);
  const none=await api.search({nativeCategories:[]});
  assert.equal(none.total,0);
  assert.deepEqual(none.itemIds,[]);
});

test('invalid enum, mixed AllAreas or companion kind on unselected source fail closed before loading',async()=>{
  const f=fake(),api=client(f);
  for(const query of [
    {nativeCategories:['ActivityItem']},
    {nativeCategories:['Furniture','Furniture']},
    {nativeCategories:['Furniture'],companionKinds:['critter']},
    {companionKinds:['mount','mount']},
    {companionKinds:['Cat']},
    {areaCodes:[0,1]},
    {areaCodes:[6]},
    {areaCodes:[2001200028]},
    {areaCodes:[]},
    {areaCodes:[1,1]},
    {offset:-1},
    {limit:-1},
    {limit:1001},
  ]){
    await assert.rejects(api.search(query),/DB01_FIVE_NATIVE_AREA_/);
  }
  assert.equal(f.calls.fourSearch.length,0);
  assert.equal(f.calls.companionSearch.length,0);
});

test('cross-source item collisions and forged Critter Tags do not pass',async()=>{
  const f=fake(),api=client(f);
  const id=rows.companion[269].id;
  const native=f.companion.getItem;
  f.companion.getItem=async key=>{
    const result=await native(key);
    return key===id?{
      ...result,positiveNativeAreaCodes:[],
    }:result;
  };
  await assert.rejects(api.getItem(id),
    /DB01_FIVE_NATIVE_AREA_CRITTER_NULL_IS_NOT_NATIVE_HAS_TAG_FALSE/);
  const g=fake(),api2=client(g);
  const other=g.four.getItem;
  g.four.getItem=async key=>key===rows.companion[0].id?{
    itemId:key,originalNativeCategory:'Furniture',
    originalNativeClass:'FurnitureItemData',
    positiveAreaCodes:[1],
    sourceOriginalIHasTagsAndSetSemanticsVerified:true,
    allAreasNativeDefaultPredicateVerified:false,
    gameCollectionUiMembershipVerified:false,
    worldAvailabilityVerified:false,
    playerOwnershipVerified:false,
    dlcEntitlementVerified:false,
  }:other(key);
  await assert.rejects(api2.getItem(rows.companion[0].id),
    /DB01_FIVE_NATIVE_AREA_DUPLICATE_CROSS_SOURCE_ITEM_ID/);
});

test('tampered original coverage, out-of-order source IDs and unsupported version reject',async()=>{
  const f=fake();
  const old=f.companion.getCoverage;
  f.companion.getCoverage=async()=>({
    ...await old(),sourceCritterRuntimeWorldUnknown:124,
  });
  await assert.rejects(client(f).getCoverage(),
    /DB01_FIVE_NATIVE_AREA_ORIGINAL_SOURCE_COUNT_OR_EVIDENCE_DRIFT/);
  f.companion.gameVersion='1.25.0';
  assert.throws(()=>client(f),/DB01_FIVE_NATIVE_AREA_PINNED_READERS_REQUIRED/);

  const g=fake(),api=client(g);
  const original=g.companion.search;
  g.companion.search=async q=>{
    const result=await original(q);
    return q.limit>0&&result.itemIds.length>1?{
      ...result,itemIds:[result.itemIds[1],result.itemIds[0],
        ...result.itemIds.slice(2)],
    }:result;
  };
  await assert.rejects(api.search({areaCodes:[0],limit:10}),
    /DB01_FIVE_NATIVE_AREA_CORRUPT_OR_UNSORTED_ORIGINAL_SOURCE_PAGE/);
});
