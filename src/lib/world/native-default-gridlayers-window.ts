/**
 * DB-04 bounded SOURCE Item DEFAULT GridLayers projection onto one ORIGINAL
 * Grid-local viewport. No actual GridCells membership, occupancy or Save edit.
 *
 * Source-pinned Steam 1.26.2 GridCells.GetLayersForPosition (0x0600F373)
 * uses GridObject.GetGridArea(), subtracts native X/Y, converts the caller
 * Grid-local coordinates through GridArea.TryGetGridLocalPosition with
 * orientation/factor and bitwise-ORs original GridLayers.
 *
 * This previews ONLY the original definition fallback. Runtime GridArea
 * overrides (GridObject IGridAreaOverride.SetGridArea, 0x0600F006),
 * runtime object changes and native GridCells index membership differ.
 * Unknown source Items or explicitly missing source GridAreas are tracked
 * conservatively, not assumed empty. Raw zero is NEVER free space.
 */
import {getSourceAnchorDomain} from './native-anchor-domain.ts';
import {getOriginalGridAreaEvidence} from './native-gridarea-evidence.ts';
import {
  getOriginalGridAreaDisplayDimensions,
  getOriginalGridAreaLocalWindow
} from './native-gridarea-local-window.ts';

export const DB04_ORIGINAL_DEFAULT_GRID_LAYERS_WINDOW=
  'wand.db04.original-default-gridlayers-window@1' as const;

export type OriginalDefaultGridLayersWindowStatus=
  'source_item_default_layer_window'|
  'source_game_version_unverified'|
  'original_grid_not_in_partial_source'|
  'source_grid_factor_unverified';

export interface OriginalDefaultGridLayersWindow {
  readonly contract:typeof DB04_ORIGINAL_DEFAULT_GRID_LAYERS_WINDOW;
  readonly status:OriginalDefaultGridLayersWindowStatus;
  readonly sourceLayoutId:string;
  readonly nativeGridId:number;
  readonly gridDataPath:string|null;
  readonly sourceGridTessellationFactor:1|2|null;
  readonly rect:Readonly<{x:number;y:number;width:number;height:number}>;
  /** Per-cell uint32 bitwise OR of available original Item DEFAULT layers. */
  readonly rawLayerOrRows:readonly (readonly number[])[]|null;
  readonly knownDefaultContributorCountRows:readonly (readonly number[])[]|null;
  /** Conservative possible unknowns: only native anchors X<=cellX,Y<=cellY.
   * Does NOT imply those unknown Items actually extend into that cell. */
  readonly potentiallyUnresolvedContributorCountRows:
    readonly (readonly number[])[]|null;
  readonly sourceDefaultGridObjectCount:number;
  readonly missingItemDefinitionCount:number;
  readonly sourceItemWithoutGridAreaCount:number;
  readonly invalidDefaultAreaExtentCount:number;
  readonly nativeGridCellsLayerLookupCorroborated:boolean;
  readonly sourceItemDefaultFallbackOnly:true;
  readonly nativeGridCellsRuntimeIndexVerified:false;
  readonly runtimeAreaOverrideExcluded:false;
  readonly zeroMaskMeansFree:false;
  readonly unknownCellIsFree:false;
  readonly actualOccupancyVerified:false;
  readonly collisionRulesVerified:false;
  readonly placementLegalityVerified:false;
  readonly saveWritingAuthorized:false;
  readonly originalSourceAuthenticationVerified:false;
}
type Row=Record<string,unknown>;
const record=(v:unknown):v is Row=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const uint=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
const layoutPattern=/^SceneLayouts\/(?:[A-Za-z0-9_!.-]+\/)*[A-Za-z0-9_!.-]+\.json$/;
type Rect={x:number;y:number;width:number;height:number};

function reply(
  status:OriginalDefaultGridLayersWindowStatus,
  layoutId:string,gridId:number,rect:Rect,
  gridDataPath:string|null=null,factor:1|2|null=null,
  layers:number[][]|null=null,counts:number[][]|null=null,
  unknown:number[][]|null=null,objectCount=0,missing=0,noArea=0,outside=0
):OriginalDefaultGridLayersWindow {
  const freezeRows=(rows:number[][]|null)=>
    rows===null?null:Object.freeze(rows.map(row=>Object.freeze(row)));
  return Object.freeze({
    contract:DB04_ORIGINAL_DEFAULT_GRID_LAYERS_WINDOW,
    status,sourceLayoutId:layoutId,nativeGridId:gridId,
    gridDataPath,sourceGridTessellationFactor:factor,
    rect:Object.freeze({...rect}),
    rawLayerOrRows:freezeRows(layers),
    knownDefaultContributorCountRows:freezeRows(counts),
    potentiallyUnresolvedContributorCountRows:freezeRows(unknown),
    sourceDefaultGridObjectCount:objectCount,
    missingItemDefinitionCount:missing,
    sourceItemWithoutGridAreaCount:noArea,
    invalidDefaultAreaExtentCount:outside,
    nativeGridCellsLayerLookupCorroborated:
      status==='source_item_default_layer_window',
    sourceItemDefaultFallbackOnly:true as const,
    nativeGridCellsRuntimeIndexVerified:false as const,
    runtimeAreaOverrideExcluded:false as const,
    zeroMaskMeansFree:false as const,
    unknownCellIsFree:false as const,
    actualOccupancyVerified:false as const,
    collisionRulesVerified:false as const,
    placementLegalityVerified:false as const,
    saveWritingAuthorized:false as const,
    originalSourceAuthenticationVerified:false as const
  });
}

/** Max 32×32 output; scans each original source GridObject once, not
 * 1,024 times. Private source arrays never leave the Worker. */
export function getOriginalDefaultGridLayersWindow(
  source:unknown,layoutId:string,nativeGridId:number,rect:Rect
):OriginalDefaultGridLayersWindow {
  if(typeof layoutId!=='string'||!layoutPattern.test(layoutId)||
     layoutId.split('/').includes('..')||
     !uint(nativeGridId)||!record(rect)||
     !uint(rect.x)||!uint(rect.y)||
     !uint(rect.width)||!uint(rect.height)||
     rect.width<1||rect.height<1||rect.width>32||rect.height>32)
    throw new TypeError('DB04_GRID_LAYERS_WINDOW_INVALID_QUERY');
  if(!record(source)||!record(source.manifest)||
     !(source.layoutObjectsByGrid instanceof Map)||
     !(source.objects instanceof Map))
    throw new TypeError('DB04_GRID_LAYERS_WINDOW_SOURCE_INVALID');
  if(source.manifest.platform!=='Steam'||source.manifest.gameVersion!=='1.26.2')
    return reply('source_game_version_unverified',layoutId,nativeGridId,rect);
  const domain=getSourceAnchorDomain(source,layoutId,nativeGridId);
  if(!domain)
    return reply('original_grid_not_in_partial_source',layoutId,nativeGridId,rect);
  if(domain.status==='tessellation_coordinate_relation_unverified'||
     (domain.tessellationFactor!==1&&domain.tessellationFactor!==2))
    return reply('source_grid_factor_unverified',
      layoutId,nativeGridId,rect,domain.gridDataPath);
  if(rect.x+rect.width>domain.anchorSizeX||
     rect.y+rect.height>domain.anchorSizeY)
    throw new TypeError('DB04_GRID_LAYERS_WINDOW_OUT_OF_RANGE');
  const factor=domain.tessellationFactor as 1|2;
  const objects=source.layoutObjectsByGrid.get(layoutId)?.get(nativeGridId)??[];
  if(!Array.isArray(objects)||objects.length!==domain.defaultObjectCount||
     objects.length>1_000_000)
    throw new TypeError('DB04_GRID_LAYERS_WINDOW_COUNT_MISMATCH');
  const blank=()=>Array.from({length:rect.height},
    ()=>Array<number>(rect.width).fill(0));
  const layers=blank(),counts=blank(),unknown=blank();
  const xEnd=rect.x+rect.width,yEnd=rect.y+rect.height;
  let missing=0,noArea=0,outside=0;
  const cache=new Map<number,ReturnType<typeof getOriginalGridAreaEvidence>>();

  // An unknown Area can only reach positions >= its native X/Y anchor
  // according to the verified GridCells original subtraction path.
  // The count is a conservative POSSIBLE unknown, never an occupancy marker.
  const possible=(ox:number,oy:number)=>{
    if(ox>=xEnd||oy>=yEnd)return;
    for(let gy=Math.max(oy,rect.y);gy<yEnd;gy++)
      for(let gx=Math.max(ox,rect.x);gx<xEnd;gx++)
        unknown[gy-rect.y][gx-rect.x]++;
  };
  for(const entry of objects){
    if(!record(entry)||entry.layoutId!==layoutId||
       entry.gridIdNative!==nativeGridId||!uint(entry.gridObjectIdNative)||
       entry.layoutObjectId!==layoutId+'#grid='+nativeGridId+
         '#object='+entry.gridObjectIdNative||
       !uint(entry.itemId)||entry.itemId===0||
       !uint(entry.x)||!uint(entry.y)||
       entry.x>=domain.anchorSizeX||entry.y>=domain.anchorSizeY||
       !uint(entry.orientationCode)||entry.orientationCode>15)
      throw new TypeError('DB04_GRID_LAYERS_WINDOW_ORIGINAL_OBJECT_INVALID');
    const itemId=entry.itemId as number;
    const ox=entry.x as number,oy=entry.y as number;
    let evidence=cache.get(itemId);
    if(!evidence){
      evidence=getOriginalGridAreaEvidence(source,itemId);
      cache.set(itemId,evidence);
    }
    if(evidence.status==='item_not_in_partial_original_source'){
      missing++;possible(ox,oy);continue;
    }
    if(evidence.status==='item_has_no_source_gridarea'){
      noArea++;possible(ox,oy);continue;
    }
    if(evidence.status!=='source_raw_gridarea_available'||
       !evidence.rawSizeX||!evidence.rawSizeY)
      throw new TypeError('DB04_GRID_LAYERS_WINDOW_AREA_EVIDENCE_INVALID');
    const dims=getOriginalGridAreaDisplayDimensions(
      evidence.rawSizeX,evidence.rawSizeY,entry.orientationCode as number,factor);
    // A source Item default extent that fails the original boundary check
    // is not silently clipped and treated as established native coverage.
    if(ox+dims.width>domain.anchorSizeX||
       oy+dims.height>domain.anchorSizeY){
      outside++;possible(ox,oy);continue;
    }
    const startX=Math.max(ox,rect.x),startY=Math.max(oy,rect.y);
    const endX=Math.min(ox+dims.width,xEnd);
    const endY=Math.min(oy+dims.height,yEnd);
    if(startX>=endX||startY>=endY)continue;
    // The exact original Item local-view helper has a 16×16 safety cap.
    // Tile larger viewports rather than weakening that source gate.
    for(let gy=startY;gy<endY;gy+=16){
      for(let gx=startX;gx<endX;gx+=16){
        const width=Math.min(16,endX-gx),height=Math.min(16,endY-gy);
        const local=getOriginalGridAreaLocalWindow(source,itemId,
          entry.orientationCode as number,gx-ox,gy-oy,width,height,factor);
        if(local.status!=='source_native_local_layers'||!local.rows)
          throw new TypeError('DB04_GRID_LAYERS_WINDOW_LOCAL_LOOKUP_FAILED');
        for(let iy=0;iy<height;iy++){
          for(let ix=0;ix<width;ix++){
            const raw=local.rows[iy][ix];
            if(raw===null)continue; // unmapped oblique cell; NOT free
            const yy=gy+iy-rect.y,xx=gx+ix-rect.x;
            layers[yy][xx]=(layers[yy][xx]|raw)>>>0;
            counts[yy][xx]++;
          }
        }
      }
    }
  }
  return reply('source_item_default_layer_window',layoutId,nativeGridId,rect,
    domain.gridDataPath,factor,layers,counts,unknown,
    objects.length,missing,noArea,outside);
}
