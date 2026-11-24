import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadCompleteCollection} from '../src/lib/collection/db01-complete-catalog.ts';
import {collectionSubcategories,collectionFurnitureKinds,collectionUsesSubcategories} from '../src/lib/collection/subcategories.ts';
import {makeCollectionBrowseOrder,collectionUniverseRootSection} from '../src/lib/collection/semantic-browse.ts';
import {buildWorldBrowseIndex} from '../src/lib/collection/world-browse-index.ts';

const fetcher=async url=>new Response(await readFile('static/'+url.replace(/^\/Wand\//,'')),{status:200});
test('specific furniture kind takes priority over overlapping general tags',()=>{
  assert.deepEqual(collectionFurnitureKinds(['Decor','Misc','Essential','Storage','Table']),['Storage','Table']);
  assert.deepEqual(collectionFurnitureKinds(['Essential','Misc','Decor']),['Decor']);
  assert.deepEqual(collectionFurnitureKinds(['Misc']),['Misc']);
  assert.deepEqual(collectionFurnitureKinds([]),[]);
});
test('exact source ordering, category coverage and entity relationships',async()=>{
  const {index}=await loadCompleteCollection('/Wand',fetcher);
  const all=buildWorldBrowseIndex(index).get('');
  const ids=root=>(index.itemsByRoot.get(root)??[]).map(itemId=>({itemId}));
  for(const root of ['furniture','clothing']){
    const rows=ids(root);
    const order=makeCollectionBrowseOrder(index,'ja',false);
    const sorted=[...rows].sort(order.compare);
    assert.equal(new Set(sorted.map(r=>r.itemId)).size,rows.length);
    const seen=new Set();let last='';
    for(const row of sorted){
      const key=order.universeKey(row.itemId);
      if(key!==last){assert(!seen.has(key),'universe groups must be contiguous');seen.add(key);last=key;}
    }
    const setRuns=new Map();
    for(const [i,row] of sorted.entries()){
      const set=index.sourceSetByItem.get(row.itemId);
      if(set==null)continue;
      const key=order.universeKey(row.itemId)+':'+set;
      const old=setRuns.get(key);
      if(old!=null)assert.equal(i,old+1,'exact set members must remain adjacent');
      setRuns.set(key,i);
    }
  }
  const mounts=collectionSubcategories(index,'mounts',all);
  assert.deepEqual(mounts.map(g=>g.key),['mount:base','mount:skin','mount:gear'].filter(key=>mounts.some(g=>g.key===key)));
  assert.equal(new Set(mounts.flatMap(g=>g.ids)).size,ids('mounts').length);
  for(const group of mounts)for(const id of group.ids)assert.equal(collectionUniverseRootSection(index,id).part,group.key);
  const characters=ids('characters');
  assert.equal(collectionUsesSubcategories('characters',collectionSubcategories(index,'characters',all)),false);
  for(const universeSelected of [false,true]){
    const order=makeCollectionBrowseOrder(index,'ja',universeSelected);
    const sorted=characters.slice().sort(order.compare);
    const positions=new Map(sorted.map((row,i)=>[row.itemId,i]));
    for(const [skin,parent] of index.parentEntityByItem){
      if(!positions.has(parent)||!positions.has(skin))continue;
      assert(positions.get(parent)<positions.get(skin),'base precedes its own skin');
      assert.equal(order.universeKey(skin),order.universeKey(parent));
      for(let i=positions.get(parent)+1;i<=positions.get(skin);i++)
        assert.equal(index.parentEntityByItem.get(sorted[i].itemId),parent,'no unrelated item between character and styles');
    }
  }
  const furniture=collectionSubcategories(index,'furniture',all);
  assert.equal(new Set(furniture.flatMap(g=>g.ids)).size,ids('furniture').length);
  console.log('COLLECTION_SEMANTIC_CENSUS '+JSON.stringify({sets:index.sourceSetByItem.size,parents:index.parentEntityByItem.size,
    characterParents:[...index.parentEntityByItem].filter(([id])=>index.rootsByItem.get(id)==='characters').length,
    mountParents:[...index.parentEntityByItem].filter(([id])=>index.rootsByItem.get(id)==='mounts').length,
    furniture:furniture.map(g=>[g.key,g.total]),mounts:mounts.map(g=>[g.key,g.total])}));
});
