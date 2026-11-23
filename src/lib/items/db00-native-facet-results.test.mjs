import test from 'node:test';
import assert from 'node:assert/strict';
import {
  joinDb01NativeFacetsWithPublishedDb00,DB01_PUBLISHED_NATIVE_FACETS
} from './db00-native-facet-results.ts';

const SHA='a'.repeat(64);
const SNAPSHOT='steam-1.26.2-native-itemlist-v1';

function fixture(){
  const calls={native:[],public:[],coverage:0};
  const original={
    contract:'wand.db01.original-native-filters@1',
    source:{
      gameVersion:'1.26.2',sourceItemsSha256:SHA,
      sourceSqliteSha256:SHA,sourceIl2cppDumpSha256:SHA
    },
    async getCoverage(){
      calls.coverage++;
      return {
        gameVersion:'1.26.2',sourceItemsSha256:SHA,
        completeSourceNativeItemScan:true,fullNativeDefinitions:13202,
        gameUiFilterVerified:false,worldAvailabilityVerified:false
      };
    },
    async search(query){
      calls.native.push(query);
      const all=query.facets?.worldContextTag?.includes(2001200002)?
        [102,103]:[100,101,102,103];
      const selected=all.slice(query.offset??0,
        (query.offset??0)+(query.limit??100));
      return {
        total:all.length,itemIds:selected,
        hasMore:(query.offset??0)+selected.length<all.length,
        originalNativeMatchesOnly:true,gameUiFilterVerified:false,
        worldAvailabilityVerified:false,dlcEntitlementVerified:false
      };
    }
  };
  const published={
    schema:'wand.game-db.public-sources@1',snapshotId:SNAPSHOT,
    hasPrivateGameSource:false,playerOwnershipVerified:false,
    database:{target:{platform:'Steam',gameVersion:'1.26.2',buildId:null},
      itemCount:13202},
    getItems(ids){
      calls.public.push([...ids]);
      return ids.map(id=>{
        const names={
          100:{en:'Belle Chair',ja:'ベルの椅子'},
          101:{en:'Royal Rug',ja:'王室のラグ'},
          102:{en:'Ranch Fence',ja:'ランチのフェンス'}
        };
        const base={
          itemId:String(id),currentlyAvailableVerified:false,
          playerOwnershipVerified:false,origins:[{routeStatus:'confirmed_source_link'}],
          starpathRelations:[]
        };
        if(id===103){
          return {...base,catalog:null,
            catalogStatus:'outside_published_item_scope'};
        }
        return {...base,catalog:{id:String(id),
          nativeCategory:'Furniture',names:names[id]},
          catalogStatus:'current_published_item'};
      });
    }
  };
  return {original,published,calls};
}
function client(f){
  return joinDb01NativeFacetsWithPublishedDb00(f.original,f.published,SHA);
}

test('original native world Tag search retains non-CollectionSet native Items across DB-00 IDs',async()=>{
  const f=fixture(),reader=client(f);
  const selected={locale:'ja',native:{facets:{worldContextTag:[2001200001]}}};
  const first=await reader.search(selected,{limit:2});
  assert.equal(reader.contract,DB01_PUBLISHED_NATIVE_FACETS);
  assert.equal(first.scope,'original_native_item_candidates');
  assert.equal(first.totalOriginalNativeMatches,4);
  assert.equal(first.totalPublishedMatches,3);
  assert.equal(first.outsidePublishedItemCount,1);
  assert.deepEqual(first.items.map(row=>row.itemId),[100,101]);
  assert.equal(first.items[0].currentExactName,'ベルの椅子');
  assert.equal(first.items[0].joined.origins[0].routeStatus,
    'confirmed_source_link');
  assert.equal(first.gameUiCollectionMembershipVerified,false);
  assert.equal(first.worldAvailabilityVerified,false);
  assert.equal(first.dlcEntitlementVerified,false);
  assert.equal(first.playerOwnershipVerified,false);
  assert.equal(first.publicationAuthorized,false);
  assert.equal(first.nextOffset,2);
  assert.equal(Object.isFrozen(first),true);
  assert.equal(Object.isFrozen(first.items),true);
  const last=await reader.search(selected,{offset:2,limit:2});
  assert.deepEqual(last.items.map(row=>row.itemId),[102]);
  assert.equal(last.nextOffset,null);
  assert.equal(last.hasMore,false);
  // One full original scan is cached across infinite scroll, not retraversed.
  assert.equal(f.calls.native.length,1);
  assert.equal(f.calls.public.length,1);
  assert.equal(f.calls.coverage,1);
});

test('localized exact current public names or native Item ID remain separate from Tag semantics',async()=>{
  const f=fixture(),reader=client(f);
  const native={facets:{worldContextTag:[2001200002]}};
  const searched=await reader.search({
    locale:'ja',native,searchText:'ランチ'
  });
  assert.equal(searched.totalOriginalNativeMatches,2);
  assert.deepEqual(searched.items.map(row=>row.itemId),[102]);
  const byId=await reader.search({
    locale:'en',native,searchText:'102'
  });
  assert.deepEqual(byId.items.map(row=>row.currentExactName),['Ranch Fence']);
  assert.equal(byId.outsidePublishedItemCount,1);
  assert.equal(f.calls.native.length,2);
  assert.ok(f.calls.native.every(x=>x.facets.worldContextTag[0]===2001200002));
});

test('caller mutation after search start cannot silently change source Tag IDs',async()=>{
  const f=fixture(),reader=client(f);
  const tags=[2001200001];
  const selection={locale:'ja',native:{facets:{worldContextTag:tags}}};
  const request=reader.search(selection);
  tags[0]=2001200002;
  const page=await request;
  assert.equal(page.totalOriginalNativeMatches,4);
  assert.deepEqual(f.calls.native[0].facets.worldContextTag,[2001200001]);
});

test('unknown native dimensions and forged Collection UI/world selectors reject before source read',async()=>{
  const f=fixture(),reader=client(f);
  for(const selection of [
    {locale:'ja',native:{facets:{imaginaryWorld:[1]}}},
    {locale:'ja',native:{facets:{worldContextTag:[-1]}}},
    {locale:'ja',native:{nativeCategories:['Invented']}},
    {locale:'ja',native:{}},
    {locale:'ja',native:{facets:{}}},
    {locale:'ja',native:{facets:{worldContextTag:[1]}},areaCode:4097},
    {locale:'xx',native:{nativeCategories:['Furniture']}},
    {locale:'ja',native:{facets:{worldContextTag:[1]}},searchText:'\u0000'}
  ]){
    await assert.rejects(reader.search(selection),/DB01_PUBLISHED_NATIVE_/);
  }
  await assert.rejects(reader.search({
    locale:'ja',native:{nativeCategories:['Furniture']}
  },{limit:501}),/INVALID_PAGE/);
  assert.equal(f.calls.native.length,0);
  assert.equal(f.calls.public.length,0);
});

test('independently trusted original SHA, public release and privacy required',()=>{
  const f=fixture();
  assert.throws(()=>joinDb01NativeFacetsWithPublishedDb00(
    f.original,f.published,'b'.repeat(64)),/CURRENT_PINNED_READERS_REQUIRED/);
  assert.throws(()=>joinDb01NativeFacetsWithPublishedDb00(
    f.original,{...f.published,snapshotId:'old-release'},SHA),
    /CURRENT_PINNED_READERS_REQUIRED/);
  assert.throws(()=>joinDb01NativeFacetsWithPublishedDb00(
    f.original,{...f.published,hasPrivateGameSource:true},SHA),
    /CURRENT_PINNED_READERS_REQUIRED/);
});

test('corrupt original pagination, non-native census and public owner state fail closed',async()=>{
  const f=fixture();
  const badCoverage={...f.original,getCoverage:async()=>({
    ...await f.original.getCoverage(),fullNativeDefinitions:13201
  })};
  await assert.rejects(joinDb01NativeFacetsWithPublishedDb00(
    badCoverage,f.published,SHA).search({
      locale:'ja',native:{nativeCategories:['Furniture']}
    }),/INCOMPLETE_NATIVE_SOURCE_CENSUS/);
  const badNative={...f.original,search:async q=>({
    ...await f.original.search(q),itemIds:[100,100,102,103]
  })};
  await assert.rejects(joinDb01NativeFacetsWithPublishedDb00(
    badNative,f.published,SHA).search({
      locale:'ja',native:{nativeCategories:['Furniture']}
    }),/NATIVE_PUBLIC_ID_OR_STATE_CONFLICT/);
  const badOwner={...f.published,getItems:ids=>
    f.published.getItems(ids).map((row,i)=>
      i===0?{...row,playerOwnershipVerified:true}:row)};
  await assert.rejects(joinDb01NativeFacetsWithPublishedDb00(
    f.original,badOwner,SHA).search({
      locale:'ja',native:{nativeCategories:['Furniture']}
    }),/NATIVE_PUBLIC_ID_OR_STATE_CONFLICT/);
});

test('original native facet query is a separate scope, never upgrades to verified game Collection',async()=>{
  const f=fixture(),reader=client(f);
  const result=await reader.search({
    locale:'ja',native:{nativeCategories:['Furniture'],facets:{
      disneyUniverse:[2000500001],worldContextTag:[2001200001]
    }}
  });
  assert.equal(result.scope,'original_native_item_candidates');
  assert.equal(result.gameUiCollectionMembershipVerified,false);
  assert.deepEqual(f.calls.native[0].nativeCategories,['Furniture']);
  assert.deepEqual(f.calls.native[0].facets.disneyUniverse,[2000500001]);
});
