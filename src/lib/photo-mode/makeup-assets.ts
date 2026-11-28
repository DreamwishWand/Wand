import type {SavedAvatarAppearance} from './saved-avatar-appearance.ts';
import {verifyBlob,type BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
import {resolveNativeMakeupLayers,NATIVE_MAKEUP_ORDER,type NativeMakeupLayer,type NativeMakeupSelection,type NativeMakeupDefinition,type MakeupColor32} from './native-makeup.ts';

type Body='male'|'female';
type Definition=NativeMakeupDefinition&{defaultOpacity:number;defaultGloss:number};
export type MakeupMask={width:number;height:number;mips:number;colorSpace:0|1;rgbaSha256:string;mipByteLengths:number[];asset:BlobEntry};
export type MakeupIndex={palette:readonly MakeupColor32[];items:Readonly<Record<string,Definition>>;textures:Readonly<Record<string,MakeupMask>>;shaderParityVerified:false};
export type LoadedMakeupLayer=NativeMakeupLayer&{texture:MakeupMask;pixels:Uint8Array<ArrayBuffer>};
function object(v:unknown):v is Record<string,unknown>{return v!==null&&typeof v==='object'&&!Array.isArray(v)}
const hash=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const guid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{32}$/.test(v);
function check(v:unknown,m:string):asserts v{if(!v)throw Error(m)}
function validMask(x:unknown):x is MakeupMask{
 if(!object(x)||!object(x.asset)||!hash(x.asset.sha256)||!Number.isSafeInteger(x.asset.bytes)||Number(x.asset.bytes)<=0||Number(x.asset.bytes)>512*1024||!hash(x.rgbaSha256))return false;
 if((x.width!==1024&&x.width!==2048)||x.height!==x.width||(x.mips!==1&&x.mips!==11)||(x.colorSpace!==0&&x.colorSpace!==1)||!Array.isArray(x.mipByteLengths)||x.mipByteLengths.length!==x.mips)return false;
 return x.mipByteLengths.every((n,i)=>n===4*Math.max(1,Number(x.width)>>i)*Math.max(1,Number(x.height)>>i));
}
export function validMakeupIndex(x:unknown):x is MakeupIndex{
 if(!object(x)||x.shaderParityVerified!==false||!Array.isArray(x.palette)||x.palette.length!==75||!x.palette.every(c=>Array.isArray(c)&&c.length===4&&c.every(v=>Number.isInteger(v)&&v>=0&&v<=255))||!object(x.items)||!object(x.textures))return false;
 const items=Object.entries(x.items),textures=Object.entries(x.textures);
 if(items.length!==69||textures.length!==128||!textures.every(([g,t])=>guid(g)&&validMask(t)))return false;
 const targets=new Set<string>();let sentinelCount=0;const types=new Map<number,number>();
 for(const [id,r] of items){
  if(!/^14[0-9]{7}$/.test(id)||!object(r)||r.subtype!==Math.floor(Number(id)/100000)%100||!object(r.masks)||Object.keys(r.masks).length!==2||!guid(r.masks.male)||!guid(r.masks.female)||!Array.isArray(r.defaultColorIndices)||r.defaultColorIndices.length!==3||!r.defaultColorIndices.every(v=>Number.isInteger(v)&&v>=-1&&v<75)||![r.defaultOpacity,r.defaultGloss].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1))return false;
  const t=r.subtype as number;types.set(t,(types.get(t)??0)+1);
  sentinelCount+=r.defaultColorIndices.filter(v=>v===-1).length;
  targets.add(r.masks.male as string);targets.add(r.masks.female as string);
 }
 return sentinelCount===77&&types.size===8&&[[1,14],[2,3],[3,10],[4,3],[5,26],[6,6],[7,4],[10,3]].every(([k,n])=>types.get(k)===n)&&targets.size===128&&textures.every(([g])=>targets.has(g));
}
/** Only the explicitly observed local save branch. No cross-form fallback.
 * Missing protobuf scalars have their wire defaults, not an invented cosmetic. */
export function savedMakeupSelections(appearance:SavedAvatarAppearance|undefined,body:Body,mermaid:boolean):Readonly<Record<string,NativeMakeupSelection>>{
 const branch=mermaid?(body==='male'?'maleMermaid':'femaleMermaid'):body;
 const saved=appearance?.avatars[branch]?.Makeup;
 const out:Record<string,NativeMakeupSelection>=Object.create(null);
 if(!saved)return out;
 for(const subtype of NATIVE_MAKEUP_ORDER){
  const row=saved[String(subtype)];if(!row||!row.MakeupItemID)continue;
  out[subtype]={itemId:row.MakeupItemID,colorIndices:[row.ColorIndex1??0,row.ColorIndex2??0,row.ColorIndex3??0],opacity:row.Opacity??0,gloss:row.Gloss??0};
 }
 return out;
}
export function savedMakeupKey(a:SavedAvatarAppearance|undefined,body:Body,mermaid:boolean){return JSON.stringify(savedMakeupSelections(a,body,mermaid))}
export async function decodeMakeupPixels(raw:ArrayBuffer,m:MakeupMask,signal:AbortSignal){
 check(validMask(m)&&raw.byteLength===m.asset.bytes,'Invalid makeup mask');
 const size=m.mipByteLengths.reduce((s,n)=>s+n,0);
 const pixels=new Uint8Array(size);let offset=0;
 const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
 try{while(true){signal.throwIfAborted();const {value,done}=await reader.read();if(done)break;check(offset+value.length<=size,'Excess makeup data');pixels.set(value,offset);offset+=value.length}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 check(offset===size,'Truncated makeup data');await verifyBlob(pixels.buffer,{bytes:size,sha256:m.rgbaSha256});signal.throwIfAborted();return pixels;
}
/** Load only worn masks, in the native order; reuse one decoded asset for
 * multiple layers and never transmit local save data. */
export async function loadNativeMakeup(index:MakeupIndex,body:Body,selections:Readonly<Record<string,NativeMakeupSelection>>,fetchAsset:(entry:BlobEntry)=>Promise<ArrayBuffer>,signal:AbortSignal):Promise<LoadedMakeupLayer[]>{
 const layers=resolveNativeMakeupLayers(body,index.palette,index.items,selections);
 const cache=new Map<string,Uint8Array<ArrayBuffer>>(),out:LoadedMakeupLayer[]=[];
 for(const layer of layers){
  signal.throwIfAborted();const texture=index.textures[layer.mask];check(texture,'Missing native makeup mask');
  let pixels=cache.get(texture.asset.sha256);
  if(!pixels){const raw=await fetchAsset(texture.asset);await verifyBlob(raw,texture.asset);pixels=await decodeMakeupPixels(raw,texture,signal);cache.set(texture.asset.sha256,pixels)}
  out.push({...layer,texture,pixels});
 }
 return out;
}
