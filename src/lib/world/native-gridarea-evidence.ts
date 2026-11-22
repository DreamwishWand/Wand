/**
 * DB-04 source-only Item GridArea evidence, reusable by World/Decorate/Presets.
 *
 * Reports bounded counts of original GridAreaData fixed32 array slots and
 * original wire fields. These are NOT a two-dimensional occupancy bitmap:
 * Steam v1.26.2 GridArea cell indexing, rotation, tessellation, accepted-floor
 * semantics, collision and edit permission have NOT been established.
 * Owner-private original records never leave the local World Worker.
 */
export const DB04_ORIGINAL_GRIDAREA_EVIDENCE =
  'wand.db04.original-gridarea-raw-evidence@1' as const;

export type OriginalGridAreaStatus =
  | 'source_raw_gridarea_available'
  | 'item_not_in_partial_original_source'
  | 'item_has_no_source_gridarea'
  | 'source_version_not_verified';

export interface OriginalGridAreaEvidence {
  readonly contract:typeof DB04_ORIGINAL_GRIDAREA_EVIDENCE;
  readonly status:OriginalGridAreaStatus;
  readonly itemId:number;
  readonly sourceGameVersion:string|null;
  readonly nativeType:string|null;
  readonly rawSizeX:number|null;
  readonly rawSizeY:number|null;
  readonly rawLayerSlotCount:number;
  readonly nonzeroRawLayerSlotCount:number;
  readonly distinctRawLayerValueCount:number;
  readonly mostFrequentRawValues:readonly Readonly<{
    value:number;count:number;
  }>[];
  readonly acceptedFloorTypesFlag:number|null;
  readonly strideOverride:number|null;
  readonly strideOverrideWireFieldPresent:boolean;
  readonly sourceCoordinateBasis:'unprojected_original_gridarea_fixed32_array';
  readonly rawGridAreaCellMappingVerified:false;
  readonly rawNonzeroMeansOccupiedVerified:false;
  readonly nativeFloorTypePermissionVerified:false;
  readonly rotationMappingVerified:false;
  readonly placementLegalityVerified:false;
  readonly saveWriterAuthorized:false;
  readonly originalSourceAuthenticationVerified:false;
}
type Row=Record<string,unknown>;
type Catalog={manifest:Row;objects:Map<string,Row>};
const obj=(v:unknown):v is Row=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const uint=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
const small=(v:unknown):v is number=>uint(v)&&v>0&&v<=256;
const source=(value:unknown):Catalog=>{
  if(!obj(value)||!obj(value.manifest)||!(value.objects instanceof Map))
    throw new TypeError('DB04_GRIDAREA_SOURCE_CATALOG_INVALID');
  return value as unknown as Catalog;
};
function empty(
  status:OriginalGridAreaStatus,itemId:number,version:string|null,
  nativeType:string|null
):OriginalGridAreaEvidence{
  return Object.freeze({
    contract:DB04_ORIGINAL_GRIDAREA_EVIDENCE,status,itemId,
    sourceGameVersion:version,nativeType,rawSizeX:null,rawSizeY:null,
    rawLayerSlotCount:0,nonzeroRawLayerSlotCount:0,
    distinctRawLayerValueCount:0,mostFrequentRawValues:Object.freeze([]),
    acceptedFloorTypesFlag:null,strideOverride:null,
    strideOverrideWireFieldPresent:false,
    sourceCoordinateBasis:'unprojected_original_gridarea_fixed32_array' as const,
    rawGridAreaCellMappingVerified:false as const,
    rawNonzeroMeansOccupiedVerified:false as const,
    nativeFloorTypePermissionVerified:false as const,
    rotationMappingVerified:false as const,
    placementLegalityVerified:false as const,
    saveWriterAuthorized:false as const,
    originalSourceAuthenticationVerified:false as const
  });
}

/** One bounded summary for an exact Item ID; no source arrays are returned. */
export function getOriginalGridAreaEvidence(
  catalogValue:unknown,itemId:number
):OriginalGridAreaEvidence{
  if(!uint(itemId)||itemId===0)
    throw new TypeError('DB04_GRIDAREA_SOURCE_ITEM_ID_INVALID');
  const catalog=source(catalogValue);
  const v=catalog.manifest.gameVersion;
  const version=typeof v==='string'?v:null;
  if(version!=='1.26.2'||catalog.manifest.platform!=='Steam')
    return empty('source_version_not_verified',itemId,version,null);
  const row=catalog.objects.get(String(itemId));
  if(!row)return empty('item_not_in_partial_original_source',
    itemId,version,null);
  if(!obj(row)||row.itemId!==itemId||
    typeof row.nativeType!=='string'||row.nativeType.length>128)
    throw new TypeError('DB04_GRIDAREA_SOURCE_ITEM_DEFINITION_INVALID');
  const kind=row.nativeType as string;
  if(row.footprint===null)return empty('item_has_no_source_gridarea',
    itemId,version,kind);
  const a=row.footprint;
  if(!obj(a)||!small(a.sizeX)||!small(a.sizeY)||
     a.sizeX*a.sizeY>16384||
     !Array.isArray(a.layerValues)||
     a.layerValues.length!==a.sizeX*a.sizeY||
     !uint(a.acceptedFloorTypesFlag)||
     a.cellIndexToXYVerified!==false||
     a.layerMaskSemanticsVerified!==false||
     !obj(a.nativeWireFields)||
     a.nativeWireFields.sizeX!=='6.1'||
     a.nativeWireFields.sizeY!=='6.2'||
     a.nativeWireFields.layerValues!=='6.3'||
     a.nativeWireFields.acceptedFloorTypesFlag!=='6.4')
    throw new TypeError('DB04_GRIDAREA_ORIGINAL_WIRE_FIELDS_INVALID');

  const stridePresent=a.strideOverrideSourceVerified===true;
  if((a.strideOverrideSourceVerified!==undefined&&
      typeof a.strideOverrideSourceVerified!=='boolean')||
     (stridePresent&&(
       a.nativeWireFields.strideOverride!=='6.5'||
       typeof a.strideOverride!=='number'||
       !Number.isSafeInteger(a.strideOverride)||
       a.strideOverride< -2147483648||
       a.strideOverride>2147483647))||
     (!stridePresent&&a.strideOverride!=null))
    throw new TypeError('DB04_GRIDAREA_STRIDE_SOURCE_INVALID');
  const histogram=new Map<number,number>();
  let nonzero=0;
  for(const raw of a.layerValues as unknown[]){
    if(!uint(raw))
      throw new TypeError('DB04_GRIDAREA_RAW_LAYER_VALUE_INVALID');
    if(raw!==0)nonzero++;
    histogram.set(raw,(histogram.get(raw)??0)+1);
  }
  const mostFrequentRawValues=Object.freeze([...histogram].sort((p,q)=>
    q[1]-p[1]||p[0]-q[0]).slice(0,8).map(([value,count])=>
      Object.freeze({value,count})));
  return Object.freeze({
    contract:DB04_ORIGINAL_GRIDAREA_EVIDENCE,
    status:'source_raw_gridarea_available' as const,
    itemId,sourceGameVersion:version,nativeType:kind,
    rawSizeX:a.sizeX,rawSizeY:a.sizeY,
    rawLayerSlotCount:a.layerValues.length,
    nonzeroRawLayerSlotCount:nonzero,
    distinctRawLayerValueCount:histogram.size,
    mostFrequentRawValues,
    acceptedFloorTypesFlag:a.acceptedFloorTypesFlag as number,
    strideOverride:stridePresent?a.strideOverride as number:null,
    strideOverrideWireFieldPresent:stridePresent,
    sourceCoordinateBasis:'unprojected_original_gridarea_fixed32_array' as const,
    rawGridAreaCellMappingVerified:false as const,
    rawNonzeroMeansOccupiedVerified:false as const,
    nativeFloorTypePermissionVerified:false as const,
    rotationMappingVerified:false as const,
    placementLegalityVerified:false as const,
    saveWriterAuthorized:false as const,
    originalSourceAuthenticationVerified:false as const
  });
}
