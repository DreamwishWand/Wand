import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA,
  DB01_ORIGINAL_COMPANION_SOURCE_SHA256,
  DB01_ORIGINAL_COMPANION_TAG_SHA256,
  DB01_ORIGINAL_COMPANION_IL2CPP_SHA256,
  DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS,
  DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS,
  validateDb01OriginalCompanionManifest,
  createDb01OriginalCompanionClient,
} from './companion-native-has-tag.ts';

const hex=b=>createHash('sha256').update(b).digest('hex');
const json=v=>new TextEncoder().encode(JSON.stringify(v)+'\n');
const areaTags={
  1:2001200028,2:2001200029,3:2001200030,
  4:2001200040,5:2001200066,4097:2001200067,
};
function fixture(){
  let id=120000000;
  const records=[];
  for(const [code,n] of Object.entries({
    1:170,2:20,3:16,4:14,5:17,4097:4,
  })){
    for(let i=0;i<n;i++){
      id++;
      records.push({
        itemId:id,nativeKey:'SyntheticPet!'+id,
        nativeCategory:'Companion',
        originalNativeClass:'PetItemData',nativeKind:'pet',
        nativeTags:[areaTags[code]],tagsFieldNumber:7,
        critterLocationOneofFieldNumber:null,
        originalIHasTagsInterface:true,originalIHasSetInterface:false,
        nativeClassSourceVerified:true,
        runtimeCritterWorldSceneVerified:false,
        gameUiCollectionMembershipVerified:false,dlcEntitlementVerified:false,
      });
    }
  }
  for(let i=0;i<28;i++){
    id++;
    records.push({
      itemId:id,nativeKey:'SyntheticMount!'+id,
      nativeCategory:'Companion',
      originalNativeClass:'MountItemData',nativeKind:'mount',
      nativeTags:i<5?[areaTags[4]]:[],tagsFieldNumber:10,
      critterLocationOneofFieldNumber:null,
      originalIHasTagsInterface:true,originalIHasSetInterface:false,
      nativeClassSourceVerified:true,
      runtimeCritterWorldSceneVerified:false,
      gameUiCollectionMembershipVerified:false,dlcEntitlementVerified:false,
    });
  }
  for(let i=0;i<125;i++){
    id++;
    records.push({
      itemId:id,nativeKey:'SyntheticCritter!'+id,
      nativeCategory:'Companion',
      originalNativeClass:'CritterItemData',nativeKind:'critter',
      nativeTags:null,tagsFieldNumber:null,
      critterLocationOneofFieldNumber:i<105?6:7,
      originalIHasTagsInterface:false,originalIHasSetInterface:false,
      nativeClassSourceVerified:true,
      runtimeCritterWorldSceneVerified:false,
      gameUiCollectionMembershipVerified:false,dlcEntitlementVerified:false,
    });
  }
  assert.equal(records.length,394);
  const byId=new Map(records.map(r=>[r.itemId,r]));
  const shards=Array.from({length:256},()=>[]);
  for(const row of records)shards[row.itemId%256].push(row);
  const blobs=new Map(),ledger={};
  for(let i=0;i<256;i++){
    const path='id/'+i.toString(16).padStart(2,'0')+'.json';
    const raw=json(shards[i]);
    blobs.set(path,raw);
    ledger[path]={sha256:hex(raw),bytes:raw.length,count:shards[i].length};
  }
  const manifest={
    schema:DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA,
    platform:'Steam',gameVersion:'1.26.2',
    privateOnly:true,publicationAuthorized:false,
    sourceCompanionSha256:DB01_ORIGINAL_COMPANION_SOURCE_SHA256,
    sourceTagSha256:DB01_ORIGINAL_COMPANION_TAG_SHA256,
    sourceIl2cppDumpSha256:DB01_ORIGINAL_COMPANION_IL2CPP_SHA256,
    sourceDefinitionCount:394,
    originalNativeClassCounts:DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS,
    bucketCount:256,files:ledger,
    sourcePositiveAreaCountsVerified:true,
    sourceCritterLocationOneofVerified:true,
    sourceNativeHasTagsInterfacesVerified:true,
    sourceCritterRuntimeWorldSceneVerified:false,
    nativeAllAreasDefaultMatchVerified:false,
    actualGameCollectionUiMembershipVerified:false,
    playerOwnershipVerified:false,dlcEntitlementVerified:false,
  };
  const calls={getCategory:0,getItems:0,shards:0};
  const catalog={
    source:{
      platform:'Steam',gameVersion:'1.26.2',
      privateOnly:true,fullCorpusParsed:true,
    },
    async getCategory(category){
      calls.getCategory++;
      assert.equal(category,'Companion');
      return records.map(r=>({
        itemId:r.itemId,nativeKey:r.nativeKey,nativeCategory:r.nativeCategory,
        sourceSha256:DB01_ORIGINAL_COMPANION_SOURCE_SHA256,
        catalogDomain:'item',
      }));
    },
    async getItems(ids){
      calls.getItems++;
      return ids.map(id=>{
        const r=byId.get(id);
        return r?{
          itemId:r.itemId,nativeKey:r.nativeKey,
          nativeCategory:r.nativeCategory,
          sourceSha256:DB01_ORIGINAL_COMPANION_SOURCE_SHA256,
          catalogDomain:'item',
        }:null;
      });
    },
  };
  const loadBytes=async path=>{
    calls.shards++;
    return blobs.get(path);
  };
  return {records,manifest,blobs,catalog,loadBytes,calls};
}
const make=f=>createDb01OriginalCompanionClient(
  f.manifest,f.loadBytes,f.catalog);

test('three original Companion IL2CPP classes are typed separately',()=>{
  assert.deepEqual(DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS,
    {PetItemData:241,MountItemData:28,CritterItemData:125});
  assert.deepEqual(DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS,
    {1:170,2:20,3:16,4:19,5:17,4097:4});
  assert.equal(Object.values(DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS)
    .reduce((a,b)=>a+b,0),246);
});

test('private original Companion manifest requires all 256 SHA-pinned shards',()=>{
  const f=fixture();
  validateDb01OriginalCompanionManifest(f.manifest);
  assert.equal(make(f).schema,DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA);
  for(const overwritten of [
    {schema:'wrong'},
    {privateOnly:false},
    {gameVersion:'1.25.0'},
    {sourceCompanionSha256:'a'.repeat(64)},
    {sourceTagSha256:'b'.repeat(64)},
    {originalNativeClassCounts:{
      PetItemData:242,MountItemData:27,CritterItemData:125,
    }},
    {sourceCritterRuntimeWorldSceneVerified:true},
    {nativeAllAreasDefaultMatchVerified:true},
    {actualGameCollectionUiMembershipVerified:true},
  ]){
    assert.throws(()=>validateDb01OriginalCompanionManifest({
      ...f.manifest,...overwritten,
    }),/DB01_COMPANION_NATIVE_/);
  }
});

test('Pet and Mount have different native direct Tags, Critter is NOT IHasTags',async()=>{
  const f=fixture(),c=make(f);
  const pet=await c.getItem(f.records[0].itemId);
  const mount=await c.getItem(f.records[241].itemId);
  const emptyMount=await c.getItem(f.records[246].itemId);
  const critter=await c.getItem(f.records[269].itemId);
  const sceneCritter=await c.getItem(f.records[374].itemId);
  assert.equal(pet.source.tagsFieldNumber,7);
  assert.deepEqual(pet.positiveNativeAreaCodes,[1]);
  assert.equal(mount.source.tagsFieldNumber,10);
  assert.deepEqual(mount.positiveNativeAreaCodes,[4]);
  assert.deepEqual(emptyMount.source.nativeTags,[]);
  assert.deepEqual(emptyMount.positiveNativeAreaCodes,[]);
  assert.equal(critter.source.originalNativeClass,'CritterItemData');
  assert.equal(critter.source.tagsFieldNumber,null);
  assert.equal(critter.source.nativeTags,null);
  assert.equal(critter.positiveNativeAreaCodes,null);
  assert.equal(critter.needsRuntimeCritterSceneEvaluation,true);
  assert.equal(critter.source.critterLocationOneofFieldNumber,6);
  assert.equal(sceneCritter.source.critterLocationOneofFieldNumber,7);
  assert.equal(critter.originalIHasTagsInterface,false);
  assert.equal(critter.sourceOriginalNativeClassVerified,true);
  assert.equal(critter.actualCollectionUiMembershipVerified,false);
  assert.equal(critter.nativeAllAreasDefaultPredicateVerified,false);
  assert.equal(critter.playerEntitlementVerified,false);
  assert.ok(Object.isFrozen(critter));
  assert.equal(await c.getItem(909999999),null);
});

test('source original HasTag returns explicit no-IHasTags state for Critter',async()=>{
  const f=fixture(),c=make(f);
  const pet=await c.hasTag(f.records[0].itemId,2001200028);
  assert.equal(pet.matches,true);
  assert.equal(pet.matchingSource,'item_tags');
  const noTagMount=await c.hasTag(f.records[250].itemId,2001200028);
  assert.equal(noTagMount.matches,false);
  assert.equal(noTagMount.matchingSource,'not_found');
  const critter=await c.hasTag(f.records[269].itemId,2001200028);
  assert.equal(critter.kind,'no_original_ihas_tags_interface');
  assert.equal(critter.originalLocationOneofFieldNumber,6);
  assert.equal(critter.runtimeCritterSceneRequired,true);
  assert.equal(critter.gameCollectionAreaMembershipVerified,false);
  assert.equal(await c.hasTag(999999999,2001200028),null);
});

test('all 394 original rows, 125 unresolved Critters and 23 nonworld Mounts',async()=>{
  const f=fixture(),c=make(f),coverage=await c.getCoverage();
  assert.equal(coverage.sourceDefinitions,394);
  assert.equal(coverage.sourceNativeTaggedPositiveAreaItems,246);
  assert.equal(coverage.sourceNativeTaggedWithoutPositiveArea,23);
  assert.equal(coverage.sourceCritterLocationOneofCase6,105);
  assert.equal(coverage.sourceCritterSceneOneofCase7,20);
  assert.equal(coverage.sourceCritterRuntimeWorldUnknown,125);
  assert.deepEqual(coverage.sourcePositiveAreaByCode,
    DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS);
  assert.equal(coverage.nativeClassAndInterfaceSourceVerified,true);
  assert.equal(coverage.critterRuntimeCollectionAreaVerified,false);
  assert.equal(coverage.actualGameUiMembershipVerified,false);
  assert.equal(coverage.nativeAllAreasDefaultTagVerified,false);
  assert.equal(await c.getCoverage(),coverage);
  assert.equal(f.calls.getCategory,1);
  assert.ok(f.calls.getItems<=2);
  assert.ok(f.calls.shards<=256);
});

test('original positive source areas exclude Critters from positive-tag queries without asserting negative game world',async()=>{
  const c=make(fixture());
  const all=await c.search({areaCodes:[0],limit:0});
  assert.equal(all.total,394);
  const positive=await c.search({areaCodes:[1,2,3,4,5,4097]});
  assert.equal(positive.total,246);
  const ranch=await c.search({areaCodes:[4]});
  assert.equal(ranch.total,19);
  const pet=await c.search({kinds:['pet'],areaCodes:[1]});
  assert.equal(pet.total,170);
  const critters=await c.search({kinds:['critter'],areaCodes:[0]});
  assert.equal(critters.total,125);
  const critterTag=await c.search({kinds:['critter'],areaCodes:[1]});
  assert.equal(critterTag.total,0);
  assert.equal(critterTag.critterProfileWorldAreaUnresolved,true);
  assert.equal(critterTag.actualCollectionUiMembershipVerified,false);
  assert.equal(critterTag.nativeAllAreasDefaultPredicateVerified,false);
  const mountAll=await c.search({kinds:['mount'],areaCodes:[0]});
  assert.equal(mountAll.total,28);
  const page=await c.search({areaCodes:[0],offset:300,limit:5});
  assert.equal(page.total,394);
  assert.deepEqual(page.itemIds,
    fixture().records.slice(300,305).map(x=>x.itemId));
  assert.equal(page.hasMore,true);
});

test('original source shard corruption or illegal Critter tags cannot pass SHA and class contracts',async()=>{
  const f=fixture(),id=f.records[269].itemId;
  const path='id/'+(id%256).toString(16).padStart(2,'0')+'.json';
  const wrongBlob={...f,loadBytes:async name=>
    name===path?json([]):f.loadBytes(name)};
  await assert.rejects(make(wrongBlob).getItem(id),
    /DB01_COMPANION_NATIVE_SOURCE_SHARD_SIZE/);
  const source=JSON.parse(new TextDecoder().decode(f.blobs.get(path)));
  const altered=source.find(row=>row.itemId===id);
  altered.nativeTags=[];
  altered.tagsFieldNumber=7;
  altered.originalIHasTagsInterface=true;
  const bytes=json(source),manifest=structuredClone(f.manifest);
  manifest.files[path]={...manifest.files[path],
    sha256:hex(bytes),bytes:bytes.length};
  const forged={...f,manifest,loadBytes:async name=>
    name===path?bytes:f.loadBytes(name)};
  await assert.rejects(make(forged).getItem(id),
    /DB01_COMPANION_NATIVE_CRITTER_MUST_NOT_PRETEND_IHAS_TAGS/);
  const wrongCatalog=fixture();
  wrongCatalog.catalog.getItems=async ids=>ids.map(()=>null);
  await assert.rejects(make(wrongCatalog).getItem(id),
    /DB01_COMPANION_NATIVE_SOURCE_CATALOG_ITEM_IDENTITY/);
});

test('mixed invalid enum classes and partial source requests fail closed',async()=>{
  const f=fixture(),c=make(f);
  for(const query of [
    {kinds:['Companion']},
    {kinds:['pet','pet']},
    {areaCodes:[0,1]},
    {areaCodes:[6]},
    {areaCodes:[2001200028]},
    {areaCodes:[]},
    {limit:1001},
    {limit:-1},
    {offset:-1},
  ]){
    await assert.rejects(c.search(query),
      /DB01_COMPANION_NATIVE_INVALID_QUERY_FILTER/);
  }
  await assert.rejects(c.getItems([0]),
    /DB01_COMPANION_NATIVE_BAD_ITEM_BATCH/);
  await assert.rejects(c.getItems(new Array(4097).fill(120000001)),
    /DB01_COMPANION_NATIVE_BAD_ITEM_BATCH/);
  assert.deepEqual(await c.getItems([]),[]);
});
