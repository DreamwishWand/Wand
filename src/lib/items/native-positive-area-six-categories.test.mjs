import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB01_SIX_CATEGORY_SOURCE_SCHEMA,
  DB01_SIX_CATEGORY_SOURCE_COUNTS,
  DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS,
  DB01_SIX_CATEGORY_TOTAL,
  DB01_SIX_CATEGORY_NATIVE_POSITIVE,
  DB01_SIX_CATEGORY_NATIVE_NO_POSITIVE,
  DB01_SIX_CATEGORY_PROFILE_SCENE_UNRESOLVED,
  DB01_SIX_CATEGORY_NO_IHASTAGS,
  createDb01SixSourceClient,
} from './native-positive-area-six-categories.ts';
import {
  DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA,
  DB01_FIVE_CATEGORY_SOURCE_COUNTS,
  DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS,
} from './native-positive-area-five-categories.ts';
import {
  DB01_ORIGINAL_SKIN_NATIVE_SCHEMA,
  DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS,
  DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS,
} from './skin-native-subtypes.ts';

const bands=[1,2,3,4,5,4097];
const source={
  Furniture:{1:4315,2:434,3:422,4:431,5:478,4097:223,none:443},
  Clothing:{1:1792,2:19,3:42,4:25,5:132,4097:31},
  Trimming:{1:348,2:0,3:5,4:3,5:5,4097:4},
  Makeup:{none:69},
};
const skinPositive={
  1700:{1:5,2:3,3:1,4:1,4097:7},
  1702:{3:2,5:2},
};
function seed(){
  const skin=[];
  for(const [cls,layout] of Object.entries(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS)){
    const world=[];
    for(const [code,num] of Object.entries(skinPositive[layout.sourceIdBand]??{})){
      world.push(...new Array(num).fill(Number(code)));
    }
    for(let i=0;i<layout.count;i++){
      const id=layout.sourceIdBand*100000+i;
      skin.push({
        id,cls,band:layout.sourceIdBand,
        code:layout.tagsFieldNumber===null?null:(world[i]??[]),
      });
    }
  }
  assert.equal(skin.length,163);
  const used=new Set(skin.map(x=>x.id));
  const five=[];
  let next=170000000;
  function push(category,cls,kind,code){
    while(used.has(next))next++;
    const id=next;
    used.add(id);
    five.push({id,category,cls,kind,code});
    next+=47;
  }
  for(const [cat,distribution] of Object.entries(source)){
    for(const [code,count] of Object.entries(distribution)){
      for(let i=0;i<count;i++){
        push(cat,cat+'ItemData',null,
          code==='none'?[]:[Number(code)]);
      }
    }
  }
  for(const [code,count] of Object.entries({
    1:170,2:20,3:16,4:14,5:17,4097:4,
  })){
    for(let i=0;i<count;i++){
      push('Companion','PetItemData','pet',[Number(code)]);
    }
  }
  for(let i=0;i<28;i++){
    push('Companion','MountItemData','mount',i<5?[4]:[]);
  }
  for(let i=0;i<125;i++){
    push('Companion','CritterItemData','critter',null);
  }
  assert.equal(five.length,9615);
  const mapFive=new Map(five.map(x=>[x.id,x]));
  const mapSkin=new Map(skin.map(x=>[x.id,x]));
  return {five,skin,mapFive,mapSkin};
}
const data=seed();
const all=[...data.five,...data.skin].sort((a,b)=>a.id-b.id);
const getPage=(rows,fn,offset,limit)=>{
  const filtered=rows.filter(fn);
  return {
    total:filtered.length,
    itemIds:filtered.slice(offset,offset+limit).map(x=>x.id),
    hasMore:filtered.length>offset+limit,
  };
};
function mock(){
  const calls={f:[],s:[],cover:0};
  const five={
    schema:DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA,gameVersion:'1.26.2',
    async getItem(id){
      const row=data.mapFive.get(id);
      return row?{
        itemId:id,nativeCategory:row.category,
        originalNativeClass:row.cls,companionKind:row.kind,
        positiveAreaCodes:row.code,
        sourceAreaEvidence:row.code===null?
          'requires_profile_world_scene':
          row.code.length>0?'native_positive_tag':
            'native_ihastags_without_positive_tag',
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
      calls.cover++;
      return {
        gameVersion:'1.26.2',sourceDefinitions:9615,
        sourcePositiveNativeAreaItems:8955,
        sourceIHasTagsWithoutPositiveArea:535,
        sourceCritterNeedsProfileWorldScene:125,
        byOriginalNativeCategory:DB01_FIVE_CATEGORY_SOURCE_COUNTS,
        sourcePositiveByOriginalArea:
          DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS,
        nativeAllAreasDefaultVerified:false,
        runtimeCritterSceneResolved:false,
        gameCollectionUiMembershipVerified:false,
      };
    },
    async search(q){
      calls.f.push(q);
      return {
        ...getPage(data.five,row=>
          q.nativeCategories.includes(row.category)&&
          (row.kind===null||q.companionKinds.includes(row.kind))&&
          (q.areaCodes.includes(0)||
            row.code?.some(code=>q.areaCodes.includes(code))),
        q.offset,q.limit),
        originalSourceAreaSearchOnly:true,
        nativeAllAreasDefaultVerified:false,
        gameCollectionUiMembershipVerified:false,
        playerOwnershipVerified:false,
        dlcEntitlementVerified:false,
      };
    },
  };
  const skin={
    schema:DB01_ORIGINAL_SKIN_NATIVE_SCHEMA,gameVersion:'1.26.2',
    async getItem(id){
      const row=data.mapSkin.get(id);
      return row?{
        source:{
          itemId:id,sourceIdBand:row.band,
          sourceProtobufClass:row.cls,
        },
        positiveNativeAreaCodes:row.code===null?
          null:typeof row.code==='number'?[row.code]:[],
        sourceNativeTagState:row.code===null?
          'not_ihas_tags':
          typeof row.code==='number'?
            'positive_native_tag':'no_positive_native_tag',
        originalSourceHashVerified:true,
        originalSourceLayoutVerified:true,
        runtimeNativeClassIndependentlyVerified:false,
        nativeAllAreasDefaultVerified:false,
        gameCollectionUiMembershipVerified:false,
        playerOwnershipVerified:false,
        dlcEntitlementVerified:false,
      }:null;
    },
    async getCoverage(){
      calls.cover++;
      return {
        originalSourceDefinitions:163,
        sourceWithDirectTags:71,
        sourceWithPositiveAreaTag:21,
        sourceIHasTagsWithoutPositiveArea:138,
        sourceWithoutIHasTagsInterface:4,
        sourcePositiveAreasByCode:
          DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS,
        nativeSourceLayoutVerified:true,
        nativeRuntimeClassIndependentlyVerified:false,
        gameCollectionUiMembershipVerified:false,
        allAreasNativeDefaultVerified:false,
      };
    },
    async search(q){
      calls.s.push(q);
      return {
        ...getPage(data.skin,row=>
          q.sourceProtobufClasses.includes(row.cls)&&
          (q.areaCodes.includes(0)||
            (typeof row.code==='number'&&
              q.areaCodes.includes(row.code))),
        q.offset,q.limit),
        originalSourceOnly:true,
        untaggedClassesExcludedOnlyFromPositiveTagQuery:true,
        allAreasNativeDefaultVerified:false,
        gameCollectionUiMembershipVerified:false,
        playerOwnershipVerified:false,
        dlcEntitlementVerified:false,
      };
    },
  };
  return {five,skin,calls};
}
const create=f=>createDb01SixSourceClient(f.five,f.skin);

test('six original source categories total 9778, with exact four independently distinct areas states',()=>{
  assert.equal(DB01_SIX_CATEGORY_TOTAL,9778);
  assert.equal(DB01_SIX_CATEGORY_NATIVE_POSITIVE,8976);
  assert.equal(DB01_SIX_CATEGORY_NATIVE_NO_POSITIVE,673);
  assert.equal(DB01_SIX_CATEGORY_PROFILE_SCENE_UNRESOLVED,125);
  assert.equal(DB01_SIX_CATEGORY_NO_IHASTAGS,4);
  assert.deepEqual(DB01_SIX_CATEGORY_SOURCE_COUNTS,{
    Furniture:6746,Clothing:2041,Trimming:365,Makeup:69,
    Companion:394,Skin:163,
  });
  assert.deepEqual(DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS,
    {1:6630,2:476,3:488,4:479,5:634,4097:269});
  assert.equal(8976+673+125+4,9778);
});

test('per-item distinguishes Skin non-IHasTags from Critter runtime scene from evaluated negative',async()=>{
  const f=mock(),api=create(f);
  const skinMount=data.skin.find(x=>x.cls==='MountSkinItemData');
  const skinBoat=data.skin.find(x=>x.cls==='BoatSkinItemData');
  const skinCharacter=data.skin.find(x=>x.cls==='CharacterSkinItemData');
  const skinNoPositive=data.skin.find(x=>
    x.cls==='CharacterSkinItemData'&&Array.isArray(x.code));
  const critter=data.five.find(x=>x.kind==='critter');
  const mount=data.five.find(x=>x.kind==='mount'&&
    x.code.length===0);
  const a=await api.getItem(skinMount.id);
  const b=await api.getItem(skinBoat.id);
  const c=await api.getItem(critter.id);
  const d=await api.getItem(mount.id);
  const e=await api.getItem(skinCharacter.id);
  const x=await api.getItem(skinNoPositive.id);
  assert.equal(api.schema,DB01_SIX_CATEGORY_SOURCE_SCHEMA);
  assert.equal(a.nativeCategory,'Skin');
  assert.equal(a.areaEvidence,'original_class_without_ihastags');
  assert.equal(b.areaEvidence,'original_class_without_ihastags');
  assert.equal(a.positiveAreaCodes,null);
  assert.equal(a.skinSourceIdBand,1704);
  assert.equal(a.runtimeNativeObjectTypeIndependentlyVerified,false);
  assert.equal(c.areaEvidence,'requires_profile_world_scene');
  assert.equal(c.positiveAreaCodes,null);
  assert.equal(d.areaEvidence,'native_ihastags_without_positive_tag');
  assert.deepEqual(d.positiveAreaCodes,[]);
  assert.equal(e.areaEvidence,'native_positive_tag');
  assert.deepEqual(e.positiveAreaCodes,[1]);
  assert.equal(x.originalSourceVerified,true);
  assert.equal(a.gameCollectionUiMembershipVerified,false);
  assert.equal(a.playerOwnershipVerified,false);
  assert.equal(a.dlcEntitlementVerified,false);
  assert.equal(Object.isFrozen(a),true);
  assert.equal(await api.getItem(1),null);
  await assert.rejects(api.getItem(0),/DB01_SIX_SOURCE_INVALID_ITEM_ID/);
});

test('original SHA-indexed subsource census validates all 9778 items and six areas',async()=>{
  const f=mock(),api=create(f);
  const report=await api.getCoverage();
  assert.equal(report.originalSourceDefinitions,9778);
  assert.equal(report.sourcePositiveNativeAreaItems,8976);
  assert.equal(report.sourceIHasTagsWithoutPositiveArea,673);
  assert.equal(report.sourceCritterRuntimeSceneRequired,125);
  assert.equal(report.sourceSkinWithoutIHasTags,4);
  assert.deepEqual(report.sourcePositiveByArea,
    DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS);
  assert.deepEqual(report.originalNativeCategoryCounts,
    DB01_SIX_CATEGORY_SOURCE_COUNTS);
  assert.equal(report.originalAllAreasNativeDefaultVerified,false);
  assert.equal(report.runtimeCritterProfileSceneResolved,false);
  assert.equal(report.gameCollectionUiMembershipVerified,false);
  assert.equal(report.playerOwnershipVerified,false);
  assert.equal(await api.getCoverage(),report);
  assert.equal(f.calls.cover,2);
});

test('global 9778 Item ID sorted merge and deep paging across all six original categories',async()=>{
  const api=create(mock());
  for(const query of [
    {areaCodes:[0],offset:0,limit:0},
    {areaCodes:[0],offset:0,limit:20},
    {areaCodes:[0],offset:90,limit:20},
    {areaCodes:[0],offset:500,limit:200},
    {areaCodes:[0],offset:7000,limit:1000},
    {areaCodes:[0],offset:9700,limit:200},
    {areaCodes:[0],offset:9900,limit:20},
    {areaCodes:[1],offset:0,limit:45},
    {areaCodes:[4097],offset:30,limit:70},
    {areaCodes:[2,3,5],offset:600,limit:100},
  ]){
    const expected=all.filter(row=>
      query.areaCodes.includes(0)||
      (Array.isArray(row.code)&&
        row.code.some(a=>query.areaCodes.includes(a)))||
      typeof row.code==='number'&&
        query.areaCodes.includes(row.code));
    const received=await api.search(query);
    assert.equal(received.total,expected.length,JSON.stringify(query));
    assert.deepEqual(received.itemIds,
      expected.slice(query.offset,query.offset+query.limit)
        .map(row=>row.id),JSON.stringify(query));
    assert.equal(received.hasMore,
      expected.length>query.offset+received.itemIds.length);
    assert.equal(received.critterAreaCandidatesRequireRuntimeScene,
      !query.areaCodes.includes(0));
    assert.equal(received.skinNoIHasTagsItemsCannotBeEvaluated,
      !query.areaCodes.includes(0));
    assert.equal(received.originalAllAreasNativeDefaultVerified,false);
    assert.equal(received.gameCollectionUiMembershipVerified,false);
    assert.ok(Object.isFrozen(received.itemIds));
  }
  const allPage=await api.search();
  assert.equal(allPage.total,9778);
  assert.equal(allPage.allAreasMeansUnfilteredSource,true);
});

test('source class filtering keeps four non-IHasTags Skin records on unfiltered source',async()=>{
  const f=mock(),api=create(f);
  const skins=await api.search({nativeCategories:['Skin']});
  assert.equal(skins.total,163);
  assert.equal(f.calls.f.length,0);
  const noInterface=await api.search({
    nativeCategories:['Skin'],
    skinSourceClasses:['MountSkinItemData','BoatSkinItemData'],
    areaCodes:[0],
  });
  assert.equal(noInterface.total,4);
  const noTagMatch=await api.search({
    nativeCategories:['Skin'],
    skinSourceClasses:['MountSkinItemData','BoatSkinItemData'],
    areaCodes:[1,2,3,4,5,4097],
  });
  assert.equal(noTagMatch.total,0);
  assert.equal(noTagMatch.skinNoIHasTagsItemsCannotBeEvaluated,true);
  assert.equal(noTagMatch.critterAreaCandidatesRequireRuntimeScene,false);
  const skinWorld=await api.search({nativeCategories:['Skin'],areaCodes:[1]});
  assert.equal(skinWorld.total,5);
  const critterWorld=await api.search({
    nativeCategories:['Companion'],
    companionKinds:['critter'],areaCodes:[1],
  });
  assert.equal(critterWorld.total,0);
  assert.equal(critterWorld.critterAreaCandidatesRequireRuntimeScene,true);
  assert.equal(critterWorld.skinNoIHasTagsItemsCannotBeEvaluated,false);
  const empty=await api.search({nativeCategories:[]});
  assert.equal(empty.total,0);
  assert.deepEqual(empty.itemIds,[]);
});

test('invalid area codes, category-kind mismatch and mixed AllAreas fail before IO',async()=>{
  const f=mock(),api=create(f);
  for(const query of [
    {nativeCategories:['Egg']},
    {nativeCategories:['Skin','Skin']},
    {nativeCategories:['Skin'],companionKinds:['critter']},
    {nativeCategories:['Companion'],skinSourceClasses:['BoatSkinItemData']},
    {skinSourceClasses:['FurnitureItemData']},
    {skinSourceClasses:['MountSkinItemData','MountSkinItemData']},
    {companionKinds:['horse']},
    {areaCodes:[0,1]},
    {areaCodes:[]},
    {areaCodes:[6]},
    {areaCodes:[2001200028]},
    {limit:-1},{limit:1001},{offset:-1},
  ]){
    await assert.rejects(api.search(query),/DB01_SIX_SOURCE_/);
  }
  assert.equal(f.calls.f.length,0);
  assert.equal(f.calls.s.length,0);
});

test('source row forgery, null/empty conflation and cross-source ID collisions reject',async()=>{
  const mount=data.skin.find(x=>x.cls==='MountSkinItemData');
  const f=mock(),api=create(f);
  const original=f.skin.getItem;
  f.skin.getItem=async id=>{
    const row=await original(id);
    return id===mount.id?{
      ...row,positiveNativeAreaCodes:[],
    }:row;
  };
  await assert.rejects(api.getItem(mount.id),
    /DB01_SIX_SOURCE_SKIN_SOURCE_PROOF_MISSING/);
  const g=mock(),api2=create(g);
  const originalFive=g.five.getItem;
  g.five.getItem=async id=>id===mount.id?{
    itemId:id,nativeCategory:'Furniture',
    originalNativeClass:'FurnitureItemData',
    positiveAreaCodes:[],
    sourceAreaEvidence:'native_ihastags_without_positive_tag',
    originalSourceVerified:true,critterRuntimeProfileSceneResolved:false,
    nativeAllAreasDefaultVerified:false,
    gameCollectionUiMembershipVerified:false,
    playerOwnershipVerified:false,
    dlcEntitlementVerified:false,
  }:originalFive(id);
  await assert.rejects(api2.getItem(mount.id),
    /DB01_SIX_SOURCE_CROSS_SOURCE_ORIGINAL_ID_COLLISION/);
});

test('corrupt source coverage, page order and mixed versions reject',async()=>{
  const f=mock();
  const original=f.skin.getCoverage;
  f.skin.getCoverage=async()=>({
    ...await original(),sourceWithoutIHasTagsInterface:3,
  });
  await assert.rejects(create(f).getCoverage(),
    /DB01_SIX_SOURCE_PINNED_SIX_SOURCE_CENSUS_OR_PROOF_DRIFT/);
  f.skin.gameVersion='1.25.0';
  assert.throws(()=>create(f),
    /DB01_SIX_SOURCE_PINNED_PRIVATE_SOURCE_CLIENTS_REQUIRED/);
  const g=mock(),api=create(g),search=g.skin.search;
  g.skin.search=async q=>{
    const result=await search(q);
    return q.limit>0&&result.itemIds.length>1?
      {...result,itemIds:[result.itemIds[1],result.itemIds[0],
        ...result.itemIds.slice(2)]}:result;
  };
  await assert.rejects(api.search({areaCodes:[0],limit:20}),
    /DB01_SIX_SOURCE_ORIGINAL_SOURCE_UNSORTED_OR_CORRUPT_PAGE/);
});
