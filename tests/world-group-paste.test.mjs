import test from 'node:test';import assert from 'node:assert/strict';
import {groupSceneOrigin,symmetricWorldCandidate,savedWorldGroupPoses,groupCandidatePoses,captureFurnitureGroup,captureCutWitness,cutWitnessMatches,cutClipboardMatches,groupCutPlan,groupStockAvailable,groupPasteCandidate,rotateFurnitureGroup} from '../src/lib/world/group-paste.ts';
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

import {sceneFromClip,parseSceneAnyFactor,convertSceneFactor} from '../src/lib/world/scene-preset.ts';
test('Save and decoration design Scene files share exact physical offsets',()=>{
 const clip=captureFurnitureGroup([saved(2,4,-3),saved(3,6,-3)]);
 const half=sceneFromClip(clip,2),unit=convertSceneFactor(half,1);
 assert.deepEqual(unit.items.map(p=>[p.dx,p.dy]),[[0,0],[2,0]]);
 assert.deepEqual(convertSceneFactor(parseSceneAnyFactor(JSON.stringify(unit)),2),half);
 const odd=sceneFromClip([{itemId:item,dx:0,dy:0,orientation:2},{itemId:item,dx:1,dy:0,orientation:2}],2);
 assert.equal(convertSceneFactor(odd,1),null);
 const center=groupSceneOrigin(clip,defs,[grid],rasters,{x:9.1,y:-2.1},'center');
 const candidate=groupPasteCandidate(clip,[grid],rasters,defs,new Map([[item,2]]),[],0,center.x,center.y);
 assert.deepEqual(candidate.rows.map(p=>[p.x,p.y]),[[8,2],[10,2]]);
});

test('mirror selection across actual map axis, with existing originals retained and stock checked',()=>{
 const source=[saved(2,4,-3),saved(3,6,-3)],poses=savedWorldGroupPoses(source);
 const axis={mode:'vertical',x:10,y:-3},stock=new Map([[item,2]]);
 const result=symmetricWorldCandidate(poses,axis,false,[grid],rasters,defs,stock,source,0);
 assert.deepEqual(result.rows.map(p=>[p.x,p.y,p.orientation]),[[15,3,'GridOrientation_Down'],[13,3,'GridOrientation_Down']]);
 assert.equal(symmetricWorldCandidate(poses,axis,false,[grid],rasters,defs,new Map([[item,1]]),source,0),null);
 assert.equal(symmetricWorldCandidate(poses,axis,false,[grid],rasters,defs,stock,[...source,saved(4,15,-3)],0).rows.length,1);
 const both=symmetricWorldCandidate(poses,axis,true,[grid],rasters,defs,new Map([[item,4]]),[],0);
 assert.equal(both.rows.length,4);
 assert.equal(groupCandidatePoses(both).length,4);
});
test('point and horizontal reflection are native orientation transforms; unrepresentable axis rejected',()=>{
 const poses=savedWorldGroupPoses([saved(2,4,-3)]),stock=new Map([[item,1]]);
 const point=symmetricWorldCandidate(poses,{mode:'point',x:10,y:-10},false,[grid],rasters,defs,stock,[],0);
 assert.deepEqual(point.rows.map(p=>[p.x,p.y,p.orientation]),[[15,16,'GridOrientation_Up']]);
 const horizontal=symmetricWorldCandidate(poses,{mode:'horizontal',x:10,y:-10},false,[grid],rasters,defs,stock,[],0);
 assert.deepEqual(horizontal.rows.map(p=>[p.x,p.y,p.orientation]),[[4,16,'GridOrientation_Up']]);
 assert.equal(symmetricWorldCandidate(poses,{mode:'vertical',x:10.25,y:-3},false,[grid],rasters,defs,stock,[],0),null);
});

test('cut follows world navigation but never another File or conflicting ordinal',()=>{
 const source=[saved(2,4,-3)],file=new File(['original'],'profile.json'),cut={file,scope:'Village04',rows:captureCutWitness(source)};
 assert.equal(cutClipboardMatches(cut,file,'Village04',source),true);
 assert.equal(cutClipboardMatches(cut,file,'Village04',[]),false);
 assert.equal(cutClipboardMatches(cut,file,'VillageExpansion01',[saved(4,4,-3)]),true);
 assert.equal(cutClipboardMatches(cut,file,'VillageExpansion01',source),false);
 assert.equal(cutClipboardMatches(cut,new File(['original'],'profile.json'),'VillageExpansion01',[]),false);
});

test('room cut clipboard has a room-local witness and follows the same File to outdoors',()=>{
 const file=new File(['original'],'profile.json'),row={roomSource:{roomOrdinal:2,index:4},area:'indoor',itemId:String(item),expectedX:3,expectedY:2,expectedOrientation:'GridOrientation_Down'};
 const cut={file,scope:'indoor',rows:[row]},clip=[{itemId:item,dx:0,dy:0,orientation:2}];
 assert.equal(cutClipboardMatches(cut,file,'Village04',[saved(4,4,-3)]),true);
 assert.equal(cutClipboardMatches(cut,file,'indoor',[]),false);
 assert.equal(cutClipboardMatches(cut,new File(['original'],'profile.json'),'Village04',[]),false);
 const q=groupPasteCandidate(clip,[grid],rasters,defs,new Map([[item,1]]),[],0,8.1,-2.1),plan=groupCutPlan(cut.rows,q);
 assert.deepEqual(plan[0].roomSource,row.roomSource);assert.equal('localOrdinal' in plan[0],false);assert.equal('area' in plan[0],false);
 assert.equal(plan[0].x,8);assert.equal(plan[0].expectedX,3);
});
