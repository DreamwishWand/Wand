import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionHasRecordedProgress,collectionHasQuantity,collectionQuantityPatch,collectionOverwriteMessage}
 from '../src/lib/collection/manual-record.ts';
const make=entries=>({schema:'wand.collection.local@1',active:'a',workspaces:[{id:'a',name:'A',entries},{id:'b',name:'B',entries:{'1':{status:'owned'}}}]});
test('only existing progress in active workspace requires an overwrite confirmation',()=>{
 assert.equal(collectionHasRecordedProgress(make({})),false);
 assert.equal(collectionHasRecordedProgress(make({'1':{favorite:true}})),false);
 for(const entry of [{status:'owned'},{status:'missing'},{quantity:0},{discovered:false}]){
   assert.equal(collectionHasRecordedProgress(make({'1':entry})),true);
 }
 for(const locale of ['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'])
   assert.ok(collectionOverwriteMessage(locale).length>8);
});
test('quantity controls accept integer manual stock without inventing quantities',()=>{
 assert.equal(collectionHasQuantity({family:'Furniture',stateSemantic:'OWNERSHIP_AND_DISCOVERY'}),true);
 assert.equal(collectionHasQuantity({family:'Characters',stateSemantic:'UNLOCKED_LOCKED'}),false);
 assert.deepEqual(collectionQuantityPatch('0'),{quantity:0});
 assert.deepEqual(collectionQuantityPatch('999999'),{quantity:999999});
 for(const value of ['', '-1','1.5','1e3','1000000','Infinity','NaN'])
   assert.equal(collectionQuantityPatch(value),null);
});
