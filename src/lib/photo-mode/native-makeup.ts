import {bakeMakeup,type RGB,type RGBA} from './face-material-bake.ts';

// Steam 1.26.2 AvatarAppearance..cctor: metadata field data SHA-256
// a16ac0f1c71d416da0b06059df6ad85785aa70856366a82335e2b762a1c87ac5.
// Order is deliberately not enum or item-ID order.
export const NATIVE_MAKEUP_ORDER=[11,2,9,10,7,8,5,6,0,3,1,13,4] as const;
export type MakeupColor32=readonly [number,number,number,number];
export type NativeMakeupSelection={itemId:number;colorIndices:readonly [number,number,number];opacity:number;gloss:number};
export type NativeMakeupDefinition={subtype:number;masks:Record<'female'|'male',string>;defaultColorIndices:readonly [number,number,number]};
export type NativeMakeupLayer={itemId:number;subtype:number;mask:string;colors:readonly [RGB,RGB,RGB];opacity:number;gloss:number};
const black:RGB=[0,0,0];
const linear=(v:number)=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;
function paletteColor(palette:readonly MakeupColor32[],index:number):RGB|undefined{
 if(!Number.isInteger(index)||index<0||index>=palette.length)return;
 const c=palette[index];
 return [linear(c[0]/255),linear(c[1]/255),linear(c[2]/255)];
}
// UpdateMakeup SHA-256 59541f5539d1e25bebe3f9630af391894eef39e68a298c1c2ae5950477ed34b5.
// Failed TryGetColor leaves the caller's previous color unchanged.
// Only color 1 uses the item default. Color.linear applies to RGB; alpha is unused.
export function resolveNativeMakeupLayers(body:'female'|'male',palette:readonly MakeupColor32[],definitions:Readonly<Record<string,NativeMakeupDefinition>>,selections:Readonly<Record<string,NativeMakeupSelection>>):NativeMakeupLayer[]{
 if(palette.length!==75||palette.some(c=>c.length!==4||c.some(v=>!Number.isInteger(v)||v<0||v>255)))throw new Error('Invalid native makeup palette');
 const out:NativeMakeupLayer[]=[];
 for(const subtype of NATIVE_MAKEUP_ORDER){
  const s=selections[String(subtype)];if(!s||!s.itemId)continue;
  const d=definitions[String(s.itemId)];if(!d||d.subtype!==subtype||!d.masks[body])throw new Error('Unresolved native makeup definition '+s.itemId);
  if(!Number.isFinite(s.opacity)||!Number.isFinite(s.gloss))throw new Error('Invalid makeup parameters');
  const c1=paletteColor(palette,s.colorIndices[0])??paletteColor(palette,d.defaultColorIndices[0])??black;
  out.push({itemId:s.itemId,subtype,mask:d.masks[body],colors:[c1,paletteColor(palette,s.colorIndices[1])??black,paletteColor(palette,s.colorIndices[2])??black],opacity:s.opacity===-1?1:s.opacity,gloss:s.gloss});
 }
 return out;
}
// Reference arithmetic in linear space before UNorm/sRGB framebuffer quantization.
// BakeMakeup target 0: RGB One/OneMinusSrcAlpha; alpha One/One.
// Target 1: One/One for all channels. Both Add; normalized targets saturate.
const sat=(v:number)=>Math.min(1,Math.max(0,v));
export function compositeNativeMakeupPixel(dst:{color:RGBA;maps:RGBA},src:{color:RGBA;maps:RGBA}):{color:RGBA;maps:RGBA}{
 return {color:[sat(src.color[0]+dst.color[0]*(1-src.color[3])),sat(src.color[1]+dst.color[1]*(1-src.color[3])),sat(src.color[2]+dst.color[2]*(1-src.color[3])),sat(src.color[3]+dst.color[3])],maps:[sat(src.maps[0]+dst.maps[0]),sat(src.maps[1]+dst.maps[1]),sat(src.maps[2]+dst.maps[2]),sat(src.maps[3]+dst.maps[3])]};
}
export function bakeNativeMakeupPixel(layers:readonly NativeMakeupLayer[],sample:(mask:string)=>RGBA):{color:RGBA;maps:RGBA}{
 let out:{color:RGBA;maps:RGBA}={color:[0,0,0,0],maps:[0,0,0,0]};
 for(const l of layers)out=compositeNativeMakeupPixel(out,bakeMakeup(sample(l.mask),...l.colors,l.opacity,l.gloss));
 return out;
}
