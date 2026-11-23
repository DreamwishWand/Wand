/**
 * Source-only DB-04 initial GridObject anchor index. No Save runtime coords,
 * occupancy cells, collision rules or placement/edit permission are derived.
 * TypeScript owns the indexed source queries; legacy createWorldCatalog still
 * validates raw extraction records before registering this index.
 */
type Raw=Record<string,unknown>;
type GridEntry=Raw & {
  gridIdNative:number;gridDataPath:string;defaultObjectCount:number;
  tessellationFactor?:number
};
type AreaLink=Raw & {
  nativeAreaTypeCode:number;nativeAreaTypeName?:string|null;gridLayoutPath:string
};
type Layout=Raw & {
  layoutKind:string;nativeGridEntries?:GridEntry[];
  areaLayoutReferences?:AreaLink[]
};
type Anchor=Raw & {
  layoutObjectId:string;gridObjectIdNative:number;gridIdNative:number;
  itemId:number;x:number;y:number;
  orientationCode:number;orientationName?:string|null
};
interface SourceCatalog {
  manifest:Raw;
  layouts:ReadonlyMap<string,Layout>;
  grids:ReadonlyMap<string,Raw>;
  layoutObjectsByGrid:ReadonlyMap<string,ReadonlyMap<number,readonly Anchor[]>>;
  layoutObjectsByLayout:ReadonlyMap<string,readonly Anchor[]>;
}
type IndexedAnchor=Readonly<{record:Anchor;sourceOrdinal:number}>;
type GridBins=Map<string,IndexedAnchor[]>;
type Index=Map<string,Map<number,GridBins>>;
type Rect=Readonly<{x:number;y:number;width:number;height:number}>;
type Page=Readonly<{offset:number;limit:number}>;
const SOURCE_ANCHOR_BUCKET_SIDE=32;
const sourceAnchorBuckets=new WeakMap<object,Index>();
const isRecord=(v:unknown):v is Raw=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
function requireCatalog(source:unknown):SourceCatalog {
  if(!isRecord(source)||!isRecord(source.manifest)||
     !(source.layouts instanceof Map)||
     !(source.grids instanceof Map)||
     !(source.layoutObjectsByGrid instanceof Map)||
     !(source.layoutObjectsByLayout instanceof Map))
    throw new TypeError('DB04_SOURCE_ANCHOR_INVALID_CATALOG');
  // createWorldCatalog validates the native composite GridObject ID and
  // source coordinates. Map layout and source-linked Grid/Area types are
  // independently checked before individual read-only queries.
  return source as unknown as SourceCatalog;
}
/** Build all source ordinal buckets in their exact imported record order. */
export function registerSourceAnchorIndex(source:unknown):void {
  const catalog=requireCatalog(source);
  const index:Index=new Map();
  for(const [layoutId,grids] of catalog.layoutObjectsByGrid){
    if(!(grids instanceof Map))
      throw new TypeError('DB04_SOURCE_ANCHOR_INVALID_GRID_INDEX');
    const perLayout=new Map<number,GridBins>();
    for(const [gridId,objects] of grids){
      if(!Number.isSafeInteger(gridId)||gridId<0||
         gridId>0xffffffff||!Array.isArray(objects))
        throw new TypeError('DB04_SOURCE_ANCHOR_INVALID_GRID_INDEX');
      const bins:GridBins=new Map();
      for(let sourceOrdinal=0;sourceOrdinal<objects.length;sourceOrdinal++){
        const record:unknown=objects[sourceOrdinal];
        if(!isRecord(record)||!Number.isSafeInteger(record.x)||
           !Number.isSafeInteger(record.y)||
           record.gridIdNative!==gridId||record.layoutId!==layoutId)
          throw new TypeError('DB04_SOURCE_ANCHOR_INVALID_RECORD');
        const key=
          Math.floor((record.x as number)/SOURCE_ANCHOR_BUCKET_SIDE)+':'+
          Math.floor((record.y as number)/SOURCE_ANCHOR_BUCKET_SIDE);
        const entries=bins.get(key)??[];
        entries.push({record:record as Anchor,sourceOrdinal});
        bins.set(key,entries);
      }
      perLayout.set(gridId,bins);
    }
    index.set(layoutId,perLayout);
  }
  sourceAnchorBuckets.set(source as object,index);
}
function requireIndex(catalog:SourceCatalog):Index {
  const index=sourceAnchorBuckets.get(catalog);
  if(!index)throw new TypeError('DB-04 anchor viewport requires an indexed catalog');
  return index;
}
/** An original default layout is not a current player Save layout. */
export function getDefaultLayoutObjects(source:unknown,layoutId:string,
  nativeGridId:number|null=null){
  const catalog=requireCatalog(source);
  const id=String(layoutId);
  const rows=nativeGridId===null
    ?catalog.layoutObjectsByLayout.get(id)??[]
    :catalog.layoutObjectsByGrid.get(id)?.get(nativeGridId)??[];
  return rows.map(row=>({
    layoutObjectId:row.layoutObjectId,
    gridObjectIdNative:row.gridObjectIdNative,
    gridIdNative:row.gridIdNative,
    itemId:row.itemId,
    x:row.x,y:row.y,
    orientationCode:row.orientationCode,
    orientationName:row.orientationName,
    positionBasis:'nativeGridLocal',
    worldCoordinatesVerified:false,
    fixedImmovableVerified:false
  }));
}
export function getDefaultVillageAreaLayoutRefs(source:unknown,layoutId:string){
  const catalog=requireCatalog(source);
  const layout=catalog.layouts.get(String(layoutId));
  if(!layout||layout.layoutKind!=='nativeDefaultVillageData')return [];
  return (layout.areaLayoutReferences??[]).map(ref=>({
    nativeAreaTypeCode:ref.nativeAreaTypeCode,
    nativeAreaTypeName:ref.nativeAreaTypeName??null,
    gridLayoutPath:ref.gridLayoutPath,
    knownLayout:catalog.layouts.has(ref.gridLayoutPath)
  }));
}
export function getDefaultLayoutGridEntries(source:unknown,layoutId:string){
  const catalog=requireCatalog(source);
  const layout=catalog.layouts.get(String(layoutId));
  if(!layout||layout.layoutKind!=='nativeGridCollection')return [];
  return (layout.nativeGridEntries??[]).map(entry=>({
    gridIdNative:entry.gridIdNative,
    gridDataPath:entry.gridDataPath,
    tessellationFactor:entry.tessellationFactor,
    defaultObjectCount:entry.defaultObjectCount,
    knownGridData:catalog.grids.has(entry.gridDataPath)
  }));
}
/**
 * Only native source-record anchors within the requested Grid-local rect.
 * The spatial bucket index NEVER infers occupied cells or a world transform.
 */
export function getNativeDefaultLayoutAnchorWindow(
  source:unknown,layoutId:string,nativeGridId:number,
  rect:unknown,page:Page|null=null
){
  const catalog=requireCatalog(source);
  if(page!==null&&(!isRecord(page)||
      !Number.isSafeInteger(page.offset)||page.offset<0||page.offset>1000000||
      !Number.isSafeInteger(page.limit)||page.limit<1||page.limit>512))
    throw new TypeError('Invalid native anchor pagination offset/limit');
  const id=String(layoutId);
  const layout=catalog.layouts.get(id);
  if(!layout)return {status:'unknown_native_layout'};
  if(layout.layoutKind!=='nativeGridCollection')
    return {status:'not_native_grid_collection'};
  if(!Number.isSafeInteger(nativeGridId)||nativeGridId<0||
     nativeGridId>0xffffffff)
    throw new TypeError('Native Grid.ID must be an unsigned 32-bit integer');
  if(!Array.isArray(layout.nativeGridEntries))
    throw new TypeError('Malformed native grid collection');
  const matches=layout.nativeGridEntries.filter(
    entry=>entry.gridIdNative===nativeGridId);
  if(matches.length===0)return {status:'unknown_native_grid_in_layout'};
  if(matches.length!==1)
    throw new TypeError('Ambiguous duplicate native Grid.ID');
  const entry=matches[0];
  if(typeof entry.gridDataPath!=='string'||!entry.gridDataPath)
    throw new TypeError('Missing explicit native GridDataPath');
  const grid=catalog.grids.get(entry.gridDataPath);
  if(!grid)return {
    status:'missing_referenced_grid_in_source_subset',
    sourceLayoutId:id,gridIdNative:nativeGridId,gridDataPath:entry.gridDataPath
  };
  const sx=grid.sizeX,sy=grid.sizeY;
  if(!Number.isSafeInteger(sx)||!Number.isSafeInteger(sy)||
      (sx as number)<=0||(sy as number)<=0||
      (sx as number)*(sy as number)>16777216)return {
    status:'native_grid_dimensions_unavailable',
    sourceLayoutId:id,gridIdNative:nativeGridId,gridDataPath:entry.gridDataPath
  };
  if(!isRecord(rect))
    throw new TypeError('Native anchor viewport rectangle required');
  const {x,y,width,height}=rect as Rect;
  if(![x,y,width,height].every(Number.isSafeInteger)||
      x<0||y<0||width<1||height<1||width>256||height>256||
      x+width>(sx as number)||y+height>(sy as number))return {
    status:'outside_native_grid_or_preview_limit',
    sourceLayoutId:id,gridIdNative:nativeGridId,gridDataPath:entry.gridDataPath
  };
  const native=catalog.layoutObjectsByGrid.get(id)?.get(nativeGridId)??[];
  if(!Number.isSafeInteger(entry.defaultObjectCount)||
      entry.defaultObjectCount<0||entry.defaultObjectCount!==native.length)
    return {
      status:'incomplete_native_default_object_source',
      sourceLayoutId:id,gridIdNative:nativeGridId
    };
  const gridBins=requireIndex(catalog).get(id)?.get(nativeGridId);
  const selected:IndexedAnchor[]=[];
  const minBX=Math.floor(x/SOURCE_ANCHOR_BUCKET_SIDE);
  const maxBX=Math.floor((x+width-1)/SOURCE_ANCHOR_BUCKET_SIDE);
  const minBY=Math.floor(y/SOURCE_ANCHOR_BUCKET_SIDE);
  const maxBY=Math.floor((y+height-1)/SOURCE_ANCHOR_BUCKET_SIDE);
  for(let bx=minBX;bx<=maxBX;bx++){
    for(let by=minBY;by<=maxBY;by++){
      for(const bucket of gridBins?.get(bx+':'+by)??[]){
        const record=bucket.record;
        if(record.x>=x&&record.x<x+width&&
           record.y>=y&&record.y<y+height)
          selected.push(bucket);
      }
    }
  }
  selected.sort((a,b)=>a.sourceOrdinal-b.sourceOrdinal);
  const matchingAnchorCount=selected.length;
  const pageRecords=page===null?selected:
    selected.slice(page.offset,page.offset+page.limit);
  const anchors=pageRecords.map(({record})=>({
    layoutObjectId:record.layoutObjectId,
    gridObjectIdNative:record.gridObjectIdNative,
    itemId:record.itemId,
    x:record.x,y:record.y,
    orientationCode:record.orientationCode,
    orientationName:record.orientationName??null,
    positionBasis:'nativeGridLocalSourceRecord',
    fullFootprintVerified:false,
    fixedImmovableVerified:false
  }));
  return {
    status:'source_native_default_layout_anchors_only',
    sourceLayoutId:id,gridIdNative:nativeGridId,
    gridDataPath:entry.gridDataPath,
    nativeGridSizeX:sx,nativeGridSizeY:sy,
    rect:{x,y,width,height},
    defaultObjectAnchors:anchors,
    totalNativeDefaultObjectAnchors:native.length,
    viewAnchorCount:anchors.length,
    ...(page===null?{}:{
      matchingNativeDefaultAnchorCount:matchingAnchorCount,
      pageOffset:page.offset,pageLimit:page.limit,
      hasNextPage:page.offset+anchors.length<matchingAnchorCount,
      nextOffset:page.offset+anchors.length<matchingAnchorCount
        ?page.offset+anchors.length:null
    }),
    terrainDecoded:false,
    nativeGridLocalCoordinatesOnly:true,
    worldCoordinatesVerified:false,
    gridObjectAnchorConventionVerified:false,
    fullFootprintOccupancyVerified:false,
    currentSaveObjectVerified:false,
    placementLegalityVerified:false,
    nativeCodeBodyVerified:false,
    sourceScopeVerified:catalog.manifest.sourceScopeVerified===true
  };
}
/** AreaType->GridCollection follows an original literal GridLayoutPath. */
export function getNativeVillageAreaAnchorWindow(
  source:unknown,villageLayoutId:string,nativeAreaTypeCode:number,
  nativeGridId:number,rect:unknown,page:Page|null=null
){
  const catalog=requireCatalog(source);
  const id=String(villageLayoutId);
  const village=catalog.layouts.get(id);
  if(!village)return {status:'unknown_native_village_layout'};
  if(village.layoutKind!=='nativeDefaultVillageData')
    return {status:'not_native_default_village_data'};
  if(!Number.isSafeInteger(nativeAreaTypeCode))
    throw new TypeError('Native village area code must be an integer');
  if(!Array.isArray(village.areaLayoutReferences))
    throw new TypeError('Malformed native village area reference map');
  const matches=village.areaLayoutReferences.filter(
    area=>area.nativeAreaTypeCode===nativeAreaTypeCode);
  if(matches.length===0)return {status:'unknown_native_village_area'};
  if(matches.length!==1)
    throw new TypeError('Duplicate native area type code');
  const area=matches[0];
  if(typeof area.gridLayoutPath!=='string'||!area.gridLayoutPath)
    throw new TypeError('Missing native village area GridLayoutPath');
  if(!catalog.layouts.has(area.gridLayoutPath))return {
    status:'missing_referenced_area_layout_in_source_subset',
    villageLayoutId:id,nativeAreaTypeCode,
    expectedGridLayoutPath:area.gridLayoutPath
  };
  const anchors=getNativeDefaultLayoutAnchorWindow(
    catalog,area.gridLayoutPath,nativeGridId,rect,page);
  return {
    ...anchors,villageLayoutId:id,nativeAreaTypeCode,
    nativeAreaTypeName:area.nativeAreaTypeName??null,
    gridLayoutPath:area.gridLayoutPath
  };
}
