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

test('support cut uses a parent witness and enters outdoor paste only in free mode',async()=>{
 const {indoorGroupTransfer}=await import('../src/lib/world/indoor-room-view.ts');
 const {groupCutPlan,cutClipboardMatches}=await import('../src/lib/world/group-paste.ts');
 const id=40000002,orientation='GridOrientation_Down',supportSource={parentItemId:40000003,parentX:1,parentY:2,path:[0],index:0};
 const row={localOrdinal:7,supportSource,area:'indoor',itemId:String(id),expectedX:0,expectedY:0,expectedOrientation:orientation};
 const floor={...face,positions:[],items:[],sourcePath:'GridData/Rooms/Room8x8-GridData.json',terrain:{sizeX:2,sizeY:2,nativeFloorValues:Uint32Array.from([4,4,4,4])}};
 const shapes={[id+':8']:{width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:4,path:''}};
 const clip=[{itemId:id,dx:0,dy:0,orientation:2}],allowed=new Set([id]);
 assert.equal(indoorGroupTransfer(floor,shapes,allowed,[row],clip,0,0,false),null);
 const moves=indoorGroupTransfer(floor,shapes,allowed,[row],clip,0,0,true);
 assert.equal(moves?.[0].localOrdinal,7);assert.deepEqual(moves?.[0].supportSource,supportSource);
 const file=new File(['save'],'local.json');
 assert.equal(cutClipboardMatches({file,scope:'indoor',rows:[row]},file,'Village04',[],true),true);
 assert.equal(cutClipboardMatches({file,scope:'indoor',rows:[row]},file,'Village04',[],false),false);
 assert.equal(groupCutPlan([row],{rows:[]},true),null);
});

test('support paste accepts ordinary outdoor and support leaf cuts on the same file',async()=>{
 const {supportFloorCut}=await import('../src/lib/world/indoor-support.ts');
 const file=new File(['save'],'local.json'),row={localOrdinal:7,itemId:'40000002',expectedX:3,expectedY:4,expectedOrientation:'GridOrientation_Down',area:'Village04'},cut={file,scope:'Village04',rows:[row]};
 assert.equal(supportFloorCut(cut,file)?.localOrdinal,7);
 const supportSource={parentItemId:40000003,parentX:0,parentY:0,path:[],index:1};
 assert.deepEqual(supportFloorCut({...cut,rows:[{...row,supportSource}]},file)?.supportSource,supportSource);
 assert.equal(supportFloorCut({...cut,rows:[{...row,supportFactor:1}]},file),null);
});

test('free support group transforms all selected ordinary leaves or rejects the whole group',async()=>{
 const {supportFreeGroupTransform}=await import('../src/lib/world/subgrid-local.ts');
 const a=40000002,b=40000003,down='GridOrientation_Down',left='GridOrientation_Left';
 const tree={factor:1,sourcePath:'GridData/Furniture/Test.json',objects:[{itemId:a,x:1,y:1,orientation:down,child:null},{itemId:b,x:2,y:1,orientation:down,child:null}]};
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:4,path:''};
 const shapes={[a+':8']:shape,[a+':12']:shape,[b+':8']:shape,[b+':12']:shape},raster={sizeX:4,sizeY:4,nativeFloorValues:new Uint32Array(16)},allowed=new Set([a,b]);
 const move=supportFreeGroupTransform(tree,shapes,allowed,raster,[0,1],0,2,2,0);
 assert.deepEqual(move?.map(p=>[p.x,p.y,p.orientation]),[[2,2,down],[3,2,down]]);
 const rotate=supportFreeGroupTransform(tree,shapes,allowed,raster,[0,1],0,1,1,1);
 assert.deepEqual(rotate?.map(p=>[p.x,p.y,p.orientation]),[[1,1,left],[1,2,left]]);
 assert.equal(supportFreeGroupTransform(tree,shapes,allowed,raster,[0,1],0,3,3,0),null);
 assert.equal(supportFreeGroupTransform(tree,shapes,new Set([a]),raster,[0,1],0,2,2,0),null);
 assert.equal(supportFreeGroupTransform(tree,shapes,allowed,raster,[0,0],0,2,2,0),null);
});

test('support batch stock plan uses sequential amounts per item and rejects insufficient stock',async()=>{
 const {supportGroupStockPlan}=await import('../src/lib/world/subgrid-local.ts');
 const id=40000002,orientation='GridOrientation_Down',tree={factor:1,sourcePath:'GridData/Furniture/Test.json',objects:[{itemId:id,x:0,y:0,orientation,child:null},{itemId:id,x:1,y:0,orientation,child:null}]};
 const shapes={[id+':8']:{width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],acceptedFloorTypesFlag:4,path:''}},raster={sizeX:4,sizeY:4,nativeFloorValues:new Uint32Array(16)},allowed=new Set([id]),counts=new Map([[id,2]]);
 const duplicate=supportGroupStockPlan(tree,shapes,allowed,raster,[0,1],counts,{anchor:0,x:2,y:2});
 assert.deepEqual(duplicate?.map(p=>[p.action,p.expectedStock,p.x,p.y]),[['place',2,2,2],['place',1,3,2]]);
 const pickup=supportGroupStockPlan(tree,shapes,allowed,raster,[0,1],counts,null);
 assert.deepEqual(pickup?.map(p=>[p.action,p.expectedStock,p.index]),[['pickup',2,0],['pickup',3,1]]);
 assert.equal(supportGroupStockPlan(tree,shapes,allowed,raster,[0,1],new Map([[id,1]]),{anchor:0,x:2,y:2}),null);
 assert.equal(supportGroupStockPlan(tree,shapes,allowed,raster,[0,1],counts,{anchor:0,x:3,y:2}),null);
 assert.equal(counts.get(id),2);
});

test('support group cut captures exact leaf witnesses and normalized half-cell offsets',async()=>{
 const {captureSupportCut}=await import('../src/lib/world/indoor-support.ts');
 const {cutClipboardMatches}=await import('../src/lib/world/group-paste.ts');
 const id=40000002,orientation='GridOrientation_Down',tree={factor:2,sourcePath:'GridData/Furniture/Test.json',objects:[{itemId:id,x:2,y:1,orientation,child:null},{itemId:id,x:3,y:2,orientation,child:null}]};
 const shapes={[id+':8']:{width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],path:''}},raster={sizeX:4,sizeY:4},parent={localOrdinal:7,itemId:40000003,x:4,y:5};
 const group=captureSupportCut(tree,shapes,new Set([id]),raster,[0,1],parent,[2]);
 assert.deepEqual(group?.clip.map(p=>[p.dx,p.dy]),[[0,0],[1,1]]);
 assert.deepEqual(group?.rows.map(r=>r.supportSource.index),[0,1]);
 const file=new File(['save'],'local.json'),cut={file,scope:'indoor',rows:group.rows};
 assert.equal(cutClipboardMatches(cut,file,'Village04',[],true),true);
 assert.equal(cutClipboardMatches(cut,file,'Village04',[],false),false);
 assert.equal(cutClipboardMatches({...cut,rows:[group.rows[0],group.rows[0]]},file,'Village04',[],true),false);
});

test('group paste on support retains relative offsets and rejects invalid fractional destinations',async()=>{
 const {captureSupportCut,supportFloorGroupPlan}=await import('../src/lib/world/indoor-support.ts');
 const id=40000002,orientation='GridOrientation_Down',tree={factor:2,sourcePath:'GridData/Furniture/Test.json',objects:[{itemId:id,x:0,y:0,orientation,child:null},{itemId:id,x:1,y:0,orientation,child:null}]};
 const shapes={[id+':8']:{width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],path:''}},raster={sizeX:4,sizeY:4},allowed=new Set([id]),file=new File(['save'],'local.json');
 const group=captureSupportCut(tree,shapes,allowed,raster,[0,1],{localOrdinal:7,itemId:40000003,x:4,y:5},[]);
 const cut={file,scope:'indoor',rows:group.rows},dest={...tree,objects:[]};
 assert.deepEqual(supportFloorGroupPlan(cut,file,group.clip,dest,shapes,allowed,raster,2,2)?.map(p=>[p.x,p.y]),[[2,2],[3,2]]);
 assert.equal(supportFloorGroupPlan(cut,file,group.clip,{...dest,factor:1},shapes,allowed,raster,2,2),null);
 assert.equal(supportFloorGroupPlan(cut,file,group.clip,dest,shapes,allowed,raster,7,7),null);
});
