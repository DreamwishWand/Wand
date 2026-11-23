import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {
  joinDb00LocalWardrobeCollectionAreas,
  DB00_LOCAL_WARDROBE_AREAS
} from '../src/lib/game-db/local-wardrobe-areas.ts';
import {
  DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA,
  DB01_WARDROBE_CATEGORY_SPECS,DB01_WARDROBE_POSITIVE_AREA_CENSUS
} from '../src/lib/items/wardrobe-native-has-tag.ts';
import {DB01_COLLECTION_AREA_SOURCE_CONFIGS}
  from '../src/lib/items/collection-area-source-config.ts';

const ROOT=new URL('../static/',import.meta.url);
let publicTask;
const app=()=>publicTask??=openPublicSharedGameSources('/Wand',async url=>{
  assert(url.startsWith('/Wand/')&&!url.includes('..'));
  try{return new Response(readFileSync(
    new URL(url.slice(6),ROOT)),{status:200});}
  catch{return new Response('missing',{status:404});}
});
const configs=new Map(DB01_COLLECTION_AREA_SOURCE_CONFIGS.map(c=>[
  c.areaCode,c.gameplayTagId
]));
function original(id,category,tags,setTags=[],areaCode=null){
  const spec=DB01_WARDROBE_CATEGORY_SPECS[category];
  const lookup=Object.freeze(setTags.length>0?
    {kind:'has_set',setItemId:20000021,
      definition:Object.freeze({kind:'original_set_definition',
        itemId:20000021,nativeTags:Object.freeze(setTags)})}:
    {kind:'has_set',setItemId:0,
      definition:Object.freeze({kind:'missing_original_set_definition'})});
  const row=Object.freeze({
    itemId:id,nativeKey:'synthetic_'+id,
    nativeCategory:category,
    originalNativeClass:spec.originalNativeClass,
    tagsFieldNumber:spec.tagsFieldNumber,
    nativeTags:Object.freeze(tags),setLookup:lookup,
    nativeHasTagSchemaVerified:true,
    gameUiCollectionMembershipVerified:false,
    dlcEntitlementVerified:false
  });
  return Object.freeze({
    original:row,input:Object.freeze({
      itemId:id,gameVersion:'1.26.2',nativeTags:row.nativeTags,
      setLookup:lookup
    }),
    positiveAreaCodes:Object.freeze(areaCode===null?[]:[areaCode]),
    sourceShardHashVerified:true,
    gameUiCollectionMembershipVerified:false,
    worldAvailabilityVerified:false,
    dlcEntitlementVerified:false
  });
}
const RECORDS=new Map([
  [50001001,original(50001001,'Clothing',[configs.get(2)],[],2)],
  [50001002,original(50001002,'Trimming',[2001234567],
    [configs.get(4097)],4097)],
  [50001003,original(50001003,'Makeup',[2001234567],[],null)],
  [50001004,original(50001004,'Clothing',[configs.get(1)],[],1)]
]);
let batchCalls=0,individualCalls=0,censusCalls=0;
const wardrobe=Object.freeze({
  schema:DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA,
  gameVersion:'1.26.2',
  getItem:async id=>(individualCalls++,RECORDS.get(id)??null),
  getItems:async ids=>(batchCalls++,
    Object.freeze(ids.map(id=>RECORDS.get(id)??null))),
  hasTag:async()=>null,
  async getCoverage(){
    censusCalls++;
    return Object.freeze({
      sourceDefinitionCount:2475,
      originalCategoryCounts:Object.freeze({Clothing:2041,Trimming:365,Makeup:69}),
      sourceResolvedSetItemReferences:2405,
      sourceWithoutSetReference:70,
      positiveAreaItems:2406,
      sourceUnassignedPositiveAreaItems:69,
      positiveAreaByCode:DB01_WARDROBE_POSITIVE_AREA_CENSUS,
      sourceVerifiedPositiveAreaPredicates:true,
      originalAllAreasDefaultHasTagEvaluated:false,
      runtimeCollectionUiMembershipVerified:false
    });
  },
  async search(query={}){
    const cats=query.nativeCategories??['Clothing','Trimming','Makeup'];
    const areas=query.areaCodes??[0];
    const all=areas.length===1&&areas[0]===0;
    const ids=[...RECORDS.keys()].filter(id=>{
      const row=RECORDS.get(id);
      return cats.includes(row.original.nativeCategory)&&
        (all||row.positiveAreaCodes.some(code=>areas.includes(code)));
    });
    let total;
    if(all)total=cats.reduce((sum,cat)=>sum+
      DB01_WARDROBE_CATEGORY_SPECS[cat].count,0);
    else if(cats.length===3)total=areas.reduce((sum,code)=>sum+
      DB01_WARDROBE_POSITIVE_AREA_CENSUS[code],0);
    else total=ids.length;
    const offset=query.offset??0,limit=query.limit??100;
    const itemIds=Object.freeze(ids.slice(offset,offset+limit));
    return Object.freeze({
      itemIds,total,hasMore:total>offset+itemIds.length,
      sourceNativeHasTagMatchesOnly:true,
      actualCollectionUiMembershipVerified:false,
      allAreasDefaultNativePredicateEvaluated:false,
      playerEntitlementVerified:false
    });
  }
});
const reader=async(client=wardrobe)=>
  joinDb00LocalWardrobeCollectionAreas(await app(),client);

test('DB-00 preserves exact 2475 wardrobe definitions and 2406 source-positive area matches',async()=>{
  const r=await reader();
  assert.equal(r.contract,DB00_LOCAL_WARDROBE_AREAS);
  assert.equal(r.ownerLocalOnly,true);
  assert.equal(r.publicationAuthorized,false);
  assert.equal(r.originalWardrobeDefinitions,2475);
  assert.equal(r.originalNativePositiveAreas,6);
  assert.equal(r.nativeCollectionUiMembershipVerified,false);
  const coverage=await r.getCoverage();
  assert.equal(coverage.originalWardrobeDefinitions,2475);
  assert.equal(coverage.clothing,2041);
  assert.equal(coverage.trimming,365);
  assert.equal(coverage.makeup,69);
  assert.equal(coverage.withPositiveNativeArea,2406);
  assert.equal(coverage.withoutPositiveNativeArea,69);
  assert.deepEqual(coverage.countsByArea,DB01_WARDROBE_POSITIVE_AREA_CENSUS);
  assert.equal(Object.values(coverage.countsByArea).reduce((a,b)=>a+b,0),2406);
  assert.equal(coverage.nativeAllAreasDefaultEvaluated,false);
  assert.equal(coverage.actualCollectionUiMembershipVerified,false);
  await r.getCoverage();
  assert.equal(censusCalls,1);
  assert(Object.isFrozen(coverage)&&Object.isFrozen(coverage.countsByArea));
});

test('original Clothing direct tags and Trimming inherited Set tags retain exact DB-00 Item labels, not UI membership',async()=>{
  const pub=await app();
  const r=await reader();
  const items=await r.getItems([50001001,50001002,50001003,50001004]);
  assert.equal(items.length,4);
  assert.deepEqual(items.map(x=>x.itemId),[
    '50001001','50001002','50001003','50001004'
  ]);
  assert.equal(items[0].nativeCategory,'Clothing');
  assert.equal(items[0].firstProvenPositiveAreaCode,2);
  assert.equal(items[0].positiveSourceAreaMatches[0].sourceMatchBranch,
    'item_tags');
  assert.equal(items[1].nativeCategory,'Trimming');
  assert.equal(items[1].firstProvenPositiveAreaCode,4097);
  assert.equal(items[1].positiveSourceAreaMatches[0].sourceMatchBranch,
    'set_item_tags');
  assert.equal(items[2].nativeCategory,'Makeup');
  assert.equal(items[2].firstProvenPositiveAreaCode,null);
  assert.deepEqual(items[2].positiveSourceAreaMatches,[]);
  assert.equal(items[3].firstProvenPositiveAreaCode,1);
  for(const item of items){
    assert.deepEqual(item.shared,pub.getItem(item.itemId));
    assert.equal(item.originalHasTagsAndIHasSetVerified,true);
    assert.equal(item.nativeAllAreasDefaultEvaluated,false);
    assert.equal(item.actualCollectionUiMembershipVerified,false);
    assert.equal(item.playerOwnershipVerified,false);
    assert.equal(item.dlcEntitlementVerified,false);
    assert.equal(item.currentAvailabilityVerified,false);
    assert(Object.isFrozen(item));
    assert(Object.isFrozen(item.positiveSourceAreaMatches));
  }
  assert(batchCalls>=1);
  assert.equal(individualCalls,0);
  assert.equal(await r.getItem(50009999),null);
  assert.equal(await r.getItem(50001002).then(x=>x.itemId),'50001002');
});

test('source area paging preserves six native area codes, category filters and unfiltered AllAreas code=0',async()=>{
  const r=await reader();
  const all=await r.search({areaCodes:[0],limit:4});
  assert.equal(all.total,2475);
  assert.deepEqual(all.items.map(x=>x.itemId),[
    '50001001','50001002','50001003','50001004'
  ]);
  assert.equal(all.nextOffset,4);
  assert.equal(all.nativeAllAreasDefaultEvaluated,false);
  assert.equal(all.actualCollectionUiMembershipVerified,false);
  const area2=await r.search({areaCodes:[2]});
  assert.equal(area2.total,19);
  assert.deepEqual(area2.items.map(x=>x.itemId),['50001001']);
  const area4097=await r.search({areaCodes:[4097]});
  assert.equal(area4097.total,35);
  assert.deepEqual(area4097.items.map(x=>x.itemId),['50001002']);
  const union=await r.search({areaCodes:[2,4097]});
  assert.equal(union.total,54);
  assert.deepEqual(union.items.map(x=>x.itemId),['50001001','50001002']);
  const makeup=await r.search({areaCodes:[0],nativeCategories:['Makeup']});
  assert.equal(makeup.total,69);
  assert.deepEqual(makeup.items.map(x=>x.itemId),['50001003']);
  const onlyClothing=await r.search({
    areaCodes:[0],nativeCategories:['Clothing']
  });
  assert.equal(onlyClothing.total,2041);
  assert.deepEqual(onlyClothing.items.map(x=>x.itemId),
    ['50001001','50001004']);
});

test('refuse ambiguous AllAreas, out-of-bounds batches, source class mismatch, fabricated UI and stale census',async()=>{
  const r=await reader();
  await assert.rejects(r.search({areaCodes:[0,2]}),/INVALID_AREA_CODES/);
  await assert.rejects(r.search({areaCodes:[2,2]}),/INVALID_AREA_CODES/);
  await assert.rejects(r.search({areaCodes:[2],limit:201}),/INVALID_PAGE/);
  await assert.rejects(r.search({nativeCategories:['Clothing','Clothing']}),
    /INVALID_NATIVE_CATEGORIES/);
  await assert.rejects(r.getItems(new Array(201).fill(50001001)),
    /INVALID_BATCH/);
  await assert.rejects(r.getItem('050001001'),/invalid numeric Item ID/);
  const wrongArea=await reader({
    ...wardrobe,
    getItem:async id=>id===50001001?
      {...RECORDS.get(id),positiveAreaCodes:Object.freeze([4097])}:
      RECORDS.get(id)??null
  });
  await assert.rejects(wrongArea.getItem(50001001),
    /ORIGINAL_AREA_SOURCE_TAG_MISMATCH/);
  const wrongUi=await reader({
    ...wardrobe,
    getItem:async id=>id===50001001?
      {...RECORDS.get(id),gameUiCollectionMembershipVerified:true}:
      RECORDS.get(id)??null
  });
  await assert.rejects(wrongUi.getItem(50001001),
    /WRONG_ORIGINAL_WARDROBE_ITEM_CLASS_OR_STATE/);
  const stale=await reader({
    ...wardrobe,
    async getCoverage(){
      return {...await wardrobe.getCoverage(),positiveAreaItems:2405};
    }
  });
  await assert.rejects(stale.getCoverage(),
    /ORIGINAL_WARDROBE_AREA_CENSUS_DRIFT/);
  assert.throws(()=>joinDb00LocalWardrobeCollectionAreas(
    {...await app(),hasPrivateGameSource:true},wardrobe
  ),/VERIFIED_PUBLIC_ITEM_AND_AREA_SOURCE_REQUIRED/);
});
