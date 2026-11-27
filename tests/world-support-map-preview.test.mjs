import test from 'node:test';
import assert from 'node:assert/strict';
import {supportMapReceipts,supportMapWitnessKey,supportMapChildren,supportMapDescendants,resolveSupportMapPath,supportMapSearch,visibleSupportParents} from '../src/lib/world/support-map-preview.ts';
const p={localOrdinal:2,itemId:40000001,x:3,y:4,mapX:0,mapY:0,mapW:2,mapH:2,selectable:true};
test('support map reads only exact ephemeral parents and keeps unavailable distinct from empty',()=>{
 const rows=[{localOrdinal:2,children:[{itemId:40000002,index:0,nested:false,path:[0]}]}];
 assert.deepEqual(supportMapReceipts({kind:'support-map',results:rows},[p]).get(supportMapWitnessKey(p)),rows[0].children);
 assert.equal(supportMapReceipts({kind:'support-map',results:[{localOrdinal:2,children:null}]},[p]).get(supportMapWitnessKey(p)),null);
 assert.throws(()=>supportMapReceipts({kind:'support-map',results:[{localOrdinal:3,children:[]}]},[p]));
 assert.throws(()=>supportMapReceipts({kind:'support-map',results:[{localOrdinal:2,children:[{itemId:40000002,index:1,nested:false,path:[0,1]}]}]},[p]));
 assert.notEqual(supportMapWitnessKey(p),supportMapWitnessKey({...p,x:4}));
});
test('schematic contents retain native child order and independent parent scope',()=>{
 assert.deepEqual(supportMapChildren({objects:[{itemId:40000002,child:null},{itemId:40000003,child:{objects:[]}}]}),[{itemId:40000002,index:0,nested:false,path:[0]},{itemId:40000003,index:1,nested:true,path:[1]}]);
 assert.deepEqual(visibleSupportParents([p,{...p,localOrdinal:3,mapX:20}],{x:0,y:0,w:5,h:5}),[p]);
});

test('search includes descendants at every support depth and reopens the exact local path',()=>{
 const tree={objects:[{itemId:40000002,child:{objects:[{itemId:40000003,child:null}]}}]};const entries=supportMapDescendants(tree);
 assert.deepEqual(entries.map(c=>c.path),[[0],[0,0]]);
 const cache=new Map([[supportMapWitnessKey(p),entries]]);const matches=supportMapSearch([p],cache,new Map([[40000002,'Table'],[40000003,'Little Lamp']]),'little lamp');
 assert.equal(matches.length,1);assert.deepEqual(matches[0].child.path,[0,0]);const target=resolveSupportMapPath(tree,matches[0].child.path);assert.equal(target.selected,0);assert.deepEqual(target.owners,[40000002]);assert.equal(resolveSupportMapPath(tree,[0,1]),null);
});
