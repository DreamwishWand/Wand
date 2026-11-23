/**
 * DB-04 source-only join: one ORIGINAL default GridObject -> exact source Item
 * GridAreaData through the native GridObject.GetGridArea fallback read path.
 *
 * Proven on privately SHA-pinned Steam 1.26.1 and 1.26.2 source binaries:
 * Meta.Grids.GridObject.GetGridArea 0x0600F005 (v1.26.2 RVA 0x042AD610,
 * 446 bytes); the 100 aligned instructions differ only in 30 PC-relative
 * displacements. The method accesses Item ID and calls
 * Definitions.Grid.GridAreaData.GetGridArea after source item lookup,
 * unless its cached/runtime GridArea is already initialized.
 *
 * Steam 1.26.2 Meta.Grids.GridExtensions.IsAreaInside
 * (token 0x0600F341, RVA 0x042E51B0, 72 instructions) checks original
 * GridObject position plus GetSizeForOrientation against Grid Size×factor.
 * This supports source Item DEFAULT outer bounding arithmetic only.
 * This is NOT full IsAreaInside, a placed occupancy mask or world position:
 * a cached GridArea override, other boundary checks, collision rules,
 * anchor pivot for occupied cells, and Save identity may
 * differ from the fallback original item definition. No writes.
 */
import {getSourceAnchorDomain} from './native-anchor-domain.ts';
import {getOriginalGridAreaEvidence} from './native-gridarea-evidence.ts';
import {getOriginalGridAreaDisplayDimensions} from './native-gridarea-local-window.ts';

export const DB04_ORIGINAL_GRIDOBJECT_ITEM_AREA_LINK=
  'wand.db04.original-gridobject-item-area-link@1' as const;

export type OriginalGridObjectAreaLinkStatus=
  'original_item_default_gridarea_linked'|
  'item_not_in_partial_original_source'|
  'item_has_no_source_gridarea'|
  'original_grid_not_in_source'|
  'original_object_not_in_grid'|
  'source_game_version_unverified'|
  'original_anchor_domain_unverified';

export interface OriginalGridObjectAreaLink {
  readonly contract:typeof DB04_ORIGINAL_GRIDOBJECT_ITEM_AREA_LINK;
  readonly status:OriginalGridObjectAreaLinkStatus;
  readonly sourceLayoutId:string;
  readonly nativeGridId:number;
  readonly nativeGridObjectId:number;
  readonly itemId:number;
  readonly gridDataPath:string|null;
  readonly originalAnchorX:number|null;
  readonly originalAnchorY:number|null;
  readonly originalOrientationCode:number|null;
  readonly originalGridTessellationFactor:1|2|null;
  readonly itemGridAreaSizeX:number|null;
  readonly itemGridAreaSizeY:number|null;
  /** Intrinsic local extent, NOT an actual bounding box on the source Grid. */
  readonly intrinsicOrientedLocalSizeX:number|null;
  readonly intrinsicOrientedLocalSizeY:number|null;
  /** Source-item DEFAULT area outer rectangle anchored to original GridObject.X/Y.
   * This is the native IsAreaInside boundary operand, NOT occupied cells. */
  readonly sourceDefaultBoundingRect:Readonly<{x:number;y:number;width:number;height:number}>|null;
  readonly sourceDefaultRectWithinGridExtent:boolean|null;
  readonly sourceGridScaledSizeX:number|null;
  readonly sourceGridScaledSizeY:number|null;
  readonly nativeDefaultBoundaryArithmeticCorroborated:boolean;
  readonly sourceDefaultRectNotPhysicalOccupancy:true;
  readonly entireNativePlacementValidationVerified:false;
  readonly coordinateBasis:'source_gridobject_anchor_and_independent_item_local_area';
  readonly originalGridObjectNativeGetGridAreaFallbackCorroborated:boolean;
  readonly originalItemFactoryFactorOneCorroborated:boolean;
  readonly runtimeAreaOverrideExcluded:false;
  readonly actualPlacedGridAreaVerified:false;
  readonly nativeAnchorToAreaPivotVerified:false;
  readonly terrainCellProjectionVerified:false;
  readonly occupancyPredicateVerified:false;
  readonly collisionRulesVerified:false;
  readonly placementLegalityVerified:false;
  readonly savedGridIdentityVerified:false;
  readonly saveWritingAuthorized:false;
  readonly originalSourceAuthenticationVerified:false;
}

type Row=Record<string,unknown>;
type Catalog={
  readonly manifest:Row;
  readonly layoutObjectsByGrid:Map<string,Map<number,Row[]>>;
};
const record=(v:unknown):v is Row=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const uint=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff;
const pathPattern=/^SceneLayouts\/(?:[A-Za-z0-9_!.-]+\/)*[A-Za-z0-9_!.-]+\.json$/;

function response(status:OriginalGridObjectAreaLinkStatus,
  layoutId:string,gridId:number,gridObjectId:number,itemId:number,
  gridDataPath:string|null=null,sourceObject:Row|null=null,
  factor:1|2|null=null,sx:number|null=null,sy:number|null=null,
  rx:number|null=null,ry:number|null=null,
  gridScaledX:number|null=null,gridScaledY:number|null=null
):OriginalGridObjectAreaLink {
  const linked=status==='original_item_default_gridarea_linked';
  const ox=sourceObject?sourceObject.x as number:null;
  const oy=sourceObject?sourceObject.y as number:null;
  const rectangle=linked&&ox!==null&&oy!==null&&
    rx!==null&&ry!==null&&rx>0&&ry>0
    ?Object.freeze({x:ox,y:oy,width:rx,height:ry}):null;
  const inside=rectangle!==null&&gridScaledX!==null&&gridScaledY!==null
    ?rectangle.x>=0&&rectangle.y>=0&&
      rectangle.x+rectangle.width<=gridScaledX&&
      rectangle.y+rectangle.height<=gridScaledY:null;
  return Object.freeze({
    contract:DB04_ORIGINAL_GRIDOBJECT_ITEM_AREA_LINK,
    status,sourceLayoutId:layoutId,nativeGridId:gridId,
    nativeGridObjectId:gridObjectId,itemId,gridDataPath,
    originalAnchorX:ox,
    originalAnchorY:oy,
    originalOrientationCode:sourceObject?sourceObject.orientationCode as number:null,
    originalGridTessellationFactor:factor,
    itemGridAreaSizeX:sx,itemGridAreaSizeY:sy,
    intrinsicOrientedLocalSizeX:rx,intrinsicOrientedLocalSizeY:ry,
    sourceDefaultBoundingRect:inside===true?rectangle:null,
    sourceDefaultRectWithinGridExtent:inside,
    sourceGridScaledSizeX:gridScaledX,sourceGridScaledSizeY:gridScaledY,
    nativeDefaultBoundaryArithmeticCorroborated:linked,
    sourceDefaultRectNotPhysicalOccupancy:true as const,
    entireNativePlacementValidationVerified:false as const,
    coordinateBasis:'source_gridobject_anchor_and_independent_item_local_area' as const,
    originalGridObjectNativeGetGridAreaFallbackCorroborated:linked,
    originalItemFactoryFactorOneCorroborated:linked,
    runtimeAreaOverrideExcluded:false as const,
    actualPlacedGridAreaVerified:false as const,
    nativeAnchorToAreaPivotVerified:false as const,
    terrainCellProjectionVerified:false as const,
    occupancyPredicateVerified:false as const,
    collisionRulesVerified:false as const,
    placementLegalityVerified:false as const,
    savedGridIdentityVerified:false as const,
    saveWritingAuthorized:false as const,
    originalSourceAuthenticationVerified:false as const
  });
}

/**
 * Lookup requires an EXACT original (SceneLayout path, Grid.ID,
 * GridObject.ID, Item.ID) tuple. IDs in player Saves, or another layout,
 * are not interchangeable. Returned dimensions are intrinsic-only.
 */
export function getOriginalGridObjectItemAreaLink(
  value:unknown,layoutId:string,gridId:number,
  gridObjectId:number,itemId:number
):OriginalGridObjectAreaLink {
  if(!pathPattern.test(layoutId)||layoutId.split('/').some(x=>x==='..')||
     !uint(gridId)||!uint(gridObjectId)||!uint(itemId)||itemId===0)
    throw new TypeError('DB04_GRIDOBJECT_ITEM_AREA_INVALID_EXACT_SOURCE_KEY');
  if(!record(value)||!record(value.manifest)||
     !(value.layoutObjectsByGrid instanceof Map))
    throw new TypeError('DB04_GRIDOBJECT_ITEM_AREA_SOURCE_INVALID');
  const catalog=value as unknown as Catalog;
  if(catalog.manifest.gameVersion!=='1.26.2'||
     catalog.manifest.platform!=='Steam')
    return response('source_game_version_unverified',
      layoutId,gridId,gridObjectId,itemId);
  const domain=getSourceAnchorDomain(value,layoutId,gridId);
  if(!domain)
    return response('original_grid_not_in_source',
      layoutId,gridId,gridObjectId,itemId);
  if(domain.status==='tessellation_coordinate_relation_unverified')
    return response('original_anchor_domain_unverified',
      layoutId,gridId,gridObjectId,itemId,domain.gridDataPath);
  if(domain.tessellationFactor!==1&&domain.tessellationFactor!==2)
    throw new TypeError('DB04_GRIDOBJECT_ITEM_AREA_FACTOR_UNSUPPORTED');
  const factor=domain.tessellationFactor as 1|2;
  const rows=catalog.layoutObjectsByGrid.get(layoutId)?.get(gridId)??[];
  if(!Array.isArray(rows)||rows.length!==domain.defaultObjectCount)
    throw new TypeError('DB04_GRIDOBJECT_ITEM_AREA_GRID_COUNT_MISMATCH');
  const matches=rows.filter(r=>record(r)&&r.gridObjectIdNative===gridObjectId);
  if(matches.length>1)
    throw new TypeError('DB04_GRIDOBJECT_ITEM_AREA_DUPLICATE_NATIVE_ID');
  if(matches.length===0)
    return response('original_object_not_in_grid',
      layoutId,gridId,gridObjectId,itemId,domain.gridDataPath);
  const object=matches[0];
  if(object.layoutId!==layoutId||object.gridIdNative!==gridId||
     object.layoutObjectId!==layoutId+'#grid='+gridId+'#object='+gridObjectId||
     object.itemId!==itemId||!uint(object.x)||!uint(object.y)||
     object.x>=domain.anchorSizeX||object.y>=domain.anchorSizeY||
     !uint(object.orientationCode)||object.orientationCode>15)
    throw new TypeError('DB04_GRIDOBJECT_ITEM_AREA_INCONSISTENT_ORIGINAL');
  const evidence=getOriginalGridAreaEvidence(value,itemId);
  const args=[
    layoutId,gridId,gridObjectId,itemId,domain.gridDataPath,
    object,factor
  ] as const;
  if(evidence.status==='item_not_in_partial_original_source')
    return response('item_not_in_partial_original_source',...args);
  if(evidence.status==='item_has_no_source_gridarea')
    return response('item_has_no_source_gridarea',...args);
  if(evidence.status!=='source_raw_gridarea_available'||
     !evidence.rawSizeX||!evidence.rawSizeY)
    throw new TypeError('DB04_GRIDOBJECT_ITEM_AREA_ORIGINAL_EVIDENCE_INVALID');
  const dims=getOriginalGridAreaDisplayDimensions(
    evidence.rawSizeX,evidence.rawSizeY,
    object.orientationCode as number,factor);
  return response('original_item_default_gridarea_linked',...args,
    evidence.rawSizeX,evidence.rawSizeY,dims.width,dims.height,
    domain.anchorSizeX,domain.anchorSizeY);
}
