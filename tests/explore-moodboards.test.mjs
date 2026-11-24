import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoards,createBoard,toggleItem,deleteBoard,readBoards,toggleFavorite,editBoard} from '../src/lib/explore/model.ts';
test('multiple moodboards, separate item references and favorites survive persistence',()=>{
  let s=createBoard(emptyBoards(),'a','Garden');
  s=toggleItem(s,'a',40000001);
  s=createBoard(s,'b','Room');
  s=toggleFavorite(s,40000001);
  s=editBoard(s,'a',b=>({...b,groups:[{id:'g',name:'Trees'}],entries:[{itemId:40000001,groupId:'g'}],note:'Idea'}));
  assert.deepEqual(readBoards(JSON.stringify(s)),s);
  assert.equal(s.boards[1].entries.length,0);
  assert.equal(deleteBoard(s,'b').active,'a');
  assert.equal(toggleItem(s,'a',40000001).boards[0].entries.length,0);
  assert.throws(()=>readBoards('{"schema":"bad"}'));
});
