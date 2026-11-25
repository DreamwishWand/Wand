import test from 'node:test';import assert from 'node:assert/strict';import {parseIndoorRooms} from '../src/lib/world/indoor-room-view.ts';
const face={kind:'floor',ordinal:1,finish:40000001,gridStatus:'full',items:[{itemId:40000002,quantity:2}]};
const room={ordinal:1,house:1,floor:1,name:'Test',ceiling:null,surfaces:[face,{kind:'wall',ordinal:2,finish:0,gridStatus:'diff',items:[]}]};
const report=rooms=>({contract:'wand.db05.indoor-rooms@1',rooms,geometryVerified:false,writerAuthorized:false});
test('room projection retains finish and zero separately from unknown, no grid identities',()=>{assert.deepEqual(parseIndoorRooms(report([room])),[room]);assert.throws(()=>parseIndoorRooms(report([{...room,gridId:42}])));assert.throws(()=>parseIndoorRooms(report([{...room,surfaces:[{...face,gridStatus:'shared'}]}])));assert.throws(()=>parseIndoorRooms({...report([room]),writerAuthorized:true}));});
