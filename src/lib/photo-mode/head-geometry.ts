import type {SavedAvatarAppearance} from './saved-avatar-appearance.ts';
import type {BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
import type {FaceMorphEntry} from './face-morph.ts';
export const headRoles=['skull','eyes','eyelash','teeth_lower','teeth_upper'] as const;
export type HeadRole=typeof headRoles[number];
type Body='male'|'female';
type HeadPart={vertices:number;indices:number;jointPaths:string[];asset:BlobEntry};
type HeadRow={parts:Record<HeadRole,HeadPart>;morph:FaceMorphEntry};
type Target={body:Body;index:number;slots:Record<HeadRole,{mesh:number;primitive:number}>};
export type HeadGeometry={heads:Record<Body,HeadRow[]>;targets:Record<string,Target>};
export type HeadReplacement={mesh:number;primitive:number;jointPaths:string[];inverseBind:Float32Array;positions:Float32Array;normals:Float32Array;uv:Float32Array;joints:Uint16Array;weights:Float32Array;indices:Uint16Array};
const int=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const hash=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const asset=(v:BlobEntry)=>v&&hash(v.sha256)&&int(v.bytes,1,4*1024*1024);
const exact=(o:unknown,keys:readonly string[])=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
export function validHeadGeometry(x:unknown,modelKeys:readonly string[]):x is HeadGeometry{
 if(!exact(x,['heads','targets']))return false;
 const g=x as HeadGeometry;if(!exact(g.heads,['male','female'])||!exact(g.targets,modelKeys))return false;
 for(const b of ['male','female'] as const){const rows=g.heads[b];if(!Array.isArray(rows)||rows.length!==8)return false;
  for(const row of rows){if(!row||!exact(row.parts,headRoles)||!row.morph||!asset(row.morph.asset)||row.morph.vertices!==row.parts.skull.vertices)return false;
   for(const p of Object.values(row.parts)){if(!p||!int(p.vertices,1,100000)||!int(p.indices,3,600000)||p.indices%3||!Array.isArray(p.jointPaths)||!int(p.jointPaths.length,1,256)||new Set(p.jointPaths).size!==p.jointPaths.length||!p.jointPaths.every(s=>typeof s==='string'&&s.startsWith('root/')&&s.length<=512)||!asset(p.asset)||p.asset.bytes!==16+56*p.vertices+2*p.indices+64*p.jointPaths.length)return false}
  }
 }
 for(const t of Object.values(g.targets)){if(!t||!['male','female'].includes(t.body)||!int(t.index,0,7)||!exact(t.slots,headRoles)||!Object.values(t.slots).every(s=>s&&int(s.mesh,0,100000)&&int(s.primitive,0,100000))||new Set(Object.values(t.slots).map(s=>s.mesh+':'+s.primitive)).size!==5)return false}
 return true
}
export function savedHeadIndex(appearance:SavedAvatarAppearance|undefined,body:Body,mermaid:boolean):number|undefined{
 const branch=mermaid?(body==='male'?'maleMermaid':'femaleMermaid'):body;
 const i=appearance?.avatars[branch]?.FaceType?.['0'];return int(i,0,7)?i:undefined
}
export function selectHead(g:HeadGeometry|undefined,key:string|undefined,body:Body,i:number|undefined){
 if(!g||!key||i===undefined)return;
 const t=g.targets[key];if(!t||t.body!==body||t.index===i)return;
 return {target:t,row:g.heads[body][i]}
}
export function decodeHeadPart(raw:ArrayBuffer,p:HeadPart,slot:Target['slots'][HeadRole]):HeadReplacement{
 const check=(v:unknown)=>{if(!v)throw new Error('Invalid head geometry')};
 const n=p.vertices,ic=p.indices,jc=p.jointPaths.length,v=new DataView(raw);check(raw.byteLength===p.asset.bytes&&raw.byteLength>=16&&raw.byteLength===16+56*n+2*ic+64*jc&&v.getUint32(0,true)===0x31474857&&v.getUint32(4,true)===n&&v.getUint32(8,true)===ic&&v.getUint32(12,true)===jc);
 let off=16;const floats=(count:number)=>{const end=off+4*count,a=new Float32Array(raw.slice(off,end));off=end;check(a.length===count&&a.every(Number.isFinite));return a};
 const shorts=(count:number)=>{const end=off+2*count,a=new Uint16Array(raw.slice(off,end));off=end;check(a.length===count);return a};
 const positions=floats(3*n),normals=floats(3*n),uv=floats(2*n),joints=shorts(4*n),weights=floats(4*n),indices=shorts(ic),inverseBind=floats(16*jc);
 check(off===raw.byteLength&&joints.every(j=>j<jc)&&indices.every(i=>i<n)&&weights.every(w=>w>=0));
 for(let i=0;i<weights.length;i+=4)check(Math.abs(weights[i]+weights[i+1]+weights[i+2]+weights[i+3]-1)<1e-5);
 return {...slot,jointPaths:p.jointPaths,inverseBind,positions,normals,uv,joints,weights,indices}
}
