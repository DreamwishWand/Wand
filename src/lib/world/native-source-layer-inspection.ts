/**
 * Browser-local source-default GridLayers inspection for one original Grid.
 * Clicked source-local floor cell -> at most 16x16 original layer window.
 *
 * Never join across different GridData paths or assume factor-two terrain
 * matches native GridObject anchors. Values are source Item DEFAULT GridLayers,
 * not occupied cells, live Save objects or actual placement permission.
 */
import {
  getOriginalDefaultGridLayersWindow,
  type OriginalDefaultGridLayersWindow,
} from './native-default-gridlayers-window.ts';
import {getSourceAnchorDomain} from './native-anchor-domain.ts';
import {
  requireWorldPreviewCatalog,
  type WorldPreviewView,
} from './preview-views.ts';

export const DB04_SOURCE_LAYER_INSPECTION=
  'wand.db04.source-layer-local-inspection@1' as const;
export type SourceLayerInspectionStatus=
  'source_default_layer_window_observed'|
  'source_grid_tessellation_not_compatible'|
  'source_grid_not_available'|
  'source_game_version_not_verified';

export interface SourceLayerInspection {
  readonly contract:typeof DB04_SOURCE_LAYER_INSPECTION;
  readonly status:SourceLayerInspectionStatus;
  readonly viewKey:string;
  readonly gridIdNative:number;
  readonly gridDataPath:string;
  readonly selectedX:number;
  readonly selectedY:number;
  readonly rect:Readonly<{x:number;y:number;width:number;height:number}>|null;
  readonly window:OriginalDefaultGridLayersWindow|null;
  readonly knownContributorCells:number|null;
  readonly rawNonzeroLayerCells:number|null;
  readonly possiblyUnresolvedCells:number|null;
  readonly sourceDefaultLayersOnly:true;
  readonly nativeGridCellsIndexVerified:false;
  readonly nativeCollisionRulesVerified:false;
  readonly savedWorldPlacementVerified:false;
  readonly placementLegalityVerified:false;
}

const uint=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=0xffffffff;
function result(
  status:SourceLayerInspectionStatus,
  viewKey:string,gridIdNative:number,gridDataPath:string,
  selectedX:number,selectedY:number,
  rect:SourceLayerInspection['rect']=null,
  window:OriginalDefaultGridLayersWindow|null=null
):SourceLayerInspection {
  let knownContributorCells:number|null=null;
  let rawNonzeroLayerCells:number|null=null;
  let possiblyUnresolvedCells:number|null=null;
  if(window?.status==='source_item_default_layer_window'&&
     window.rawLayerOrRows&&window.knownDefaultContributorCountRows&&
     window.potentiallyUnresolvedContributorCountRows&&rect) {
    knownContributorCells=0;rawNonzeroLayerCells=0;possiblyUnresolvedCells=0;
    for(let y=0;y<rect.height;y++){
      for(let x=0;x<rect.width;x++){
        if(window.knownDefaultContributorCountRows[y][x]>0)
          knownContributorCells++;
        if(window.rawLayerOrRows[y][x]!==0)
          rawNonzeroLayerCells++;
        if(window.potentiallyUnresolvedContributorCountRows[y][x]>0)
          possiblyUnresolvedCells++;
      }
    }
  }
  return {contract:DB04_SOURCE_LAYER_INSPECTION,status,
    viewKey,gridIdNative,gridDataPath,selectedX,selectedY,
    rect,window,
    knownContributorCells,rawNonzeroLayerCells,possiblyUnresolvedCells,
    sourceDefaultLayersOnly:true,nativeGridCellsIndexVerified:false,
    nativeCollisionRulesVerified:false,savedWorldPlacementVerified:false,
    placementLegalityVerified:false};
}

/** Original factor-1 Grid only. Source-pinned 1.26.2 input. */
export function inspectSourceDefaultGridLayers(
  source:unknown,views:readonly WorldPreviewView[],
  viewKey:string,gridIdNative:number,focusX:number,focusY:number
):SourceLayerInspection {
  if(typeof viewKey!=='string'||viewKey.length<1||viewKey.length>2048||
     !uint(gridIdNative)||!uint(focusX)||!uint(focusY)||
     !Array.isArray(views))
    throw new TypeError('DB04_SOURCE_LAYER_INSPECTION_INVALID_REQUEST');
  const catalog=requireWorldPreviewCatalog(source);
  const view=views.find(v=>v.viewKey===viewKey);
  const grid=view?.grids.find(
    (candidate:{readonly gridIdNative:number})=>
      candidate.gridIdNative===gridIdNative);
  if(!view||!grid)throw new TypeError('DB04_SOURCE_LAYER_INSPECTION_GRID_NOT_FOUND');
  const path=grid.gridDataPath;
  const manifest=source!==null&&typeof source==='object'&&
    'manifest' in source&&source.manifest!==null&&
    typeof source.manifest==='object'
    ?source.manifest:null;
  if(!manifest||!('gameVersion' in manifest)||!('platform' in manifest)||
     manifest.gameVersion!=='1.26.2'||manifest.platform!=='Steam')
    return result('source_game_version_not_verified',
      viewKey,gridIdNative,path,focusX,focusY);
  const domain=getSourceAnchorDomain(catalog,view.layoutId,gridIdNative);
  if(!domain||domain.gridDataPath!==path||!grid.knownGridData||
     grid.sizeX===null||grid.sizeY===null)
    return result('source_grid_not_available',
      viewKey,gridIdNative,path,focusX,focusY);
  if(focusX>=grid.sizeX||focusY>=grid.sizeY)
    throw new TypeError('DB04_SOURCE_LAYER_INSPECTION_COORDINATE_OUTSIDE_GRID');
  if(domain.tessellationFactor!==1||
     domain.status!=='raw_grid_dimensions_only'||
     domain.anchorSizeX!==grid.sizeX||
     domain.anchorSizeY!==grid.sizeY)
    return result('source_grid_tessellation_not_compatible',
      viewKey,gridIdNative,path,focusX,focusY);
  const width=Math.min(16,grid.sizeX);
  const height=Math.min(16,grid.sizeY);
  const rect={
    x:Math.min(Math.max(0,focusX-Math.floor(width/2)),grid.sizeX-width),
    y:Math.min(Math.max(0,focusY-Math.floor(height/2)),grid.sizeY-height),
    width,height,
  };
  const window=getOriginalDefaultGridLayersWindow(
    catalog,view.layoutId,gridIdNative,rect);
  if(window.status!=='source_item_default_layer_window'||
     window.gridDataPath!==path)
    return result('source_grid_not_available',
      viewKey,gridIdNative,path,focusX,focusY);
  return result('source_default_layer_window_observed',
    viewKey,gridIdNative,path,focusX,focusY,rect,window);
}
