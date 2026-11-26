/** Diagnostic preview only; not a recreation of the native boundary shader.
 * Original published mask is sampled without filtering or color conversion.
 * No saved images or Save access. The GPU composes only the selected artwork.
 */
import type {ItemImage} from './item-media.ts';
import type {MemorySources} from './memory-media.ts';
import {maskPreviewEligible} from './memory-mask-preview-evidence.ts';

const vertex=`#version 300 es
out vec2 uv;
void main(){
  vec2 pos=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  uv=vec2(pos.x,1.0-pos.y);
  gl_Position=vec4(pos*2.0-1.0,0.0,1.0);
}`;
const fragment=`#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform sampler2D artwork;
uniform sampler2D maskTex;
uniform sampler2D outlineTex;
uniform int selectedBits;
uniform int completeBits;
uniform bool showOutline;
out vec4 color;
void main(){
  vec4 art=texture(artwork,uv);
  ivec4 m=ivec4(floor(texture(maskTex,uv)*255.0+0.5));
  int bit=m.r+256*m.g;
  bool exact=m.b==0&&m.a==255&&bit>0&&(bit&(bit-1))==0&&bit<=completeBits;
  // Explicitly highlight unresolved boundary/compression samples in amber.
  // Never choose a piece by rounding the integer to a nearby power of two.
  vec3 rgb=!exact?vec3(0.83,0.55,0.18):
    ((selectedBits&bit)!=0?art.rgb:vec3(0.12,0.14,0.18));
  if(showOutline&&exact)rgb*=texture(outlineTex,uv).rgb;
  color=vec4(rgb,1.0);
}`;

async function verifiedBitmap(image:ItemImage,signal:AbortSignal):Promise<ImageBitmap>{
  const response=await fetch(image.url,{signal,credentials:'omit',redirect:'error'});
  if(!response.ok)throw new Error('CDN image HTTP '+response.status);
  const bytes=await response.arrayBuffer();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==image.sha256)throw new Error('CDN image SHA mismatch');
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/webp'}),{
    colorSpaceConversion:'none',premultiplyAlpha:'none',imageOrientation:'none'
  });
  if(bitmap.width!==image.width||bitmap.height!==image.height||signal.aborted){
    bitmap.close();throw new Error('CDN image dimensions or request changed');
  }
  return bitmap;
}
function compile(gl:WebGL2RenderingContext,type:number,source:string){
  const shader=gl.createShader(type);
  if(!shader)throw new Error('Shader allocation failed');
  gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
    const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(error??'Shader compile failed');
  }
  return shader;
}
export interface MaskPreview{
  draw(selectedBits:number,showOutline:boolean):void;
  dispose():void;
}
export async function openMaskPreview(canvas:HTMLCanvasElement,source:MemorySources,signal:AbortSignal):Promise<MaskPreview>{
  if(!maskPreviewEligible(source.mask.sha256,source.numberOfShards))throw new Error('Mask layout not eligible for diagnostic preview');
  const bitmaps:ImageBitmap[]=[];
  let gl:WebGL2RenderingContext|null=null;
  let program:WebGLProgram|null=null;
  const textures:WebGLTexture[]=[];
  const shaders:WebGLShader[]=[];
  const dispose=()=>{
    if(gl){
      for(const t of textures)gl.deleteTexture(t);
      for(const s of shaders)gl.deleteShader(s);
      if(program)gl.deleteProgram(program);
    }
    textures.length=0;shaders.length=0;program=null;
  };
  try{
    for(const image of [source.thumbnail,source.mask,source.outline]){
      bitmaps.push(await verifiedBitmap(image,signal));
    }
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    canvas.width=source.thumbnail.width;canvas.height=source.thumbnail.height;
    gl=canvas.getContext('webgl2',{alpha:false,antialias:false});
    if(!gl)throw new Error('WebGL2 unavailable');
    const g=gl;
    shaders.push(compile(g,g.VERTEX_SHADER,vertex));
    shaders.push(compile(g,g.FRAGMENT_SHADER,fragment));
    program=g.createProgram();
    if(!program)throw new Error('Program allocation failed');
    for(const shader of shaders)g.attachShader(program,shader);
    g.linkProgram(program);
    if(!g.getProgramParameter(program,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(program)??'Shader link failed');
    g.useProgram(program);
    g.pixelStorei(g.UNPACK_COLORSPACE_CONVERSION_WEBGL,g.NONE);
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    for(const [unit,bitmap] of bitmaps.entries()){
      const texture=g.createTexture();if(!texture)throw new Error('Texture allocation failed');
      textures.push(texture);g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,texture);
      const filter=unit===1?g.NEAREST:g.LINEAR;
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,filter);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,filter);
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
      g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,bitmap);
      g.uniform1i(g.getUniformLocation(program,['artwork','maskTex','outlineTex'][unit]),unit);
    }
    if(g.getError()!==g.NO_ERROR)throw new Error('GPU upload failed');
    const complete=2**source.numberOfShards-1;
    const bits=g.getUniformLocation(program,'selectedBits'),outline=g.getUniformLocation(program,'showOutline');
    g.uniform1i(g.getUniformLocation(program,'completeBits'),complete);
    g.viewport(0,0,canvas.width,canvas.height);
    return {draw(selectedBits,showOutline){
      if(!program||!Number.isInteger(selectedBits)||selectedBits<0||selectedBits>complete)throw new Error('Invalid diagnostic mask');
      g.useProgram(program);g.uniform1i(bits,selectedBits);g.uniform1i(outline,showOutline?1:0);g.drawArrays(g.TRIANGLES,0,3);
    },dispose};
  }catch(error){dispose();throw error;}
  finally{for(const bitmap of bitmaps)bitmap.close();}
}
