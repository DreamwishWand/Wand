import type {RGB,RGBA} from './face-material-bake.ts';

/** Source-confirmed sampled-input stages only. Steam 1.26.2.
 * PBR/PBR: DXBC 83fb896bae187cd9d05fe2b1e9ddad23dbdc4f02e94b26dad1607245d9df5cbd,
 * instructions 25–27 and 72–80.
 * PBR/PBR Clothing: DXBC e376d452ae718f6a3131052544233aca2b97e1d5734b237b88cee9e50c9a087e,
 * instructions 68–77. Clothing decal samples are at UV1, not UV0.
 * Parameters denote actual shader uniforms, not serialized Color values.
 * Alpha test, blend, emission, texture bindings and lighting parity are
 * separate; these functions are not a complete material implementation.
 */
export interface NativeAccessorySurface {
 readonly albedo:RGB;readonly diffuse:RGB;readonly specular:RGB;readonly metallic:number;readonly gloss:number;
}
const sat=(v:number)=>Math.min(1,Math.max(0,v));
function brdf(albedo:RGB,metallic:number,gloss:number):NativeAccessorySurface {
 const m=sat(metallic),k=.96*(1-m);
 const channel=(i:0|1|2)=>.04+(albedo[i]-.04)*m;
 return {albedo,metallic:m,gloss:sat(gloss),diffuse:[albedo[0]*k,albedo[1]*k,albedo[2]*k],specular:[channel(0),channel(1),channel(2)]};
}
export function nativeAccessorySurface(main:RGBA,maps:RGBA,tint:RGBA,metallicScale:number,glossScale:number,glossBias:number):NativeAccessorySurface{
 const channel=(i:0|1|2)=>main[i]*(1+(tint[i]-1)*maps[0]);
 return brdf([channel(0),channel(1),channel(2)],maps[0]*metallicScale,maps[2]*glossScale+glossBias);
}
export function nativeClothingSurface(main:RGBA,maps:RGBA,tint:RGBA,decal:RGBA,decalMaps:RGBA,globalGlossScale:number,globalGlossBias:number):NativeAccessorySurface {
 const channel=(i:0|1|2)=>main[i]*tint[i]*(1-decalMaps[1])+decal[i];
 return brdf([channel(0),channel(1),channel(2)],maps[0],maps[2]*globalGlossScale+globalGlossBias);
}
/** The alpha-test variant uses maps.g, not diffuse alpha or the serialized
 * _Cutoff property. DXBC 266ae555...2974e instructions 28–30.
 * The same instructions occur in the no-normal variant fb503e89...68dc. */
export function nativeAccessoryVisible(maps:RGBA,alphaCutout:boolean):boolean{return !alphaCutout||maps[1]>=.5}
/** The generic normal-mapped forward variant reverses only the geometric
 * normal on back faces, keeping tangent and precomputed bitangent. */
export function nativeAccessoryBackfaceNormal(normal:RGB,tangent:RGBA,packed:RGBA,front:boolean):RGB{
 const x=2*packed[0]*packed[3]-1,y=2*packed[1]-1,z=Math.max(1e-16,Math.sqrt(1-Math.min(1,x*x+y*y)));
 const [nx,ny,nz]=normal,[tx,ty,tz,w]=tangent,sign=w>0?1:-1,f=front?1:-1;
 const a=tx*x+(ny*tz-nz*ty)*sign*y+nx*z*f,b=ty*x+(nz*tx-nx*tz)*sign*y+ny*z*f,c=tz*x+(nx*ty-ny*tx)*sign*y+nz*z*f;
 const l=Math.hypot(a,b,c);if(!(l>0)||!Number.isFinite(l))throw Error('Invalid accessory normal');return [a/l,b/l,c/l];
}
export const nativeAccessorySurfaceGLSL=`
bool wandAccessoryVisible(vec4 maps,bool cutout){return !cutout||maps.g>=.5;}
vec3 wandAccessoryNormal(vec4 packedNormal,vec3 n,vec4 t,bool front){
 vec3 p=wandUnpackSkinNormal(packedNormal);float signT=t.w>0.?1.:-1.;
 return normalize(t.xyz*p.x+cross(n,t.xyz)*(signT*p.y)+n*p.z*(front?1.:-1.));
}
struct WandAccessorySurface {vec3 albedo;vec3 diffuse;vec3 specular;float metallic;float gloss;};
WandAccessorySurface wandAccessoryBRDF(vec3 albedo,float metallic,float gloss){
 float m=clamp(metallic,0.,1.);
 return WandAccessorySurface(albedo,albedo*(.96*(1.-m)),mix(vec3(.04),albedo,m),m,clamp(gloss,0.,1.));
}
WandAccessorySurface wandAccessorySurface(vec4 mainTex,vec4 maps,vec4 tint,float metallicScale,float glossScale,float glossBias){
 return wandAccessoryBRDF(mainTex.rgb*mix(vec3(1.),tint.rgb,maps.r),maps.r*metallicScale,maps.b*glossScale+glossBias);
}
WandAccessorySurface wandClothingSurface(vec4 mainTex,vec4 maps,vec4 tint,vec4 decal,vec4 decalMaps,float globalGlossScale,float globalGlossBias){
 return wandAccessoryBRDF(mainTex.rgb*tint.rgb*(1.-decalMaps.g)+decal.rgb,maps.r,maps.b*globalGlossScale+globalGlossBias);
}
`;
