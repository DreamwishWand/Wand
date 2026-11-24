import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyFilters,matches,groupItems,compareItems} from '../src/lib/explore/browse.ts';
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
