import test from 'node:test';
import assert from 'node:assert/strict';
import {seriesShelves,designTiles} from '../src/lib/explore/series.ts';
const item=(id,en,set,style=[],nativeCategory='Furniture',extra={})=>({itemId:id,names:{en},nativeCategory,subtype:0,tags:style.map(s=>['furnitureStyle',s]),universes:[2000500017],sourceSetItemId:set,...extra});
test('exact offer first, real cohesive set across categories, mixed set split by theme/style, every ID reachable',()=>{
 const rows=[item(1,'Table',2040000081),item(2,'Stall',2040000081,[],'Building'),item(3,'Bookish Tiles',2040000246),item(4,'Party Disco Ball',2040000246),item(5,'Old Chair',2040000076,['Rustic']),item(6,'Modern Chair',2040000076,['Modern']),item(7,'Unknown',null),item(8,'Offer light',null),item(9,'Offer rug',null)];
 const groups=seriesShelves(rows,[{key:'shop:1',label:'Offer',kind:'shop',ids:[8,9]}]);
 assert.equal(groups[0].kind,'shop');
 assert.deepEqual(groups.find(g=>g.key==='set:2040000081').items.map(i=>i.itemId),[1,2]);
 assert.notEqual(groups.find(g=>g.items.some(i=>i.itemId===3)).key,groups.find(g=>g.items.some(i=>i.itemId===4)).key);
 assert.notEqual(groups.find(g=>g.items.some(i=>i.itemId===5)).key,groups.find(g=>g.items.some(i=>i.itemId===6)).key);
 assert.deepEqual(groups.flatMap(g=>g.items.map(i=>i.itemId)).sort((a,b)=>a-b),rows.map(i=>i.itemId));
});
test('variant grouping needs shared source prefab and different verified colors, not names alone',()=>{
 const a=item(1,'Black Dining Table',2040000103,[], 'Furniture',{prefabGuid:'abc',tags:[['color','Black'],['furnitureKind','Table']]});
 const b=item(2,'White Dining Table',2040000103,[], 'Furniture',{prefabGuid:'abc',tags:[['color','White'],['furnitureKind','Table']]});
 const c={...b,itemId:3,prefabGuid:'different'};
 assert.deepEqual(designTiles([a,b,c]).map(t=>t.items.map(i=>i.itemId)),[[1,2],[3]]);
 assert.equal(designTiles([{...a,prefabGuid:null},{...b,prefabGuid:null}]).length,2);
});
