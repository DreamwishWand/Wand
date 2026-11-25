import test from 'node:test';
import assert from 'node:assert/strict';
import {categoriesOf,matchesScope,readDecorationScope,browseType,browseSection} from '../src/lib/explore/scope.ts';
import {emptyFilters,matches} from '../src/lib/explore/browse.ts';
const item=(nativeCategory,subtype,kinds=[],worlds=[])=>({itemId:40000001,nativeCategory,subtype,names:{en:'Test'},universes:[1],tags:kinds.map(k=>['furnitureKind',k]),worlds});
test('default outdoor; dedicated items excluded only from opposite mode',()=>{
 assert.equal(readDecorationScope(null),'outdoor');
 const wallpaper=item('Trimming',0),path=item('Furniture',1),wall=item('Furniture',0,['Wall']),seat=item('Furniture',0,['Seating']);
 assert.deepEqual([wallpaper,path,wall,seat].map(i=>matchesScope(i,'outdoor')),[false,true,true,true]);
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

test('DB-01 source floor classes supersede furniture tag guesses; surface/special remains unknown',()=>{
 const source=(floorClass,acceptedFloorMask,surface=false)=>({floorClass,acceptedFloorMask,surface,scene:null,placementLegalityVerified:false});
 const wall={...item('Furniture',0,['Wall']),sourcePlacement:source('terrain_and_floor_wall',3073)};
 const room={...item('Furniture',0,['Chair']),sourcePlacement:source('floor_wall_only',1024)};
 const terrain={...item('Furniture',0,['Bed']),sourcePlacement:source('terrain_only',4)};
 const surface={...item('Furniture',0,['Wall']),sourcePlacement:source('floor_wall_only',5120,true)};
 assert.deepEqual([wall,room,terrain,surface].map(i=>matchesScope(i,'outdoor')),[true,false,true,true]);
 assert.deepEqual([wall,room,terrain,surface].map(i=>matchesScope(i,'indoor')),[true,true,false,true]);
});
test('building stalls, skins and room materials do not mix with universe furniture',()=>{
 assert.equal(browseType(item('Building',1)),'buildings');
 assert.equal(browseSection(item('Building',1)),'type:building:1');
 assert.equal(browseSection(item('Skin',1)),'type:skin:1');
 assert.equal(browseType(item('Trimming',0)),'wallpaper');
 assert.equal(browseType(item('Furniture',0,['F_Chair'])),'furniture');
 assert.deepEqual(categoriesOf(item('Furniture',0,['F_Chair','F_Misc'])),['seating']);
});
