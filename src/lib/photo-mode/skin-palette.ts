import type {SavedAvatarAppearance} from './saved-avatar-appearance.ts';
import type {BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
export type SkinTexture={texture:BlobEntry;format:'png'|'webp'};
export type SkinPair={body:SkinTexture;face:SkinTexture};
export type SkinPalette=readonly Readonly<Record<'male'|'female',SkinPair>>[];
export function validSkinPalette(x:unknown):x is SkinPalette{
 const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const texture=(x:unknown,format:string):x is SkinTexture=>obj(x)&&Object.keys(x).length===2&&x.format===format&&obj(x.texture)&&typeof x.texture.sha256==='string'&&/^[a-f0-9]{64}$/.test(x.texture.sha256)&&typeof x.texture.bytes==='number'&&Number.isSafeInteger(x.texture.bytes)&&x.texture.bytes>0&&x.texture.bytes<=16*1024*1024;
 if(!Array.isArray(x)||x.length!==30)return false;
 const seen=new Set<string>();
 for(let i=0;i<x.length;i++){const row=x[i];if(!obj(row)||Object.keys(row).length!==2)return false;
  for(const b of ['male','female']){const p=row[b];if(!obj(p)||Object.keys(p).length!==2)return false;
   for(const role of ['body','face']){const t=p[role];if(!texture(t,i===1?'png':'webp')||seen.has(t.texture.sha256))return false;seen.add(t.texture.sha256)}
  }
 }
 return true;
}
/** The saved field is a direct native configuration index; no nearest color or cross-form fallback. */
export function savedSkinIndex(appearance:SavedAvatarAppearance|undefined,body:'male'|'female',mermaid:boolean):number|undefined{
 const key=mermaid?(body==='male'?'maleMermaid':'femaleMermaid'):body;
 const index=appearance?.avatars[key]?.SkinColorIndex;
 return typeof index==='number'&&Number.isInteger(index)&&index>=0&&index<30?index:undefined
}
export function skinTextureFor(palette:SkinPalette|undefined,index:number|undefined,body:'male'|'female',role:'body'|'mermaidBody'|'face'|'eyes'):SkinTexture|undefined{
 if(role==='eyes'||index===undefined||!Number.isInteger(index)||index<0||index>=30)return;
 return palette?.[index]?.[body]?.[role==='mermaidBody'?'body':role]
}
