import type {BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
export type StudioAssetsIndex={reflection:BlobEntry;lut:BlobEntry;lightingParityVerified:false};
export type StudioAssets={reflection:Uint16Array<ArrayBuffer>;lut:Uint8Array<ArrayBuffer>};
const reflectionSHA='8c77ed0eddb2a7ee856d6480eaf293a735df7600c2c3be540f3378c8a85feec2';
const lutSHA='63becd39f68846f7d4f9b3ac570bfb909b07628534ebd42f36d38e1fe8cd0dc8';
export function validStudioAssets(x:unknown):x is StudioAssetsIndex{
 if(!x||typeof x!=='object')return false;
 const m=x as StudioAssetsIndex;
 return m.lightingParityVerified===false&&m.reflection?.sha256===reflectionSHA&&m.reflection.bytes===786420&&m.lut?.sha256===lutSHA&&m.lut.bytes===98304;
}
export async function loadStudioAssets(m:StudioAssetsIndex,fetchAsset:(e:BlobEntry,ext:'.wlc'|'.wlt')=>Promise<ArrayBuffer>,signal:AbortSignal):Promise<StudioAssets>{
 if(!validStudioAssets(m))throw Error('Invalid studio assets');
 const [cube,lut]=await Promise.all([fetchAsset(m.reflection,'.wlc'),fetchAsset(m.lut,'.wlt')]);signal.throwIfAborted();
 if(cube.byteLength!==786420||lut.byteLength!==98304)throw Error('Invalid studio pixel layout');
 const view=new DataView(cube),reflection=new Uint16Array(cube.byteLength/2);
 for(let i=0;i<reflection.length;i++){const v=view.getUint16(i*2,true);if((v&0x8000)!==0||(v&0x7c00)===0x7c00)throw Error('Invalid HDR half float');reflection[i]=v}
 return {reflection,lut:new Uint8Array(lut)};
}
export function uploadStudioReflection(gl:WebGL2RenderingContext,pixels:Uint16Array|undefined):WebGLTexture{
 const t=gl.createTexture();if(!t)throw Error('Studio reflection allocation failed');
 const align=gl.getParameter(gl.UNPACK_ALIGNMENT);let complete=false;
 try{gl.bindTexture(gl.TEXTURE_CUBE_MAP,t);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
 let off=0;for(let f=0;f<6;f++)for(let i=0;i<(pixels?8:1);i++){const w=pixels?Math.max(1,128>>i):1,n=3*w*w;
 gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+f,i,gl.RGB16F,w,w,0,gl.RGB,gl.HALF_FLOAT,pixels?pixels.subarray(off,off+n):new Uint16Array(3));off+=n}
 if(pixels&&off!==pixels.length)throw Error('Studio cube layout');
 gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,pixels?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAX_LEVEL,pixels?7:0);
 for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_CUBE_MAP,k,gl.CLAMP_TO_EDGE);
 if(gl.getError()!==gl.NO_ERROR)throw Error('Studio cube upload failed');complete=true;return t;
 }finally{gl.pixelStorei(gl.UNPACK_ALIGNMENT,align);gl.bindTexture(gl.TEXTURE_CUBE_MAP,null);if(!complete)gl.deleteTexture(t)}
}
/** Native eye/skin indirect specular: roughness-dependent mip and fourth-power
 * Fresnel, followed by original GGX surface reduction. HDR BC6H was decoded
 * to RGB16F (alpha=1), retaining the original radiance rather than LDR bytes. */
export const studioReflectionGLSL=`
vec3 wandStudioReflection(vec3 n,vec3 v,float gloss,vec3 specular){
 if(!studioReflectionEnabled)return vec3(0.);
 float roughness=1.-clamp(gloss,0.,1.);
 float a=max(roughness*roughness,.0078125);
 float mip=roughness*(1.7-.7*roughness)*6.;
 float fresnel=pow(1.-clamp(dot(n,v),0.,1.),4.);
 float reflectivity=max(specular.r,max(specular.g,specular.b));
 vec3 grazing=vec3(clamp(gloss+reflectivity,0.,1.));
 vec3 r=reflect(-v,n);r.x=-r.x;
 return textureLod(studioReflection,r,mip).rgb*mix(specular,grazing,fresnel)/(1.+a*a);
}
`;
/** Native ItemPreviewLUT pixel program, instructions 8–18, LUT cube size 32.
 * Preserve the original linear sampling of two adjacent blue slices. */
export const studioLutGLSL=`
vec3 wandStudioLut(sampler2D lut,vec3 c){
 c=clamp(c,0.,1.);float z=c.b*31.,b=floor(z);
 vec2 uv=vec2((b*32.+c.r*31.+.5)/1024.,(c.g*31.+.5)/32.);
 vec3 lo=textureLod(lut,uv,0.).rgb;
 vec3 hi=textureLod(lut,uv+vec2(1./32.,0.),0.).rgb;
 return mix(lo,hi,z-b);
}
`;
