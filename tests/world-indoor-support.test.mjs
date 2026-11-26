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
});
