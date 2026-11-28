import test from 'node:test';
import assert from 'node:assert/strict';
import {profileFavorites} from '../src/lib/explore/profile-favorites.ts';
test('favorites use only active workspace and explicit true',()=>{
  const state={schema:'wand.collection.local@1',active:'b',workspaces:[{id:'a',name:'First',entries:{'10':{favorite:true},'20':{favorite:false}}},{id:'b',name:'Second',entries:{'30':{favorite:true},'40':{status:'owned'},'50':{favorite:false},'01':{favorite:true}}}]};
  assert.deepEqual([...profileFavorites(state).ids],[30]);
  assert.equal(profileFavorites(state).workspaceCount,2);
  assert.deepEqual([...profileFavorites({...state,active:'a'}).ids],[10]);
  assert.throws(()=>profileFavorites({...state,active:'missing'}));
});
