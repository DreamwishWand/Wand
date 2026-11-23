import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB01_ORIGINAL_HAS_TAG_CONTRACT,
  DB01_HAS_TAG_ORIGINAL_SET_SHA256,
  DB01_HAS_TAG_GAMEASSEMBLY_SHA256,
  evaluateOriginalNativeHasTag,
  evaluateOriginalPositiveAreaTags,
  completeOriginalAreaHasTagEvidence,
  validateOriginalHasTagItem,
} from './native-has-tag.ts';
import {
  resolveOriginalNativeAreaConfigs,
  resolveOriginalNativeAreaTags,
} from './collection-area-native-routing.ts';

const noSet=()=>({kind:'not_ihas_set'});
const hasSet=(id,tags)=>({
  kind:'has_set',setItemId:id,
  definition:{kind:'original_set_definition',itemId:id,nativeTags:tags},
});
const original=(data={})=>({
  itemId:31700030,gameVersion:'1.26.2',
  nativeTags:[2001200028],setLookup:noSet(),...data,
});
test('Steam HasTag original source pins are stable',()=>{
  assert.equal(DB01_ORIGINAL_HAS_TAG_CONTRACT,
    'wand.db01.native-has-tag-steam-1262@1');
  assert.match(DB01_HAS_TAG_ORIGINAL_SET_SHA256,/^[a-f0-9]{64}$/);
  assert.equal(DB01_HAS_TAG_ORIGINAL_SET_SHA256,
    '3682f4888244a9a460d08300a00cc873307c9ad3553fb929aaca135efb38708f');
  assert.equal(DB01_HAS_TAG_GAMEASSEMBLY_SHA256,
    'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653');
});
test('direct IHasTags.Tags hit short-circuits the associated Set tags',()=>{
  const i=original({
    nativeTags:[2001200029,2000500001],
    setLookup:hasSet(2100000001,[2000500001,2000500002]),
  });
  const found=evaluateOriginalNativeHasTag(i,2000500001);
  assert.equal(found.matches,true);
  assert.equal(found.matchingSource,'item_tags');
  assert.equal(found.nativeHasTagAlgorithmVerified,true);
  assert.equal(found.runtimeInputVerified,false);
  assert.equal(Object.isFrozen(found),true);
});
test('missing direct tag resolves through ItemDatabase SetItemData.Tags',()=>{
  const i=original({
    nativeTags:[2001200028],
    setLookup:hasSet(2100000101,[2000500005,2000500020]),
  });
  assert.deepEqual(
    [2000500005,2000500020,2001200028,2000500008].map(
      tag=>evaluateOriginalNativeHasTag(i,tag).matchingSource),
    ['set_item_tags','set_item_tags','item_tags','not_found']);
});
test('IHasSet absent or exact original Set lookup missing means no inherited match',()=>{
  const missing=original({
    nativeTags:[],setLookup:{
      kind:'has_set',setItemId:2199999999,
      definition:{kind:'missing_original_set_definition'},
    },
  });
  assert.equal(evaluateOriginalNativeHasTag(missing,2000500001).matches,false);
  assert.equal(evaluateOriginalNativeHasTag(
    original({nativeTags:[],setLookup:noSet()}),2000500001).matches,false);
});
test('positive area tags are computed but default-tag area remains unresolved',()=>{
  const i=original({
    nativeTags:[2001200029,2001200066],
    setLookup:hasSet(2100000101,[2000500001]),
  });
  const evidence=evaluateOriginalPositiveAreaTags(i);
  assert.deepEqual(evidence.byPositiveAreaCode,{
    1:false,2:true,3:false,4:false,5:true,4097:false,
  });
  assert.equal(evidence.allAreasNativeDefaultItemMatch,null);
  assert.equal(evidence.nativeRoutingFullyEvaluated,false);
  assert.equal(evidence.nativeItemToCollectionAreaMembershipVerified,false);
  assert.ok(Object.isFrozen(evidence.byPositiveAreaCode));
});
test('native default Item must be separately evaluated before area replay',()=>{
  const i=original({nativeTags:[2001200067]});
  const partial=evaluateOriginalPositiveAreaTags(i);
  const input={
    itemId:i.itemId,gameVersion:'1.26.2',
    critter:{kind:'not_location_critter'},
    hasTags:completeOriginalAreaHasTagEvidence(partial,false),
  };
  assert.deepEqual(resolveOriginalNativeAreaConfigs(input).matchedAreaCodes,
    [4097]);
  assert.deepEqual(resolveOriginalNativeAreaTags(input).tagIds,[2001200067]);
  assert.equal(resolveOriginalNativeAreaTags(input).usedDreamlightValleyFallback,
    false);
  assert.throws(()=>completeOriginalAreaHasTagEvidence(partial,null),
    /DB01_ORIGINAL_HAS_TAG_INVALID_DEFAULT_EVIDENCE/);
  assert.throws(()=>completeOriginalAreaHasTagEvidence(partial,0),
    /DB01_ORIGINAL_HAS_TAG_INVALID_DEFAULT_EVIDENCE/);
  assert.deepEqual(resolveOriginalNativeAreaConfigs({
    ...input,hasTags:completeOriginalAreaHasTagEvidence(partial,true),
  }).matchedAreaCodes,[4097,0]);
});
test('native default Area bridge rejects forged, partial or extra area codes',()=>{
  const p=evaluateOriginalPositiveAreaTags(original());
  for(const invalid of [
    {...p,byPositiveAreaCode:{1:true}},
    {...p,byPositiveAreaCode:{...p.byPositiveAreaCode,7:true}},
    {...p,byPositiveAreaCode:{...p.byPositiveAreaCode,2:null}},
    {...p,nativeRoutingFullyEvaluated:true},
    {...p,allAreasNativeDefaultItemMatch:false},
    {...p,itemId:0},
  ]){
    assert.throws(()=>completeOriginalAreaHasTagEvidence(invalid,false),
      /DB01_ORIGINAL_HAS_TAG_(INCOMPLETE_AREA_EVIDENCE|INVALID_DEFAULT_EVIDENCE)/);
  }
});
test('version and real source ID must be pinned to Steam 1.26.2',()=>{
  for(const bad of [
    {itemId:0},{itemId:-1},{itemId:1.5},
    {gameVersion:'1.25.0'},
    {nativeTags:null},
    {nativeTags:[-1]},
    {nativeTags:[2001200028,2001200028]},
    {setLookup:null},
    {setLookup:{kind:'unknown'}},
  ]){
    assert.throws(()=>validateOriginalHasTagItem(original(bad)),
      /DB01_ORIGINAL_HAS_TAG_/);
  }
  assert.throws(()=>evaluateOriginalNativeHasTag(original(),-1),
    /DB01_ORIGINAL_HAS_TAG_REQUESTED_TAG_ID/);
});
test('source SetItem reference and returned Set definition identity are strict',()=>{
  for(const data of [
    {kind:'has_set',setItemId:21000001,
      definition:{kind:'original_set_definition',itemId:21000002,nativeTags:[]}},
    {kind:'has_set',setItemId:21000001,
      definition:{kind:'original_set_definition',itemId:21000001,nativeTags:[-2]}},
    {kind:'has_set',setItemId:-10,
      definition:{kind:'original_set_definition',itemId:21000001,nativeTags:[]}},
    {kind:'has_set',setItemId:21000001,definition:null},
    {kind:'has_set',setItemId:21000001,definition:{kind:'not_loaded'}},
  ]){
    assert.throws(()=>evaluateOriginalNativeHasTag(
      original({setLookup:data}),2000500001),/DB01_ORIGINAL_HAS_TAG_/);
  }
});
test('native HasTag no proof of game Collection UI membership, entitlement or ownership',()=>{
  const evaluated=evaluateOriginalNativeHasTag(
    original({setLookup:hasSet(21000001,[2000500001])}),2000500001);
  assert.equal(evaluated.gameCollectionAreaMembershipVerified,false);
  assert.equal(evaluated.dlcEntitlementVerified,false);
});
