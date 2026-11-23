import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {
  joinDb00LocalUnifiedCollectionAreas,
  DB00_LOCAL_UNIFIED_COLLECTION_AREAS
} from '../src/lib/game-db/local-unified-collection-areas.ts';
import {
  DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS,
} from '../src/lib/items/native-positive-area-unified.ts';

const ROOT=new URL('../static/',import.meta.url);
let requestCount=0;
const fetcher=async url=>{
  assert(url.startsWith('/Wand/')&&!url.includes('..'));
  requestCount++;
  try{
    return new Response(readFileSync(new URL(url.slice(6),ROOT)),{status:200});
  }catch{
    return new Response('not found',{status:404});
  }
};
let task;
const publicData=()=>task??=openPublicSharedGameSources('/Wand',fetcher);
const categoryCodes={
  Furniture:{1:4315,2:434,3:422,4:431,5:478,4097:223,unresolved:443},
  Clothing:{1:1792,2:19,3:42,4:25,5:132,4097:31,unresolved:0},
  Trimming:{1:348,2:0,3:5,4:3,5:5,4097:4,unresolved:0},
  Makeup:{1:0,2:0,3:0,4:0,5:0,4097:0,unresolved:69}
};
const byId=new Map();
const all=[];
let id=40000000;
for(const [category,counts] of Object.entries(categoryCodes)){
  for(const [code,amount] of Object.entries(counts)){
    for(let i=0;i<amount;i++){
      const codeNum=code==='unresolved'?null:Number(code);
      const row=Object.freeze({
        itemId:++id,originalNativeCategory:category,
        originalNativeClass:
          category==='Furniture'?'FurnitureItemData':category+'ItemData',
        positiveAreaCodes:Object.freeze(codeNum===null?[]:[codeNum]),
        firstProvenPositiveAreaCode:codeNum,
        sourceOriginalIHasTagsAndSetSemanticsVerified:true,
        allAreasNativeDefaultPredicateVerified:false,
        gameCollectionUiMembershipVerified:false,
        worldAvailabilityVerified:false,
        dlcEntitlementVerified:false,
        playerOwnershipVerified:false
      });
      byId.set(row.itemId,row);
      all.push(row);
    }
  }
}
assert.equal(all.length,9221);
const coverage=Object.freeze({
  gameVersion:'1.26.2',sourceDefinitionCount:9221,
  originalNativeCategoryCounts:DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS,
  positiveAreaItems:8709,unresolvedPositiveAreaItems:512,
  positiveAreaByCode:DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS,
  verifiedOriginalNativeHasTagSource:true,
  gameCollectionUiMembershipVerified:false,
  allAreasNativeDefaultPredicateVerified:false,
  dlcEntitlementVerified:false
});
let censusCalls=0,searchCalls=0,getCalls=0;
const native=Object.freeze({
  schema:DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA,
  gameVersion:'1.26.2',
  async getCoverage(){censusCalls++;return coverage;},
  async getItem(id){getCalls++;return byId.get(id)??null;},
  async search(query={}){
    searchCalls++;
    const categories=query.nativeCategories??Object.keys(categoryCodes);
    const codes=query.areaCodes??[0];
    const selected=all.filter(row=>
      categories.includes(row.originalNativeCategory) &&
      (codes.includes(0)||
        row.positiveAreaCodes.some(code=>codes.includes(code))));
    const offset=query.offset??0,limit=query.limit??100;
    const itemIds=Object.freeze(selected.slice(offset,offset+limit)
      .map(row=>row.itemId));
    return Object.freeze({
      total:selected.length,itemIds,
      hasMore:offset+itemIds.length<selected.length,
      sourcePositiveNativeHasTagOnly:true,
      allAreasMeansUnfilteredOriginalSource:codes.length===1&&codes[0]===0,
      gameCollectionUiMembershipVerified:false,
      allAreasNativeDefaultPredicateVerified:false,
      worldAvailabilityVerified:false,
      playerOwnershipVerified:false,
      dlcEntitlementVerified:false
    });
  }
});
let joinedPromise;
const reader=()=>joinedPromise??=(async()=>joinDb00LocalUnifiedCollectionAreas(
  await publicData(),native
))();

test('DB-00 merges original 6746 Furniture + 2475 Wardrobe into exact 9221 read-only native area census',async()=>{
  const before=requestCount;
  const joined=await reader();
  const c=await joined.getCoverage();
  assert.equal(joined.contract,DB00_LOCAL_UNIFIED_COLLECTION_AREAS);
  assert.equal(joined.snapshotId,'steam-1.26.2-native-itemlist-v1');
  assert.equal(joined.sourceDefinitions,9221);
  assert.equal(joined.sourcePositiveMatches,8709);
  assert.equal(joined.unresolvedPositiveAreaItems,512);
  assert.equal(joined.ownerLocalOnly,true);
  assert.equal(joined.publicationAuthorized,false);
  assert.equal(joined.actualCollectionUiMembershipVerified,false);
  assert.equal(c.original,coverage);
  assert.equal(c.sourceDefinitions,9221);
  assert.equal(c.sourcePositiveMatches,8709);
  assert.equal(c.unresolvedPositiveAreaItems,512);
  assert.deepEqual(c.originalCategories,{
    Furniture:6746,Clothing:2041,Trimming:365,Makeup:69
  });
  assert.deepEqual(c.positiveSourceAreaCounts,{
    1:6455,2:453,3:469,4:459,5:615,4097:258
  });
  assert.equal(Object.values(c.positiveSourceAreaCounts)
    .reduce((a,b)=>a+b,0),8709);
  assert.equal(c.nativeAllAreasDefaultPredicateVerified,false);
  assert.equal(c.actualCollectionUiMembershipVerified,false);
  assert.equal(c.playerOwnershipVerified,false);
  assert(Object.isFrozen(c));
  await joined.getCoverage();
  assert.equal(censusCalls,1);
  assert.equal(requestCount,before,'no private or added public source requests');
});

test('9,221 original source Item IDs are all paged once, name joined, and never assigned a false Collection area',async()=>{
  const r=await reader();
  let offset=0,positive=0,unresolved=0,seen=0;
  const categories={Furniture:0,Clothing:0,Trimming:0,Makeup:0};
  for(let i=0;i<100;i++){
    const page=await r.search({areaCodes:[0],offset,limit:120});
    assert.equal(page.total,9221);
    assert.equal(page.allAreasMeansUnfilteredOriginalSource,true);
    assert.equal(page.nativeAllAreasDefaultPredicateVerified,false);
    assert.equal(page.actualCollectionUiMembershipVerified,false);
    assert.equal(page.playerOwnershipVerified,false);
    assert.equal(page.dlcEntitlementVerified,false);
    for(const row of page.items){
      assert.equal(row.itemId,row.shared.itemId);
      assert.equal(row.original.itemId,Number(row.itemId));
      assert.equal(row.sourceNativeHasTagVerified,true);
      assert.equal(row.actualCollectionUiMembershipVerified,false);
      assert.equal(row.worldAvailabilityVerified,false);
      assert.equal(row.playerOwnershipVerified,false);
      assert.equal(row.dlcEntitlementVerified,false);
      categories[row.nativeCategory]++;
      seen++;
      if(row.positiveAreaUnresolved){
        unresolved++;
        assert.equal(row.firstProvenPositiveAreaCode,null);
        assert.deepEqual(row.positiveAreaSources,[]);
      }else{
        positive++;
        assert.equal(row.positiveAreaSources.length,1);
        assert.equal(row.positiveAreaSources[0].areaCode,
          row.firstProvenPositiveAreaCode);
        assert.equal(row.positiveAreaSources[0].gameUiItemMembershipVerified,
          false);
      }
    }
    if(page.nextOffset===null)break;
    assert(page.nextOffset>offset);
    offset=page.nextOffset;
  }
  assert.equal(seen,9221);
  assert.equal(positive,8709);
  assert.equal(unresolved,512);
  assert.deepEqual(categories,{
    Furniture:6746,Clothing:2041,Trimming:365,Makeup:69
  });
  assert.equal(await r.getItem(99999999),null);
});

test('six source-native CollectionArea counts and category filters preserve exact Source/Item crosslinks',async()=>{
  const r=await reader();
  for(const [key,count] of Object.entries(
    DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS)){
    const page=await r.search({areaCodes:[Number(key)],limit:40});
    assert.equal(page.total,count);
    assert.equal(page.allAreasMeansUnfilteredOriginalSource,false);
    assert(page.items.every(x=>
      x.firstProvenPositiveAreaCode===Number(key)));
  }
  const combo=await r.search({areaCodes:[2,4097],limit:120});
  assert.equal(combo.total,453+258);
  assert(combo.items.every(x=>x.firstProvenPositiveAreaCode===2||
    x.firstProvenPositiveAreaCode===4097));
  const furniture=await r.search({
    nativeCategories:['Furniture'],areaCodes:[0],limit:25
  });
  assert.equal(furniture.total,6746);
  assert(furniture.items.every(x=>x.nativeCategory==='Furniture'));
  const wardrobe=await r.search({
    nativeCategories:['Clothing','Trimming','Makeup'],areaCodes:[0],limit:25
  });
  assert.equal(wardrobe.total,2475);
  assert(wardrobe.items.every(x=>x.nativeCategory!=='Furniture'));
  const makeup=await r.search({
    nativeCategories:['Makeup'],areaCodes:[0],limit:120
  });
  assert.equal(makeup.total,69);
  assert(makeup.items.every(x=>
    x.nativeCategory==='Makeup'&&x.positiveAreaUnresolved));
  const makeupArea=await r.search({
    nativeCategories:['Makeup'],areaCodes:[1]
  });
  assert.equal(makeupArea.total,0);
  assert.deepEqual(makeupArea.items,[]);
  const empty=await r.search({nativeCategories:[],areaCodes:[0]});
  assert.equal(empty.total,0);
  const boundary=await r.search({offset:6743,limit:8});
  assert.equal(boundary.items.length,8);
  assert.deepEqual(boundary.items.map(x=>x.itemId),
    all.slice(6743,6751).map(x=>String(x.itemId)));
});

test('invalid category/area, code-0 mixing, stale corpus, forged item and contradictory status fail closed',async()=>{
  const r=await reader();
  await assert.rejects(r.search({areaCodes:[0,1]}),
    /INVALID_OR_AMBIGUOUS_AREA_CODES/);
  await assert.rejects(r.search({areaCodes:[2,2]}),
    /INVALID_OR_AMBIGUOUS_AREA_CODES/);
  await assert.rejects(r.search({areaCodes:[6]}),
    /INVALID_OR_AMBIGUOUS_AREA_CODES/);
  await assert.rejects(r.search({nativeCategories:['Companion']}),
    /INVALID_CATEGORY_SELECTION/);
  await assert.rejects(r.search({nativeCategories:['Furniture','Furniture']}),
    /INVALID_CATEGORY_SELECTION/);
  await assert.rejects(r.search({limit:121}),/INVALID_PAGE/);
  await assert.rejects(r.search({offset:-1}),/INVALID_PAGE/);
  await assert.rejects(r.getItem('040000001'),/invalid numeric Item ID/);
  const pub=await publicData();
  const stale=joinDb00LocalUnifiedCollectionAreas(pub,{
    ...native,
    async getCoverage(){return {...coverage,unresolvedPositiveAreaItems:511};}
  });
  await assert.rejects(stale.getCoverage(),
    /ORIGINAL_UNIFIED_NATIVE_AREA_CENSUS/);
  const fake=joinDb00LocalUnifiedCollectionAreas(pub,{
    ...native,
    async getItem(id){
      const original=byId.get(id);
      if(!original)return null;
      return {...original,firstProvenPositiveAreaCode:0};
    }
  });
  await assert.rejects(fake.getItem(all[0].itemId),
    /ORIGINAL_SOURCE_ITEM_AND_AREA_MISMATCH/);
  const fakePage=joinDb00LocalUnifiedCollectionAreas(pub,{
    ...native,
    async search(query){
      const base=await native.search(query);
      return {...base,gameCollectionUiMembershipVerified:true};
    }
  });
  await assert.rejects(fakePage.search({limit:10}),
    /SOURCE_UNIFIED_PAGE_CONTRACT_MISMATCH/);
  assert.throws(()=>joinDb00LocalUnifiedCollectionAreas(
    {...pub,hasPrivateGameSource:true},native
  ),/CURRENT_DB00_AND_DB01_LOCAL_SOURCE_REQUIRED/);
  assert(searchCalls>0&&getCalls>0);
});
