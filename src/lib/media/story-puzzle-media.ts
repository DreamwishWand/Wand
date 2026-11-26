/** R2-verified Story source images. Browser preview approved after a representative
 * image opened successfully; this does not assert exhaustive CDN readback.
 * No image HEADs, private GUIDs, or generated puzzle states at runtime.
 */
import index from '../../../data/ddv/media/story-puzzle-steam-1.26.2.json' with {type:'json'};
import {publicImageUrl,type ImageVariant} from './public-image-key.ts';
import type {ItemImage} from './item-media.ts';
const ORIGIN='https://media.dreamwishwand.com';
type StoryRow={image:{original:string;thumbnail:string};icon:string;blurredIcon:string;isMissionItem:boolean};
type ImageRow={sha256:string;width:number;height:number;bytes:number};
const items:Readonly<Record<string,StoryRow>>=index.items;
const images:Readonly<Record<string,ImageRow>>=index.images;
export type StoryImageRole=ImageVariant|'icon'|'blurredIcon';
export function getStoryPuzzleImage(itemId:number,role:StoryImageRole='thumbnail'):ItemImage|null{
  if(!Number.isSafeInteger(itemId)||!Object.hasOwn(items,String(itemId)))return null;
  const row=items[String(itemId)];
  const sha=role==='original'||role==='thumbnail'?row.image[role]:role==='icon'||role==='blurredIcon'?row[role]:null;
  if(!sha||!Object.hasOwn(images,sha))return null;
  const image=images[sha];
  if(image.sha256!==sha||!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<=0||image.height<=0||
    (role==='thumbnail'&&Math.max(image.width,image.height)>512))return null;
  return Object.freeze({url:publicImageUrl(ORIGIN,role==='thumbnail'?'thumbnail':'original',sha),sha256:sha,width:image.width,height:image.height});
}
