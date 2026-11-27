/** Source-derived forward pass for texture-free SH_limbo_effect in Steam 1.26.2.
 * The original shader's default Noise texture is white. Scene fog, HDR bloom,
 * depth/shadow passes and other materials are not reproduced here.
 */
export type LimboMaterial={material:string;sourceSha256:string;primitiveSlots:[number,number][];main:[number,number,number];secondary:[number,number,number];edge:[number,number,number];brightness:number;radial:number;threshold:number;edgeRatio:number};
export function validLimboMaterial(value:unknown):value is LimboMaterial{
 if(!value||typeof value!=='object')return false;
 const m=value as Partial<LimboMaterial>;
 const rgb=(x:unknown)=>Array.isArray(x)&&x.length===3&&x.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=16);
 const range=(x:unknown,min:number,max:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
 return Object.keys(m).length===10&&Array.isArray(m.primitiveSlots)&&m.primitiveSlots.length>0&&m.primitiveSlots.length<=32&&m.primitiveSlots.every(s=>Array.isArray(s)&&s.length===2&&s.every(v=>Number.isSafeInteger(v)&&v>=0&&v<4096))&&new Set(m.primitiveSlots.map(s=>s.join(':'))).size===m.primitiveSlots.length&&typeof m.material==='string'&&m.material.length>0&&m.material.length<=128&&typeof m.sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(m.sourceSha256)&&rgb(m.main)&&rgb(m.secondary)&&rgb(m.edge)&&range(m.brightness,-1,1)&&m.radial===1&&range(m.threshold,-1,1)&&range(m.edgeRatio,0,1);
}
/** The preview camera is orthographic; this is the unit surface-to-camera direction. */
export function limboViewDirection(yaw:number,pitch:number):[number,number,number]{
 return [Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch),Math.cos(pitch)*Math.cos(yaw)];
}
