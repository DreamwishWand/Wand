import assert from 'node:assert/strict';
import {nativeHairSurface,nativeHairSurfaceGLSL} from '../src/lib/photo-mode/native-hair-surface.ts';
/** Compile the actual shared hair GLSL and compare sampled-input results with
 * the independent weighted expansion covered by the TypeScript unit test. */
export async function checkNativeHairSurface(page){
 const colors={base:[.2,.3,.4,1],one:[.9,.8,.7,.5],two:[.1,.2,.9,0],three:[.6,.5,.1,1]};
 const masks=[[0,0,0,1],[0,0,1,1],[0,1,1,1],[1,1,1,1],[.37,.63,.12,.8]];
 const maps=[.2,.35,.6,.9],bias=.1;
 const data=await page.evaluate(({source,colors,masks,maps,bias})=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=4;
  const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,alpha:true,antialias:false,premultipliedAlpha:false});
  if(!gl)throw Error('WebGL2 unavailable');
  const p=gl.createProgram(),vao=gl.createVertexArray();
  const shader=(kind,s)=>{const sh=gl.createShader(kind);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));gl.attachShader(p,sh);gl.deleteShader(sh)};
  shader(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}');
  shader(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;uniform vec4 m,maps,b,c1,c2,c3;uniform float dst,bias;uniform int mode;out vec4 color;\n'+source+'\nvoid main(){WandHairSurface s=wandHairSurface(m,maps,b,c1,c2,c3,dst,bias);color=mode==0?vec4(s.albedo,s.alpha):vec4(s.gloss,s.occlusion,s.diffuse.r,1.);}');
  gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
  gl.useProgram(p);gl.bindVertexArray(vao);gl.viewport(0,0,4,4);gl.disable(gl.DITHER);
  const loc=k=>gl.getUniformLocation(p,k);
  for(const [k,v] of Object.entries({maps,b:colors.base,c1:colors.one,c2:colors.two,c3:colors.three}))gl.uniform4fv(loc(k),v);
  gl.uniform1f(loc('bias'),bias);
  const rows=[];
  for(const m of masks)for(const dst of [0,1]){
   gl.uniform4fv(loc('m'),m);gl.uniform1f(loc('dst'),dst);
   const samples=[];
   for(const mode of [0,1]){gl.uniform1i(loc('mode'),mode);gl.drawArrays(gl.TRIANGLES,0,3);const b=new Uint8Array(4);gl.readPixels(1,1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);samples.push([...b])}
   rows.push(samples);
  }
  const error=gl.getError();gl.deleteProgram(p);gl.deleteVertexArray(vao);return {rows,error};
 },{source:nativeHairSurfaceGLSL,colors,masks,maps,bias});
 let i=0;
 for(const m of masks)for(const dst of [0,1]){
  const s=nativeHairSurface(m,maps,colors,dst,bias),expected=[[...s.albedo,s.alpha],[s.gloss,s.occlusion,s.diffuse[0],1]];
  for(let j=0;j<2;j++)for(let k=0;k<4;k++)assert.ok(Math.abs(data.rows[i][j][k]-Math.round(255*expected[j][k]))<=1,'Native hair GLSL sample '+i);
  i++;
 }
 assert.equal(data.error,0);
 console.log('Native hair GLSL: channel order, highlight alpha, gloss and occlusion verified');
}
