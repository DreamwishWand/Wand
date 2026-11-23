import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA,
  DB01_FIVE_CATEGORY_SOURCE_COUNTS,
  DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS,
} from './native-positive-area-five-categories.ts';
import {
  DB01_ORIGINAL_SKIN_NATIVE_SCHEMA,
  DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS,
  DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS,
} from './skin-native-subtypes.ts';
import {
  createDb01SixCategorySourceClient,
  DB01_SIX_CATEGORY_NATIVE_AREA_SCHEMA,
  DB01_SIX_CATEGORY_SOURCE_COUNTS,
  DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS,
  DB01_SIX_CATEGORY_TOTAL,
  DB01_SIX_CATEGORY_POSITIVE,
  DB01_SIX_CATEGORY_HAS_TAGS_NO_POSITIVE,
  DB01_SIX_CATEGORY_NO_IHAS_TAGS,
  DB01_SIX_CATEGORY_CRITTER_SCENE_UNKNOWN,
} from './native-positive-area-six-categories.ts';

const CODES=[1,2,3,4,5,4097];
const codeCounts=Object.entries(DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS)
  .flatMap(([code,count])=>Array(count).fill(Number(code)));
const skinCodes=Object.entries(DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS)
  .flatMap(([code,count])=>Array(count).fill(Number(code)));
const rowsFive=[];
for(const [category,count] of Object.entries(DB01_FIVE_CATEGORY_SOURCE_COUNTS)){
  for(let i=0;i<count;i++){
    const index=rowsFive.length;
    const critter=category==='Companion'&&i>=269;
    const codes=critter?null:index<8955?[codeCounts[index]]:[];
    rowsFive.push({
      id:400_000_000+index*2,
      nativeCategory:category,
      originalNativeClass:category+'ItemData',
      companionKind:category==='Companion'?
        critter?'critter':i>=241?'mount':'pet':null,
      positiveAreaCodes:codes,
      sourceAreaEvidence:critter?'requires_profile_world_scene':
        codes.length?'native_positive_tag':
          'native_ihastags_without_positive_tag',
      critterLocationOneofFieldNumber:critter?(i<374?6:7):null,
    });
  }
}
const rowsSkin=[];
for(const [cls,layout] of Object.entries(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS)){
  for(let i=0;i<layout.count;i++){
    const idx=rowsSkin.length;
    const code=skinCodes[idx]??null;
    const absent=layout.tagsFieldNumber===null;
    rowsSkin.push({
      id:400_000_001+idx*2,nativeCategory:'Skin',
      class:cls,codes:absent?null:code===null?[]:[code],
      state:absent?'not_ihas_tags':
        code===null?'no_positive_native_tag':'positive_native_tag',
      hasTags:!absent,
    });
  }
}
assert.equal(rowsFive.length,9615);
assert.equal(rowsSkin.length,163);
assert.equal(rowsFive.filter(x=>x.positiveAreaCodes?.length).length,8955);
assert.equal(rowsSkin.filter(x=>x.codes?.length).length,21);
assert.equal(rowsSkin.filter(x=>x.codes===null).length,4);
const byFive=new Map(rowsFive.map(x=>[x.id,x]));
const bySkin=new Map(rowsSkin.map(x=>[x.id,x]));
const all=[...rowsFive,...rowsSkin].sort((a,b)=>a.id-b.id);
function page(rows,criteria,offset,limit){
  const found=rows.filter(criteria);
  return Object.freeze({
    itemIds:found.slice(offset,offset+limit).map(x=>x.id),
    total:found.length,hasMore:found.length>offset+limit,
  });
}
const hasArea=(codes,areas)=>areas.includes(0)||
  codes?.some(code=>areas.includes(code))===true;

function fake(){
  const calls={five:[],skin:[],fiveCoverage:0,skinCoverage:0,
    fiveItemIds:[],skinBatchIds:[]};
  const five={
    schema:DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA,gameVersion:'1.26.2',
    async getItem(id){
      calls.fiveItemIds.push(id);
      const item=byFive.get(id);
      return item?{
        ...item,itemId:id,
        originalSourceVerified:true,
        critterRuntimeProfileSceneResolved:false,
        nativeAllAreasDefaultVerified:false,
        gameCollectionUiMembershipVerified:false,
        worldAvailabilityVerified:false,
        playerOwnershipVerified:false,
        dlcEntitlementVerified:false,
      }:null;
    },
    async getCoverage(){
      calls.fiveCoverage++;
      return {
        sourceDefinitions:9615,sourcePositiveNativeAreaItems:8955,
        sourceIHasTagsWithoutPositiveArea:535,
        sourceCritterNeedsProfileWorldScene:125,
        byOriginalNativeCategory:DB01_FIVE_CATEGORY_SOURCE_COUNTS,
        sourcePositiveByOriginalArea:DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS,
        gameCollectionUiMembershipVerified:false,
        nativeAllAreasDefaultVerified:false,
      };
    },
    async search(q){
      calls.five.push(q);
      return {
        ...page(rowsFive,x=>
          q.nativeCategories.includes(x.nativeCategory)&&
          (x.companionKind===null||
            (q.companionKinds??['pet','mount','critter'])
              .includes(x.companionKind))&&
          hasArea(x.positiveAreaCodes,q.areaCodes),
          q.offset,q.limit),
        originalSourceAreaSearchOnly:true,
        selectedCritterSceneCandidatesUnresolved:
          q.areaCodes[0]!==0&&q.nativeCategories.includes('Companion')&&
          (q.companionKinds??['pet','mount','critter']).includes('critter'),
        gameCollectionUiMembershipVerified:false,
        nativeAllAreasDefaultVerified:false,
        playerOwnershipVerified:false,
        dlcEntitlementVerified:false,
      };
    },
  };
  const skin={
    schema:DB01_ORIGINAL_SKIN_NATIVE_SCHEMA,gameVersion:'1.26.2',
    async getItem(id){
      const item=bySkin.get(id);
      return item?{
        source:{
          itemId:id,nativeCategory:'Skin',
          sourceProtobufClass:item.class,
          sourceSubtypeLayoutVerified:true,
          nativeRuntimeObjectTypeIndependentlyVerified:false,
          originalIHasTagsInterface:item.hasTags,
        },
        positiveNativeAreaCodes:item.codes,
        sourceNativeTagState:item.state,
        originalSourceHashVerified:true,
        originalSourceLayoutVerified:true,
        runtimeNativeClassIndependentlyVerified:false,
        gameCollectionUiMembershipVerified:false,
        nativeAllAreasDefaultVerified:false,
        playerOwnershipVerified:false,
        dlcEntitlementVerified:false,
      }:null;
    },
    async getItems(ids){
      calls.skinBatchIds.push([...ids]);
      return Promise.all(ids.map(id=>skin.getItem(id)));
    },
    async getCoverage(){
      calls.skinCoverage++;
      return {
        originalSourceDefinitions:163,
        sourceWithPositiveAreaTag:21,
        sourceIHasTagsWithoutPositiveArea:138,
        sourceWithoutIHasTagsInterface:4,
        originalSubtypeCounts:Object.fromEntries(
          Object.entries(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS)
            .map(([key,value])=>[key,value.count])),
        sourcePositiveAreasByCode:DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS,
        nativeSourceLayoutVerified:true,
        nativeRuntimeClassIndependentlyVerified:false,
        gameCollectionUiMembershipVerified:false,
        allAreasNativeDefaultVerified:false,
      };
    },
    async search(q){
      calls.skin.push(q);
      return {
        ...page(rowsSkin,x=>
          q.sourceProtobufClasses.includes(x.class)&&
          hasArea(x.codes,q.areaCodes),q.offset,q.limit),
        originalSourceOnly:true,
        untaggedClassesExcludedOnlyFromPositiveTagQuery:true,
        gameCollectionUiMembershipVerified:false,
        allAreasNativeDefaultVerified:false,
        playerOwnershipVerified:false,
        dlcEntitlementVerified:false,
      };
    },
  };
  return {five,skin,calls};
}
const api=f=>createDb01SixCategorySourceClient(f.five,f.skin);

test('six verified original domains retain tri-state source census',async()=>{
  assert.equal(DB01_SIX_CATEGORY_NATIVE_AREA_SCHEMA,
    'wand.db01.native-positive-area-six-category-steam-1262@1');
  assert.equal(DB01_SIX_CATEGORY_TOTAL,9778);
  assert.equal(DB01_SIX_CATEGORY_POSITIVE,8976);
  assert.equal(DB01_SIX_CATEGORY_HAS_TAGS_NO_POSITIVE,673);
  assert.equal(DB01_SIX_CATEGORY_NO_IHAS_TAGS,4);
  assert.equal(DB01_SIX_CATEGORY_CRITTER_SCENE_UNKNOWN,125);
  assert.equal(8976+673+4+125,9778);
  assert.deepEqual(DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS,{
    1:6630,2:476,3:488,4:479,5:634,4097:269,
  });
  assert.equal(DB01_SIX_CATEGORY_SOURCE_COUNTS.Skin,163);
  const f=fake(),reader=api(f);
  const coverage=await reader.getCoverage();
  assert.equal(coverage.sourceDefinitions,9778);
  assert.equal(coverage.sourcePositiveAreaItems,8976);
  assert.equal(coverage.sourceWithoutIHasTags,4);
  assert.equal(coverage.critterSceneUnresolved,125);
  assert.equal(coverage.nativeAllAreasDefaultVerified,false);
  assert.equal(coverage.gameCollectionUiMembershipVerified,false);
  assert.equal(coverage.runtimeSkinClassIndependentlyVerified,false);
  assert.equal(await reader.getCoverage(),coverage);
  assert.equal(f.calls.fiveCoverage,1);
  assert.equal(f.calls.skinCoverage,1);
});

test('Skin missing interface is not a genuine negative tag or a resolved Critter scene',async()=>{
  const reader=api(fake());
  const positive=await reader.getItem(rowsSkin[0].id);
  assert.equal(positive.nativeCategory,'Skin');
  assert.equal(positive.sourceAreaEvidence,'native_positive_tag');
  assert.deepEqual(positive.positiveAreaCodes,[1]);
  const absentRow=rowsSkin.find(x=>x.codes===null);
  const absent=await reader.getItem(absentRow.id);
  assert.equal(absent.sourceAreaEvidence,'original_interface_absent');
  assert.equal(absent.positiveAreaCodes,null);
  assert.equal(absent.runtimeSkinClassIndependentlyVerified,false);
  const noMatch=await reader.getItem(rowsSkin[50].id);
  assert.equal(noMatch.sourceAreaEvidence,
    'native_ihastags_without_positive_tag');
  assert.deepEqual(noMatch.positiveAreaCodes,[]);
  const critter=await reader.getItem(rowsFive.at(-1).id);
  assert.equal(critter.sourceAreaEvidence,'requires_profile_world_scene');
  assert.equal(critter.positiveAreaCodes,null);
  assert.equal(critter.critterLocationOneofFieldNumber,7);
  assert.equal(critter.runtimeCritterSceneResolved,false);
  assert.equal(await reader.getItem(99999999),null);
  assert.ok(Object.isFrozen(absent));
  await assert.rejects(reader.getItem(0),/DB01_SIX_NATIVE_AREA_INVALID_ITEM_ID/);
});

test('sorted six-domain source pages retain source identity over deep offsets',async()=>{
  const reader=api(fake());
  for(const query of [
    {areaCodes:[0],offset:0,limit:0},
    {areaCodes:[0],offset:0,limit:60},
    {areaCodes:[0],offset:500,limit:300},
    {areaCodes:[0],offset:9600,limit:300},
    {areaCodes:[0],offset:15000,limit:100},
    {areaCodes:[1],offset:0,limit:100},
    {areaCodes:[4,4097],offset:110,limit:100},
  ]){
    const matched=all.filter(x=>hasArea(
      x.nativeCategory==='Skin'?x.codes:x.positiveAreaCodes,
      query.areaCodes));
    const expected=matched.slice(query.offset,query.offset+query.limit)
      .map(x=>x.id);
    const p=await reader.search(query);
    assert.equal(p.total,matched.length,JSON.stringify(query));
    assert.deepEqual(p.itemIds,expected,JSON.stringify(query));
    assert.equal(p.hasMore,matched.length>query.offset+expected.length);
    assert.equal(p.selectedCritterScenesUnresolved,query.areaCodes[0]!==0);
    assert.equal(p.selectedSkinWithoutIHasTagsUnresolved,
      query.areaCodes[0]!==0);
    assert.equal(p.allAreasMeansUnfilteredOriginalSource,
      query.areaCodes[0]===0);
    assert.equal(p.gameCollectionUiMembershipVerified,false);
    assert.ok(Object.isFrozen(p.itemIds));
  }
  assert.equal((await reader.search()).total,9778);
});

test('category, subtype and positive area filters preserve unknown semantics',async()=>{
  const f=fake(),reader=api(f);
  const skin=await reader.search({nativeCategories:['Skin']});
  assert.equal(skin.total,163);
  assert.equal(f.calls.five.length,0);
  const positive=await reader.search({
    nativeCategories:['Skin'],areaCodes:CODES,
  });
  assert.equal(positive.total,21);
  assert.equal(positive.selectedSkinWithoutIHasTagsUnresolved,true);
  const onlyHouse=await reader.search({
    nativeCategories:['Skin'],
    skinSourceProtobufClasses:['HouseSkinItemData'],
    areaCodes:CODES,
  });
  assert.equal(onlyHouse.selectedSkinWithoutIHasTagsUnresolved,false);
  const withoutTags=await reader.search({
    nativeCategories:['Skin'],
    skinSourceProtobufClasses:['BoatSkinItemData','MountSkinItemData'],
    areaCodes:[0],
  });
  assert.equal(withoutTags.total,4);
  assert.equal(withoutTags.selectedSkinWithoutIHasTagsUnresolved,false);
  const filtered=await reader.search({
    nativeCategories:['Companion'],companionKinds:['critter'],
    areaCodes:[1],
  });
  assert.equal(filtered.total,0);
  assert.equal(filtered.selectedCritterScenesUnresolved,true);
  const unfiltered=await reader.search({
    nativeCategories:['Companion'],companionKinds:['critter'],
  });
  assert.equal(unfiltered.total,125);
  assert.equal(unfiltered.selectedCritterScenesUnresolved,false);
  const none=await reader.search({nativeCategories:[]});
  assert.equal(none.total,0);
  assert.deepEqual(none.itemIds,[]);
});

test('bad input, forged proof, count drift and duplicate cross-source ID fail closed',async()=>{
  const f=fake(),reader=api(f);
  for(const bad of [
    {nativeCategories:['Skin','Skin']},
    {nativeCategories:['Other']},
    {nativeCategories:['Skin'],companionKinds:['critter']},
    {nativeCategories:['Furniture'],
      skinSourceProtobufClasses:['HouseSkinItemData']},
    {skinSourceProtobufClasses:['MountSkinItemData','MountSkinItemData']},
    {areaCodes:[0,1]},{areaCodes:[1,1]},{areaCodes:[]},
    {areaCodes:[2,6]},{offset:-1},{limit:1001},
  ])await assert.rejects(reader.search(bad),/DB01_SIX_NATIVE_AREA_/);
  assert.equal(f.calls.five.length,0);
  assert.equal(f.calls.skin.length,0);
  const row=rowsSkin.find(x=>x.codes===null);
  const original=f.skin.getItem;
  f.skin.getItem=async id=>{
    const result=await original(id);
    return id===row.id?{...result,
      positiveNativeAreaCodes:[],
      sourceNativeTagState:'no_positive_native_tag'}:result;
  };
  await assert.rejects(reader.getItem(row.id),
    /DB01_SIX_NATIVE_AREA_SKIN_INTERFACE_OR_EVIDENCE_DRIFT/);

  const g=fake();
  const native=g.skin.getCoverage;
  g.skin.getCoverage=async()=>({
    ...await native(),sourceWithoutIHasTagsInterface:3,
  });
  await assert.rejects(api(g).getCoverage(),
    /DB01_SIX_NATIVE_AREA_ORIGINAL_SOURCE_CENSUS_DRIFT/);
  const h=fake();
  const search=h.skin.search;
  h.skin.search=async q=>{
    const p=await search(q);
    return q.limit>0&&p.itemIds.length>1?
      {...p,itemIds:[p.itemIds[1],p.itemIds[0],
        ...p.itemIds.slice(2)]}:p;
  };
  await assert.rejects(api(h).search({limit:100}),
    /DB01_SIX_NATIVE_AREA_CORRUPT_OR_UNSORTED_SOURCE_PAGE/);
  const i=fake(),lookup=i.skin.getItem;
  i.skin.getItem=async id=>id===rowsFive[0].id?
    {...await lookup(rowsSkin[0].id),
      source:{...(await lookup(rowsSkin[0].id)).source,itemId:id}}:
    lookup(id);
  await assert.rejects(api(i).getItem(rowsFive[0].id),
    /DB01_SIX_NATIVE_AREA_CROSS_SOURCE_ID_COLLISION/);
  i.skin.gameVersion='1.25.0';
  assert.throws(()=>api(i),/DB01_SIX_NATIVE_AREA_PINNED_READERS_REQUIRED/);
});

test('batch keeps 4,096-ID limit, original order, duplicates and source tri-state',async()=>{
  const f=fake(),reader=api(f);
  assert.deepEqual(await reader.getItems([]),[]);
  assert.deepEqual(f.calls.skinBatchIds,[]);
  const skinMissing=rowsSkin.find(x=>x.codes===null);
  const ids=[
    rowsFive[0].id,rowsSkin[0].id,rowsFive.at(-1).id,
    skinMissing.id,rowsSkin.at(-1).id,rowsFive[0].id,99999999,
  ];
  const result=await reader.getItems(ids);
  assert.equal(result.length,ids.length);
  assert.equal(result[0].nativeCategory,'Furniture');
  assert.equal(result[1].nativeCategory,'Skin');
  assert.equal(result[2].sourceAreaEvidence,'requires_profile_world_scene');
  assert.equal(result[3].sourceAreaEvidence,'original_interface_absent');
  assert.equal(result[3].positiveAreaCodes,null);
  assert.strictEqual(result[0],result[5]);
  assert.equal(result[6],null);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(f.calls.skinBatchIds,[ids.slice(0,5).concat(ids[6])]);
  assert.deepEqual(f.calls.fiveItemIds,ids.slice(0,5).concat(ids[6]));
  for(const id of ids.slice(0,5)){
    const serial=await reader.getItem(id);
    assert.deepEqual(result[ids.indexOf(id)],serial);
  }
});

test('batch validates input before touching original readers',async()=>{
  const f=fake(),reader=api(f);
  for(const ids of [null,'1',[0],[-1],[2.1],[Infinity],
    Array(4097).fill(rowsFive[0].id)]){
    await assert.rejects(reader.getItems(ids),
      /DB01_SIX_NATIVE_AREA_INVALID_ITEM_BATCH/);
  }
  assert.deepEqual(f.calls.fiveItemIds,[]);
  assert.deepEqual(f.calls.skinBatchIds,[]);
});

test('batch keeps at most sixteen concurrent five-source Item reads',async()=>{
  const f=fake();
  let concurrent=0,peak=0;
  const original=f.five.getItem;
  f.five.getItem=async id=>{
    concurrent++;
    peak=Math.max(peak,concurrent);
    await Promise.resolve();
    const value=await original(id);
    concurrent--;
    return value;
  };
  const apiBatch=api(f);
  const ids=rowsFive.slice(0,150).map(x=>x.id);
  const result=await apiBatch.getItems(ids);
  assert.equal(result.length,150);
  assert.equal(peak,16);
  assert.equal(concurrent,0);
  assert.equal(f.calls.fiveItemIds.length,150);
  assert.equal(f.calls.skinBatchIds.length,1);
});

test('batch rejects incomplete Skin responses, mismatched source identities and collisions',async()=>{
  const f=fake();
  f.skin.getItems=async()=>[];
  await assert.rejects(api(f).getItems([rowsFive[0].id]),
    /DB01_SIX_NATIVE_AREA_SKIN_BATCH_RESULT_LENGTH/);
  const g=fake();
  const original=g.skin.getItems;
  g.skin.getItems=async ids=>{
    const rows=await original(ids);
    return rows.map((row,i)=>i===0?{
      ...await g.skin.getItem(rowsSkin[0].id),
      source:{...(await g.skin.getItem(rowsSkin[0].id)).source,itemId:ids[i]},
    }:row);
  };
  await assert.rejects(api(g).getItems([rowsFive[0].id]),
    /DB01_SIX_NATIVE_AREA_CROSS_SOURCE_ID_COLLISION/);
  const h=fake();
  h.skin.getItems=async ids=>ids.map(()=>({
    source:{itemId:rowsSkin[0].id,nativeCategory:'Skin'},
    positiveNativeAreaCodes:[],
  }));
  await assert.rejects(api(h).getItems([rowsSkin[0].id]),
    /DB01_SIX_NATIVE_AREA_SKIN_INTERFACE_OR_EVIDENCE_DRIFT/);
});
