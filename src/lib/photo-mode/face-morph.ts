import type {SavedAvatarAppearance} from './saved-avatar-appearance.ts';
import type {BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
export type FaceChoices=readonly [number,number,number];
export type FaceMorphEntry={vertices:number;asset:BlobEntry};
export type FaceMorphs=Readonly<Record<'male'|'female',FaceMorphEntry>>;
export function validFaceMorphs(x:unknown):x is FaceMorphs{
 if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==2)return false;
 const rows=x as Record<string,FaceMorphEntry>;
 return ['male','female'].every(b=>{const r=rows[b];return r&&Number.isSafeInteger(r.vertices)&&r.vertices>0&&r.vertices<=100000&&r.asset&&/^[0-9a-f]{64}$/.test(r.asset.sha256)&&Number.isSafeInteger(r.asset.bytes)&&r.asset.bytes>=92&&r.asset.bytes<=2*1024*1024})
}
/** Native FacePartType: Eyes=0, Nose=1, Mouth=2, Jaw=3. Eye mesh replacement is not included. */
export function savedFaceChoices(appearance:SavedAvatarAppearance|undefined,body:'male'|'female',mermaid:boolean):FaceChoices{
 const branch=mermaid?(body==='male'?'maleMermaid':'femaleMermaid'):body;
 const face=appearance?.avatars[branch]?.FaceType;
 const choice=(key:string)=>{const v=face?.[key];return typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=7?v:0};
 return [choice('1'),choice('2'),choice('3')]
}
export function hasFaceMorph(choices:FaceChoices){return choices.some(x=>x!==0)}
/** Static position-only source blend frames are weighted offline with the native configuration.
 * Work on a copy; cached model bytes and other primitives must not be mutated. */
export function applyFaceMorphs(raw:ArrayBuffer,positions:Float32Array,choices:FaceChoices):Float32Array{
 const view=new DataView(raw);const fail=()=>{throw new Error('Invalid face morph asset')};
 if(view.byteLength<8||view.getUint32(0,true)!==0x314d4657||positions.length%3!==0||view.getUint32(4,true)!==positions.length/3||positions.length/3>100000||!choices.every(x=>Number.isInteger(x)&&x>=0&&x<=7))fail();
 const count=positions.length/3;let offset=8;const out=positions.slice();
 for(let role=0;role<3;role++)for(let i=1;i<=7;i++){
  if(offset+4>view.byteLength)fail();const n=view.getUint32(offset,true);offset+=4;
  if(n>count||offset+16*n>view.byteLength)fail();
  const seen=new Set<number>();
  for(let j=0;j<n;j++,offset+=16){
   const index=view.getUint32(offset,true);if(index>=count||seen.has(index))fail();seen.add(index);
   for(let k=0;k<3;k++){const delta=view.getFloat32(offset+4+k*4,true);if(!Number.isFinite(delta))fail();if(choices[role]===i){const p=3*index+k;out[p]+=delta;if(!Number.isFinite(out[p]))fail()}}
  }
 }
 if(offset!==view.byteLength)fail();
 return out
}
