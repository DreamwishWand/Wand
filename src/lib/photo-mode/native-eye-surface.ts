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

/** GetToBake (RVA 0x130CCC0) packs vertex color for eyes AND eyesShadow.
 * BakeMeshesJob.Execute (RVA 0x136E5E0), at 0x136F3B1–0x136F3DC and
 * 0x136F6B2–0x136F725, copies Color32 red and alpha divided by 255 to
 * the third/fourth half-float UV components. Green/blue are not used here.
 */
function halfUnit(v:number){if(v===0)return 0;const step=2**(Math.floor(Math.log2(v))-10);return Math.round(v/step)*step}
export function packNativeEyeColor(colors:Float32Array):Float32Array{
 if(colors.length%4!==0||!colors.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid native eye vertex colors');
 const out=new Float32Array(colors.length/2);
 for(let i=0;i<colors.length;i+=4){out[i/2]=halfUnit(Math.round(colors[i]*255)/255);out[i/2+1]=halfUnit(Math.round(colors[i+3]*255)/255)}
 return out;
}
/** Native shader instructions 106–112, 189–190. Eye highlight is controlled
 * by packed red; alpha controls diffuse attenuation and premultiplied blend. */
export function nativeEyePackedOutput(surface:EyeRGB,highlight:EyeRGB,packed:readonly [number,number]):EyeRGBA{
 const [gloss,alpha]=packed,a=Math.min(1,Math.max(0,alpha));return [surface[0]*.96*a+highlight[0]*gloss,surface[1]*.96*a+highlight[1]*gloss,surface[2]*.96*a+highlight[2]*gloss,a];
}

/** Original pixel program 71–98. cb0[68] is the third column of
 * unity_MatrixV (serialized matrix parameter offset 0x420, 4 columns);
 * cb0[5] is _MainLightPosition. Both supplied in native Unity coordinates.
 * Keep the shader's negative-dot comparison and polynomial, rather than
 * substituting a conventional half-vector or angle clamp. */
export function nativeEyeHighlightDirection(cameraColumnXZ:readonly [number,number],lightXZ:readonly [number,number],horizontal:number,vertical:number):EyeRGB{
 const cn=Math.hypot(...cameraColumnXZ),ln=Math.hypot(...lightXZ);
 if(!(cn>0&&ln>0)||!Number.isFinite(cn+ln+vertical)||!Number.isFinite(horizontal)||Math.abs(horizontal)>1)throw Error('Invalid native eye light inputs');
 const cx=cameraColumnXZ[0]/cn,cz=cameraColumnXZ[1]/cn;let lx=lightXZ[0]/ln,lz=lightXZ[1]/ln;
 const d=lx*cx+lz*cz;if(d<0){lx-=2*d*cx;lz-=2*d*cz}
 if(-(cx*lx+cz*lz)<horizontal){const q=cz*lx-cx*lz,k=1-(1-horizontal)*q*q,s=Math.sqrt(1-horizontal*horizontal);lx=cx*k+cz*q*s;lz=cz*k-cx*q*s}
 const len=Math.hypot(lx,vertical,lz);return [lx/len,vertical/len,lz/len];
}
export const nativeEyeHighlightDirectionGLSL=`
vec3 wandEyeHighlightDirection(vec2 cameraColumnXZ,vec2 lightXZ,float horizontal,float vertical){
 vec2 c=normalize(cameraColumnXZ),l=normalize(lightXZ);
 float d=dot(l,c);if(d<0.)l-=2.*d*c;
 if(-dot(c,l)<horizontal){vec2 p=vec2(c.y,-c.x);float q=dot(p,l);l=c*(1.-(1.-horizontal)*q*q)+p*q*sqrt(1.-horizontal*horizontal);}
 return normalize(vec3(l.x,vertical,l.y));
}`;
