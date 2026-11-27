import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreStockRows} from '../src/lib/world/restore-stock-review.ts';
test('restore inventory review aggregates all scopes and sorts shortages first',()=>{
 const a={returned:new Map([[40000001,3]]),required:new Map([[40000002,2]])};
 const b={returned:new Map([[40000002,1]]),required:new Map([[40000001,2],[40000002,4]])};
 assert.deepEqual(restoreStockRows([a,b],[{itemId:40000002,quantity:3}],new Map([[41000001,2]])),[
  {itemId:40000002,returned:1,required:6,missing:3,finishes:0},
  {itemId:40000001,returned:3,required:2,missing:0,finishes:0},
  {itemId:41000001,returned:0,required:0,missing:0,finishes:2}
 ]);
 assert.deepEqual(restoreStockRows([]),[]);
});
