/** Source-derived fragment comparison. The assignment of textures to slots,
 * sampler settings and Save flag polarity remain candidate inputs.
 * No saved images or Save access. */
import type {ItemImage} from './item-media.ts';
import type {MemorySources} from './memory-media.ts';
import {memoryMaskEvidence} from './memory-mask-preview-evidence.ts';
import {puzzleFragmentGlsl,puzzleBlendGlsl,PUZZLE_MATERIALS,type PuzzleMaterial} from './memory-puzzle-formula.ts';

export const memoryPreviewVertex=`#version 300 es
out vec2 uv;
void main(){
  vec2 pos=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  uv=vec2(pos.x,1.0-pos.y);
  gl_Position=vec4(pos*2.0-1.0,0.0,1.0);
}`;
export const memoryPreviewFragment=`#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform sampler2D artwork;
uniform sampler2D maskTex;
uniform sampler2D outlineTex;
uniform int selectedBits;
uniform bool nativeFormula;
uniform bool artworkSlot0;
uniform bool invertFlags;
uniform int completeBits;
uniform vec3 materialTint;
uniform float materialAlpha;
uniform bool materialAlphaClip;
out vec4 color;
${puzzleFragmentGlsl}
${puzzleBlendGlsl}
void main(){
  vec4 art=texture(artwork,uv);
  vec4 mask=texture(maskTex,uv);
  if(nativeFormula){
    // Runtime slot/underlay/flag assignment is still a candidate.
    // All unassigned serialized shader texture defaults are black.
    int flags=invertFlags?(completeBits^selectedBits):selectedBits;
    vec3 tex0=artworkSlot0?art.rgb:vec3(0.0);
    vec4 overlay=puzzleFragment(mask.rg,texture(outlineTex,uv).r,flags,tex0,materialTint,materialAlpha);
    color=vec4(puzzleBlend(art.rgb,overlay,materialAlphaClip),1.0);
  }else{
    ivec4 m=ivec4(floor(mask*255.0+0.5));
    int bit=m.r+256*m.g;
    bool exact=m.b==0&&m.a==255&&bit>0&&(bit&(bit-1))==0&&bit<=completeBits;
    color=vec4(!exact?vec3(0.83,0.55,0.18):
      ((selectedBits&bit)!=0?art.rgb:vec3(0.12,0.14,0.18)),1.0);
  }
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
  draw(selectedBits:number,nativeFormula:boolean,artworkSlot0:boolean,invertFlags:boolean,material:PuzzleMaterial,opacity:number,linearMask:boolean):void;
  dispose():void;
}
export async function openMaskPreview(canvas:HTMLCanvasElement,source:MemorySources,signal:AbortSignal,outlineOnly=false):Promise<MaskPreview>{
  if(!outlineOnly&&(!memoryMaskEvidence(source.mask.sha256,source.numberOfShards)||source.numberOfShards>10))throw new Error('Unknown diagnostic mask layout');
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
    for(const image of outlineOnly?[source.thumbnail,source.outline]:[source.thumbnail,source.mask,source.outline]){
      bitmaps.push(await verifiedBitmap(image,signal));
    }
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    canvas.width=source.thumbnail.width;canvas.height=source.thumbnail.height;
    gl=canvas.getContext('webgl2',{alpha:false,antialias:false});
    if(!gl)throw new Error('WebGL2 unavailable');
    const g=gl;
    shaders.push(compile(g,g.VERTEX_SHADER,memoryPreviewVertex));
    shaders.push(compile(g,g.FRAGMENT_SHADER,memoryPreviewFragment));
    program=g.createProgram();
    if(!program)throw new Error('Program allocation failed');
    for(const shader of shaders)g.attachShader(program,shader);
    g.linkProgram(program);
    if(!g.getProgramParameter(program,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(program)??'Shader link failed');
    g.useProgram(program);
    g.pixelStorei(g.UNPACK_COLORSPACE_CONVERSION_WEBGL,g.NONE);
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    for(const [index,bitmap] of bitmaps.entries()){
      const unit=outlineOnly&&index===1?2:index;
      const texture=g.createTexture();if(!texture)throw new Error('Texture allocation failed');
      textures.push(texture);g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,texture);
      const filter=unit===1?g.NEAREST:g.LINEAR;
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,filter);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,filter);
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
      g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,bitmap);
      g.uniform1i(g.getUniformLocation(program,['artwork','maskTex','outlineTex'][unit]),unit);
    }
    if(outlineOnly)g.uniform1i(g.getUniformLocation(program,'maskTex'),2);
    if(g.getError()!==g.NO_ERROR)throw new Error('GPU upload failed');
    const complete=2**source.numberOfShards-1;
    const bits=g.getUniformLocation(program,'selectedBits'),native=g.getUniformLocation(program,'nativeFormula'),slot=g.getUniformLocation(program,'artworkSlot0'),invert=g.getUniformLocation(program,'invertFlags');
    g.uniform1i(g.getUniformLocation(program,'completeBits'),complete);
    g.viewport(0,0,canvas.width,canvas.height);
    return {draw(selectedBits,nativeFormula,artworkSlot0,invertFlags,material,opacity,linearMask){
      if(!program||!Number.isInteger(selectedBits)||selectedBits<0||selectedBits>complete)throw new Error('Invalid diagnostic mask');
      if(outlineOnly&&(!nativeFormula||!invertFlags||selectedBits!==complete))throw new Error('Outline-only renderer cannot interpret piece flags');
      if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw new Error('Invalid preview opacity');
      const preset=PUZZLE_MATERIALS[material];
      g.useProgram(program);
      g.uniform3f(g.getUniformLocation(program,'materialTint'),preset.tint[0],preset.tint[1],preset.tint[2]);
      g.uniform1f(g.getUniformLocation(program,'materialAlpha'),opacity);
      g.uniform1i(g.getUniformLocation(program,'materialAlphaClip'),preset.alphaClip?1:0);
      if(!outlineOnly){
        g.activeTexture(g.TEXTURE1);g.bindTexture(g.TEXTURE_2D,textures[1]);
        const maskFilter=nativeFormula&&linearMask?g.LINEAR:g.NEAREST;
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,maskFilter);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,maskFilter);
      }
      g.uniform1i(bits,selectedBits);g.uniform1i(native,nativeFormula?1:0);g.uniform1i(slot,artworkSlot0?1:0);g.uniform1i(invert,invertFlags?1:0);g.drawArrays(g.TRIANGLES,0,3);
    },dispose};
  }catch(error){dispose();throw error;}
  finally{for(const bitmap of bitmaps)bitmap.close();}
}
