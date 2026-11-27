import test from 'node:test';
import assert from 'node:assert/strict';
import {landscapeSourceEligible,stockPickup,stockPlacement} from '../src/lib/world/save-furniture-placement.ts';
import {parseReplayStep} from '../src/lib/world/checkpoint-journal.ts';
const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],path:'M0 0h1v1H0Z'};
const p={area:'a',x:1,y:-1,factor:1,shape,object:{itemId:'40200001',localOrdinal:1,localGridOrdinal:1,x:1,y:1,orientation:'GridOrientation_Down',layer:'landscape',editRestrictions:{remove:'allowedFlag',move:'allowedFlag'}}};
test('landscape selection requires affirmative removal flag and no subgrid',()=>{
 assert.equal(landscapeSourceEligible(p),true);
 assert.equal(landscapeSourceEligible({...p,object:{...p.object,editRestrictions:{move:'allowedFlag'}}}),false);
 assert.equal(landscapeSourceEligible({...p,object:{...p.object,subgrid:{}}}),false);
 const candidate=stockPickup(p);assert.equal(candidate.plan.action,'remove');assert.equal(candidate.destination,null);
 assert.equal(parseReplayStep({command:'landscape-export',plan:candidate.plan,destination:null}).command,'landscape-export');
});
