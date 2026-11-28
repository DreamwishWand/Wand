import type {SavedAvatarAppearance} from './saved-avatar-appearance.ts';
import type {BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
type Body='male'|'female';
export type BodyMorphEntry={vertices:number;asset:BlobEntry};
export type BodyMorphs=Readonly<Record<Body,BodyMorphEntry>>;
const validChoice=(x:unknown):x is number=>typeof x==='number'&&Number.isInteger(x)&&x>=0&&x<=5;
export function savedBodyType(appearance:SavedAvatarAppearance|undefined,body:Body,mermaid:boolean):number|undefined{
 if(mermaid)return;
 const v=appearance?.avatars[body]?.BodyType;return validChoice(v)?v:undefined
}
export function validBodyMorphs(x:unknown):x is BodyMorphs{
 if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==2)return false;
 const m=x as BodyMorphs;return (['male','female'] as const).every(b=>{const r=m[b];return !!r&&Number.isSafeInteger(r.vertices)&&r.vertices>0&&r.vertices<=100000&&!!r.asset&&/^[a-f0-9]{64}$/.test(r.asset.sha256)&&Number.isSafeInteger(r.asset.bytes)&&r.asset.bytes>=28&&r.asset.bytes<=2*1024*1024})
}
/** Native configured land body position deltas; clothing and normal maps are not altered. */
export function applyBodyMorph(raw:ArrayBuffer,positions:Float32Array,choice:number):Float32Array{
 const v=new DataView(raw),n=positions.length/3;
 const fail=()=>{throw new Error('Invalid body morph asset')};
 if(!validChoice(choice)||!Number.isInteger(n)||n<1||n>100000||v.byteLength<8||v.getUint32(0,true)!==0x314d4257||v.getUint32(4,true)!==n)fail();
 let off=8;const out=positions.slice();
 for(let frame=1;frame<=5;frame++){
  if(off+4>v.byteLength)fail();const count=v.getUint32(off,true);off+=4;if(count<1||count>n||off+16*count>v.byteLength)fail();
  const seen=new Set<number>();
  for(let j=0;j<count;j++,off+=16){const i=v.getUint32(off,true);if(i>=n||seen.has(i))fail();seen.add(i);
   for(let k=0;k<3;k++){const d=v.getFloat32(off+4+4*k,true);if(!Number.isFinite(d))fail();if(frame===choice){const p=3*i+k;out[p]+=d;if(!Number.isFinite(out[p]))fail()}}
  }
 }
 if(off!==v.byteLength)fail();return out
}
