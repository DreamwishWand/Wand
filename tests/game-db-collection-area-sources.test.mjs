import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';
import {joinLocalGameSources} from '../src/lib/game-db/local-sources.ts';
import {
  createDb00OriginalCollectionAreaReader,
  DB00_COLLECTION_AREA_SOURCE_CONTRACT
} from '../src/lib/game-db/collection-area-sources.ts';
import {
  DB01_ORIGINAL_COLLECTION_AREA_SOURCE,
  DB01_COLLECTION_AREA_UNITYFS_SHA256,
  DB01_COLLECTION_AREA_ORIGINAL_TAG_SHA256,
  DB01_COLLECTION_AREA_ORIGINAL_SCENE_SHA256
} from '../src/lib/items/collection-area-source-config.ts';
import {DB04_WORLD_TAGS} from '../src/lib/world/native-item-scope.ts';

const ROOT=new URL('../static/',import.meta.url);
const read=async url=>{
  assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
  try{return new Response(readFileSync(new URL(url.slice(6),ROOT)),{status:200});}
  catch{return new Response('not found',{status:404});}
};
let cached;
const open=()=>cached??=openPublicSharedGameSources('/Wand',read);
const EXPECTED=[
  [1,'DreamlightValley',2001200028,'IsDreamlightValley',1540000000],
  [2,'EternityIsle',2001200029,'IsEternityIsle',1540000101],
  [3,'StorybookVale',2001200030,'IsStorybookVale',1540000119],
  [4,'WishblossomRanch',2001200040,'IsWishBlossomMountains',1540000162],
  [5,'SeaOfSecrets',2001200066,'isSeaOfSecrets',1540000209],
  [4097,'Honeywood',2001200067,'isHoneywood',1540000210],
  [0,'AllAreas',0,null,0]
];
const ITEM='30000031';
const DB04_AUDIT='a'.repeat(64);
const DB04_ROWS='b'.repeat(64);
const PINS={auditSha256:DB04_AUDIT,rowsSha256:DB04_ROWS};
function db04Stub(app,{wrongTagSource=false,wrongItemTag=false}={}){
  const catalog=app.database.getItem(ITEM);
  assert(catalog);
  const tag=wrongItemTag?'IsEternityIsle':'IsDreamlightValley';
  const source={
    platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
    publicationAuthorized:false,originalItemDefinitions:13202,
    auditSha256:DB04_AUDIT,rowsSha256:DB04_ROWS,
    originalTagSha256:wrongTagSource?'f'.repeat(64):
      DB01_COLLECTION_AREA_ORIGINAL_TAG_SHA256
  };
  const original=Object.freeze({
    itemId:Number(ITEM),nativeCategory:catalog.nativeCategory,
    worldsDirect:Object.freeze([tag]),
    universeTagsDirect:Object.freeze([]),
    universeSetCandidates:Object.freeze([]),
    setDefinitionIds:Object.freeze([])
  });
  return {
    contract:'wand.db04.native-item-scope@1',source,
    getItem(id){return id===Number(ITEM)?original:null;},
    byWorldTag(input,page={}){
      const itemIds=input==='IsDreamlightValley'?[Number(ITEM)]:[];
      const offset=page.offset??0,limit=page.limit??128;
      return Object.freeze({
        evidenceKind:'world_tag_direct',
        tag:input,
        status:'source_native_tag_present',
        itemIds:Object.freeze(itemIds.slice(offset,offset+limit)),
        matchingItemIdsInSourceSubset:itemIds.length,
        offset,limit,
        hasNextPage:offset+limit<itemIds.length,
        nextOffset:offset+limit<itemIds.length?offset+limit:null,
        sourceCoverageComplete:false,
        gameUiMembershipVerified:false,
        acquisitionWorldVerified:false,dlcEntitlementVerified:false
      });
    }
  };
}

test('seven exact original Collection area configurations are published as static DB-00 references without network assets',async()=>{
  const calls=[];
  const app=await openPublicSharedGameSources('/Wand',async url=>{
    calls.push(url);return read(url);
  });
  assert.equal(calls.length,30);
  const areas=app.originalCollectionAreas;
  assert.equal(calls.length,30);
  assert.equal(areas.contract,DB00_COLLECTION_AREA_SOURCE_CONTRACT);
  assert.equal(areas.platform,'Steam');
  assert.equal(areas.gameVersion,'1.26.2');
  assert.equal(areas.sourceConfigCount,7);
  assert.equal(areas.originalUnityFsSha256,DB01_COLLECTION_AREA_UNITYFS_SHA256);
  assert.equal(areas.originalTagSha256,DB01_COLLECTION_AREA_ORIGINAL_TAG_SHA256);
  assert.equal(areas.originalSceneSha256,DB01_COLLECTION_AREA_ORIGINAL_SCENE_SHA256);
  assert.equal(areas.gameUiItemMembershipVerified,false);
  assert.deepEqual(areas.orderedAreas.map(area=>[
    area.areaCode,area.original.enumName,area.original.gameplayTagId,
    area.worldTag,area.original.villageItemId
  ]),EXPECTED);
  assert.deepEqual(areas.orderedAreas.map(a=>a.original),
    DB01_ORIGINAL_COLLECTION_AREA_SOURCE.configs);
  assert(Object.isFrozen(areas));
  assert(Object.isFrozen(areas.orderedAreas));
  assert(areas.orderedAreas.every(a=>Object.isFrozen(a)&&
    a.originalConfigVerified===true&&
    a.sourceTagCandidateOnly===true&&
    a.gameUiItemMembershipVerified===false&&
    a.playerWorldUnlockedVerified===false&&
    a.dlcEntitlementVerified===false));
});

test('DB-00 resolves all six DB-04 original world Tag names and source numeric Tag IDs without inferred player/UI status',async()=>{
  const app=await open();
  const area=app.originalCollectionAreas;
  for(const [code,name,tagId,tagName,villageId] of EXPECTED){
    const byCode=area.getArea(code);
    assert.equal(byCode.original.enumName,name);
    assert.equal(byCode.nativeSceneItemId,villageId||null);
    assert.equal(byCode.worldTag,tagName);
    if(tagName){
      assert.equal(area.getAreaByNativeWorldTag(tagName),byCode);
      assert.equal(area.getAreaByNativeTagId(tagId),byCode);
    }
  }
  assert.deepEqual(DB04_WORLD_TAGS.map(tag=>
    area.getAreaByNativeWorldTag(tag).worldTag),DB04_WORLD_TAGS);
  assert.equal(area.getAreaByNativeTagId(2001209999),null);
  assert.equal(area.getArea(0).worldTag,null);
  assert.equal(area.getArea(4097).original.iconSubObject,
    'icon_map_travel_mini1_honeywood');
  assert.equal(area.isOriginalLocationException('31700022'),true);
  assert.equal(area.isOriginalLocationException('31600011'),true);
  assert.equal(area.isOriginalLocationException('30000031'),false);
  assert.equal(area.originalItemLocationExceptionIds.length,5);
  assert.throws(()=>area.getArea(6),/UNSUPPORTED_AREA_CODE/);
  assert.throws(()=>area.getArea(1.5),/UNSUPPORTED_AREA_CODE/);
  assert.throws(()=>area.getAreaByNativeWorldTag('IsNotRealWorld'),
    /UNKNOWN_WORLD_TAG/);
  assert.throws(()=>area.getAreaByNativeTagId(0),/INVALID_NATIVE_TAG_ID/);
  assert.throws(()=>area.isOriginalLocationException('0031700022'),
    /invalid numeric Item ID/);
});

test('owner-local DB-04 direct native Tags cross-reference static DB-01 CollectionArea config, never runtime UI membership',async()=>{
  const app=await open();
  const local=joinLocalGameSources(app,{
    nativeScope:db04Stub(app),nativeScopePins:PINS
  });
  const source=await local.byOriginalCollectionAreaTag(1,{offset:0,limit:50});
  assert.equal(source.area,app.originalCollectionAreas.getArea(1));
  assert.equal(source.area.original.gameplayTagId,2001200028);
  assert.deepEqual(source.items.map(x=>x.item.itemId),[ITEM]);
  assert.equal(source.sourceTagCandidateOnly,true);
  assert.equal(source.gameUiCollectionMembershipVerified,false);
  assert.equal(source.worldAvailabilityVerified,false);
  assert.equal(source.dlcEntitlementVerified,false);
  assert.equal(source.playerOwnershipVerified,false);
  assert.equal(source.sourcePage.gameUiMembershipVerified,false);
  assert.equal(source.items[0].nativeTagDirectVerified,true);
  assert.equal(source.items[0].originalLocationException,false);
  assert.equal(source.items[0].gameUiCollectionMembershipVerified,false);
  assert.equal(source.items[0].item.nativeWorldTagsCrossChecked,false,
    'only DB-04 supplied, not an independent DB-01 full local corpus join');
  assert.equal(source.items[0].item.originalDefinitionStatus,'source_not_connected');
  assert.deepEqual(source.items[0].item.shared.nativeTags.worldsDirect,
    ['IsDreamlightValley']);
  assert.equal(source.items[0].item.shared.catalog.facts.worlds.state,'unverified');
  assert(Object.isFrozen(source));
  assert(Object.isFrozen(source.items));
  assert(Object.isFrozen(source.items[0]));
  const other=await local.byOriginalCollectionAreaTag(4097);
  assert.equal(other.area.worldTag,'isHoneywood');
  assert.equal(other.items.length,0);
  // The owner-local stub covers exactly one source Item; the all-area query
  // is the public catalog, not a native Tag lookup requiring every local row.
  const published=app.database.queryItems([],{limit:3});
  assert.equal(published.total,13202,'AllAreas is a catalog query, not a Tag');
  await assert.rejects(local.byOriginalCollectionAreaTag(0),
    /ALL_AREAS_HAS_NO_NATIVE_SOURCE_TAG/);
  await assert.rejects(local.byOriginalCollectionAreaTag(6),
    /UNSUPPORTED_AREA_CODE/);
});

test('untrusted DB-04 original Tag SHA or conflicting original Item Tag fails closed',async()=>{
  const app=await open();
  const mismatched=joinLocalGameSources(app,{
    nativeScope:db04Stub(app,{wrongTagSource:true}),
    nativeScopePins:PINS
  });
  await assert.rejects(mismatched.byOriginalCollectionAreaTag(1),
    /DB01_DB04_ORIGINAL_TAG_SOURCE_SHA_MISMATCH/);
  const conflicting=joinLocalGameSources(app,{
    nativeScope:db04Stub(app,{wrongItemTag:true}),
    nativeScopePins:PINS
  });
  await assert.rejects(conflicting.byOriginalCollectionAreaTag(1),
    /DB04_REVERSE_INDEX_IDENTITY_MISMATCH/);
  const noNative=joinLocalGameSources(app,{
    // Even a signed native-source config alone does not create owner-local Item tags.
    nativeScope:db04Stub(app),nativeScopePins:PINS
  });
  assert.equal(noNative.privateDb01Connected,false);
  assert.equal(noNative.privateDb04Connected,true);
  assert.equal(createDb00OriginalCollectionAreaReader().gameUiItemMembershipVerified,
    false);
});
