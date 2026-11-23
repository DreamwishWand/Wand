/**
 * DB-04 original native floor-mask compatibility evidence.
 *
 * A bit overlap between GridData.FloorTypes and an item's original
 * GridAreaData.AcceptedFloorTypesFlag is a SOURCE-LEVEL COMPARISON ONLY.
 * The v1.26.2 placement predicate is unverified. No furniture footprint,
 * collision, special-case edits, grid transforms or Save occupancy are used.
 *
 * This is intentionally named "floor mask overlap", not placeable cells.
 */
import {
  getNativeTerrainDistribution,getNativeTerrainRaster,
} from './native-terrain-preview.ts';
import {regionGridRefs} from './native-region-grid-atlas.ts';
import {requireWorldPreviewCatalog,type WorldPreviewView} from './preview-views.ts';

export const FLOOR_MASK_MATCH_CONTRACT=
  'wand.db04.original-floor-mask-bit-overlap@1' as const;

type Row=Record<string,unknown>;
type SourceCatalog={manifest:Row;objects:Map<string,Row>};
const isRecord=(v:unknown):v is Row=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const isUint=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
const isSmall=(v:unknown):v is number=>isUint(v)&&v>0&&v<=256;
const isIndex=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;

function source(value:unknown):SourceCatalog{
  requireWorldPreviewCatalog(value);
  if(!isRecord(value)||!isRecord(value.manifest)||
    !(value.objects instanceof Map))
    throw new TypeError('DB04_FLOOR_SOURCE_CATALOG_INVALID');
  return value as unknown as SourceCatalog;
}
export function nativeFloorOverlap(floorMask:number,acceptedFloorTypesFlag:number):boolean {
  if(!isUint(floorMask)||!isUint(acceptedFloorTypesFlag))
    throw new TypeError('DB04_NATIVE_FLOOR_FLAGS_INVALID');
  return ((floorMask&acceptedFloorTypesFlag)>>>0)!==0;
}
export interface OriginalFloorItem {
  readonly itemId:number;
  readonly nativeName:string;
  readonly nativeType:'Furniture'|'Building';
  readonly sizeX:number;
  readonly sizeY:number;
  readonly acceptedFloorTypesFlag:number;
}
function acceptedItem(catalog:SourceCatalog,itemId:number):OriginalFloorItem|null {
  if(!isUint(itemId)||itemId===0)
    throw new TypeError('DB04_NATIVE_FLOOR_ITEM_INVALID');
  const object=catalog.objects.get(String(itemId));
  if(!object)return null;
  if(!isRecord(object)||object.itemId!==itemId||
    (object.nativeType!=='Furniture'&&object.nativeType!=='Building')||
    typeof object.nativeName!=='string'||
    object.nativeName.length===0||object.nativeName.length>300)
    throw new TypeError('DB04_NATIVE_FLOOR_ITEM_IDENTITY_INVALID');
  const fp=object.footprint;
  if(fp===null)return null;
  if(!isRecord(fp)||!isSmall(fp.sizeX)||!isSmall(fp.sizeY)||
    fp.sizeX*fp.sizeY>16384||!isUint(fp.acceptedFloorTypesFlag)||
    !Array.isArray(fp.layerValues)||
    fp.layerValues.length!==fp.sizeX*fp.sizeY||
    fp.cellIndexToXYVerified!==false||
    fp.layerMaskSemanticsVerified!==false)
    throw new TypeError('DB04_NATIVE_FLOOR_ITEM_FOOTPRINT_INVALID');
  return {
    itemId,nativeName:object.nativeName,
    nativeType:object.nativeType,
    sizeX:fp.sizeX,sizeY:fp.sizeY,
    acceptedFloorTypesFlag:fp.acceptedFloorTypesFlag,
  };
}
function versionVerified(catalog:SourceCatalog):boolean {
  return catalog.manifest.gameVersion==='1.26.2'&&
    catalog.manifest.platform==='Steam';
}

/** Bound responses to 30 user-visible names, with no raw source arrays. */
export function searchNativeFloorItems(sourceCatalog:unknown,query:string,
  limit=30):OriginalFloorItem[]{
  const catalog=source(sourceCatalog);
  if(typeof query!=='string'||query.length>100||
      !isIndex(limit)||limit<1||limit>30)
    throw new TypeError('DB04_NATIVE_FLOOR_SEARCH_INVALID');
  if(query.trim().length<2||!versionVerified(catalog))return [];
  const needle=query.trim().toLocaleLowerCase('en');
  const out:OriginalFloorItem[]=[];
  for(const [id,row] of catalog.objects) {
    if(!isRecord(row)||typeof row.nativeName!=='string'||
      !row.nativeName.toLocaleLowerCase('en').includes(needle))
      continue;
    const parsed=Number(id);
    if(!isUint(parsed)||parsed===0)continue;
    const item=acceptedItem(catalog,parsed);
    if(item)out.push(item);
    if(out.length>=limit)break;
  }
  return out;
}

export interface NativeFloorMatchGrid {
  readonly viewKey:string;
  readonly gridIdNative:number;
  readonly gridDataPath:string;
  readonly areaName:string;
  readonly status:'native_floor_mask_overlap_observed'|'source_floor_mask_unavailable';
  readonly totalSourceCells:number|null;
  readonly overlappingSourceCells:number|null;
}
export interface NativeFloorMatchResult {
  readonly contract:typeof FLOOR_MASK_MATCH_CONTRACT;
  readonly status:'source_floor_mask_overlap_only'|
    'item_has_no_source_footprint'|'source_version_not_verified';
  readonly item:OriginalFloorItem|null;
  readonly regionKey:string;
  readonly gridDataPath:string;
  readonly selectedGridOverlapCount:number|null;
  readonly regionSourceOverlapCount:number|null;
  readonly regionSourceCellCount:number;
  readonly matchingGridDataCount:number;
  readonly unresolvedGridDataCount:number;
  readonly grids:readonly NativeFloorMatchGrid[];
  readonly raster:Uint8Array|null;
  readonly rasterSizeX:number|null;
  readonly rasterSizeY:number|null;
  readonly floorMaskComparisonVerified:true;
  readonly nativePlacementPredicateVerified:false;
  readonly furnitureFootprintTested:false;
  readonly originalObjectOccupancyTested:false;
  readonly worldCoordinatesVerified:false;
  readonly placementLegalityVerified:false;
}
/**
 * Counts each actual GridData once even where multiple original layout
 * references point at it. Counts selected item/terrain floor MASK BIT
 * overlap, not all footprints that fit or actual legal/empty cells.
 */
export function getNativeFloorMatchResult(
  sourceCatalog:unknown,
  views:readonly WorldPreviewView[],regionKey:string,
  viewKey:string,gridIdNative:number,itemId:number,
):NativeFloorMatchResult{
  const catalog=source(sourceCatalog);
  if(typeof regionKey!=='string'||regionKey.length>256||
     typeof viewKey!=='string'||viewKey.length>2048||
     !isUint(gridIdNative)||!isUint(itemId)||itemId===0||
     !Array.isArray(views))
    throw new TypeError('DB04_NATIVE_FLOOR_MATCH_REQUEST_INVALID');
  const current=views.find(view=>view.viewKey===viewKey&&
    view.regionKey===regionKey);
  const selected=current?.grids.find(
    (grid:{readonly gridIdNative:number})=>grid.gridIdNative===gridIdNative);
  if(!selected)throw new TypeError('DB04_NATIVE_FLOOR_MATCH_VIEW_INVALID');
  const refs=regionGridRefs(views,regionKey);
  const item=versionVerified(catalog)?acceptedItem(catalog,itemId):null;
  const status:NativeFloorMatchResult['status']=!versionVerified(catalog)
    ?'source_version_not_verified'
    :item===null?'item_has_no_source_footprint'
    :'source_floor_mask_overlap_only';
  let regionSourceCellCount=0;
  let regionSourceOverlapCount=0;
  let unresolvedGridDataCount=0;
  let matchingGridDataCount=0;
  let selectedGridOverlapCount:number|null=null;
  const grids:NativeFloorMatchGrid[]=[];
  for(const ref of refs) {
    const distribution=item?getNativeTerrainDistribution(
      catalog,ref.gridDataPath):{status:'missing_item'};
    const values=distribution.status==='source_corroborated_grid_local_summary'
      ?distribution.values:undefined;
    if(!Array.isArray(values)||typeof distribution.totalCells!=='number'||
       !Number.isSafeInteger(distribution.totalCells)||distribution.totalCells<1) {
      unresolvedGridDataCount++;
      grids.push({...ref,status:'source_floor_mask_unavailable',
        totalSourceCells:null,overlappingSourceCells:null});
      continue;
    }
    let overlap=0;
    let verifiedCount=0;
    for(const row of values){
      if(!isRecord(row)||!isUint(row.nativeValue)||
          !isIndex(row.cellCount))
        throw new TypeError('DB04_NATIVE_FLOOR_DISTRIBUTION_INVALID');
      verifiedCount+=row.cellCount;
      if(nativeFloorOverlap(row.nativeValue,item!.acceptedFloorTypesFlag))
        overlap+=row.cellCount;
    }
    if(verifiedCount!==distribution.totalCells)
      throw new TypeError('DB04_NATIVE_FLOOR_DISTRIBUTION_MISMATCH');
    regionSourceCellCount+=distribution.totalCells;
    regionSourceOverlapCount+=overlap;
    matchingGridDataCount++;
    if(ref.gridDataPath===selected.gridDataPath)
      selectedGridOverlapCount=overlap;
    grids.push({...ref,status:'native_floor_mask_overlap_observed',
      totalSourceCells:distribution.totalCells,overlappingSourceCells:overlap});
  }
  let raster:Uint8Array|null=null;
  let rasterSizeX:number|null=null,rasterSizeY:number|null=null;
  if(item&&selectedGridOverlapCount!==null){
    const sourceRaster=getNativeTerrainRaster(catalog,selected.gridDataPath);
    if(sourceRaster.status==='source_corroborated_grid_local_raster'&&
      sourceRaster.nativeFloorValues instanceof Uint32Array&&
      typeof sourceRaster.sizeX==='number'&&
      typeof sourceRaster.sizeY==='number'&&
      typeof sourceRaster.totalCells==='number'&&
      sourceRaster.nativeFloorValues.length===sourceRaster.totalCells) {
      raster=new Uint8Array(sourceRaster.totalCells);
      let observed=0;
      for(let i=0;i<raster.length;i++){
        if(nativeFloorOverlap(sourceRaster.nativeFloorValues[i],
          item.acceptedFloorTypesFlag)){
          raster[i]=1;
          observed++;
        }
      }
      if(observed!==selectedGridOverlapCount)
        throw new TypeError('DB04_NATIVE_FLOOR_RASTER_SUMMARY_MISMATCH');
      rasterSizeX=sourceRaster.sizeX;
      rasterSizeY=sourceRaster.sizeY;
    }
  }
  return {
    contract:FLOOR_MASK_MATCH_CONTRACT,status,item,regionKey,
    gridDataPath:selected.gridDataPath,
    selectedGridOverlapCount,regionSourceOverlapCount:
      unresolvedGridDataCount===0?regionSourceOverlapCount:null,
    regionSourceCellCount,matchingGridDataCount,unresolvedGridDataCount,
    grids,raster,rasterSizeX,rasterSizeY,
    floorMaskComparisonVerified:true,
    nativePlacementPredicateVerified:false,
    furnitureFootprintTested:false,
    originalObjectOccupancyTested:false,
    worldCoordinatesVerified:false,
    placementLegalityVerified:false,
  };
}
