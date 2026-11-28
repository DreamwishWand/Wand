import type {RGB,RGBA} from './face-material-bake.ts';

/** Steam 1.26.2 PBR/PBR Skin, source pixel program
 * e4bdda23a07571fc5cd3036a4c0e17a2ae113875321d6deebbb74eb2ae22c6fd.
 * Exact sampled-input surface stage (instructions 25–53), not lighting parity.
 * Texture sampling/UV choice, color space, mip bias and the remaining
 * environment-dependent PBR stages are separate concerns.
 */
export function unpackNativeSkinNormal(packed:RGBA):RGB{
 const x=2*packed[0]*packed[3]-1,y=2*packed[1]-1;
 return [x,y,Math.max(1e-16,Math.sqrt(1-Math.min(1,x*x+y*y)))];
}
export function nativeSkinSurface(skin:RGBA,spec:RGBA,makeup:RGBA,maps:RGBA,glossMultiplier:number):RGBA{
 const k=1-maps[1];
 return [skin[0]*k+makeup[0],skin[1]*k+makeup[1],skin[2]*k+makeup[2],spec[2]*glossMultiplier*k+maps[2]];
}
export function nativeSkinWorldNormal(packed:RGBA,normal:RGB,tangent:RGBA,objectHandedness:number):RGB{
 const [x,y,z]=unpackNativeSkinNormal(packed),[nx,ny,nz]=normal,[tx,ty,tz,tw]=tangent;
 const sign=(tw>0?1:-1)*(objectHandedness>=0?1:-1);
 const bx=(ny*tz-nz*ty)*sign,by=(nz*tx-nx*tz)*sign,bz=(nx*ty-ny*tx)*sign;
 const a=tx*x+bx*y+nx*z,b=ty*x+by*y+ny*z,c=tz*x+bz*y+nz*z;
 const len=Math.hypot(a,b,c);
 if(!(len>0)||!Number.isFinite(len))throw Error('Invalid native skin tangent basis');
 return [a/len,b/len,c/len];
}
/** Apply to already sampled source values; preserve alpha of packed normal
 * data and do not use the ordinary makeup texture alpha as blend coverage. */
export const nativeSkinSurfaceGLSL=`
vec3 wandUnpackSkinNormal(vec4 packedNormal){
 vec2 xy=vec2(packedNormal.r*packedNormal.a,packedNormal.g)*2.-1.;
 return vec3(xy,max(1e-16,sqrt(1.-min(1.,dot(xy,xy)))));
}
vec4 wandSkinSurface(vec4 skin,vec4 spec,vec4 makeup,vec4 maps,float glossMultiplier){
 float k=1.-maps.g;
 return vec4(skin.rgb*k+makeup.rgb,spec.b*glossMultiplier*k+maps.b);
}
vec3 wandSkinWorldNormal(vec4 packedNormal,vec3 n,vec4 t,float objectHandedness){
 vec3 p=wandUnpackSkinNormal(packedNormal);
 float signT=(t.w>0.?1.:-1.)*(objectHandedness>=0.?1.:-1.);
 return normalize(t.xyz*p.x+cross(n,t.xyz)*(signT*p.y)+n*p.z);
}`;
