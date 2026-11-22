import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDb01CollectionNativeBrowseClient,
  DB01_COLLECTION_NATIVE_BROWSE_CONTRACT,
} from './collection-native-browse.ts';
import {
  DB01_COLLECTION_UI_AXES,
  DB01_ORIGINAL_COLLECTION_AREAS,
  DB01_ORIGINAL_COLLECTION_SUBMENUS,
  DB01_COLLECTION_UI_IL2CPP_SHA256,
} from './collection-ui-axes.ts';
import {DB01_SOURCE_MENU_INDEX_SCHEMA} from './collection-source-index.ts';
import {DB01_DB00_COLLECTION_RESULTS_CONTRACT} from './db00-source-results.ts';

const SHA='a'.repeat(64);
const CATEGORIES=DB01_ORIGINAL_COLLECTION_SUBMENUS;
const LIVE=CATEGORIES.filter(x=>x.code!==17&&x.code!==19);
function fixture(){
  const calls={
    originalIndex:0,originalSubmenus:0,areas:[],categories:[],sets:[],query:[],publicQueries:[],
  };
  const menus=Array.from({length:305},(_,i)=>{
    const category=LIVE[i%LIVE.length];
    return {
      setId:2120000001+i,setKey:'OriginalSet'+i,sortPriority:i,
      submenu:category.enumName,submenuCode:category.code,
      collectionLabelKey:'CollectionSet.Key'+i,
      groupCount:1,directListedItemCount:i%2,
      dynamicSelectorsUnresolved:1,gameUiVisibilityVerified:false,
    };
  });
  const indexSets=menus.map(menu=>({
    sourceMenu:menu,distinctCandidateItemIds:5,
    directListedItemIds:menu.directListedItemCount,
    dynamicPredicateItemIds:4,
    gameRuntimeMembershipVerified:false,
  }));
  const indexSubmenus=LIVE.map(category=>({
    submenu:category.enumName,submenuCode:category.code,
    sourceSetCount:menus.filter(m=>m.submenuCode===category.code).length,
    distinctCandidateItemIds:10,gameRuntimeMembershipVerified:false,
  }));
  const axes={
    contract:DB01_COLLECTION_UI_AXES,
    source:{
      gameVersion:'1.26.2',sourceItemsSha256:SHA,
      sourceCollectionSetSha256:SHA,
      sourceIl2cppDumpSha256:DB01_COLLECTION_UI_IL2CPP_SHA256,
      privateLocaleOverlaySha256:SHA,nativeCollectionSubMenuDefinitions:20,
      nativeCollectionAreaDefinitions:7,originalCollectionSetDefinitions:305,
      sourceSubMenuWithOriginalSets:18,runtimeStringBindingVerified:false,
      actualGameUiMembershipVerified:false,worldAvailabilityVerified:false,
    },
    async getAreaOptions(locale){
      calls.areas.push(locale);
      return DB01_ORIGINAL_COLLECTION_AREAS.map(spec=>({
        areaCode:spec.code,originalEnumName:spec.enumName,
        originalLocDbKey:spec.locDbKey,locale,
        displayName:locale+' '+spec.locDbKey,
        nativeCollectionAreaEnumVerified:true,
        collectionAreaTabButtonFieldVerified:true,
        currentOriginalLocDbNameVerified:true,
        codeToRuntimeLabelBindingVerified:false,
        itemWorldAvailabilityVerified:false,
      }));
    },
    async getCategoryOptions(locale){
      calls.categories.push(locale);
      return CATEGORIES.map(spec=>({
        submenuCode:spec.code,originalEnumName:spec.enumName,
        originalLocDbKey:spec.locDbKey,locale,
        displayName:locale+' '+spec.locDbKey,
        originalCollectionSetCount:menus.filter(m=>m.submenuCode===spec.code).length,
        originalCollectionSubMenuEnumVerified:true,
        collectionCategoryFilterFieldVerified:true,
        currentOriginalLocDbNameVerified:true,
        codeToRuntimeLabelBindingVerified:false,
        runtimeCategoryVisibleVerified:false,
        itemGameUiMembershipVerified:false,
      }));
    },
    async getCategorySourceSets(locale,code){
      calls.sets.push([locale,code]);
      return menus.filter(menu=>menu.submenuCode===code).map(menu=>({
        setId:menu.setId,nativeSetKey:menu.setKey,submenuCode:code,
        originalSetSortPriority:menu.sortPriority,
        sourceGroupCount:menu.groupCount,
        sourceDirectItemCount:menu.directListedItemCount,
        originalStaticSelectorCount:menu.dynamicSelectorsUnresolved,
        collectionLabelKey:menu.collectionLabelKey,
        locale,currentExactSetName:locale+' '+menu.setKey,
        currentOriginalLocDbLabelVerified:true,
        nativeCollectionSubMenuAssociationVerified:true,
        nativeCollectionAreaCode:null,
        sourceCategoryIsGameScreenMembershipVerified:false,
        playerOwnedVerified:false,worldAvailabilityVerified:false,
        dlcEntitlementVerified:false,
      }));
    },
    async getUnmatchedTabLabels(locale){
      return [{
        originalLocDbKey:'tab_title_critters',
        displayName:locale+' critters',locale,
        originalNameVerified:true,
        collectionSubMenuEnumAssociation:null,
        runtimeVisibilityVerified:false,
      }];
    },
  };
  const source={
    schema:DB01_SOURCE_MENU_INDEX_SCHEMA,
    source:{gameVersion:'1.26.2',sourceItemsSha256:SHA},
    async getSubmenus(){calls.originalSubmenus++;return indexSubmenus;},
    async getCollectionSets(){calls.originalIndex++;return indexSets;},
  };
  const results={
    contract:DB01_DB00_COLLECTION_RESULTS_CONTRACT,
    target:{
      platform:'Steam',gameVersion:'1.26.2',
      snapshotId:'steam-1.26.2-native-itemlist-v1',
      privateSourceSha256:SHA,publicationAuthorized:false,
    },
    async search(query,page){
      calls.query.push({query,page});
      return {
        items:[{
          itemId:100,locale:query.locale,currentExactName:'Verified Item',
          joined:{itemId:'100',origins:[{routeStatus:'confirmed_source_link'}],
            starpathRelations:[{configuredRewardOnly:true}]},
        }],
        totalPublishedMatches:1,totalOriginalSourceCandidates:3,
        unpublishedSourceDefinitionCount:2,
        offset:page?.offset??0,nextOffset:null,hasMore:false,
        snapshotId:this.target.snapshotId,locale:query.locale,
        privateSourceJoin:true,publicationAuthorized:false,
        originalCategoryIsGameUiVerified:false,
        worldAvailabilityVerified:false,dlcEntitlementVerified:false,
      };
    },
  };
  const publicData={
    schema:'wand.game-db.public-sources@1',
    snapshotId:results.target.snapshotId,
    hasPrivateGameSource:false,playerOwnershipVerified:false,
    database:{
      target:{platform:'Steam',gameVersion:'1.26.2',buildId:null},
      itemCount:13202,
    },
    searchItems(request){
      calls.publicQueries.push(request);
      const all=Array.from({length:13202},(_,i)=>100+i);
      const matching=request.text?
        all.filter(id=>String(id).startsWith(request.text)):all;
      const found=matching.slice(request.offset??0,
        (request.offset??0)+(request.limit??100));
      const items=found.map(id=>({
        itemId:String(id),catalog:{id:String(id),nativeCategory:'Furniture',
          names:{en:'Exact '+id,ja:'正確 '+id}},
        catalogStatus:'current_published_item',
        origins:[],starpathRelations:[],currentlyAvailableVerified:false,
        playerOwnershipVerified:false,
      }));
      const next=(request.offset??0)+items.length;
      return Object.freeze({
        scope:'current_published_itemlist',
        snapshotId:results.target.snapshotId,
        total:matching.length,offset:request.offset??0,
        nextOffset:next<matching.length?next:null,
        items:Object.freeze(items),
        sourceCoverageComplete:false,
        liveAvailabilityVerified:false,
        playerOwnershipVerified:false,
      });
    },
  };
  return {axes,source,results,publicData,calls,menus};
}

test('All uses the COMPLETE published 13,202 Items, not only original CollectionSet candidates',async()=>{
  const f=fixture(),browse=createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,f.publicData);
  const page=await browse.search({locale:'ja'},{offset:0,limit:72});
  assert.equal(page.collectionScope,'all_published_items');
  assert.equal(page.scope,'current_published_itemlist');
  assert.equal(page.total,13202);
  assert.equal(page.items.length,72);
  assert.equal(page.items[0].itemId,'100');
  assert.equal(page.items[0].catalog.names.ja,'正確 100');
  assert.equal(page.originalSourceSetMembershipVerified,false);
  assert.equal(page.publicationAuthorized,false);
  assert.equal(page.playerOwnershipVerified,false);
  assert.equal(page.nextOffset,72);
  assert.equal(f.calls.publicQueries.length,1);
  assert.equal(f.calls.query.length,0);
  assert.equal(f.calls.originalIndex,0);
  const last=await browse.search({locale:'ja'},{offset:13200,limit:72});
  assert.equal(last.items.length,2);
  assert.equal(last.nextOffset,null);
  assert.equal(last.total,13202);
  assert.equal(f.calls.query.length,0);
  assert.equal(f.calls.originalIndex,0);
});
test('All source uses exact current public names and ID search, without original source fallback',async()=>{
  const f=fixture(),browse=createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,f.publicData);
  const searched=await browse.search({locale:'en',searchText:'105'},{limit:20});
  assert.equal(searched.collectionScope,'all_published_items');
  assert.equal(searched.total,1);
  assert.deepEqual(searched.items.map(x=>x.itemId),['105']);
  assert.deepEqual(f.calls.publicQueries[0],{
    locale:'en',text:'105',offset:0,limit:20
  });
  assert.equal(f.calls.originalIndex,0);
  assert.equal(f.calls.query.length,0);
});
test('explicit original source conditions never silently fall back to All',async()=>{
  const f=fixture(),browse=createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,f.publicData);
  const byEvidence=await browse.search({
    locale:'ja',listingEvidence:'predicate'
  });
  assert.equal(byEvidence.collectionScope,'original_source_set_candidates');
  assert.equal(byEvidence.totalOriginalSourceCandidates,3);
  assert.equal(f.calls.query.length,1);
  assert.equal(f.calls.publicQueries.length,0);
  assert.equal(f.calls.query[0].query.listingEvidence,'predicate');
  const byNative=await browse.search({locale:'ja',
    nativeCategories:['Furniture']});
  assert.equal(byNative.collectionScope,'original_source_set_candidates');
  assert.equal(f.calls.query.length,2);
});
test('All source must be exact verified public scope; forged Item identity or owner state is rejected',async()=>{
  const f=fixture();
  const tampered=createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,
    {...f.publicData,searchItems:request=>{
      const normal=f.publicData.searchItems(request);
      return {...normal,items:normal.items.map((x,i)=>i===0?
        {...x,playerOwnershipVerified:true}:x)};
    }});
  await assert.rejects(tampered.search({locale:'ja'}),
    /PUBLISHED_ALL_SCOPE_CONFLICT/);
  const renamed=createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,
    {...f.publicData,searchItems:request=>{
      const normal=f.publicData.searchItems(request);
      return {...normal,items:normal.items.map((x,i)=>i===0?
        {...x,itemId:'999'}:x)};
    }});
  await assert.rejects(renamed.search({locale:'ja'}),
    /PUBLISHED_ALL_SCOPE_CONFLICT/);
});
test('current public snapshot mismatch fails at constructor, before Item lookups',()=>{
  const f=fixture();
  assert.throws(()=>createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,
    {...f.publicData,snapshotId:'legacy-switch-1.25.0'}),
    /CURRENT_VERIFIED_SOURCE_COMPOSITION_REQUIRED/);
  assert.throws(()=>createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,
    {...f.publicData,database:{...f.publicData.database,itemCount:12000}}),
    /CURRENT_VERIFIED_SOURCE_COMPOSITION_REQUIRED/);
  assert.throws(()=>createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,
    {...f.publicData,hasPrivateGameSource:true}),
    /CURRENT_VERIFIED_SOURCE_COMPOSITION_REQUIRED/);
  assert.equal(f.calls.query.length,0);
  assert.equal(f.calls.publicQueries.length,0);
});
test('one native navigation response preserves 20 categories, 7 area labels and unbound Critters',async()=>{
  const f=fixture();
  const browse=createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,f.publicData);
  const nav=await browse.getNavigation('ja');
  assert.equal(browse.contract,DB01_COLLECTION_NATIVE_BROWSE_CONTRACT);
  assert.equal(browse.publicationAuthorized,false);
  assert.equal(nav.locale,'ja');
  assert.equal(nav.categories.length,20);
  assert.equal(nav.areaLabelsOnly.length,7);
  assert.equal(nav.areaLabelsOnly[6].areaCode,4097);
  assert.equal(nav.unboundNativeTabLabels.length,1);
  assert.equal(nav.unboundNativeTabLabels[0].originalLocDbKey,'tab_title_critters');
  assert.equal(nav.categories.reduce((sum,c)=>sum+c.original.originalCollectionSetCount,0),305);
  assert.equal(nav.categories.find(c=>c.original.submenuCode===17).sourceCandidateItemCount,0);
  assert.equal(nav.categories.find(c=>c.original.submenuCode===19).sourceCandidateItemCount,0);
  assert.ok(nav.categories.filter(x=>x.original.originalCollectionSetCount>0)
    .every(x=>x.sourceCandidateItemCount===10));
  assert.equal(nav.collectionAreaToItemMembershipVerified,false);
  assert.equal(nav.collectionCategoryToRuntimeTabBindingVerified,false);
  assert.equal(Object.isFrozen(nav),true);
  assert.equal(Object.isFrozen(nav.categories),true);
  assert.deepEqual(f.calls.categories,['ja']);
  assert.deepEqual(f.calls.areas,['ja']);
  assert.equal(f.calls.originalIndex,1);
  assert.equal(f.calls.originalSubmenus,1);
});
test('category Set list resolves exact source labels, order and original evidence counts',async()=>{
  const f=fixture();
  const browse=createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,f.publicData);
  const sets=await browse.getSets('ja',3);
  const expected=f.menus.filter(x=>x.submenuCode===3);
  assert.deepEqual(sets.map(x=>x.original.setId),expected.map(x=>x.setId));
  assert.ok(sets.every(x=>x.original.locale==='ja'&&
    x.sourceCandidateItemCount===5&&
    x.positivePredicateSourceItemCount===4&&
    x.gameRuntimeSetVisibleVerified===false));
  assert.equal(sets[0].original.currentExactSetName,
    'ja '+sets[0].original.nativeSetKey);
  assert.equal(sets[0].directlyListedSourceItemCount,
    sets[0].original.sourceDirectItemCount);
  assert.equal(Object.isFrozen(sets),true);
  await browse.getSets('ja',3);
  assert.deepEqual(f.calls.sets,[['ja',3]]);
  assert.equal(f.calls.originalIndex,1);
});
test('native category and Set Item searches reuse joined DB-00/02/03 evidence and original names',async()=>{
  const f=fixture();
  const browse=createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,f.publicData);
  const set=f.menus.find(m=>m.submenuCode===3);
  const response=await browse.search({
    locale:'ja',submenuCode:3,setId:set.setId,searchText:'王室',
    listingEvidence:'direct',nativeCategories:['Furniture'],
    native:{nativeCategories:['Furniture'],facets:{color:[2000700002]}},
  },{offset:20,limit:30});
  assert.deepEqual(response.items.map(x=>x.itemId),[100]);
  assert.equal(response.items[0].joined.origins[0].routeStatus,
    'confirmed_source_link');
  assert.equal(response.items[0].joined.starpathRelations[0].configuredRewardOnly,
    true);
  assert.equal(response.publicationAuthorized,false);
  assert.equal(response.originalCategoryIsGameUiVerified,false);
  assert.deepEqual(f.calls.query[0].query,{
    locale:'ja',submenuCodes:[3],collectionSetIds:[set.setId],
    searchText:'王室',listingEvidence:'direct',
    nativeCategories:['Furniture'],
    native:{nativeCategories:['Furniture'],facets:{color:[2000700002]}},
  });
  assert.deepEqual(f.calls.query[0].page,{offset:20,limit:30});
});
test('zero original CollectionSet categories remain visible; their source-only search is empty',async()=>{
  const f=fixture();
  const browse=createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,f.publicData);
  assert.deepEqual(await browse.getSets('ja',17),[]);
  assert.deepEqual(await browse.getSets('ja',19),[]);
  for(const code of [17,19]){
    const page=await browse.search({
      locale:'ja',submenuCode:code,searchText:'anything',
    },{offset:0,limit:10});
    assert.equal(page.totalOriginalSourceCandidates,0);
    assert.equal(page.totalPublishedMatches,0);
    assert.equal(page.unpublishedSourceDefinitionCount,0);
    assert.equal(page.hasMore,false);
    assert.equal(page.originalCategoryIsGameUiVerified,false);
  }
  assert.equal(f.calls.query.length,0);
});
test('set without category, unknown Set and unknown code fail before joined search',async()=>{
  const f=fixture();
  const browse=createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,f.publicData);
  await assert.rejects(browse.search({locale:'en',setId:2120000001}),
    /SET_REQUIRES_NATIVE_CATEGORY/);
  await assert.rejects(browse.search({locale:'en',submenuCode:3,
    setId:2120099999}),/SET_NOT_IN_SELECTED_CATEGORY/);
  await assert.rejects(browse.search({locale:'en',submenuCode:17,
    setId:2120000001}),/SET_NOT_IN_SELECTED_CATEGORY/);
  await assert.rejects(browse.search({locale:'en',submenuCode:999}),
    /UNKNOWN_ORIGINAL_SUBMENU/);
  assert.equal(f.calls.query.length,0);
});
test('no invented area, world or UI filter may be used for original Set membership',async()=>{
  const f=fixture();
  const browse=createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,f.publicData);
  await assert.rejects(browse.search({locale:'ja',areaCode:4097}),
    /UNSUPPORTED_FILTER_DIMENSION/);
  await assert.rejects(browse.search({locale:'ja',world:'IsHoneywood'}),
    /UNSUPPORTED_FILTER_DIMENSION/);
  await assert.rejects(browse.search({locale:'ja',gameScreenCategory:'Furniture'}),
    /UNSUPPORTED_FILTER_DIMENSION/);
  assert.equal(f.calls.query.length,0);
});
test('independently pinned original sources and private releases required',()=>{
  const f=fixture();
  assert.throws(()=>createDb01CollectionNativeBrowseClient(
    {...f.axes,source:{...f.axes.source,sourceItemsSha256:'b'.repeat(64)}},
    f.source,f.results,f.publicData),/CURRENT_VERIFIED_SOURCE_COMPOSITION_REQUIRED/);
  assert.throws(()=>createDb01CollectionNativeBrowseClient(
    f.axes,{...f.source,source:{...f.source.source,gameVersion:'1.25.0'}},
    f.results,f.publicData),/CURRENT_VERIFIED_SOURCE_COMPOSITION_REQUIRED/);
  assert.throws(()=>createDb01CollectionNativeBrowseClient(
    f.axes,f.source,{...f.results,target:{...f.results.target,
      privateSourceSha256:'b'.repeat(64)}}),
    /CURRENT_VERIFIED_SOURCE_COMPOSITION_REQUIRED/);
  assert.throws(()=>createDb01CollectionNativeBrowseClient(
    f.axes,f.source,{...f.results,target:{...f.results.target,
      publicationAuthorized:true}}),
    /CURRENT_VERIFIED_SOURCE_COMPOSITION_REQUIRED/);
});
test('original catalog/locale contradiction fails closed; does not invent a category',async()=>{
  const f=fixture();
  const index={
    ...f.source,
    async getCollectionSets(){return (await f.source.getCollectionSets())
      .map((x,i)=>i===0?{...x,sourceMenu:{...x.sourceMenu,setId:2120000002}}:x);},
  };
  const browse=createDb01CollectionNativeBrowseClient(
    f.axes,index,f.results,f.publicData);
  await assert.rejects(browse.getNavigation('ja'),
    /ORIGINAL_SET_INDEX_IDENTITY|ORIGINAL_CATEGORY_SET_COUNTS/);
  const locale={
    ...f.axes,
    async getCategorySourceSets(lang,code){
      const original=await f.axes.getCategorySourceSets(lang,code);
      return original.map((x,i)=>i===0?{
        ...x,nativeSetKey:'Tampered Original'}:x);
    },
  };
  const reader=createDb01CollectionNativeBrowseClient(
    locale,f.source,f.results,f.publicData);
  await assert.rejects(reader.getSets('ja',3),
    /ORIGINAL_SET_LOCALE_OR_INDEX_MISMATCH/);
});
test('unsupported locale and invalid paging are rejected before source reads',async()=>{
  const f=fixture();
  const browse=createDb01CollectionNativeBrowseClient(
    f.axes,f.source,f.results,f.publicData);
  await assert.rejects(browse.getNavigation('en-US'),/INVALID_LOCALE/);
  await assert.rejects(browse.getSets('en-US',3),/INVALID_LOCALE/);
  await assert.rejects(browse.search({locale:'ja'},{limit:501}),
    /INVALID_PAGE/);
  await assert.rejects(browse.search({locale:'invalid'}),
    /INVALID_LOCALE/);
  assert.equal(f.calls.originalIndex,0);
  assert.equal(f.calls.query.length,0);
});
