import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
export async function checkLinearSceneComposite(page){
 const source=stripTypeScriptTypes(await readFile('src/lib/photo-mode/linear-scene-target.ts','utf8')).replaceAll('export ','');
 const result=await page.evaluate(source=>{
  const Target=new Function(source+'\nreturn LinearSceneTarget;')();
  const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;
  const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:true});
  if(!gl)throw Error('WebGL2 unavailable');
  const target=new Target(gl),program=gl.createProgram(),vao=gl.createVertexArray();
  const shader=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(program,s);gl.deleteShader(s)};
  shader(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}');
  shader(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;uniform vec4 value;out vec4 color;void main(){color=value;}');
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  function draw(value,blend){gl.disable(gl.DEPTH_TEST);gl.useProgram(program);gl.bindVertexArray(vao);gl.uniform4fv(gl.getUniformLocation(program,'value'),value);if(blend){gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA)}else gl.disable(gl.BLEND);gl.drawArrays(gl.TRIANGLES,0,3)}
  function pixel(){const d=new Uint8Array(4);gl.readPixels(3,3,1,1,gl.RGBA,gl.UNSIGNED_BYTE,d);return [...d]}
  target.begin(8,8);draw([.5,.5,.5,1],false);draw([0,0,0,.5],true);target.present();const shadow=pixel();
  target.begin(8,8);draw([.25,.25,.25,1],false);draw([.25,.1,0,0],true);target.present();const additive=pixel();
  canvas.width=16;canvas.height=16;target.begin(16,16);draw([.125,.25,0,.5],false);target.present();const transparent=pixel();
  target.begin(16,16);target.present();const clear=pixel();
  target.dispose();gl.deleteProgram(program);gl.deleteVertexArray(vao);return {shadow,additive,transparent,clear,error:gl.getError()};
 },source);
 const srgb=x=>Math.round(255*(x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055));
 for(const [name,expected] of Object.entries({shadow:[srgb(.25),srgb(.25),srgb(.25),255],additive:[srgb(.5),srgb(.35),srgb(.25),255],transparent:[srgb(.25),srgb(.5),0,128],clear:[0,0,0,0]})){
  assert.ok(result[name].every((v,i)=>Math.abs(v-expected[i])<=3),name+' linear composite '+JSON.stringify(result[name])+' expected '+JSON.stringify(expected));
 }
 assert.equal(result.error,0);
 console.log('Linear scene composite: eye shadow, additive highlight, straight-alpha canvas and resize verified');
}
