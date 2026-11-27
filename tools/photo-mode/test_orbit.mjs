import assert from 'node:assert/strict';
import {wrapYaw,dragYaw,fullTurn} from './orbit.js';
for(const d of [-1080,-720,-360,0,360,720,1080])assert.ok(Math.abs(dragYaw(0,d,360))<1e-10);
assert.ok(Math.abs(dragYaw(0,-90,360)-3*Math.PI/2)<1e-10);
assert.ok(Math.abs(dragYaw(0,90,360)-Math.PI/2)<1e-10);
assert.equal(wrapYaw(fullTurn),0);
assert.throws(()=>dragYaw(0,1,0));assert.throws(()=>wrapYaw(Infinity));
console.log('orbit checks passed');
