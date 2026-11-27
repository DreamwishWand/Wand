import type {PoseScene,PoseView,PoseRenderer,PosePrimitive} from './scene-session.ts';

const vertexSource = '#version 300 es\n'+
'precision highp float; precision highp int;\n'+
'layout(location=0) in vec3 position; layout(location=1) in vec3 normal; layout(location=2) in vec2 uv; layout(location=3) in uvec4 joints; layout(location=4) in vec4 weights;\n'+
'uniform highp sampler2D palette; uniform mat4 camera; out vec2 texcoord; out vec3 n;\n'+
'mat4 bone(uint j){int y=int(j);return mat4(texelFetch(palette,ivec2(0,y),0),texelFetch(palette,ivec2(1,y),0),texelFetch(palette,ivec2(2,y),0),texelFetch(palette,ivec2(3,y),0));}\n'+
'void main(){mat4 skin=weights.x*bone(joints.x)+weights.y*bone(joints.y)+weights.z*bone(joints.z)+weights.w*bone(joints.w);gl_Position=camera*skin*vec4(position,1.);n=normalize(mat3(skin)*normal);texcoord=uv;}';
const fragmentSource='#version 300 es\nprecision highp float; in vec2 texcoord; in vec3 n; uniform sampler2D albedo; uniform vec4 tint; out vec4 color;\n'+
'void main(){vec4 base=texture(albedo,texcoord)*tint;if(base.a<0.02)discard;float light=0.60+0.40*max(0.,dot(normalize(n),normalize(vec3(.3,.8,.6))));color=vec4(base.rgb*light,base.a);}';
function check(x:unknown,m:string):asserts x{if(!x)throw new Error(m)}
export function cameraMatrix(scene:Pick<PoseScene,'center'|'radius'>,view:PoseView,width:number,height:number):Float32Array{
  check(width>0&&height>0&&scene.radius>0&&[...scene.center,scene.radius,view.yaw,view.pitch,view.zoom].every(Number.isFinite)&&view.zoom>0,'Invalid camera');
  const cy=Math.cos(view.yaw),sy=Math.sin(view.yaw),cp=Math.cos(view.pitch),sp=Math.sin(view.pitch);
  const x=[cy,0,-sy],y=[-sp*sy,cp,-sp*cy],z=[cp*sy,sp,cp*cy];
  const scale=view.zoom/(scene.radius*1.15),sx=scale*Math.min(1,height/width),ssy=scale*Math.min(1,width/height),sz=-1/(scene.radius*8);
  const dot=(v:number[])=>v.reduce((s,k,i)=>s+k*scene.center[i],0);
  return new Float32Array([x[0]*sx,y[0]*ssy,z[0]*sz,0,x[1]*sx,y[1]*ssy,z[1]*sz,0,x[2]*sx,y[2]*ssy,z[2]*sz,0,-dot(x)*sx,-dot(y)*ssy,-dot(z)*sz,1]);
}
export function validatePrimitive(p:PosePrimitive,counts:readonly number[]){
  const n=p.positions.length/3;
  check(Number.isSafeInteger(n)&&n>0&&p.normals.length===n*3&&p.uv.length===n*2&&p.joints.length===n*4&&p.weights.length===n*4&&p.indices.length>0&&p.indices.length%3===0,'Invalid geometry');
  check(Number.isSafeInteger(p.skin)&&p.skin>=0&&p.skin<counts.length&&counts[p.skin]>0,'Invalid skin');
  check(p.positions.every(Number.isFinite)&&p.normals.every(Number.isFinite)&&p.uv.every(Number.isFinite)&&p.weights.every(w=>Number.isFinite(w)&&w>=0)&&p.joints.every(j=>j<counts[p.skin])&&p.indices.every(i=>i<n)&&p.color.length===4&&p.color.every(c=>Number.isFinite(c)&&c>=0&&c<=1),'Invalid geometry values');
  for(let i=0;i<n;i++){const k=i*4;check(Math.abs(p.weights[k]+p.weights[k+1]+p.weights[k+2]+p.weights[k+3]-1)<.001,'Invalid skin weights')}
}
interface Draw {vao:WebGLVertexArrayObject;texture:WebGLTexture;primitive:PosePrimitive}
export class GpuPoseRenderer implements PoseRenderer {
  private gl:WebGL2RenderingContext;
  private program!:WebGLProgram;
  private shaders:WebGLShader[]=[];
  private buffers:WebGLBuffer[]=[];
  private textures:WebGLTexture[]=[];
  private vaos:WebGLVertexArrayObject[]=[];
  private skins:WebGLTexture[]=[];
  private draws:Draw[]=[];
  private uniforms!:Record<'palette'|'camera'|'albedo'|'tint',WebGLUniformLocation>;
  private disposed=false;
  constructor(private canvas:HTMLCanvasElement,private scene:PoseScene){
    const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:false});check(gl,'WebGL2 unavailable');this.gl=gl;
    try{
      check(scene.jointCounts.length>0&&scene.jointCounts.every(n=>Number.isSafeInteger(n)&&n>0&&n<=gl.getParameter(gl.MAX_TEXTURE_SIZE)),'Unsupported joint count');
      check(scene.primitives.length>0&&new Set(scene.actors.map(a=>a.id)).size===scene.actors.length,'Invalid actors');
      const shader=(type:number,source:string)=>{const s=gl.createShader(type);check(s,'Shader allocation failed');this.shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);check(gl.getShaderParameter(s,gl.COMPILE_STATUS),gl.getShaderInfoLog(s)||'Shader failed');return s};
      const program=gl.createProgram();check(program,'Program allocation failed');this.program=program;gl.attachShader(program,shader(gl.VERTEX_SHADER,vertexSource));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragmentSource));gl.linkProgram(program);check(gl.getProgramParameter(program,gl.LINK_STATUS),gl.getProgramInfoLog(program)||'Program failed');
      const loc=(n:string)=>{const l=gl.getUniformLocation(program,n);check(l!==null,'Missing uniform');return l};this.uniforms={palette:loc('palette'),camera:loc('camera'),albedo:loc('albedo'),tint:loc('tint')};
      const texture=()=>{const t=gl.createTexture();check(t,'Texture allocation failed');this.textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);return t};
      this.skins=scene.jointCounts.map(n=>{const t=texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,4,n,0,gl.RGBA,gl.FLOAT,null);return t});
      const white=texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
      const imageCache=new Map<ImageBitmap,WebGLTexture>();
      const buffer=(type:number,data:Float32Array|Uint16Array|Uint32Array)=>{const b=gl.createBuffer();check(b,'Buffer allocation failed');this.buffers.push(b);gl.bindBuffer(type,b);gl.bufferData(type,data,gl.STATIC_DRAW)};
      for(const p of scene.primitives){
        validatePrimitive(p,scene.jointCounts);check(scene.actors.some(a=>a.id===p.actorId),'Unknown actor');
        let tex=white;
        if(p.texture){const old=imageCache.get(p.texture);if(old)tex=old;else{tex=texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,p.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);imageCache.set(p.texture,tex)}}
        const vao=gl.createVertexArray();check(vao,'Vertex array allocation failed');this.vaos.push(vao);gl.bindVertexArray(vao);
        const attr=(i:number,n:number,data:Float32Array|Uint16Array)=>{buffer(gl.ARRAY_BUFFER,data);gl.enableVertexAttribArray(i);if(data instanceof Uint16Array)gl.vertexAttribIPointer(i,n,gl.UNSIGNED_SHORT,0,0);else gl.vertexAttribPointer(i,n,gl.FLOAT,false,0,0)};
        attr(0,3,p.positions);attr(1,3,p.normals);attr(2,2,p.uv);attr(3,4,p.joints);attr(4,4,p.weights);buffer(gl.ELEMENT_ARRAY_BUFFER,p.indices);this.draws.push({vao,texture:tex,primitive:p});
      }
      gl.bindVertexArray(null);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
      check(gl.getError()===gl.NO_ERROR,'GPU upload failed');
    }catch(e){this.dispose();throw e}
  }
  draw(palettes:readonly Float32Array[],view:PoseView,hidden:ReadonlySet<string>){
    if(this.disposed)return;
    const gl=this.gl;check(!gl.isContextLost(),'Graphics context lost');const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
    gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.uniformMatrix4fv(this.uniforms.camera,false,cameraMatrix(this.scene,view,w,h));
    gl.activeTexture(gl.TEXTURE0);
    for(const [i,p] of palettes.entries()){check(p.length===this.scene.jointCounts[i]*16,'Invalid palette');gl.bindTexture(gl.TEXTURE_2D,this.skins[i]);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,4,this.scene.jointCounts[i],gl.RGBA,gl.FLOAT,p)}
    gl.uniform1i(this.uniforms.palette,0);gl.uniform1i(this.uniforms.albedo,1);
    for(const d of this.draws){const p=d.primitive;if(hidden.has(p.actorId))continue;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.skins[p.skin]);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,d.texture);gl.uniform4f(this.uniforms.tint,...p.color);gl.bindVertexArray(d.vao);gl.drawElements(gl.TRIANGLES,p.indices.length,p.indices instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,0)}
    gl.bindVertexArray(null);
  }
  dispose(){if(this.disposed)return;this.disposed=true;const gl=this.gl;for(const b of this.buffers)gl.deleteBuffer(b);for(const t of this.textures)gl.deleteTexture(t);for(const v of this.vaos)gl.deleteVertexArray(v);for(const s of this.shaders)gl.deleteShader(s);if(this.program)gl.deleteProgram(this.program)}
}
