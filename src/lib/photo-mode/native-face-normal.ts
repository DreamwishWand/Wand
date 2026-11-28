import type {BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
import {verifyBlob} from '../../../tools/photo-mode/split-loader.ts';
import {surfaceGeometryBytes,decodeNativeSurfaceGeometry,reflectedSkinTangents} from './native-surface-geometry.ts';
import type {FaceChoices} from './face-morph.ts';
import type {HeadGeometry} from './head-geometry.ts';
type Body='male'|'female';
export type NormalMap={asset:BlobEntry;rgbaSha256:string;width:number;height:number};
type Surface={asset:BlobEntry;vertices:number;channels:number;positionSha256:string;uv0Sha256:string};
export type NativeFaceNormalIndex={bodies:Record<Body,NormalMap[]>;mask:NormalMap;geometry:Record<string,Surface>};
export type NormalPixels={width:number;height:number;rgba:Uint8Array<ArrayBuffer>};
export interface NativeFaceNormal {tangent:Float32Array;uv:Float32Array;maps:readonly [NormalPixels,NormalPixels,NormalPixels,NormalPixels,NormalPixels]}
const hash=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const asset=(x:BlobEntry)=>!!x&&hash(x.sha256)&&Number.isSafeInteger(x.bytes)&&x.bytes>0&&x.bytes<=4*1024*1024;
function check(v:unknown,m:string):asserts v{if(!v)throw Error(m)}
export function validNativeFaceNormalIndex(value:unknown,head:HeadGeometry):value is NativeFaceNormalIndex{
 if(!value||typeof value!=='object')return false;
 const m=value as NativeFaceNormalIndex;
 const map=(r:NormalMap,size:number)=>r&&asset(r.asset)&&hash(r.rgbaSha256)&&r.width===size&&r.height===size;
 if(!m.bodies||!m.geometry||!map(m.mask,1024)||!(['male','female'] as const).every(b=>Array.isArray(m.bodies[b])&&m.bodies[b].length===8&&m.bodies[b].every(r=>map(r,2048))&&new Set(m.bodies[b].map(r=>r.asset.sha256)).size===8))return false;
 const skulls=Object.values(head.heads).flat().map(r=>r.parts.skull);
 if(Object.keys(m.geometry).length!==new Set(skulls.map(p=>p.asset.sha256)).size)return false;
 try{return skulls.every(p=>{const s=m.geometry[p.asset.sha256];return s&&s.vertices===p.vertices&&asset(s.asset)&&hash(s.positionSha256)&&hash(s.uv0Sha256)&&s.asset.bytes===surfaceGeometryBytes(s.vertices,s.channels)})}catch{return false}
}
export function selectedNormalMaps(index:NativeFaceNormalIndex,body:Body,eyes:number,face:FaceChoices=[0,0,0]){
 const choices=[eyes,...face];check(choices.length===4&&choices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<8),'Invalid native face selections');
 return [...choices.map(i=>index.bodies[body][i]),index.mask] as [NormalMap,NormalMap,NormalMap,NormalMap,NormalMap]
}
/** Decode exactly the bounded original RGBA channel data, without browser
 * color management or alpha premultiplication. Do not convert it to ImageBitmap. */
export async function decodeNormalPixels(raw:ArrayBuffer,map:NormalMap,signal:AbortSignal):Promise<NormalPixels>{
 const size=map.width*map.height*4;check((map.width===2048||map.width===1024)&&map.height===map.width&&raw.byteLength===map.asset.bytes,'Invalid normal map layout');
 const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
 const rgba=new Uint8Array(size);let offset=0;
 try{while(true){signal.throwIfAborted();const {value,done}=await reader.read();if(done)break;check(offset+value.length<=size,'Excess normal data');rgba.set(value,offset);offset+=value.length}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 check(offset===size,'Truncated normal data');await verifyBlob(rgba.buffer,{bytes:size,sha256:map.rgbaSha256});signal.throwIfAborted();return {width:map.width,height:map.height,rgba}
}
export async function prepareNativeFaceNormal(index:NativeFaceNormalIndex,body:Body,eyes:number,face:FaceChoices|undefined,headSha:string,positions:Float32Array,uv:Float32Array,fetchAsset:(e:BlobEntry,ext:'.wsg'|'.wnt')=>Promise<ArrayBuffer>,signal:AbortSignal):Promise<NativeFaceNormal>{
 const g=index.geometry[headSha];check(g&&positions.length===g.vertices*3&&uv.length===g.vertices*2,'Native skull geometry identity');
 await Promise.all([verifyBlob(new Uint8Array(positions.buffer,positions.byteOffset,positions.byteLength).slice().buffer,{bytes:positions.byteLength,sha256:g.positionSha256}),verifyBlob(new Uint8Array(uv.buffer,uv.byteOffset,uv.byteLength).slice().buffer,{bytes:uv.byteLength,sha256:g.uv0Sha256})]);
 const cache=new Map<string,Promise<NormalPixels>>();
 const maps=selectedNormalMaps(index,body,eyes,face).map(m=>{let p=cache.get(m.asset.sha256);if(!p){p=fetchAsset(m.asset,'.wnt').then(raw=>decodeNormalPixels(raw,m,signal));cache.set(m.asset.sha256,p)}return p});
 const [raw,...decoded]=await Promise.all([fetchAsset(g.asset,'.wsg'),...maps]);
 signal.throwIfAborted();const geometry=decodeNativeSurfaceGeometry(raw,g.vertices,g.channels);
 return {tangent:reflectedSkinTangents(geometry.tangent),uv,maps:decoded as unknown as NativeFaceNormal['maps']}
}
