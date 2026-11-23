/**
 * DB-04 read-only source-default layer probe for a hypothetical repositioning.
 * There is NO saved placement, no runtime object override, no collision
 * predicate and no Save writer in this module.
 *
 * Every original object is keyed by exact SceneLayout, native Grid.ID,
 * native GridObject.ID and Item.ID. The source GridObject itself is excluded
 * from background OR to avoid self-overlap artifacts, but the game may have
 * *different* runtime GridCells membership, Item GridArea override or objects.
 *
 * Steam 1.26.2 native GridArea.GetSizeForOrientation and
 * GridArea.TryGetGridLocalPosition are used by source-pinned read-only
 * geometry. Raw shared layer bits are observable data, NOT a rule for
 * game conflicts or placement permission.
 */
import {getOriginalGridObjectItemAreaLink} from './native-gridobject-item-area-link.ts';
import {getOriginalGridAreaDisplayDimensions,
  getOriginalGridAreaLocalWindow} from './native-gridarea-local-window.ts';
import {getOriginalDefaultGridLayersWindow} from './native-default-gridlayers-window.ts';

export const DB04_SOURCE_DEFAULT_CANDIDATE_PROBE=
  'wand.db04.source-default-candidate-layer-probe@1' as const;
export type CandidateProbeStatus=
  'source_default_candidate_layers_observed'|
  'source_default_candidate_outside_original_grid_extent'|
  'source_default_candidate_exceeds_probe_limit'|
  'original_source_not_available';

export interface SourceDefaultCandidateLayerCell {
  readonly x:number;
  readonly y:number;
  /** null means original oblique geometry maps to no original local cell. */
  readonly candidateSourceLayer:number|null;
  readonly otherOriginalDefaultLayerOr:number;
  readonly rawSharedBits:number;
  readonly otherOriginalDefaultContributorCount:number;
  readonly potentiallyUnknownOtherSourceCount:number;
}
export interface SourceDefaultCandidateLayerProbe {
  readonly contract:typeof DB04_SOURCE_DEFAULT_CANDIDATE_PROBE;
  readonly status:CandidateProbeStatus;
  readonly sourceLayoutId:string;
  readonly nativeGridId:number;
  readonly originalGridObjectId:number;
  readonly itemId:number;
  readonly candidateAnchorX:number;
  readonly candidateAnchorY:number;
  readonly candidateOrientationCode:number;
  readonly originalAnchorX:number|null;
  readonly originalAnchorY:number|null;
  readonly originalOrientationCode:number|null;
  readonly sourceGridFactor:1|2|null;
  readonly sourceGridDataPath:string|null;
  readonly sourceGridSizeX:number|null;
  readonly sourceGridSizeY:number|null;
  readonly candidateDefaultWidth:number|null;
  readonly candidateDefaultHeight:number|null;
  readonly mappedCandidateCellCount:number;
  readonly rawSharedBitCellCount:number;
  readonly potentiallyUnknownOtherSourceCellCount:number;
  readonly backgroundMissingItemCount:number;
  readonly backgroundItemWithoutGridAreaCount:number;
  readonly backgroundInvalidDefaultExtentCount:number;
  readonly rows:readonly (readonly SourceDefaultCandidateLayerCell[])[]|null;
  readonly sourceOriginalObjectExcludedFromBackground:boolean;
  readonly rawSharedBitsNotNativeConflict:true;
  readonly nativeDefaultBoundsOnly:true;
  readonly currentSaveObjectIdentityVerified:false;
  readonly nativeRuntimeGridCellsIndexVerified:false;
  readonly runtimeAreaOverrideExcluded:false;
  readonly actualOccupancyVerified:false;
  readonly collisionRulesVerified:false;
  readonly placementLegalityVerified:false;
  readonly saveWritingAuthorized:false;
  readonly originalSourceAuthenticationVerified:false;
}
const uint=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
const GRIDLAYOUT=/^SceneLayouts\/(?:[A-Za-z0-9_!.-]+\/)*[A-Za-z0-9_!.-]+\.json$/;

function response(status:CandidateProbeStatus,
  layout:string,gridId:number,objectId:number,itemId:number,
  x:number,y:number,orientation:number,
  originalX:number|null=null,originalY:number|null=null,
  originalOrientation:number|null=null,
  factor:1|2|null=null,gridPath:string|null=null,
  gridX:number|null=null,gridY:number|null=null,
  width:number|null=null,height:number|null=null,
  rows:SourceDefaultCandidateLayerCell[][]|null=null,
  mapped=0,shared=0,unknown=0,missing=0,noArea=0,outside=0
):SourceDefaultCandidateLayerProbe{
  const ok=status==='source_default_candidate_layers_observed';
  return Object.freeze({
    contract:DB04_SOURCE_DEFAULT_CANDIDATE_PROBE,
    status,sourceLayoutId:layout,nativeGridId:gridId,
    originalGridObjectId:objectId,itemId,
    candidateAnchorX:x,candidateAnchorY:y,
    candidateOrientationCode:orientation,
    originalAnchorX:originalX,originalAnchorY:originalY,
    originalOrientationCode:originalOrientation,
    sourceGridFactor:factor,sourceGridDataPath:gridPath,
    sourceGridSizeX:gridX,sourceGridSizeY:gridY,
    candidateDefaultWidth:width,candidateDefaultHeight:height,
    mappedCandidateCellCount:mapped,
    rawSharedBitCellCount:shared,
    potentiallyUnknownOtherSourceCellCount:unknown,
    backgroundMissingItemCount:missing,
    backgroundItemWithoutGridAreaCount:noArea,
    backgroundInvalidDefaultExtentCount:outside,
    rows:rows===null?null:
      Object.freeze(rows.map(row=>Object.freeze(row.map(cell=>Object.freeze(cell))))),
    sourceOriginalObjectExcludedFromBackground:ok,
    rawSharedBitsNotNativeConflict:true as const,
    nativeDefaultBoundsOnly:true as const,
    currentSaveObjectIdentityVerified:false as const,
    nativeRuntimeGridCellsIndexVerified:false as const,
    runtimeAreaOverrideExcluded:false as const,
    actualOccupancyVerified:false as const,
    collisionRulesVerified:false as const,
    placementLegalityVerified:false as const,
    saveWritingAuthorized:false as const,
    originalSourceAuthenticationVerified:false as const
  });
}

/** Probe a single original GridObject's DEFAULT Item layers at a candidate
 * original-Grid-local position. Never mutate source state. Strict 32×32 cap. */
export function probeOriginalSourceDefaultCandidate(
  source:unknown,layoutId:string,nativeGridId:number,
  nativeGridObjectId:number,itemId:number,
  candidateX:number,candidateY:number,orientationCode:number
):SourceDefaultCandidateLayerProbe{
  if(!GRIDLAYOUT.test(layoutId)||layoutId.split('/').includes('..')||
     !uint(nativeGridId)||!uint(nativeGridObjectId)||
     !uint(itemId)||itemId===0||
     !uint(candidateX)||!uint(candidateY)||
     !uint(orientationCode)||orientationCode>15)
    throw new TypeError('DB04_CANDIDATE_SOURCE_QUERY_INVALID');
  const link=getOriginalGridObjectItemAreaLink(source,layoutId,nativeGridId,
    nativeGridObjectId,itemId);
  const originalX=link.originalAnchorX,originalY=link.originalAnchorY;
  const originalOrientation=link.originalOrientationCode;
  const factor=link.originalGridTessellationFactor;
  const gridPath=link.gridDataPath;
  const gridX=link.sourceGridScaledSizeX,gridY=link.sourceGridScaledSizeY;
  const base=[
    layoutId,nativeGridId,nativeGridObjectId,itemId,candidateX,candidateY,
    orientationCode,originalX,originalY,originalOrientation,
    factor,gridPath,gridX,gridY
  ] as const;
  if(link.status!=='original_item_default_gridarea_linked'||
     !link.itemGridAreaSizeX||!link.itemGridAreaSizeY||
     !factor||gridX===null||gridY===null)
    return response('original_source_not_available',...base);
  const dims=getOriginalGridAreaDisplayDimensions(
    link.itemGridAreaSizeX,link.itemGridAreaSizeY,orientationCode,factor);
  const width=dims.width,height=dims.height;
  if(candidateX+width>gridX||candidateY+height>gridY)
    return response('source_default_candidate_outside_original_grid_extent',
      ...base,width,height);
  if(width>32||height>32)
    return response('source_default_candidate_exceeds_probe_limit',
      ...base,width,height);
  const background=getOriginalDefaultGridLayersWindow(
    source,layoutId,nativeGridId,
    {x:candidateX,y:candidateY,width,height},nativeGridObjectId);
  if(background.status!=='source_item_default_layer_window'||
     background.excludedOriginalGridObjectId!==nativeGridObjectId||
     !background.rawLayerOrRows||
     !background.knownDefaultContributorCountRows||
     !background.potentiallyUnresolvedContributorCountRows)
    throw new TypeError('DB04_CANDIDATE_SOURCE_BACKGROUND_UNVERIFIED');
  const raw:(number|null)[][]=Array.from({length:height},
    ()=>Array<number|null>(width).fill(null));
  for(let iy=0;iy<height;iy+=16){
    for(let ix=0;ix<width;ix+=16){
      const sx=Math.min(16,width-ix),sy=Math.min(16,height-iy);
      const local=getOriginalGridAreaLocalWindow(source,itemId,
        orientationCode,ix,iy,sx,sy,factor);
      if(local.status!=='source_native_local_layers'||!local.rows)
        throw new TypeError('DB04_CANDIDATE_SOURCE_ITEM_LOOKUP_UNVERIFIED');
      for(let dy=0;dy<sy;dy++)
        for(let dx=0;dx<sx;dx++)
          raw[iy+dy][ix+dx]=local.rows[dy][dx];
    }
  }
  let mapped=0,shared=0,unknown=0;
  const rows:SourceDefaultCandidateLayerCell[][]=[];
  for(let iy=0;iy<height;iy++){
    const row:SourceDefaultCandidateLayerCell[]=[];
    for(let ix=0;ix<width;ix++){
      const candidate=raw[iy][ix];
      const other=background.rawLayerOrRows[iy][ix];
      const possibility=background
        .potentiallyUnresolvedContributorCountRows[iy][ix];
      const common=candidate===null?0:(candidate&other)>>>0;
      if(candidate!==null){
        mapped++;
        if(common!==0)shared++;
        if(possibility!==0)unknown++;
      }
      row.push({
        x:candidateX+ix,y:candidateY+iy,
        candidateSourceLayer:candidate,
        otherOriginalDefaultLayerOr:other,
        rawSharedBits:common,
        otherOriginalDefaultContributorCount:
          background.knownDefaultContributorCountRows[iy][ix],
        potentiallyUnknownOtherSourceCount:possibility
      });
    }
    rows.push(row);
  }
  return response('source_default_candidate_layers_observed',
    ...base,width,height,rows,mapped,shared,unknown,
    background.missingItemDefinitionCount,
    background.sourceItemWithoutGridAreaCount,
    background.invalidDefaultAreaExtentCount);
}
