import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {joinLocalFurnitureCollectionAreaSources}
  from '../src/lib/game-db/local-furniture-areas.ts';
import {
  createDb00LocalFurnitureAreaFacetReader,
  DB00_LOCAL_FURNITURE_AREA_FACETS
} from '../src/lib/game-db/local-furniture-area-facets.ts';
import {
  DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA,
  DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS,
  DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
  DB01_ORIGINAL_FURNITURE_SET_SHA256,
  DB01_ORIGINAL_FURNITURE_TAG_SHA256,
  DB01_ORIGINAL_FURNITURE_IL2CPP_SHA256
} from '../src/lib/items/furniture-native-has-tag.ts';
import {
  DB01_FURNITURE_NATIVE_AREA_PREDICATES,
  DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS,
} from '../src/lib/items/furniture-positive-areas.ts';
import {DB01_COLLECTION_AREA_SOURCE_CONFIGS}
  from '../src/lib/items/collection-area-source-config.ts';

const ROOT=new URL('../static/',import.meta.url);
const fetcher=async url=>{
  assert(url.startsWith('/Wand/')&&!url.includes('..'));
  try{return new Response(readFileSync(new URL(url.slice(6),ROOT)),
    {status:200});}
  catch{return new Response('missing',{status:404});}
};
let sharedPromise;
const app=()=>sharedPromise??=openPublicSharedGameSources('/Wand',fetcher);
const originalHashes=Object.freeze({
  gameVersion:'1.26.2',
  sourceFurnitureSha256:DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
  sourceSetSha256:DB01_ORIGINAL_FURNITURE_SET_SHA256,
  sourceTagSha256:DB01_ORIGINAL_FURNITURE_TAG_SHA256,
  sourceIl2cppDumpSha256:DB01_ORIGINAL_FURNITURE_IL2CPP_SHA256,
  originalNativeClassCounts:Object.freeze(Object.fromEntries(
    Object.entries(DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS).map(([k,v])=>
      [k,v.count])
  ))
});
function original(itemId,klass,tags,setLookup){
  const row=Object.freeze({
    itemId,nativeKey:'synthetic_furniture_'+itemId,
    originalNativeClass:klass,
    tagsFieldNumber:DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS[klass].tagsFieldNumber,
    nativeTags:Object.freeze(tags),setLookup,
    nativeHasTagSchemaVerified:true,
    gameUiCollectionMembershipVerified:false,
    dlcEntitlementVerified:false
  });
  return Object.freeze({
    original:row,gameVersion:'1.26.2',
    input:Object.freeze({itemId,gameVersion:'1.26.2',
      nativeTags:row.nativeTags,setLookup}),
    sourceShardHashVerified:true,
    gameUiCollectionMembershipVerified:false
  });
}
const ORIGINALS=new Map([
  [40000001,original(40000001,'LandscapingItemData',
    [2001200029],Object.freeze({kind:'not_ihas_set'}))],
  [40000002,original(40000002,'FurnitureItemData',
    [],Object.freeze({
      kind:'has_set',setItemId:20000020,
      definition:Object.freeze({
        kind:'original_set_definition',itemId:20000020,
        nativeTags:Object.freeze([2001200067])
      })
    }))],
  [40000003,original(40000003,'FurnitureAncientMachineItemData',
    [],Object.freeze({kind:'not_ihas_set'}))],
  [40000004,original(40000004,'FurnitureItemData',
    [],Object.freeze({
      kind:'has_set',setItemId:0,
      definition:Object.freeze({kind:'missing_original_set_definition'})
    }))]
]);
const originalClient=Object.freeze({
  schema:DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA,
  source:originalHashes,
  getItem:async id=>ORIGINALS.get(id)??null,
  getItems:async ids=>Object.freeze(ids.map(id=>ORIGINALS.get(id)??null)),
  hasTag:async()=>null
});
const BY_ID=new Map([
  [40000001,[2]],[40000002,[4097]],[40000003,[]],[40000004,[]]
]);
const CODES=Object.freeze([1,2,3,4,5,4097]);
const COUNTS=Object.freeze({...DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS});
const CONFIG=new Map(DB01_COLLECTION_AREA_SOURCE_CONFIGS.map(x=>[x.areaCode,x]));
let calls=0;
const positiveClient=Object.freeze({
  contract:DB01_FURNITURE_NATIVE_AREA_PREDICATES,
  gameVersion:'1.26.2',
  async getCoverage(){
    calls++;
    return Object.freeze({
      gameVersion:'1.26.2',originalFurnitureCount:6746,
      anyPositiveAreaTagItems:6303,
      withoutPositiveAreaTagItems:443,
      sourceItemsByPositiveArea:COUNTS,
      originalStaticAreaConfigVerified:true,
      originalPositiveHasTagPredicatesVerified:true,
      allAreasNativeDefaultTagVerified:false,
      nativeGameUiAreaMembershipVerified:false
    });
  },
  async getItem(id){
    if(!ORIGINALS.has(id))return null;
    const codes=BY_ID.get(id);
    const matches=Object.freeze(codes.map(code=>Object.freeze({
      areaCode:code,originalAreaName:CONFIG.get(code).enumName,
      gameplayTagId:CONFIG.get(code).gameplayTagId,
      matchingSource:'original_native_has_tag',
      gameUiMembershipVerified:false
    })));
    return Object.freeze({
      itemId:id,originalNativeFurnitureClass:
        ORIGINALS.get(id).original.originalNativeClass,
      matches,matchedPositiveAreaCodes:Object.freeze([...codes]),
      firstProvenAreaCode:codes[0]??null,
      firstSelectedAreaGameplayTagId:codes[0]?
        CONFIG.get(codes[0]).gameplayTagId:null,
      positiveNativeHasTagPredicatesVerified:true,
      originalAllAreasDefaultHasTagEvaluated:false,
      originalAreaConfigsFullSequenceVerified:false,
      actualCollectionUiMembershipVerified:false,
      gameWorldAvailabilityVerified:false,
      playerEntitlementVerified:false
    });
  },
  async search(query){
    const all=query.areaCodes.length===1&&query.areaCodes[0]===0;
    const ids=[...ORIGINALS.keys()].filter(id=>all||
      BY_ID.get(id).some(code=>query.areaCodes.includes(code)));
    const total=all?6746:
      query.areaCodes.reduce((sum,code)=>sum+COUNTS[code],0);
    const offset=query.offset??0,limit=query.limit??100;
    const itemIds=Object.freeze(ids.slice(offset,offset+limit));
    return Object.freeze({
      areaCodes:Object.freeze([...query.areaCodes]),itemIds,
      total,hasMore:total>offset+itemIds.length,
      originalPositiveAreaNativeSourceOnly:true,
      allAreasMeansUnfilteredSourceItems:all,
      areaDefaultNativePredicateEvaluated:false,
      actualCollectionUiMembershipVerified:false,
      playerOwnershipVerified:false,
      dlcEntitlementVerified:false
    });
  }
});
async function makeReader(index=positiveClient){
  const pub=await app();
  const native=joinLocalFurnitureCollectionAreaSources(pub,originalClient);
  return createDb00LocalFurnitureAreaFacetReader(native,index);
}

test('DB-00 preserves six original positive Furniture census and 443 unresolved AllAreas cases',async()=>{
  const reader=await makeReader();
  const c=await reader.getCoverage();
  assert.equal(reader.contract,DB00_LOCAL_FURNITURE_AREA_FACETS);
  assert.equal(reader.gameVersion,'1.26.2');
  assert.equal(reader.snapshotId,'steam-1.26.2-native-itemlist-v1');
  assert.equal(reader.ownerLocalOnly,true);
  assert.equal(reader.publicationAuthorized,false);
  assert.equal(reader.nativeCollectionUiMembershipVerified,false);
  assert.equal(c.sourceFurnitureDefinitions,6746);
  assert.equal(c.positiveSourceMatches,6303);
  assert.equal(c.noPositiveSourceTagItems,443);
  assert.deepEqual(c.areaCounts,COUNTS);
  assert.equal(Object.values(c.areaCounts).reduce((a,b)=>a+b,0),6303);
  assert.equal(c.nativeAllAreasDefaultVerified,false);
  assert.equal(c.nativeCollectionUiMembershipVerified,false);
  await reader.getCoverage();
  assert.equal(calls,1);
  assert(Object.isFrozen(c)&&Object.isFrozen(c.areaCounts));
});

test('source-positive area filters yield DB-00 Item names and preserve direct or inherited native tags',async()=>{
  const reader=await makeReader();
  const meadow=await reader.search({areaCodes:[2]});
  assert.equal(meadow.total,434);
  assert.equal(meadow.items.length,1);
  assert.equal(meadow.items[0].itemId,'40000001');
  assert.equal(meadow.items[0].shared.itemId,'40000001');
  assert.equal(meadow.items[0].firstProvenAreaCode,2);
  assert.equal(meadow.items[0].original.positiveSourceTagMatches[0]
    .sourceMatchingBranch,'item_tags');
  const honey=await reader.search({areaCodes:[4097]});
  assert.equal(honey.total,223);
  assert.equal(honey.items.length,1);
  assert.equal(honey.items[0].itemId,'40000002');
  assert.equal(honey.items[0].firstProvenAreaCode,4097);
  assert.equal(honey.items[0].original.positiveSourceTagMatches[0]
    .sourceMatchingBranch,'set_item_tags');
  const union=await reader.search({areaCodes:[2,4097]});
  assert.equal(union.total,657);
  assert.deepEqual(union.items.map(x=>x.itemId),
    ['40000001','40000002']);
  assert(union.items.every(x=>x.gameUiCollectionMembershipVerified===false &&
    x.playerOwnershipVerified===false &&
    x.dlcEntitlementVerified===false));
  assert(Object.isFrozen(union.items));
});

test('[0] means all 6746 original Furniture, NOT verified native AllAreas UI membership',async()=>{
  const reader=await makeReader();
  const page=await reader.search({areaCodes:[0],limit:4});
  assert.equal(page.total,6746);
  assert.deepEqual(page.items.map(x=>x.itemId),[
    '40000001','40000002','40000003','40000004'
  ]);
  assert.equal(page.allAreasMeansUnfilteredSourceItems,true);
  assert.equal(page.areaDefaultNativePredicateEvaluated,false);
  assert.equal(page.actualCollectionUiMembershipVerified,false);
  assert.equal(page.playerOwnershipVerified,false);
  assert.equal(page.nextOffset,4);
  assert.deepEqual(page.items[2].positiveAreas.matches,[]);
  assert.equal(page.items[2].firstProvenAreaCode,null);
  assert.equal(page.items[3].firstProvenAreaCode,null);
  assert.equal((await reader.getItem(40000003)).firstProvenAreaCode,null);
  assert.equal(await reader.getItem(31000029),null);
});

test('contradictory index ID, area membership, census and ambiguous AllAreas selection fail closed',async()=>{
  const reader=await makeReader();
  await assert.rejects(reader.search({areaCodes:[0,2]}),
    /INVALID_AREA_SELECTION/);
  await assert.rejects(reader.search({areaCodes:[2,2]}),
    /INVALID_AREA_SELECTION/);
  await assert.rejects(reader.search({areaCodes:[2],limit:201}),
    /INVALID_PAGE/);
  await assert.rejects(reader.search({areaCodes:[2],offset:-1}),
    /INVALID_PAGE/);
  await assert.rejects(reader.getItem('040000001'),
    /invalid numeric Item ID/);
  const mismatched=await makeReader({
    ...positiveClient,
    async search(){return Object.freeze({
      areaCodes:[2],itemIds:[40000002],total:434,hasMore:true,
      originalPositiveAreaNativeSourceOnly:true,
      allAreasMeansUnfilteredSourceItems:false,
      areaDefaultNativePredicateEvaluated:false,
      actualCollectionUiMembershipVerified:false,
      playerOwnershipVerified:false,dlcEntitlementVerified:false
    });}
  });
  await assert.rejects(mismatched.search({areaCodes:[2]}),
    /UNMATCHED_SOURCE_AREA_FILTER_ITEM/);
  const stale=await makeReader({
    ...positiveClient,
    async getCoverage(){return {
      ...(await positiveClient.getCoverage()),anyPositiveAreaTagItems:6302
    };}
  });
  await assert.rejects(stale.getCoverage(),
    /ORIGINAL_POSITIVE_AREA_CENSUS_MISMATCH/);
  assert.throws(()=>createDb00LocalFurnitureAreaFacetReader({
    contract:'invalid',snapshotId:'steam-1.26.2-native-itemlist-v1'
  },positiveClient),/EXACT_DB00_PRIVATE_FURNITURE_READER_REQUIRED/);
  const pub=await app();
  const native=joinLocalFurnitureCollectionAreaSources(pub,originalClient);
  assert.throws(()=>createDb00LocalFurnitureAreaFacetReader(
    native,{...positiveClient,gameVersion:'1.25.0'}),
    /EXACT_DB01_ORIGINAL_POSITIVE_AREA_INDEX_REQUIRED/);
});
