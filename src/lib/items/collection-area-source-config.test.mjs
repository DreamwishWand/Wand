import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB01_COLLECTION_AREA_STATIC_SOURCE,
  DB01_COLLECTION_AREA_SOURCE_CONFIGS,
  DB01_COLLECTION_ITEM_LOCATION_EXCEPTION_IDS,
  DB01_ORIGINAL_COLLECTION_AREA_SOURCE,
  DB01_COLLECTION_AREA_UNITYFS_SHA256,
  getOriginalCollectionAreaConfig,
  findOriginalCollectionAreaConfigByTag,
} from './collection-area-source-config.ts';
import {DB01_ORIGINAL_COLLECTION_AREAS} from './collection-ui-axes.ts';

test('original Steam v1.26.2 serialized config preserves seven ordered areas, including 4097 Honeywood',()=>{
  assert.deepEqual(DB01_COLLECTION_AREA_SOURCE_CONFIGS.map(x=>x.areaCode),
    [1,2,3,4,5,4097,0]);
  assert.deepEqual(
    DB01_COLLECTION_AREA_SOURCE_CONFIGS.map(x=>x.enumName).sort(),
    DB01_ORIGINAL_COLLECTION_AREAS.map(x=>x.enumName).sort());
  assert.deepEqual(DB01_COLLECTION_AREA_SOURCE_CONFIGS.map(x=>x.gameplayTagId),
    [2001200028,2001200029,2001200030,2001200040,
      2001200066,2001200067,0]);
  assert.deepEqual(DB01_COLLECTION_AREA_SOURCE_CONFIGS.map(x=>x.villageItemId),
    [1540000000,1540000101,1540000119,1540000162,
      1540000209,1540000210,0]);
  assert.deepEqual(DB01_COLLECTION_ITEM_LOCATION_EXCEPTION_IDS,
    [31700022,31700021,31700032,31700033,31600011]);
  assert.equal(DB01_ORIGINAL_COLLECTION_AREA_SOURCE.sourceConfigCount,7);
  assert.equal(DB01_ORIGINAL_COLLECTION_AREA_SOURCE.contract,
    DB01_COLLECTION_AREA_STATIC_SOURCE);
  assert.equal(DB01_ORIGINAL_COLLECTION_AREA_SOURCE.originalUnityFsSha256,
    DB01_COLLECTION_AREA_UNITYFS_SHA256);
  assert.match(DB01_COLLECTION_AREA_UNITYFS_SHA256,/^[a-f0-9]{64}$/);
});
test('serialized source Tag-to-area lookup is exact and does not guess Item membership',()=>{
  for(const row of DB01_COLLECTION_AREA_SOURCE_CONFIGS){
    assert.equal(getOriginalCollectionAreaConfig(row.areaCode),row);
    if(row.gameplayTagId!==0){
      assert.equal(findOriginalCollectionAreaConfigByTag(row.gameplayTagId),row);
      assert.ok(row.tagNativeKey?.length);
      assert.ok(row.villageNativeKey?.length);
    }
    assert.equal(Object.isFrozen(row),true);
  }
  assert.equal(findOriginalCollectionAreaConfigByTag(2001200999),null);
  assert.equal(getOriginalCollectionAreaConfig(4097).tagNativeKey,'isHoneywood');
  assert.equal(getOriginalCollectionAreaConfig(5).tagNativeKey,'isSeaOfSecrets');
  assert.equal(getOriginalCollectionAreaConfig(0).gameplayTagId,0);
  assert.equal(getOriginalCollectionAreaConfig(0).tagNativeKey,null);
  assert.throws(()=>getOriginalCollectionAreaConfig(6),
    /DB01_UNSUPPORTED_ORIGINAL_COLLECTION_AREA_CODE/);
  assert.throws(()=>getOriginalCollectionAreaConfig(1.5),
    /DB01_UNSUPPORTED_ORIGINAL_COLLECTION_AREA_CODE/);
  assert.throws(()=>findOriginalCollectionAreaConfigByTag(0),
    /DB01_INVALID_ORIGINAL_COLLECTION_AREA_TAG_ID/);
  assert.throws(()=>findOriginalCollectionAreaConfigByTag(Number.NaN),
    /DB01_INVALID_ORIGINAL_COLLECTION_AREA_TAG_ID/);
});
test('source verification never asserts runtime Collection membership, purchase or ownership',()=>{
  const s=DB01_ORIGINAL_COLLECTION_AREA_SOURCE;
  assert.equal(s.nativeCollectionAreaConfigVerified,true);
  assert.equal(s.nativeItemToGameUiAreaMembershipVerified,false);
  assert.equal(s.gameWorldAvailabilityVerified,false);
  assert.equal(s.playerPurchaseEntitlementVerified,false);
  assert.equal(s.playerOwnershipVerified,false);
  assert.equal(s.itemLocationExceptionMeaningVerified,false);
  assert.equal(Object.isFrozen(s),true);
  assert.equal(Object.isFrozen(s.configs),true);
  assert.equal(Object.isFrozen(s.originalItemLocationExceptionIds),true);
});
