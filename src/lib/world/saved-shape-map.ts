/** Read-only Save numeric shape candidates. Original definition fallback
 * at a recorded Save anchor is not actual runtime occupancy. Group by
 * ephemeral Save Grid ordinal, never merge distinct Save Grids. */
import {createSourceGeometryCache,type SourceObjectShape} from './source-object-map.ts';
import {getSourceAnchorDomain} from './native-anchor-domain.ts';
import type {NativeEditRestrictions} from './native-edit-restrictions.ts';
import type {MapObjectLayer} from './source-map-layers.ts';
import {parseSavedSubgridSummary,type SavedNumericPoint} from './saved-grid-source-candidates.ts';
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uint=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
const int32=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=-2147483648&&v<=2147483647;
import {worldOrientationCode,eightWayFurniture} from './saved-map-transform.ts';
export interface SavedShapeObject extends SavedNumericPoint{
  readonly shapeKey:string|null;readonly name:string|null;
  readonly layer:MapObjectLayer;readonly surfaceCapable:boolean;readonly editRestrictions?:NativeEditRestrictions;readonly nativeType?:'Building';
  readonly orientationCode:number|null;
}
export interface SavedShapeMap {
  readonly layoutId:string;readonly gridIdNative:number;readonly gridDataPath:string;
  readonly sourceGridFactor:1|2|null;
  readonly objects:readonly SavedShapeObject[];
  readonly shapes:Readonly<Record<string,SourceObjectShape>>;
  readonly actualOccupancyVerified:false;readonly savedSourceCoordinateEquivalenceVerified:false;
}
export function parseSavedShapePoints(input:unknown):SavedNumericPoint[]{
  if(!Array.isArray(input)||input.length>20000)throw new TypeError('DB04_SAVE_SHAPE_POINTS_INVALID');
  const seen=new Set<number>();
  return input.map(row=>{
    if(!record(row)||!uint(row.localOrdinal)||row.localOrdinal===0||seen.has(row.localOrdinal)||
      !uint(row.localGridOrdinal)||row.localGridOrdinal===0||typeof row.itemId!=='string'||
      !/^[1-9][0-9]{0,19}$/.test(row.itemId)||!int32(row.x)||!int32(row.y)||
      (row.orientation!==null&&(typeof row.orientation!=='string'||row.orientation.length>32)))
      throw new TypeError('DB04_SAVE_SHAPE_POINT_INVALID');
    seen.add(row.localOrdinal);
    return {localOrdinal:row.localOrdinal,localGridOrdinal:row.localGridOrdinal,itemId:row.itemId,
      x:row.x,y:row.y,orientation:row.orientation as string|null,...(row.subgrid===undefined?{}:{subgrid:parseSavedSubgridSummary(row.subgrid)})};
  });
}
export function buildSavedShapeMap(source:unknown,layoutId:string,gridIdNative:number,input:unknown):SavedShapeMap{
  const points=parseSavedShapePoints(input);
  const domain=getSourceAnchorDomain(source,layoutId,gridIdNative);
  if(!domain)throw new TypeError('DB04_SAVE_SHAPE_GRID_MISSING');
  const factor=domain.status!=='tessellation_coordinate_relation_unverified'&&
    (domain.tessellationFactor===1||domain.tessellationFactor===2)?domain.tessellationFactor:null;
  const geometry=factor?createSourceGeometryCache(source,factor):null;
  const objects:SavedShapeObject[]=points.map(p=>{
    const id=Number(p.itemId);
    const orientationCode=worldOrientationCode(p.orientation);
    const resolved=geometry&&uint(id)&&id>0?geometry.resolve(id,orientationCode):
      {shapeKey:null,name:null,layer:'other' as const,surfaceCapable:false};
    return {...p,...resolved,orientationCode};
  });
  // Keep cardinal alternatives first, then add 45-degree alternatives to the same bounded cache.
  if(geometry)for(const o of objects){
    if(o.shapeKey&&o.orientationCode!==null)for(const code of [0,4,8,12])geometry.resolve(Number(o.itemId),code);
  }
  if(geometry&&factor===1)for(const o of objects){if(eightWayFurniture(o))for(const code of [2,6,10,14])geometry.resolve(Number(o.itemId),code);}
  return {layoutId,gridIdNative,gridDataPath:domain.gridDataPath,sourceGridFactor:factor,
    objects,shapes:geometry?.shapes??{},actualOccupancyVerified:false,savedSourceCoordinateEquivalenceVerified:false};
}
export function savedGridObjects(map:SavedShapeMap,ordinal:number):SavedShapeObject[]{
  return map.objects.filter(o=>o.localGridOrdinal===ordinal);
}
export function savedShapesAt(map:SavedShapeMap,ordinal:number,x:number,y:number):SavedShapeObject[]{
  return savedGridObjects(map,ordinal).filter(o=>{
    const shape=o.shapeKey?map.shapes[o.shapeKey]:null;
    const dx=x-o.x,dy=y-o.y;
    return shape?shape.runs.some(r=>r.y===dy&&dx>=r.x&&dx<r.x+r.width):dx===0&&dy===0;
  });
}

/** Render only objects intersecting the current camera window. Keep painter order,
 * a small overscan for strokes/anchors, and the active selection. Search, picking,
 * overlap checks and the writer still use the complete Grid. */
export function visibleSavedObjects(objects:readonly SavedShapeObject[],shapes:SavedShapeMap['shapes'],
    view:{x:number;y:number;w:number;h:number},selected:number|null):SavedShapeObject[]{
  const left=view.x-1,top=view.y-1,right=view.x+view.w+1,bottom=view.y+view.h+1;
  return objects.filter(o=>{
    if(o.localOrdinal===selected)return true;
    const shape=o.shapeKey?shapes[o.shapeKey]:null;
    return o.x<right&&o.y<bottom&&o.x+(shape?.width??1)>left&&o.y+(shape?.height??1)>top;
  });
}

/** Select by intersection with real occupied cells, not only the anchor. */
export function savedShapesInRect(map:SavedShapeMap,ordinal:number,a:{x:number;y:number},b:{x:number;y:number}):SavedShapeObject[]{
 const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
 return savedGridObjects(map,ordinal).filter(o=>{
  const shape=o.shapeKey?map.shapes[o.shapeKey]:null;
  return shape?shape.runs.some(r=>o.y+r.y>=top&&o.y+r.y<=bottom&&o.x+r.x<=right&&o.x+r.x+r.width-1>=left):o.x>=left&&o.x<=right&&o.y>=top&&o.y<=bottom;
 });
}
