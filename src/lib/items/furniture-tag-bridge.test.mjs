import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDb01VerifiedFurnitureTagClient,
  DB01_VERIFIED_FURNITURE_TAG_BRIDGE,
} from './furniture-tag-bridge.ts';
import {
  DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS,
  DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
  DB01_ORIGINAL_FURNITURE_TAG_SHA256,
} from './furniture-native-has-tag.ts';

const types=Object.entries(DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS);
const masterSha='a'.repeat(64);
function fixture({includeField14=false,missingAdditional=false}={}){
  const calls={category:0,furnitureBatches:0,overlayBatches:0};
  const originals=[];
  let id=40000000;
  for(const [name,spec] of types){
    for(let i=0;i<spec.count;i++){
      id++;
      const blocker=name==='FurnitureBlockerItemData'&&i<19;
      const nativeTags=blocker?[2000500006]:[2001200028];
      const lookup=spec.hasSet?{
        kind:'has_set',setItemId:2040000009,
        definition:{kind:'original_set_definition',itemId:2040000009,
          nativeTags:[2000500006]},
      }:{kind:'not_ihas_set'};
      originals.push({
        itemId:id,nativeKey:'NativeFurniture!'+id,
        originalNativeClass:name,tagsFieldNumber:spec.tagsFieldNumber,
        nativeTags,setLookup:lookup,
        nativeHasTagSchemaVerified:true,
        gameUiCollectionMembershipVerified:false,
        dlcEntitlementVerified:false,
      });
    }
  }
  assert.equal(originals.length,6746);
  const base=new Map(originals.map(x=>[x.itemId,{
    itemId:x.itemId,nativeCategory:'Furniture',
    nativeKey:x.nativeKey,sourceSha256:DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
    catalogDomain:'item',
  }]));
  const byId=new Map(originals.map(x=>[x.itemId,x]));
  const legacy=new Map(originals.map(x=>{
    const blocker=x.originalNativeClass==='FurnitureBlockerItemData';
    const missing=blocker&&
      ((includeField14===false&&x.nativeTags[0]===2000500006)||
       missingAdditional&&x===originals.find(y=>
         y.originalNativeClass==='FurnitureBlockerItemData'&&
         y.nativeTags[0]===2001200028));
    const tags=missing?[]:x.nativeTags.map(tagId=>({
      tagId,tagKey:tagId===2000500006?'ToyStory':'IsDreamlightValley',
      wireField:x.tagsFieldNumber,
      facet:tagId===2000500006?'disneyUniverse':'worldContextTag',
    }));
    // Other original record fields may carry valid source Tag references,
    // but they are not actual direct IHasTags.HasTag membership.
    if(x===originals[0])tags.push({
      tagId:2000500007,tagKey:'ExampleSourceOtherField',
      wireField:7,facet:'disneyUniverse',
    });
    return [x.itemId,{
      itemId:x.itemId,nativeCategory:'Furniture',nativeKey:x.nativeKey,
      sourceSha256:DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
      tagReferences:tags,
      gameUiCategoryVerified:false,worldAvailabilityVerified:false,
      dlcOwnershipVerified:false,
    }];
  }));
  const catalog={
    source:{
      platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
      fullCorpusParsed:true,sourceItemsSha256:masterSha,
    },
    async getCategory(category){
      calls.category++;
      assert.equal(category,'Furniture');
      return [...base.values()];
    },
  };
  const classification={
    source:{
      privateOnly:true,gameVersion:'1.26.2',
      sourceItemsSha256:masterSha,
      tagOriginalSha256:DB01_ORIGINAL_FURNITURE_TAG_SHA256,
    },
    async getItem(id){return legacy.get(id)??null;},
    async getItems(ids){
      calls.overlayBatches++;
      return ids.map(id=>legacy.get(id)??null);
    },
  };
  const furniture={
    source:{
      gameVersion:'1.26.2',
      sourceFurnitureSha256:DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
      sourceTagSha256:DB01_ORIGINAL_FURNITURE_TAG_SHA256,
    },
    async getItem(id){
      const original=byId.get(id);
      return original?{original}:null;
    },
    async getItems(ids){
      calls.furnitureBatches++;
      return ids.map(id=>{
        const original=byId.get(id);
        return original?{original}:null;
      });
    },
  };
  return {catalog,classification,furniture,originals,calls,legacy};
}
const makeClient=f=>createDb01VerifiedFurnitureTagClient(
  f.catalog,f.classification,f.furniture);

test('original source data joins canonical DB-01 catalog and old Tag metadata',async()=>{
  const f=fixture();
  const client=makeClient(f);
  assert.equal(client.contract,DB01_VERIFIED_FURNITURE_TAG_BRIDGE);
  const item=await client.getItem(f.originals[0].itemId);
  assert.equal(item.itemId,f.originals[0].itemId);
  assert.equal(item.originalNativeClass,'FurnitureItemData');
  assert.deepEqual(item.nativeDirectTagIds,[2001200028]);
  assert.deepEqual(item.nativeInheritedSetTagIds,[2000500006]);
  assert.deepEqual(item.nativeHasTagIds,[2001200028,2000500006]);
  assert.equal(item.otherSourceTagReferences[0].tagId,2000500007);
  assert.deepEqual(item.missingClassificationDirectTagIds,[]);
  assert.equal(item.originalFurnitureSourceVerified,true);
  assert.equal(item.nativeHasTagSemanticsVerified,true);
  assert.equal(item.collectionUiMembershipVerified,false);
  assert.equal(item.worldAvailabilityVerified,false);
  assert.ok(Object.isFrozen(item.nativeHasTagIds));
  assert.equal(await client.getItem(49999999),null);
});

test('legacy field14 deficit is reconciled without claiming Collection membership',async()=>{
  const f=fixture();
  const client=makeClient(f);
  const blocker=f.originals.find(x=>
    x.originalNativeClass==='FurnitureBlockerItemData');
  const original=await client.getItem(blocker.itemId);
  assert.deepEqual(original.nativeDirectTagIds,[2000500006]);
  assert.deepEqual(original.missingClassificationDirectTagIds,[2000500006]);
  assert.equal(original.originalTagsFieldNumber,14);
  const coverage=await client.getCoverage();
  assert.equal(coverage.sourceFurnitureItems,6746);
  assert.equal(coverage.legacyOverlayMissingDirectTaggedItems,19);
  assert.equal(coverage.legacyOverlayMissingDirectTagReferences,19);
  assert.equal(coverage.nativeHasTagSourceCompletelyIndexed,true);
  assert.equal(coverage.gameCollectionAreaMembershipVerified,false);
  assert.equal(coverage.originalNativeClasses.FurnitureBlockerItemData,422);
  assert.equal(f.calls.category,1);
  assert.ok(f.calls.furnitureBatches<=14);
  assert.ok(f.calls.overlayBatches<=14);
  assert.equal((await client.getCoverage()),coverage);
});

test('rebuilt source overlay has zero direct-Tag gaps',async()=>{
  const f=fixture({includeField14:true});
  const coverage=await makeClient(f).getCoverage();
  assert.equal(coverage.legacyOverlayMissingDirectTaggedItems,0);
  assert.equal(coverage.legacyOverlayMissingDirectTagReferences,0);
});

test('native source Tag search includes inherited sets, original subtype and stable pagination',async()=>{
  const f=fixture();
  const client=makeClient(f);
  const all=await client.search({tagIds:[2000500006],limit:25});
  // 5288 direct-predicate Set descendants plus 19 direct Blocker tags.
  assert.equal(all.total,5288+19);
  assert.equal(all.itemIds.length,25);
  assert.equal(all.hasMore,true);
  assert.equal(all.originalNativeHasTagSourceOnly,true);
  assert.equal(all.gameCollectionAreaMembershipVerified,false);
  const direct=await client.search({
    tagIds:[2000500006],
    includeInheritedSetTags:false,
    nativeClasses:['FurnitureBlockerItemData'],limit:100,
  });
  assert.equal(direct.total,19);
  assert.deepEqual(direct.itemIds,
    f.originals.filter(x=>
      x.originalNativeClass==='FurnitureBlockerItemData'&&
      x.nativeTags[0]===2000500006).map(x=>x.itemId));
  const setOnly=await client.search({
    tagIds:[2000500006],nativeClasses:['FurnitureItemData'],
    includeInheritedSetTags:false,
  });
  assert.equal(setOnly.total,0);
  const page=await client.search({tagIds:[2001200028],limit:5,offset:3});
  assert.equal(page.itemIds.length,5);
  assert.deepEqual(page.itemIds,
    f.originals.filter(x=>x.nativeTags.includes(2001200028))
      .slice(3,8).map(x=>x.itemId));
  assert.equal(page.hasMore,true);
});

test('AND/OR original-native Tag filters do not map to unverified game UI areas',async()=>{
  const f=fixture();
  const client=makeClient(f);
  const any=await client.search({
    nativeClasses:['FurnitureItemData'],
    tagIds:[2001200028,2000500006],tagMatch:'any',
  });
  assert.equal(any.total,5288);
  const both=await client.search({
    nativeClasses:['FurnitureItemData'],
    tagIds:[2001200028,2000500006],tagMatch:'all',
  });
  assert.equal(both.total,5288);
  const none=await client.search({
    nativeClasses:['FurnitureItemData'],
    tagIds:[2001200028,2000500006],tagMatch:'all',
    includeInheritedSetTags:false,
  });
  assert.equal(none.total,0);
  const empty=await client.search({
    nativeClasses:[],limit:0,
  });
  assert.deepEqual(empty.itemIds,[]);
  assert.equal(empty.total,0);
});

test('malformed selection, unknown source class, missing version or false entitlement fail closed',async()=>{
  const f=fixture();
  const client=makeClient(f);
  for(const query of [
    {nativeClasses:['NotARealType']},
    {nativeClasses:['FurnitureItemData','FurnitureItemData']},
    {tagIds:[0]},
    {tagIds:[2001200028,2001200028]},
    {includeInheritedSetTags:'false'},
    {tagMatch:'neither'},
    {offset:-1},
    {limit:1001},
  ]){
    await assert.rejects(client.search(query),
      /DB01_FURNITURE_TAG_BRIDGE_/);
  }
  await assert.rejects(client.getItem(0),
    /DB01_FURNITURE_TAG_BRIDGE_INVALID_ITEM_ID/);
  f.classification.source.tagOriginalSha256='0'.repeat(64);
  assert.throws(()=>makeClient(f),
    /DB01_FURNITURE_TAG_BRIDGE_SOURCE_VERSION_OR_READER_MISMATCH/);
});

test('same-field tag contradictions and unexpected omissions are rejected',async()=>{
  const f=fixture();
  const first=f.originals[0];
  f.legacy.get(first.itemId).tagReferences.push({
    tagId:2000500008,wireField:first.tagsFieldNumber,
    tagKey:'Forged',facet:'disneyUniverse',
  });
  await assert.rejects(makeClient(f).getItem(first.itemId),
    /DB01_FURNITURE_TAG_BRIDGE_CONTRADICTORY_NATIVE_TAG_FIELD_REFERENCE/);
  const f2=fixture({missingAdditional:true});
  await assert.rejects(makeClient(f2).getCoverage(),
    /DB01_FURNITURE_TAG_BRIDGE_SOURCE_CLASSIFICATION_COVERAGE_DRIFT/);
});

test('source classification identity drift is rejected',async()=>{
  const f=fixture();
  const first=f.originals[0];
  f.legacy.get(first.itemId).nativeKey='WrongNativeSourceKey';
  await assert.rejects(makeClient(f).getItem(first.itemId),
    /DB01_FURNITURE_TAG_BRIDGE_SOURCE_CLASSIFICATION_ITEM_IDENTITY/);
});
