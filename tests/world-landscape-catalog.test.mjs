import test from 'node:test';
import assert from 'node:assert/strict';
import {landscapePlacementEligible} from '../src/lib/world/save-furniture-placement.ts';
const g={itemId:40200001,layer:'landscape',surfaceCapable:false,editRestrictions:{remove:'allowedFlag'},shapes:{}};
test('direct landscape placement requires source permission and a plain root',()=>{
 assert.equal(landscapePlacementEligible(g),true);
 for(const extra of [{supportPath:'GridData/Supports/Tree.json'},{surfaceCapable:true},{editRestrictions:{remove:'conditional'}},{itemId:40000001}])assert.equal(landscapePlacementEligible({...g,...extra}),false);
});
