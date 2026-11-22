/**
 * Source-only Steam 1.26.2 GridArea.get_Item and intrinsic cardinal
 * TryGetGridLocalPosition projection (1:1 AREA-local factor). Source-native
 * instructions were independently compared with pinned Steam 1.26.1:
 * 0x0600343F and 0x0600344A have relocation-only code changes.
 *
 * This DOES NOT map a GridArea to a SceneLayouts anchor or saved Grid,
 * prove item GridArea factory/grid tessellation ratio, physical occupancy,
 * collisions, terrain permissions, or safe placement. No writes.
 */
import {
  getOriginalGridAreaEvidence,
  type OriginalGridAreaStatus
} from './native-gridarea-evidence.ts';

export const DB04_SOURCE_LOCAL_GRIDAREA_WINDOW =
  'wand.db04.original-gridarea-local-window@1' as const;
export type SourceLocalGridAreaStatus =
  'source_native_local_layers'|'unsupported_intrinsic_orientation'|
  OriginalGridAreaStatus;

export interface SourceLocalGridAreaWindow {
  readonly contract:typeof DB04_SOURCE_LOCAL_GRIDAREA_WINDOW;
  readonly status:SourceLocalGridAreaStatus;
  readonly itemId:number;
  readonly orientationCode:number;
  readonly orientedSizeX:number|null;
  readonly orientedSizeY:number|null;
  readonly rect:Readonly<{x:number;y:number;width:number;height:number}>|null;
  readonly rows:readonly (readonly number[])[]|null;
  readonly coordinateBasis:'isolated_original_gridarea_local_1_to_1_only';
  readonly steam1262GetterReadPathCorroborated:boolean;
  readonly steam1262CardinalIntrinsicMappingCorroborated:boolean;
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

function result(
  status:SourceLocalGridAreaStatus,itemId:number,orientationCode:number,
  sizeX:number|null,sizeY:number|null,
  rect:SourceLocalGridAreaWindow['rect'],
  rows:SourceLocalGridAreaWindow['rows']
):SourceLocalGridAreaWindow {
  const isValid=status==='source_native_local_layers';
  return Object.freeze({
    contract:DB04_SOURCE_LOCAL_GRIDAREA_WINDOW,
    status,itemId,orientationCode,
    orientedSizeX:sizeX,orientedSizeY:sizeY,
    rect,rows,
    coordinateBasis:'isolated_original_gridarea_local_1_to_1_only' as const,
    steam1262GetterReadPathCorroborated:isValid,
    steam1262CardinalIntrinsicMappingCorroborated:isValid,
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
 * A maximum 16×16 bounded read-only matrix of LITERAL GridLayers uint32s.
 * Orientation applies the original GridArea cardinal transform in an
 * isolated 1:1 area-local frame, NOT the live GridObject's placement.
 */
export function getOriginalGridAreaLocalWindow(
  source:unknown,itemId:number,orientationCode:number,
  x:number,y:number,width:number,height:number
):SourceLocalGridAreaWindow {
  if(!int(orientationCode)||orientationCode<0||orientationCode>15||
     ![x,y,width,height].every(int)||x<0||y<0||
     width<1||height<1||width>16||height>16)
    throw new TypeError('DB04_GRIDAREA_LOCAL_WINDOW_INVALID_REQUEST');
  const evidence=getOriginalGridAreaEvidence(source,itemId);
  if(evidence.status!=='source_raw_gridarea_available')
    return result(evidence.status,itemId,orientationCode,null,null,null,null);
  if(!CARDINAL.has(orientationCode))
    return result('unsupported_intrinsic_orientation',
      itemId,orientationCode,null,null,null,null);
  const sx=evidence.rawSizeX!,sy=evidence.rawSizeY!;
  const swap=orientationCode===4||orientationCode===12;
  const nx=swap?sy:sx,ny=swap?sx:sy;
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
  const rows:readonly (readonly number[])[]=[];
  const generated:number[][]=[];
  for(let iy=y;iy<y+height;iy++){
    const row:number[]=[];
    for(let ix=x;ix<x+width;ix++){
      // The 1.26.2 source getter resolves layer[x*SizeY+y].
      // Cardinal mapping is confined to a hypothetical 1:1 Area frame.
      const lx=orientationCode===0?sx-1-ix:
        orientationCode===4?iy:
        orientationCode===12?sx-1-iy:ix;
      const ly=orientationCode===0?sy-1-iy:
        orientationCode===4?sy-1-ix:
        orientationCode===12?ix:iy;
      if(lx<0||ly<0||lx>=sx||ly>=sy)
        throw new TypeError('DB04_GRIDAREA_LOCAL_NATIVE_TRANSFORM_OUT_OF_RANGE');
      const raw=layers[lx*sy+ly];
      if(!Number.isSafeInteger(raw)||raw<0||raw>0xffffffff)
        throw new TypeError('DB04_GRIDAREA_LOCAL_INVALID_NATIVE_LAYER');
      row.push(raw);
    }
    generated.push(row);
  }
  const immutableRows=Object.freeze(generated.map(row=>Object.freeze(row)));
  return result('source_native_local_layers',itemId,orientationCode,nx,ny,
    Object.freeze({x,y,width,height}),immutableRows);
}
