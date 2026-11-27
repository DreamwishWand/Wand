import test from 'node:test';
import assert from 'node:assert/strict';
import {worldGridLines} from '../src/lib/world/world-grid-lines.ts';
test('grid lines use each source grid origin and clip to viewport',()=>{
 const b={x:-3.5,y:10,w:5,h:4},v={x:-2.8,y:11.2,w:2,h:1.6};
 const lines=worldGridLines(b,v,40,1,.5);
 assert.match(lines.major,/M-2\.5 11\.2V12\.799999999999999|M-2\.5 11\.2V12\.8/);
 assert.match(lines.minor,/M-2 11\.2V/);
 assert.ok(!lines.major.includes('M-3.5 '));
 assert.ok(!lines.major.includes('M1.5 '));
});
test('half-grid visibility depends on zoom; huge views remain bounded',()=>{
 const b={x:0,y:0,w:100,h:100},v={x:0,y:0,w:10,h:10};
 assert.deepEqual(worldGridLines(b,v,2,1,.5),{major:'',minor:''});
 assert.ok(worldGridLines(b,v,10,1,.5).major);
 assert.equal(worldGridLines(b,v,10,1,.5).minor,'');
 assert.ok(worldGridLines(b,v,30,1,.5).minor);
 assert.deepEqual(worldGridLines(b,{x:200,y:200,w:1,h:1},40),{major:'',minor:''});
 assert.deepEqual(worldGridLines({x:0,y:0,w:100000,h:100000},{x:0,y:0,w:100000,h:100000},40),{major:'',minor:''});
});
test('design coordinates distinguish terrain cells and native placement steps',()=>{
 const b={x:0,y:0,w:8,h:8},lines=worldGridLines(b,b,20,2,1);
 assert.match(lines.major,/M2 0V8/);assert.match(lines.minor,/M1 0V8/);
});
