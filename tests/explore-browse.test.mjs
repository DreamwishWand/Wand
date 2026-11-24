import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyFilters,matches,groupItems,compareItems,categoryShelves,universeRank,isLargeUniverse} from '../src/lib/explore/browse.ts';
const item=(itemId,universes,tags=[],nativeCategory='Furniture',subtype=0,universeStatus)=>({itemId,universes,tags,nativeCategory,subtype,names:{en:'test'},universeStatus});
test('different facets AND, selections inside a facet OR; category does not reset universe',()=>{
  const f=emptyFilters();f.universes=['1','2'];f.tags.color=['Blue','White'];f.tags.furnitureStyle=['Elegant'];f.families=['furniture','interior'];
  assert.equal(matches(item(1,[2],[['color','White'],['furnitureStyle','Elegant']]),f),true);
  assert.equal(matches(item(1,[1],[['color','Red'],['furnitureStyle','Elegant']]),f),false);
  assert.equal(matches(item(1,[3],[['color','Blue'],['furnitureStyle','Elegant']]),f),false);
  assert.equal(matches(item(1,[1],[['color','Blue'],['furnitureStyle','Elegant']],'Trimming'),f),true);
});
test('universe shelves are category ordered; unknown and untagged stay separate; multiple true links retained',()=>{
  const rows=[item(5,[1],[],'Building'),item(4,[1],[],'Trimming'),item(2,[1,2],[['furnitureKind','Table']]),item(1,[1],[['furnitureKind','Chair']]),item(3,[]),item(6,[],[],'Furniture',0,'unresolved_source')];
  const g=groupItems(rows);
  assert.deepEqual(g.get('1').map(x=>x.itemId),[1,2,4,5]);
  assert.deepEqual(g.get('2').map(x=>x.itemId),[2]);
  assert.deepEqual(g.get('none').map(x=>x.itemId),[3]);
  assert.deepEqual(g.get('unknown').map(x=>x.itemId),[6]);
  assert.deepEqual([...groupItems(rows,['2']).keys()],['2']);
});

test('DDV and explicit NonIP are the final universes and get independent category shelves',()=>{
  const ids=['2000500017','none','2','unknown','2000500023'];
  assert.deepEqual(ids.sort((a,b)=>universeRank(a)-universeRank(b)),['2','none','unknown','2000500023','2000500017']);
  assert.equal(isLargeUniverse('none'),false);
  assert.equal(isLargeUniverse('2000500017'),true);
  const rows=[item(3,[2000500017],[],'Building'),item(1,[2000500017]),item(2,[2000500017],[],'Trimming')];
  assert.deepEqual(categoryShelves(rows).map(([family,items])=>[family,items.map(x=>x.itemId)]),[['furniture',[1]],['interior',[2]],['buildings',[3]]]);
  assert.equal(groupItems(rows).has('none'),false);
});
