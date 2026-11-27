import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeDesignViewport} from '../src/lib/world/native-design-viewport.ts';
import {editorViewToNativeCanvas} from '../src/lib/media/native-local-preview.ts';
test('design display uses the same absolute north-up ticks as mainland overview',()=>{
 const frame={minX:-334,minZ:-306,raster:{sizeX:600,sizeY:500}};
 assert.deepEqual(nativeDesignViewport(frame,{x:0,y:0,w:600,h:500}),{x:-334,y:-194,w:600,h:500});
 const view=nativeDesignViewport(frame,{x:20.5,y:30.25,w:100,h:50});
 assert.deepEqual(view,{x:-313.5,y:-163.75,w:100,h:50});
 assert.deepEqual(editorViewToNativeCanvas({ticksToCanvas:[4,0,0,4,1400,1000]},view),{x:146,y:345,width:400,height:200});
 assert.throws(()=>nativeDesignViewport(frame,{x:0,y:0,w:0,h:10}));
});
