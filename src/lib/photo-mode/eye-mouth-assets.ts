import {decodeVerifiedSurfaceMap,type NativeSkinMap,type LoadedSkinMap,type SurfaceBinding} from './native-skin-inputs.ts';
import type {HeadGeometry,EyeShadowGeometry} from './head-geometry.ts';
import {surfaceGeometryBytes,decodeNativeSurfaceGeometry} from './native-surface-geometry.ts';
import type {EyePalette,EyeSelection} from './eye-palette.ts';
import {verifyBlob,type BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
import {packNativeEyeColor,type EyeRGBA} from './native-eye-surface.ts';

export type EyeMouthMap=NativeSkinMap&{colorSpace:0|1};
export type NativeEyeParams={maxHorizontalAngle:number;reflectionStrength:number;specFalloff:number;specSize:number;verticalShift:number};
export type EyeMouthIndex={eyes:Record<string,EyeMouthMap>;eyeParams:NativeEyeParams;teeth:{normal:EyeMouthMap;diffuse:EyeMouthMap;spec:EyeMouthMap};eyelashColor:EyeRGBA;lightingParityVerified:false};
export type LoadedHeadMap=LoadedSkinMap&{colorSpace:0|1};
export type NativeEyeMaterial={mask:LoadedHeadMap;colors:EyeSelection['colors'];params:NativeEyeParams;packed?:Float32Array;shadow?:true};
export type NativeTeethMaterial={diffuse:LoadedHeadMap;normal:LoadedHeadMap;spec:LoadedHeadMap;tangent:Float32Array;uv:Float32Array};
export type TeethGeometry=Record<string,SurfaceBinding>;
export function validTeethGeometry(x:unknown,h:HeadGeometry):x is TeethGeometry{
 if(!x||typeof x!=='object')return false;const g=x as TeethGeometry;const parts=Object.values(h.heads).flat().flatMap(r=>[r.parts.teeth_upper,r.parts.teeth_lower]);
 try{return Object.keys(g).length===new Set(parts.map(p=>p.asset.sha256)).size&&parts.every(p=>{const r=g[p.asset.sha256];return r&&r.vertices===p.vertices&&hash(r.asset.sha256)&&hash(r.positionSha256)&&hash(r.uv0Sha256)&&r.asset.bytes===surfaceGeometryBytes(r.vertices,r.channels)})}catch{return false}
}
const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function validEyeMouthMap(x:unknown):x is EyeMouthMap{
 if(!x||typeof x!=='object')return false;const m=x as EyeMouthMap;
 return !!m.asset&&hash(m.asset.sha256)&&Number.isSafeInteger(m.asset.bytes)&&m.asset.bytes>0&&m.asset.bytes<=2*1024*1024&&hash(m.rgbaSha256)&&m.width===512&&m.height===512&&m.mips===10&&(m.colorSpace===0||m.colorSpace===1)&&Array.isArray(m.mipByteLengths)&&m.mipByteLengths.length===10&&m.mipByteLengths.every((n,i)=>n===4*Math.max(1,512>>i)**2);
}
export function validEyeMouthIndex(x:unknown,p:EyePalette):x is EyeMouthIndex{
 if(!x||typeof x!=='object')return false;const v=x as EyeMouthIndex;
 if(v.lightingParityVerified!==false||!v.eyes||!v.teeth||!v.eyeParams||Object.keys(v.eyes).length!==12)return false;
 const keys=Object.values(p.items).map(r=>r.texture.sha256);
 if(!keys.every(k=>validEyeMouthMap(v.eyes[k])&&v.eyes[k].colorSpace===1))return false;
 const q=v.eyeParams;if(q.maxHorizontalAngle!==0.800000011920929||q.reflectionStrength!==0.12999999523162842||q.specFalloff!==200||q.specSize!==0.004999999888241291||q.verticalShift!==0.20000000298023224)return false;
 if(!Array.isArray(v.eyelashColor)||v.eyelashColor.length!==4||v.eyelashColor.some((n,i)=>n!==(i===3?1:0)))return false;
 const {normal,diffuse,spec}=v.teeth;
 if(!validEyeMouthMap(normal)||!validEyeMouthMap(diffuse)||!validEyeMouthMap(spec)||normal.colorSpace!==0)return false;
 return new Set([...Object.values(v.eyes),normal,diffuse,spec].map(r=>r.asset.sha256)).size===15;
}
export async function loadHeadMap(m:EyeMouthMap,cache:Map<string,Promise<LoadedHeadMap>>,fetchAsset:(e:BlobEntry)=>Promise<ArrayBuffer>,signal:AbortSignal){
 if(!validEyeMouthMap(m))throw Error('Invalid native head map');let p=cache.get(m.asset.sha256);
 if(!p){p=fetchAsset(m.asset).then(raw=>decodeVerifiedSurfaceMap(raw,m,signal)).then(v=>({...v,colorSpace:m.colorSpace}));cache.set(m.asset.sha256,p)}
 return p;
}

export type NativeEyeGeometry=Record<string,SurfaceBinding>;
export function validNativeEyeGeometry(x:unknown,h:HeadGeometry,s:EyeShadowGeometry):x is NativeEyeGeometry{
 if(!x||typeof x!=='object')return false;const g=x as NativeEyeGeometry;const parts=[...Object.values(h.heads).flat().map(r=>r.parts.eyes),...Object.values(s).flat()];
 try{return Object.keys(g).length===new Set(parts.map(p=>p.asset.sha256)).size&&parts.every(p=>{const r=g[p.asset.sha256];return r&&r.vertices===p.vertices&&hash(r.asset.sha256)&&hash(r.positionSha256)&&hash(r.uv0Sha256)&&(r.channels&8)!==0&&r.asset.bytes===surfaceGeometryBytes(r.vertices,r.channels)})}catch{return false}
}
export async function loadEyePacked(g:SurfaceBinding,positions:Float32Array,uv:Float32Array,fetchAsset:(e:BlobEntry)=>Promise<ArrayBuffer>,signal:AbortSignal){
 if(!g||positions.length!==g.vertices*3||uv.length!==g.vertices*2)throw Error('Invalid native eye geometry');
 await Promise.all([verifyBlob(new Uint8Array(positions.buffer,positions.byteOffset,positions.byteLength).slice().buffer,{bytes:positions.byteLength,sha256:g.positionSha256}),verifyBlob(new Uint8Array(uv.buffer,uv.byteOffset,uv.byteLength).slice().buffer,{bytes:uv.byteLength,sha256:g.uv0Sha256})]);
 const raw=await fetchAsset(g.asset);signal.throwIfAborted();const colors=decodeNativeSurfaceGeometry(raw,g.vertices,g.channels).color;
 if(!colors)throw Error('Missing original eye vertex colors');return packNativeEyeColor(colors);
}
