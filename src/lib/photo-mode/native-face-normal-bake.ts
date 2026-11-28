import {faceNormalBakeGLSL} from './face-material-bake.ts';
export const faceNormalBakeSize=1024;
export type FaceNormalInputs=readonly [WebGLTexture,WebGLTexture,WebGLTexture,WebGLTexture,WebGLTexture];
/** Native Hidden/FaceNormalBlend: eyes, nose, mouth, jaw and mask.
 * Inputs must be non-sRGB, unpremultiplied, native row order, original mip 0.
 * The program samples explicit LOD zero; target is ARGB2101010.
 * Does not implement final PBR lighting. Caller owns the output texture. */
export function bakeNativeFaceNormal(gl:WebGL2RenderingContext,inputs:FaceNormalInputs):WebGLTexture{
 const program=gl.createProgram(),vao=gl.createVertexArray(),fb=gl.createFramebuffer(),out=gl.createTexture(),sampler=gl.createSampler();
 const shaders:WebGLShader[]=[];let complete=false;
 const oldProgram=gl.getParameter(gl.CURRENT_PROGRAM),oldVao=gl.getParameter(gl.VERTEX_ARRAY_BINDING),oldDraw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),oldRead=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),oldViewport=gl.getParameter(gl.VIEWPORT) as Int32Array,oldActive=gl.getParameter(gl.ACTIVE_TEXTURE),oldMask=gl.getParameter(gl.COLOR_WRITEMASK) as boolean[];
 const flags=[gl.BLEND,gl.DEPTH_TEST,gl.CULL_FACE,gl.SCISSOR_TEST,gl.STENCIL_TEST,gl.RASTERIZER_DISCARD,gl.DITHER],enabled=flags.map(f=>gl.isEnabled(f));
 const bindings:{texture:WebGLTexture|null;sampler:WebGLSampler|null}[]=[];
 try{
  if(!program||!vao||!fb||!out||!sampler||inputs.length!==5||!inputs.every(t=>gl.isTexture(t)))throw Error('Invalid face bake resources');
  for(let i=0;i<5;i++){gl.activeTexture(gl.TEXTURE0+i);bindings.push({texture:gl.getParameter(gl.TEXTURE_BINDING_2D),sampler:gl.getParameter(gl.SAMPLER_BINDING)})}
  const shader=(type:number,source:string)=>{const s=gl.createShader(type);if(!s)throw Error('Face bake shader allocation');shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Face bake shader failed');return s};
  gl.attachShader(program,shader(gl.VERTEX_SHADER,`#version 300 es
  out vec2 uv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`#version 300 es
  precision highp float;in vec2 uv;uniform sampler2D eyes,nose,mouth,jaw,mask;out vec4 color;
  ${faceNormalBakeGLSL}
  void main(){color=wandFaceNormal(textureLod(eyes,uv,0.),textureLod(nose,uv,0.),textureLod(mouth,uv,0.),textureLod(jaw,uv,0.),textureLod(mask,uv,0.));}`));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Face bake link failed');
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,out);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGB10_A2,faceNormalBakeSize,faceNormalBakeSize);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.samplerParameteri(sampler,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.samplerParameteri(sampler,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.samplerParameteri(sampler,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.samplerParameteri(sampler,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,out,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Native RGB10_A2 face target unavailable');
  gl.viewport(0,0,faceNormalBakeSize,faceNormalBakeSize);flags.forEach(f=>gl.disable(f));gl.colorMask(true,true,true,true);gl.useProgram(program);gl.bindVertexArray(vao);
  ['eyes','nose','mouth','jaw','mask'].forEach((n,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,inputs[i]);gl.bindSampler(i,sampler);gl.uniform1i(gl.getUniformLocation(program,n),i)});
  gl.drawArrays(gl.TRIANGLES,0,3);if(gl.getError()!==gl.NO_ERROR)throw Error('Native face normal bake failed');complete=true;return out;
 }finally{
  bindings.forEach((b,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.bindSampler(i,b.sampler)});gl.activeTexture(oldActive);gl.useProgram(oldProgram);gl.bindVertexArray(oldVao);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,oldDraw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,oldRead);gl.viewport(oldViewport[0],oldViewport[1],oldViewport[2],oldViewport[3]);gl.colorMask(oldMask[0],oldMask[1],oldMask[2],oldMask[3]);flags.forEach((f,i)=>enabled[i]?gl.enable(f):gl.disable(f));
  for(const s of shaders)gl.deleteShader(s);if(program)gl.deleteProgram(program);if(vao)gl.deleteVertexArray(vao);if(fb)gl.deleteFramebuffer(fb);if(sampler)gl.deleteSampler(sampler);if(out&&!complete)gl.deleteTexture(out);
 }
}
