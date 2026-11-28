import test from 'node:test';import assert from 'node:assert/strict';
const face={kind:'floor',ordinal:1,wallPosition:null,finish:null,gridStatus:'full',items:[{itemId:40000002,quantity:1}],positions:[{itemId:40000002,x:1,y:2,orientationCode:8}],factor:1,missingPositions:0};
const room={ordinal:1,house:1,floor:1,name:'Test',ceiling:null,surfaces:[face]};

test('indoor support witnesses match exact room surface and pose',async()=>{
 const {parseIndoorSupportParents}=await import('../src/lib/world/indoor-support.ts');
 const full={...face,missingPositions:0};
 const rooms=[{...room,surfaces:[full]}];
 const row={roomOrdinal:1,surfaceOrdinal:1,index:0,localOrdinal:7,itemId:40000002,x:1,y:2};
 assert.deepEqual(parseIndoorSupportParents({supportParents:[row]},rooms),[row]);
 assert.throws(()=>parseIndoorSupportParents({supportParents:[{...row,x:3}]},rooms));
 assert.throws(()=>parseIndoorSupportParents({supportParents:[row,row]},rooms));
 assert.throws(()=>parseIndoorSupportParents({supportParents:[{...row,gridId:43}]},rooms));
 assert.deepEqual(parseIndoorSupportParents({},rooms),[]);
});

test('room support pickup keeps exact ordinal and cardinal pose and rejects stale or locked selection',async()=>{
 const {roomSupportPickupPlan}=await import('../src/lib/world/indoor-support.ts');
 const w={roomOrdinal:1,surfaceOrdinal:1,index:0,localOrdinal:7,itemId:40000002,x:1,y:2};
 const shapes={'40000002:8':{width:1,height:1}},allowed=new Set([40000002]);
 assert.deepEqual(roomSupportPickupPlan(face,[w],[0],shapes,allowed),[{localOrdinal:7,itemId:'40000002',expectedX:1,expectedY:2,expectedOrientation:'GridOrientation_Down',includeSupport:true}]);
 assert.equal(roomSupportPickupPlan(face,[w],[0],shapes,new Set()),null);
 assert.equal(roomSupportPickupPlan(face,[{...w,x:3}],[0],shapes,allowed),null);
 assert.equal(roomSupportPickupPlan(face,[w],[0,0],shapes,allowed),null);
 assert.equal(roomSupportPickupPlan({...face,positions:[{...face.positions[0],orientationCode:10}]},[w],[0],{'40000002:10':shapes['40000002:8']},allowed),null);
 assert.equal(roomSupportPickupPlan({...face,positions:[{...face.positions[0],plain:true}]},[w],[0],shapes,allowed),null);
});

test('support free placement permits overlap and terrain holes but requires native bounds and known shape',async()=>{
 const {supportFreeEdit,supportPlacementFits,supportStockPlacement}=await import('../src/lib/world/subgrid-local.ts');
 const id=40000002,tree={factor:1,sourcePath:'GridData/Furniture/Test.json',objects:[{itemId:id,x:0,y:0,orientation:'GridOrientation_Down',child:null},{itemId:id,x:1,y:0,orientation:'GridOrientation_Down',child:null}]};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:4,path:'M0 0h1v1H0Z'},shapes={[id+':8']:shape},raster={sizeX:2,sizeY:2,nativeFloorValues:Uint32Array.from([4,4,0,0])};
 assert.equal(supportFreeEdit(tree,shapes,new Set([id]),raster,0,1,0,'GridOrientation_Down'),null);
 assert.ok(supportFreeEdit(tree,shapes,new Set([id]),raster,0,1,0,'GridOrientation_Down',true));
 assert.ok(supportStockPlacement(tree,shapes,raster,id,1,0,1,'GridOrientation_Down',true));
 assert.equal(supportPlacementFits(tree,shapes,raster,id,2,1,'GridOrientation_Down',true),false);
 assert.equal(supportPlacementFits(tree,{},raster,id,0,1,'GridOrientation_Down',true),false);
});

test('free support leaf eligibility ignores floor acceptance but excludes native state owners',async()=>{
 const {supportLeafFreeEligible,supportFreeEdit}=await import('../src/lib/world/subgrid-local.ts');
 const id=40000002,source={layer:'surface',shapeKey:id+':8'},special=new Set([40001680]);
 assert.equal(supportLeafFreeEligible(id,source,special),true);
 assert.equal(supportLeafFreeEligible(40001680,source,special),false);
 assert.equal(supportLeafFreeEligible(40100001,source,special),false);
 assert.equal(supportLeafFreeEligible(id,{...source,shapeKey:null},special),false);
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:4096,path:''};
 const tree={factor:1,sourcePath:'GridData/Furniture/Test.json',objects:[{itemId:id,x:0,y:0,orientation:'GridOrientation_Down',child:null}]},raster={sizeX:2,sizeY:1,nativeFloorValues:Uint32Array.from([4096,0])};
 const free=new Set([id]),strict=new Set();
 assert.equal(supportFreeEdit(tree,{[source.shapeKey]:shape},strict,raster,0,1,0,'GridOrientation_Down'),null);
 assert.ok(supportFreeEdit(tree,{[source.shapeKey]:shape},free,raster,0,1,0,'GridOrientation_Down',true));
 assert.equal(supportFreeEdit({...tree,objects:[{...tree.objects[0],child:{...tree,objects:[]}}]},{[source.shapeKey]:shape},free,raster,0,1,0,'GridOrientation_Down',true),null);
});

test('free support swap exchanges different shapes atomically while retaining orientations',async()=>{
 const {supportFreeSwap,supportChildEdits}=await import('../src/lib/world/subgrid-local.ts');
 const a=40000002,b=40000003,left='GridOrientation_Left',down='GridOrientation_Down';
 const tree={factor:1,sourcePath:'GridData/Furniture/Test.json',objects:[{itemId:a,x:0,y:0,orientation:left,child:null},{itemId:b,x:1,y:1,orientation:down,child:null}]};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:4,path:''};
 const shapes={[a+':12']:shape,[a+':4']:shape,[b+':8']:{...shape,width:2,cellCount:2,runs:[{x:0,y:0,width:2}]}};
 const raster={sizeX:2,sizeY:2,nativeFloorValues:Uint32Array.from([4,4,0,0])},eligible=new Set([a,b]);
 assert.equal(supportChildEdits(tree,shapes,eligible,0,1,1),null);
 const edits=supportFreeSwap(tree,shapes,eligible,raster,0,1);
 assert.deepEqual(edits,[{index:0,itemId:a,expectedX:0,expectedY:0,expectedOrientation:left,x:1,y:1,orientation:left},{index:1,itemId:b,expectedX:1,expectedY:1,expectedOrientation:down,x:0,y:0,orientation:down}]);
 assert.equal(supportFreeSwap(tree,shapes,new Set([a]),raster,0,1),null);
 assert.equal(supportFreeSwap(tree,shapes,eligible,raster,0,0),null);
 assert.equal(supportFreeSwap({...tree,objects:[tree.objects[0],{...tree.objects[1],x:2}]},shapes,eligible,raster,0,1),null);
 assert.equal(supportFreeSwap({...tree,objects:[tree.objects[0],{...tree.objects[1],child:{...tree,objects:[]}}]},shapes,eligible,raster,0,1),null);
 assert.equal(supportFreeSwap(tree,{},eligible,raster,0,1),null);
});

test('support transfer targets retain exact local handles across rooms and exclude the source',async()=>{
 const {supportTransferTargets}=await import('../src/lib/world/indoor-support.ts');
 const a={localOrdinal:7,itemId:40000002,x:1,y:2,context:'House A · Floor 1 · Kitchen'},
 b={...a,localOrdinal:8,context:'House A · Floor 2 · Study'},
 c={...a,localOrdinal:9,context:'House B · Floor 1 · Kitchen'};
 const names=new Map([[a.itemId,'Table']]);
 assert.deepEqual(supportTransferTargets(a,[a,b,c,b],names,''),[b,c]);
 assert.deepEqual(supportTransferTargets(a,[a,b,c],names,'study'),[b]);
 assert.deepEqual(supportTransferTargets(a,[a,b,c],names,'ＴＡＢＬＥ'),[b,c]);
 assert.deepEqual(supportTransferTargets(a,[a,b,c],names,'house b'),[c]);
 assert.deepEqual(supportTransferTargets(null,[a,b,c],names,''),[]);
});

test('single room floor cut can be reused by support paste without stock or native IDs',async()=>{
 const {supportFloorCut}=await import('../src/lib/world/indoor-support.ts');
 const file=new File(['save'],'local.json'),row={roomSource:{roomOrdinal:1,index:2},itemId:'40000002',expectedX:3,expectedY:4,expectedOrientation:'GridOrientation_Down',area:'room:1'},cut={file,scope:'indoor',rows:[row]};
 assert.deepEqual(supportFloorCut(cut,file),{roomSource:row.roomSource,itemId:40000002,expectedX:3,expectedY:4,expectedOrientation:'GridOrientation_Down'});
 assert.equal(supportFloorCut(cut,new File(['save'],'local.json')),null);
 for(const r of [{...row,storage:true},{...row,supportFactor:2},{...row,expectedOrientation:'GridOrientation_DownLeft'},{...row,itemId:'40100001'}])assert.equal(supportFloorCut({...cut,rows:[r]},file),null);
 assert.equal(supportFloorCut({...cut,rows:[row,row]},file),null);
});
