import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb01OriginalSourceMenuQuery} from './collection-source-index.ts';

const SHA='a'.repeat(64);
const originalSource={
  platform:'Steam',gameVersion:'1.26.2',sourceItemsSha256:SHA,
  definitions:5,privateOnly:true,fullCorpusParsed:true,
  currentNativeItemDefinitions:3,
};
const MENU=[
  {setId:11,setKey:'Furniture!One',submenuCode:3,submenu:'FurnitureSets',
    collectionLabelKey:'CollectionSet.FurnitureOne',sortPriority:0,groupCount:1,
    directListedItemCount:1,dynamicSelectorsUnresolved:1,
    gameUiVisibilityVerified:false},
  {setId:12,setKey:'Companions!One',submenuCode:15,submenu:'Companions',
    collectionLabelKey:'CollectionSet.CompanionsOne',sortPriority:0,groupCount:1,
    directListedItemCount:0,dynamicSelectorsUnresolved:1,
    gameUiVisibilityVerified:false},
  {setId:13,setKey:'Furniture!Two',submenuCode:3,submenu:'FurnitureSets',
    collectionLabelKey:'CollectionSet.FurnitureTwo',sortPriority:1,groupCount:2,
    directListedItemCount:0,dynamicSelectorsUnresolved:1,
    gameUiVisibilityVerified:false},
];
function candidate(menu,groupIndex=0){
  return {
    origin:'set-universe',
    collectionSetId:menu.setId,groupIndex,
    sourceMenu:menu,
    evidence:{setId:menu.setId,groupIndex,
      sourcePredicateMatched:true,gameUiMembershipVerified:false},
  };
}
const direct={
  setId:11,setKey:'Furniture!One',submenuCode:3,submenu:'FurnitureSets',
  collectionLabelKey:'CollectionSet.FurnitureOne',groupIndex:0,
  evidence:'current_original_collectionset_explicit_item_list',
  gameUiVisibilityVerified:false,worldAvailabilityVerified:false,
  dlcOwnershipVerified:false,
};
function fixture(){
  const calls={categories:0,views:0,menu:0};
  const names={
    100:{en:'Royal Chair',ja:'豪華な椅子'},
    200:{en:'Magical Sofa',ja:null},
    300:{en:'Black Dress',ja:'黒いドレス'},
    400:{en:'Companion Fox',ja:'仲間のキツネ'},
    500:{en:'Unlinked Tag',ja:'未関連タグ'},
  };
  const locales=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
  const base=[
    {itemId:100,nativeCategory:'Furniture'},
    {itemId:200,nativeCategory:'Furniture'},
    {itemId:300,nativeCategory:'Clothing'},
    {itemId:400,nativeCategory:'Companion'},
    {itemId:500,nativeCategory:'Tag'},
  ].map(record=>({...record,
    names:Object.fromEntries(locales.map(locale=>[
      locale,names[record.itemId][locale]??(locale==='ja'?null:
        names[record.itemId].en)])),
  }));
  const byId=new Map(base.map(r=>[r.itemId,{
    itemId:r.itemId,nativeCategory:r.nativeCategory,
    collection:{direct:[],candidates:[],suppressed:[]},
  }]));
  byId.get(100).collection.direct=[direct];
  byId.get(200).collection.candidates=[candidate(MENU[0])];
  // This original candidate must NOT be counted because Crafting Ignore=1
  // suppressed the same CollectionSet/group source predicate upstream.
  byId.get(200).collection.suppressed=[{
    candidate:candidate(MENU[2],1),
    exclusions:[{collectionSetId:13,groupIndex:1,negative:true}],
  }];
  byId.get(300).collection.candidates=[candidate(MENU[2],1)];
  byId.get(400).collection.candidates=[candidate(MENU[1])];
  const catalog={
    source:originalSource,
    getCategories:()=>['Furniture','Clothing','Companion','Tag'],
    getCategory:async cat=>{
      calls.categories++;
      return base.filter(x=>x.nativeCategory===cat);
    },
  };
  const coverage={
    sourceDynamicSelectorsTotal:262,sourceDynamicSelectorsResolved:262,
    sourceCollectionSetDefinitions:3,directListedIds:1,
  };
  const shared={
    source:{platform:'Steam',gameVersion:'1.26.2',sourceItemsSha256:SHA,
      definitions:5},
    getCoverage:()=>coverage,
    getSourceMenus:async()=>{calls.menu++;return MENU;},
    getItems:async ids=>{calls.views++;
      return ids.map(i=>byId.get(i)??null);},
  };
  const native={
    source:{gameVersion:'1.26.2',sourceItemsSha256:SHA},
    search:async ({offset=0,limit=1000,facets})=>{
      const all=facets?.color?[200]:[100,200,300];
      return {total:all.length,itemIds:all.slice(offset,offset+limit),
        hasMore:offset+limit<all.length};
    },
  };
  return {calls,catalog,shared,native,byId,coverage};
}

test('original menu index preserves all positive candidates and separate direct links',async()=>{
  const f=fixture();
  const client=createDb01OriginalSourceMenuQuery(f.catalog,f.shared,f.native);
  const sets=await client.getCollectionSets();
  const groups=await client.getSubmenus();
  const coverage=await client.getCoverage();
  assert.equal(sets.length,3);
  assert.deepEqual(sets.map(x=>[
    x.sourceMenu.setId,x.distinctCandidateItemIds,
    x.directListedItemIds,x.dynamicPredicateItemIds,
  ]),[
    [11,2,1,1],[12,1,0,1],[13,1,0,1],
  ]);
  assert.deepEqual(groups.map(x=>[
    x.submenuCode,x.sourceSetCount,x.distinctCandidateItemIds,
  ]),[[3,2,3],[15,1,1]]);
  assert.equal(coverage.catalogDefinitions,5);
  assert.equal(coverage.catalogCategories,4);
  assert.equal(coverage.originalDynamicSelectorsInterpreted,262);
  assert.equal(coverage.directListedItemIds,1);
  assert.equal(coverage.sourceMatchedDistinctItemIds,4);
  assert.equal(coverage.staticPredicateDistinctItemIds,3);
  assert.equal(coverage.suppressedPredicateOccurrences,1);
  assert.equal(coverage.gameRuntimeMembershipVerified,false);
  assert.equal(sets[0].gameRuntimeMembershipVerified,false);
  assert.equal(f.calls.menu,1);
  assert.equal(f.calls.categories,4);
  assert.equal(f.calls.views,1);
});

test('exact set and native submenu filters do not imply runtime visibility',async()=>{
  const f=fixture(),api=createDb01OriginalSourceMenuQuery(f.catalog,f.shared);
  assert.deepEqual((await api.search()).itemIds,[100,200,300,400]);
  const set=await api.search({collectionSetIds:[11]});
  assert.deepEqual(set.itemIds,[100,200]);
  assert.equal(set.sourceOnly,true);
  assert.equal(set.gameRuntimeMembershipVerified,false);
  assert.equal(set.worldAvailabilityVerified,false);
  assert.equal(set.dlcOwnershipVerified,false);
  assert.deepEqual((await api.search({collectionSetIds:[13]})).itemIds,[300]);
  assert.deepEqual((await api.search({submenuCodes:[3]})).itemIds,[100,200,300]);
  assert.deepEqual((await api.search({nativeCategories:['Furniture'],
    submenuCodes:[3]})).itemIds,[100,200]);
  assert.deepEqual((await api.search({submenuCodes:[3,15],
    collectionSetIds:[11]})).itemIds,[100,200]);
  assert.deepEqual((await api.search({offset:1,limit:2})).itemIds,[200,300]);
  assert.equal((await api.search({offset:1,limit:2})).hasMore,true);
});

test('same-group negative suppression is never treated as an item membership',async()=>{
  const api=createDb01OriginalSourceMenuQuery(fixture().catalog,fixture().shared);
  const refs=await api.getItemLinks(200);
  assert.deepEqual(refs.map(v=>v.collectionSetId),[11]);
  assert.equal(refs[0].sourcePredicateMatches,1);
  assert.deepEqual(refs[0].evidence,['original_static_collection_predicate']);
  assert.deepEqual((await api.getItemLinks(100))[0].evidence,
    ['original_explicit_item_list']);
  assert.deepEqual(await api.getItemLinks(500),[]);
  assert.equal(await api.getItemLinks(999),null);
});

test('native Tag filtering is delegated to the existing source-native filter',async()=>{
  const f=fixture(),api=createDb01OriginalSourceMenuQuery(
    f.catalog,f.shared,f.native);
  const result=await api.search({submenuCodes:[3],
    native:{nativeCategories:['Furniture'],facets:{color:[2000700002]}}});
  assert.deepEqual(result.itemIds,[200]);
  await assert.rejects(createDb01OriginalSourceMenuQuery(
    f.catalog,f.shared).search({native:{facets:{color:[2000700002]}}}),
    /NATIVE_TAG_FACETS_NOT_CONNECTED/);
});

test('incomplete CollectionSet overlays and different original versions fail before data reads',()=>{
  const f=fixture();
  assert.throws(()=>createDb01OriginalSourceMenuQuery(f.catalog,{
    ...f.shared,
    getCoverage:()=>({...f.coverage,sourceDynamicSelectorsResolved:222}),
  }),/INCOMPLETE_COLLECTION_SOURCE_OVERLAYS/);
  assert.throws(()=>createDb01OriginalSourceMenuQuery(f.catalog,{
    ...f.shared,source:{...f.shared.source,sourceItemsSha256:'b'.repeat(64)},
  }),/PRIVATE_SOURCE_IDENTITY/);
  assert.throws(()=>createDb01OriginalSourceMenuQuery(
    f.catalog,f.shared,{...f.native,
      source:{...f.native.source,gameVersion:'1.27.0'}}),
  /NATIVE_FILTER_SOURCE_MISMATCH/);
  assert.equal(f.calls.views,0);
});

test('direct listing census and unknown CollectionSet/source group fail closed',async()=>{
  const f=fixture();
  const changed={...f.shared,getSourceMenus:async()=>MENU.map((m,i)=>
    i===0?{...m,directListedItemCount:2}:m)};
  await assert.rejects(createDb01OriginalSourceMenuQuery(
    f.catalog,changed).getCoverage(),/DIRECT_ORIGINAL_LISTING_CENSUS/);
  const invalid={...f.shared,getItems:async ids=>ids.map(i=>
    i===300?{...f.byId.get(i),collection:{
      direct:[],candidates:[candidate({...MENU[2],setId:999})],suppressed:[],
    }}:f.byId.get(i))};
  await assert.rejects(createDb01OriginalSourceMenuQuery(
    f.catalog,invalid).getCoverage(),
    /DYNAMIC_COLLECTION_SOURCE_MISMATCH/);
});

test('input validation rejects invented menu/submenu and unbounded pages',async()=>{
  const f=fixture(),api=createDb01OriginalSourceMenuQuery(f.catalog,f.shared);
  await assert.rejects(api.search({collectionSetIds:[999]}),
    /UNKNOWN_COLLECTION_SET/);
  await assert.rejects(api.search({submenuCodes:[42]}),
    /UNKNOWN_SUBMENU/);
  await assert.rejects(api.search({limit:1001}),/QUERY_PAGINATION/);
  await assert.rejects(api.search({nativeCategories:['What']}),/QUERY_DIMENSIONS/);
});

test('source-exact CollectionSet groups can be listed and filtered without UI guesses',async()=>{
  const f=fixture(),api=createDb01OriginalSourceMenuQuery(f.catalog,f.shared);
  const groups=await api.getSourceGroups(13);
  assert.deepEqual(groups.map(x=>[
    x.collectionSetId,x.groupIndex,x.distinctCandidateItemIds,
  ]),[[13,0,0],[13,1,1]]);
  assert.equal(groups[0].originalSetKey,'Furniture!Two');
  assert.equal(groups[0].gameRuntimeMembershipVerified,false);
  assert.equal((await api.getCoverage()).originalSourceGroups,4);
  assert.deepEqual((await api.search({sourceGroups:[
    {collectionSetId:13,groupIndex:0},
  ]})).itemIds,[]);
  assert.deepEqual((await api.search({sourceGroups:[
    {collectionSetId:13,groupIndex:1},
  ]})).itemIds,[300]);
  assert.deepEqual((await api.search({sourceGroups:[
    {collectionSetId:11,groupIndex:0},
    {collectionSetId:13,groupIndex:1},
  ]})).itemIds,[100,200,300]);
  assert.deepEqual((await api.search({sourceGroups:[
    {collectionSetId:11,groupIndex:0},
    {collectionSetId:13,groupIndex:1},
  ],submenuCodes:[3],collectionSetIds:[13]})).itemIds,[300]);
  assert.equal((await api.search({sourceGroups:[
    {collectionSetId:13,groupIndex:1},
  ],offset:1,limit:1})).hasMore,false);
  assert.equal((await api.search({sourceGroups:[
    {collectionSetId:13,groupIndex:1},
  ]})).sourceOnly,true);
});

test('source group queries reject unknown or malformed original groups',async()=>{
  const f=fixture(),api=createDb01OriginalSourceMenuQuery(f.catalog,f.shared);
  await assert.rejects(api.getSourceGroups(999),/UNKNOWN_COLLECTION_SET/);
  await assert.rejects(api.search({sourceGroups:[
    {collectionSetId:13,groupIndex:2},
  ]}),/UNKNOWN_SOURCE_GROUP/);
  await assert.rejects(api.search({sourceGroups:[
    {collectionSetId:999,groupIndex:0},
  ]}),/UNKNOWN_SOURCE_GROUP/);
  await assert.rejects(api.search({sourceGroups:[
    {collectionSetId:13,groupIndex:-1},
  ]}),/QUERY_DIMENSIONS/);
  await assert.rejects(api.search({sourceGroups:[
    {collectionSetId:13,groupIndex:1.5},
  ]}),/QUERY_DIMENSIONS/);
  await assert.rejects(api.search({sourceGroups:'not an array'}),
    /QUERY_DIMENSIONS/);
});

test('source group provenance is separate for original direct and static matches',async()=>{
  const f=fixture(),api=createDb01OriginalSourceMenuQuery(f.catalog,f.shared);
  const groups=await api.getSourceGroups(11);
  assert.deepEqual(groups.map(g=>[
    g.distinctCandidateItemIds,g.directListedItemIds,g.staticPredicateItemIds,
  ]),[[2,1,1]]);
  assert.deepEqual((await api.search({listingEvidence:'direct'})).itemIds,[100]);
  assert.deepEqual((await api.search({listingEvidence:'predicate'})).itemIds,
    [200,300,400]);
  assert.deepEqual((await api.search({listingEvidence:'direct',
    sourceGroups:[{collectionSetId:11,groupIndex:0}]})).itemIds,[100]);
  assert.deepEqual((await api.search({listingEvidence:'predicate',
    sourceGroups:[{collectionSetId:11,groupIndex:0}]})).itemIds,[200]);
  const link=(await api.getItemLinks(100))[0];
  assert.deepEqual(link.directGroupIndexes,[0]);
  assert.deepEqual(link.predicateGroupIndexes,[]);
  const suppressed=(await api.getItemLinks(200));
  assert.deepEqual(suppressed.map(v=>v.collectionSetId),[11]);
});

test('direct in one group must not classify a separate group as direct',async()=>{
  const f=fixture(),menus=MENU.map(m=>m.setId===13?
    {...m,directListedItemCount:1}:m);
  const directOther={...direct,setId:13,setKey:'Furniture!Two',
    collectionLabelKey:'CollectionSet.FurnitureTwo',groupIndex:0};
  const additional={...f.byId.get(300),collection:{
    ...f.byId.get(300).collection,direct:[directOther],
  }};
  const shared={
    ...f.shared,
    getCoverage:()=>({...f.coverage,directListedIds:2}),
    getSourceMenus:async()=>menus,
    getItems:async ids=>ids.map(id=>id===300?additional:f.byId.get(id)??null),
  };
  const api=createDb01OriginalSourceMenuQuery(f.catalog,shared);
  const links=(await api.getItemLinks(300)).filter(x=>x.collectionSetId===13);
  assert.equal(links.length,1);
  assert.deepEqual(links[0].groupIndexes,[0,1]);
  assert.deepEqual(links[0].directGroupIndexes,[0]);
  assert.deepEqual(links[0].predicateGroupIndexes,[1]);
  assert.deepEqual((await api.search({collectionSetIds:[13],
    listingEvidence:'direct',sourceGroups:[{collectionSetId:13,groupIndex:1}]})).itemIds,[]);
  assert.deepEqual((await api.search({collectionSetIds:[13],
    listingEvidence:'predicate',sourceGroups:[{collectionSetId:13,groupIndex:0}]})).itemIds,[]);
  assert.deepEqual((await api.search({collectionSetIds:[13],
    listingEvidence:'predicate',sourceGroups:[{collectionSetId:13,groupIndex:1}]})).itemIds,[300]);
  assert.deepEqual((await api.search({collectionSetIds:[13],
    listingEvidence:'direct',sourceGroups:[{collectionSetId:13,groupIndex:0}]})).itemIds,[300]);
  assert.deepEqual((await api.getSourceGroups(13)).map(x=>[
    x.groupIndex,x.distinctCandidateItemIds,x.directListedItemIds,
    x.staticPredicateItemIds,
  ]),[[0,1,1,0],[1,1,0,1]]);
});

test('unrecognized original source evidence modes fail closed',async()=>{
  const f=fixture(),api=createDb01OriginalSourceMenuQuery(f.catalog,f.shared);
  await assert.rejects(api.search({listingEvidence:'runtime-ui'}),/QUERY_EVIDENCE/);
});

test('current exact Item names and native Item IDs are returned alongside matched source evidence',async()=>{
  const f=fixture();
  const api=createDb01OriginalSourceMenuQuery(f.catalog,f.shared);
  const result=await api.search({collectionSetIds:[11],locale:'en'});
  assert.equal(result.total,2);
  assert.equal(result.locale,'en');
  assert.deepEqual(result.itemIds,[100,200]);
  assert.deepEqual(result.items.map(x=>[
    x.itemId,x.currentExactName,x.currentExactNameVerified,x.nativeCategory,
  ]),[
    [100,'Royal Chair',true,'Furniture'],
    [200,'Magical Sofa',true,'Furniture'],
  ]);
  assert.deepEqual(result.items[0].matchedSourceLinks.map(x=>[
    x.collectionSetId,x.directOriginalListing,x.sourcePredicateMatches,
  ]),[[11,true,0]]);
  assert.deepEqual(result.items[1].matchedSourceLinks.map(x=>[
    x.collectionSetId,x.directOriginalListing,x.sourcePredicateMatches,
  ]),[[11,false,1]]);
  assert.equal(result.items[0].gameRuntimeMembershipVerified,false);
  assert.equal(result.items[0].worldAvailabilityVerified,false);
  assert.equal(Object.isFrozen(result.items),true);
  assert.equal(Object.isFrozen(result.items[0]),true);
});
test('Japanese original exact-name search, no historical fallback, Item ID match for null name',async()=>{
  const f=fixture(),api=createDb01OriginalSourceMenuQuery(f.catalog,f.shared);
  assert.deepEqual((await api.search({locale:'ja',
    submenuCodes:[3],searchText:'豪華'})).itemIds,[100]);
  assert.deepEqual((await api.search({locale:'ja',
    submenuCodes:[3],searchText:'MAGICAL'})).itemIds,[]);
  const missing=await api.search({locale:'ja',
    submenuCodes:[3],searchText:'200'});
  assert.deepEqual(missing.itemIds,[200]);
  assert.equal(missing.items[0].currentExactName,null);
  assert.equal(missing.items[0].currentExactNameVerified,false);
  assert.equal((await api.search({searchText:'100'})).items[0].itemId,100);
  assert.equal(f.calls.categories,4);
  assert.equal(f.calls.views,1);
});
test('text filtering composes with AND source categories, specific groups and evidence',async()=>{
  const f=fixture(),api=createDb01OriginalSourceMenuQuery(
    f.catalog,f.shared,f.native);
  const search=await api.search({searchText:'sofa',locale:'en',
    submenuCodes:[3],collectionSetIds:[11],listingEvidence:'predicate',
    native:{nativeCategories:['Furniture'],facets:{color:[2000700002]}}});
  assert.deepEqual(search.itemIds,[200]);
  assert.deepEqual(search.items[0].matchedSourceLinks.map(x=>x.collectionSetId),[11]);
  assert.equal(search.total,1);
  assert.deepEqual((await api.search({searchText:'sofa',
    collectionSetIds:[11],listingEvidence:'direct'})).itemIds,[]);
  assert.deepEqual((await api.search({searchText:'dress',
    sourceGroups:[{collectionSetId:13,groupIndex:1}]})).itemIds,[300]);
  assert.deepEqual((await api.search({searchText:'dress',
    sourceGroups:[{collectionSetId:13,groupIndex:0}]})).itemIds,[]);
  assert.deepEqual((await api.search({searchText:'unlinked'})).itemIds,[]);
});
test('text filter paginates matching items, not the prefiltered original ID index',async()=>{
  const api=createDb01OriginalSourceMenuQuery(fixture().catalog,fixture().shared);
  const page=await api.search({searchText:'a',locale:'en',offset:1,limit:2});
  // Royal Chair, Magical Sofa, Black Dress, Companion Fox: all contain 'a'
  assert.equal(page.total,4);
  assert.deepEqual(page.itemIds,[200,300]);
  assert.equal(page.items.length,2);
  assert.equal(page.hasMore,true);
  const last=await api.search({searchText:'a',locale:'en',offset:3,limit:2});
  assert.deepEqual(last.itemIds,[400]);
  assert.equal(last.hasMore,false);
});
test('locale and search text validated before original private source reads',async()=>{
  const f=fixture(),api=createDb01OriginalSourceMenuQuery(f.catalog,f.shared);
  await assert.rejects(api.search({locale:'en-US'}),/QUERY_LOCALE/);
  await assert.rejects(api.search({locale:null}),/QUERY_LOCALE/);
  await assert.rejects(api.search({searchText:'a'.repeat(151)}),
    /QUERY_SEARCH_TEXT/);
  await assert.rejects(api.search({searchText:'abc\nmore'}),
    /QUERY_SEARCH_TEXT/);
  await assert.rejects(api.search({searchText:55}),/QUERY_SEARCH_TEXT/);
  assert.equal(f.calls.categories,0);
  assert.equal(f.calls.views,0);
});
test('name search never turns original candidates into actual game-screen membership',async()=>{
  const api=createDb01OriginalSourceMenuQuery(fixture().catalog,fixture().shared);
  const result=await api.search({searchText:'',locale:'ja',limit:5});
  assert.equal(result.total,4);
  assert.equal(result.items.length,4);
  assert.equal(result.gameRuntimeMembershipVerified,false);
  assert.equal(result.dlcOwnershipVerified,false);
  assert.ok(result.items.every(x=>x.gameRuntimeMembershipVerified===false));
  assert.ok(result.items.every(x=>x.matchedSourceLinks.every(l=>
    l.gameRuntimeMembershipVerified===false)));
});
