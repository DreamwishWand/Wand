/**
 * DB-04: read-only original GridObject integer anchor extent for Steam v1.26.2.
 *
 * The source has two *different* coordinate spaces: GridData floor-cell
 * indices (SizeX×SizeY) and original GridObject X/Y. In the source-verified
 * Steam 1.26.2 subset, native Grid.TessellationFactor=2 has anchors beyond
 * raw SizeX/SizeY but inside [0,2*SizeX)×[0,2*SizeY).
 *
 * Empirical source consistency is NOT proof of the game's world transform,
 * terrain-to-anchor projection, rotated footprint, collision, occupancy or
 * placement legality. Never use this module to authorize edits.
 */
export type SourceAnchorRect = Readonly<{
  x:number; y:number; width:number; height:number;
}>;
export interface SourceAnchorDomain {
  readonly gridDataPath:string;
  readonly rawSizeX:number;
  readonly rawSizeY:number;
  readonly anchorSizeX:number;
  readonly anchorSizeY:number;
  readonly tessellationFactor:number;
  readonly defaultObjectCount:number;
  readonly status:
    | 'steam1262_original_factor_two_anchor_envelope'
    | 'raw_grid_dimensions_only'
    | 'tessellation_coordinate_relation_unverified';
  readonly terrainCellProjectionVerified:false;
  readonly worldCoordinatesVerified:false;
  readonly placementLegalityVerified:false;
}
export interface SourceAnchorPoint {
  readonly layoutObjectId:string;
  readonly gridObjectIdNative:number;
  readonly itemId:number;
  readonly x:number;
  readonly y:number;
  readonly orientationCode:number;
  readonly orientationName:string|null;
  readonly positionBasis:'nativeGridLocalSourceRecord';
  readonly fullFootprintVerified:false;
  readonly fixedImmovableVerified:false;
}
export interface SourceAnchorPage {
  readonly status:'source_native_default_layout_anchors_only';
  readonly sourceLayoutId:string;
  readonly gridIdNative:number;
  readonly gridDataPath:string;
  readonly nativeGridSizeX:number;
  readonly nativeGridSizeY:number;
  readonly rect:SourceAnchorRect;
  readonly defaultObjectAnchors:SourceAnchorPoint[];
  readonly totalNativeDefaultObjectAnchors:number;
  readonly viewAnchorCount:number;
  readonly matchingNativeDefaultAnchorCount:number;
  readonly pageOffset:number;
  readonly pageLimit:number;
  readonly hasNextPage:boolean;
  readonly nextOffset:number|null;
  readonly anchorCoordinateDomain:'source_native_tessellation_integer_envelope';
  readonly terrainCellProjectionVerified:false;
  readonly worldCoordinatesVerified:false;
  readonly fullFootprintOccupancyVerified:false;
  readonly placementLegalityVerified:false;
}
type Row = Record<string,unknown>;
type Catalog = {
  manifest:Row;
  layouts:Map<string,Row>;
  grids:Map<string,Row>;
  layoutObjectsByGrid:Map<string,Map<number,Row[]>>;
};
const isRecord=(v:unknown):v is Row=>
  typeof v==='object'&&v!==null&&!Array.isArray(v);
const safeInt=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n);
const nonnegative=(n:unknown):n is number=>safeInt(n)&&n>=0;
const positive=(n:unknown):n is number=>safeInt(n)&&n>0;

function asCatalog(value:unknown):Catalog {
  if(!isRecord(value)||!isRecord(value.manifest)||
     !(value.layouts instanceof Map)||
     !(value.grids instanceof Map)||
     !(value.layoutObjectsByGrid instanceof Map))
    throw new TypeError('DB04_SOURCE_CATALOG_NOT_INDEXED');
  return value as unknown as Catalog;
}

/**
 * Returns null only for a source-subset omission. Invalid original references
 * or duplicated scoped Grid.IDs are errors, not guesses.
 */
export function getSourceAnchorDomain(
  source:unknown,layoutId:string,gridIdNative:number
):SourceAnchorDomain|null {
  const catalog=asCatalog(source);
  if(typeof layoutId!=='string'||!layoutId.startsWith('SceneLayouts/')||
     !nonnegative(gridIdNative)||gridIdNative>0xffffffff)
    throw new TypeError('DB04_ANCHOR_SOURCE_ID_INVALID');
  const layout=catalog.layouts.get(layoutId);
  if(!layout||layout.layoutKind!=='nativeGridCollection')return null;
  if(!Array.isArray(layout.nativeGridEntries))
    throw new TypeError('DB04_ANCHOR_GRID_ENTRIES_INVALID');
  const entries=layout.nativeGridEntries.filter(
    (entry:unknown)=>isRecord(entry)&&entry.gridIdNative===gridIdNative);
  if(entries.length===0)return null;
  if(entries.length!==1)throw new TypeError('DB04_ANCHOR_GRID_ID_AMBIGUOUS');
  const entry=entries[0] as Row;
  const path=entry.gridDataPath;
  if(typeof path!=='string'||!path.startsWith('GridData/')||
     !path.endsWith('.json')||path.includes('..')||path.includes('\\'))
    throw new TypeError('DB04_ANCHOR_GRID_PATH_INVALID');
  const grid=catalog.grids.get(path);
  if(!grid)return null;
  const sx=grid.sizeX,sy=grid.sizeY,t=entry.tessellationFactor;
  if(!positive(sx)||!positive(sy)||!nonnegative(t)||
     sx*sy>16_777_216||t>256||
     !nonnegative(entry.defaultObjectCount))
    throw new TypeError('DB04_ANCHOR_GRID_DIMENSIONS_INVALID');
  // Deliberately narrower than native Grid.TessellationFactor support:
  // source-local integer envelopes were crosschecked only for Steam 1.26.2.
  const scaled=t===2&&catalog.manifest.gameVersion==='1.26.2'&&
    catalog.manifest.platform==='Steam';
  const status:SourceAnchorDomain['status']=scaled
    ?'steam1262_original_factor_two_anchor_envelope'
    :t===1?'raw_grid_dimensions_only'
    :'tessellation_coordinate_relation_unverified';
  const scale=scaled?2:1;
  return {
    gridDataPath:path,rawSizeX:sx,rawSizeY:sy,
    anchorSizeX:sx*scale,anchorSizeY:sy*scale,
    tessellationFactor:t,defaultObjectCount:entry.defaultObjectCount,
    status,terrainCellProjectionVerified:false,
    worldCoordinatesVerified:false,placementLegalityVerified:false
  };
}

/**
 * Fetch ONLY source GridObject anchors in original array order, with
 * pagination. We intentionally do not read or project a terrain floor mask.
 *
 * This path is limited to original Steam 1.26.2 factor-2 GridCollections.
 * Other grids continue to use the independently version-gated legacy
 * read-only window, until its full TS/Rust migration.
 */
export function getTessellatedSourceAnchorWindow(
  source:unknown,layoutId:string,gridIdNative:number,
  rect:SourceAnchorRect,offset=0,limit=64
):{page:SourceAnchorPage;markers:{x:number;y:number;count:number}[]} {
  const catalog=asCatalog(source);
  const domain=getSourceAnchorDomain(catalog,layoutId,gridIdNative);
  if(!domain||domain.status!=='steam1262_original_factor_two_anchor_envelope')
    throw new TypeError('DB04_SOURCE_TESSELLATION_NOT_CORROBORATED');
  if(!isRecord(rect)||!nonnegative(rect.x)||!nonnegative(rect.y)||
     !positive(rect.width)||!positive(rect.height)||
     rect.width>32||rect.height>32||
     rect.x+rect.width>domain.anchorSizeX||
     rect.y+rect.height>domain.anchorSizeY||
     !nonnegative(offset)||offset>1_000_000||
     !positive(limit)||limit>512)
    throw new TypeError('DB04_SOURCE_ANCHOR_WINDOW_INVALID');

  const rows=catalog.layoutObjectsByGrid.get(layoutId)?.get(gridIdNative)??[];
  if(!Array.isArray(rows)||rows.length!==domain.defaultObjectCount)
    throw new TypeError('DB04_SOURCE_DEFAULT_OBJECT_COUNT_MISMATCH');

  const selected:SourceAnchorPoint[]=[];
  const counts=new Map<string,number>();
  const maxX=rect.x+rect.width,maxY=rect.y+rect.height;
  for(const row of rows){
    if(!isRecord(row)||row.layoutId!==layoutId||
       row.gridIdNative!==gridIdNative||
       !nonnegative(row.gridObjectIdNative)||
       !nonnegative(row.itemId)||
       !safeInt(row.x)||!safeInt(row.y)||
       !nonnegative(row.orientationCode)||
       typeof row.layoutObjectId!=='string'||
       row.layoutObjectId!==layoutId+'#grid='+gridIdNative+
         '#object='+row.gridObjectIdNative)
      throw new TypeError('DB04_SOURCE_NATIVE_OBJECT_INVALID');
    if(row.x<0||row.y<0||
       row.x>=domain.anchorSizeX||row.y>=domain.anchorSizeY)
      throw new TypeError('DB04_SOURCE_ANCHOR_OUTSIDE_CORROBORATED_ENVELOPE');
    if(row.x<rect.x||row.x>=maxX||row.y<rect.y||row.y>=maxY)continue;
    const key=row.x+':'+row.y;
    counts.set(key,(counts.get(key)??0)+1);
    const orientationName=row.orientationName;
    if(orientationName!==null&&orientationName!==undefined&&
       typeof orientationName!=='string')
      throw new TypeError('DB04_SOURCE_NATIVE_ORIENTATION_INVALID');
    selected.push({
      layoutObjectId:row.layoutObjectId,
      gridObjectIdNative:row.gridObjectIdNative,
      itemId:row.itemId,x:row.x,y:row.y,
      orientationCode:row.orientationCode,
      orientationName:orientationName??null,
      positionBasis:'nativeGridLocalSourceRecord',
      fullFootprintVerified:false,fixedImmovableVerified:false
    });
  }
  const pageRows=selected.slice(offset,offset+limit);
  const hasNextPage=offset+limit<selected.length;
  const page:SourceAnchorPage={
    status:'source_native_default_layout_anchors_only',
    sourceLayoutId:layoutId,gridIdNative,gridDataPath:domain.gridDataPath,
    nativeGridSizeX:domain.rawSizeX,nativeGridSizeY:domain.rawSizeY,rect,
    defaultObjectAnchors:pageRows,
    totalNativeDefaultObjectAnchors:rows.length,
    viewAnchorCount:pageRows.length,
    matchingNativeDefaultAnchorCount:selected.length,
    pageOffset:offset,pageLimit:limit,
    hasNextPage,nextOffset:hasNextPage?offset+limit:null,
    anchorCoordinateDomain:'source_native_tessellation_integer_envelope',
    terrainCellProjectionVerified:false,worldCoordinatesVerified:false,
    fullFootprintOccupancyVerified:false,placementLegalityVerified:false
  };
  return {
    page,markers:[...counts].map(([key,count])=>{
      const [x,y]=key.split(':').map(Number);
      return{x,y,count};
    })
  };
}
