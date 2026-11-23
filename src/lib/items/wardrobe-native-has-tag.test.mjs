import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA,
  DB01_WARDROBE_CATEGORY_SPECS,
  DB01_WARDROBE_POSITIVE_AREA_CENSUS,
  DB01_WARDROBE_TAG_SHA256,
  DB01_WARDROBE_SET_SHA256,
  DB01_WARDROBE_IL2CPP_SHA256,
  validateDb01WardrobeOriginalManifest,
  createDb01WardrobeOriginalClient,
} from './wardrobe-native-has-tag.ts';

const digest=data=>createHash('sha256').update(data).digest('hex');
const json=value=>new TextEncoder().encode(JSON.stringify(value)+'\n');
const areaTagByCode={
  1:2001200028,2:2001200029,3:2001200030,
  4:2001200040,5:2001200066,4097:2001200067,
};
const counts={
  Clothing:{1:1792,2:19,3:42,4:25,5:132,4097:31},
  Trimming:{1:348,2:0,3:5,4:3,5:5,4097:4},
  Makeup:{1:0,2:0,3:0,4:0,5:0,4097:0},
};
const emptyPrivateTags={2000500001:'Mickey'};
function fixture(){
  let id=50_000_000;
  const all=[];
  for(const [category,spec] of Object.entries(DB01_WARDROBE_CATEGORY_SPECS)){
    const areas=[];
    for(const [code,count] of Object.entries(counts[category])){
      for(let i=0;i<count;i++)areas.push(Number(code));
    }
    if(category==='Makeup'){
      areas.push(...new Array(69).fill(null));
      id=140_100_000;
    }
    if(category==='Trimming')id=160_000_000;
    assert.equal(areas.length,spec.count);
    for(let n=0;n<spec.count;n++){
      id++;
      const setId=category!=='Makeup'&&
        !(category==='Clothing'&&n===2040)?2040000009:0;
      all.push({
        itemId:id,nativeKey:'Synthetic!'+category+'!'+n,
        nativeCategory:category,
        originalNativeClass:spec.originalNativeClass,
        tagsFieldNumber:spec.tagsFieldNumber,
        nativeTags:[areas[n]===null?2001000001:areaTagByCode[areas[n]]],
        setLookup:{
          kind:'has_set',setItemId:setId,
          definition:setId?{
            kind:'original_set_definition',
            itemId:setId,nativeTags:[2000500001],
          }:{kind:'missing_original_set_definition'},
        },
        nativeHasTagSchemaVerified:true,
        gameUiCollectionMembershipVerified:false,
        dlcEntitlementVerified:false,
      });
    }
  }
  assert.equal(all.length,2475);
  const blobs=new Map();
  const shardRows=Array.from({length:256},()=>[]);
  for(const row of all)shardRows[row.itemId%256].push(row);
  const ledger={};
  for(let i=0;i<256;i++){
    const path='id/'+i.toString(16).padStart(2,'0')+'.json';
    const data=json(shardRows[i]);
    blobs.set(path,data);
    ledger[path]={sha256:digest(data),bytes:data.length,count:shardRows[i].length};
  }
  const manifest={
    schema:DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA,
    platform:'Steam',gameVersion:'1.26.2',
    privateOnly:true,publicationAuthorized:false,
    sourceCategorySha256:Object.fromEntries(
      Object.entries(DB01_WARDROBE_CATEGORY_SPECS).map(
        ([k,s])=>[k,s.sha256])),
    sourceTagSha256:DB01_WARDROBE_TAG_SHA256,
    sourceSetSha256:DB01_WARDROBE_SET_SHA256,
    sourceIl2cppDumpSha256:DB01_WARDROBE_IL2CPP_SHA256,
    sourceDefinitionCount:2475,
    originalCategoryCounts:Object.fromEntries(
      Object.entries(DB01_WARDROBE_CATEGORY_SPECS).map(
        ([k,s])=>[k,s.count])),
    bucketCount:256,files:ledger,
    originalIHasTagsAndIHasSetVerified:true,
    sourceSetReferenceLookupComplete:true,
    sourcePositiveAreaCountsVerified:true,
    nativeAllAreasDefaultTagVerified:false,
    actualCollectionUiMembershipVerified:false,
    playerOwnershipVerified:false,
    dlcEntitlementVerified:false,
  };
  const map=new Map(all.map(row=>[row.itemId,row]));
  const calls={category:0,batch:0,shards:0};
  const catalog={
    source:{
      platform:'Steam',gameVersion:'1.26.2',
      privateOnly:true,fullCorpusParsed:true,
    },
    async getItem(itemId){
      const r=map.get(itemId);
      return r?{
        itemId:r.itemId,nativeCategory:r.nativeCategory,
        nativeKey:r.nativeKey,sourceSha256:
          DB01_WARDROBE_CATEGORY_SPECS[r.nativeCategory].sha256,
        catalogDomain:'item',
      }:null;
    },
    async getItems(ids){
      calls.batch++;
      return Promise.all(ids.map(id=>this.getItem(id)));
    },
    async getCategory(category){
      calls.category++;
      return all.filter(r=>r.nativeCategory===category).map(r=>({
        itemId:r.itemId,nativeKey:r.nativeKey,
        nativeCategory:r.nativeCategory,sourceSha256:
          DB01_WARDROBE_CATEGORY_SPECS[r.nativeCategory].sha256,
        catalogDomain:'item',
      }));
    },
  };
  const loadBytes=async path=>{
    calls.shards++;
    if(!blobs.has(path))throw Error('UNKNOWN_SHARD');
    return blobs.get(path);
  };
  return {all,manifest,catalog,blobs,loadBytes,calls};
}
const fx=fixture();
const client=f=>createDb01WardrobeOriginalClient(
  f.manifest,f.loadBytes,f.catalog);
const first=category=>fx.all.find(r=>r.nativeCategory===category);

test('all three native source classes have original IHasSet and exact field numbers',()=>{
  assert.equal(Object.values(DB01_WARDROBE_CATEGORY_SPECS)
    .reduce((a,s)=>a+s.count,0),2475);
  assert.deepEqual(Object.entries(DB01_WARDROBE_CATEGORY_SPECS)
    .map(([k,s])=>[k,s.tagsFieldNumber,s.setFieldNumber,s.count]),
    [['Clothing',9,8,2041],['Trimming',10,9,365],['Makeup',15,14,69]]);
  assert.deepEqual(DB01_WARDROBE_POSITIVE_AREA_CENSUS,
    {1:2140,2:19,3:47,4:28,5:137,4097:35});
  assert.equal(Object.values(DB01_WARDROBE_POSITIVE_AREA_CENSUS)
    .reduce((a,b)=>a+b),2406);
});

test('SHA-pinned private manifest requires complete 2475 rows and 256 shards',()=>{
  validateDb01WardrobeOriginalManifest(fx.manifest);
  assert.equal(client(fx).gameVersion,'1.26.2');
  assert.equal(client(fx).schema,DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA);
  for(const broken of [
    {sourceCategorySha256:{Clothing:'a'.repeat(64)}},
    {sourceSetSha256:'f'.repeat(64)},
    {sourceTagSha256:'f'.repeat(64)},
    {originalCategoryCounts:{Makeup:70}},
    {actualCollectionUiMembershipVerified:true},
    {privateOnly:false},
    {gameVersion:'1.25.0'},
    {sourcePositiveAreaCountsVerified:false},
    {nativeAllAreasDefaultTagVerified:true},
  ]){
    assert.throws(()=>validateDb01WardrobeOriginalManifest(
      {...fx.manifest,...broken}),/DB01_WARDROBE_ORIGINAL_/);
  }
  const altered=structuredClone(fx.manifest);
  altered.files['id/00.json'].count++;
  assert.throws(()=>validateDb01WardrobeOriginalManifest(altered),
    /DB01_WARDROBE_ORIGINAL_SOURCE_SHARD_CENSUS_DRIFT/);
});

test('actual per-item native HasTag direct, inherited Set, missing Set and no makeup world',async()=>{
  const c=client(fx);
  const cloth=await c.getItem(first('Clothing').itemId);
  const trim=await c.getItem(first('Trimming').itemId);
  const makeup=await c.getItem(first('Makeup').itemId);
  assert.equal(cloth.original.tagsFieldNumber,9);
  assert.equal(trim.original.tagsFieldNumber,10);
  assert.equal(makeup.original.tagsFieldNumber,15);
  assert.equal(cloth.sourceShardHashVerified,true);
  assert.deepEqual(cloth.positiveAreaCodes,[1]);
  assert.deepEqual(trim.positiveAreaCodes,[1]);
  assert.deepEqual(makeup.positiveAreaCodes,[]);
  assert.equal(makeup.original.setLookup.setItemId,0);
  assert.equal((await c.hasTag(cloth.original.itemId,2001200028))
    .matchingSource,'item_tags');
  assert.equal((await c.hasTag(cloth.original.itemId,2000500001))
    .matchingSource,'set_item_tags');
  assert.equal((await c.hasTag(makeup.original.itemId,2000500001))
    .matchingSource,'not_found');
  assert.equal((await c.hasTag(makeup.original.itemId,2001000001))
    .matchingSource,'item_tags');
  assert.equal(cloth.gameUiCollectionMembershipVerified,false);
  assert.equal(makeup.worldAvailabilityVerified,false);
  assert.equal(makeup.dlcEntitlementVerified,false);
  assert.equal(Object.isFrozen(trim.positiveAreaCodes),true);
  assert.equal(await c.getItem(499999999),null);
});

test('full 2475 source and 2405 Set join respects exact six original area counts',async()=>{
  const f=fixture(),c=client(f);
  const coverage=await c.getCoverage();
  assert.equal(coverage.sourceDefinitionCount,2475);
  assert.equal(coverage.sourceResolvedSetItemReferences,2405);
  assert.equal(coverage.sourceWithoutSetReference,70);
  assert.equal(coverage.positiveAreaItems,2406);
  assert.equal(coverage.sourceUnassignedPositiveAreaItems,69);
  assert.deepEqual(coverage.positiveAreaByCode,
    {1:2140,2:19,3:47,4:28,5:137,4097:35});
  assert.deepEqual(coverage.originalCategoryCounts,
    {Clothing:2041,Trimming:365,Makeup:69});
  assert.equal(coverage.sourceVerifiedPositiveAreaPredicates,true);
  assert.equal(coverage.originalAllAreasDefaultHasTagEvaluated,false);
  assert.equal(coverage.runtimeCollectionUiMembershipVerified,false);
  assert.equal(await c.getCoverage(),coverage);
  assert.equal(f.calls.category,3);
  assert.ok(f.calls.batch<8);
  assert.ok(f.calls.shards<=256);
});

test('source-only area and native Tag search are distinct from game UI availability',async()=>{
  const c=client(fixture());
  const area=await c.search({areaCodes:[2,3],limit:10});
  assert.equal(area.total,66);
  assert.equal(area.itemIds.length,10);
  assert.equal(area.hasMore,true);
  assert.equal(area.sourceNativeHasTagMatchesOnly,true);
  assert.equal(area.allAreasDefaultNativePredicateEvaluated,false);
  assert.equal(area.actualCollectionUiMembershipVerified,false);
  const onlyMakeup=await c.search({
    nativeCategories:['Makeup'],areaCodes:[0],
  });
  assert.equal(onlyMakeup.total,69);
  const noMakeup=await c.search({
    nativeCategories:['Makeup'],areaCodes:[1],
  });
  assert.equal(noMakeup.total,0);
  const inherited=await c.search({tagIds:[2000500001],limit:0});
  assert.equal(inherited.total,2405);
  const directOnly=await c.search({
    tagIds:[2000500001],includeInheritedSetTags:false,
  });
  assert.equal(directOnly.total,0);
  const paged=await c.search({
    nativeCategories:['Clothing'],areaCodes:[1],offset:10,limit:4,
  });
  assert.equal(paged.total,1792);
  assert.equal(paged.itemIds.length,4);
  assert.deepEqual(paged.itemIds,fx.all.slice(10,14).map(r=>r.itemId));
  assert.equal(paged.playerEntitlementVerified,false);
});

test('missing or corrupted shard bytes and wrong canonical item IDs cannot pass',async()=>{
  const f=fixture();
  const id=first('Clothing').itemId;
  const path='id/'+(id%256).toString(16).padStart(2,'0')+'.json';
  const broken={...f,loadBytes:async key=>key===path?
    new TextEncoder().encode('[]\n'):f.loadBytes(key)};
  await assert.rejects(client(broken).getItem(id),
    /DB01_WARDROBE_ORIGINAL_SOURCE_SHARD_/);
  const badCatalog=fixture();
  badCatalog.catalog.getItems=async ids=>ids.map(()=>null);
  await assert.rejects(client(badCatalog).getItem(id),
    /DB01_WARDROBE_ORIGINAL_DB01_CATALOG_ORIGINAL_ITEM_IDENTITY/);
});

test('a valid source digest cannot authorize forged native classes or Set types',async()=>{
  const f=fixture(),id=first('Makeup').itemId;
  const path='id/'+(id%256).toString(16).padStart(2,'0')+'.json';
  const source=JSON.parse(new TextDecoder().decode(f.blobs.get(path)));
  for(const modify of [
    row=>{row.tagsFieldNumber=9;},
    row=>{row.originalNativeClass='FurnitureItemData';},
    row=>{row.setLookup.kind='not_ihas_set';},
    row=>{row.gameUiCollectionMembershipVerified=true;},
    row=>{row.nativeTags=[-1];},
  ]){
    const changed=structuredClone(source);
    modify(changed.find(r=>r.itemId===id));
    const encoded=json(changed);
    const manifest=structuredClone(f.manifest);
    manifest.files[path]={...manifest.files[path],
      bytes:encoded.length,sha256:digest(encoded)};
    const forged={
      ...f,manifest,
      loadBytes:async key=>key===path?encoded:f.loadBytes(key),
    };
    await assert.rejects(client(forged).getItem(id),
      /DB01_WARDROBE_ORIGINAL_/);
  }
});

test('invalid search parameters and oversized batches fail before source requests',async()=>{
  const f=fixture(),c=client(f);
  for(const query of [
    {nativeCategories:['Furniture']},
    {nativeCategories:['Makeup','Makeup']},
    {areaCodes:[]},
    {areaCodes:[0,1]},
    {areaCodes:[6]},
    {areaCodes:[2001200028]},
    {tagIds:[0]},
    {tagIds:[2000500001,2000500001]},
    {tagMatch:'none'},
    {includeInheritedSetTags:0},
    {offset:-1},
    {limit:1001},
  ]){
    await assert.rejects(c.search(query),
      /DB01_WARDROBE_ORIGINAL_/);
  }
  await assert.rejects(c.getItems([0]),
    /DB01_WARDROBE_ORIGINAL_INVALID_ITEM_BATCH/);
  await assert.rejects(c.getItems(new Array(4097).fill(50000001)),
    /DB01_WARDROBE_ORIGINAL_INVALID_ITEM_BATCH/);
  assert.deepEqual(await c.getItems([]),[]);
  assert.equal(f.calls.shards,0);
});
