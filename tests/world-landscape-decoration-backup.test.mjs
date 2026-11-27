import test from 'node:test';
import assert from 'node:assert/strict';
import {landscapeRows,verifiedLandscape,landscapeDelta} from '../src/lib/world/landscape-decoration-preset.ts';
const g={key:'a',sizeX:10,sizeY:10,factor:1},row={itemId:40200001,x:1,y:2,orientation:2};
const obj={area:'a',factor:1,shape:{width:1,height:1},object:{itemId:'40200001',x:1,y:2,orientation:'GridOrientation_Down',layer:'landscape',editRestrictions:{remove:'allowedFlag'}}};
test('only exact native and source-allowed landscape poses are captured',()=>{
 assert.deepEqual(verifiedLandscape(g,[obj],[row]),[row]);
 assert.deepEqual(verifiedLandscape(g,[{...obj,object:{...obj.object,editRestrictions:{remove:'denied'}}}],[row]),[]);
 assert.deepEqual(verifiedLandscape(g,[obj],[]),[]);
 assert.deepEqual(landscapeRows([row,row],g),[row,row]);assert.throws(()=>landscapeRows([{...row,itemId:40000001}],g));
});

test('free landscape backups retain exact multiplicities and fixed placements',()=>{
 const a={...obj,object:{...obj.object,localOrdinal:1,editRestrictions:{remove:'denied'}}};
 const b={...a,object:{...a.object,localOrdinal:2}};
 assert.deepEqual(verifiedLandscape(g,[a,b],[row,row],true),[row,row]);
 assert.deepEqual(verifiedLandscape(g,[a,b],[row,row]),[]);
 assert.deepEqual(verifiedLandscape(g,[a],[row,row],true),[]);
 assert.equal(landscapeDelta(g,[a,b],[row,row],[row]),null);
 assert.deepEqual(landscapeDelta(g,[a,b],[row,row],[row],true),{removed:[b],added:[]});
 assert.deepEqual(landscapeDelta(g,[a,b],[row,row],[row,row,row],true),{removed:[],added:[row]});
});
