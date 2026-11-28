/** Native PBR/PBR Eyes sampled-color stage, Steam 1.26.2.
 * Shader object 0571062679bae71f12621b7068a847463e28765ed02ff680bb00c0b55d6a01b1.
 * DXBC surface token hash 67b255427dfa5120ffe6d24ca23e29f168daeb08f4b462ea9e326a49652b8429,
 * instructions 64–70. Inputs are already sampled linear RGBA and shader colors.
 * This is not a claim of world-specific lighting parity.
 */
export type EyeRGBA=readonly [number,number,number,number];
export type EyeRGB=readonly [number,number,number];
export function nativeEyeColor(mask:EyeRGBA,colors:readonly [EyeRGBA,EyeRGBA,EyeRGBA]):EyeRGB{
 const [r,g,b,a]=mask,[c1,c2,c3]=colors;
 const mix=(x:number,y:number,t:number)=>x+(y-x)*t;
 return [0,1,2].map(i=>mix(mask[i],mix(mix(c3[i]*b,c2[i],g),c1[i],r),a)) as unknown as EyeRGB;
}
export function nativeEyeHighlight(noH:number,size:number,falloff:number){
 return Math.min(1,Math.pow(Math.min(1,Math.max(0,noH))+size,falloff));
}
export const nativeEyeSurfaceGLSL=`
vec3 wandEyeColor(vec4 mask,vec3 eyeColor1,vec3 eyeColor2,vec3 eyeColor3){
 return mix(mask.rgb,mix(mix(eyeColor3*mask.b,eyeColor2,mask.g),eyeColor1,mask.r),mask.a);
}
float wandEyeHighlight(float noH,float size,float falloff){
 return min(1.,pow(clamp(noH,0.,1.)+size,falloff));
}
`;
