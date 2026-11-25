import test from 'node:test';import assert from 'node:assert/strict';
import {parseFurnitureStock} from '../src/lib/world/furniture-stock-view.ts';
const receipt=rows=>({contract:'wand.db05.furniture-catalog-stock@1',rows,exactStoredCounts:true,canonicalVariationVerified:false,writerAuthorized:false});
test('ordinary furniture stock keeps zero distinct from absent and rejects unexpected records',()=>{
 const stock=parseFurnitureStock(receipt([{itemId:40000001,amount:3},{itemId:40000002,amount:0}]));
 assert.equal(stock.get(40000001),3);assert.equal(stock.get(40000002),0);assert.equal(stock.has(40000003),false);
 for(const rows of [[{itemId:40100001,amount:1}],[{itemId:40000001,amount:-1}],[{itemId:40000001,amount:2147483648}],[{itemId:40000001,amount:1,marker:'secret'}],[{itemId:40000001,amount:0},{itemId:40000001,amount:1}]])assert.throws(()=>parseFurnitureStock(receipt(rows)));
 assert.throws(()=>parseFurnitureStock({...receipt([]),writerAuthorized:true}));
});
