import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA,
  DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
  DB01_ORIGINAL_FURNITURE_SET_SHA256,
  DB01_ORIGINAL_FURNITURE_TAG_SHA256,
  DB01_ORIGINAL_FURNITURE_IL2CPP_SHA256,
  DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS,
  validateDb01OriginalFurnitureHasTagManifest,
  createDb01OriginalFurnitureHasTagClient,
} from './furniture-native-has-tag.ts';

const sha=data=>createHash('sha256').update(data).digest('hex');
const encoded=value=>new TextEncoder().encode(JSON.stringify(value)+'\n');
const classes=Object.entries(DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS);
function sourceRow(id,name,type,tags=[]){
  const spec=DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS[type];
  return {
    itemId:id,nativeKey:name,originalNativeClass:type,
    tagsFieldNumber:spec.tagsFieldNumber,nativeTags:tags,
    setLookup:spec.hasSet?{
      kind:'has_set',setItemId:2040000009,
      definition:{kind:'original_set_definition',itemId:2040000009,
        nativeTags:[2000500001,2001200028]},
    }:{kind:'not_ihas_set'},
    nativeHasTagSchemaVerified:true,
    gameUiCollectionMembershipVerified:false,
    dlcEntitlementVerified:false,
  };
}
const makeFixture=()=>{
  const rows=[],buckets=Array.from({length:256},()=>[]);
  let idx=0;
  for(const [type,{count}] of classes){
    for(let n=0;n<count;n++){
      const id=40000001+idx++;
      const row=sourceRow(id,'SyntheticSource!'+id,type,
        n===0?[2001200067]:[]);
      rows.push(row);
      buckets[id%256].push(row);
    }
  }
  assert.equal(rows.length,6746);
  const files={},blobs=new Map();
  for(let i=0;i<256;i++){
    const path='id/'+i.toString(16).padStart(2,'0')+'.json';
    const data=encoded(buckets[i]);
    files[path]={sha256:sha(data),bytes:data.length,count:buckets[i].length};
    blobs.set(path,data);
  }
  const manifest={
    schema:DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA,
    platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
    publicationAuthorized:false,
    sourceFurnitureSha256:DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
    sourceSetSha256:DB01_ORIGINAL_FURNITURE_SET_SHA256,
    sourceTagSha256:DB01_ORIGINAL_FURNITURE_TAG_SHA256,
    sourceIl2cppDumpSha256:DB01_ORIGINAL_FURNITURE_IL2CPP_SHA256,
    originalNativeClassCounts:Object.fromEntries(classes.map(
      ([type,value])=>[type,value.count])),
    sourceDefinitionCount:6746,bucketCount:256,files,
    nativeIHasTagsSubtypesVerified:true,originalSetLookupComplete:true,
    nativeCollectionUiMembershipVerified:false,
    dlcEntitlementVerified:false,playerOwnershipVerified:false,
  };
  const byId=new Map(rows.map(r=>[r.itemId,r]));
  const catalog={
    source:{platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
      fullCorpusParsed:true},
    async getItem(id){
      const r=byId.get(id);
      if(!r)return null;
      return {itemId:r.itemId,nativeCategory:'Furniture',
        catalogDomain:'item',nativeKey:r.nativeKey,
        sourceSha256:DB01_ORIGINAL_FURNITURE_SOURCE_SHA256};
    },
  };
  return {rows,buckets,blobs,manifest,catalog};
};
const fx=makeFixture();
const loader=async path=>{
  const bytes=fx.blobs.get(path);
  if(!bytes)throw new Error('SOURCE_FILE_MISSING');
  return bytes;
};

test('seven native type counts cover all 6746 original source records',()=>{
  const exact={
    FurnitureItemData:5288,LandscapingItemData:526,
    FurnitureBlockerItemData:422,FenceAndRoadItemData:395,
    FurnitureRequestItemData:85,FurnitureSnippetTrapItemData:18,
    FurnitureAncientMachineItemData:12,
  };
  assert.deepEqual(Object.fromEntries(classes.map(
    ([type,spec])=>[type,spec.count])),exact);
  assert.equal(Object.values(exact).reduce((a,b)=>a+b),6746);
  assert.equal(DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS.FurnitureAncientMachineItemData.hasSet,false);
  assert.equal(DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS.FenceAndRoadItemData.tagsFieldNumber,10);
  assert.equal(DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS.FurnitureBlockerItemData.tagsFieldNumber,14);
  assert.equal(DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS.FurnitureSnippetTrapItemData.tagsFieldNumber,7);
});

test('source-pinned manifest and complete 256-shard census verify',()=>{
  validateDb01OriginalFurnitureHasTagManifest(fx.manifest);
  const c=createDb01OriginalFurnitureHasTagClient(
    fx.manifest,loader,fx.catalog);
  assert.equal(c.schema,DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA);
  assert.equal(c.source.sourceFurnitureSha256,
    DB01_ORIGINAL_FURNITURE_SOURCE_SHA256);
  assert.deepEqual(c.source.originalNativeClassCounts,
    fx.manifest.originalNativeClassCounts);
  assert.ok(Object.isFrozen(c.source));
});

test('all seven source classes return exact tags with no cross-class Set inheritance',async()=>{
  const c=createDb01OriginalFurnitureHasTagClient(
    fx.manifest,loader,fx.catalog);
  let offset=0;
  for(const [name,{count}] of classes){
    const source=fx.rows[offset];
    const item=await c.getItem(source.itemId);
    assert.equal(item.original.originalNativeClass,name);
    assert.equal(item.original.tagsFieldNumber,
      DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS[name].tagsFieldNumber);
    assert.equal(item.original.nativeTags[0],2001200067);
    assert.equal(item.sourceShardHashVerified,true);
    assert.equal(item.gameUiCollectionMembershipVerified,false);
    assert.equal(item.original.setLookup.kind,
      name==='FurnitureItemData'?'has_set':'not_ihas_set');
    assert.equal((await c.hasTag(source.itemId,2001200067)).matchingSource,
      'item_tags');
    assert.equal((await c.hasTag(source.itemId,2000500001)).matches,
      name==='FurnitureItemData');
    offset+=count;
  }
  assert.equal(offset,6746);
});

test('private source reader validates item identity against DB-01 catalog',async()=>{
  const c=createDb01OriginalFurnitureHasTagClient(
    fx.manifest,loader,fx.catalog);
  const furniture=fx.rows[3].itemId;
  assert.equal((await c.hasTag(furniture,2001200028)).matchingSource,
    'set_item_tags');
  assert.equal((await c.hasTag(furniture,2000500002)).matches,false);
  assert.equal(await c.hasTag(49999999,2000500001),null);
  await assert.rejects(c.hasTag(0,2001200028),
    /DB01_FURNITURE_SUBTYPE_INVALID_ITEM_ID/);
  await assert.rejects(c.hasTag(furniture,-1),
    /DB01_FURNITURE_SUBTYPE_INVALID_TAG_ID/);
});

test('manifest rejects wrong source digest, class counts, shard metadata, UI flags',()=>{
  for(const override of [
    {sourceFurnitureSha256:'a'.repeat(64)},
    {sourceTagSha256:'b'.repeat(64)},
    {sourceIl2cppDumpSha256:'c'.repeat(64)},
    {gameVersion:'1.25.0'},
    {privateOnly:false},
    {nativeCollectionUiMembershipVerified:true},
    {originalNativeClassCounts:{FurnitureItemData:6746}},
    {bucketCount:8},
  ]){
    assert.throws(()=>validateDb01OriginalFurnitureHasTagManifest(
      {...fx.manifest,...override}),/DB01_FURNITURE_SUBTYPE_/);
  }
  const missing=structuredClone(fx.manifest);
  delete missing.files['id/00.json'];
  assert.throws(()=>validateDb01OriginalFurnitureHasTagManifest(missing),
    /DB01_FURNITURE_SUBTYPE_/);
  const mismatch=structuredClone(fx.manifest);
  mismatch.files['id/00.json'].count++;
  assert.throws(()=>validateDb01OriginalFurnitureHasTagManifest(mismatch),
    /DB01_FURNITURE_SUBTYPE_SOURCE_SHARD_CENSUS/);
});

test('tampered original shard bytes cannot be read or cached as verified',async()=>{
  const id=fx.rows[0].itemId;
  const target='id/'+(id%256).toString(16).padStart(2,'0')+'.json';
  const broken=async path=>path===target?
    new TextEncoder().encode('[]\n'):loader(path);
  const c=createDb01OriginalFurnitureHasTagClient(
    fx.manifest,broken,fx.catalog);
  await assert.rejects(c.getItem(id),/DB01_FURNITURE_SUBTYPE_/);
});

test('even correctly hashed shards cannot inject wrong tag fields or ancient Set inheritance',async()=>{
  const firstAncient=fx.rows.find(r=>
    r.originalNativeClass==='FurnitureAncientMachineItemData');
  const id=firstAncient.itemId;
  const target='id/'+(id%256).toString(16).padStart(2,'0')+'.json';
  const original=JSON.parse(new TextDecoder().decode(fx.blobs.get(target)));
  for(const mutation of [
    row=>{row.tagsFieldNumber=7;},
    row=>{row.setLookup={kind:'has_set',setItemId:2040000009,
      definition:{kind:'original_set_definition',itemId:2040000009,
        nativeTags:[2000500001]}};},
    row=>{row.nativeTags=[-1];},
    row=>{row.gameUiCollectionMembershipVerified=true;},
  ]){
    const invalid=structuredClone(original);
    mutation(invalid.find(x=>x.itemId===id));
    const data=encoded(invalid);
    const manifest=structuredClone(fx.manifest);
    manifest.files[target]={...manifest.files[target],
      sha256:sha(data),bytes:data.length};
    const reader=async path=>path===target?data:loader(path);
    const c=createDb01OriginalFurnitureHasTagClient(
      manifest,reader,fx.catalog);
    await assert.rejects(c.getItem(id),/DB01_FURNITURE_SUBTYPE_/);
  }
});
