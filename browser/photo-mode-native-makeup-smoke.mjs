import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
export async function checkNativeMakeupBake(page){
 const arithmetic=stripTypeScriptTypes(await readFile('src/lib/photo-mode/face-material-bake.ts','utf8')).replaceAll('export ','');
 const pass=stripTypeScriptTypes(await readFile('src/lib/photo-mode/native-makeup-bake.ts','utf8')).replace(/^import[^\n]*\n/gm,'').replaceAll('export ','');
 const result=await page.evaluate(({arithmetic,pass})=>{
  const bake=new Function(arithmetic+'\n'+pass+'\nreturn bakeNativeMakeup;')();
  const gl=document.createElement('canvas').getContext('webgl2');if(!gl)throw Error('Native makeup requires WebGL2');
  const layers=[{colors:[[1,0,0],[0,0,0],[0,0,0]],opacity:.5,gloss:.2},{colors:[[0,1,0],[0,0,0],[0,0,0]],opacity:.5,gloss:.6}].map(l=>({...l,texture:{width:1,height:1,mips:1,colorSpace:0,mipByteLengths:[4]},pixels:new Uint8Array([255,0,0,255])}));
  gl.viewport(3,4,11,12);gl.enable(gl.SCISSOR_TEST);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ZERO,gl.ONE);gl.blendEquationSeparate(gl.FUNC_ADD,gl.FUNC_REVERSE_SUBTRACT);gl.colorMask(false,true,false,true);gl.activeTexture(gl.TEXTURE3);
  const result=bake(gl,layers),state=[...gl.getParameter(gl.VIEWPORT),gl.isEnabled(gl.SCISSOR_TEST),gl.isEnabled(gl.BLEND),...gl.getParameter(gl.COLOR_WRITEMASK),gl.getParameter(gl.ACTIVE_TEXTURE)===gl.TEXTURE3,gl.getParameter(gl.BLEND_SRC_RGB)===gl.SRC_ALPHA,gl.getParameter(gl.BLEND_DST_ALPHA)===gl.ONE,gl.getParameter(gl.BLEND_EQUATION_ALPHA)===gl.FUNC_REVERSE_SUBTRACT];
  const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  const read=t=>{gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);const data=new Uint8Array(4);gl.readPixels(500,500,1,1,gl.RGBA,gl.UNSIGNED_BYTE,data);return [...data]};
  const color=read(result.color),maps=read(result.maps),err=gl.getError();
  gl.deleteFramebuffer(fb);gl.deleteTexture(result.color);gl.deleteTexture(result.maps);return {state,color,maps,err};
 },{arithmetic,pass});
 assert.equal(result.err,0);assert.deepEqual(result.state,[3,4,11,12,true,true,false,true,false,true,true,true,true,true]);
 const srgb=v=>Math.round(255*(1.055*v**(1/2.4)-.055));
 const expected=[srgb(.25),srgb(.5),0,255];
 for(let i=0;i<4;i++)assert.ok(Math.abs(result.color[i]-expected[i])<=2,'native makeup color channel '+i+': '+result.color);
 for(let i=0;i<4;i++)assert.ok(Math.abs(result.maps[i]-[0,255,102,255][i])<=2,'native makeup maps channel '+i+': '+result.maps);
 console.log('Native makeup sRGB and UNorm outputs, ordered blending, GL state restored');
}
