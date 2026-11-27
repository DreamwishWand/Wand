import test from 'node:test';
import assert from 'node:assert/strict';
import {worldMoveEligible,worldRotateEligible,draftSavedMapTransform} from '../src/lib/world/saved-map-transform.ts';
import {mainlandFreeHits} from '../src/lib/world/mainland-world-coordinates.ts';
import {stockSourceEligible,landscapeSourceEligible} from '../src/lib/world/save-furniture-placement.ts';
const o={localOrdinal:1,localGridOrdinal:1,itemId:'40000001',x:1,y:1,orientation:'GridOrientation_Down',orientationCode:8,layer:'furniture',shapeKey:'40000001:8',editRestrictions:{select:'denied',move:'denied',rotate:'denied',remove:'denied'}};
test('game flags are overridable without overriding support and native network invariants',()=>{
 assert.equal(worldMoveEligible(o),false);assert.equal(worldMoveEligible(o,true),true);assert.equal(worldRotateEligible(o,true),true);
 assert.ok(draftSavedMapTransform(o,2,2,'GridOrientation_Right',true));
 assert.equal(worldMoveEligible({...o,subgrid:{}},true),false);
 assert.equal(worldMoveEligible({...o,layer:'ground',itemId:'40100068'},true),false);
 assert.equal(stockSourceEligible({shape:{},object:o},true),true);
 assert.equal(landscapeSourceEligible({shape:{},object:{...o,itemId:'40200001',layer:'landscape'}},true),true);
});
test('nonstandard placement falls back only to a unique source rectangle',()=>{
 const g={key:'g',factor:1,sizeX:3,sizeY:3,origin:{position:[0,0,0]},bounds:{x:0,y:-3,w:3,h:3}},h={...g,key:'h'};
 const r={sizeX:3,sizeY:3,nativeFloorValues:new Uint32Array(9)};
 assert.deepEqual(mainlandFreeHits([g],new Map([['g',r]]),1,-1),[g]);
 assert.equal(mainlandFreeHits([g,h],new Map([['g',r],['h',r]]),1,-1).length,2);
 assert.equal(mainlandFreeHits([g],new Map([['g',r]]),4,-1).length,0);
});

import {alignmentTargets} from '../src/lib/world/map-alignment.ts';
import {stageWorldTargets,emptyWorldTimeline,currentWorldEdits} from '../src/lib/world/saved-map-batch.ts';
test('free alignment permits restricted furniture but not structural dependencies or networks',()=>{
 const a=o,b={...o,localOrdinal:2,x:5,y:3};
 const map={objects:[a,b],shapes:{[o.shapeKey]:{width:1,height:1,runs:[{x:0,y:0,width:1}]}}};
 assert.equal(alignmentTargets(map,map.objects,'left'),null);
 const targets=alignmentTargets(map,map.objects,'left',true);
 assert.ok(targets);assert.deepEqual(targets.map(t=>[t.x,t.y]),[[1,1],[1,3]]);
 const next=stageWorldTargets(map,emptyWorldTimeline(),targets,'test',true);
 assert.ok(next);assert.equal(currentWorldEdits(next).length,1);
 assert.equal(currentWorldEdits(next)[0].plan.replacementX,1);
 assert.equal(alignmentTargets(map,[a,{...b,subgrid:{}}],'left',true),null);
 assert.equal(alignmentTargets(map,[a,{...b,itemId:'40100068',layer:'ground'}],'left',true),null);
});

import {playerHouseSourceEligible,playerHouseDuplicate} from '../src/lib/world/save-furniture-placement.ts';
import {bindMainlandGrid} from '../src/lib/world/mainland-world-coordinates.ts';
test('player house exterior duplication targets only the exact original native grid',()=>{
 const g=bindMainlandGrid({key:'Beach',layoutId:'SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json',gridDataPath:'GridData/Villages/Village04-BeachLevel-GridData.json',gridIdNative:0,factor:1,sizeX:400,sizeY:350});
 assert.ok(g);
 const r={sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:new Uint32Array(g.sizeX*g.sizeY)};
 const shape={width:2,height:2,cellCount:4,runs:[{x:0,y:0,width:2},{x:0,y:1,width:2}]};
 const p={area:g.key,factor:g.factor,x:g.bounds.x+1,y:g.bounds.y+g.bounds.h-1,shape,object:{...o,itemId:'20500001',nativeType:'Building',layer:'other'}};
 assert.equal(playerHouseSourceEligible(p),true);
 const rasters=new Map([[g.key,r]]),x=g.bounds.x+5.1,y=g.bounds.y+g.bounds.h-6.1;
 const q=playerHouseDuplicate([g],rasters,p,x,y);
 assert.ok(q);assert.deepEqual([q.plan.x,q.plan.y],[5,6]);assert.equal(q.plan.itemId,'20500001');
 assert.equal(playerHouseDuplicate([g],rasters,{...p,area:'Other'},x,y),null);
 assert.equal(playerHouseDuplicate([g],rasters,{...p,object:{...p.object,subgrid:{}}},x,y),null);
 assert.equal(playerHouseSourceEligible({...p,object:{...p.object,itemId:'20000001'}}),false);
});
