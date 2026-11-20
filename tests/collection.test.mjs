import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_KEY, MAX_WORKSPACES, createCollectionState, validateCollectionState,
  readCollectionState, persistCollectionState, activeWorkspace, addWorkspace,
  renameWorkspace, removeWorkspace, setCollectionEntry,
  exportCollectionState, importCollectionState, collectionProgress
} from '../src/lib/collection/state.mjs';
import { CATEGORY_ORDER, categorySummaries, filterItems } from '../src/lib/collection/taxonomy.mjs';

test('all 29 owner-defined Collection category entries remain present', () => {
  assert.equal(CATEGORY_ORDER.length, 29);
  assert.equal(new Set(CATEGORY_ORDER).size, 29);
});
test('empty state does not turn missing data into zero owned', () => {
  const state = createCollectionState();
  assert.deepEqual(collectionProgress([{itemId:101},{itemId:102}], activeWorkspace(state).entries), {
    owned:0,missing:0,unknown:2,discovered:0,total:2
  });
});
test('manual state persists and restores without inventing a game-save write', () => {
  const disk = new Map();
  const storage = { getItem:(key)=>disk.get(key)??null, setItem:(key,value)=>disk.set(key,value) };
  let state = createCollectionState();
  state = setCollectionEntry(state, 101, { status:'owned', quantity:7, favorite:true });
  persistCollectionState(storage,state);
  assert.equal(JSON.parse(disk.get(LOCAL_KEY)).workspaces[0].entries[101].quantity,7);
  assert.deepEqual(readCollectionState(storage),state);
  assert.equal(importCollectionState(exportCollectionState(state)).workspaces[0].entries[101].status,'owned');
});
test('per-workspace states do not leak across profiles', () => {
  let state = setCollectionEntry(createCollectionState(),101,{status:'owned'});
  state = addWorkspace(state,'Second','local-2');
  assert.equal(state.workspaces.length,2);
  assert.equal(activeWorkspace(state).entries[101],undefined);
  state = setCollectionEntry(state,101,{status:'missing'});
  assert.equal(state.workspaces[0].entries[101].status,'owned');
  assert.equal(state.workspaces[1].entries[101].status,'missing');
  state = renameWorkspace(state,'local-2','New Name');
  assert.equal(activeWorkspace(state).name,'New Name');
  state = removeWorkspace(state,'local-2');
  assert.equal(state.active,'local-1');
});
test('invalid backups, unsafe quantity and unknown keys are rejected', () => {
  let state = createCollectionState();
  assert.throws(()=>setCollectionEntry(state,101,{quantity:-1}));
  assert.throws(()=>setCollectionEntry(state,101,{unexpected:true}));
  assert.throws(()=>importCollectionState('{"schema":"bad"}'));
  for (let i=2;i<=MAX_WORKSPACES;i++) state=addWorkspace(state,'Local '+i,'local-'+i);
  assert.throws(()=>addWorkspace(state,'Too many','local-6'));
  assert.throws(()=>validateCollectionState({...state,active:'missing'}));
});
test('filtering matches cross-language labels and personal status without guessing unknown', () => {
  const data=[
    {itemId:101,family:'Furniture',worlds:['w'],universes:['u'],expansions:['base'],searchText:'chair 椅子'},
    {itemId:102,family:'Furniture',worlds:['w'],universes:['u'],expansions:['base'],searchText:'table テーブル'}
  ];
  assert.equal(filterItems(data,{query:'テーブル'}).length,1);
  assert.equal(filterItems(data,{state:'missing',entries:{}}).length,0);
  assert.equal(filterItems(data,{state:'owned',entries:{101:{status:'owned'}}}).length,1);
  assert.equal(categorySummaries(data,{101:{status:'owned'}}).find(x=>x.id==='Furniture').owned,1);
});
