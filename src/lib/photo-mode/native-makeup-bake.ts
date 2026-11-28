import {makeupBakeGLSL} from './face-material-bake.ts';
import type {LoadedMakeupLayer} from './makeup-assets.ts';

export const makeupBakeSize=1024;
export type MakeupTargets={color:WebGLTexture;maps:WebGLTexture};
/** Native AvatarAppearance.UpdateMakeup allocates GraphicsFormat 4 and 8
 * (R8G8B8A8_SRGB and R8G8B8A8_UNorm) at 1024². WebGL2 lacks guaranteed
 * per-target blend state, so run the two independent shader outputs in order
 * in separate passes. This preserves their distinct blending and target
 * quantization. Final skin lighting remains a separate stage. */
export function bakeNativeMakeup(gl:WebGL2RenderingContext,layers:readonly LoadedMakeupLayer[]):MakeupTargets{
 if(!layers.length||layers.length>13)throw Error('Invalid native makeup layers');
 const program=gl.createProgram(),vao=gl.createVertexArray(),fb=gl.createFramebuffer(),color=gl.createTexture(),maps=gl.createTexture(),input=gl.createTexture();
 const shaders:WebGLShader[]=[];let complete=false;
 const oldProgram=gl.getParameter(gl.CURRENT_PROGRAM),oldVao=gl.getParameter(gl.VERTEX_ARRAY_BINDING),oldDraw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),oldRead=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),oldViewport=gl.getParameter(gl.VIEWPORT) as Int32Array,oldActive=gl.getParameter(gl.ACTIVE_TEXTURE),oldMask=gl.getParameter(gl.COLOR_WRITEMASK) as boolean[];
 const oldBlend=[gl.getParameter(gl.BLEND_SRC_RGB),gl.getParameter(gl.BLEND_DST_RGB),gl.getParameter(gl.BLEND_SRC_ALPHA),gl.getParameter(gl.BLEND_DST_ALPHA)] as [number,number,number,number];
 const oldEquations=[gl.getParameter(gl.BLEND_EQUATION_RGB),gl.getParameter(gl.BLEND_EQUATION_ALPHA)] as [number,number];
 const flags=[gl.BLEND,gl.DEPTH_TEST,gl.CULL_FACE,gl.SCISSOR_TEST,gl.STENCIL_TEST,gl.RASTERIZER_DISCARD,gl.DITHER],enabled=flags.map(f=>gl.isEnabled(f));
 gl.activeTexture(gl.TEXTURE0);const oldTexture=gl.getParameter(gl.TEXTURE_BINDING_2D),oldSampler=gl.getParameter(gl.SAMPLER_BINDING);
 const oldPbo=gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING);
 try{
  if(!program||!vao||!fb||!color||!maps||!input)throw Error('Native makeup allocation failed');
  const shader=(type:number,source:string)=>{const s=gl.createShader(type);if(!s)throw Error('Makeup shader allocation');shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Makeup shader compilation');return s};
  gl.attachShader(program,shader(gl.VERTEX_SHADER,`#version 300 es
   out vec2 uv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`#version 300 es
   precision highp float;in vec2 uv;uniform sampler2D mask;uniform vec3 c1,c2,c3;uniform float opacity,gloss;uniform bool mapsPass;out vec4 result;
   ${makeupBakeGLSL}
   void main(){vec4 color,maps;wandBakeMakeup(texture(mask,uv),c1,c2,c3,opacity,gloss,color,maps);result=mapsPass?maps:color;}`));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Makeup program link');
  const params=()=>{gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)};
  gl.bindSampler(0,null);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,null);
  for(const [target,format] of [[color,gl.SRGB8_ALPHA8],[maps,gl.RGBA8]] as const){gl.bindTexture(gl.TEXTURE_2D,target);gl.texStorage2D(gl.TEXTURE_2D,1,format,makeupBakeSize,makeupBakeSize);params()}
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,makeupBakeSize,makeupBakeSize);flags.forEach(f=>gl.disable(f));gl.colorMask(true,true,true,true);
  const attach=(t:WebGLTexture)=>{gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Native makeup target unavailable')};
  for(const t of [color,maps]){attach(t);gl.clearBufferfv(gl.COLOR,0,new Float32Array(4))}
  gl.useProgram(program);gl.bindVertexArray(vao);gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);
  const u=(n:string)=>gl.getUniformLocation(program,n);gl.uniform1i(u('mask'),0);
  const c1=u('c1'),c2=u('c2'),c3=u('c3'),opacity=u('opacity'),gloss=u('gloss'),pass=u('mapsPass');
  gl.bindTexture(gl.TEXTURE_2D,input);
  for(const l of layers){
   const m=l.texture;let offset=0;
   // Original sampler is Bilinear and clamp; retain every source mip.
   for(let i=0;i<m.mips;i++){const len=m.mipByteLengths[i],w=Math.max(1,m.width>>i),h=Math.max(1,m.height>>i);if(len!==w*h*4||offset+len>l.pixels.length)throw Error('Invalid makeup mip payload');gl.texImage2D(gl.TEXTURE_2D,i,m.colorSpace===1?gl.SRGB8_ALPHA8:gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,l.pixels.subarray(offset,offset+len));offset+=len}
   if(offset!==l.pixels.length)throw Error('Unexpected makeup mip tail');
   params();gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,m.mips-1);if(m.mips>1)gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_NEAREST);
   gl.uniform3f(c1,...l.colors[0]);gl.uniform3f(c2,...l.colors[1]);gl.uniform3f(c3,...l.colors[2]);gl.uniform1f(opacity,l.opacity);gl.uniform1f(gloss,l.gloss);
   attach(color);gl.uniform1i(pass,0);gl.blendFuncSeparate(gl.ONE,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE);gl.drawArrays(gl.TRIANGLES,0,3);
   attach(maps);gl.uniform1i(pass,1);gl.blendFunc(gl.ONE,gl.ONE);gl.drawArrays(gl.TRIANGLES,0,3);
  }
  if(gl.getError()!==gl.NO_ERROR)throw Error('Native makeup GPU bake failed');
  complete=true;return {color,maps};
 }finally{
  gl.bindTexture(gl.TEXTURE_2D,oldTexture);gl.bindSampler(0,oldSampler);gl.activeTexture(oldActive);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,oldPbo);
  gl.useProgram(oldProgram);gl.bindVertexArray(oldVao);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,oldDraw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,oldRead);gl.viewport(...[oldViewport[0],oldViewport[1],oldViewport[2],oldViewport[3]] as [number,number,number,number]);
  gl.colorMask(oldMask[0],oldMask[1],oldMask[2],oldMask[3]);gl.blendFuncSeparate(...oldBlend);gl.blendEquationSeparate(...oldEquations);flags.forEach((f,i)=>enabled[i]?gl.enable(f):gl.disable(f));
  for(const s of shaders)gl.deleteShader(s);if(program)gl.deleteProgram(program);if(vao)gl.deleteVertexArray(vao);if(fb)gl.deleteFramebuffer(fb);if(input)gl.deleteTexture(input);if(!complete){if(color)gl.deleteTexture(color);if(maps)gl.deleteTexture(maps)}
 }
}
