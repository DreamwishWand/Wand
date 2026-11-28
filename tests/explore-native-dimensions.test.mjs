import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {itemPageNativeFacts} from '../src/lib/items/item-page-details.ts';
const quick=readFileSync(new URL('../src/lib/explore/ExploreQuickView.svelte',import.meta.url),'utf8');
test('Quick View uses exact shared native bounds, not an inferred occupied footprint',()=>{
 const facts=(category,grid)=>itemPageNativeFacts({nativeCategory:category,sourceAttributes:{GridAreaData:grid}}).footprint;
 assert.deepEqual(facts('Furniture',{SizeX:2,SizeY:7}),{x:2,y:7});
 assert.deepEqual(facts('Building',{SizeX:12,SizeY:9}),{x:12,y:9});
 for(const grid of [{},{SizeX:0,SizeY:2},{SizeX:-1,SizeY:4},{SizeX:1.5,SizeY:4}])assert.equal(facts('Furniture',grid),null);
 assert.equal(facts('Skin',{SizeX:2,SizeY:7}),null);
 assert.match(quick,/currentItemViewMaster\(base\)\.then\(db=>db\.getItem\(id\)\)/);
 assert.match(quick,/record\?\.itemId===id&&record\.nativeCategory===category/);
 assert.match(quick,/itemPageNativeFacts\(record\)\.footprint/);
 assert.match(quick,/detailCopy\.boundsOnly/);
 assert.match(quick,/return\(\)=>\{live=false;\}/);
 assert.doesNotMatch(quick,/LayerValues|AcceptedFloorTypesFlag|loadCompleteCollection/);
});
