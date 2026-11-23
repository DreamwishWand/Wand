/**
 * Source-only Steam v1.26.2 original GridArea cell lookup for all 16 source
 * orientation codes, with an EXPLICIT hypothetical caller grid factor 1/2.
 *
 * Pinned IL2CPP v31 native methods + bounded original PE64 code comparison:
 * GridAreaData.GetGridArea, GridArea.get_Item, TryGetGridLocalPosition,
 * MoreRotationGetGridLocalPosition, MoreRotationSize, GetUnRotated, Cos/Sin
 * and .cctor. Actual saved/source placed-object-to-GridArea transform is
 * NOT verified. GridLayers values are NOT occupied cells or permissions.
 */
import {
  getOriginalGridAreaEvidence,
  type OriginalGridAreaStatus
} from './native-gridarea-evidence.ts';
import {
  GRIDAREA_ROT_COS, GRIDAREA_ROT_SIN,
  nativeObliqueSourceLocalPosition
} from './native-oblique.ts';

export const DB04_SOURCE_LOCAL_GRIDAREA_WINDOW=
  'wand.db04.original-gridarea-local-window@1' as const;
export type SourceLocalGridAreaStatus=
  'source_native_local_layers'|'unsupported_intrinsic_orientation'|
  OriginalGridAreaStatus;
export interface SourceLocalGridAreaWindow {
  readonly contract:typeof DB04_SOURCE_LOCAL_GRIDAREA_WINDOW;
  readonly status:SourceLocalGridAreaStatus;
  readonly itemId:number;
  readonly orientationCode:number;
  readonly callerGridFactor:1|2;
  readonly orientedSizeX:number|null;
  readonly orientedSizeY:number|null;
  readonly rect:Readonly<{x:number;y:number;width:number;height:number}>|null;
  readonly rows:readonly (readonly (number|null)[])[]|null;
  readonly unmappedOriginalLocalCellCount:number;
  readonly nullMeansUnmappedNotFree:true;
  readonly coordinateBasis:
    'isolated_original_gridarea_local_1_to_1_only'|
    'isolated_original_gridarea_local_explicit_factor_only';
  readonly steam1262GetterReadPathCorroborated:boolean;
  readonly steam1262CardinalIntrinsicMappingCorroborated:boolean;
  readonly steam1262ObliqueIntrinsicMappingCorroborated:boolean;
  readonly steam1262GridAreaDataFactoryFactorOneCorroborated:boolean;
  readonly actualGridToAreaTessellationRatioVerified:false;
  readonly nativeGridObjectAnchorTransformVerified:false;
  readonly occupancyPredicateVerified:false;
  readonly collisionRulesVerified:false;
  readonly placementLegalityVerified:false;
  readonly saveWritingAuthorized:false;
  readonly originalSourceAuthenticationVerified:false;
}
type RecordValue=Record<string,unknown>;
const obj=(v:unknown):v is RecordValue=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const int=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v);
const CARDINAL=new Set([0,4,8,12]);
// Rotation coefficients and noncardinal source mapping are shared with
// the original legacy catalog through native-oblique.ts; do not fork math.

function result(
  status:SourceLocalGridAreaStatus,itemId:number,orientationCode:number,
  factor:1|2,sizeX:number|null,sizeY:number|null,
  rect:SourceLocalGridAreaWindow['rect'],
  rows:SourceLocalGridAreaWindow['rows'],unmapped:number
):SourceLocalGridAreaWindow {
  const good=status==='source_native_local_layers';
  return Object.freeze({
    contract:DB04_SOURCE_LOCAL_GRIDAREA_WINDOW,status,itemId,orientationCode,
    callerGridFactor:factor,orientedSizeX:sizeX,orientedSizeY:sizeY,
    rect,rows,unmappedOriginalLocalCellCount:unmapped,
    nullMeansUnmappedNotFree:true as const,
    coordinateBasis:factor===1
      ?'isolated_original_gridarea_local_1_to_1_only' as const
      :'isolated_original_gridarea_local_explicit_factor_only' as const,
    steam1262GetterReadPathCorroborated:good,
    steam1262CardinalIntrinsicMappingCorroborated:good&&CARDINAL.has(orientationCode),
    steam1262ObliqueIntrinsicMappingCorroborated:good&&!CARDINAL.has(orientationCode),
    steam1262GridAreaDataFactoryFactorOneCorroborated:good,
    actualGridToAreaTessellationRatioVerified:false as const,
    nativeGridObjectAnchorTransformVerified:false as const,
    occupancyPredicateVerified:false as const,
    collisionRulesVerified:false as const,
    placementLegalityVerified:false as const,
    saveWritingAuthorized:false as const,
    originalSourceAuthenticationVerified:false as const
  });
}
/**
 * Native GridArea.GetSizeForOrientation base bounding dimensions (not
 * occupancy). For oblique branches, preserve x86 signed-int arithmetic and
 * integer truncation; source sizes <=256 cannot overflow the products.
 */
function originalOrientedBaseSize(sx:number,sy:number,orientation:number){
  if(orientation===0||orientation===8)return {x:sx,y:sy};
  if(orientation===4||orientation===12)return {x:sy,y:sx};
  const c=Math.abs(GRIDAREA_ROT_COS[orientation]),s=Math.abs(GRIDAREA_ROT_SIN[orientation]);
  return {
    x:Math.trunc((Math.imul(c,sx)+Math.imul(s,sy))/100),
    y:Math.trunc((Math.imul(c,sy)+Math.imul(s,sx))/100)
  };
}
/** Native intrinsic bounding dimensions, not an object occupancy or world extent. */
export function getOriginalGridAreaDisplayDimensions(
  sizeX:number,sizeY:number,orientationCode:number,callerGridFactor:1|2=1
):Readonly<{width:number;height:number}> {
  if(!int(sizeX)||!int(sizeY)||sizeX<1||sizeY<1||
     sizeX>256||sizeY>256||sizeX*sizeY>16384||
     !int(orientationCode)||orientationCode<0||orientationCode>15||
     (callerGridFactor!==1&&callerGridFactor!==2))
    throw new TypeError('DB04_GRIDAREA_INTRINSIC_DIMENSIONS_INVALID');
  const base=originalOrientedBaseSize(sizeX,sizeY,orientationCode);
  return Object.freeze({
    width:base.x*callerGridFactor,
    height:base.y*callerGridFactor
  });
}
function originalLayerCoordinates(
  sx:number,sy:number,
  x:number,y:number,orientation:number
):Readonly<{x:number;y:number}>|null {
  if(CARDINAL.has(orientation)){
    const lx=orientation===0?sx-1-x:
      orientation===4?y:
      orientation===12?sx-1-y:x;
    const ly=orientation===0?sy-1-y:
      orientation===4?sy-1-x:
      orientation===12?x:y;
    return lx<0||ly<0||lx>=sx||ly>=sy?null:{x:lx,y:ly};
  }
  // Original ratio=1 local cell math lives in a single source-pinned
  // TypeScript implementation. The outer caller handles explicit grid
  // tessellation by sampling floor(x/factor), floor(y/factor).
  const mapped=nativeObliqueSourceLocalPosition(sx,sy,x,y,orientation);
  return mapped.inside
    ?{x:mapped.originalLocalX,y:mapped.originalLocalY}:null;
}

/** Max 16×16 literal raw source values, never a physical occupancy map. */
export function getOriginalGridAreaLocalWindow(
  source:unknown,itemId:number,orientationCode:number,
  x:number,y:number,width:number,height:number,
  callerGridFactor:1|2=1
):SourceLocalGridAreaWindow {
  if(!int(orientationCode)||orientationCode<0||orientationCode>15||
     ![x,y,width,height].every(int)||x<0||y<0||
     width<1||height<1||width>16||height>16||
     (callerGridFactor!==1&&callerGridFactor!==2))
    throw new TypeError('DB04_GRIDAREA_LOCAL_WINDOW_INVALID_REQUEST');
  const evidence=getOriginalGridAreaEvidence(source,itemId);
  if(evidence.status!=='source_raw_gridarea_available')
    return result(evidence.status,itemId,orientationCode,callerGridFactor,
      null,null,null,null,0);
  const sx=evidence.rawSizeX!,sy=evidence.rawSizeY!;
  const base=originalOrientedBaseSize(sx,sy,orientationCode);
  const nx=base.x*callerGridFactor,ny=base.y*callerGridFactor;
  if(x+width>nx||y+height>ny)
    throw new TypeError('DB04_GRIDAREA_LOCAL_WINDOW_OUT_OF_RANGE');
  if(!obj(source)||!(source.objects instanceof Map))
    throw new TypeError('DB04_GRIDAREA_LOCAL_SOURCE_INVALID');
  const entry=source.objects.get(String(itemId)) as unknown;
  if(!obj(entry)||!obj(entry.footprint)||
     !Array.isArray(entry.footprint.layerValues)||
     entry.footprint.layerValues.length!==sx*sy)
    throw new TypeError('DB04_GRIDAREA_LOCAL_SOURCE_INCONSISTENT');
  const layers=entry.footprint.layerValues as readonly number[];
  const generated:(number|null)[][]=[];
  let unmapped=0;
  for(let iy=y;iy<y+height;iy++){
    const row:(number|null)[]=[];
    for(let ix=x;ix<x+width;ix++){
      const local=originalLayerCoordinates(sx,sy,
        Math.floor(ix/callerGridFactor),Math.floor(iy/callerGridFactor),
        orientationCode);
      if(!local){
        row.push(null);unmapped++;continue;
      }
      const raw=layers[local.x*sy+local.y];
      if(!Number.isSafeInteger(raw)||raw<0||raw>0xffffffff)
        throw new TypeError('DB04_GRIDAREA_LOCAL_INVALID_NATIVE_LAYER');
      row.push(raw);
    }
    generated.push(row);
  }
  const immutableRows=Object.freeze(generated.map(row=>Object.freeze(row)));
  return result('source_native_local_layers',itemId,orientationCode,
    callerGridFactor,nx,ny,
    Object.freeze({x,y,width,height}),immutableRows,unmapped);
}
