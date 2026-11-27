export type Affine=readonly [number,number,number,number,number,number];
export type Color=readonly [number,number,number,number];
export type Layer={kind:'fill'|'texture'|'sdf';unitQuadToCanvas:Affine;rgba:Color;imageSha256?:string;size?:readonly [number,number];wrap?:readonly [number,number];colorSpace?:'Linear'|'sRGB';mask?:MaskSpec};
export type View={x:number;y:number;width:number;height:number};
export type ImageLayer=Layer&{kind:'texture'|'sdf';imageSha256:string;size:readonly [number,number];wrap:readonly [number,number]};
export type MaskSpec={kind:'rect';overlayToMaskUv:Affine}|{kind:'alpha';overlayToMaskUv:Affine;image:ImageLayer};
export type ImageSource=(layer:ImageLayer,signal?:AbortSignal)=>Promise<ImageBitmap>;
const vertex=`#version 300 es
precision highp float;
uniform vec2 a,b,c,origin,span;
out vec2 uv;
void main(){
 uv=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1));
 vec2 p=(a*uv.x+b*uv.y+c-origin)/span;
 gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0,1);
}`;
const fragment=`#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D tex;
uniform int kind;
uniform vec4 tint;
uniform sampler2D maskTex;
uniform int maskKind;
uniform vec2 maskA,maskB,maskC;
out vec4 color;
void main(){
 if(kind==0){color=tint;}
 else {
  vec4 t=texture(tex,uv);
  if(kind==1){color=t*tint;}
  else {
   float d=t.r+0.05;
   float w=max(0.75*fwidth(d),0.0001)+0.10;
   color=vec4(tint.rgb,tint.a*smoothstep(0.5-w,0.5+w,d));
  }
 }
 if(maskKind!=0){
  vec2 m=maskA*uv.x+maskB*uv.y+maskC;
  float inside=float(all(greaterThanEqual(m,vec2(0)))&&all(lessThanEqual(m,vec2(1))));
  color.a*=inside*(maskKind==2?texture(maskTex,m).a:1.0);
 }
}`;
function check(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
export function intersects(m:Affine,v:View):boolean{
 const [a,b,c,d,x,y]=m;
 return Math.max(x,x+a,x+c,x+a+c)>v.x&&Math.min(x,x+a,x+c,x+a+c)<v.x+v.width&&
 Math.max(y,y+b,y+d,y+b+d)>v.y&&Math.min(y,y+b,y+d,y+b+d)<v.y+v.height;
}
export function validateLayer(l:Layer):asserts l is Layer{
 const m=l.unitQuadToCanvas;
 check(Array.isArray(m)&&m.length===6&&m.every(Number.isFinite)&&Math.abs(m[0]*m[3]-m[1]*m[2])>1e-8,'Invalid native quad');
 check(Array.isArray(l.rgba)&&l.rgba.length===4&&l.rgba.every(n=>Number.isFinite(n)&&n>=0&&n<=1),'Invalid tint');
 if(l.mask){
  const m=l.mask;
  check((m.kind==='rect'||m.kind==='alpha')&&l.kind!=='sdf','Unsupported native mask');
  check(Array.isArray(m.overlayToMaskUv)&&m.overlayToMaskUv.length===6&&m.overlayToMaskUv.every(Number.isFinite),'Invalid mask UV');
  if(m.kind==='alpha'){
   check(m.image.kind==='texture'&&!m.image.mask,'Invalid mask image');validateLayer(m.image);
  }
 }
 if(l.kind==='fill')return;
 check(l.kind==='texture'||l.kind==='sdf','Unknown layer');
 check(typeof l.imageSha256==='string'&&/^[a-f0-9]{64}$/.test(l.imageSha256),'Invalid image reference');
 check(l.size?.length===2&&l.size.every(n=>Number.isSafeInteger(n)&&n>0&&n<=32768),'Invalid texture size');
 check(l.wrap?.length===2&&l.wrap.every(n=>n===0||n===1),'Invalid wrap');
 check(l.colorSpace===(l.kind==='sdf'?'Linear':'sRGB'),'Unexpected color space');
}
/** Private candidate preview: numeric gamma-space framebuffer hypothesis, not a verified Unity frame.
 * Does not resolve URLs or publish data. Caller owns the image source; bitmap ownership transfers here.
 */
export class NativeMapRenderer{
 private readonly gl:WebGL2RenderingContext;
 private readonly program:WebGLProgram;
 private readonly vao:WebGLVertexArrayObject;
 private readonly uniforms:Record<string,WebGLUniformLocation>={};
 private busy=false;private disposed=false;
 private readonly textures=new Map<string,{texture:WebGLTexture;bytes:number}>();
 private residentBytes=0;
 private source:ImageSource|undefined;
 private readonly textureBudgetBytes:number;
 constructor(canvas:HTMLCanvasElement,textureBudgetBytes=128*1024*1024){
  check(Number.isSafeInteger(textureBudgetBytes)&&textureBudgetBytes>=0,'Invalid texture cache budget');
  this.textureBudgetBytes=textureBudgetBytes;
  const g=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false});check(g,'WebGL 2 required');this.gl=g;
  const compile=(type:number,source:string)=>{const s=g.createShader(type);check(s,'Shader allocation');g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS)){const log=g.getShaderInfoLog(s);g.deleteShader(s);throw Error(log??'Shader compile');}return s;};
  const vs=compile(g.VERTEX_SHADER,vertex);let fs:WebGLShader|undefined;let p:WebGLProgram|null=null;
  try{fs=compile(g.FRAGMENT_SHADER,fragment);p=g.createProgram();check(p,'Program allocation');g.attachShader(p,vs);g.attachShader(p,fs);g.linkProgram(p);check(g.getProgramParameter(p,g.LINK_STATUS),g.getProgramInfoLog(p)??'Program link');this.program=p;}
  catch(e){if(p)g.deleteProgram(p);throw e;}finally{g.deleteShader(vs);if(fs)g.deleteShader(fs);}
  const vao=g.createVertexArray();check(vao,'Vertex array allocation');this.vao=vao;
  for(const n of ['a','b','c','origin','span','kind','tint','tex','maskTex','maskKind','maskA','maskB','maskC']){const loc=g.getUniformLocation(this.program,n);check(loc,'Missing uniform '+n);this.uniforms[n]=loc;}
 }
 async render(layers:readonly Layer[],view:View,source:ImageSource,signal?:AbortSignal):Promise<{drawn:number;skipped:number}>{
  check(!this.busy&&!this.disposed,'Renderer unavailable');check([view.x,view.y,view.width,view.height].every(Number.isFinite)&&view.width>0&&view.height>0,'Invalid viewport');
  layers.forEach(validateLayer);this.busy=true;const g=this.gl;const u=this.uniforms;let drawn=0,skipped=0;
  if(this.source!==source){this.clearTextures();this.source=source;}
  try{
   signal?.throwIfAborted();check(!g.isContextLost(),'Context lost');g.viewport(0,0,g.drawingBufferWidth,g.drawingBufferHeight);g.useProgram(this.program);g.bindVertexArray(this.vao);
   g.disable(g.DEPTH_TEST);g.disable(g.CULL_FACE);g.disable(g.SCISSOR_TEST);g.disable(g.STENCIL_TEST);g.disable(g.DITHER);g.colorMask(true,true,true,true);g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT);
   g.enable(g.BLEND);g.blendEquation(g.FUNC_ADD);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);
   g.uniform2f(u.origin,view.x,view.y);g.uniform2f(u.span,view.width,view.height);g.uniform1i(u.tex,0);g.uniform1i(u.maskTex,1);
   for(const l of layers){
    signal?.throwIfAborted();check(!this.disposed&&!g.isContextLost(),'Renderer lost');if(!intersects(l.unitQuadToCanvas,view)){skipped++;continue;}
    const [a,b,c,d,x,y]=l.unitQuadToCanvas;g.uniform2f(u.a,a,b);g.uniform2f(u.b,c,d);g.uniform2f(u.c,x,y);g.uniform4f(u.tint,...l.rgba);g.uniform1i(u.kind,l.kind==='fill'?0:l.kind==='texture'?1:2);
    const held=new Set<WebGLTexture>(),temporary=new Set<WebGLTexture>();
    try{
     const main=l.kind==='fill'?null:await this.acquireTexture(l as ImageLayer,source,held,temporary,signal);
     const mask=l.mask?.kind==='alpha'?await this.acquireTexture(l.mask.image,source,held,temporary,signal):null;
     signal?.throwIfAborted();check(!this.disposed&&!g.isContextLost(),'Renderer lost');
     g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,main);
     g.activeTexture(g.TEXTURE1);g.bindTexture(g.TEXTURE_2D,mask);
     g.uniform1i(u.maskKind,l.mask?.kind==='alpha'?2:l.mask?1:0);
     if(l.mask){const [a,b,c,d,x,y]=l.mask.overlayToMaskUv;g.uniform2f(u.maskA,a,b);g.uniform2f(u.maskB,c,d);g.uniform2f(u.maskC,x,y);}
     g.drawArrays(g.TRIANGLE_STRIP,0,4);check(g.getError()===g.NO_ERROR,'WebGL draw failed');drawn++;
    }finally{for(const t of temporary)g.deleteTexture(t);}
   }
   g.flush();return {drawn,skipped};
  }finally{this.busy=false;}
 }
 private async acquireTexture(row:ImageLayer,source:ImageSource,held:Set<WebGLTexture>,temporary:Set<WebGLTexture>,signal?:AbortSignal){
  const g=this.gl,key=[row.imageSha256,...row.size,...row.wrap,row.colorSpace].join(':');
  const cached=this.textures.get(key);
  if(cached){this.textures.delete(key);this.textures.set(key,cached);held.add(cached.texture);return cached.texture;}
  const bytes=row.size[0]*row.size[1]*4,bitmap=await source(row,signal);
  try{
   signal?.throwIfAborted();check(!this.disposed&&!g.isContextLost(),'Renderer lost');check(bitmap.width===row.size[0]&&bitmap.height===row.size[1],'Texture dimensions mismatch');check(Math.max(bitmap.width,bitmap.height)<=g.getParameter(g.MAX_TEXTURE_SIZE),'Texture exceeds GPU limit');
   this.evictTo(Math.max(0,this.textureBudgetBytes-bytes),held);
   const t=g.createTexture();check(t,'Texture allocation');temporary.add(t);held.add(t);
   g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,t);g.pixelStorei(g.UNPACK_COLORSPACE_CONVERSION_WEBGL,g.NONE);g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);
   g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,row.wrap[0]===0?g.REPEAT:g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,row.wrap[1]===0?g.REPEAT:g.CLAMP_TO_EDGE);
   g.texImage2D(g.TEXTURE_2D,0,g.RGBA8,g.RGBA,g.UNSIGNED_BYTE,bitmap);check(g.getError()===g.NO_ERROR,'WebGL upload failed');
   if(this.residentBytes+bytes<=this.textureBudgetBytes){this.textures.set(key,{texture:t,bytes});this.residentBytes+=bytes;temporary.delete(t);}
   return t;
  }finally{bitmap.close();}
 }
 private evictTo(limit:number,held:ReadonlySet<WebGLTexture>=new Set()){
  for(const [key,entry] of this.textures){if(this.residentBytes<=limit)break;if(held.has(entry.texture))continue;this.gl.deleteTexture(entry.texture);this.textures.delete(key);this.residentBytes-=entry.bytes;}
 }
 private clearTextures(){this.evictTo(0);}
 get cacheStats(){return {textures:this.textures.size,estimatedBytes:this.residentBytes};}
 releaseTextures(){check(!this.busy,'Renderer busy');this.clearTextures();}
 dispose(){if(this.disposed)return;this.disposed=true;this.clearTextures();this.source=undefined;const g=this.gl;g.deleteVertexArray(this.vao);g.deleteProgram(this.program);}
}
