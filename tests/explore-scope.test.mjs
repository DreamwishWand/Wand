import test from 'node:test';
import assert from 'node:assert/strict';
import {categoriesOf,matchesScope,readDecorationScope} from '../src/lib/explore/scope.ts';
import {emptyFilters,matches} from '../src/lib/explore/browse.ts';
const item=(nativeCategory,subtype,kinds=[],worlds=[])=>({itemId:40000001,nativeCategory,subtype,names:{en:'Test'},universes:[1],tags:kinds.map(k=>['furnitureKind',k]),worlds});
test('default outdoor; dedicated items excluded only from opposite mode',()=>{
 assert.equal(readDecorationScope(null),'outdoor');
 const wallpaper=item('Trimming',0),path=item('Furniture',1),wall=item('Furniture',0,['Wall']),seat=item('Furniture',0,['Seating']);
 assert.deepEqual([wallpaper,path,wall,seat].map(i=>matchesScope(i,'outdoor')),[false,true,false,true]);
 assert.deepEqual([wallpaper,path,wall,seat].map(i=>matchesScope(i,'indoor')),[true,false,true,true]);
 assert.ok([wallpaper,path,wall,seat].every(i=>matchesScope(i,'all')));
 assert.deepEqual(categoriesOf(wallpaper),['wallpaper']);
 assert.deepEqual(categoriesOf(item('Furniture',7)),['fence']);
 assert.deepEqual(categoriesOf(item('Furniture',0,['F_Seating','Table'])),['seating','table']);
});
test('categories and world source tags combine with OR within and AND across axes',()=>{
 const f={...emptyFilters(),categories:['seating','table'],worlds:['a','b']};
 assert.equal(matches(item('Furniture',0,['Seating'],['b']),f),true);
 assert.equal(matches(item('Furniture',0,['Table'],['c']),f),false);
 assert.equal(matches(item('Furniture',0,['Bed'],['b']),f),false);
});

test('current shared ordinary scope overrides legacy tag guesses and keeps ambiguous or special items visible',()=>{
 const source=(i,scopeHint,roomFloorWallCandidate,terrainCandidate)=>({...i,sourcePlacement:{
   ordinaryScope:{scopeHint,roomFloorWallCandidate,terrainCandidate},placementLegalityVerified:false
 }});
 const shared=source(item('Furniture',0,['Wall']),'both',true,true);
 const indoor=source(item('Furniture',0,['Decor']),'indoor',true,false);
 const outdoor=source(item('Building',1),'outdoor',false,true);
 const special=source(item('Furniture',2),'unknown',null,null);
 const invalid=source(item('Furniture',0,['Wall']),'indoor',null,false);
 const unknown={...indoor,placementScope:'unknown'};
 const verified={...shared,placementScope:'indoor'};
 const rows=[shared,indoor,outdoor,special,invalid,unknown,verified];
 assert.deepEqual(rows.map(i=>matchesScope(i,'outdoor')),[true,false,true,true,true,true,false]);
 assert.deepEqual(rows.map(i=>matchesScope(i,'indoor')),[true,true,false,true,true,true,true]);
 assert(rows.every(i=>matchesScope(i,'all')));
 assert.deepEqual(categoriesOf(outdoor),['buildings']);
});
