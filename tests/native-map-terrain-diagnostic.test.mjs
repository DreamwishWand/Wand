import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {auditGrid,createDiagnosticMask} from '../tools/src-04-r2/audit_native_map_terrain_extent.mjs';
const make=(indices,palette,counts,position=[0,0,-1])=>({key:'fixture',sizeX:2,sizeY:2,palette,counts,origin:{position},sha256:createHash('sha256').update(Uint8Array.from(indices)).digest('hex'),data:deflateSync(Uint8Array.from(indices)).toString('base64')});
test('source y-major terrain cells retain center-sampled water and floor distinction',()=>{
 const m=createDiagnosticMask(2,2,64);
 const r=auditGrid(make([1,2,3,0],[0,4,512,262144],[1,1,1,1]),[1,0,0,1,0,0],2,2,m);
 assert.deepEqual([m.values[48*64+16],m.values[48*64+48],m.values[16*64+16],m.values[16*64+48]],[1,2,0,0]);
 assert.equal(r.nonzeroOutside,0);
 assert.equal(r.otherFloorFlagsOutside,0);
});
test('diagnostic mask merges overlapping flags, never represents spawn-only as terrain',()=>{
 const m=createDiagnosticMask(2,2,64);
 auditGrid(make([1,0,0,0],[0,4],[3,1]),[1,0,0,1,0,0],2,2,m);
 auditGrid(make([1,0,0,0],[0,512],[3,1]),[1,0,0,1,0,0],2,2,m);
 assert.equal(m.values[48*64+16],3);
 assert.equal(m.values[16*64+16],0);
 assert.throws(()=>createDiagnosticMask(2,2,100000));
});
