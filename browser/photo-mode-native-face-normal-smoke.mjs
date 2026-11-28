import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
/** Run the actual production bake shader in the existing Chromium smoke.
 * Synthetic source values isolate arithmetic/target state from asset decoding. */
export async function checkNativeFaceNormalBake(page){
 const arithmetic=stripTypeScriptTypes(await readFile('src/lib/photo-mode/face-material-bake.ts','utf8')).replaceAll('export ','');
 const pass=stripTypeScriptTypes(await readFile('src/lib/photo-mode/native-face-normal-bake.ts','utf8')).replace(/^import[^\n]*\n/,'').replaceAll('export ','');
 const result=await page.evaluate(({arithmetic,pass})=>{
  const bake=new Function(arithmetic+'\n'+pass+'\nreturn bakeNativeFaceNormal;')();
  const canvas=document.createElement('canvas');const gl=canvas.getContext('webgl2');if(!gl)throw Error('Native face bake requires WebGL2');
  const values=[[255,0,0,0],[0,255,0,255],[0,0,255,85],[64,128,192,170],[128,64,192,255]];
  const input=values.map(v=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(v));return t});
  gl.viewport(3,4,11,12);gl.enable(gl.BLEND);gl.enable(gl.SCISSOR_TEST);gl.colorMask(false,true,false,true);gl.activeTexture(gl.TEXTURE3);
  const output=bake(gl,input),state=[...gl.getParameter(gl.VIEWPORT),gl.isEnabled(gl.BLEND),gl.isEnabled(gl.SCISSOR_TEST),...gl.getParameter(gl.COLOR_WRITEMASK),gl.getParameter(gl.ACTIVE_TEXTURE)===gl.TEXTURE3];
  const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,output,0);
  const fmt=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT),type=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
  const data=type===gl.UNSIGNED_INT_2_10_10_10_REV?new Uint32Array(1):new Uint8Array(4);
  gl.readPixels(500,500,1,1,fmt,type,data);const err=gl.getError();
  const rgba=type===gl.UNSIGNED_INT_2_10_10_10_REV?[data[0]&1023,(data[0]>>>10)&1023,(data[0]>>>20)&1023,data[0]>>>30].map((v,i)=>v/(i===3?3:1023)):Array.from(data,x=>x/255);
  input.forEach(t=>gl.deleteTexture(t));gl.deleteTexture(output);gl.deleteFramebuffer(fb);
  return {rgba,err,state,values};
 },{arithmetic,pass});
 assert.equal(result.err,0);
 assert.deepEqual(result.state,[3,4,11,12,true,true,false,true,false,true,true]);
 let expected=result.values[3].map(x=>x/255);
 for(let i=0;i<3;i++)expected=expected.map((v,k)=>v+(result.values[i][k]/255-v)*result.values[4][i]/255);
 expected=expected.map((v,i)=>Math.round(v*(i===3?3:1023))/(i===3?3:1023));
 for(let i=0;i<4;i++)assert.ok(Math.abs(result.rgba[i]-expected[i])<=.005,'Native RGB10_A2 output '+i);
 console.log('Native face normal WebGL2 RGB10_A2 bake and GL state restored');
}
