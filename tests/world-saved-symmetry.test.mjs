import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parsePublicTerrainBundle} from '../src/lib/world/public-terrain-projection.ts';
import {bindMainland,mainlandMapAnchor} from '../src/lib/world/mainland-world-coordinates.ts';
import {emptyWorldTimeline,currentWorldEdits,travelWorldTimeline} from '../src/lib/world/saved-map-batch.ts';
import {savedSymmetryDraft} from '../src/lib/world/saved-world-symmetry.ts';
const bundle=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(new URL('../static/ddv/world/steam-1.26.2/village04.json',import.meta.url),'utf8')));
const g=bindMainland(bundle.grids).find(g=>g.key==='Meadow');
const grids=[g],rasters=new Map([[g.key,{sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:new Uint32Array(g.sizeX*g.sizeY).fill(4)}]]);
const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],path:'M0 0h1v1H0Z'};
const o={localOrdinal:1,localGridOrdinal:3,itemId:'40005160',x:4,y:6,orientation:'GridOrientation_Down',shapeKey:'40005160:8',orientationCode:8,name:'Fixture',layer:'furniture',surfaceCapable:false};
const native=(localOrdinal,x,y,overrides={})=>({...o,localOrdinal,x,y,...overrides});
const projected=object=>({area:g.key,object,shape,factor:g.factor,...mainlandMapAnchor(g,object.x,object.y)});
const a=projected(o),b=projected(native(2,8,6));
const axis={mode:'vertical',x:(a.x+b.x+1)/2,y:a.y};
const timeline=emptyWorldTimeline();
function run(items,all,eligible,action,s=axis){
 const m={layoutId:g.layoutId,gridIdNative:g.gridIdNative,gridDataPath:g.gridDataPath,sourceGridFactor:g.factor,objects:all.map(p=>p.object),shapes:Object.fromEntries([0,4,8,12].map(i=>[o.itemId+':'+i,shape])),actualOccupancyVerified:false,savedSourceCoordinateEquivalenceVerified:false};
 return savedSymmetryDraft(items,all,new Set(eligible),s,action,grids,rasters,new Map([[g.key,m]]),timeline);
}
test('linked existing furniture mirrors move and rotation in one undoable edit without new IDs',()=>{
 const moved=run([a],[a,b],[1,2],{dx:1,dz:0});
 assert(moved.next);assert.equal(moved.ghosts.length,2);assert.equal(moved.next.snapshots.length,2);
 assert.deepEqual(currentWorldEdits(moved.next).map(e=>[e.plan.localOrdinal,e.plan.replacementX]),[[1,5],[2,7]]);
 assert.deepEqual(currentWorldEdits(travelWorldTimeline(moved.next,-1)),[]);
 const rotated=run([a],[a,b],[1,2],{turn:1});
 assert(rotated.next);
 assert.deepEqual(currentWorldEdits(rotated.next).map(e=>[e.plan.localOrdinal,e.plan.replacementOrientation]),[[1,'GridOrientation_Right'],[2,'GridOrientation_Left']]);
 assert.equal(currentWorldEdits(timeline).length,0);
});
test('linked symmetry refuses missing, locked, ambiguous or contradictory pairs and non-native cells',()=>{
 assert.equal(run([a],[a],[1],{dx:1,dz:0}).next,null);
 assert.equal(run([a],[a,b],[1],{dx:1,dz:0}).next,null);
 const duplicate=projected(native(3,8,6));
 assert.equal(run([a],[a,b,duplicate],[1,2,3],{dx:1,dz:0}).next,null);
 assert.equal(run([a,b],[a,b],[1,2],{dx:1,dz:0}).next,null);
 assert.equal(run([a],[a,b],[1,2],{dx:.5,dz:0}).next,null);
 assert.equal(run([a],[a,b],[1,2],{dx:5000,dz:0}).next,null);
 const parallel=run([a,b],[a,b],[1,2],{dx:0,dz:1});assert(parallel.next);
 assert.deepEqual(currentWorldEdits(parallel.next).map(e=>[e.plan.localOrdinal,e.plan.replacementY]),[[1,7],[2,7]]);
});
test('point symmetry links opposite cardinal orientations and preserves native source IDs',()=>{
 const c=projected(native(3,8,10,{orientation:'GridOrientation_Up',orientationCode:0,shapeKey:o.itemId+':0'}));
 const center={mode:'point',x:(a.x+c.x+1)/2,y:(a.y+c.y-1)/2};
 const q=run([a],[a,c],[1,3],{dx:1,dz:1},center);assert(q.next);
 assert.deepEqual(currentWorldEdits(q.next).map(e=>[e.plan.localOrdinal,e.plan.replacementX,e.plan.replacementY]),[[1,5,7],[3,7,9]]);
});
