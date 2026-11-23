import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {
  joinDb00SixOriginalCollectionAreas,DB00_SIX_ORIGINAL_AREA_CONTRACT
} from '../src/lib/game-db/local-six-category-areas.ts';
import {
  DB01_SIX_CATEGORY_NATIVE_AREA_SCHEMA,
  DB01_SIX_CATEGORY_SOURCE_COUNTS,
  DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS
} from '../src/lib/items/native-positive-area-six-categories.ts';
import {DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS}
  from '../src/lib/items/skin-native-subtypes.ts';

const ROOT=new URL('../static/',import.meta.url);
let requests=0,actualCalls=0,coverageCalls=0;
const fetcher=async url=>{
  assert(url.startsWith('/Wand/')&&!url.includes('..'));
  requests++;
  try{return new Response(readFileSync(new URL(url.slice(6),ROOT)),{status:200});}
  catch{return new Response('missing',{status:404});}
};
let publicTask;
const publicData=()=>publicTask??=openPublicSharedGameSources('/Wand',fetcher);
const COUNTS={
  Furniture:{1:4315,2:434,3:422,4:431,5:478,4097:223,none:443},
  Clothing:{1:1792,2:19,3:42,4:25,5:132,4097:31,none:0},
  Trimming:{1:348,2:0,3:5,4:3,5:5,4097:4,none:0},
  Makeup:{1:0,2:0,3:0,4:0,5:0,4097:0,none:69},
  Companion:{1:170,2:20,3:16,4:19,5:17,4097:4,none:23},
  Skin:{1:5,2:3,3:3,4:1,5:2,4097:7,none:138}
};
const ALL=[];
const byId=new Map();
const families=Object.keys(DB01_SIX_CATEGORY_SOURCE_COUNTS);
const skinLayouts=Object.keys(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS);
const areaCodes=[1,2,3,4,5,4097];
function push(item){
  assert(!byId.has(item.itemId));
  const row=Object.freeze({
    ...item,originalSourceVerified:true,
    runtimeSkinClassIndependentlyVerified:false,
    runtimeCritterSceneResolved:false,
    nativeAllAreasDefaultVerified:false,
    gameCollectionUiMembershipVerified:false,
    worldAvailabilityVerified:false,
    playerOwnershipVerified:false,
    dlcEntitlementVerified:false
  });
  byId.set(item.itemId,row);ALL.push(row);
}
for(const [category,start] of [
  ['Furniture',40000000],['Clothing',50000000],
  ['Trimming',60000000],['Makeup',70000000]]){
  let id=start;
  for(const [code,n] of Object.entries(COUNTS[category])){
    for(let i=0;i<n;i++){
      const selected=code==='none'?null:Number(code);
      push({
        itemId:++id,nativeCategory:category,
        sourceProtobufClass:category+'ItemData',
        companionKind:null,
        positiveAreaCodes:Object.freeze(selected===null?[]:[selected]),
        sourceAreaEvidence:selected===null?
          'native_ihastags_without_positive_tag':'native_positive_tag',
        critterLocationOneofFieldNumber:null
      });
    }
  }
}
let companionId=120000000;
const petMountCodes=areaCodes.flatMap(code=>
  Array.from({length:COUNTS.Companion[code]},()=>code));
assert.equal(petMountCodes.length,246);
for(let i=0;i<269;i++){
  const area=petMountCodes[i]??null;
  const pet=i<241;
  push({
    itemId:++companionId,nativeCategory:'Companion',
    sourceProtobufClass:pet?'PetItemData':'MountItemData',
    companionKind:pet?'pet':'mount',
    positiveAreaCodes:Object.freeze(area===null?[]:[area]),
    sourceAreaEvidence:area===null?
      'native_ihastags_without_positive_tag':'native_positive_tag',
    critterLocationOneofFieldNumber:null
  });
}
for(let i=0;i<125;i++){
  push({
    itemId:++companionId,nativeCategory:'Companion',
    sourceProtobufClass:'CritterItemData',companionKind:'critter',
    positiveAreaCodes:null,
    sourceAreaEvidence:'requires_profile_world_scene',
    critterLocationOneofFieldNumber:i<105?6:7
  });
}
const positiveSkinCodes=areaCodes.flatMap(code=>
  Array.from({length:COUNTS.Skin[code]},()=>code));
assert.equal(positiveSkinCodes.length,21);
let positiveSkinCursor=0;
for(const cls of skinLayouts){
  const {count,sourceIdBand}=DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS[cls];
  const missing=cls==='MountSkinItemData'||cls==='BoatSkinItemData';
  for(let i=0;i<count;i++){
    const code=!missing&&positiveSkinCursor<positiveSkinCodes.length?
      positiveSkinCodes[positiveSkinCursor++]:null;
    push({
      itemId:sourceIdBand*100000+i+1,nativeCategory:'Skin',
      sourceProtobufClass:cls,companionKind:null,
      positiveAreaCodes:missing?null:Object.freeze(code===null?[]:[code]),
      sourceAreaEvidence:missing?'original_interface_absent':
        code===null?'native_ihastags_without_positive_tag':
          'native_positive_tag',
      critterLocationOneofFieldNumber:null
    });
  }
}
ALL.sort((a,b)=>a.itemId-b.itemId);
assert.equal(positiveSkinCursor,21);
assert.equal(ALL.length,9778);
const census=Object.freeze({
  gameVersion:'1.26.2',sourceDefinitions:9778,
  sourcePositiveAreaItems:8976,
  sourceIHasTagsWithoutPositiveArea:673,
  sourceWithoutIHasTags:4,
  critterSceneUnresolved:125,
  categories:DB01_SIX_CATEGORY_SOURCE_COUNTS,
  positiveByArea:DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS,
  nativeAllAreasDefaultVerified:false,
  gameCollectionUiMembershipVerified:false,
  runtimeSkinClassIndependentlyVerified:false,
  runtimeCritterSceneResolved:false
});
const source=Object.freeze({
  schema:DB01_SIX_CATEGORY_NATIVE_AREA_SCHEMA,
  gameVersion:'1.26.2',
  async getCoverage(){coverageCalls++;return census;},
  async getItem(id){actualCalls++;return byId.get(id)??null;},
  async search(q={}){
    const categories=q.nativeCategories??families;
    const kinds=q.companionKinds??['pet','mount','critter'];
    const skins=q.skinSourceProtobufClasses??skinLayouts;
    const codes=q.areaCodes??[0];
    const all=codes.length===1&&codes[0]===0;
    const selected=ALL.filter(x=>categories.includes(x.nativeCategory)&&
      (x.nativeCategory!=='Companion'||kinds.includes(x.companionKind))&&
      (x.nativeCategory!=='Skin'||skins.includes(x.sourceProtobufClass))&&
      (all||x.positiveAreaCodes?.some(code=>codes.includes(code))===true));
    const offset=q.offset??0,limit=q.limit??100;
    const ids=selected.slice(offset,offset+limit).map(x=>x.itemId);
    return Object.freeze({
      itemIds:Object.freeze(ids),total:selected.length,
      hasMore:selected.length>offset+ids.length,
      originalSourceOnly:true,
      allAreasMeansUnfilteredOriginalSource:all,
      selectedCritterScenesUnresolved:!all&&
        categories.includes('Companion')&&kinds.includes('critter'),
      selectedSkinWithoutIHasTagsUnresolved:!all&&
        categories.includes('Skin')&&
        skins.some(s=>s==='MountSkinItemData'||s==='BoatSkinItemData'),
      gameCollectionUiMembershipVerified:false,
      nativeAllAreasDefaultVerified:false,
      playerOwnershipVerified:false,dlcEntitlementVerified:false
    });
  }
});
let readerTask;
const reader=()=>readerTask??=(async()=>
  (await publicData()).connectOwnerLocalSixAreaSource(source)
)();

test('current public DB-00 attaches same-version local DB-01 six-domain reader without public/private network requests',async()=>{
  const pub=await publicData();
  const before=requests;
  const client=await reader();
  assert.equal(client.contract,DB00_SIX_ORIGINAL_AREA_CONTRACT);
  assert.equal(client.snapshotId,'steam-1.26.2-native-itemlist-v1');
  assert.equal(client.sourceDefinitions,9778);
  assert.equal(client.ownerLocalOnly,true);
  assert.equal(client.publicationAuthorized,false);
  assert.equal(client.gameCollectionUiMembershipVerified,false);
  const c=await client.getCoverage();
  assert.equal(c.original,census);
  assert.equal(c.originalPositiveTagMatches,8976);
  assert.equal(c.originalIHasTagsNoPositiveTag,673);
  assert.equal(c.originalSkinWithoutIHasTags,4);
  assert.equal(c.originalCritterSceneUnresolved,125);
  assert.deepEqual(c.nativeCategoryCounts,{
    Furniture:6746,Clothing:2041,Trimming:365,Makeup:69,
    Companion:394,Skin:163
  });
  assert.deepEqual(c.originalPositiveAreaCounts,{
    1:6630,2:476,3:488,4:479,5:634,4097:269
  });
  await client.getCoverage();
  assert.equal(coverageCalls,1);
  assert.equal(requests,before);
  assert.equal(pub.hasPrivateGameSource,false);
  assert(Object.isFrozen(client));
  assert(Object.isFrozen(c));
});

test('9,778 original Item IDs browse end-to-end with separate Critter, Skin no-IHasTags and evaluated-no-positive statuses',async()=>{
  const r=await reader();
  const observed=[];
  const states={native_positive_tag:0,native_ihastags_without_positive_tag:0,
    original_interface_absent:0,requires_profile_world_scene:0};
  let critterCase6=0,critterCase7=0;
  for(let offset=0;offset<9778;){
    const page=await r.search({offset,limit:120});
    assert.equal(page.total,9778);
    assert.equal(page.allAreasMeansUnfilteredOriginalSource,true);
    assert.equal(page.selectedCritterScenesUnresolved,false);
    assert.equal(page.selectedSkinWithoutIHasTagsUnresolved,false);
    assert.equal(page.gameCollectionUiMembershipVerified,false);
    assert.equal(page.nativeAllAreasDefaultVerified,false);
    assert.equal(page.playerOwnershipVerified,false);
    assert.equal(page.dlcEntitlementVerified,false);
    for(const x of page.items){
      observed.push(x.itemId);
      states[x.originalAreaEvidence]++;
      assert.equal(x.shared.itemId,x.itemId);
      assert.equal(x.original.itemId,Number(x.itemId));
      assert.equal(x.original.sourceProtobufClass,x.sourceProtobufClass);
      assert.equal(x.currentAvailabilityVerified,false);
      assert.equal(x.gameCollectionUiMembershipVerified,false);
      assert.equal(x.runtimeCritterSceneVerified,false);
      assert.equal(x.skinRuntimeClassIndependentlyVerified,false);
      if(x.originalAreaEvidence==='requires_profile_world_scene'){
        assert.equal(x.nativeCategory,'Companion');
        assert.equal(x.companionKind,'critter');
        assert.equal(x.positiveSourceAreas,null);
        assert.equal(x.pendingSourceAreaReason,
          'critter_requires_profile_world_scene');
        if(x.original.critterLocationOneofFieldNumber===6)critterCase6++;
        else critterCase7++;
      }else if(x.originalAreaEvidence==='original_interface_absent'){
        assert.equal(x.nativeCategory,'Skin');
        assert(['MountSkinItemData','BoatSkinItemData'].includes(
          x.sourceProtobufClass));
        assert.equal(x.positiveSourceAreas,null);
        assert.equal(x.pendingSourceAreaReason,
          'skin_missing_original_ihastags');
      }else if(x.originalAreaEvidence==='native_ihastags_without_positive_tag'){
        assert.deepEqual(x.positiveSourceAreas,[]);
        assert.equal(x.pendingSourceAreaReason,
          'ihastags_no_positive_source_tag');
      }else{
        assert.equal(x.positiveSourceAreas.length,1);
        assert.equal(x.positiveSourceAreas[0].areaCode,
          x.firstPositiveSourceAreaCode);
        assert.equal(x.pendingSourceAreaReason,null);
      }
      assert(Object.isFrozen(x));
    }
    if(page.nextOffset===null)break;
    assert(page.nextOffset>offset);
    offset=page.nextOffset;
  }
  assert.deepEqual(observed,ALL.map(x=>String(x.itemId)));
  assert.deepEqual(states,{
    native_positive_tag:8976,
    native_ihastags_without_positive_tag:673,
    original_interface_absent:4,
    requires_profile_world_scene:125
  });
  assert.equal(critterCase6,105);
  assert.equal(critterCase7,20);
  assert.equal(await r.getItem('99999999'),null);
  assert(actualCalls>=9778);
});

test('source categories, seven original Skin layouts and six world candidate filters retain unknown cases',async()=>{
  const r=await reader();
  for(const [category,count] of Object.entries(DB01_SIX_CATEGORY_SOURCE_COUNTS)){
    const page=await r.search({nativeCategories:[category]});
    assert.equal(page.total,count);
    assert(page.items.every(x=>x.nativeCategory===category));
  }
  for(const [code,count] of Object.entries(DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS)){
    const page=await r.search({areaCodes:[Number(code)],limit:120});
    assert.equal(page.total,count);
    assert.equal(page.selectedCritterScenesUnresolved,true);
    assert.equal(page.selectedSkinWithoutIHasTagsUnresolved,true);
    assert(page.items.every(x=>x.firstPositiveSourceAreaCode===Number(code)));
  }
  const mixed=await r.search({areaCodes:[2,4097]});
  assert.equal(mixed.total,476+269);
  const noCritters=await r.search({
    nativeCategories:['Companion'],companionKinds:['critter'],areaCodes:[1]
  });
  assert.equal(noCritters.total,0);
  assert.equal(noCritters.selectedCritterScenesUnresolved,true);
  const skins=await r.search({nativeCategories:['Skin']});
  assert.equal(skins.total,163);
  const skinNoTag=await r.search({
    nativeCategories:['Skin'],
    skinSourceProtobufClasses:['MountSkinItemData','BoatSkinItemData']
  });
  assert.equal(skinNoTag.total,4);
  assert(skinNoTag.items.every(x=>x.positiveSourceAreas===null));
  const skinPositive=await r.search({
    nativeCategories:['Skin'],
    skinSourceProtobufClasses:['MountSkinItemData','BoatSkinItemData'],
    areaCodes:[1]
  });
  assert.equal(skinPositive.total,0);
  assert.equal(skinPositive.selectedSkinWithoutIHasTagsUnresolved,true);
  const selectedSkin=await r.search({
    nativeCategories:['Skin'],
    skinSourceProtobufClasses:['HouseSkinItemData'],areaCodes:[1]
  });
  assert.equal(selectedSkin.selectedSkinWithoutIHasTagsUnresolved,false);
  const absent=await r.search({nativeCategories:[]});
  assert.equal(absent.total,0);
  const end=await r.search({offset:9773,limit:120});
  assert.equal(end.items.length,5);
});

test('malformed area request, false runtime membership, forged Skin IHasTags and stale census fail closed',async()=>{
  const r=await reader();
  for(const q of [
    {areaCodes:[0,1]},{areaCodes:[9]},{areaCodes:[1,1]},
    {nativeCategories:['Skin','Skin']},{nativeCategories:['Unknown']},
    {nativeCategories:['Furniture'],skinSourceProtobufClasses:['HouseSkinItemData']},
    {nativeCategories:['Skin'],companionKinds:['critter']},
    {skinSourceProtobufClasses:['SkinNotInSource']},
    {limit:121},{offset:-1}
  ]){
    await assert.rejects(r.search(q),/DB00_SIX_SOURCE_/);
  }
  await assert.rejects(r.getItem('040000001'),/invalid numeric Item ID/);
  const pub=await publicData();
  const stale=joinDb00SixOriginalCollectionAreas(pub,{
    ...source,
    async getCoverage(){return {...census,sourceWithoutIHasTags:3};}
  });
  await assert.rejects(stale.getCoverage(),/ORIGINAL_SOURCE_CENSUS_DRIFT/);
  const mount=[...byId.values()].find(x=>
    x.sourceProtobufClass==='MountSkinItemData');
  const forged=joinDb00SixOriginalCollectionAreas(pub,{
    ...source,
    async getItem(id){
      const x=byId.get(id);
      if(!x||id!==mount.itemId)return x??null;
      return {...x,positiveAreaCodes:[],sourceAreaEvidence:
        'native_ihastags_without_positive_tag'};
    }
  });
  await assert.rejects(forged.getItem(mount.itemId),
    /SOURCE_NULL_VS_EMPTY_INTERFACE_SEMANTICS/);
  const liar=joinDb00SixOriginalCollectionAreas(pub,{
    ...source,
    async search(q){
      return {...await source.search(q),gameCollectionUiMembershipVerified:true};
    }
  });
  await assert.rejects(liar.search({areaCodes:[1]}),
    /ORIGINAL_SIX_SOURCE_PAGE_CORRUPT/);
  assert.throws(()=>joinDb00SixOriginalCollectionAreas(
    {...pub,hasPrivateGameSource:true},source
  ),/PINNED_CURRENT_DB00_AND_DB01_REQUIRED/);
});
