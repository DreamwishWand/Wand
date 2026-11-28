import type {RGB,RGBA} from './face-material-bake.ts';

/** Steam 1.26.2 PBR/PBR Hair, no-shadow forward pixel program
 * d1fc89522b38173ae2370b97a913fde10aef5b9ec928d7d6c6297ddea6767ac6.
 * Instructions 59–78. Sampled texture values and linear shader uniforms,
 * not unconverted palette colors. Special/VFX shaders are not covered. */
export interface NativeHairColors {
 readonly base:RGBA;readonly one:RGBA;readonly two:RGBA;readonly three:RGBA;
}
export interface NativeHairSurface {
 readonly albedo:RGB;readonly diffuse:RGB;readonly gloss:number;
 readonly occlusion:number;readonly alpha:number;
}
export function nativeHairSurface(mask:RGBA,maps:RGBA,c:NativeHairColors,dst:number,globalGlossBias:number):NativeHairSurface {
 const channel=(i:0|1|2)=>{
  const b=(c.three[i]-c.base[i])*mask[2]+c.base[i];
  const g=(c.two[i]-b)*mask[1]+b;
  return (c.one[i]-g)*(mask[0]*c.one[3])+g;
 };
 const albedo:RGB=[channel(0),channel(1),channel(2)];
 return {albedo,diffuse:[albedo[0]*.96,albedo[1]*.96,albedo[2]*.96],gloss:Math.min(1,Math.max(0,maps[2]+globalGlossBias)),occlusion:Math.min(1,1-mask[1]),alpha:dst===0?1:maps[1]};
}
/** Reuse native-skin-surface's packed normal and direct-specular formulas.
 * Legacy _Power and _HairSpecularColor are not bound by this forward program. */
export const nativeHairSurfaceGLSL=`
struct WandHairSurface {vec3 albedo;vec3 diffuse;float gloss;float occlusion;float alpha;};
WandHairSurface wandHairSurface(vec4 mask,vec4 maps,vec4 base,vec4 one,vec4 two,vec4 three,float dst,float glossBias){
 vec3 c=mix(base.rgb,three.rgb,mask.b);
 c=mix(c,two.rgb,mask.g);
 c=mix(c,one.rgb,mask.r*one.a);
 return WandHairSurface(c,c*.96,clamp(maps.b+glossBias,0.,1.),min(1.,1.-mask.g),dst==0.?1.:maps.g);
}
`;
