import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDb01FurniturePositiveAreaSourceClient,
  DB01_FURNITURE_NATIVE_AREA_PREDICATES,
  DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS,
  DB01_FURNITURE_ORIGINAL_UNASSIGNED_POSITIVE_AREA_COUNT,
} from './furniture-positive-areas.ts';
import {DB01_VERIFIED_FURNITURE_TAG_BRIDGE} from './furniture-tag-bridge.ts';

const counts=DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS;
const worldTags={
  1:2001200028,2:2001200029,3:2001200030,4:2001200040,
  5:2001200066,4097:2001200067,
};
const tagToCode=new Map(Object.entries(worldTags).map(([k,v])=>[v,Number(k)]));
const snapshots=new Map([
  [40000001,{originalNativeClass:'FurnitureItemData',
    nativeHasTagIds:[2001200029,2001200067,2000500006]}],
  [40000002,{originalNativeClass:'FurnitureBlockerItemData',
    nativeHasTagIds:[]}],
  [40000003,{originalNativeClass:'FenceAndRoadItemData',
    nativeHasTagIds:[2001200028]}],
  [40000004,{originalNativeClass:'FurnitureItemData',
    nativeHasTagIds:[2000500006]}],
  [40000005,{originalNativeClass:'FurnitureItemData',
    nativeHasTagIds:[2001200040]}],
]);
function fixture({missing=false,badCount=false,badSource=false}={}){
  const calls=[];
  const native={
    contract:DB01_VERIFIED_FURNITURE_TAG_BRIDGE,
    async getItem(itemId){
      const s=snapshots.get(itemId);
      if(!s)return null;
      return {
        itemId,originalNativeClass:s.originalNativeClass,
        nativeHasTagIds:s.nativeHasTagIds,
        originalFurnitureSourceVerified:true,
        nativeHasTagSemanticsVerified:true,
        collectionUiMembershipVerified:badSource,
        worldAvailabilityVerified:false,
        dlcEntitlementVerified:false,
      };
    },
    async getCoverage(){
      return {
        gameVersion:'1.26.2',sourceFurnitureItems:6746,
        nativeHasTagSourceCompletelyIndexed:!missing,
        gameCollectionAreaMembershipVerified:false,
      };
    },
    async search(query){
      calls.push(query);
      const selected=query.tagIds??[];
      const code=tagToCode.get(selected[0]);
      let total=selected.length===0?6746:
        selected.length===6?6303:counts[code]??0;
      if(badCount&&code===2)total+=1;
      return {
        itemIds:query.limit===0?[]:[40000001].slice(0,query.limit),
        total,hasMore:true,originalNativeHasTagSourceOnly:true,
        gameCollectionAreaMembershipVerified:false,
        playerOwnershipVerified:false,dlcEntitlementVerified:false,
      };
    },
  };
  return {client:createDb01FurniturePositiveAreaSourceClient(native),calls};
}

test('source census has exactly six original area codes and 443 unresolved',()=>{
  assert.deepEqual(Object.entries(counts),
    [['1',4315],['2',434],['3',422],['4',431],['5',478],['4097',223]]);
  assert.equal(Object.values(counts).reduce((sum,x)=>sum+x,0),6303);
  assert.equal(DB01_FURNITURE_ORIGINAL_UNASSIGNED_POSITIVE_AREA_COUNT,443);
  assert.equal(6303+443,6746);
});

test('actual native positive HasTag matches preserve serialized order and first-area selection',async()=>{
  const {client}=fixture();
  assert.equal(client.contract,DB01_FURNITURE_NATIVE_AREA_PREDICATES);
  const item=await client.getItem(40000001);
  assert.deepEqual(item.matchedPositiveAreaCodes,[2,4097]);
  assert.deepEqual(item.matches.map(m=>[m.areaCode,m.gameplayTagId]),
    [[2,2001200029],[4097,2001200067]]);
  assert.equal(item.firstProvenAreaCode,2);
  assert.equal(item.firstSelectedAreaGameplayTagId,2001200029);
  assert.equal(item.positiveNativeHasTagPredicatesVerified,true);
  assert.equal(item.originalAllAreasDefaultHasTagEvaluated,false);
  assert.equal(item.originalAreaConfigsFullSequenceVerified,false);
  assert.equal(item.actualCollectionUiMembershipVerified,false);
  assert.equal(item.gameWorldAvailabilityVerified,false);
  assert.equal(item.playerEntitlementVerified,false);
  assert.equal(Object.isFrozen(item.matches),true);
  assert.equal(Object.isFrozen(item.matchedPositiveAreaCodes),true);
});

test('no positive area stays unresolved and is never converted to Dreamlight Valley',async()=>{
  const {client}=fixture();
  for(const id of [40000002,40000004]){
    const item=await client.getItem(id);
    assert.deepEqual(item.matchedPositiveAreaCodes,[]);
    assert.equal(item.firstProvenAreaCode,null);
    assert.equal(item.firstSelectedAreaGameplayTagId,null);
    assert.equal(item.originalAllAreasDefaultHasTagEvaluated,false);
  }
  assert.deepEqual((await client.getItem(40000003)).matchedPositiveAreaCodes,[1]);
  assert.deepEqual((await client.getItem(40000005)).matchedPositiveAreaCodes,[4]);
  assert.equal(await client.getItem(49999999),null);
  await assert.rejects(client.getItem(0),
    /DB01_FURNITURE_POSITIVE_AREA_INVALID_FURNITURE_ITEM_ID/);
});

test('complete 6746 original source scan requires six exact positive area counts',async()=>{
  const {client,calls}=fixture();
  const coverage=await client.getCoverage();
  assert.equal(coverage.gameVersion,'1.26.2');
  assert.equal(coverage.originalFurnitureCount,6746);
  assert.equal(coverage.anyPositiveAreaTagItems,6303);
  assert.equal(coverage.withoutPositiveAreaTagItems,443);
  assert.deepEqual(coverage.sourceItemsByPositiveArea,
    {1:4315,2:434,3:422,4:431,5:478,4097:223});
  assert.equal(coverage.originalStaticAreaConfigVerified,true);
  assert.equal(coverage.originalPositiveHasTagPredicatesVerified,true);
  assert.equal(coverage.allAreasNativeDefaultTagVerified,false);
  assert.equal(coverage.nativeGameUiAreaMembershipVerified,false);
  assert.equal(calls.length,7);
  assert.equal(calls.every(c=>c.limit===0),true);
  assert.equal(await client.getCoverage(),coverage);
  assert.equal(calls.length,7,'source coverage stays lazy and cached');
});

test('partial, wrong-version and source-altered area counts fail closed',async()=>{
  const incomplete=fixture({missing:true});
  await assert.rejects(incomplete.client.getCoverage(),
    /DB01_FURNITURE_POSITIVE_AREA_INCOMPLETE_PRIVATE_FURNITURE_SOURCE/);
  const altered=fixture({badCount:true});
  await assert.rejects(altered.client.getCoverage(),
    /DB01_FURNITURE_POSITIVE_AREA_ORIGINAL_SOURCE_POSITIVE_AREA_CENSUS_DRIFT/);
  const forged=fixture({badSource:true});
  await assert.rejects(forged.client.getItem(40000001),
    /DB01_FURNITURE_POSITIVE_AREA_SOURCE_NATIVE_HAS_TAG_EVIDENCE_REQUIRED/);
  assert.throws(()=>createDb01FurniturePositiveAreaSourceClient({
    contract:'wrong-native-corpus',
    getItem:async()=>null,getCoverage:async()=>({}),search:async()=>({}),
  }),/DB01_FURNITURE_POSITIVE_AREA_PINNED_NATIVE_FURNITURE_BRIDGE_REQUIRED/);
});

test('positive area search delegates exact Tag OR to the verified native furniture index',async()=>{
  const {client,calls}=fixture();
  const result=await client.search({
    areaCodes:[2,4097],offset:7,limit:12,
  });
  assert.deepEqual(calls[0],{
    tagIds:[2001200029,2001200067],
    tagMatch:'any',offset:7,limit:12,
  });
  assert.deepEqual(result.areaCodes,[2,4097]);
  assert.equal(result.originalPositiveAreaNativeSourceOnly,true);
  assert.equal(result.allAreasMeansUnfilteredSourceItems,false);
  assert.equal(result.areaDefaultNativePredicateEvaluated,false);
  assert.equal(result.actualCollectionUiMembershipVerified,false);
  assert.equal(result.playerOwnershipVerified,false);
  assert.equal(result.dlcEntitlementVerified,false);
  const all=await client.search({areaCodes:[0],limit:30});
  assert.deepEqual(calls[1],{
    tagIds:[],tagMatch:'any',offset:0,limit:30,
  });
  assert.equal(all.total,6746);
  assert.equal(all.allAreasMeansUnfilteredSourceItems,true);
  assert.equal(all.areaDefaultNativePredicateEvaluated,false);
});

test('unknown, ambiguous, duplicate and invalid positive areas reject before source load',async()=>{
  const {client,calls}=fixture();
  for(const query of [
    {areaCodes:[6]}, // 6 is not a native CollectionArea
    {areaCodes:[1,1]},
    {areaCodes:[0,1]},
    {areaCodes:[]},
    {areaCodes:[5,4097,4,3,2,1,0]},
    {areaCodes:[2001200028]}, // Tag ID is not area enum code
    {areaCodes:[-1]},
    {areaCodes:[1],offset:-1},
    {areaCodes:[1],limit:1001},
    {areaCodes:[1],limit:NaN},
  ]){
    await assert.rejects(client.search(query),
      /DB01_FURNITURE_POSITIVE_AREA_/);
  }
  assert.equal(calls.length,0);
});
