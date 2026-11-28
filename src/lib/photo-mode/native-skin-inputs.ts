import {verifyBlob,type BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
import {surfaceGeometryBytes,decodeNativeSurfaceGeometry,reflectedSkinTangents} from './native-surface-geometry.ts';
import {decodeNormalPixels,type NativeFaceNormalIndex} from './native-face-normal.ts';
import type {RGBA} from './face-material-bake.ts';

type Body='male'|'female';
type Role='body'|'face';
export type NativeSkinMap={asset:BlobEntry;width:number;height:number;mips:number;mipByteLengths:number[];rgbaSha256:string};
export type NativeSkinMaterial={faceFlag:0|1;glossMultiplier:number;shadowTerminatorIntensity:number;specularColor:RGBA;ambientColor:RGBA;spec:NativeSkinMap;shadow:NativeSkinMap;normal?:NativeSkinMap;normalIndex?:number};
export type NativeSkinIndex={rows:readonly Record<Body,Record<Role,NativeSkinMaterial>>[];lightingParityVerified:false};
export type SurfaceBinding={asset:BlobEntry;vertices:number;channels:number;positionSha256:string;uv0Sha256:string};
export type BodyGeometry=Record<Body,SurfaceBinding>;
export type LoadedSkinMap={width:number;height:number;mipByteLengths:readonly number[];pixels:Uint8Array<ArrayBuffer>};
export type NativeSkinInputs={tangent:Float32Array;uv:Float32Array;spec:LoadedSkinMap;shadow:LoadedSkinMap;normal?:LoadedSkinMap;glossMultiplier:number;shadowTerminatorIntensity:number;specularColor:RGBA;ambientColor:RGBA};
const hash=(x:unknown)=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
function asset(e:BlobEntry){return !!e&&hash(e.sha256)&&Number.isSafeInteger(e.bytes)&&e.bytes>0&&e.bytes<=4*1024*1024}
function check(v:unknown,m:string):asserts v{if(!v)throw Error(m)}
export function validSkinMap(v:unknown,gradient=false):v is NativeSkinMap{
 if(!v||typeof v!=='object')return false;const m=v as NativeSkinMap;
 return asset(m.asset)&&hash(m.rgbaSha256)&&m.width===(gradient?1024:2048)&&m.height===(gradient?8:2048)&&m.mips===(gradient?1:12)&&Array.isArray(m.mipByteLengths)&&m.mipByteLengths.length===m.mips&&m.mipByteLengths.every((n,i)=>n===4*Math.max(1,m.width>>i)*Math.max(1,m.height>>i));
}
export function validNativeSkinIndex(v:unknown):v is NativeSkinIndex{
 if(!v||typeof v!=='object')return false;const m=v as NativeSkinIndex;
 if(m.lightingParityVerified!==false||!Array.isArray(m.rows)||m.rows.length!==30)return false;
 let faceEnabled=0,staticHeadBodyNormals=0;const unique=new Set<string>();
 try{for(const row of m.rows){for(const body of ['male','female'] as const){for(const role of ['body','face'] as const){
  const r=row[body][role];
  if(!r||r.faceFlag!==0&&r.faceFlag!==1||role==='body'&&r.faceFlag!==0||r.glossMultiplier!==0.800000011920929||!Number.isFinite(r.shadowTerminatorIntensity)||r.shadowTerminatorIntensity<0||r.shadowTerminatorIntensity>1||![r.specularColor,r.ambientColor].every(c=>Array.isArray(c)&&c.length===4&&c.every(x=>Number.isFinite(x)&&x>=0&&x<=1))||!validSkinMap(r.spec)||!validSkinMap(r.shadow,true))return false;
  if(r.normal!==undefined){if(!validSkinMap(r.normal)||r.normalIndex!==undefined)return false;if(role==='face')staticHeadBodyNormals++;unique.add(r.normal.asset.sha256)}
  else if(role!=='face'||!Number.isInteger(r.normalIndex)||r.normalIndex!<0||r.normalIndex!>7)return false;
  if(r.faceFlag===1){if(role!=='face'||r.normalIndex===undefined)return false;faceEnabled++}
  unique.add(r.spec.asset.sha256);unique.add(r.shadow.asset.sha256);
 }}}}catch{return false}
 return faceEnabled===44&&staticHeadBodyNormals===9&&unique.size===6;
}
export function validBodyGeometry(v:unknown):v is BodyGeometry{
 if(!v||typeof v!=='object')return false;const m=v as BodyGeometry;
 try{return (['male','female'] as const).every(b=>{const r=m[b];return r&&asset(r.asset)&&hash(r.positionSha256)&&hash(r.uv0Sha256)&&r.asset.bytes===surfaceGeometryBytes(r.vertices,r.channels)})}catch{return false}
}
export function skinMaterialFor(index:NativeSkinIndex|undefined,skin:number|undefined,body:Body,role:Role){return index?.rows[skin??1]?.[body]?.[role]}
export async function decodeSkinMap(raw:ArrayBuffer,m:NativeSkinMap,signal:AbortSignal):Promise<LoadedSkinMap>{
 check(validSkinMap(m,m.height===8),'Invalid native skin map');return decodeVerifiedSurfaceMap(raw,m,signal);
}
/** Shared bounded decoder; callers validate the original texture layout before using it. */
export async function decodeVerifiedSurfaceMap(raw:ArrayBuffer,m:NativeSkinMap,signal:AbortSignal):Promise<LoadedSkinMap>{
 check(raw.byteLength===m.asset.bytes&&m.mipByteLengths.length===m.mips&&m.mipByteLengths.every((n,i)=>n===4*Math.max(1,m.width>>i)*Math.max(1,m.height>>i)),'Invalid native surface map');
 const size=m.mipByteLengths.reduce((s,n)=>s+n,0),pixels=new Uint8Array(size);let offset=0;
 const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
 try{while(true){signal.throwIfAborted();const {value,done}=await reader.read();if(done)break;check(offset+value.length<=size,'Excess native skin data');pixels.set(value,offset);offset+=value.length}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 check(offset===size,'Truncated native skin data');await verifyBlob(pixels.buffer,{bytes:size,sha256:m.rgbaSha256});signal.throwIfAborted();return {width:m.width,height:m.height,mipByteLengths:m.mipByteLengths,pixels};
}
export async function loadSkinBasis(g:SurfaceBinding,positions:Float32Array,uv:Float32Array,fetchAsset:(e:BlobEntry,ext:'.wsg')=>Promise<ArrayBuffer>,signal:AbortSignal){
 check(positions.length===g.vertices*3&&uv.length===g.vertices*2,'Native skin geometry identity');
 await Promise.all([verifyBlob(new Uint8Array(positions.buffer,positions.byteOffset,positions.byteLength).slice().buffer,{bytes:positions.byteLength,sha256:g.positionSha256}),verifyBlob(new Uint8Array(uv.buffer,uv.byteOffset,uv.byteLength).slice().buffer,{bytes:uv.byteLength,sha256:g.uv0Sha256})]);
 const raw=await fetchAsset(g.asset,'.wsg');signal.throwIfAborted();return {tangent:reflectedSkinTangents(decodeNativeSurfaceGeometry(raw,g.vertices,g.channels).tangent),uv};
}
export async function loadNativeSkin(r:NativeSkinMaterial,body:Body,basis:{tangent:Float32Array;uv:Float32Array},normalIndex:NativeFaceNormalIndex,cache:Map<string,Promise<LoadedSkinMap>>,fetchAsset:(e:BlobEntry,ext:'.wsi'|'.wnt')=>Promise<ArrayBuffer>,signal:AbortSignal):Promise<NativeSkinInputs>{
 const map=(m:NativeSkinMap)=>{let p=cache.get(m.asset.sha256);if(!p){p=fetchAsset(m.asset,'.wsi').then(raw=>decodeSkinMap(raw,m,signal));cache.set(m.asset.sha256,p)}return p};
 const normal=r.normal?map(r.normal):r.faceFlag===1?undefined:(async()=>{const m=normalIndex.bodies[body][r.normalIndex!];const v=await decodeNormalPixels(await fetchAsset(m.asset,'.wnt'),m,signal);return {width:v.width,height:v.height,mipByteLengths:[v.rgba.byteLength],pixels:v.rgba}})();
 const [spec,shadow,n]=await Promise.all([map(r.spec),map(r.shadow),normal]);return {...basis,spec,shadow,normal:n,glossMultiplier:r.glossMultiplier,shadowTerminatorIntensity:r.shadowTerminatorIntensity,specularColor:r.specularColor,ambientColor:r.ambientColor};
}
