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
