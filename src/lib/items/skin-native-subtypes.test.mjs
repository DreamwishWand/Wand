import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  DB01_ORIGINAL_SKIN_NATIVE_SCHEMA,
  DB01_ORIGINAL_SKIN_SHA256,
  DB01_ORIGINAL_SKIN_TAG_SHA256,
  DB01_ORIGINAL_SKIN_IL2CPP_SHA256,
  DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS,
  DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS,
  validateDb01OriginalSkinManifest,
  createDb01OriginalSkinClient,
} from './skin-native-subtypes.ts';

const hex=b=>createHash('sha256').update(b).digest('hex');
const encode=v=>new TextEncoder().encode(JSON.stringify(v)+'\n');
const areaTags={
  1:2001200028,2:2001200029,3:2001200030,
  4:2001200040,5:2001200066,4097:2001200067,
};
function fake(){
  const originals=[];
  const positive={
    1700:{1:5,2:3,3:1,4:1,5:0,4097:7},
    1702:{1:0,2:0,3:2,4:0,5:2,4097:0},
  };
  const tagged={1700:49,1701:3,1702:19};
  for(const [cls,spec] of Object.entries(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS)){
    const allowed=[];
    for(const [area,num] of Object.entries(positive[spec.sourceIdBand]??{})){
      for(let i=0;i<num;i++)allowed.push(areaTags[area]);
    }
    for(let i=allowed.length;i<(tagged[spec.sourceIdBand]??0);i++){
      allowed.push(2000500001);
    }
    for(let i=0;i<spec.count;i++){
      const itemId=spec.sourceIdBand*100000+i;
      const nativeTags=spec.tagsFieldNumber===null?null:
        i<allowed.length?[allowed[i]]:[];
      originals.push({
        itemId,nativeKey:'SyntheticSkin!'+itemId,nativeCategory:'Skin',
        sourceIdBand:spec.sourceIdBand,sourceProtobufClass:cls,
        tagsFieldNumber:spec.tagsFieldNumber,nativeTags,
        originalIHasTagsInterface:spec.tagsFieldNumber!==null,
        originalIHasSetInterface:false,
        sourceSubtypeLayoutVerified:true,
        nativeRuntimeObjectTypeIndependentlyVerified:false,
        actualCollectionUiMembershipVerified:false,
        nativeAllAreasDefaultPredicateVerified:false,
        playerEntitlementVerified:false,dlcEntitlementVerified:false,
      });
    }
  }
  assert.equal(originals.length,163);
  const byId=new Map(originals.map(row=>[row.itemId,row]));
  const chunks=Array.from({length:256},()=>[]);
  for(const row of originals)chunks[row.itemId%256].push(row);
  const shards=new Map(),files={};
  for(let i=0;i<256;i++){
    const path='id/'+i.toString(16).padStart(2,'0')+'.json';
    const raw=encode(chunks[i]);
    shards.set(path,raw);
    files[path]={sha256:hex(raw),bytes:raw.length,count:chunks[i].length};
  }
  const manifest={
    schema:DB01_ORIGINAL_SKIN_NATIVE_SCHEMA,
    platform:'Steam',gameVersion:'1.26.2',
    privateOnly:true,publicationAuthorized:false,
    sourceSkinSha256:DB01_ORIGINAL_SKIN_SHA256,
    sourceTagSha256:DB01_ORIGINAL_SKIN_TAG_SHA256,
    sourceIl2cppDumpSha256:DB01_ORIGINAL_SKIN_IL2CPP_SHA256,
    sourceDefinitionCount:163,
    originalSourceProtobufClassCounts:Object.fromEntries(
      Object.entries(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS)
        .map(([k,s])=>[k,s.count])),
    originalSourcePositiveAreaCounts:Object.fromEntries(
      Object.entries(DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS)
        .map(([k,v])=>[k,v])),
    nativeIHasTagsAndSetInterfacesVerified:true,
    nativeRuntimeObjectTypeIndependentlyVerified:false,
    nativeAllAreasDefaultPredicateVerified:false,
    actualCollectionUiMembershipVerified:false,
    playerEntitlementVerified:false,
    dlcEntitlementVerified:false,
    bucketCount:256,files,
  };
  const calls={category:0,items:0,shards:0};
  const catalog={
    source:{
      platform:'Steam',gameVersion:'1.26.2',
      privateOnly:true,fullCorpusParsed:true,
    },
    async getItems(ids){
      calls.items++;
      return ids.map(id=>{
        const row=byId.get(id);
        return row?{
          itemId:id,nativeCategory:'Skin',
          nativeKey:row.nativeKey,
          sourceSha256:DB01_ORIGINAL_SKIN_SHA256,
          catalogDomain:'item',
        }:null;
      });
    },
    async getCategory(category){
      calls.category++;
      assert.equal(category,'Skin');
      return originals.map(row=>({
        itemId:row.itemId,nativeKey:row.nativeKey,
        nativeCategory:'Skin',
        sourceSha256:DB01_ORIGINAL_SKIN_SHA256,
        catalogDomain:'item',
      }));
    },
  };
  const loadBytes=async path=>{
    calls.shards++;
    return shards.get(path);
  };
  return {originals,shards,manifest,catalog,loadBytes,calls};
}
const client=f=>createDb01OriginalSkinClient(
  f.manifest,f.loadBytes,f.catalog);
const sample=(f,cls)=>f.originals.find(x=>x.sourceProtobufClass===cls);

test('Steam 1.26.2 Skin source layouts total 163 with exactly 4 no-IHasTags items',()=>{
  assert.equal(Object.values(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS)
    .reduce((a,b)=>a+b.count,0),163);
  assert.equal(Object.values(DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS)
    .reduce((a,b)=>a+b,0),21);
  assert.equal(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS.MountSkinItemData.tagsFieldNumber,null);
  assert.equal(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS.BoatSkinItemData.tagsFieldNumber,null);
  assert.equal(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS.CharacterSkinItemData.tagsFieldNumber,11);
  assert.equal(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS.StallSkinItemData.tagsFieldNumber,18);
});

test('256 SHA ledger and all original class counts are version and source pinned',()=>{
  const f=fake();
  validateDb01OriginalSkinManifest(f.manifest);
  const api=client(f);
  assert.equal(api.schema,DB01_ORIGINAL_SKIN_NATIVE_SCHEMA);
  assert.equal(api.gameVersion,'1.26.2');
  for(const override of [
    {schema:'wrong'},
    {privateOnly:false},
    {gameVersion:'1.26.1'},
    {sourceSkinSha256:'a'.repeat(64)},
    {sourceTagSha256:'b'.repeat(64)},
    {sourceDefinitionCount:164},
    {originalSourceProtobufClassCounts:{CharacterSkinItemData:92}},
    {nativeRuntimeObjectTypeIndependentlyVerified:true},
    {nativeAllAreasDefaultPredicateVerified:true},
    {actualCollectionUiMembershipVerified:true},
  ]){
    assert.throws(()=>validateDb01OriginalSkinManifest({
      ...f.manifest,...override,
    }),/DB01_SKIN_SOURCE_/);
  }
});

test('actual original source item direct Tags and no-IHasTags are distinct states',async()=>{
  const f=fake(),api=client(f);
  const character=await api.getItem(sample(f,'CharacterSkinItemData').itemId);
  const building=await api.getItem(sample(f,'BuildingOtherSkinItemData').itemId);
  const mount=await api.getItem(sample(f,'MountSkinItemData').itemId);
  const boat=await api.getItem(sample(f,'BoatSkinItemData').itemId);
  const noTag=await api.getItem(f.originals.find(x=>
    x.sourceProtobufClass==='CharacterSkinItemData'&&
    x.nativeTags.length===0).itemId);
  assert.equal(character.source.sourceProtobufClass,'CharacterSkinItemData');
  assert.deepEqual(character.positiveNativeAreaCodes,[1]);
  assert.equal(building.source.tagsFieldNumber,18);
  assert.deepEqual(building.positiveNativeAreaCodes,[3]);
  assert.equal(mount.sourceNativeTagState,'not_ihas_tags');
  assert.equal(boat.sourceNativeTagState,'not_ihas_tags');
  assert.equal(noTag.sourceNativeTagState,'no_positive_native_tag');
  assert.equal(mount.source.nativeTags,null);
  assert.equal(noTag.source.nativeTags.length,0);
  assert.equal(mount.positiveNativeAreaCodes,null);
  assert.deepEqual(noTag.positiveNativeAreaCodes,[]);
  assert.equal(character.runtimeNativeClassIndependentlyVerified,false);
  assert.equal(character.gameCollectionUiMembershipVerified,false);
  assert.equal(mount.dlcEntitlementVerified,false);
  assert.equal(Object.isFrozen(mount),true);
  assert.equal(await api.getItem(250000000),null);
});

test('source native HasTag is evaluated directly when implemented; otherwise explicitly unavailable',async()=>{
  const f=fake(),api=client(f);
  const character=sample(f,'CharacterSkinItemData').itemId;
  const mount=sample(f,'MountSkinItemData').itemId;
  const found=await api.hasTag(character,2001200028);
  assert.equal(found.matches,true);
  assert.equal(found.matchingSource,'item_tags');
  const absent=await api.hasTag(character,2001200066);
  assert.equal(absent.matches,false);
  assert.equal(absent.matchingSource,'not_found');
  const unsupported=await api.hasTag(mount,2001200028);
  assert.equal(unsupported.kind,'no_native_ihas_tags');
  assert.equal(unsupported.sourceProtobufClass,'MountSkinItemData');
  assert.equal(unsupported.nativeRuntimeClassIndependentlyVerified,false);
  assert.equal(await api.hasTag(200000000,2001200028),null);
});

test('full private source validates 163 IDs, 71 direct tagged, 21 positive, 138 tag-empty area, 4 non-IHasTags',async()=>{
  const f=fake(),api=client(f);
  const coverage=await api.getCoverage();
  assert.equal(coverage.originalSourceDefinitions,163);
  assert.equal(coverage.sourceWithDirectTags,71);
  assert.equal(coverage.sourceWithPositiveAreaTag,21);
  assert.equal(coverage.sourceIHasTagsWithoutPositiveArea,138);
  assert.equal(coverage.sourceWithoutIHasTagsInterface,4);
  assert.deepEqual(coverage.sourcePositiveAreasByCode,
    DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS);
  assert.deepEqual(coverage.originalSubtypeCounts,
    Object.fromEntries(Object.entries(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS)
      .map(([k,s])=>[k,s.count])));
  assert.equal(coverage.nativeRuntimeClassIndependentlyVerified,false);
  assert.equal(coverage.gameCollectionUiMembershipVerified,false);
  assert.equal(await api.getCoverage(),coverage);
  assert.equal(f.calls.category,1);
  assert.equal(f.calls.items,1);
  assert.ok(f.calls.shards<=256);
});

test('source-only filtering preserves unfiltered non-IHasTags items; positive area excludes only native Tag evidence',async()=>{
  const api=client(fake());
  const all=await api.search({areaCodes:[0]});
  assert.equal(all.total,163);
  const positive=await api.search({
    areaCodes:[1,2,3,4,5,4097],
  });
  assert.equal(positive.total,21);
  const honeywood=await api.search({areaCodes:[4097]});
  assert.equal(honeywood.total,7);
  const mountAll=await api.search({
    sourceProtobufClasses:['MountSkinItemData','BoatSkinItemData'],
    areaCodes:[0],
  });
  assert.equal(mountAll.total,4);
  const mountPositive=await api.search({
    sourceProtobufClasses:['MountSkinItemData','BoatSkinItemData'],
    areaCodes:[1],
  });
  assert.equal(mountPositive.total,0);
  assert.equal(mountPositive.originalSourceOnly,true);
  assert.equal(mountPositive.untaggedClassesExcludedOnlyFromPositiveTagQuery,true);
  assert.equal(mountPositive.gameCollectionUiMembershipVerified,false);
  assert.equal(mountPositive.allAreasNativeDefaultVerified,false);
  const page=await api.search({
    areaCodes:[0],offset:10,limit:12,
  });
  assert.equal(page.total,163);
  assert.deepEqual(page.itemIds,
    fake().originals.slice(10,22).map(x=>x.itemId));
  assert.equal(page.hasMore,true);
});

test('invalid original filter, duplicate classes, mixed code zero and paging fail before IO',async()=>{
  const f=fake(),api=client(f);
  for(const query of [
    {sourceProtobufClasses:['FurnitureItemData']},
    {sourceProtobufClasses:['MountSkinItemData','MountSkinItemData']},
    {areaCodes:[]},
    {areaCodes:[0,1]},
    {areaCodes:[6]},
    {areaCodes:[2001200028]},
    {areaCodes:[1,1]},
    {limit:-1},
    {offset:-1},
    {limit:1001},
  ]){
    await assert.rejects(api.search(query),/DB01_SKIN_SOURCE_/);
  }
  assert.equal(f.calls.shards,0);
  await assert.rejects(api.getItems([0]),/DB01_SKIN_SOURCE_INVALID_SOURCE_ITEM_BATCH/);
  await assert.rejects(api.getItems(new Array(4097).fill(170000000)),
    /DB01_SKIN_SOURCE_INVALID_SOURCE_ITEM_BATCH/);
  assert.deepEqual(await api.getItems([]),[]);
});

test('malicious source cannot forge class layout or new IHasTags even with recomputed SHA ledger',async()=>{
  const f=fake(),id=sample(f,'MountSkinItemData').itemId;
  const path='id/'+(id%256).toString(16).padStart(2,'0')+'.json';
  for(const mutate of [
    row=>{row.sourceIdBand=1700;},
    row=>{row.sourceProtobufClass='CharacterSkinItemData';},
    row=>{row.originalIHasTagsInterface=true;row.nativeTags=[];row.tagsFieldNumber=11;},
    row=>{row.nativeRuntimeObjectTypeIndependentlyVerified=true;},
    row=>{row.actualCollectionUiMembershipVerified=true;},
  ]){
    const rows=JSON.parse(new TextDecoder().decode(f.shards.get(path)));
    mutate(rows.find(x=>x.itemId===id));
    const bytes=encode(rows),manifest=structuredClone(f.manifest);
    manifest.files[path]={...manifest.files[path],
      sha256:hex(bytes),bytes:bytes.length};
    const corrupted={...f,manifest,loadBytes:async p=>
      p===path?bytes:f.loadBytes(p)};
    await assert.rejects(client(corrupted).getItem(id),
      /DB01_SKIN_SOURCE_/);
  }
});

test('original shard bytes and canonical Item identity must remain exact',async()=>{
  const f=fake(),id=f.originals[0].itemId;
  const path='id/'+(id%256).toString(16).padStart(2,'0')+'.json';
  await assert.rejects(client({...f,loadBytes:async p=>
    p===path?encode([]):f.loadBytes(p)}).getItem(id),
    /DB01_SKIN_SOURCE_ORIGINAL_SHARD_SIZE/);
  const incorrect=fake();
  incorrect.catalog.getItems=async ids=>ids.map(()=>null);
  await assert.rejects(client(incorrect).getItem(id),
    /DB01_SKIN_SOURCE_ORIGINAL_SOURCE_CATALOG_IDENTITY/);
});
