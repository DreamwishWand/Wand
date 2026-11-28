import type {SavedAvatarAppearance} from './saved-avatar-appearance.ts';
import type {BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
type RGB=readonly [number,number,number,number];
type EyeItem={texture:BlobEntry;defaults:readonly [number,number,number]};
export type EyePalette={colors:readonly RGB[];items:Readonly<Record<string,EyeItem>>;shaderParityVerified:false};
export type EyeSelection={texture:BlobEntry;indices:readonly [number,number,number];colors:readonly [RGB,RGB,RGB]};
const validIndex=(x:unknown):x is number=>typeof x==='number'&&Number.isInteger(x)&&x>=0&&x<75;
function object(x:unknown):x is Record<string,unknown>{return x!==null&&typeof x==='object'&&!Array.isArray(x)}
export function validEyePalette(x:unknown):x is EyePalette{
 if(!object(x)||x.shaderParityVerified!==false||!Array.isArray(x.colors)||x.colors.length!==75||!object(x.items)||Object.keys(x.items).length!==12)return false;
 if(!x.colors.every(c=>Array.isArray(c)&&c.length===4&&c[3]===1&&c.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)))return false;
 const seen=new Set<string>();
 for(let id=70000001;id<=70000012;id++){
  const row=x.items[String(id)];if(!object(row)||!Array.isArray(row.defaults)||row.defaults.length!==3||!row.defaults.every(validIndex)||!object(row.texture))return false;
  const {sha256,bytes}=row.texture;if(typeof sha256!=='string'||!/^[0-9a-f]{64}$/.test(sha256)||seen.has(sha256)||typeof bytes!=='number'||!Number.isSafeInteger(bytes)||bytes<=0||bytes>2*1024*1024)return false;seen.add(sha256)
 }
 return true
}
/** No cross-form fallback. Missing/invalid fields use the native item reference colors, not inferred save values. */
export function selectEyeMaterial(p:EyePalette|undefined,appearance:SavedAvatarAppearance|undefined,body:'male'|'female',mermaid:boolean):EyeSelection|undefined{
 if(!p)return;
 const branch=mermaid?(body==='male'?'maleMermaid':'femaleMermaid'):body;
 const saved=appearance?.avatars[branch]?.Eyeball;
 const item=saved&&p.items[String(saved.EyeballItemID)];
 const row=item||p.items['70000001'];if(!row)return;
 const indices=row.defaults.map((v,i)=>{const s=item?saved?.['ColorIndex'+(i+1)]:undefined;return validIndex(s)?s:v}) as [number,number,number];
 return {texture:row.texture,indices,colors:indices.map(i=>p.colors[i]) as [RGB,RGB,RGB]}
}
export function eyeMaterialKey(eye:EyeSelection|undefined){return eye?eye.texture.sha256+':'+eye.indices.join(':'):'-'}
/** Explicit diagnostic RGB mask projection; not the game's lighting, specular or shader formula. */
export function projectEyeMask(pixels:Uint8ClampedArray,colors:EyeSelection['colors']):void{
 if(pixels.length%4!==0)throw new RangeError('Invalid eye mask');
 for(let i=0;i<pixels.length;i+=4){
  const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
  for(let c=0;c<3;c++)pixels[i+c]=r*colors[0][c]+g*colors[1][c]+b*colors[2][c];
  pixels[i+3]=255
 }
}
