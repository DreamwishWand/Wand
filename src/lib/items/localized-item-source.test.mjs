import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb01LocalizedItemSourceClient} from './localized-item-source.ts';

const SHA='a'.repeat(64),TAG_SHA='b'.repeat(64);
const worldId=2001200001,universeId=2000500001;
function nativeTag(kind,tagItemId,nativeKey,locale){
  const japanese=locale==='ja';
  return {
    kind,tagItemId,nativeKey,locale,
    displayName:nativeKey==='IsDreamlightValley'?
      (japanese?'ドリームライト・バレー':'Dreamlight Valley'):
      (japanese?'ミッキーと仲間たち':'Mickey & Friends'),
    originalTagDefinitionSha256:TAG_SHA,
    sourceExactCurrentLocDbName:true,originalTagDefinitionVerified:true,
    sourceWorldOrUniverseTagVerified:true,
    gameUiCollectionMembershipVerified:false,
    itemAcquisitionWorldVerified:false,
  };
}
function sourceItem(itemId,nativeCategory,refs,name){
  const sourceSha256='c'.repeat(64);
  const nativeKey='NativeKey'+itemId;
  return {
    itemId,gameVersion:'1.26.2',nativeCategory,
    item:{
      itemId,nativeCategory,nativeKey,sourceSha256,
      verifiedIconGuid:itemId===10?'verified-guid':null,
      names:{ja:name,en:name===null?null:'Example '+itemId},
    },
    originalItemType:itemId===10?{
      itemId,nativeCategory,sourceSha256,
      itemTypeCode:5,itemTypeName:'Furniture',
      subtypeCode:6,subtypeEnumName:'FurnitureType',
      subtypeName:'Wall',subtypeNameVerified:true,
      gameUiCategoryVerified:false,
    }:null,
    originalTags:{
      itemId,nativeCategory,nativeKey,sourceSha256,
      tagReferences:refs,facets:{},
    },
  };
}
const worldRef=(wireField=5)=>({
  facet:'worldContextTag',tagId:worldId,tagKey:'IsDreamlightValley',
  wireField,
});
const universeRef={
  facet:'disneyUniverse',tagId:universeId,tagKey:'MickeyAndFriends',
  wireField:3,
};
function fixture(){
  const calls={reads:0,world:[],universe:[]};
  const rows=new Map([
    [10,sourceItem(10,'Furniture',
      [worldRef(7),universeRef,worldRef(5)],'ソース家具')],
    [20,sourceItem(20,'Condition',[],'条件定義')],
    [30,sourceItem(30,'Tag',[universeRef],null)],
  ]);
  const shared={
    source:{platform:'Steam',gameVersion:'1.26.2',
      sourceItemsSha256:SHA,definitions:3},
    getCoverage:()=>({totalDefinitions:3,tagAssociatedDefinitions:2}),
    getItems:async ids=>{calls.reads++;return ids.map(id=>rows.get(id)??null);},
  };
  const taxonomy={
    contract:'wand.db04.native-tag-taxonomy@1',
    source:{platform:'Steam',gameVersion:'1.26.2',
      db01SourceItemsSha256:SHA,originalTagSha256:TAG_SHA,
      privateOnly:true,publicationAuthorized:false},
    listWorldTags:async locale=>{
      calls.world.push(locale);
      return [nativeTag('world_context_tag',worldId,'IsDreamlightValley',locale)];
    },
    listUniverseTags:async locale=>{
      calls.universe.push(locale);
      return [nativeTag('disney_universe_tag',universeId,'MickeyAndFriends',locale)];
    },
  };
  return {shared,taxonomy,calls,rows};
}
test('per-Item source World and Universe IDs, source fields and exact names are preserved',async()=>{
  const f=fixture(),api=createDb01LocalizedItemSourceClient(
    f.shared,f.taxonomy);
  const row=await api.getItem(10,'ja');
  assert.equal(row.currentExactName,'ソース家具');
  assert.equal(row.verifiedIconGuid,'verified-guid');
  assert.equal(row.nativeCategory,'Furniture');
  assert.equal(row.originalItemType.subtypeName,'Wall');
  assert.deepEqual(row.worldContextTags.map(r=>[
    r.tagId,r.originalTagKey,r.displayName,r.wireFields,
  ]),[[worldId,'IsDreamlightValley','ドリームライト・バレー',[5,7]]]);
  assert.deepEqual(row.disneyUniverseTags.map(r=>[
    r.tagId,r.originalTagKey,r.displayName,r.wireFields,
  ]),[[universeId,'MickeyAndFriends','ミッキーと仲間たち',[3]]]);
  assert.equal(row.completeCurrentDefinitionTagScan,true);
  assert.equal(row.gameUiCategoryVerified,false);
  assert.equal(row.gameUiSubcategoryVerified,false);
  assert.equal(row.acquisitionWorldVerified,false);
  assert.equal(row.contentPackVerified,false);
  assert.equal(row.dlcEntitlementVerified,false);
  assert.equal(row.runtimeCollectionMembershipVerified,false);
  assert.equal(row.worldContextTags[0].gameUiCollectionCategoryVerified,false);
  assert.equal(Object.isFrozen(row.worldContextTags[0].wireFields),true);
  assert.equal(api.source.definitions,3);
});
test('non-item definitions and unknown IDs remain distinct from untagged source definitions',async()=>{
  const f=fixture(),api=createDb01LocalizedItemSourceClient(
    f.shared,f.taxonomy);
  const rows=await api.getItems([20,999,30,20],'ja');
  assert.equal(rows[0].nativeCategory,'Condition');
  assert.deepEqual(rows[0].worldContextTags,[]);
  assert.deepEqual(rows[0].disneyUniverseTags,[]);
  assert.equal(rows[0].completeCurrentDefinitionTagScan,true);
  assert.equal(rows[1],null);
  assert.equal(rows[2].nativeCategory,'Tag');
  assert.equal(rows[2].currentExactName,null);
  assert.equal(rows[2].originalItemType,null);
  assert.equal(rows[2].disneyUniverseTags[0].tagId,universeId);
  assert.deepEqual(rows[3],rows[0]);
  assert.equal(Object.isFrozen(rows),true);
});
test('source choices are localized once per locale and local catalog reads preserve duplicates',async()=>{
  const f=fixture(),api=createDb01LocalizedItemSourceClient(
    f.shared,f.taxonomy);
  const [ja,en]=await Promise.all([
    api.getItems([10,20,10],'ja'),api.getItems([10],'en'),
  ]);
  assert.equal(ja[0].worldContextTags[0].displayName,'ドリームライト・バレー');
  assert.equal(en[0].worldContextTags[0].displayName,'Dreamlight Valley');
  await api.getItem(30,'ja');
  assert.deepEqual(f.calls.world.sort(),['en','ja']);
  assert.deepEqual(f.calls.universe.sort(),['en','ja']);
  assert.equal(f.calls.reads,3);
});
test('empty batch, malformed input, and excessive source batch are bounded',async()=>{
  const f=fixture(),api=createDb01LocalizedItemSourceClient(
    f.shared,f.taxonomy);
  assert.deepEqual(await api.getItems([],'ja'),[]);
  assert.equal(f.calls.reads,0);
  await assert.rejects(api.getItem(0,'ja'),/INVALID_ITEM_ID/);
  await assert.rejects(api.getItems([10,-1],'ja'),/INVALID_ITEM_IDS/);
  await assert.rejects(api.getItems(Array(4097).fill(10),'ja'),
    /INVALID_ITEM_IDS/);
  await assert.rejects(api.getItem(10,'xx'),/INVALID_LOCALE/);
  assert.equal(f.calls.reads,0);
});
test('mismatched DB-01 or DB-04 versions and absent Tag overlay fail before reads',()=>{
  const f=fixture();
  assert.throws(()=>createDb01LocalizedItemSourceClient({
    ...f.shared,source:{...f.shared.source,gameVersion:'1.27.0'},
  },f.taxonomy),/MISMATCHED_OR_INCOMPLETE_PRIVATE_SOURCE/);
  assert.throws(()=>createDb01LocalizedItemSourceClient({
    ...f.shared,getCoverage:()=>({totalDefinitions:3,tagAssociatedDefinitions:null}),
  },f.taxonomy),/MISMATCHED_OR_INCOMPLETE_PRIVATE_SOURCE/);
  assert.throws(()=>createDb01LocalizedItemSourceClient(f.shared,{
    ...f.taxonomy,source:{...f.taxonomy.source,
      db01SourceItemsSha256:'f'.repeat(64)},
  }),/MISMATCHED_OR_INCOMPLETE_PRIVATE_SOURCE/);
  assert.equal(f.calls.reads,0);
});
test('a known definition whose original Tag record is absent must fail closed',async()=>{
  const f=fixture(),item=f.rows.get(10);
  const broken={...item,originalTags:null};
  f.rows.set(10,broken);
  await assert.rejects(createDb01LocalizedItemSourceClient(
    f.shared,f.taxonomy).getItem(10,'ja'),/MISSING_OR_INCONSISTENT_ITEM_TAG_SOURCE/);
});
test('wrong original tag ID/key is never translated by inferred string similarity',async()=>{
  for(const corruptRef of [
    {...worldRef(),tagId:9999},
    {...worldRef(),tagKey:'IsEternityIsle'},
  ]){
    const f=fixture(),item=f.rows.get(10);
    f.rows.set(10,{
      ...item,originalTags:{...item.originalTags,tagReferences:[corruptRef]},
    });
    await assert.rejects(createDb01LocalizedItemSourceClient(
      f.shared,f.taxonomy).getItem(10,'ja'),
    /SOURCE_ITEM_TAG_NOT_IN_CURRENT_TAXONOMY/);
  }
});
test('tampered native tag SHA and forged locale names never pass as source-exact',async()=>{
  const f=fixture(),badSha={
    ...f.taxonomy,
    listUniverseTags:async locale=>[{
      ...nativeTag('disney_universe_tag',universeId,'MickeyAndFriends',locale),
      originalTagDefinitionSha256:'f'.repeat(64),
    }],
  };
  await assert.rejects(createDb01LocalizedItemSourceClient(
    f.shared,badSha).getItem(10,'ja'),/CONFLICTING_ORIGINAL_TAG_HASH/);
  const badLabel={...f.taxonomy,listWorldTags:async locale=>[{
    ...nativeTag('world_context_tag',worldId,'IsDreamlightValley',locale),
    sourceExactCurrentLocDbName:false,
  }]};
  await assert.rejects(createDb01LocalizedItemSourceClient(
    f.shared,badLabel).getItem(10,'ja'),/INCONSISTENT_ORIGINAL_TAG_LABEL/);
});

test('retired v1.26.2 partial Tag overlay is rejected before any known Item appears untagged',()=>{
  const f=fixture();
  assert.throws(()=>createDb01LocalizedItemSourceClient({
    ...f.shared,
    source:{...f.shared.source,definitions:39067},
    getCoverage:()=>({totalDefinitions:39067,tagAssociatedDefinitions:14861}),
  },f.taxonomy),/RETIRED_INCOMPLETE_TAG_OVERLAY/);
  assert.equal(f.calls.reads,0);
});
