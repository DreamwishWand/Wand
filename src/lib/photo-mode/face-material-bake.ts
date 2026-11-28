/** Exact Steam 1.26.2 pixel arithmetic recovered from Hidden/FaceNormalBlend
 * (DXBC pixel token SHA256 174c3a48e8561f354c8cb2aff64946db0defd9f17993407724708f80fc34afc5)
 * and Custom/BakeMakeup
 * (c4a5c86f0a767b7bae8f9b5ec4ef769a536c40a32be4472ed05c7b22789e38a5).
 * Inputs are sampled channel values, not decoded tangent normals.
 * Keep this bake stage separate from the unresolved final material shader.
 */
export type RGBA=readonly [number,number,number,number];
export type RGB=readonly [number,number,number];
export function blendFaceNormal(eyes:RGBA,nose:RGBA,mouth:RGBA,jaw:RGBA,mask:RGBA):RGBA{
 const out=jaw.map((v,i)=>{let x=v;for(const [j,t] of [eyes,nose,mouth].entries())x+=(t[i]-x)*mask[j];return x});
 return out as unknown as RGBA
}
export function bakeMakeup(mask:RGBA,c1:RGB,c2:RGB,c3:RGB,opacity:number,gloss:number):{color:RGBA;maps:RGBA}{
 const [r,g,b]=mask;const coverage=Math.min(1,Math.hypot(r,g,b))*opacity;
 const color=c1.map((v,i)=>((v*r*(1-g)+c2[i]*g)*(1-b)+c3[i]*b)*coverage);
 return {color:[color[0],color[1],color[2],coverage],maps:[0,coverage,coverage*Math.min(1,Math.max(0,r*gloss)),coverage]}
}
/** Shader bodies for the future native face bake passes. They intentionally
 * perform no sRGB conversions, unpacking, final lighting or framebuffer blending. */
export const faceNormalBakeGLSL=`
vec4 wandFaceNormal(vec4 eyes,vec4 nose,vec4 mouth,vec4 jaw,vec4 mask){
 return mix(mix(mix(jaw,eyes,mask.r),nose,mask.g),mouth,mask.b);
}`;
export const makeupBakeGLSL=`
void wandBakeMakeup(vec4 mask,vec3 c1,vec3 c2,vec3 c3,float opacity,float gloss,out vec4 color,out vec4 maps){
 vec3 c=mix(mix(c1*mask.r,c2,mask.g),c3,mask.b);
 float coverage=min(1.,length(mask.rgb))*opacity;
 color=vec4(c*coverage,coverage);
 maps=vec4(0.,coverage,coverage*clamp(mask.r*gloss,0.,1.),coverage);
}`;
