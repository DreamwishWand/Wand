import test from 'node:test';
import assert from 'node:assert/strict';
import {supportMapReceipts,supportMapWitnessKey,supportMapChildren,visibleSupportParents} from '../src/lib/world/support-map-preview.ts';
const p={localOrdinal:2,itemId:40000001,x:3,y:4,mapX:0,mapY:0,mapW:2,mapH:2,selectable:true};
test('support map reads only exact ephemeral parents and keeps unavailable distinct from empty',()=>{
 const rows=[{localOrdinal:2,children:[{itemId:40000002,index:0,nested:false}]}];
 assert.deepEqual(supportMapReceipts({kind:'support-map',results:rows},[p]).get(supportMapWitnessKey(p)),rows[0].children);
 assert.equal(supportMapReceipts({kind:'support-map',results:[{localOrdinal:2,children:null}]},[p]).get(supportMapWitnessKey(p)),null);
 assert.throws(()=>supportMapReceipts({kind:'support-map',results:[{localOrdinal:3,children:[]}]},[p]));
 assert.throws(()=>supportMapReceipts({kind:'support-map',results:[{localOrdinal:2,children:[{itemId:40000002,index:1,nested:false}]}]},[p]));
 assert.notEqual(supportMapWitnessKey(p),supportMapWitnessKey({...p,x:4}));
});
test('schematic contents retain native child order and independent parent scope',()=>{
 assert.deepEqual(supportMapChildren({objects:[{itemId:40000002,child:null},{itemId:40000003,child:{objects:[]}}]}),[{itemId:40000002,index:0,nested:false},{itemId:40000003,index:1,nested:true}]);
 assert.deepEqual(visibleSupportParents([p,{...p,localOrdinal:3,mapX:20}],{x:0,y:0,w:5,h:5}),[p]);
});
