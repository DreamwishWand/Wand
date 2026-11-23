import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {
  joinDb00LocalFiveCategoryCollectionAreas,
  DB00_LOCAL_FIVE_CATEGORY_SOURCE_CONTRACT
} from '../src/lib/game-db/local-five-category-areas.ts';
import {
  DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA,
  DB01_FIVE_CATEGORY_SOURCE_COUNTS,
  DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS
} from '../src/lib/items/native-positive-area-five-categories.ts';

const ROOT=new URL('../static/',import.meta.url);
let requests=0;
const fetcher=async url=>{
  assert(url.startsWith('/Wand/')&&!url.includes('..'));
  requests++;
  try{return new Response(readFileSync(new URL(url.slice(6),ROOT)),{status:200});}
  catch{return new Response('missing',{status:404});}
};
let sharedTask;
const shared=()=>sharedTask??=openPublicSharedGameSources('/Wand',fetcher);
const COUNT={
  Furniture:{1:4315,2:434,3:422,4:431,5:478,4097:223,none:443},
  Clothing:{1:1792,2:19,3:42,4:25,5:132,4097:31,none:0},
  Trimming:{1:348,2:0,3:5,4:3,5:5,4097:4,none:0},
  Makeup:{1:0,2:0,3:0,4:0,5:0,4097:0,none:69},
  Companion:{1:170,2:20,3:16,4:19,5:17,4097:4,none:23,critter:125},
};
const byId=new Map();
const records=[];
const idPrefix={Furniture:40000000,Clothing:50000000,
  Trimming:60000000,Makeup:70000000,Companion:120000000};
const cats=Object.keys(idPrefix);
const makeItem=(itemId,category,code,kind=null,critterIndex=0)=>{
  const critter=kind==='critter';
  const cls=category==='Companion'?
    (kind==='pet'?'PetItemData':kind==='mount'?'MountItemData':'CritterItemData'):
    category+'ItemData';
  const codes=critter?null:Object.freeze(code===null?[]:[code]);
  const item=Object.freeze({
    itemId,nativeCategory:category,
    originalNativeClass:cls,
    companionKind:kind,positiveAreaCodes:codes,
    firstProvenPositiveAreaCode:code,
    sourceAreaEvidence:critter?'requires_profile_world_scene':
      code===null?'native_ihastags_without_positive_tag':'native_positive_tag',
    critterLocationOneofFieldNumber:critter?critterIndex<105?6:7:null,
    originalSourceVerified:true,
    critterRuntimeProfileSceneResolved:false,
    nativeAllAreasDefaultVerified:false,
    gameCollectionUiMembershipVerified:false,
    worldAvailabilityVerified:false,
    playerOwnershipVerified:false,
    dlcEntitlementVerified:false
  });
  assert(!byId.has(itemId));
  byId.set(itemId,item);
  records.push(item);
};
for(const category of cats){
  let id=idPrefix[category];
  if(category==='Companion'){
    const positives=[1,2,3,4,5,4097].flatMap(code=>
      Array.from({length:COUNT.Companion[code]},()=>code));
    assert.equal(positives.length,246);
    for(let i=0;i<269;i++)
      makeItem(++id,category,positives[i]??null,i<241?'pet':'mount');
    for(let i=0;i<125;i++)makeItem(++id,category,null,'critter',i);
  }else{
    for(const [code,number] of Object.entries(COUNT[category])){
      for(let i=0;i<number;i++){
        makeItem(++id,category,code==='none'?null:Number(code));
      }
    }
  }
}
records.sort((a,b)=>a.itemId-b.itemId);
assert.equal(records.length,9615);
const coverage=Object.freeze({
  gameVersion:'1.26.2',sourceDefinitions:9615,
  byOriginalNativeCategory:DB01_FIVE_CATEGORY_SOURCE_COUNTS,
  sourcePositiveNativeAreaItems:8955,
  sourceIHasTagsWithoutPositiveArea:535,
  sourceCritterNeedsProfileWorldScene:125,
  sourcePositiveByOriginalArea:DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS,
  sourceOriginalItemAndClassVerified:true,
  nativeAllAreasDefaultVerified:false,
  runtimeCritterSceneResolved:false,
  gameCollectionUiMembershipVerified:false,
  playerOwnershipVerified:false,
  dlcEntitlementVerified:false
});
let getItemCount=0,searchCount=0,coverageCount=0;
const native=Object.freeze({
  schema:DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA,
  gameVersion:'1.26.2',
  async getCoverage(){coverageCount++;return coverage;},
  async getItem(id){getItemCount++;return byId.get(id)??null;},
  async search(query={}){
    searchCount++;
    const categories=query.nativeCategories??cats;
    const kinds=query.companionKinds??['pet','mount','critter'];
    const areas=query.areaCodes??[0];
    const all=areas.length===1&&areas[0]===0;
    const selected=records.filter(row=>
      categories.includes(row.nativeCategory)&&
      (row.nativeCategory!=='Companion'||kinds.includes(row.companionKind))&&
      (all||row.positiveAreaCodes?.some(code=>areas.includes(code))===true));
    const offset=query.offset??0,limit=query.limit??100;
    const itemIds=Object.freeze(selected.slice(offset,offset+limit)
      .map(x=>x.itemId));
    return Object.freeze({
      total:selected.length,itemIds,
      hasMore:selected.length>offset+itemIds.length,
      originalSourceAreaSearchOnly:true,
      allAreasMeansUnfilteredOriginalSource:all,
      selectedCritterSceneCandidatesUnresolved:!all&&
        categories.includes('Companion')&&kinds.includes('critter'),
      runtimeCritterProfileSceneVerified:false,
      nativeAllAreasDefaultVerified:false,
      gameCollectionUiMembershipVerified:false,
      playerOwnershipVerified:false,
      dlcEntitlementVerified:false
    });
  }
});
let readerTask;
const reader=()=>readerTask??=(async()=>
  joinDb00LocalFiveCategoryCollectionAreas(await shared(),native)
)();

test('five-category API joins 9,615 original definitions without adding source bytes or API downloads',async()=>{
  await shared();
  const before=requests;
  const r=await reader();
  assert.equal(r.contract,DB00_LOCAL_FIVE_CATEGORY_SOURCE_CONTRACT);
  assert.equal(r.snapshotId,'steam-1.26.2-native-itemlist-v1');
  assert.equal(r.sourceDefinitions,9615);
  assert.equal(r.gameVersion,'1.26.2');
  assert.equal(r.ownerLocalOnly,true);
  assert.equal(r.publicationAuthorized,false);
  assert.equal(r.originalSourceOnly,true);
  assert.equal(r.gameCollectionUiMembershipVerified,false);
  const result=await r.getCoverage();
  assert.equal(result.original,coverage);
  assert.equal(result.sourceDefinitions,9615);
  assert.equal(result.sourcePositiveNativeAreaItems,8955);
  assert.equal(result.originalHasTagsNoPositiveMatch,535);
  assert.equal(result.critterProfileWorldSceneUnknown,125);
  assert.deepEqual(result.categoryCounts,{
    Furniture:6746,Clothing:2041,Trimming:365,Makeup:69,Companion:394
  });
  assert.deepEqual(result.positiveSourceAreaCounts,{
    1:6625,2:473,3:485,4:478,5:632,4097:262
  });
  assert.equal(result.nativeAllAreasDefaultVerified,false);
  assert.equal(result.critterRuntimeSceneVerified,false);
  assert.equal(result.gameCollectionUiMembershipVerified,false);
  assert(Object.isFrozen(result));
  assert(Object.isFrozen(r));
  await r.getCoverage();
  assert.equal(coverageCount,1);
  assert.equal(requests,before,
    'owner-local source must not be served from public HTTP');
});

test('full 9,615-ID source scan retains 8,955 positives, 535 original no-tag matches and 125 scene-unknown Critters',async()=>{
  const r=await reader();
  const seen=[],count={native_positive_tag:0,
    native_ihastags_without_positive_tag:0,
    requires_profile_world_scene:0};
  for(let offset=0;;){
    const page=await r.search({areaCodes:[0],offset,limit:120});
    assert.equal(page.total,9615);
    assert.equal(page.allAreasMeansUnfilteredOriginalSource,true);
    assert.equal(page.selectedCritterSceneCandidatesUnresolved,false);
    assert.equal(page.runtimeCritterSceneVerified,false);
    assert.equal(page.gameCollectionUiMembershipVerified,false);
    assert.equal(page.playerOwnershipVerified,false);
    assert.equal(page.dlcEntitlementVerified,false);
    for(const row of page.items){
      seen.push(row.itemId);
      count[row.sourceAreaEvidence]++;
      assert.equal(row.shared.itemId,row.itemId);
      assert.equal(row.original.itemId,Number(row.itemId));
      assert.equal(row.nativeCategory,row.original.nativeCategory);
      assert.equal(row.originalSourceVerified,true);
      assert.equal(row.currentAvailabilityVerified,false);
      assert.equal(row.playerOwnershipVerified,false);
      assert.equal(row.gameCollectionUiMembershipVerified,false);
      assert.equal(row.runtimeCritterSceneVerified,false);
      assert.equal(row.nativeAllAreasDefaultVerified,false);
      assert(Object.isFrozen(row));
      if(row.sourceAreaEvidence==='requires_profile_world_scene'){
        assert.equal(row.nativeCategory,'Companion');
        assert.equal(row.companionKind,'critter');
        assert.equal(row.positiveSourceAreas,null);
        assert.equal(row.firstProvenPositiveAreaCode,null);
        assert([6,7].includes(row.critterLocationOneofFieldNumber));
      }else if(row.sourceAreaEvidence==='native_ihastags_without_positive_tag'){
        assert.deepEqual(row.positiveSourceAreas,[]);
        assert.equal(row.critterLocationOneofFieldNumber,null);
        assert.equal(row.firstProvenPositiveAreaCode,null);
      }else{
        assert.equal(row.positiveSourceAreas.length,1);
        assert.equal(row.positiveSourceAreas[0].areaCode,
          row.firstProvenPositiveAreaCode);
        assert.equal(row.positiveSourceAreas[0].gameUiItemMembershipVerified,false);
      }
    }
    if(page.nextOffset===null)break;
    offset=page.nextOffset;
  }
  assert.deepEqual(seen,records.map(row=>String(row.itemId)));
  assert.deepEqual(count,{
    native_positive_tag:8955,
    native_ihastags_without_positive_tag:535,
    requires_profile_world_scene:125
  });
  assert.equal(await r.getItem('99999999'),null);
});

test('five-category filters combine Collection areas, original native categories and companion kind without treating Critter unknown as a negative',async()=>{
  const r=await reader();
  for(const [code,count] of Object.entries(
    DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS)){
    const page=await r.search({areaCodes:[Number(code)],limit:120});
    assert.equal(page.total,count);
    assert.equal(page.selectedCritterSceneCandidatesUnresolved,true);
    assert.equal(page.runtimeCritterSceneVerified,false);
    assert(page.items.every(row=>
      row.sourceAreaEvidence==='native_positive_tag'&&
      row.firstProvenPositiveAreaCode===Number(code)));
  }
  const furniture=await r.search({
    nativeCategories:['Furniture'],limit:100
  });
  assert.equal(furniture.total,6746);
  assert.equal(furniture.selectedCritterSceneCandidatesUnresolved,false);
  const wardrobe=await r.search({
    nativeCategories:['Clothing','Trimming','Makeup'],areaCodes:[0]
  });
  assert.equal(wardrobe.total,2475);
  const companions=await r.search({
    nativeCategories:['Companion'],areaCodes:[0],limit:100
  });
  assert.equal(companions.total,394);
  const critters=await r.search({
    nativeCategories:['Companion'],companionKinds:['critter'],areaCodes:[0],
    limit:120
  });
  assert.equal(critters.total,125);
  assert(critters.items.every(row=>
    row.sourceAreaEvidence==='requires_profile_world_scene'));
  const unknown=await r.search({
    nativeCategories:['Companion'],companionKinds:['critter'],areaCodes:[2]
  });
  assert.equal(unknown.total,0);
  assert.equal(unknown.selectedCritterSceneCandidatesUnresolved,true);
  const pets=await r.search({
    nativeCategories:['Companion'],companionKinds:['pet'],areaCodes:[0]
  });
  assert.equal(pets.total,241);
  const mounts=await r.search({
    nativeCategories:['Companion'],companionKinds:['mount'],areaCodes:[0]
  });
  assert.equal(mounts.total,28);
  const noCategories=await r.search({nativeCategories:[]});
  assert.equal(noCategories.total,0);
  const boundary=await r.search({offset:9220,limit:9});
  assert.deepEqual(boundary.items.map(x=>x.itemId),
    records.slice(9220,9229).map(x=>String(x.itemId)));
});

test('original source query rejection, false Critter tags, status promotion and stale five-category counts are fail-closed',async()=>{
  const r=await reader();
  await assert.rejects(r.search({areaCodes:[0,1]}),
    /INVALID_ORIGINAL_AREA_CODES/);
  await assert.rejects(r.search({areaCodes:[1,1]}),
    /INVALID_ORIGINAL_AREA_CODES/);
  await assert.rejects(r.search({areaCodes:[999]}),
    /INVALID_ORIGINAL_AREA_CODES/);
  await assert.rejects(r.search({nativeCategories:['Companion','Companion']}),
    /INVALID_NATIVE_CATEGORIES/);
  await assert.rejects(r.search({nativeCategories:['Clothing'],
    companionKinds:['pet']}),/INVALID_COMPANION_KINDS/);
  await assert.rejects(r.search({companionKinds:['pet','pet']}),
    /INVALID_COMPANION_KINDS/);
  await assert.rejects(r.search({limit:121}),/INVALID_PAGE/);
  await assert.rejects(r.search({offset:-1}),/INVALID_PAGE/);
  await assert.rejects(r.getItem('040000001'),/invalid numeric Item ID/);
  const pub=await shared();
  const stale=joinDb00LocalFiveCategoryCollectionAreas(pub,{
    ...native,
    async getCoverage(){return {...coverage,sourceDefinitions:9614};}
  });
  await assert.rejects(stale.getCoverage(),
    /ORIGINAL_FIVE_CATEGORY_CENSUS_DRIFT/);
  const critter=records.find(x=>x.companionKind==='critter');
  const falseCritter=joinDb00LocalFiveCategoryCollectionAreas(pub,{
    ...native,
    async getItem(id){
      const row=byId.get(id);
      if(!row||id!==critter.itemId)return row??null;
      return {...row,positiveAreaCodes:Object.freeze([])};
    }
  });
  await assert.rejects(falseCritter.getItem(critter.itemId),
    /NATIVE_ITEM_CRITTER_OR_TAG_EVIDENCE_MISMATCH/);
  const falsePage=joinDb00LocalFiveCategoryCollectionAreas(pub,{
    ...native,
    async search(query){
      const page=await native.search(query);
      return {...page,selectedCritterSceneCandidatesUnresolved:false};
    }
  });
  await assert.rejects(falsePage.search({areaCodes:[1]}),
    /ORIGINAL_SOURCE_PAGE_CONTRACT_MISMATCH/);
  assert.throws(()=>joinDb00LocalFiveCategoryCollectionAreas(
    {...pub,hasPrivateGameSource:true},native
  ),/VERIFIED_FIVE_CATEGORY_ORIGINAL_SOURCE_REQUIRED/);
  assert(getItemCount>0&&searchCount>0);
});
