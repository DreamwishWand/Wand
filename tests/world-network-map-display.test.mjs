import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNetworkMap,visibleNetworkEdges} from '../src/lib/world/network-map-display.ts';
import {fenceFamily} from '../src/lib/world/fence-family-catalog.ts';
const base=40700000,family=fenceFamily(base),g={key:'a',factor:2,sizeX:40,sizeY:40,origin:{position:[0,0,0]}};
const f=(itemId,x,y,orientation=2,diagonal=false)=>({itemId,x,y,orientation,network:{kind:'fence',base,diagonal}});
const obj=(r,i)=>({area:'a',factor:2,x:r.x/2,y:-r.y/2,shape:{width:2,height:2},object:{localOrdinal:i+1,localGridOrdinal:1,itemId:String(r.itemId),x:r.x,y:r.y,orientationCode:r.orientation*4,layer:r.network.kind==='road'?'ground':'fence'}});
test('native horizontal extension and adjacent posts draw correct endpoints',()=>{
 const rows=[f(base,2,2),f(family.ext[0],4,2),f(base,6,2),f(base,8,2)];
 const result=buildNetworkMap([g],rows.map(obj),[{key:'a',rows}]);
 assert.equal(result.parts.size,4);assert.equal(result.edges.length,2);assert.deepEqual(result.components.get(2),[1,2,3,4]);
 assert.deepEqual(result.edges.map(e=>[e.x1,e.y1,e.x2,e.y2]),[[1.5,-1.5,3.5,-1.5],[3.5,-1.5,4.5,-1.5]]);
 assert.equal(visibleNetworkEdges(result.edges,{x:1,y:-2,w:1,h:1}).length,1);
});
test('native negative-slope diagonal and missing endpoint fallback',()=>{
 const rows=[f(base,2,6,2,true),f(family.diagExt[0],4,4,3,true),f(base,6,2,2,true)];
 const result=buildNetworkMap([g],rows.map(obj),[{key:'a',rows}]);
 assert.deepEqual(result.edges.map(e=>[e.x1,e.y1,e.x2,e.y2]),[[1.5,-3.5,3.5,-1.5]]);assert.deepEqual(result.components.get(2),[1,2,3]);
 const partial=rows.slice(0,2);assert.equal(buildNetworkMap([g],partial.map(obj),[{key:'a',rows:partial}]).edges.length,0);
 assert.equal(buildNetworkMap([g],rows.slice(0,2).map(obj),[{key:'a',rows}]).parts.size,0);
});
test('stale or mismatched save projection cannot draw connections',()=>{
 const rows=[f(base,2,2),f(base,4,2)],objects=rows.map(obj);objects[1].object.x=8;
 assert.equal(buildNetworkMap([g],objects,[{key:'a',rows}]).parts.size,0);
});

test('verified components include extension pieces, preserve isolated posts and separate road modes',()=>{
 const road=(x,y,diagonal=false)=>({itemId:40100068,x,y,orientation:2,network:{kind:'road',diagonal}});
 const rows=[f(base,2,2),f(family.ext[0],4,2),f(base,6,2),f(base,24,24),road(0,0),road(4,0),road(8,0,true)];
 const result=buildNetworkMap([g],rows.map(obj),[{key:'a',rows}]);assert.deepEqual(result.components.get(2),[1,2,3]);assert.deepEqual(result.components.get(4),[4]);assert.deepEqual(result.components.get(5),[5,6]);assert.deepEqual(result.components.get(7),[7]);
});
