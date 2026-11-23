/**
 * DB-04 read-only source Item DEFAULT GridLayers at one ORIGINAL Grid cell.
 *
 * The Steam 1.26.2 native GridCells.GetLayersForPosition source path:
 * enumerates GridObjects, calls GridObject.GetGridArea(), subtracts native
 * GridObject.X/Y, calls GridArea.TryGetGridLocalPosition with original Grid
 * tessellation factor and orientation, reads original local GridLayers, then
 * bitwise-ORs the returned uint32 layer values. This method (IL2CPP token
 * 0x0600F373, RVA 0x042EA5E0, 176 native instructions) matches 1.26.1
 * with PC-relative-only changes (35) and no changed nonrelative bytes.
 *
 * This function computes ONLY a static ORIGINAL ITEM DEFINITION fallback
 * for ORIGINAL default GridObjects; runtime GridArea overrides, dynamic
 * objects, absent source definitions and engine cell-index cache may alter
 * actual results. Zero is a literal raw OR result, never a "free" verdict.
 * It cannot validate occupancy, collisions, legal placement or Save writes.
 */
import {getSourceAnchorDomain} from './native-anchor-domain.ts';
import {getOriginalGridAreaEvidence} from './native-gridarea-evidence.ts';
import {getOriginalGridAreaDisplayDimensions,
  getOriginalGridAreaLocalWindow} from './native-gridarea-local-window.ts';

export const DB04_ORIGINAL_DEFAULT_GRID_LAYERS_CELL=
  'wand.db04.original-default-gridlayers-cell@1' as const;

export type DefaultGridLayersCellStatus=
  'source_item_default_layer_or_only'|
  'source_game_version_unverified'|
  'original_grid_not_in_partial_source'|
  'source_grid_factor_unverified';

export interface OriginalDefaultLayerContributor {
  readonly itemId:number;
  readonly nativeGridObjectId:number;
  readonly originalAnchorX:number;
  readonly originalAnchorY:number;
  readonly originalOrientationCode:number;
  readonly originalItemLocalX:number;
  readonly originalItemLocalY:number;
  readonly rawGridLayerValue:number;
}

export interface OriginalDefaultGridLayersCell {
  readonly contract:typeof DB04_ORIGINAL_DEFAULT_GRID_LAYERS_CELL;
  readonly status:DefaultGridLayersCellStatus;
  readonly sourceLayoutId:string;
  readonly nativeGridId:number;
  readonly gridDataPath:string|null;
  readonly x:number;
  readonly y:number;
  readonly sourceGridTessellationFactor:1|2|null;
  /** Bitwise OR of available DEFAULT Item GridArea layer data; never a placement verdict. */
  readonly rawDefaultItemLayerOr:number|null;
  readonly sourceDefaultContributorCount:number;
  readonly contributors:readonly OriginalDefaultLayerContributor[];
  readonly contributorListTruncated:boolean;
  readonly unresolvedSourceItemCount:number;
  readonly unresolvedSourceGridAreaCount:number;
  readonly nativeGridCellsLayerLookupCorroborated:boolean;
  readonly defaultItemFallbackOnly:true;
  readonly missingDefinitionsNotEquivalentToFree:true;
  readonly zeroMaskDoesNotMeanUnoccupied:true;
  readonly runtimeAreaOverridesExcluded:false;
  readonly actualRuntimeGridLayersVerified:false;
  readonly placementLegalityVerified:false;
  readonly occupancyPredicateVerified:false;
  readonly collisionRulesVerified:false;
  readonly savedGridIdentityVerified:false;
  readonly saveWritingAuthorized:false;
  readonly originalSourceAuthenticationVerified:false;
}

type Row=Record<string,unknown>;
const isRow=(v:unknown):v is Row=>v!==null&&
  typeof v==='object'&&!Array.isArray(v);
const uint=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
const layoutPattern=/^SceneLayouts\/(?:[A-Za-z0-9_!.-]+\/)*[A-Za-z0-9_!.-]+\.json$/;

function receipt(status:DefaultGridLayersCellStatus,
  layout:string,gridId:number,x:number,y:number,
  path:string|null=null,factor:1|2|null=null,mask:number|null=null,
  contributors:readonly OriginalDefaultLayerContributor[]=[],
  total=0,missing=0,noArea=0
):OriginalDefaultGridLayersCell {
  const ok=status==='source_item_default_layer_or_only';
  return Object.freeze({
    contract:DB04_ORIGINAL_DEFAULT_GRID_LAYERS_CELL,
    status,sourceLayoutId:layout,nativeGridId:gridId,gridDataPath:path,
    x,y,sourceGridTessellationFactor:factor,
    rawDefaultItemLayerOr:mask,sourceDefaultContributorCount:total,
    contributors:Object.freeze(contributors),
    contributorListTruncated:total>contributors.length,
    unresolvedSourceItemCount:missing,
    unresolvedSourceGridAreaCount:noArea,
    nativeGridCellsLayerLookupCorroborated:ok,
    defaultItemFallbackOnly:true as const,
    missingDefinitionsNotEquivalentToFree:true as const,
    zeroMaskDoesNotMeanUnoccupied:true as const,
    runtimeAreaOverridesExcluded:false as const,
    actualRuntimeGridLayersVerified:false as const,
    placementLegalityVerified:false as const,
    occupancyPredicateVerified:false as const,
    collisionRulesVerified:false as const,
    savedGridIdentityVerified:false as const,
    saveWritingAuthorized:false as const,
    originalSourceAuthenticationVerified:false as const
  });
}

/** One bounded point receipt. The raw source archive never leaves the Worker. */
export function getOriginalDefaultGridLayersAtCell(
  source:unknown,layoutId:string,nativeGridId:number,
  x:number,y:number,limit=24
):OriginalDefaultGridLayersCell {
  if(!layoutPattern.test(layoutId)||layoutId.split('/').includes('..')||
     !uint(nativeGridId)||!uint(x)||!uint(y)||
     !Number.isSafeInteger(limit)||limit<1||limit>64)
    throw new TypeError('DB04_ORIGINAL_DEFAULT_GRID_LAYERS_INVALID_QUERY');
  if(!isRow(source)||!isRow(source.manifest)||
     !(source.layoutObjectsByGrid instanceof Map)||
     !(source.objects instanceof Map))
    throw new TypeError('DB04_ORIGINAL_DEFAULT_GRID_LAYERS_SOURCE_INVALID');
  if(source.manifest.platform!=='Steam'||
     source.manifest.gameVersion!=='1.26.2')
    return receipt('source_game_version_unverified',layoutId,nativeGridId,x,y);
  const domain=getSourceAnchorDomain(source,layoutId,nativeGridId);
  if(!domain)
    return receipt('original_grid_not_in_partial_source',layoutId,nativeGridId,x,y);
  if(domain.status==='tessellation_coordinate_relation_unverified'||
     (domain.tessellationFactor!==1&&domain.tessellationFactor!==2))
    return receipt('source_grid_factor_unverified',layoutId,nativeGridId,
      x,y,domain.gridDataPath);
  if(x>=domain.anchorSizeX||y>=domain.anchorSizeY)
    throw new TypeError('DB04_ORIGINAL_DEFAULT_GRID_LAYERS_OUT_OF_RANGE');
  const factor=domain.tessellationFactor as 1|2;
  const rows=source.layoutObjectsByGrid.get(layoutId)?.get(nativeGridId)??[];
  if(!Array.isArray(rows)||rows.length!==domain.defaultObjectCount||
     rows.length>1_000_000)
    throw new TypeError('DB04_ORIGINAL_DEFAULT_GRID_LAYERS_COUNT_MISMATCH');
  let rawOr=0,total=0,missing=0,noArea=0;
  const contributors:OriginalDefaultLayerContributor[]=[];
  const itemEvidence=new Map<number,ReturnType<typeof getOriginalGridAreaEvidence>>();
  for(const row of rows){
    if(!isRow(row)||row.layoutId!==layoutId||
       row.gridIdNative!==nativeGridId||
       !uint(row.gridObjectIdNative)||
       row.layoutObjectId!==layoutId+'#grid='+nativeGridId+
         '#object='+row.gridObjectIdNative||
       !uint(row.itemId)||row.itemId===0||
       !uint(row.x)||!uint(row.y)||
       row.x>=domain.anchorSizeX||row.y>=domain.anchorSizeY||
       !uint(row.orientationCode)||row.orientationCode>15)
      throw new TypeError('DB04_ORIGINAL_DEFAULT_GRID_LAYERS_INVALID_OBJECT');
    const itemId=row.itemId as number;
    let evidence=itemEvidence.get(itemId);
    if(!evidence){
      evidence=getOriginalGridAreaEvidence(source,itemId);
      itemEvidence.set(itemId,evidence);
    }
    if(evidence.status==='item_not_in_partial_original_source'){
      missing++;continue;
    }
    if(evidence.status==='item_has_no_source_gridarea'){
      noArea++;continue;
    }
    if(evidence.status!=='source_raw_gridarea_available'||
       !evidence.rawSizeX||!evidence.rawSizeY)
      throw new TypeError('DB04_ORIGINAL_DEFAULT_GRID_LAYERS_INVALID_EVIDENCE');
    const dims=getOriginalGridAreaDisplayDimensions(
      evidence.rawSizeX,evidence.rawSizeY,row.orientationCode,factor);
    // Native local position receives gridPoint - GridObject.Position.
    const localX=x-row.x,localY=y-row.y;
    if(localX<0||localY<0||
       localX>=dims.width||localY>=dims.height)continue;
    const sample=getOriginalGridAreaLocalWindow(
      source,itemId,row.orientationCode,localX,localY,1,1,factor);
    if(sample.status!=='source_native_local_layers'||!sample.rows)
      throw new TypeError('DB04_ORIGINAL_DEFAULT_GRID_LAYERS_LOOKUP_FAILED');
    const raw=sample.rows[0][0];
    // Oblique output corners with NO source cell are not "empty" or "free".
    if(raw===null)continue;
    rawOr=(rawOr|raw)>>>0;
    total++;
    if(contributors.length<limit)
      contributors.push(Object.freeze({
        itemId,nativeGridObjectId:row.gridObjectIdNative as number,
        originalAnchorX:row.x as number,originalAnchorY:row.y as number,
        originalOrientationCode:row.orientationCode as number,
        originalItemLocalX:Math.floor(localX/factor),
        originalItemLocalY:Math.floor(localY/factor),
        rawGridLayerValue:raw
      }));
  }
  return receipt('source_item_default_layer_or_only',layoutId,
    nativeGridId,x,y,domain.gridDataPath,factor,rawOr,
    contributors,total,missing,noArea);
}
