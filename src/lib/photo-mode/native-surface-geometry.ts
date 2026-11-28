/** Source material channels, in original Unity vertex order and coordinate space.
 * An absent UV channel stays absent. In particular, the native upper teeth
 * tangent W can be zero, so retain it until the actual sign test. */
export interface NativeSurfaceGeometry {
 readonly tangent:Float32Array;readonly color?:Float32Array;
 readonly uv1?:Float32Array;readonly uv2?:Float32Array;
}
const channels=[[2,4],[3,4],[5,2],[6,2]] as const;
const allowed=channels.reduce((m,[i])=>m|(1<<i),0);
function check(v:unknown,m:string):asserts v{if(!v)throw Error(m)}
export function surfaceGeometryBytes(vertices:number,mask:number){
 check(Number.isSafeInteger(vertices)&&vertices>0&&vertices<=100000&&Number.isSafeInteger(mask)&&mask>=0&&mask<=allowed&&(mask&~allowed)===0&&(mask&4)!==0,'Invalid surface geometry layout');
 return 12+vertices*4*channels.reduce((sum,[i,d])=>sum+((mask&(1<<i))?d:0),0);
}
export function decodeNativeSurfaceGeometry(raw:ArrayBuffer,vertices:number,mask:number):NativeSurfaceGeometry{
 const expected=surfaceGeometryBytes(vertices,mask);
 check(raw.byteLength===expected,'Invalid surface geometry length');
 const v=new DataView(raw);check(v.getUint32(0,true)===0x31475357&&v.getUint32(4,true)===vertices&&v.getUint32(8,true)===mask,'Invalid surface geometry header');
 const arrays=new Map<number,Float32Array>();let off=12;
 for(const [i,d] of channels){if(!(mask&(1<<i)))continue;const a=new Float32Array(vertices*d);for(let k=0;k<a.length;k++,off+=4){const x=v.getFloat32(off,true);check(Number.isFinite(x),'Nonfinite surface attribute');if(i===2&&k%4===3)check(x===-1||x===0||x===1,'Invalid native tangent W');a[k]=x}arrays.set(i,a)}
 return {tangent:arrays.get(2)!,color:arrays.get(3),uv1:arrays.get(5),uv2:arrays.get(6)};
}
/** Reflect native X to the preview coordinate system. Cross products reverse
 * handedness under reflection. Match the native shader's W > 0 sign test,
 * not multiplication by raw W (zero is a valid native value). */
export function reflectedSkinTangents(native:Float32Array):Float32Array{
 check(native.length>0&&native.length%4===0,'Invalid native tangent array');
 const out=new Float32Array(native.length);
 for(let i=0;i<native.length;i+=4){const [x,y,z,w]=native.subarray(i,i+4);check([x,y,z].every(Number.isFinite)&&(w===-1||w===0||w===1),'Invalid native tangent');out[i]=-x;out[i+1]=y;out[i+2]=z;out[i+3]=w>0?-1:1}
 return out
}
