/**
 * DB-04 source-grid atlas: every source-referenced GridData has an independent
 * local origin. Cards make their individual floor masks and counts inspectable
 * without inventing shared World coordinates or furniture placement permission.
 */
import {getNativeTerrainRaster} from './native-terrain-preview.ts';
import {
  requireWorldPreviewCatalog,
  type WorldPreviewView,
} from './preview-views.ts';

export interface SourceRegionAtlasTile {
  readonly viewKey:string;
  readonly gridIdNative:number;
  readonly gridDataPath:string;
  readonly areaName:string;
  readonly sourceReferenceCount:number;
  readonly status:string;
  readonly sizeX:number|null;
  readonly sizeY:number|null;
  readonly totalCells:number|null;
  readonly zeroMaskCells:number|null;
  readonly nonzeroMaskCells:number|null;
  readonly previewWidth:number;
  readonly previewHeight:number;
  readonly previewValues:Uint32Array|null;
  readonly worldCoordinatesVerified:false;
  readonly placementLegalityVerified:false;
}
export interface SourceRegionAtlasPage {
  readonly status:'source_region_grid_atlas';
  readonly regionKey:string;
  readonly offset:number;
  readonly totalGridDataRecords:number;
  readonly knownGridDataRecords:number;
  readonly sourceGridCells:number;
  readonly missingGridDataRecords:number;
  readonly tiles:readonly SourceRegionAtlasTile[];
  readonly nextOffset:number|null;
  readonly sharedWorldCoordinatesVerified:false;
  readonly furniturePlacementLegalityVerified:false;
  readonly sourceWorldCoverageComplete:false;
}
type GridRef ={
  viewKey:string;gridIdNative:number;gridDataPath:string;
  areaName:string;sourceReferenceCount:number;
};
const safePositive=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
const safeIndex=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;

/**
 * Original native GridData is not an AreaType placement layer. When the
 * same GridData is referenced by both a GridCollection and a Village Area,
 * show it ONCE under the richer native Village Area reference.
 */
function regionGridRefs(views:readonly WorldPreviewView[],regionKey:string):GridRef[]{
  const relevant=views.filter(view=>view.regionKey===regionKey);
  const ordered=[...relevant].sort((a,b)=>
    Number(b.kind==='villageArea')-Number(a.kind==='villageArea')||
    (a.kind==='villageArea'&&b.kind==='villageArea'
      ?a.nativeAreaTypeCode-b.nativeAreaTypeCode:0)||
    a.layoutId.localeCompare(b.layoutId,'en'));
  const byPath=new Map<string,GridRef>();
  for(const view of ordered){
    for(const grid of view.grids){
      if(typeof grid.gridDataPath!=='string'||
        !grid.gridDataPath.startsWith('GridData/')||
        !grid.gridDataPath.endsWith('.json')||
        grid.gridDataPath.includes('..')||grid.gridDataPath.includes('\\')||
        !safeIndex(grid.gridIdNative)||grid.gridIdNative>0xffffffff)
        throw new TypeError('DB04_ATLAS_INVALID_SOURCE_GRID_REFERENCE');
      const previous=byPath.get(grid.gridDataPath);
      if(previous){
        previous.sourceReferenceCount++;
        continue;
      }
      const name=view.kind==='villageArea'
        ?(view.nativeAreaTypeName??`Area ${view.nativeAreaTypeCode}`)
        :grid.gridDataPath.split('/').at(-1)!.replace(/(-GridData)?\.json$/,'');
      byPath.set(grid.gridDataPath,{
        viewKey:view.viewKey,gridIdNative:grid.gridIdNative,
        gridDataPath:grid.gridDataPath,areaName:name,
        sourceReferenceCount:1,
      });
    }
  }
  return [...byPath.values()];
}
function nativePreview(values:Uint32Array,sizeX:number,sizeY:number){
  const scale=Math.min(1,128/Math.max(sizeX,sizeY));
  const previewWidth=Math.max(1,Math.round(sizeX*scale));
  const previewHeight=Math.max(1,Math.round(sizeY*scale));
  const previewValues=new Uint32Array(previewWidth*previewHeight);
  for(let py=0;py<previewHeight;py++){
    const sy=Math.min(sizeY-1,Math.floor((py+0.5)*sizeY/previewHeight));
    for(let px=0;px<previewWidth;px++){
      const sx=Math.min(sizeX-1,Math.floor((px+0.5)*sizeX/previewWidth));
      previewValues[py*previewWidth+px]=values[sy*sizeX+sx];
    }
  }
  return {previewWidth,previewHeight,previewValues};
}

/**
 * Page 24 bounded maps at a time. Counts are literal, deduplicated
 * source-local GridData cells, NEVER globally distinct placeable cells.
 * All overviews are downsampled; selecting a tile opens the exact
 * one-cell-per-pixel source GridData display.
 */
export function getNativeRegionGridAtlasPage(
  sourceCatalog:unknown,
  views:readonly WorldPreviewView[],
  regionKey:string,offset=0,limit=24,
):SourceRegionAtlasPage{
  const catalog=requireWorldPreviewCatalog(sourceCatalog);
  if(typeof regionKey!=='string'||!regionKey||regionKey.length>256||
      !Array.isArray(views)||!safeIndex(offset)||
      !safePositive(limit)||limit>24)
    throw new TypeError('DB04_ATLAS_REQUEST_INVALID');
  const regionViews=views.filter(view=>view.regionKey===regionKey);
  if(regionViews.length===0)
    throw new TypeError('DB04_ATLAS_UNKNOWN_SOURCE_REGION');
  const refs=regionGridRefs(regionViews,regionKey);
  let knownGridDataRecords=0,sourceGridCells=0;
  for(const ref of refs){
    const grid=catalog.grids.get(ref.gridDataPath);
    if(!grid)continue;
    if(!safePositive(grid.sizeX)||!safePositive(grid.sizeY)||
       grid.sizeX*grid.sizeY>16_777_216)
      throw new TypeError('DB04_ATLAS_SOURCE_GRID_SIZE_INVALID');
    knownGridDataRecords++;
    sourceGridCells+=grid.sizeX*grid.sizeY;
  }
  if(!Number.isSafeInteger(sourceGridCells))
    throw new TypeError('DB04_ATLAS_SOURCE_CELL_COUNT_OVERFLOW');
  const tiles:SourceRegionAtlasTile[]=[];
  for(const ref of refs.slice(offset,offset+limit)){
    const original=catalog.grids.get(ref.gridDataPath);
    if(!original){
      tiles.push({...ref,status:'missing_griddata_in_original_subset',
        sizeX:null,sizeY:null,totalCells:null,
        zeroMaskCells:null,nonzeroMaskCells:null,
        previewWidth:0,previewHeight:0,previewValues:null,
        worldCoordinatesVerified:false,placementLegalityVerified:false});
      continue;
    }
    const raster=getNativeTerrainRaster(catalog,ref.gridDataPath);
    if(raster.status!=='source_corroborated_grid_local_raster'){
      tiles.push({...ref,status:raster.status,
        sizeX:original.sizeX,sizeY:original.sizeY,
        totalCells:original.sizeX*original.sizeY,
        zeroMaskCells:null,nonzeroMaskCells:null,
        previewWidth:0,previewHeight:0,previewValues:null,
        worldCoordinatesVerified:false,placementLegalityVerified:false});
      continue;
    }
    const zeros=raster.maskCounts.find(x=>x.nativeFloorValue===0)?.cellCount??0;
    const tilePreview=nativePreview(
      raster.nativeFloorValues,raster.sizeX,raster.sizeY);
    tiles.push({...ref,
      status:'source_grid_local_mask_preview',
      sizeX:raster.sizeX,sizeY:raster.sizeY,
      totalCells:raster.totalCells,
      zeroMaskCells:zeros,nonzeroMaskCells:raster.totalCells-zeros,
      ...tilePreview,
      worldCoordinatesVerified:false,placementLegalityVerified:false});
  }
  const nextOffset=offset+limit<refs.length?offset+limit:null;
  return {
    status:'source_region_grid_atlas',
    regionKey,offset,totalGridDataRecords:refs.length,
    knownGridDataRecords,sourceGridCells,
    missingGridDataRecords:refs.length-knownGridDataRecords,
    tiles,nextOffset,
    sharedWorldCoordinatesVerified:false,
    furniturePlacementLegalityVerified:false,
    sourceWorldCoverageComplete:false,
  };
}
