/** Original default GridObject geometry only. Never infer Save occupancy,
 * supported objects, runtime overrides, collision or placement legality.
 * Built once per selected Grid in the World worker; shared shapes are
 * deduplicated per Item ID and orientation. Row runs preserve holes. */
import {sourceEditRestrictions,type NativeEditRestrictions} from './native-edit-restrictions.ts';
import {sourceMapLayer,sourceSurfaceCapable,type MapObjectLayer} from './source-map-layers.ts';
import {getSourceAnchorDomain} from './native-anchor-domain.ts';
import {getOriginalGridAreaEvidence} from './native-gridarea-evidence.ts';
import {getOriginalGridAreaDisplayDimensions,getOriginalGridAreaLocalWindow}
  from './native-gridarea-local-window.ts';
type Row=Record<string,unknown>;
const record=(v:unknown):v is Row=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uint=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
export interface SourceShapeRun {readonly x:number;readonly y:number;readonly width:number}
export interface SourceObjectShape {
  readonly width:number;readonly height:number;readonly runs:readonly SourceShapeRun[];
  readonly cellCount:number;readonly path:string;
  readonly acceptedFloorTypesFlag?:number;
}
export interface SourceMapObject {
  readonly id:number;readonly itemId:number;readonly name:string|null;
  readonly x:number;readonly y:number;readonly orientationCode:number;
  readonly orientationName:string|null;readonly shapeKey:string|null;
  readonly layer:MapObjectLayer;readonly surfaceCapable:boolean;readonly editRestrictions?:NativeEditRestrictions;
}
export interface SourceObjectMap {
  readonly status:'source_default_geometry'|'unavailable'|'incompatible_grid_factor';
  readonly layoutId:string;readonly gridIdNative:number;readonly gridDataPath:string|null;
  readonly objects:readonly SourceMapObject[];readonly shapes:Readonly<Record<string,SourceObjectShape>>;
  readonly totalCount:number;readonly unresolvedCount:number;readonly omittedCount:number;
  readonly gridFactor:1|2|null;readonly sizeX:number|null;readonly sizeY:number|null;
  readonly actualOccupancyVerified:false;readonly supportRelationsVerified:false;
}
/** Reuse the same original source geometry for initial and saved records.
 * One bounded cache per request; no duplicated orientation algorithm. */
export function createSourceGeometryCache(source:unknown,factor:1|2){
  if(!record(source)||!(source.objects instanceof Map))throw new TypeError('DB04_GEOMETRY_SOURCE_INVALID');
  const definitions=source.objects;
  const shapes:Record<string,SourceObjectShape>={};
  const cache=new Map<string,SourceObjectShape|null>();
  const itemEvidence=new Map<number,ReturnType<typeof getOriginalGridAreaEvidence>>();
  let work=0;
  function resolve(itemId:number,orientationCode:number|null){
    let e=itemEvidence.get(itemId);
    if(!e){e=getOriginalGridAreaEvidence(source,itemId);itemEvidence.set(itemId,e);}
    const definition=definitions.get(String(itemId));
    const identity={name:record(definition)&&typeof definition.nativeName==='string'?definition.nativeName:null,
      layer:sourceMapLayer(e.nativeType,itemId,e.acceptedFloorTypesFlag),
      surfaceCapable:sourceSurfaceCapable(e.acceptedFloorTypesFlag),editRestrictions:sourceEditRestrictions(definition)};
    if(orientationCode===null)return {...identity,shapeKey:null};
    const key=itemId+':'+orientationCode;
    let shape=cache.get(key);
    if(shape===undefined){
      shape=null;
      if(e.status==='source_raw_gridarea_available'&&e.rawSizeX&&e.rawSizeY){
        const {width,height}=getOriginalGridAreaDisplayDimensions(e.rawSizeX,e.rawSizeY,orientationCode,factor);
        if(width>0&&height>0&&work+width*height<=1_000_000){
          work+=width*height;
          const mask=new Uint8Array(width*height);
          for(let y=0;y<height;y+=16)for(let x=0;x<width;x+=16){
            const local=getOriginalGridAreaLocalWindow(source,itemId,orientationCode,x,y,
              Math.min(16,width-x),Math.min(16,height-y),factor);
            if(local.status!=='source_native_local_layers'||!local.rows)
              throw new TypeError('DB04_OBJECT_MAP_SHAPE_INVALID');
            for(let dy=0;dy<local.rows.length;dy++)for(let dx=0;dx<local.rows[dy].length;dx++)
              if(local.rows[dy][dx]!==null)mask[(y+dy)*width+x+dx]=1;
          }
          const runs:SourceShapeRun[]=[];let cellCount=0;
          for(let y=0;y<height;y++)for(let x=0;x<width;){
            if(!mask[y*width+x]){x++;continue;}
            const start=x;while(x<width&&mask[y*width+x])x++;
            runs.push({x:start,y,width:x-start});cellCount+=x-start;
          }
          if(cellCount){
            shape={width,height,runs,cellCount,acceptedFloorTypesFlag:e.acceptedFloorTypesFlag??undefined,path:runs.map(run=>
              'M'+run.x+' '+run.y+'h'+run.width+'v1h-'+run.width+'Z').join('')};
            shapes[key]=shape;
          }
        }
      }
      cache.set(key,shape);
    }

    return {...identity,shapeKey:shape?key:null};
  }
  return {shapes,resolve};
}
export function buildSourceObjectMap(source:unknown,layoutId:string,gridIdNative:number):SourceObjectMap{
  const empty=(status:SourceObjectMap['status'],gridDataPath:string|null=null):SourceObjectMap=>
    ({status,layoutId,gridIdNative,gridDataPath,objects:[],shapes:{},totalCount:0,
      unresolvedCount:0,omittedCount:0,gridFactor:null,sizeX:null,sizeY:null,actualOccupancyVerified:false,supportRelationsVerified:false});
  if(!record(source)||!record(source.manifest)||!(source.objects instanceof Map)||
    !(source.layoutObjectsByGrid instanceof Map))throw new TypeError('DB04_OBJECT_MAP_SOURCE_INVALID');
  if(source.manifest.platform!=='Steam'||source.manifest.gameVersion!=='1.26.2')return empty('unavailable');
  const domain=getSourceAnchorDomain(source,layoutId,gridIdNative);
  if(!domain)return empty('unavailable');
  if(domain.status==='tessellation_coordinate_relation_unverified'||
    (domain.tessellationFactor!==1&&domain.tessellationFactor!==2))
    return {...empty('incompatible_grid_factor',domain.gridDataPath),totalCount:domain.defaultObjectCount,
      omittedCount:domain.defaultObjectCount};
  const factor=domain.tessellationFactor as 1|2;
  const rows=source.layoutObjectsByGrid.get(layoutId)?.get(gridIdNative)??[];
  if(!Array.isArray(rows)||rows.length!==domain.defaultObjectCount)
    throw new TypeError('DB04_OBJECT_MAP_COUNT_INVALID');
  const geometry=createSourceGeometryCache(source,factor);
  const shapes=geometry.shapes;
  const objects:SourceMapObject[]=[];
  const seen=new Set<number>();
  let unresolvedCount=0;
  for(const row of rows.slice(0,5000)){
    if(!record(row)||row.layoutId!==layoutId||row.gridIdNative!==gridIdNative||
      !uint(row.gridObjectIdNative)||seen.has(row.gridObjectIdNative)||!uint(row.itemId)||row.itemId===0||
      !uint(row.x)||!uint(row.y)||!uint(row.orientationCode)||row.orientationCode>15)
      throw new TypeError('DB04_OBJECT_MAP_RECORD_INVALID');
    seen.add(row.gridObjectIdNative);

    const resolved=geometry.resolve(row.itemId,row.orientationCode);
    if(!resolved.shapeKey)unresolvedCount++;
    objects.push({id:row.gridObjectIdNative,itemId:row.itemId,x:row.x,y:row.y,
      orientationCode:row.orientationCode,orientationName:typeof row.orientationName==='string'?row.orientationName:null,
      ...resolved});
  }
  return {status:'source_default_geometry',layoutId,gridIdNative,gridDataPath:domain.gridDataPath,
    objects,shapes,totalCount:rows.length,unresolvedCount,omittedCount:rows.length-objects.length,
    gridFactor:factor,sizeX:domain.anchorSizeX,sizeY:domain.anchorSizeY,
    actualOccupancyVerified:false,supportRelationsVerified:false};
}
/** Exact mapped shape hit test; keep ALL objects at the same point. Unknown
 * shapes may only be selected at their recorded anchor, never as known area. */
export function sourceObjectsAt(map:SourceObjectMap,x:number,y:number):SourceMapObject[]{
  return map.objects.filter(o=>{
    const s=o.shapeKey?map.shapes[o.shapeKey]:null;
    const dx=x-o.x,dy=y-o.y;
    if(!s)return dx===0&&dy===0;
    if(dx<0||dy<0||dx>=s.width||dy>=s.height)return false;
    return s.runs.some(r=>r.y===dy&&dx>=r.x&&dx<r.x+r.width);
  });
}
/** Relative orientation cue only; 8 is the original reference direction.
 * A visual rotation marker is not a mesh's actual facing vector. */
export function sourceOrientationAngle(code:number){return (code-8)*22.5;}

/** Mapped source-shape intersections, not actual support links or collision.
 * Compute only for a selected object. Row runs are sorted by local y/x. */
export interface SourceShapeIntersection {
  readonly object:SourceMapObject;readonly cells:number;
}
export function sourceShapeIntersections(map:SourceObjectMap,selected:SourceMapObject):SourceShapeIntersection[]{
  const a=selected.shapeKey?map.shapes[selected.shapeKey]:null;
  if(!a)return [];
  const result:SourceShapeIntersection[]=[];
  for(const other of map.objects){
    if(other.id===selected.id||!other.shapeKey)continue;
    const b=map.shapes[other.shapeKey];
    if(!b||selected.x+a.width<=other.x||other.x+b.width<=selected.x||
      selected.y+a.height<=other.y||other.y+b.height<=selected.y)continue;
    let i=0,j=0,cells=0;
    while(i<a.runs.length&&j<b.runs.length){
      const ar=a.runs[i],br=b.runs[j];
      const ay=selected.y+ar.y,by=other.y+br.y;
      if(ay<by){i++;continue;}if(ay>by){j++;continue;}
      const ax=selected.x+ar.x,bx=other.x+br.x;
      const ae=ax+ar.width,be=bx+br.width;
      cells+=Math.max(0,Math.min(ae,be)-Math.max(ax,bx));
      if(ae<=be)i++;if(be<=ae)j++;
    }
    if(cells)result.push({object:other,cells});
  }
  return result;
}
