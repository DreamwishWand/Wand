/** Shared asset references. Caller supplies a published, native-resolved
 * binding, never an inferred offer-to-image match or an unverified upload. */
import {publicImageUrl} from './public-image-key.ts';
import {shopArtworkTemplate,type ShopArtworkBinding} from './shop-artwork-layout.ts';
export interface ShopImage {readonly sha256:string;readonly width:number;readonly height:number}
export interface ShopArtworkAsset {
  readonly kind:'item'|'shop';
  readonly thumbnail:ShopImage;
  readonly original:ShopImage;
  readonly fill:'contain'|'cover';
  /** Explicit source-derived offsets in native reference units; not CSS pixels. */
  readonly margins?:readonly [number,number,number,number];
}
export interface PublishedShopArtwork {
  readonly publicationVerified:true;
  readonly layout:string;
  readonly bindings:Readonly<Partial<Record<ShopArtworkBinding,ShopArtworkAsset>>>;
  readonly background?:ShopArtworkAsset;
  readonly scrollItems?:readonly ShopArtworkAsset[];
}
const sha=/^[a-f0-9]{64}$/;
const good=(i:ShopImage|undefined)=>!!i&&sha.test(i.sha256)&&
  Number.isSafeInteger(i.width)&&Number.isSafeInteger(i.height)&&i.width>0&&i.height>0&&i.width<=16384&&i.height<=16384;
function layer(origin:string,a:ShopArtworkAsset|undefined,detail:boolean){
  if(!a||!good(a.thumbnail)||!good(a.original)||(a.kind!=='item'&&a.kind!=='shop')||
    Math.max(a.thumbnail.width,a.thumbnail.height)>(a.kind==='item'?128:512)||
    a.thumbnail.width>a.original.width||a.thumbnail.height>a.original.height||
    (a.thumbnail.sha256===a.original.sha256&&(a.thumbnail.width!==a.original.width||a.thumbnail.height!==a.original.height))||
    (a.fill!=='contain'&&a.fill!=='cover'))return null;
  const margins=a.margins??[0,0,0,0] as const;
  if(margins.length!==4||!margins.every(n=>Number.isFinite(n)&&Math.abs(n)<=4096))return null;
  const image=detail?a.original:a.thumbnail;
  return {url:publicImageUrl(origin,detail?'original':'thumbnail',image.sha256),fill:a.fill,margins};
}
export function resolveShopArtwork(origin:string,source:PublishedShopArtwork|null,detail=false){
  if(!source||source.publicationVerified!==true)return null;
  const template=shopArtworkTemplate(source.layout);
  if(!template)return null;
  const slots=template.slots.map(s=>({...s,image:layer(origin,source.bindings[s.binding],detail)}));
  const background=layer(origin,source.background,detail);
  const scrollItems=(source.scrollItems??[]).map(a=>layer(origin,a,detail));
  // Do not show a partial or invented representation as a native bundle.
  if(slots.some(s=>!s.image)||(source.background&&!background)||scrollItems.some(s=>!s)||
    (template.scroll&&!scrollItems.length)||(!template.scroll&&scrollItems.length))return null;
  return {template,slots,background,scrollItems};
}
