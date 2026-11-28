import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSourceGridPredicate as match} from '../tools/db-01-items/store-native-grid-predicate.mjs';
const grid=(x,y,floor=1024,layers=Array(x*y).fill(4))=>({SizeX:x,SizeY:y,AcceptedFloorTypesFlag:floor,Layers:layers});
test('native size qualification: floor area and wall width use distinct original ranges',()=>{
 for(const [x,y,q] of [[1,1,1],[2,1,2],[4,4,2],[17,1,3],[8,8,3],[13,5,4]]){
  const r=match(grid(x,y),{sizeQualifiers:[q]});assert.equal(r.sizeQualifierCode,q);assert.equal(r.status,'passed');
 }
 for(const [x,q] of [[1,1],[2,2],[4,2],[5,3],[7,3],[8,4]]){
  const r=match(grid(x,9,2048),{sizeQualifiers:[q]});assert.equal(r.sizeQualifierCode,q);assert.equal(r.status,'passed');
 }
});
test('native min/max rotation is independent; wall branch ignores vertical source bound',()=>{
 const r=match(grid(2,5),{minArea:[4,2],maxArea:[3,6],canRotate:true});
 assert.equal(r.minimumPassed,true);assert.equal(r.maximumPassed,true);assert.equal(r.status,'passed');
 assert.equal(match(grid(2,5),{minArea:[4,2],maxArea:[3,6]}).status,'failed');
 assert.equal(match(grid(3,8,2048),{maxArea:[3,1]}).status,'passed');
 assert.equal(match(grid(4,1,2048),{maxArea:[3,1],canRotate:true}).status,'failed');
});
test('native layer mask, invalid area and unverified ignore tags do not fabricate a route',()=>{
 assert.equal(match(grid(2,1,1024,[4,20]),{excludedLayers:[16]}).status,'failed');
 assert.equal(match(grid(2,1,1024,[4,8]),{excludedLayers:[16]}).status,'passed');
 assert.equal(match(grid(2,1,1024,[4]),{maxArea:[3,3]}).status,'failed');
 assert.equal(match(grid(2,1,1024,[4,96]),{maxArea:[3,3]}).status,'unresolved');
 assert.equal(match(grid(4,1),{maxArea:[1,1],ignoreSizeForTags:[2000300021]}).status,'unresolved');
 assert.equal(match(grid(1,1),{maxArea:[1,1],ignoreSizeForTags:[2000300021]}).status,'passed');
 assert.equal(match({},{maxArea:[1,1]}).status,'unresolved');
 assert.equal(match(null,{}).status,'passed');
});

test('native ignore-size tag bypass reads only original direct item tags',()=>{
 const f={maxArea:[1,1],ignoreSizeForTags:[2000300021]};
 assert.equal(match(grid(5,1),f,[2000300021]).status,'passed');
 assert.equal(match(null,f,[2000300021]).status,'passed');
 assert.equal(match(grid(5,1),f,[]).status,'failed');
 assert.equal(match(grid(5,1),f).status,'unresolved');
 assert.equal(match(grid(5,1),f,[2000300011]).status,'failed');
});
