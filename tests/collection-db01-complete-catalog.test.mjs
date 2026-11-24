import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projectCompleteCollection} from '../src/lib/collection/db01-complete-catalog.ts';
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
