import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb01SourceCollectionTaxonomyClient} from './source-collection-taxonomy.ts';

const SHA='a'.repeat(64),FILE_SHA='b'.repeat(64);
const MENUS=[
  {setId:11,setKey:'Furniture!One',submenuCode:3,submenu:'FurnitureSets',
    collectionLabelKey:'CollectionSet.FurnitureOne',sortPriority:2,groupCount:2,
    directListedItemCount:1,dynamicSelectorsUnresolved:1,gameUiVisibilityVerified:false},
  {setId:12,setKey:'Companions!One',submenuCode:15,submenu:'Companions',
    collectionLabelKey:null,sortPriority:0,groupCount:1,
    directListedItemCount:0,dynamicSelectorsUnresolved:1,gameUiVisibilityVerified:false},
  {setId:13,setKey:'Furniture!Two',submenuCode:3,submenu:'FurnitureSets',
    collectionLabelKey:'CollectionSet.FurnitureTwo',sortPriority:1,groupCount:2,
    directListedItemCount:1,dynamicSelectorsUnresolved:260,gameUiVisibilityVerified:false},
];
function direct(m,groupIndex){
  return {
    setId:m.setId,setKey:m.setKey,
    submenuCode:m.submenuCode,submenu:m.submenu,
    collectionLabelKey:m.collectionLabelKey,groupIndex,
    evidence:'current_original_collectionset_explicit_item_list',
  };
}
function predicate(m,groupIndex,origin='set-universe'){
  return {origin,collectionSetId:m.setId,groupIndex,sourceMenu:m};
}
function item(itemId,nativeCategory,directs=[],candidates=[],suppressed=[]){
  return {
    itemId,gameVersion:'1.26.2',nativeCategory,
    item:{itemId,nativeCategory},
    collection:{
      direct:directs,setUniverse:[],special:[],
      activityCrafting:{positive:[],negative:[]},
      candidates,suppressed,craftingExclusions:'available',
    },
  };
}
function fixture(){
  const calls={catalog:[],shared:[],menus:0};
  const setDefs=new Map(MENUS.map((m,i)=>[m.setId,{
    itemId:m.setId,nativeCategory:'CollectionSet',nativeKey:m.setKey,
    sourceSha256:FILE_SHA,
    names:{
      ja:i===2?null:['家具セット①','おともだち'][i],
      en:i===2?null:['Furniture Set One','Companions'][i],
    },
  }]));
  const items=new Map([
    [100,item(100,'Furniture',[direct(MENUS[0],0)])],
    [200,item(200,'Clothing',[],[
      predicate(MENUS[0],1),predicate(MENUS[2],1,'activity-crafting'),
    ],[{candidate:predicate(MENUS[1],0),exclusions:['source-negative']}])],
    [300,item(300,'Furniture',[direct(MENUS[2],0)],
      [predicate(MENUS[2],1,'special'),predicate(MENUS[2],1,'set-universe')])],
    [400,item(400,'Tag')],
  ]);
  const catalog={
    source:{platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
      fullCorpusParsed:true,sourceItemsSha256:SHA,definitions:4},
    getItems:async ids=>{
      calls.catalog.push([...ids]);
      return ids.map(id=>setDefs.get(id)??null);
    },
  };
  const shared={
    source:{platform:'Steam',gameVersion:'1.26.2',
      sourceItemsSha256:SHA,definitions:4},
    getCoverage:()=>({
      totalDefinitions:4,sourceCollectionSetDefinitions:3,
      directListedIds:2,sourceDynamicSelectorsTotal:262,
      sourceDynamicSelectorsResolved:262,
    }),
    getSourceMenus:async()=>{calls.menus++;return MENUS;},
    getItems:async ids=>{
      calls.shared.push([...ids]);
      return ids.map(id=>items.get(id)??null);
    },
  };
  return {catalog,shared,items,calls,setDefs};
}

test('build source SubMenu -> CollectionSet hierarchy with exact current names',async()=>{
  const f=fixture(),api=createDb01SourceCollectionTaxonomyClient(
    f.catalog,f.shared);
  const tree=await api.getSourceHierarchy('ja');
  assert.deepEqual(tree.map(x=>[x.submenuCode,x.originalSubmenu,
    x.sourceSetCount,x.exactCurrentLocalizedHeading]),[
    [3,'FurnitureSets',2,null],[15,'Companions',1,null],
  ]);
  assert.deepEqual(tree[0].sourceSets.map(x=>[
    x.collectionSetId,x.currentExactSetName,x.groupCount,
    x.dynamicSourceSelectorCount,x.currentExactNameVerified,
    x.gameUiSetDisplayNameVerified,
  ]),[[13,null,2,260,false,false],[11,'家具セット①',2,1,true,false]]);
  assert.equal(tree[0].gameUiMembershipVerified,false);
  assert.equal(Object.isFrozen(tree),true);
  assert.equal(Object.isFrozen(tree[0].sourceSets),true);
  assert.equal(api.source.sourceStaticSelectors,262);
  assert.equal(api.source.sourceSetDefinitions,3);
  assert.equal(f.calls.catalog.length,1);
  assert.equal(f.calls.shared.length,0);
});
test('single-Item source category reverse lookup avoids scanning every original item',async()=>{
  const f=fixture(),api=createDb01SourceCollectionTaxonomyClient(
    f.catalog,f.shared);
  const result=await api.getItem(100,'ja');
  assert.equal(result.itemId,100);
  assert.equal(result.nativeCategory,'Furniture');
  assert.equal(result.originalSourcePredicatesComplete,true);
  assert.equal(result.actualGameUiMembershipVerified,false);
  assert.equal(result.sourceLinks.length,1);
  assert.equal(result.sourceLinks[0].sourceSet.originalSetKey,'Furniture!One');
  assert.equal(result.sourceLinks[0].sourceSet.currentExactSetName,'家具セット①');
  assert.deepEqual(result.sourceLinks[0].groups.map(x=>[
    x.groupIndex,x.originalDirectListing,x.positiveSourcePredicateOrigins,
  ]),[[0,true,[]]]);
  assert.equal(result.sourceLinks[0].sourceCandidatesOnly,true);
  assert.equal(result.sourceLinks[0].possessionVerified,false);
  assert.deepEqual(f.calls.shared,[[100]]);
  assert.deepEqual(f.calls.catalog,[[11]]);
});
test('same set groups preserve independent direct listing and positive predicate origins',async()=>{
  const f=fixture(),api=createDb01SourceCollectionTaxonomyClient(
    f.catalog,f.shared);
  const result=await api.getItem(300,'ja');
  assert.equal(result.sourceLinks.length,1);
  assert.equal(result.sourceLinks[0].sourceSet.collectionSetId,13);
  assert.deepEqual(result.sourceLinks[0].groups.map(x=>[
    x.groupIndex,x.originalDirectListing,x.positiveSourcePredicateOrigins,
  ]),[[0,true,[]],[1,false,['set-universe','special']]]);
});
test('source-negative Crafting suppression cannot become a positive group match',async()=>{
  const f=fixture(),api=createDb01SourceCollectionTaxonomyClient(
    f.catalog,f.shared);
  const result=await api.getItem(200,'ja');
  assert.deepEqual(result.sourceLinks.map(x=>x.sourceSet.collectionSetId),[11,13]);
  assert.deepEqual(result.sourceLinks.map(x=>x.groups[0].groupIndex),[1,1]);
  assert.deepEqual(result.sourceLinks.map(x=>
    x.groups[0].positiveSourcePredicateOrigins),[
    ['set-universe'],['activity-crafting'],
  ]);
});
test('known no-Collection-link definition versus unknown Item ID and duplicate input',async()=>{
  const f=fixture(),api=createDb01SourceCollectionTaxonomyClient(
    f.catalog,f.shared);
  const results=await api.getItems([400,999,100,100],'en');
  assert.equal(results[0].nativeCategory,'Tag');
  assert.deepEqual(results[0].sourceLinks,[]);
  assert.equal(results[1],null);
  assert.equal(results[2].sourceLinks[0].sourceSet.currentExactSetName,
    'Furniture Set One');
  assert.deepEqual(results[2],results[3]);
  assert.deepEqual(f.calls.shared,[[400,999,100,100]]);
  assert.equal(Object.isFrozen(results),true);
});
test('empty batch, invalid locale and overlong item batch fail without private reads',async()=>{
  const f=fixture(),api=createDb01SourceCollectionTaxonomyClient(
    f.catalog,f.shared);
  assert.deepEqual(await api.getItems([],'ja'),[]);
  await assert.rejects(api.getItems([100],'xx'),/INVALID_LOCALE/);
  await assert.rejects(api.getItems([0],'ja'),/INVALID_ITEM_BATCH/);
  await assert.rejects(api.getItems(Array(4097).fill(100),'ja'),
    /INVALID_ITEM_BATCH/);
  await assert.rejects(api.getItem(0,'ja'),/INVALID_ITEM_ID/);
  assert.deepEqual(f.calls.shared,[]);
  assert.deepEqual(f.calls.catalog,[]);
});
test('missing or incomplete source overlays never masquerade as no links',async()=>{
  const f=fixture();
  assert.throws(()=>createDb01SourceCollectionTaxonomyClient(
    f.catalog,{...f.shared,getCoverage:()=>({
      totalDefinitions:4,sourceCollectionSetDefinitions:3,
      directListedIds:null,sourceDynamicSelectorsTotal:262,
      sourceDynamicSelectorsResolved:261,
    })}),/INCOMPLETE_OR_MISMATCHED_CURRENT_COLLECTION_SOURCE/);
  const absentItem={...f.items.get(100),collection:{
    ...f.items.get(100).collection,activityCrafting:null,
    craftingExclusions:'unavailable',
  }};
  const api=createDb01SourceCollectionTaxonomyClient(
    f.catalog,{...f.shared,getItems:async()=>[absentItem]});
  await assert.rejects(api.getItem(100,'ja'),
    /INCOMPLETE_OR_MISMATCHED_ITEM_COLLECTION_SOURCE/);
});
test('source Set ID/native-key mismatch and invalid native submenu are rejected',async()=>{
  const f=fixture();
  f.setDefs.set(11,{...f.setDefs.get(11),nativeKey:'Incorrect!Key'});
  const api=createDb01SourceCollectionTaxonomyClient(f.catalog,f.shared);
  await assert.rejects(api.getSourceHierarchy('ja'),/ORIGINAL_COLLECTION_SET_IDENTITY/);
  const g=fixture(),wrongMenus=MENUS.map(m=>m.setId===11?
    {...m,submenuCode:15,submenu:'FurnitureSets'}:m);
  const wrong=createDb01SourceCollectionTaxonomyClient(
    g.catalog,{...g.shared,getSourceMenus:async()=>wrongMenus});
  await assert.rejects(wrong.getSourceHierarchy('ja'),
    /CONFLICTING_NATIVE_COLLECTION_SUBMENU/);
});
test('malformed CollectionSet group links and null original source links fail closed',async()=>{
  const f=fixture(),broken=f.items.get(100);
  f.items.set(100,{...broken,collection:{
    ...broken.collection,direct:[{...direct(MENUS[0],9)}],
  }});
  await assert.rejects(createDb01SourceCollectionTaxonomyClient(
    f.catalog,f.shared).getItem(100,'ja'),/ITEM_COLLECTION_SOURCE_NOT_IN_ORIGINAL_MENU/);
  const g=fixture(),row=g.items.get(100);
  g.items.set(100,{...row,collection:{...row.collection,direct:null}});
  await assert.rejects(createDb01SourceCollectionTaxonomyClient(
    g.catalog,g.shared).getItem(100,'ja'),
    /INCOMPLETE_OR_MISMATCHED_ITEM_COLLECTION_SOURCE/);
});
