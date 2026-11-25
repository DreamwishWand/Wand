import test from 'node:test';import assert from 'node:assert/strict';
import {captureFurnitureGroup,captureCutWitness,cutWitnessMatches,groupCutPlan,groupStockAvailable,groupPasteCandidate,rotateFurnitureGroup} from '../src/lib/world/group-paste.ts';
const item=40000001;
const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],path:'',acceptedFloorTypesFlag:4};
const geometry={itemId:item,name:'Table',layer:'furniture',surfaceCapable:false,shapes:Object.fromEntries([0,4,8,12].map(code=>[item+':'+code,shape]))};
const defs=new Map([[item,new Map([[1,geometry]])]]);
const saved=(n,x,y)=>({area:'A',x,y,factor:1,shape,object:{localOrdinal:n,localGridOrdinal:1,itemId:String(item),x,y:-y,orientation:'GridOrientation_Down',orientationCode:8,shapeKey:item+':8',name:'Table',layer:'furniture',surfaceCapable:false}});
const grid={key:'A',factor:1,sizeX:20,sizeY:20,origin:{position:[0,0,0]},bounds:{x:0,y:-20,w:20,h:20},layoutId:'SceneLayouts/Village04/A.json',gridDataPath:'GridData/A.json'};
const rasters=new Map([['A',{sizeX:20,sizeY:20,nativeFloorValues:Uint32Array.from({length:400},()=>4)}]]);
test('clipboard keeps physical relative positions and orientation without Save identity',()=>{
 const clip=captureFurnitureGroup([saved(2,4,-3),saved(3,6,-3)]);
 assert.deepEqual(clip,[{itemId:item,dx:0,dy:0,orientation:2},{itemId:item,dx:4,dy:0,orientation:2}]);
 assert.equal(groupStockAvailable(clip,new Map([[item,1]])),false);
 assert.equal(groupStockAvailable(clip,new Map([[item,2]])),true);
 const rotated=rotateFurnitureGroup(clip,defs,1);
 assert.deepEqual(rotated.map(p=>[p.dx,p.dy,p.orientation]),[[0,0,1],[0,4,1]]);
});
test('group placement is atomic, rejects bad terrain, occupied cells and insufficient aggregate stock',()=>{
 const clip=captureFurnitureGroup([saved(2,4,-3),saved(3,6,-3)]),stock=new Map([[item,2]]);
 const candidate=groupPasteCandidate(clip,[grid],rasters,defs,stock,[],0,8.1,-2.1);
 assert.deepEqual(candidate.rows.map(p=>[p.x,p.y,p.orientation]),[[8,2,'GridOrientation_Down'],[10,2,'GridOrientation_Down']]);
 assert.equal(groupPasteCandidate(clip,[grid],rasters,defs,stock,[],0,19.1,-2.1),null);
 assert.equal(groupPasteCandidate(clip,[grid],rasters,defs,stock,[saved(4,10,-2)],0,8.1,-2.1),null);
 assert.equal(groupPasteCandidate(clip,[grid],rasters,defs,new Map([[item,1]]),[],0,8.1,-2.1),null);
});

test('cut witness must match every original furniture pose and keeps each source identity in plan',()=>{
 const items=[saved(2,4,-3),saved(3,6,-3)],cut=captureCutWitness(items);
 assert.equal(cutWitnessMatches(cut,items),true);
 assert.equal(cutWitnessMatches(cut,[items[0],saved(3,7,-3)]),false);
 const clip=captureFurnitureGroup(items),candidate=groupPasteCandidate(clip,[grid],rasters,defs,new Map([[item,2]]),[],0,8.1,-2.1);
 const plan=groupCutPlan(cut,candidate);
 assert.deepEqual(plan.map(p=>[p.localOrdinal,p.expectedX,p.x]),[[2,4,8],[3,6,10]]);
 assert.equal(groupCutPlan(cut.slice(0,1),candidate),null);
});
