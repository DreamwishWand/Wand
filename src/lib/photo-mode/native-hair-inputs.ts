import type {RGBA} from './face-material-bake.ts';
import type {LoadedSkinMap} from './native-skin-inputs.ts';
import type {NativeHairColors} from './native-hair-surface.ts';

/** Raw, array-indexed source palette. The display order is not a save index. */
export interface NativeHairPalette {
 readonly base:readonly {index:number;displayOrder:number;baseColor:RGBA;firstColor:RGBA;secondColor:RGBA}[];
 readonly highlight:readonly {index:number;displayOrder:number;baseColor:RGBA}[];
}
function rgba(x:unknown):x is RGBA{return Array.isArray(x)&&x.length===4&&x.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)}
export function validNativeHairPalette(value:unknown):value is NativeHairPalette{
 if(!value||typeof value!=='object')return false;
 const p=value as NativeHairPalette;
 if(!Array.isArray(p.base)||!Array.isArray(p.highlight)||p.base.length===0||p.highlight.length===0||p.base.length>4096||p.highlight.length>4096)return false;
 const order=(rows:readonly {index:number;displayOrder:number}[])=>rows.every((r,i)=>r&&r.index===i&&Number.isSafeInteger(r.displayOrder)&&r.displayOrder>=0&&r.displayOrder<rows.length)&&new Set(rows.map(r=>r.displayOrder)).size===rows.length;
 return order(p.base)&&order(p.highlight)&&p.base.every(r=>rgba(r.baseColor)&&rgba(r.firstColor)&&rgba(r.secondColor))&&p.highlight.every(r=>rgba(r.baseColor));
}
/** AvatarHairColorConfig.GetPropertyBlock, Steam 1.26.2 RVA 0x1315d90.
 * GameAssembly SHA256 a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653.
 * IL2CPP SetColor arguments in order: BaseColor, ColorThree, ColorTwo, ColorOne.
 * Highlight alpha overwritten by (highlight index != 0).
 * This function intentionally returns the raw SetColor inputs, NOT GPU uniforms. */
export function nativeHairPropertyColors(p:NativeHairPalette,hairIndex:number,highlightIndex:number):NativeHairColors|undefined{
 if(!validNativeHairPalette(p)||!Number.isSafeInteger(hairIndex)||!Number.isSafeInteger(highlightIndex)||hairIndex<0||highlightIndex<0)return undefined;
 const b=p.base[hairIndex],h=p.highlight[highlightIndex];
 if(!b||!h)return undefined;
 return {base:b.baseColor,three:b.firstColor,two:b.secondColor,one:[h.baseColor[0],h.baseColor[1],h.baseColor[2],highlightIndex===0?0:1]};
}
export type NativeHairMap=LoadedSkinMap&{readonly colorSpace:0|1};
/** Opaque PBR/PBR Hair only. The caller must supply source-verified sampling
 * metadata and already converted linear shader uniforms. No legacy materials,
 * special effects or unverified palette color conversion are accepted here. */
interface NativeAttachmentBasis {
 readonly dst:0;
 readonly tangent:Float32Array;readonly uv:Float32Array;
 readonly mask:NativeHairMap;readonly maps:NativeHairMap;readonly normal:NativeHairMap;
}
export type NativeHairInputs=NativeAttachmentBasis&({readonly shader:'PBR/PBR Hair';readonly colors:NativeHairColors}|{readonly shader:'PBR/PBR'|'PBR/PBR Clothing';readonly tint:RGBA;readonly metallicScale:number;readonly glossScale:number;readonly cull?:0|2;readonly alphaCutout?:boolean});
export type NativeAttachmentMaterial=Omit<NativeAttachmentBasis,'tangent'|'uv'>&({readonly shader:'PBR/PBR Hair';readonly colors:NativeHairColors}|{readonly shader:'PBR/PBR'|'PBR/PBR Clothing';readonly tint:RGBA;readonly metallicScale:number;readonly glossScale:number;readonly cull?:0|2;readonly alphaCutout?:boolean});
export function validNativeHairInputs(h:NativeHairInputs,n:number):boolean{
 const map=(m:NativeHairMap)=>!!m&&Number.isSafeInteger(m.width)&&Number.isSafeInteger(m.height)&&m.width>0&&m.height>0&&m.width<=4096&&m.height<=4096&&(m.colorSpace===0||m.colorSpace===1)&&m.mipByteLengths.length>0&&m.mipByteLengths.length<=1+Math.floor(Math.log2(Math.max(m.width,m.height)))&&m.mipByteLengths.every((b,i)=>b===4*Math.max(1,m.width>>i)*Math.max(1,m.height>>i))&&m.pixels.byteLength===m.mipByteLengths.reduce((s,b)=>s+b,0);
 return h.dst===0&&h.tangent.length===n*4&&h.uv.length===n*2&&h.tangent.every(Number.isFinite)&&h.uv.every(Number.isFinite)&&h.tangent.every((x,i)=>i%4!==3||x===1||x===-1)&&[h.mask,h.maps,h.normal].every(map)&&h.normal.colorSpace===0&&(h.shader==='PBR/PBR Hair'?[h.colors.base,h.colors.one,h.colors.two,h.colors.three].every(rgba):(h.shader==='PBR/PBR'||h.shader==='PBR/PBR Clothing')&&rgba(h.tint)&&(h.cull===undefined||h.cull===0||h.cull===2)&&(h.alphaCutout===undefined||typeof h.alphaCutout==='boolean')&&(h.shader==='PBR/PBR'||h.cull!==0&&!h.alphaCutout)&&Number.isFinite(h.metallicScale)&&h.metallicScale>=0&&h.metallicScale<=4&&Number.isFinite(h.glossScale)&&h.glossScale>=0&&h.glossScale<=4&&(h.shader!=='PBR/PBR Clothing'||h.metallicScale===1&&h.glossScale===1));
}
