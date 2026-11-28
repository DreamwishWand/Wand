import {decodeAttachmentPart,type AttachmentPartEntry,type AttachmentNode,type LoadedAttachment} from './attachment-geometry.ts';
import {nativeHairPropertyColors,validNativeHairPalette,type NativeHairPalette,type NativeHairInputs,type NativeHairMap} from './native-hair-inputs.ts';
import {decodeVerifiedSurfaceMap,type NativeSkinMap} from './native-skin-inputs.ts';
import type {SavedAvatarAppearance} from './saved-avatar-appearance.ts';
import type {BlobEntry} from '../../../tools/photo-mode/split-loader.ts';

type Body='male'|'female';
type HairSelection={itemId:number;hairIndex:number;highlightIndex:number};
type MapEntry=NativeSkinMap&{colorSpace:0|1;sampler:readonly [1,1,0,0,0,0]};
type HairMaterial={shader:'PBR/PBR Hair';dst:0;mask:string;maps:string;normal:string};
type HairPart=AttachmentPartEntry&{material:string};
type HairVariant={extraNodes:readonly AttachmentNode[];parts:readonly HairPart[]};
export type HairAssetIndex={schema:'wand.photo-mode.hair-assets@1';gameVersion:'1.26.2';colorEncoding:'linear-shader-uniform';gpuColorConversionVerified:true;shaderParityVerified:false;secondaryMotionVerified:false;palette:NativeHairPalette;standard:Record<Body,HairSelection>;items:Record<string,Partial<Record<Body,HairVariant>>>;textures:Record<string,MapEntry>;materials:Record<string,HairMaterial>};
const slots=[5,16,17] as const;
const hash=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const int=(n:number,min:number,max:number)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const asset=(e:BlobEntry)=>!!e&&hash(e.sha256)&&int(e.bytes,1,64*1024*1024);
const validSlot=(id:number)=>int(id,50000000,59999999)&&slots.some(s=>Math.floor(id/100000)%100===s);
function validMap(m:MapEntry){return !!m&&asset(m.asset)&&hash(m.rgbaSha256)&&int(m.width,1,4096)&&int(m.height,1,4096)&&int(m.mips,1,1+Math.floor(Math.log2(Math.max(m.width,m.height))))&&[0,1].includes(m.colorSpace)&&Array.isArray(m.sampler)&&m.sampler.length===6&&m.sampler.every((x,i)=>x===[1,1,0,0,0,0][i])&&Array.isArray(m.mipByteLengths)&&m.mipByteLengths.length===m.mips&&m.mipByteLengths.every((n,i)=>n===4*Math.max(1,m.width>>i)*Math.max(1,m.height>>i))}
function validPart(p:HairPart,m:HairAssetIndex){return !!p&&asset(p.asset)&&int(p.vertices,1,65535)&&int(p.indices,3,600000)&&p.indices%3===0&&Array.isArray(p.jointPaths)&&int(p.jointPaths.length,1,256)&&new Set(p.jointPaths).size===p.jointPaths.length&&p.jointPaths.every(s=>typeof s==='string'&&s.length<=512)&&p.asset.bytes===16+72*p.vertices+4*p.indices+64*p.jointPaths.length&&Object.hasOwn(m.materials,p.material)}
export function validHairAssetIndex(x:unknown):x is HairAssetIndex{
 try{
  if(!x||typeof x!=='object')return false;const m=x as HairAssetIndex;
  if(m.schema!=='wand.photo-mode.hair-assets@1'||m.gameVersion!=='1.26.2'||m.colorEncoding!=='linear-shader-uniform'||m.gpuColorConversionVerified!==true||m.shaderParityVerified!==false||m.secondaryMotionVerified!==false||!validNativeHairPalette(m.palette))return false;
  if(!m.items||!m.materials||!m.textures||!m.standard||Object.keys(m.items).length===0||Object.keys(m.items).length>4096||Object.keys(m.materials).length>8192||Object.keys(m.textures).length>24576)return false;
  if(!Object.values(m.textures).every(validMap))return false;
  for(const v of Object.values(m.materials))if(!v||v.shader!=='PBR/PBR Hair'||v.dst!==0||![v.mask,v.maps,v.normal].every(k=>typeof k==='string'&&Object.hasOwn(m.textures,k))||m.textures[v.normal].colorSpace!==0)return false;
  for(const [id,variants] of Object.entries(m.items)){
   if(!validSlot(Number(id))||String(Number(id))!==id||!variants||Object.keys(variants).length===0||Object.keys(variants).some(k=>k!=='male'&&k!=='female'))return false;
   for(const row of Object.values(variants))if(!row||!Array.isArray(row.extraNodes)||row.extraNodes.length>256||!Array.isArray(row.parts)||!int(row.parts.length,1,64)||!row.parts.every(p=>validPart(p,m)))return false;
  }
  return (['male','female'] as const).every(b=>{const s=m.standard[b];return !!s&&Math.floor(s.itemId/100000)%100===5&&!!m.items[String(s.itemId)]?.[b]&&!!nativeHairPropertyColors(m.palette,s.hairIndex,s.highlightIndex)});
 }catch{return false}
}
/** Saved slots are explicit native ClothingItemType values, not inferred from
 * item names. Never replace an unsupported saved style with another style. */
export function hairSelections(m:HairAssetIndex,a:SavedAvatarAppearance|undefined,body:Body,mermaid=false):HairSelection[]{
 if(mermaid)return [];
 const saved=a?.avatars[body];if(!saved)return [m.standard[body]];
 const hairIndex=saved.HairColorIndex,highlightIndex=saved.HairHighlightColor;
 if(hairIndex===undefined||highlightIndex===undefined||!nativeHairPropertyColors(m.palette,hairIndex,highlightIndex))return [];
 return slots.flatMap(slot=>{const itemId=saved.Clothes?.[String(slot)];return itemId!==undefined&&validSlot(itemId)&&Math.floor(itemId/100000)%100===slot&&m.items[String(itemId)]?.[body]?[{itemId,hairIndex,highlightIndex}]:[]});
}
export function hairSelectionKey(m:HairAssetIndex,a:SavedAvatarAppearance|undefined,body:Body,mermaid=false):string{return hairSelections(m,a,body,mermaid).map(s=>[s.itemId,s.hairIndex,s.highlightIndex].join(':')).join('|')}
export async function loadHairAttachments(m:HairAssetIndex|undefined,a:SavedAvatarAppearance|undefined,body:Body,fetchAsset:(e:BlobEntry,ext:'.wha'|'.wht')=>Promise<ArrayBuffer>,signal:AbortSignal):Promise<LoadedAttachment[]>{
 if(!m)return [];
 if(!validHairAssetIndex(m))throw Error('Invalid native hair index');
 const maps=new Map<string,Promise<NativeHairMap>>();
 const getMap=(key:string)=>{const entry=m.textures[key];let pending=maps.get(key);if(!pending){pending=fetchAsset(entry.asset,'.wht').then(raw=>decodeVerifiedSurfaceMap(raw,entry,signal)).then(map=>({...map,colorSpace:entry.colorSpace}));maps.set(key,pending)}return pending};
 return Promise.all(hairSelections(m,a,body).map(async s=>{
  const row=m.items[String(s.itemId)][body]!,colors=nativeHairPropertyColors(m.palette,s.hairIndex,s.highlightIndex)!;
  const parts=await Promise.all(row.parts.map(async p=>{
   const material=m.materials[p.material];
   const [raw,mask,maps,normal]=await Promise.all([fetchAsset(p.asset,'.wha'),getMap(material.mask),getMap(material.maps),getMap(material.normal)]);signal.throwIfAborted();
   const geometry=decodeAttachmentPart(raw,p);
   const hair:Omit<NativeHairInputs,'tangent'|'uv'>={shader:material.shader,dst:material.dst,colors,mask,maps,normal};
   return {geometry,hair};
  }));
  return {extraNodes:row.extraNodes,parts};
 }));
}
