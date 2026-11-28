import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {usableItemName} from '../src/lib/items/display-name.ts';
import {projectCompleteCollection,loadCompleteCollection} from '../src/lib/collection/db01-complete-catalog.ts';
import {collectionSubcategories} from '../src/lib/collection/subcategories.ts';
import {buildWorldBrowseIndex} from '../src/lib/collection/world-browse-index.ts';
import {collectionSourceRoot,COLLECTION_TOP_CATEGORIES} from '../src/lib/collection/category-hierarchy.ts';
import {collectionUniverseIds,COLLECTION_UNIVERSE_UNTAGGED,COLLECTION_UNIVERSE_UNRESOLVED} from '../src/lib/collection/browse-layout.ts';
const path='static/ddv/item-master/steam-1.26.2-complete/collection-facets.json';
test('source-complete Collection joins exact IDs, roots, worlds and universe states',async()=>{
  const source=JSON.parse(await readFile(path,'utf8'));
  const index=projectCompleteCollection(source);
  assert.equal(source.sourceItemCount,39067);
  assert.equal(source.browseItems.length,16176);
  assert.equal(index.rootsByItem.size,index.sourceItemCount);
  assert.equal(index.nativeSubtypeByItem.size,index.sourceItemCount);
  assert.equal([...index.itemsByRoot.values()].reduce((n,ids)=>n+ids.length,0),index.sourceItemCount);
  assert.equal(index.rootsByItem.has(2130000001),false,'Condition definitions must never enter collection');
  assert.equal(index.rootsByItem.get(100000010),'touch-of-magic');
  assert.equal(index.rootsByItem.get(40005160),'furniture');
  assert.equal(index.rootsByItem.get(30200000),'ingredients');
  assert.equal(index.rootsByItem.get(30300001),'meals');
  assert.equal(index.rootsByItem.get(30400010),'ingredients');
  assert.equal(index.universeSourceStatusByItem.size,index.sourceItemCount);
  const untagged=collectionUniverseIds(index,COLLECTION_UNIVERSE_UNTAGGED);
  const unresolved=collectionUniverseIds(index,COLLECTION_UNIVERSE_UNRESOLVED);
  const linked=index.universeTagIdsByItem.size;
  assert.equal(linked+untagged.length+unresolved.length,index.sourceItemCount);
  assert(untagged.every(id=>!index.universeTagIdsByItem.has(id)));
  assert(unresolved.every(id=>!index.universeTagIdsByItem.has(id)));
  const scopes=buildWorldBrowseIndex(index);
  assert.equal(scopes.get('').itemIds.length,index.sourceItemCount);
  for(const [world,scope] of scopes){
    assert.equal([...scope.rootCounts.values()].reduce((n,v)=>n+v,0),scope.itemIds.length);
    if(world)assert(scope.itemIds.every(id=>index.byItem.get(id)?.some(([facet,key])=>facet==='worldContextTag'&&key===world)));
  }
  console.log('COLLECTION_V3_CENSUS '+JSON.stringify({
    population:index.sourceItemCount,roots:COLLECTION_TOP_CATEGORIES.map(r=>[r.id,index.itemsByRoot.get(r.id)?.length??0]),
    linked,untagged:untagged.length,unresolved:unresolved.length,withIcon:index.iconGuidByItem.size
  }));
});
test('native taxonomy retains semantic distinctions rather than assigning every item to Other',()=>{
  assert.equal(collectionSourceRoot('Clothing',6,[4]),'clothing');
  assert.equal(collectionSourceRoot('Character',0,[7,20]),'adventure-companions');
  assert.equal(collectionSourceRoot('Companion',1,[]),'critters');
  assert.equal(collectionSourceRoot('Companion',3,[]),'mounts');
  assert.equal(collectionSourceRoot('Skin',5,[]),'buildings');
  assert.equal(collectionSourceRoot('ActivityItem',12,[]),null);
  assert.equal(collectionSourceRoot('ActivityItem',16,[9]),'gems');
});

test('Report complete source coverage by native subtype, including excluded item candidates',async()=>{
  const source=JSON.parse(await readFile(path,'utf8'));
  const index=projectCompleteCollection(source);
  const scopes=new Map(source.definitionScopeItems),browse=new Map(source.browseItems.map(r=>[r[0],r]));
  const types=new Map(source.nativeSubtypeItems.map(r=>[r[0],r]));
  const menus=new Map(source.categoryItems), recipes=new Map(source.craftingRecipeResultItems);
  const summary=new Map();
  for(const [id,type,code,name] of source.nativeSubtypeItems){
    const key=type+':'+code+':'+(name??'');
    const row=summary.get(key)??{total:0,browse:0,excluded:0,recipes:0,withMenu:0,nonBrowse:0,samples:[]};
    row.total++;if(browse.has(id))row.browse++;else row.nonBrowse++;
    if(!index.rootsByItem.has(id)&&browse.has(id)){
      row.excluded++;if(recipes.has(id))row.recipes++;if(menus.has(id))row.withMenu++;
      if(row.samples.length<3)row.samples.push([id,scopes.get(id),menus.get(id)??[]]);
    }
    summary.set(key,row);
  }
  console.log('COLLECTION_CATEGORY_GAPS '+JSON.stringify([...summary].filter(([,v])=>v.excluded||v.browse)));
  console.log('COLLECTION_EXHIBITION '+JSON.stringify(source.categoryItems.filter(([,codes])=>codes.includes(19)).map(([id,codes])=>[id,types.get(id),codes,scopes.get(id)])));
  const furnitureKinds=new Map();
  for(const [id,tags] of source.items)if(index.rootsByItem.get(id)==='furniture')
    for(const [facet,key] of tags)if(facet==='furnitureKind')furnitureKinds.set(key,(furnitureKinds.get(key)??0)+1);
  console.log('COLLECTION_FURNITURE_KINDS '+JSON.stringify([...furnitureKinds]));
});

test('all verified collectible native classes are recovered from canonical source fields',async()=>{
  const fetcher=async url=>new Response(await readFile('static/'+url.replace(/^\/Wand\//,'')),{status:200});
  const source=JSON.parse(await readFile(path,'utf8'));
  const full=await loadCompleteCollection('/Wand',fetcher);
  const index=full.index;
  assert.equal(index.sourceItemCount,full.rows.length);
  const base=projectCompleteCollection(source);
  const named=new Set();
  for(const locale of ['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'])
    for(const [id,label] of await full.master.getBrowseNames(locale))if(usableItemName(label))named.add(id);
  for(const id of base.rootsByItem.keys())if(named.has(id))assert(index.rootsByItem.has(id),'named original candidates must remain visible');
  assert(full.rows.every(row=>Object.values(row.names).some(usableItemName)),'unnamed definitions cannot inflate the visible checklist');
  assert(full.rows.some(row=>row.id==='40005160'),'named real furniture remains visible');
  const worlds=buildWorldBrowseIndex(index);
  for(const [key,scope] of worlds){
    for(const root of COLLECTION_TOP_CATEGORIES){
      const groups=collectionSubcategories(index,root.id,scope);
      const actual=new Set(groups.flatMap(group=>group.ids));
      const expected=(index.itemsByRoot.get(root.id)??[]).filter(id=>scope.itemIdSet.has(id));
      assert.equal(actual.size,expected.length);
      assert(expected.every(id=>actual.has(id)));
      assert(groups.every(group=>group.ids.length===group.total&&group.total>0));
    }
  }
  const furniture=collectionSubcategories(index,'furniture',worlds.get(''));
  assert(furniture.filter(group=>group.key.startsWith('furniture-kind:')).length>5);
  assert(!furniture.some(group=>group.key==='Furniture:0'));
  console.log('COLLECTION_FINAL_CATEGORY_CENSUS '+JSON.stringify({
    population:index.sourceItemCount,excludedUnnamed:[...base.rootsByItem.keys()].filter(id=>!named.has(id)).length,
    roots:COLLECTION_TOP_CATEGORIES.map(row=>[row.id,index.itemsByRoot.get(row.id)?.length??0]),
    furniture:furniture.map(row=>[row.key,row.total])
  }));
});
