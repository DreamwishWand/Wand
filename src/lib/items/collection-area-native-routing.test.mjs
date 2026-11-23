import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB01_COLLECTION_AREA_GAMEASSEMBLY_SHA256,
  DB01_ORIGINAL_COLLECTION_AREA_ROUTING,
  resolveOriginalNativeAreaConfigs,
  resolveOriginalNativeAreaTags,
} from './collection-area-native-routing.ts';
import {DB01_COLLECTION_AREA_SOURCE_CONFIGS} from './collection-area-source-config.ts';

const areaMatches=(codes=[])=>Object.fromEntries(
  DB01_COLLECTION_AREA_SOURCE_CONFIGS.map(x=>
    [x.areaCode,codes.includes(x.areaCode)]));
const available=(codes=[])=>({
  kind:'native_has_tag_evaluated',matchesByArea:areaMatches(codes),
});
const input=(overrides={})=>({
  itemId:30000031,gameVersion:'1.26.2',
  critter:{kind:'not_location_critter'},
  hasTags:available([]),...overrides,
});

test('native method inputs explicitly pinned to Steam binary source',()=>{
  assert.equal(DB01_ORIGINAL_COLLECTION_AREA_ROUTING,
    'wand.db01.collection-area-routing-steam-1262@1');
  assert.equal(DB01_COLLECTION_AREA_GAMEASSEMBLY_SHA256,
    'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653');
});
test('generic IHasTags evaluates all source configs, returns multiple in serialized order',()=>{
  const res=resolveOriginalNativeAreaConfigs(input({
    hasTags:available([4097,5,2]),
  }));
  assert.deepEqual(res.matchedAreaCodes,[2,5,4097]);
  assert.deepEqual(res.areaConfigs.map(x=>x.gameplayTagId),
    [2001200029,2001200066,2001200067]);
  assert.equal(res.methodBranch,'native_has_tags');
  const first=resolveOriginalNativeAreaTags(input({
    hasTags:available([4097,5,2]),
  }));
  assert.deepEqual(first.tagIds,[2001200029]);
  assert.equal(first.firstMatchedAreaCode,2);
  assert.equal(first.selectedAreaCode,2);
  assert.equal(first.usedDreamlightValleyFallback,false);
  assert.equal(first.nativeItemToGameUiAreaMembershipVerified,false);
  assert.equal(first.nativeRoutingAlgorithmReplayed,true);
  assert.equal(first.onlyPurchased,false);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(res.areaConfigs));
  assert.ok(Object.isFrozen(first.tagIds));
});
test('Critter location looks up ProfileWorld Village.SceneItemId, overriding generic tags',()=>{
  const original=input({
    critter:{kind:'location_critter',resolvedVillageSceneItemId:1540000210},
    hasTags:available([1,2]),
  });
  const res=resolveOriginalNativeAreaConfigs(original);
  assert.deepEqual(res.matchedAreaCodes,[4097]);
  assert.equal(res.methodBranch,'critter_village_scene');
  assert.deepEqual(resolveOriginalNativeAreaTags(original).tagIds,
    [2001200067]);
});
test('Critter location without a matching configured scene falls through to HasTag',()=>{
  const unresolved=input({
    critter:{kind:'location_critter',resolvedVillageSceneItemId:null},
    hasTags:available([5]),
  });
  assert.deepEqual(
    resolveOriginalNativeAreaConfigs(unresolved).matchedAreaCodes,[5]);
  const unknownScene=input({
    critter:{kind:'location_critter',resolvedVillageSceneItemId:1540999999},
    hasTags:available([4]),
  });
  assert.deepEqual(
    resolveOriginalNativeAreaConfigs(unknownScene).matchedAreaCodes,[4]);
  const noTag=input({
    critter:{kind:'location_critter',resolvedVillageSceneItemId:1540000209},
    hasTags:{kind:'no_native_has_tags_interface'},
  });
  assert.deepEqual(resolveOriginalNativeAreaTags(noTag).tagIds,[2001200066]);
});
test('GetAreaConfigs can be empty; GetAreaTags falls back to Dreamlight Valley',()=>{
  const none=input({hasTags:{kind:'no_native_has_tags_interface'}});
  assert.deepEqual(resolveOriginalNativeAreaConfigs(none).matchedAreaCodes,[]);
  const a=resolveOriginalNativeAreaTags(none);
  assert.deepEqual(a.tagIds,[2001200028]);
  assert.equal(a.firstMatchedAreaCode,null);
  assert.equal(a.selectedAreaCode,1);
  assert.equal(a.usedDreamlightValleyFallback,true);
  const noMatchingTag=resolveOriginalNativeAreaTags(input());
  assert.equal(noMatchingTag.usedDreamlightValleyFallback,true);
  assert.equal(noMatchingTag.nativeItemToGameUiAreaMembershipVerified,false);
});
test('AllAreas has native source tag 0; no fabricated positive tag',()=>{
  const a=resolveOriginalNativeAreaTags(input({hasTags:available([0,4097])}));
  assert.deepEqual(a.tagIds,[2001200067]);
  assert.equal(a.selectedAreaCode,4097);
  const b=resolveOriginalNativeAreaTags(input({hasTags:available([0])}));
  assert.deepEqual(b.tagIds,[]);
  assert.equal(b.selectedAreaCode,0);
  assert.equal(b.usedDreamlightValleyFallback,false);
});
test('ItemLocationException list is not falsely applied by these two methods',()=>{
  const a=resolveOriginalNativeAreaTags(input({
    itemId:31700022,hasTags:available([3]),
  }));
  assert.equal(a.selectedAreaCode,3);
  assert.equal(a.nativeItemToGameUiAreaMembershipVerified,false);
});
test('partial, unvalidated native HasTag results never default to negative',()=>{
  for(const matchesByArea of [
    {[1]:true}, {}, {...areaMatches(),5:undefined},
    {...areaMatches(),27:false},
    {...areaMatches(),2:'false'},
    null,
  ]){
    assert.throws(
      ()=>resolveOriginalNativeAreaConfigs(input({
        hasTags:{kind:'native_has_tag_evaluated',matchesByArea},
      })),
      /DB01_NATIVE_AREA_INCOMPLETE_HAS_TAG_EVALUATION/);
  }
});
test('unresolved Critter world location fails closed instead of falsely falling back',()=>{
  for(const scene of [undefined,0,-1,1.5,NaN,'1540000209']){
    assert.throws(
      ()=>resolveOriginalNativeAreaConfigs(input({
        critter:{kind:'location_critter',resolvedVillageSceneItemId:scene},
      })),
      /DB01_NATIVE_AREA_RESOLVED_SCENE_REQUIRED/);
  }
  assert.throws(()=>resolveOriginalNativeAreaConfigs(input({
    critter:{kind:'unknown_critter_state'},
  })),/DB01_NATIVE_AREA_CRITTER_STATE_REQUIRED/);
});
test('source game version, positive item ID and HasTag interface state are required',()=>{
  assert.throws(()=>resolveOriginalNativeAreaConfigs(input({itemId:0})),
    /DB01_NATIVE_AREA_INPUT_OR_VERSION_INVALID/);
  assert.throws(()=>resolveOriginalNativeAreaConfigs(input({
    gameVersion:'1.25.0'})),
    /DB01_NATIVE_AREA_INPUT_OR_VERSION_INVALID/);
  assert.throws(()=>resolveOriginalNativeAreaTags(input({
    hasTags:null,
  })),/DB01_NATIVE_AREA_HAS_TAGS_STATE_REQUIRED/);
  assert.throws(()=>resolveOriginalNativeAreaConfigs(input({
    hasTags:{kind:'unproven_direct_source_tag_ids',ids:[2001200028]},
  })),/DB01_NATIVE_AREA_HAS_TAGS_STATE_REQUIRED/);
});
