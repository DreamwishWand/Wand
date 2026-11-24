/**
 * DB-04 source-local floor-window maps for the original rotated GridArea.
 * Only intrinsically mapped local cells must overlap AcceptedFloorTypesFlag;
 * raw mapped zero-valued layers still participate. The full bounding box
 * must fit. This is not native occupancy, actual Grid tessellation or
 * placement permission. Explicit factor one is a source-local comparison.
 */
import {getOriginalGridAreaEvidence} from './native-gridarea-evidence.ts';
import {getOriginalGridAreaDisplayDimensions,getOriginalGridAreaLocalWindow} from './native-gridarea-local-window.ts';
import {getNativeTerrainRaster} from './native-terrain-preview.ts';
import {nativeFloorOverlap} from './native-floor-match.ts';
import {regionGridRefs} from './native-region-grid-atlas.ts';
import {getSourceAnchorDomain} from './native-anchor-domain.ts';
import {
  requireWorldPreviewCatalog,
  type WorldPreviewView,
} from './preview-views.ts';

export const NATIVE_FLOOR_WINDOW_CONTRACT=
  'wand.db04.original-mapped-gridarea-floor-window@2' as const;
const validUint=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&
  value>=0&&value<=0xffffffff;

export interface NativeFloorWindowGrid {
  readonly areaName:string;
  readonly viewKey:string;
  readonly gridIdNative:number;
  readonly gridDataPath:string;
  readonly sourceFloorCellCount:number|null;
  readonly matchedWindowOriginCount:number|null;
  readonly status:'matched_original_floor_window'|
    'source_floor_grid_unverified';
}
export interface NativeFloorWindowResult {
  readonly contract:typeof NATIVE_FLOOR_WINDOW_CONTRACT;
  readonly status:'source_mapped_gridarea_floor_windows_only'|
    'source_item_gridarea_unverified'|
    'source_game_version_unverified';
  readonly regionKey:string;
  readonly viewKey:string;
  readonly gridIdNative:number;
  readonly gridDataPath:string;
  readonly itemId:number;
  readonly orientationCode:number;
  readonly boundingWidth:number|null;
  readonly boundingHeight:number|null;
  readonly selectedGridOriginCount:number|null;
  readonly regionOriginCount:number|null;
  readonly sourceFloorCellCount:number;
  readonly verifiedGridCount:number;
  readonly unresolvedGridCount:number;
  readonly grids:readonly NativeFloorWindowGrid[];
  /** Exact source-local Y-major bitmap, 1 = mapped shape floor overlap. */
  readonly originBitmap:Uint8Array|null;
  readonly bitmapWidth:number|null;
  readonly bitmapHeight:number|null;
  /** Original default GridObject anchors, NOT occupied footprint cells. */
  readonly originalDefaultAnchorCounts:Uint16Array|null;
  readonly originalDefaultAnchorStatus:
    'factor_one_source_anchors'|'anchor_coordinates_not_compatible'|'source_default_objects_unavailable';
  readonly sourceMappedGridAreaOnly:true;
  readonly mappedShapeCellCount:number|null;
  /** Y-major mapped source cells, not a verified occupancy footprint. */
  readonly mappedShape:Uint8Array|null;
  readonly acceptedFloorTypesFlag:number|null;
  readonly intrinsicGridFactor:1;
  readonly nativeGridLayersOccupancyVerified:false;
  readonly defaultObjectFootprintsVerified:false;
  readonly actualGamePlacementVerified:false;
  readonly worldCoordinatesVerified:false;
  readonly saveOccupancyVerified:false;
  readonly saveWritingAuthorized:false;
}
const uintCheck=(value:unknown):value is number=>validUint(value);
type Raster={sizeX:number;sizeY:number;nativeFloorValues:Uint32Array};
function requireRaster(raw:ReturnType<typeof getNativeTerrainRaster>):Raster|null{
  if(raw.status!=='source_corroborated_grid_local_raster')return null;
  if(!Number.isSafeInteger(raw.sizeX)||!Number.isSafeInteger(raw.sizeY)||
    typeof raw.sizeX!=='number'||typeof raw.sizeY!=='number'||
    raw.sizeX<1||raw.sizeY<1||raw.sizeX*raw.sizeY>250_000||
    !(raw.nativeFloorValues instanceof Uint32Array)||
    raw.nativeFloorValues.length!==raw.sizeX*raw.sizeY)
    throw new TypeError('DB04_FLOOR_RECT_SOURCE_RASTER_INVALID');
  return {sizeX:raw.sizeX,sizeY:raw.sizeY,
    nativeFloorValues:raw.nativeFloorValues};
}

/**
 * Worker supplies the Rust/WASM mapped shape mask calculator. Node unit
 * tests may inject a small synthetic oracle, but production has no TS
 * high-load fallback. Every returned map is independently size-checked.
 */
export type FloorWindowMapper=(
  source:Raster,acceptedFloorTypesFlag:number,
  boundsX:number,boundsY:number,mappedShape:Uint8Array
)=>{originBitmap:Uint8Array;originCount:number};

function sourceDefaultAnchorCounts(
  catalog:unknown,layoutId:string,gridIdNative:number,
  gridDataPath:string,sx:number,sy:number
):Pick<NativeFloorWindowResult,'originalDefaultAnchorCounts'|'originalDefaultAnchorStatus'>{
  const unavailable={
    originalDefaultAnchorCounts:null,
    originalDefaultAnchorStatus:'source_default_objects_unavailable' as const
  };
  const domain=getSourceAnchorDomain(catalog,layoutId,gridIdNative);
  if(!domain||domain.gridDataPath!==gridDataPath)
    return unavailable;
  if(domain.status!=='raw_grid_dimensions_only'||
     domain.tessellationFactor!==1||
     domain.anchorSizeX!==sx||domain.anchorSizeY!==sy)
    return {originalDefaultAnchorCounts:null,
      originalDefaultAnchorStatus:'anchor_coordinates_not_compatible'};
  if(!catalog||typeof catalog!=='object'||
     !('layoutObjectsByGrid' in catalog)||
     !(catalog.layoutObjectsByGrid instanceof Map))
    return unavailable;
  const records=catalog.layoutObjectsByGrid.get(layoutId)?.get(gridIdNative);
  if(!Array.isArray(records)||records.length!==domain.defaultObjectCount)
    throw new TypeError('DB04_FLOOR_RECT_ORIGINAL_ANCHOR_COUNT_INVALID');
  const counts=new Uint16Array(sx*sy);
  for(const record of records){
    if(!record||typeof record!=='object'||record.layoutId!==layoutId||
      record.gridIdNative!==gridIdNative||
      !Number.isSafeInteger(record.x)||!Number.isSafeInteger(record.y))
      throw new TypeError('DB04_FLOOR_RECT_ORIGINAL_ANCHOR_INVALID');
    // Source-default anchors outside the raw GridData extent can be valid
    // metadata (or belong to another source-coordinate convention). Do not
    // turn them into false in-bounds obstacle markers or abort the floor map.
    if(record.x<0||record.y<0||record.x>=sx||record.y>=sy)
      return{originalDefaultAnchorCounts:null,
        originalDefaultAnchorStatus:'anchor_coordinates_not_compatible'};
    const at=record.y*sx+record.x;
    if(counts[at]===65535)
      throw new TypeError('DB04_FLOOR_RECT_ORIGINAL_ANCHOR_OVERFLOW');
    counts[at]++;
  }
  return{originalDefaultAnchorCounts:counts,
    originalDefaultAnchorStatus:'factor_one_source_anchors'};
}

export function getNativeFloorWindowResult(
  sourceCatalog:unknown,views:readonly WorldPreviewView[],
  regionKey:string,viewKey:string,gridIdNative:number,
  itemId:number,orientationCode:number,
  solve:FloorWindowMapper,
):NativeFloorWindowResult {
  const catalog=requireWorldPreviewCatalog(sourceCatalog);
  if(typeof regionKey!=='string'||regionKey.length<1||regionKey.length>256||
    typeof viewKey!=='string'||viewKey.length<1||viewKey.length>2048||
    !uintCheck(gridIdNative)||!uintCheck(itemId)||itemId===0||
    !Number.isSafeInteger(orientationCode)||
    orientationCode<0||orientationCode>15||!Array.isArray(views)||
    typeof solve!=='function')
    throw new TypeError('DB04_FLOOR_RECT_REQUEST_INVALID');
  const view=views.find(row=>row.regionKey===regionKey&&row.viewKey===viewKey);
  const selected=view?.grids.find(
    (grid:{readonly gridIdNative:number})=>grid.gridIdNative===gridIdNative);
  if(!selected)throw new TypeError('DB04_FLOOR_RECT_GRID_NOT_IN_REGION');
  const evidence=getOriginalGridAreaEvidence(catalog,itemId);
  const valid=evidence.status==='source_raw_gridarea_available';
  const bounds=valid?getOriginalGridAreaDisplayDimensions(
    evidence.rawSizeX!,evidence.rawSizeY!,orientationCode,1):null;
  const status:NativeFloorWindowResult['status']=valid
    ?'source_mapped_gridarea_floor_windows_only'
    :evidence.status==='source_version_not_verified'
    ?'source_game_version_unverified':'source_item_gridarea_unverified';
  // Reuse the original source-local orientation mapping, not a second
  // rotation implementation. Build the small mask once per item/rotation.
  let shape:Uint8Array|null=null;
  if(bounds){
    shape=new Uint8Array(bounds.width*bounds.height);
    for(let y=0;y<bounds.height;y+=16){
      for(let x=0;x<bounds.width;x+=16){
        const width=Math.min(16,bounds.width-x);
        const height=Math.min(16,bounds.height-y);
        const local=getOriginalGridAreaLocalWindow(catalog,itemId,
          orientationCode,x,y,width,height,1);
        if(local.status!=='source_native_local_layers'||!local.rows)
          throw new TypeError('DB04_FLOOR_SHAPE_SOURCE_MAPPING_INVALID');
        for(let dy=0;dy<height;dy++)for(let dx=0;dx<width;dx++)
          if(local.rows[dy][dx]!==null)
            shape[(y+dy)*bounds.width+x+dx]=1;
      }
    }
    if(!shape.includes(1))shape=null;
  }
  const refs=regionGridRefs(views,regionKey);
  const grids:NativeFloorWindowGrid[]=[];
  let verifiedGridCount=0,unresolvedGridCount=0;
  let sourceFloorCellCount=0,regionOrigins=0;
  let selectedGridOriginCount:number|null=null;
  let originBitmap:Uint8Array|null=null,bitmapWidth:number|null=null;
  let bitmapHeight:number|null=null;
  let originalDefaultAnchorCounts:Uint16Array|null=null;
  let originalDefaultAnchorStatus:
    NativeFloorWindowResult['originalDefaultAnchorStatus']=
      'source_default_objects_unavailable';

  for(const ref of refs){
    const raw=valid?getNativeTerrainRaster(catalog,ref.gridDataPath):null;
    const raster=raw?requireRaster(raw):null;
    if(!raster||!bounds||!shape){
      unresolvedGridCount++;
      grids.push({...ref,status:'source_floor_grid_unverified',
        sourceFloorCellCount:null,matchedWindowOriginCount:null});
      continue;
    }
    const {originBitmap:map,originCount}=solve(
      raster,evidence.acceptedFloorTypesFlag!,bounds.width,bounds.height,shape);
    if(!(map instanceof Uint8Array)||map.length!==raster.sizeX*raster.sizeY||
      !Number.isSafeInteger(originCount)||originCount<0||
      originCount>map.length)
      throw new TypeError('DB04_FLOOR_RECT_WASM_RESULT_INVALID');
    verifiedGridCount++;
    regionOrigins+=originCount;
    sourceFloorCellCount+=raster.sizeX*raster.sizeY;
    grids.push({...ref,status:'matched_original_floor_window',
      sourceFloorCellCount:raster.sizeX*raster.sizeY,
      matchedWindowOriginCount:originCount});
    if(ref.gridDataPath===selected.gridDataPath){
      selectedGridOriginCount=originCount;
      originBitmap=map;
      bitmapWidth=raster.sizeX;bitmapHeight=raster.sizeY;
      const anchor=sourceDefaultAnchorCounts(
        catalog,view.layoutId,gridIdNative,
        selected.gridDataPath,raster.sizeX,raster.sizeY);
      originalDefaultAnchorCounts=anchor.originalDefaultAnchorCounts;
      originalDefaultAnchorStatus=anchor.originalDefaultAnchorStatus;
    }
  }
  return {
    contract:NATIVE_FLOOR_WINDOW_CONTRACT,status,
    regionKey,viewKey,gridIdNative,gridDataPath:selected.gridDataPath,
    itemId,orientationCode,boundingWidth:bounds?.width??null,
    boundingHeight:bounds?.height??null,
    selectedGridOriginCount,
    regionOriginCount:unresolvedGridCount===0?regionOrigins:null,
    sourceFloorCellCount,verifiedGridCount,unresolvedGridCount,grids,
    originBitmap,bitmapWidth,bitmapHeight,originalDefaultAnchorCounts,
    originalDefaultAnchorStatus,
    sourceMappedGridAreaOnly:true,
    mappedShapeCellCount:shape?shape.reduce((a,b)=>a+b,0):null,
    mappedShape:shape,acceptedFloorTypesFlag:valid?evidence.acceptedFloorTypesFlag!:null,
    intrinsicGridFactor:1,
    nativeGridLayersOccupancyVerified:false,
    defaultObjectFootprintsVerified:false,
    actualGamePlacementVerified:false,
    worldCoordinatesVerified:false,saveOccupancyVerified:false,
    saveWritingAuthorized:false
  };
}
