/** Read-only Save numeric shape candidates. Original definition fallback
 * at a recorded Save anchor is not actual runtime occupancy. Group by
 * ephemeral Save Grid ordinal, never merge distinct Save Grids. */
import {createSourceGeometryCache,type SourceObjectShape} from './source-object-map.ts';
import {getSourceAnchorDomain} from './native-anchor-domain.ts';
import type {MapObjectLayer} from './source-map-layers.ts';
import type {SavedNumericPoint} from './saved-grid-source-candidates.ts';
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uint=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
const int32=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=-2147483648&&v<=2147483647;
const CARDINAL:Readonly<Record<string,number>>=Object.freeze({
  GridOrientation_Up:0,GridOrientation_Right:4,GridOrientation_Down:8,GridOrientation_Left:12});
export interface SavedShapeObject extends SavedNumericPoint{
  readonly shapeKey:string|null;readonly name:string|null;
  readonly layer:MapObjectLayer;readonly surfaceCapable:boolean;
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
      x:row.x,y:row.y,orientation:row.orientation as string|null};
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
    const orientationCode=p.orientation!==null&&Object.hasOwn(CARDINAL,p.orientation)?CARDINAL[p.orientation]:null;
    const resolved=geometry&&uint(id)&&id>0?geometry.resolve(id,orientationCode):
      {shapeKey:null,name:null,layer:'other' as const,surfaceCapable:false};
    return {...p,...resolved,orientationCode};
  });
  // Precompute alternative cardinal shapes using the same bounded Worker cache.
  if(geometry)for(const o of objects){
    if(o.shapeKey&&o.orientationCode!==null)for(const code of [0,4,8,12])geometry.resolve(Number(o.itemId),code);
  }
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
