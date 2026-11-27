// Development-only reader for private split diagnostics.
export type BlobEntry = {sha256:string;bytes:number};
export type ClipEntry = BlobEntry & {sourceSha256:string;name:string};
export type Manifest = {schema:string;privateOnly:boolean;publicationAuthorized:boolean;fullPoseVerified:boolean;model:BlobEntry;clips:ClipEntry[]};
type View={buffer:number;byteOffset?:number;byteLength:number};
type Access={bufferView:number;count:number;componentType:number;type:string;byteOffset?:number};
type Animation={name:string;extras:{sourceSha256:string;fullPoseVerified:boolean};samplers:{input:number;output:number;interpolation:string}[];channels:{sampler:number;target:{node:number;path:string}}[]};
type Model={asset:{extras:{privateOnly:boolean;fullPoseVerified:boolean;splitDiagnostic:boolean}};nodes:unknown[];buffers:{byteLength:number}[];bufferViews:View[];accessors:Access[];animations?:Animation[]};
type Clip={schema:string;privateOnly:boolean;publicationAuthorized:boolean;modelSha256:string;animation:Animation;buffers:{byteLength:number}[];bufferViews:View[];accessors:Access[]};
function check(x:unknown,m:string):asserts x{if(!x)throw new Error(m)}
const validHash=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
export function validateManifest(m:Manifest){check(m.schema==='wand.private-pose-package@1'&&m.privateOnly===true&&m.publicationAuthorized===false&&m.fullPoseVerified===false,'private diagnostic manifest required');const entries=[m.model,...m.clips];check(m.clips.length>0&&m.clips.length<=1000&&entries.every(e=>validHash(e.sha256)&&Number.isSafeInteger(e.bytes)&&e.bytes>0&&e.bytes<=64*1024*1024),'invalid manifest entries');check(m.clips.every(e=>validHash(e.sourceSha256)&&typeof e.name==='string')&&new Set(m.clips.map(e=>e.sourceSha256)).size===m.clips.length,'invalid source clips');return m}
export async function verifyBlob(bytes:ArrayBuffer,entry:BlobEntry){check(bytes.byteLength===entry.bytes,'asset length mismatch');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');check(hash===entry.sha256,'asset digest mismatch');return bytes}
function decode<T>(bytes:ArrayBuffer,clip:boolean):{doc:T;bin:Uint8Array}{const v=new DataView(bytes);check(bytes.byteLength>=(clip?12:28),'truncated header');const n=v.getUint32(clip?4:12,true),start=(clip?12:20),offset=start+n+(clip?0:8);check(n>0&&n%4===0&&offset<=bytes.byteLength,'invalid metadata bounds');if(clip){check(v.getUint32(0,true)===0x31415057&&offset+v.getUint32(8,true)===bytes.byteLength,'invalid WPA header')}else{check(v.getUint32(0,true)===0x46546c67&&v.getUint32(4,true)===2&&v.getUint32(8,true)===bytes.byteLength&&v.getUint32(16,true)===0x4e4f534a&&v.getUint32(start+n+4,true)===0x004e4942&&offset+v.getUint32(start+n,true)===bytes.byteLength,'invalid GLB header')};return {doc:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes,start,n))),bin:new Uint8Array(bytes,offset)}}
function bounds(doc:{buffers:{byteLength:number}[];bufferViews:View[];accessors:Access[]},bin:Uint8Array){check(doc.buffers.length===1&&doc.buffers[0].byteLength<=bin.length&&bin.length-doc.buffers[0].byteLength<=3,'buffer size');for(const v of doc.bufferViews){const o=v.byteOffset??0;check(v.buffer===0&&Number.isSafeInteger(o)&&o>=0&&Number.isSafeInteger(v.byteLength)&&v.byteLength>=0&&o+v.byteLength<=doc.buffers[0].byteLength,'invalid view')}for(const a of doc.accessors){check(Number.isSafeInteger(a.bufferView)&&a.bufferView>=0&&a.bufferView<doc.bufferViews.length,'invalid accessor view')}}
export async function combine(modelBytes:ArrayBuffer,clipBytes:ArrayBuffer,manifest:Manifest,entry:ClipEntry):Promise<ArrayBuffer>{validateManifest(manifest);check(manifest.clips.some(e=>e.sha256===entry.sha256&&e.sourceSha256===entry.sourceSha256&&e.bytes===entry.bytes),'clip not in manifest');await Promise.all([verifyBlob(modelBytes,manifest.model),verifyBlob(clipBytes,entry)]);const {doc:m,bin:b}=decode<Model>(modelBytes,false),{doc:c,bin:a}=decode<Clip>(clipBytes,true);check(m.asset.extras.privateOnly===true&&m.asset.extras.fullPoseVerified===false&&m.asset.extras.splitDiagnostic===true&&!m.animations,'invalid base model');check(c.schema==='wand.private-pose-clip@1'&&c.privateOnly===true&&c.publicationAuthorized===false&&c.modelSha256===manifest.model.sha256&&c.animation.extras.sourceSha256===entry.sourceSha256&&c.animation.extras.fullPoseVerified===false,'incompatible clip');bounds(m,b);bounds(c,a);const vo=m.bufferViews.length,ao=m.accessors.length,bo=(b.length+3)&~3;for(const v of c.bufferViews)m.bufferViews.push({...v,byteOffset:(v.byteOffset??0)+bo});for(const x of c.accessors)m.accessors.push({...x,bufferView:x.bufferView+vo});for(const s of c.animation.samplers){check(s.interpolation==='LINEAR'&&[s.input,s.output].every(x=>Number.isSafeInteger(x)&&x>=0&&x<c.accessors.length),'invalid sampler');s.input+=ao;s.output+=ao}for(const ch of c.animation.channels)check(Number.isSafeInteger(ch.sampler)&&ch.sampler>=0&&ch.sampler<c.animation.samplers.length&&Number.isSafeInteger(ch.target.node)&&ch.target.node>=0&&ch.target.node<m.nodes.length&&['translation','rotation','scale'].includes(ch.target.path),'invalid channel');m.animations=[c.animation];const binLen=(bo+a.length+3)&~3;m.buffers[0].byteLength=bo+a.length;const js=new TextEncoder().encode(JSON.stringify(m)),n=(js.length+3)&~3,out=new ArrayBuffer(28+n+binLen),v=new DataView(out),u=new Uint8Array(out);[0x46546c67,2,out.byteLength,n,0x4e4f534a].forEach((x,i)=>v.setUint32(i*4,x,true));u.fill(32,20,20+n);u.set(js,20);v.setUint32(20+n,binLen,true);v.setUint32(24+n,0x004e4942,true);u.set(b,28+n);u.set(a,28+n+bo);return out}

export type ActorAnchor={node:number;path:string};
export type ActorEntry=BlobEntry & {sourceSha256:string};
export type ActorRoot={translation:[number,number,number];rotation:[number,number,number,number]};
export function validActorRoot(root:ActorRoot|undefined){return root===undefined||!!root&&Object.keys(root).length===2&&Array.isArray(root.translation)&&root.translation.length===3&&root.translation.every(v=>Number.isFinite(v)&&Math.abs(v)<=10)&&Array.isArray(root.rotation)&&root.rotation.length===4&&root.rotation.every(Number.isFinite)&&Math.abs(Math.hypot(...root.rotation)-1)<.001}
type SceneNode={name:string;children?:number[];mesh?:number;skin?:number;extras?:{actorId?:string}};
type SceneMesh={primitives:{attributes:Record<string,number>;indices:number;material:number}[]};
type SceneMaterial={pbrMetallicRoughness:{baseColorFactor:number[];baseColorTexture?:{index:number}}};
type SceneAnimation=Animation & {extras:Animation['extras']&{companionItemId?:number;companionClipSha256?:string;propItemId?:number;propClipSha256?:string}};
type SceneDocument=Omit<Model,'nodes'|'animations'|'asset'> & {nodes:SceneNode[];meshes:SceneMesh[];skins:{joints:number[];inverseBindMatrices:number;skeleton?:number}[];materials:SceneMaterial[];textures?:{source:number}[];images?:{bufferView:number;mimeType:string}[];scenes:{nodes:number[]}[];scene:number;animations:SceneAnimation[];asset:Model['asset'] & {extras:{companionActorDiagnostic?:boolean;attachedPairDiagnostic?:boolean;propActorDiagnostic?:boolean;attachedPropDiagnostic?:boolean;limboGeometryDiagnostic?:boolean}}};
function checkedIndex(n:number,size:number){check(Number.isSafeInteger(n)&&n>=0&&n<size,'Actor index out of range');return n}
function appendBuffer(doc:SceneDocument,bin:Uint8Array,other:SceneDocument,otherBin:Uint8Array){
  const bo=(bin.length+3)&~3,vo=doc.bufferViews.length,ao=doc.accessors.length;
  const out=new Uint8Array(bo+otherBin.length);out.set(bin);out.set(otherBin,bo);
  doc.bufferViews.push(...other.bufferViews.map(v=>({...v,byteOffset:(v.byteOffset??0)+bo})));
  doc.accessors.push(...other.accessors.map(a=>({...a,bufferView:checkedIndex(a.bufferView,other.bufferViews.length)+vo})));
  doc.buffers[0].byteLength=out.length;
  return {bin:out,accessor:(i:number)=>checkedIndex(i,other.accessors.length)+ao,view:(i:number)=>checkedIndex(i,other.bufferViews.length)+vo};
}
/** Compose the original attached actor without duplicating the player model or animation. */
export function attachCompanion(playerBytes:ArrayBuffer,actorBytes:ArrayBuffer,entry:ActorEntry,anchor:ActorAnchor,itemId:number,playerSourceSha256:string,root?:ActorRoot){
  return attachActor(playerBytes,actorBytes,entry,anchor,itemId,playerSourceSha256,'companion',root);
}
export function attachProp(playerBytes:ArrayBuffer,actorBytes:ArrayBuffer,entry:ActorEntry,anchor:ActorAnchor,itemId:number,playerSourceSha256:string){
  check(entry.sourceSha256===playerSourceSha256,'Prop animation identity');
  return attachActor(playerBytes,actorBytes,entry,anchor,itemId,playerSourceSha256,'prop');
}
async function attachActor(playerBytes:ArrayBuffer,actorBytes:ArrayBuffer,entry:ActorEntry,anchor:ActorAnchor,itemId:number,playerSourceSha256:string,kind:'companion'|'prop',root?:ActorRoot):Promise<ArrayBuffer>{
  check(validHash(entry.sourceSha256)&&validHash(playerSourceSha256)&&Number.isSafeInteger(itemId)&&itemId>0,'Invalid attached actor identity');
  await verifyBlob(actorBytes,entry);
  const {doc:p,bin:pb}=decode<SceneDocument>(playerBytes,false),{doc:a,bin:ab}=decode<SceneDocument>(actorBytes,false);
  bounds(p,pb);bounds(a,ab);
  check(p.asset.extras.privateOnly===true&&p.asset.extras.fullPoseVerified===false&&p.animations.length===1&&p.animations[0].extras.sourceSha256===playerSourceSha256&&p.animations[0].extras.companionItemId===undefined&&p.animations[0].extras.propItemId===undefined,'Invalid player scene');
  check(a.asset.extras.privateOnly===true&&a.asset.extras.fullPoseVerified===false&&(kind==='companion'?a.asset.extras.companionActorDiagnostic===true:a.asset.extras.propActorDiagnostic===true)&&a.animations.length===1&&a.animations[0].extras.sourceSha256===entry.sourceSha256&&a.animations[0].extras.fullPoseVerified===false,'Invalid companion scene');
  check(p.nodes[checkedIndex(anchor.node,p.nodes.length)].name===anchor.path&&a.scenes[a.scene]?.nodes.length===1&&a.scenes[a.scene].nodes[0]===0&&a.nodes.length>0&&a.nodes.every(n=>n.extras?.actorId===kind),'Invalid actor anchor or root');
  check(validActorRoot(root)&&(!root||kind==='companion'&&!a.animations[0].channels.some(ch=>ch.target.node===0)),'Invalid actor root override');
  const geometry=kind==='companion'&&a.asset.extras.limboGeometryDiagnostic===true;
  check(a.meshes.length>0&&a.skins.length>0&&a.materials.length>0&&(geometry?!a.images?.length&&!a.textures?.length:a.images?.length&&a.textures?.length),'Missing companion geometry or texture');
  const no=p.nodes.length,mo=p.meshes.length,so=p.skins.length,ma=p.materials.length;
  const pi=p.images??(p.images=[]),pt=p.textures??(p.textures=[]),io=pi.length,to=pt.length;
  const {bin,accessor,view}=appendBuffer(p,pb,a,ab);
  const node=(i:number)=>checkedIndex(i,a.nodes.length)+no;
  for(const im of a.images??[]){check(im.mimeType==='image/png','Unsupported companion texture');pi.push({...im,bufferView:view(im.bufferView)})}
  for(const tx of a.textures??[])pt.push({...tx,source:checkedIndex(tx.source,a.images?.length??0)+io});
  p.materials.push(...a.materials.map(m=>{const q=m.pbrMetallicRoughness,t=q.baseColorTexture;if(geometry){check(!t&&q.baseColorFactor.length===4&&q.baseColorFactor.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'Invalid diagnostic color');return m}check(t,'Missing source albedo');return {...m,pbrMetallicRoughness:{...q,baseColorTexture:{...t,index:checkedIndex(t.index,a.textures?.length??0)+to}}}}));
  p.meshes.push(...a.meshes.map(m=>({...m,primitives:m.primitives.map(q=>({...q,attributes:Object.fromEntries(Object.entries(q.attributes).map(([k,v])=>[k,accessor(v)])),indices:accessor(q.indices),material:checkedIndex(q.material,a.materials.length)+ma}))})));
  p.skins.push(...a.skins.map(s=>({...s,joints:s.joints.map(node),inverseBindMatrices:accessor(s.inverseBindMatrices),...(s.skeleton===undefined?{}:{skeleton:node(s.skeleton)})})));
  p.nodes.push(...a.nodes.map((n,i)=>({...n,...(i===0&&root?root:{}),...(n.children?{children:n.children.map(c=>{check(c>i,'Non-topological actor hierarchy');return node(c)})}:{}),...(n.mesh===undefined?{}:{mesh:checkedIndex(n.mesh,a.meshes.length)+mo}),...(n.skin===undefined?{}:{skin:checkedIndex(n.skin,a.skins.length)+so})})));
  (p.nodes[anchor.node].children??=[]).push(no);
  const target=p.animations[0],source=a.animations[0],s0=target.samplers.length;
  check(source.channels.length>0,'Missing actor animation channels');
  target.samplers.push(...source.samplers.map(s=>{check(s.interpolation==='LINEAR','Unsupported actor animation');return {...s,input:accessor(s.input),output:accessor(s.output)}}));
  target.channels.push(...source.channels.map(c=>{check(['translation','rotation','scale'].includes(c.target.path),'Unsupported actor channel');return {...c,sampler:checkedIndex(c.sampler,source.samplers.length)+s0,target:{...c.target,node:node(c.target.node)}}}));
  if(kind==='companion'){target.extras={...target.extras,companionItemId:itemId,companionClipSha256:entry.sourceSha256};p.asset.extras.attachedPairDiagnostic=true}
  else {target.extras={...target.extras,propItemId:itemId,propClipSha256:entry.sourceSha256};p.asset.extras.attachedPropDiagnostic=true}
  const js=new TextEncoder().encode(JSON.stringify(p)),n=(js.length+3)&~3,binLen=(bin.length+3)&~3,out=new ArrayBuffer(28+n+binLen),v=new DataView(out),u=new Uint8Array(out);
  [0x46546c67,2,out.byteLength,n,0x4e4f534a].forEach((x,i)=>v.setUint32(i*4,x,true));u.fill(32,20,20+n);u.set(js,20);v.setUint32(20+n,binLen,true);v.setUint32(24+n,0x004e4942,true);u.set(bin,28+n);
  return out;
}
