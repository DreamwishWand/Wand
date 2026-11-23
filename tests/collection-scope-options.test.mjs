import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionScopeOptions} from '../src/lib/collection/scope-options.ts';

const WORLD='verified_game_collection_area_item_membership';
const UNIVERSE='verified_game_collection_universe_item_membership';
const names=(en,ja)=>[en,en,en,en,en,ja,en,en];
const meta=(scope={})=>({
  snapshot:'fixture',worlds:['IsDreamlightValley','isHoneywood'],
  universes:['Mickey','Winnie'],
  worldLabels:[names('Dreamlight Valley','ドリームライトバレー'),names('Honeyglow Woods','ハニーグローの森')],
  universeLabels:[names('Mickey & Friends','ミッキー＆フレンズ'),names('Winnie the Pooh','くまのプーさん')],
  verifiedScopeMembership:scope,
});
const facets=[
  {id:'IsDreamlightValley',label:'Dreamlight Valley',total:30,owned:3},
  {id:'isHoneywood',label:'Honeyglow Woods',total:4,owned:1},
  {id:'Mickey',label:'Mickey & Friends',total:9,owned:0},
  {id:'Winnie',label:'Winnie the Pooh',total:0,owned:0},
  {id:'Fake',label:'Unverified',total:500,owned:0},
];

test('raw source Tag IDs and original enum names never unlock Collection-area filters',()=>{
  assert.deepEqual(collectionScopeOptions(meta(), 'world',facets,'ja'),[]);
  assert.deepEqual(collectionScopeOptions(meta({world:WORLD}), 'universe',facets,'ja'),[]);
  assert.deepEqual(collectionScopeOptions(meta({universe:UNIVERSE}), 'world',facets,'ja'),[]);
});
test('verified per-Item world scopes show only existing positive matched members',()=>{
  const options=collectionScopeOptions(meta({world:WORLD}), 'world',facets,'ja');
  assert.deepEqual(options.map(x=>[x.id,x.label,x.total]),[
    ['IsDreamlightValley','ドリームライトバレー',30],
    ['isHoneywood','ハニーグローの森',4]
  ]);
  assert.equal(Object.isFrozen(options),true);
  assert.equal(Object.isFrozen(options[0]),true);
  assert.deepEqual(collectionScopeOptions(meta({world:WORLD}), 'world',facets,'en').map(x=>x.label),
    ['Dreamlight Valley','Honeyglow Woods']);
});
test('universe scope is independently gated and omits zero-membership options',()=>{
  const options=collectionScopeOptions(meta({universe:UNIVERSE}), 'universe',facets,'ja');
  assert.deepEqual(options.map(x=>[x.id,x.total]),[['Mickey',9]]);
});
test('malformed and absent source label arrays cannot fabricate visible choices',()=>{
  const invalid={...meta({world:WORLD}),worldLabels:[names('valley','バレー')]};
  assert.deepEqual(collectionScopeOptions(invalid,'world',facets,'ja'),[]);
  const emptyNames={...meta({world:WORLD}),worldLabels:[[],[]]};
  assert.deepEqual(collectionScopeOptions(emptyNames,'world',facets,'ja'),[]);
  assert.deepEqual(collectionScopeOptions(null,'world',facets,'ja'),[]);
  assert.deepEqual(collectionScopeOptions(meta({world:WORLD}),'world',facets,'xx'),[]);
});
