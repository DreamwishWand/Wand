import test from 'node:test';
import assert from 'node:assert/strict';
import {blendFaceNormal,bakeMakeup} from '../src/lib/photo-mode/face-material-bake.ts';
test('face normal uses sequential region masks on packed RGBA, including alpha',()=>{
 const e=[1,.2,.3,.4],n=[.4,.7,.8,.1],m=[.2,.4,.5,.6],j=[.9,.8,.7,.6];
 assert.deepEqual(blendFaceNormal(e,n,m,j,[0,0,0,1]),j);
 assert.deepEqual(blendFaceNormal(e,n,m,j,[1,1,1,0]),m);
 const actual=blendFaceNormal(e,n,m,j,[.25,.5,.75,0]);for(let i=0;i<4;i++)assert.ok(Math.abs(actual[i]-(j[i]*.09375+e[i]*.03125+n[i]*.125+m[i]*.75))<1e-12);
});
test('makeup uses source RGB coverage and gloss, not input alpha',()=>{
 const a=bakeMakeup([1,0,0,0],[.8,.4,.2],[0,1,0],[0,0,1],.5,2);
 assert.deepEqual(a,{color:[.4,.2,.1,.5],maps:[0,.5,.5,.5]});
 assert.deepEqual(bakeMakeup([1,0,0,1],[.8,.4,.2],[0,1,0],[0,0,1],.5,2),a);
 assert.deepEqual(bakeMakeup([0,0,0,1],[1,1,1],[1,1,1],[1,1,1],1,1),{color:[0,0,0,0],maps:[0,0,0,0]});
});
