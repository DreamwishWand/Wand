/** Source-derived studio illumination, Steam 1.26.2.
 * RenderLighting DayTimeLighting (168d36bc258f9b44d8d3f70ba83a0722)
 * in streamingassets_assets_all.bundle, SHA256 0049964b508ce27a8b75cf123d614af1ef9ebfc80dce00e4ac4485465829ee5f.
 * Object SHA256 714514380b73a81a1c661ffdc20cb4856afa7990c6087678bec2df0339764d95.
 * UpdateCommandBuffer (RVA D1B1B0) packs the stored SH coefficients,
 * transforms lightDirection by LookAt, and uses Color.linear.
 * Only the direct and diffuse-indirect terms are enabled here.
 * The referenced HDR reflection and LUT are not yet bound.
 */
type Vec3=readonly [number,number,number];
type Vec4=readonly [number,number,number,number];
type Profile={name:string;sourceSha256:string;lightColor:Vec3;lightDirection:Vec3;glossBias:number;probe:readonly number[]};
export const nativeStudioProfiles={
 day:{name:'DayTimeLighting',sourceSha256:'714514380b73a81a1c661ffdc20cb4856afa7990c6087678bec2df0339764d95',lightColor:[1.1447213888168335,1.1087616682052612,0.9769088625907898],lightDirection:[0.40824827551841736,0.40824827551841736,-0.8164965510368347],glossBias:0,probe:[0.32601243257522583,0.0768674835562706,0,0,0,0,0.03811749815940857,0,0.11435247957706451,0.3891908526420593,0.10530207306146622,0,0,0,0,0.018374241888523102,0,0.05512272194027901,0.45419958233833313,0.13424967229366302,0,0,0,0,-0.0019409852102398872,0,-0.005822956562042236]},
 night:{name:'NightTimeLighting',sourceSha256:'2902df3db835ec4f75c0a08ca62884b3a0910d246df459603aa6d186ecc709c8',lightColor:[0.8399136066436768,1.0050249099731445,1.4142135381698608],lightDirection:[0.4210759699344635,0.3368607759475708,-0.842151939868927],glossBias:0,probe:[0.1315726637840271,0.10529981553554535,0,0,0,0,-0.007642157841473818,0,-0.022926468402147293,0.23568376898765564,0.16338488459587097,0,0,0,0,-0.007663649506866932,0,-0.02299094758927822,0.3419826030731201,0.22162777185440063,0,0,0,0,-0.0073236823081970215,0,-0.021971050649881363]},
 default:{name:'Default',sourceSha256:'6c760fe9c7bcbcd47d5696b8faac92dce1bf7605c7be9ef4fb68b64a8dcee757',lightColor:[1,1,1],lightDirection:[-0.40824830532073975,0.40824830532073975,-0.8164966106414795],glossBias:0,probe:[0.12270278483629227,0.22889000177383423,0,0,0,0,-0.034490086138248444,0,-0.10347025096416473,0.16580307483673096,0.31327298283576965,0,0,0,0,-0.0473291240632534,0,-0.1419873684644699,0.22949863970279694,0.4395821988582611,0,0,0,0,-0.06674069911241531,0,-0.20022207498550415]}
} as const satisfies Record<string,Profile>;
export const defaultStudioProfile=nativeStudioProfiles.day;
/** Unity Color.linear is not a bounded sRGB conversion: HDR values remain HDR. */
export function nativeLightLinear(v:number){return v<=.04045?v/12.92:v<1?((v+.055)/1.055)**2.4:v**2.2}
export function packStudioProbe(values:readonly number[]):readonly Vec4[]{
 if(values.length!==27||!values.every(Number.isFinite))throw Error('Invalid studio probe');
 const c=[values.slice(0,9),values.slice(9,18),values.slice(18,27)];
 const a=c.map(v=>[v[3],v[1],v[2],v[0]-v[6]] as Vec4);
 const b=c.map(v=>[v[4],v[5],3*v[6],v[7]] as Vec4);
 return [...a,...b,[c[0][8],c[1][8],c[2][8],1]];
}
export function evaluateStudioProbe(values:readonly Vec4[],n:Vec3):Vec3{
 if(values.length!==7||!n.every(Number.isFinite))throw Error('Invalid studio evaluation');
 const [x,y,z]=n;const a=[x,y,z,1],b=[x*y,y*z,z*z,z*x];
 const dot=(u:Vec4,v:number[])=>u.reduce((s,k,i)=>s+k*v[i],0);
 return [0,1,2].map(i=>dot(values[i],a)+dot(values[i+3],b)+values[6][i]*(x*x-y*y)) as unknown as Vec3;
}
/** ItemPreview.Render calls LookAt(cameraPosition,targetPosition,targetUp)
 * and passes that matrix to RenderLighting.UpdateCommandBuffer. Map the
 * camera-local light to the existing reflected-X orthographic orbit basis.
 */
export function studioLightDirection(l:Vec3,yaw:number,pitch:number):Vec3{
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const [x,y,z]=l;
 return [x*cy-y*sp*sy-z*cp*sy,y*cp-z*sp,-x*sy-y*sp*cy-z*cp*cy];
}
export const nativeStudioLightingGLSL=`
vec3 wandStudioProbe(vec3 reflectedNormal){
 vec3 n=vec3(-reflectedNormal.x,reflectedNormal.yz);
 vec4 a=vec4(n,1.),b=n.yzzx*n.xyzz;
 return vec3(dot(studioSH[0],a),dot(studioSH[1],a),dot(studioSH[2],a))
  +vec3(dot(studioSH[3],b),dot(studioSH[4],b),dot(studioSH[5],b))+studioSH[6].rgb*(n.x*n.x-n.y*n.y);
}
`;
