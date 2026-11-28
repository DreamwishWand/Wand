import type {BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
import type {RigNode,RigSkin} from './rig-sampler.ts';
import type {NativeHairInputs} from './native-hair-inputs.ts';
import type {PosePrimitive} from './scene-session.ts';
export type AttachmentNode=Omit<RigNode,'parent'>&{path:string;parentPath:string};
export type AttachmentPartEntry={asset:BlobEntry;vertices:number;indices:number;jointPaths:string[]};
export type AttachmentGeometry=Pick<PosePrimitive,'positions'|'normals'|'uv'|'joints'|'weights'|'indices'>&{tangent:Float32Array;inverseBind:Float32Array;jointPaths:readonly string[]};
export type LoadedAttachment={extraNodes:readonly AttachmentNode[];parts:readonly {geometry:AttachmentGeometry;hair:Omit<NativeHairInputs,'tangent'|'uv'>}[]};
const int=(v:number,min:number,max:number)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const pathValid=(s:unknown):s is string=>typeof s==='string'&&s.length<=512&&(s==='body'||s==='root'||s.startsWith('root/'));
/** Source mesh data in existing reflected-X avatar coordinates, little-endian.
 * Verify the content hash before calling, using the shared asset loader. */
export function decodeAttachmentPart(raw:ArrayBuffer,p:AttachmentPartEntry):AttachmentGeometry{
 const n=p.vertices,ic=p.indices,jc=p.jointPaths.length;
 if(!int(n,1,65535)||!int(ic,3,600000)||ic%3!==0||!int(jc,1,256)||new Set(p.jointPaths).size!==jc||!p.jointPaths.every(pathValid)||raw.byteLength!==p.asset.bytes||raw.byteLength!==16+72*n+4*ic+64*jc)throw Error('Invalid attachment geometry size');
 const v=new DataView(raw);
 if(v.getUint32(0,true)!==0x31414857||v.getUint32(4,true)!==n||v.getUint32(8,true)!==ic||v.getUint32(12,true)!==jc)throw Error('Invalid attachment geometry header');
 let off=16;
 const floats=(count:number)=>{const a=new Float32Array(count);for(let i=0;i<count;i++,off+=4)a[i]=v.getFloat32(off,true);if(!a.every(Number.isFinite))throw Error('Nonfinite attachment geometry');return a};
 const positions=floats(n*3),normals=floats(n*3),uv=floats(n*2),tangent=floats(n*4);
 const joints=new Uint16Array(n*4);for(let i=0;i<joints.length;i++,off+=2)joints[i]=v.getUint16(off,true);
 const weights=floats(n*4),indices=new Uint32Array(ic);for(let i=0;i<ic;i++,off+=4)indices[i]=v.getUint32(off,true);
 const inverseBind=floats(jc*16);
 if(off!==raw.byteLength||!joints.every(j=>j<jc)||!indices.every(j=>j<n)||!weights.every(w=>w>=0)||!tangent.every((x,i)=>i%4!==3||Math.abs(Math.abs(x)-1)<1e-6))throw Error('Invalid attachment geometry values');
 for(let i=0;i<n;i++){const k=i*4;if(Math.abs(weights[k]+weights[k+1]+weights[k+2]+weights[k+3]-1)>1e-5)throw Error('Invalid attachment weights')}
 return {positions,normals,uv,tangent,joints,weights,indices,inverseBind,jointPaths:p.jointPaths};
}
const near=(a:readonly number[],b:readonly number[])=>a.length===b.length&&a.every((x,i)=>Math.abs(x-b[i])<=1e-6);
/** Extend the actual player rig before creating the sampler. Companion/prop
 * paths are excluded, and additional hair bones retain source-local TRS.
 * The existing avatar motion and facial override track indices do not change. */
export function bindAttachments(nodes:RigNode[],skins:RigSkin[],playerPaths:(string|undefined)[],attachments:readonly LoadedAttachment[]):PosePrimitive[]{
 if(nodes.length!==playerPaths.length)throw Error('Invalid player path table');
 const paths=new Map<string,number[]>();playerPaths.forEach((p,i)=>{if(p!==undefined){const list=paths.get(p)??[];list.push(i);paths.set(p,list)}});
 const get=(path:string)=>{const ids=paths.get(path);if(ids?.length!==1)throw Error('Missing or ambiguous attachment joint: '+path);return ids[0]};
 const out:PosePrimitive[]=[];
 for(const a of attachments){
  for(const n of a.extraNodes){
   if(!pathValid(n.path)||n.path==='root'||n.path==='body'||!pathValid(n.parentPath)||n.path.slice(0,n.path.lastIndexOf('/'))!==n.parentPath||n.translation.length!==3||n.rotation.length!==4||n.scale.length!==3||![...n.translation,...n.rotation,...n.scale].every(Number.isFinite)||Math.abs(Math.hypot(...n.rotation)-1)>.001)throw Error('Invalid attachment bone');
   const parent=get(n.parentPath);
   if(paths.has(n.path)){const current=nodes[get(n.path)];if(current.parent!==parent||!near(current.translation,n.translation)||!near(current.rotation,n.rotation)||!near(current.scale,n.scale))throw Error('Conflicting attachment bone');continue}
   paths.set(n.path,[nodes.length]);playerPaths.push(n.path);nodes.push({parent,translation:n.translation,rotation:n.rotation,scale:n.scale});
  }
  for(const p of a.parts){
   const {jointPaths,inverseBind,tangent,...geometry}=p.geometry;
   const skin=skins.length;skins.push({joints:jointPaths.map(get),inverseBind});
   out.push({...geometry,skin,actorId:'player',color:[1,1,1,1],nativeHair:{...p.hair,tangent,uv:geometry.uv}});
  }
 }
 return out;
}
