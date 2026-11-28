import {studioLutGLSL} from './native-studio-assets.ts';
/** Composite the scene in linear light in an sRGB render target.
 * WebGL2 decodes the destination before blending and encodes the result.
 * Only the final fullscreen pass converts to the straight-alpha canvas.
 * Use the common supported MSAA sample count for color and depth; do not
 * require float-render-target extensions on tablets or integrated GPUs.
 * When studio HDR assets are active, prefer RGBA16F so the linear blend
 * retains radiance above 1 until the final LUT/output pass. On devices
 * without float color attachments, keep the compatible SDR target.
 */
export class LinearSceneTarget {
 private color:WebGLTexture|null=null;
 private lut:WebGLTexture|null=null;
 private fb:WebGLFramebuffer|null=null;
 private ms:WebGLFramebuffer|null=null;
 private msColor:WebGLRenderbuffer|null=null;
 private depth:WebGLRenderbuffer|null=null;
 private program:WebGLProgram|null=null;
 private vao:WebGLVertexArrayObject|null=null;
 private width=0;private height=0;
 private samples:number;
 private format:number;
 readonly hdr:boolean;
 private gl:WebGL2RenderingContext;
 constructor(gl:WebGL2RenderingContext,lut?:Uint8Array<ArrayBuffer>){
  this.gl=gl;
  const counts=(format:number)=>Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,format,gl.SAMPLES) as Int32Array);
  this.hdr=!!lut&&!!(gl.getExtension('EXT_color_buffer_float')||gl.getExtension('EXT_color_buffer_half_float'));
  this.format=this.hdr?gl.RGBA16F:gl.SRGB8_ALPHA8;
  const depth=counts(gl.DEPTH_COMPONENT24);
  this.samples=Math.max(0,...counts(this.format).filter(n=>n<=4&&depth.includes(n)));
  const shaders:WebGLShader[]=[];
  try{
   this.program=gl.createProgram();this.vao=gl.createVertexArray();
   if(!this.program||!this.vao)throw Error('Scene resolve allocation failed');
   const compile=(kind:number,source:string)=>{const s=gl.createShader(kind);if(!s)throw Error('Scene resolve shader allocation');shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Scene resolve shader failed');return s};
   gl.attachShader(this.program,compile(gl.VERTEX_SHADER,`#version 300 es
   out vec2 uv;void main(){uv=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(uv*2.-1.,0.,1.);}`));
   gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,`#version 300 es
   precision highp float;in vec2 uv;uniform sampler2D sceneColor,studioLut;uniform bool lutEnabled;out vec4 color;
   ${studioLutGLSL}
   void main(){vec4 p=texture(sceneColor,uv);vec3 c=p.a>0.?clamp(p.rgb/p.a,0.,1.):vec3(0.);if(lutEnabled&&p.a>0.)c=wandStudioLut(studioLut,c);color=vec4(mix(12.92*c,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c)),p.a);}`));
   gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program)||'Scene resolve program failed');
   if(lut){if(lut.length!==98304)throw Error('Invalid studio LUT');this.lut=gl.createTexture();if(!this.lut)throw Error('Studio LUT allocation');gl.bindTexture(gl.TEXTURE_2D,this.lut);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB8,1024,32,0,gl.RGB,gl.UNSIGNED_BYTE,lut);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.bindTexture(gl.TEXTURE_2D,null);if(gl.getError()!==gl.NO_ERROR)throw Error('Studio LUT upload failed')}
  }catch(e){this.dispose();throw e}finally{for(const s of shaders)gl.deleteShader(s)}
 }
 private releaseSize(){const g=this.gl;if(this.color)g.deleteTexture(this.color);if(this.fb)g.deleteFramebuffer(this.fb);if(this.ms)g.deleteFramebuffer(this.ms);if(this.msColor)g.deleteRenderbuffer(this.msColor);if(this.depth)g.deleteRenderbuffer(this.depth);this.color=null;this.fb=null;this.ms=null;this.msColor=null;this.depth=null;this.width=0;this.height=0}
 private resize(w:number,h:number){
  const g=this.gl;this.releaseSize();
  try{
   if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||Math.max(w,h)>Math.min(g.getParameter(g.MAX_TEXTURE_SIZE),g.getParameter(g.MAX_RENDERBUFFER_SIZE)))throw Error('Unsupported scene target size');
   this.color=g.createTexture();this.fb=g.createFramebuffer();this.depth=g.createRenderbuffer();if(!this.color||!this.fb||!this.depth)throw Error('Scene target allocation failed');
   g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.color);g.texStorage2D(g.TEXTURE_2D,1,this.format,w,h);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
   g.bindFramebuffer(g.FRAMEBUFFER,this.fb);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,this.color,0);
   if(this.samples){
    if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('Scene resolve framebuffer unavailable');
    this.ms=g.createFramebuffer();this.msColor=g.createRenderbuffer();if(!this.ms||!this.msColor)throw Error('Multisample scene allocation failed');
    g.bindFramebuffer(g.FRAMEBUFFER,this.ms);g.bindRenderbuffer(g.RENDERBUFFER,this.msColor);g.renderbufferStorageMultisample(g.RENDERBUFFER,this.samples,this.format,w,h);g.framebufferRenderbuffer(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.RENDERBUFFER,this.msColor);
   }
   g.bindRenderbuffer(g.RENDERBUFFER,this.depth);
   if(this.samples)g.renderbufferStorageMultisample(g.RENDERBUFFER,this.samples,g.DEPTH_COMPONENT24,w,h);else g.renderbufferStorage(g.RENDERBUFFER,g.DEPTH_COMPONENT24,w,h);
   g.framebufferRenderbuffer(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.RENDERBUFFER,this.depth);
   if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE||g.getError()!==g.NO_ERROR)throw Error('Scene framebuffer unavailable');
   this.width=w;this.height=h;
  }catch(e){this.releaseSize();throw e}finally{g.bindTexture(g.TEXTURE_2D,null);g.bindRenderbuffer(g.RENDERBUFFER,null);g.bindFramebuffer(g.FRAMEBUFFER,null)}
 }
 begin(w:number,h:number){
  if(w!==this.width||h!==this.height)this.resize(w,h);
  const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,this.ms??this.fb);g.viewport(0,0,w,h);g.enable(g.DEPTH_TEST);g.depthMask(true);g.disable(g.BLEND);g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);
 }
 present(){
  const g=this.gl,w=this.width,h=this.height;
  if(this.ms){g.bindFramebuffer(g.READ_FRAMEBUFFER,this.ms);g.bindFramebuffer(g.DRAW_FRAMEBUFFER,this.fb);g.blitFramebuffer(0,0,w,h,0,0,w,h,g.COLOR_BUFFER_BIT,g.NEAREST)}
  g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,w,h);g.disable(g.DEPTH_TEST);g.disable(g.BLEND);g.useProgram(this.program);g.bindVertexArray(this.vao);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.color);g.uniform1i(g.getUniformLocation(this.program!,'sceneColor'),0);g.activeTexture(g.TEXTURE1);g.bindTexture(g.TEXTURE_2D,this.lut??this.color);g.uniform1i(g.getUniformLocation(this.program!,'studioLut'),1);g.uniform1i(g.getUniformLocation(this.program!,'lutEnabled'),this.lut?1:0);g.drawArrays(g.TRIANGLES,0,3);g.bindTexture(g.TEXTURE_2D,null);g.bindVertexArray(null);
 }
 dispose(){this.releaseSize();const g=this.gl;if(this.lut){g.deleteTexture(this.lut);this.lut=null}if(this.program){if(g.getParameter(g.CURRENT_PROGRAM)===this.program)g.useProgram(null);g.deleteProgram(this.program);this.program=null}if(this.vao){g.deleteVertexArray(this.vao);this.vao=null}}
}
