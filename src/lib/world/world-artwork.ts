/** Reuse the shared public image lookup and the same historical static artwork
 * catalog as Collection/Explore. No new image database or guessed R2 paths. */
import {gameImageHref} from '../collection/game-images.ts';
import {itemMedia} from '../media/item-media.ts';
import type {SavedShapeMap,SavedShapeObject} from './saved-shape-map.ts';
import type {MapExtent} from './map-camera.ts';
type HistoricalIndex=Readonly<Record<string,unknown>>;
type PublicLookup=(id:number)=>Promise<{url:string}|null>;
export function createWorldArtworkLookup(base:string,fetcher:typeof fetch=fetch,published:PublicLookup=id=>itemMedia.getItemImage(id)){
 let legacy:Promise<HistoricalIndex>|null=null;
 const cache=new Map<number,Promise<string|null>>();
 function historical():Promise<HistoricalIndex>{
  return legacy??=fetcher(base+'/ddv/collection/item-images-r39.json',{credentials:'same-origin'}).then(async (r):Promise<HistoricalIndex>=>{
   if(!r.ok||r.redirected)return {};
   const d:unknown=await r.json();
   if(!d||typeof d!=='object'||!('schema' in d)||d.schema!=='wand.collection.item-images.r39@1'||!('items' in d)||!d.items||typeof d.items!=='object'||Array.isArray(d.items))return {};
   return d.items as HistoricalIndex;
  }).catch(()=>({}));
 }
 return function getArtwork(id:number):Promise<string|null>{
  if(!Number.isSafeInteger(id)||id<1||id>0xffffffff)return Promise.resolve(null);
  const previous=cache.get(id);if(previous)return previous;
  const request=(async()=>{
   const img=await published(id).catch(()=>null);if(img)return img.url;
   const pinned=gameImageHref(base,id);if(pinned)return pinned;
   const index=await historical(),path=Object.hasOwn(index,String(id))?index[String(id)]:null;
   return gameImageHref(base,id,typeof path==='string'?path:'');
  })();
  cache.set(id,request);return request;
 };
}
const lookups=new Map<string,ReturnType<typeof createWorldArtworkLookup>>();
export function worldArtwork(base:string,id:number){
 let lookup=lookups.get(base);if(!lookup){lookup=createWorldArtworkLookup(base);lookups.set(base,lookup);}
 return lookup(id);
}
/** At distant zoom preserve cell silhouettes and avoid decoding thousands of
 * thumbnails. They are visual identifiers, not top-down geometry. */
export function mapCellPixels(view:MapExtent,width:number,height:number){
 return view.w>0&&view.h>0&&width>0&&height>0?Math.min(width/view.w,height/view.h):0;
}
export function showWorldArtwork(o:Pick<SavedShapeObject,'layer'|'shapeKey'>,shape:Pick<SavedShapeMap['shapes'][string],'width'|'height'>|null|undefined,cellPixels:number){
 return !!shape&&o.layer!=='ground'&&o.layer!=='fence'&&Math.min(shape.width,shape.height)*cellPixels>=14;
}
export function visibleWorldArtworkIds(objects:readonly SavedShapeObject[],shapes:SavedShapeMap['shapes'],pixels:number):number[]{
 return [...new Set(objects.filter(o=>showWorldArtwork(o,o.shapeKey?shapes[o.shapeKey]:null,pixels)).map(o=>Number(o.itemId)).filter(id=>Number.isSafeInteger(id)&&id>0&&id<=0xffffffff))];
}
