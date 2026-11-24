import type {SavedShapeObject,SavedShapeMap} from './saved-shape-map.ts';
import {matchesSelectionLayer,type MapSelectionLayer} from './source-map-layers.ts';
export type WorldNames=ReadonlyMap<number,string>;
export const worldObjectName=(o:SavedShapeObject,names:WorldNames)=>names.get(Number(o.itemId))??o.name??'Item '+o.itemId;
const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().trim();
export function searchSavedObjects(objects:readonly SavedShapeObject[],names:WorldNames,query:string,layer:MapSelectionLayer):SavedShapeObject[]{
  const terms=normalize(query).split(/\s+/).filter(Boolean);
  return objects.filter(o=>matchesSelectionLayer(o,layer)&&terms.every(term=>
    normalize(worldObjectName(o,names)+' '+(o.name??'')+' '+o.itemId).includes(term)));
}
export function objectFocus(map:SavedShapeMap,o:SavedShapeObject,extent:{x:number;y:number;w:number;h:number},max:number){
  const shape=o.shapeKey?map.shapes[o.shapeKey]:null;
  const w=shape?.width??1,h=shape?.height??1;
  const zoom=Math.max(1,Math.min(max,extent.w/Math.max(8,w*3),extent.h/Math.max(8,h*3)));
  const clamp=(v:number)=>Math.max(.5/zoom,Math.min(1-.5/zoom,v));
  return {zoom,x:clamp((o.x+w/2-extent.x)/extent.w),y:clamp((o.y+h/2-extent.y)/extent.h)};
}
