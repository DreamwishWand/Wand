/**
 * DB-04 World preview Module Worker. TypeScript owns typed requests, lifecycle,
 * local file boundaries and viewport projections. This is READ-ONLY.
 * Rust/WASM handles local World archive bytes; the legacy catalog adapter is
 * an explicit pending migration. This Worker has no network upload path.
 * It is not a World Editor, collision solver, placement Writer or save Codec.
 */
import { openLocalWorldZip } from './local-snapshot.ts';
import { WorldSourceLoadEpoch } from './world-source-load-epoch.ts';
import { getNativeTerrainWindow,getNativeTerrainRaster } from './native-terrain-preview.ts';
import {buildSavedShapeMap,parseSavedShapePoints} from './saved-shape-map.ts';
import type {SavedNumericPoint} from './saved-grid-source-candidates.ts';
import {buildSourceObjectMap} from './source-object-map.ts';
import {getNativeRegionGridAtlasPage} from './native-region-grid-atlas.ts';
import {searchNativeFloorItems,getNativeFloorMatchResult} from './native-floor-match.ts';
import {
  getNativeFloorWindowResult,type FloorWindowMapper
} from './native-floor-rectangle-window.ts';
import {WasmSourceFloorShape} from './wasm/pkg/wand_world_core.js';
import { findOriginalItemAnchor, findOriginalItemAnchorAcrossGrids } from './native-item-anchor-finder.ts';
import { getOriginalGridAreaEvidence } from './native-gridarea-evidence.ts';
import { getOriginalGridAreaLocalWindow } from './native-gridarea-local-window.ts';
import { getOriginalGridObjectItemAreaLink } from './native-gridobject-item-area-link.ts';
import {getOriginalDefaultGridLayersAtCell} from './native-default-gridlayers-cell.ts';
import {getOriginalDefaultGridLayersWindow} from './native-default-gridlayers-window.ts';
import {inspectSourceDefaultGridLayers} from './native-source-layer-inspection.ts';
import {probeOriginalSourceDefaultCandidate} from './native-default-candidate-probe.ts';
import { getSourceAnchorDomain, getTessellatedSourceAnchorWindow } from './native-anchor-domain';
import {
  listWorldPreviewViews,
  summarizeWorldPreviewSourceCoverage,
  getWorldPreviewAnchorWindow,
  requireWorldPreviewCatalog,
  type WorldPreviewCatalog,
  type WorldPreviewView
} from './preview-views.ts';

type Rect = Readonly<{x:number; y:number; width:number; height:number}>;
type Request =
  | { command:'clear'; requestId:number }
  | { command:'load'; requestId:number; file:Blob }
  | { command:'floor-items'; requestId:number; query:string }
  | { command:'floor-match';requestId:number;regionKey:string;
      viewKey:string;gridIdNative:number;itemId:number;orientationCode:number }
  | { command:'floor-layer-inspect';requestId:number;viewKey:string;
      gridIdNative:number;x:number;y:number }
  | { command:'saved-shapes';requestId:number;viewKey:string;gridIdNative:number;points:SavedNumericPoint[] }
  | { command:'terrain-raster'; requestId:number; viewKey:string; gridIdNative:number }
  | { command:'region-atlas'; requestId:number; regionKey:string;offset:number }
  | { command:'view'; requestId:number; viewKey:string;
      gridIdNative:number; rect:Rect; offset:number;
      includeDefaultLayers:boolean }
  | { command:'find-anchor'; requestId:number; viewKey:string;
      gridIdNative:number; itemId:number; matchIndex:number }
  | { command:'find-global-anchor'; requestId:number;
      itemId:number; matchIndex:number }
  | { command:'gridarea-window'; requestId:number;
      itemId:number; orientationCode:number; callerGridFactor:1|2; rect:Rect }
  | { command:'grid-cell-layers'; requestId:number; viewKey:string;
      gridIdNative:number; x:number; y:number }
  | { command:'candidate-probe'; requestId:number; viewKey:string;
      gridIdNative:number; gridObjectIdNative:number;itemId:number;
      candidateX:number;candidateY:number;orientationCode:number };

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => Promise<void>) | null;
  postMessage: (message: unknown) => void;
}
const worker = self as unknown as WorkerScope;

/**
 * Invoked only after the same Worker initialized its World ZIP Rust/WASM
 * module. All O(GridData cells) mapped shape scanning runs in Rust.
 */
const wasmFloorWindow:FloorWindowMapper=(grid,accepted,bx,by,shape)=>{
  const solver=new WasmSourceFloorShape(
    grid.nativeFloorValues,grid.sizeX,grid.sizeY,accepted,bx,by,shape);
  try{
    return {originBitmap:solver.origin_bitmap(),
      originCount:solver.origin_count()};
  }finally{solver.free();}
};
const object = (x:unknown): x is Record<string,unknown> =>
  x!==null && typeof x==='object' && !Array.isArray(x);
const nonnegative = (x:unknown): x is number =>
  typeof x==='number' && Number.isSafeInteger(x) && x>=0;
const positive = (x:unknown): x is number =>
  typeof x==='number' && Number.isSafeInteger(x) && x>0;
const validRect = (x:unknown): x is Rect =>
  object(x) && nonnegative(x.x) && nonnegative(x.y) &&
  positive(x.width) && positive(x.height) &&
  x.width<=32 && x.height<=32;

function parseRequest(data:unknown): Request {
  if (!object(data) || typeof data.command !== 'string')
    throw new TypeError('DB04_WORKER_INVALID_REQUEST');
  const requestId = nonnegative(data.requestId) ? data.requestId : 0;
  if (data.command==='clear') return {command:'clear',requestId};
  if (data.command==='load') {
    if (!(data.file instanceof Blob))
      throw new TypeError('DB04_WORKER_SOURCE_FILE_REQUIRED');
    return {command:'load',requestId,file:data.file};
  }
  if(data.command==='gridarea-window'&&positive(data.itemId)&&
     nonnegative(data.orientationCode)&&data.orientationCode<=15&&
     (data.callerGridFactor===1||data.callerGridFactor===2)&&
     validRect(data.rect)&&data.rect.width<=16&&data.rect.height<=16)
    return {command:'gridarea-window',requestId,
      itemId:data.itemId,orientationCode:data.orientationCode,
      callerGridFactor:data.callerGridFactor,rect:data.rect};
  if(data.command==='candidate-probe'&&
     typeof data.viewKey==='string'&&data.viewKey.length>0&&
     data.viewKey.length<=2048&&
     nonnegative(data.gridIdNative)&&data.gridIdNative<=0xffffffff&&
     nonnegative(data.gridObjectIdNative)&&data.gridObjectIdNative<=0xffffffff&&
     positive(data.itemId)&&data.itemId<=0xffffffff&&
     nonnegative(data.candidateX)&&data.candidateX<=0xffffffff&&
     nonnegative(data.candidateY)&&data.candidateY<=0xffffffff&&
     nonnegative(data.orientationCode)&&data.orientationCode<=15)
    return {command:'candidate-probe',requestId,
      viewKey:data.viewKey,gridIdNative:data.gridIdNative,
      gridObjectIdNative:data.gridObjectIdNative,itemId:data.itemId,
      candidateX:data.candidateX,candidateY:data.candidateY,
      orientationCode:data.orientationCode};
  if(data.command==='grid-cell-layers'&&
     typeof data.viewKey==='string'&&data.viewKey.length>0&&
     data.viewKey.length<=2048&&
     nonnegative(data.gridIdNative)&&data.gridIdNative<=0xffffffff&&
     nonnegative(data.x)&&nonnegative(data.y)&&
     data.x<=0xffffffff&&data.y<=0xffffffff)
    return {command:'grid-cell-layers',requestId,
      viewKey:data.viewKey,gridIdNative:data.gridIdNative,
      x:data.x,y:data.y};
  if(data.command==='find-global-anchor'&&positive(data.itemId)&&
     nonnegative(data.matchIndex)&&data.matchIndex<=1_000_000)
    return {command:'find-global-anchor',requestId,
      itemId:data.itemId,matchIndex:data.matchIndex};
  if (data.command==='find-anchor' &&
      typeof data.viewKey==='string' && data.viewKey.length<=2048 &&
      data.viewKey.length>0 &&
      nonnegative(data.gridIdNative) && data.gridIdNative<=0xffffffff &&
      positive(data.itemId) && nonnegative(data.matchIndex) &&
      data.matchIndex<=1_000_000)
    return {command:'find-anchor',requestId,
      viewKey:data.viewKey,gridIdNative:data.gridIdNative,
      itemId:data.itemId,matchIndex:data.matchIndex};
  if(data.command==='floor-layer-inspect'&&
    typeof data.viewKey==='string'&&data.viewKey.length>0&&
    data.viewKey.length<=2048&&nonnegative(data.gridIdNative)&&
    data.gridIdNative<=0xffffffff&&
    nonnegative(data.x)&&data.x<=0xffffffff&&
    nonnegative(data.y)&&data.y<=0xffffffff)
    return {command:'floor-layer-inspect',requestId,
      viewKey:data.viewKey,gridIdNative:data.gridIdNative,
      x:data.x,y:data.y};
  if(data.command==='floor-items'&&
    typeof data.query==='string'&&data.query.length<=100)
    return {command:'floor-items',requestId,query:data.query};
  if(data.command==='floor-match'&&
    typeof data.regionKey==='string'&&data.regionKey.length>0&&
    data.regionKey.length<=256&&
    typeof data.viewKey==='string'&&data.viewKey.length>0&&
    data.viewKey.length<=2048&&
    nonnegative(data.gridIdNative)&&data.gridIdNative<=0xffffffff&&
    positive(data.itemId)&&data.itemId<=0xffffffff&&
    nonnegative(data.orientationCode)&&data.orientationCode<=15)
    return {command:'floor-match',requestId,
      regionKey:data.regionKey,viewKey:data.viewKey,
      gridIdNative:data.gridIdNative,itemId:data.itemId,
      orientationCode:data.orientationCode};
  if(data.command==='region-atlas'&&
    typeof data.regionKey==='string'&&data.regionKey.length>0&&
    data.regionKey.length<=256&&nonnegative(data.offset)&&
    data.offset<=65536)
    return {command:'region-atlas',requestId,
      regionKey:data.regionKey,offset:data.offset};
  if(data.command==='saved-shapes'&&typeof data.viewKey==='string'&&data.viewKey.length>0&&
    data.viewKey.length<=2048&&nonnegative(data.gridIdNative)&&data.gridIdNative<=0xffffffff)
    return {command:'saved-shapes',requestId,viewKey:data.viewKey,gridIdNative:data.gridIdNative,
      points:parseSavedShapePoints(data.points)};
  if(data.command==='terrain-raster'&&
      typeof data.viewKey==='string'&&data.viewKey.length>0&&
      data.viewKey.length<=2048&&
      nonnegative(data.gridIdNative)&&data.gridIdNative<=0xffffffff)
    return {command:'terrain-raster',requestId,
      viewKey:data.viewKey,gridIdNative:data.gridIdNative};
  if (data.command==='view' &&
      typeof data.viewKey==='string' && data.viewKey.length>0 &&
      nonnegative(data.gridIdNative) && validRect(data.rect) &&
      nonnegative(data.offset))
    return {command:'view',requestId,
      viewKey:data.viewKey,gridIdNative:data.gridIdNative,
      rect:data.rect,offset:data.offset,
      includeDefaultLayers:data.includeDefaultLayers===true};
  throw new TypeError('DB04_WORKER_INVALID_REQUEST');
}

// No source objects, full archive, save bytes or World edits cross the UI edge.
let loaded:Awaited<ReturnType<typeof openLocalWorldZip>>|null=null;
let catalog:WorldPreviewCatalog|null=null;
let views:WorldPreviewView[]=[];
const worldLoadEpoch=new WorldSourceLoadEpoch();

worker.onmessage = async ({data}:MessageEvent<unknown>):Promise<void> => {
  const rawId = object(data) ? data.requestId : undefined;
  const requestId = nonnegative(rawId) ? rawId : 0;
  let pendingLoadTicket:number|null=null;
  try {
    const message = parseRequest(data);
    if (message.command==='clear') {
      worldLoadEpoch.invalidate();
      loaded=null;
      catalog=null;
      views=[];
      worker.postMessage({kind:'cleared',requestId});
      return;
    }
    if (message.command==='load') {
      pendingLoadTicket=worldLoadEpoch.begin();
      loaded=null;
      catalog=null;
      views=[];
      const source = await openLocalWorldZip(message.file);
      // A clear or replacement load may have arrived while Rust/WASM read.
      // Never publish late bytes, metadata, or an outdated source catalog.
      if(!worldLoadEpoch.isCurrent(pendingLoadTicket))return;
      catalog=requireWorldPreviewCatalog(source.catalog);
      loaded=source;
      views=listWorldPreviewViews(catalog).map(view=>({
        ...view,
        grids:view.grids.map(grid=>{
          const domain=getSourceAnchorDomain(catalog,view.layoutId,grid.gridIdNative);
          return {
            ...grid,
            anchorSizeX:domain?.anchorSizeX??null,
            anchorSizeY:domain?.anchorSizeY??null,
            tessellationFactor:domain?.tessellationFactor??null,
            anchorDomainStatus:domain?.status??'native_grid_source_not_available'
          };
        })
      }));
      worker.postMessage({
        kind:'loaded',requestId,
        gameVersion:source.gameVersion,platform:source.platform,
        integrity:source.integrity,
        originalSourceAuthenticated:false,privateDataUploaded:false,
        manifestFilesVerified:source.manifestFilesVerified,
        manifestRawSha256:source.manifestRawSha256,
        sourceScopeVerified:source.sourceScopeVerified,
        regionCoverage:summarizeWorldPreviewSourceCoverage(catalog),
        layouts:views
      });
      return;
    }
    if (catalog===null)
      throw new TypeError('No selected local World source');
    if(message.command==='find-global-anchor'){
      const found=findOriginalItemAnchorAcrossGrids(
        catalog,message.itemId,message.matchIndex);
      const areaLink=found.status==='found'&&
        found.sourceLayoutId!==null&&
        found.nativeGridId!==null&&found.gridObjectIdNative!==null
        ?getOriginalGridObjectItemAreaLink(catalog,
          found.sourceLayoutId,found.nativeGridId,
          found.gridObjectIdNative,message.itemId):null;
      worker.postMessage({kind:'global-anchor-found',requestId,result:found,
        areaLink,
        itemEvidence:getOriginalGridAreaEvidence(catalog,message.itemId)});
      return;
    }
    if(message.command==='gridarea-window'){
      const {x,y,width,height}=message.rect;
      const window=getOriginalGridAreaLocalWindow(catalog,
        message.itemId,message.orientationCode,x,y,width,height,
        message.callerGridFactor);
      worker.postMessage({kind:'gridarea-window',requestId,result:window});
      return;
    }
    if(message.command==='floor-items'){
      const items=searchNativeFloorItems(catalog,message.query,24);
      worker.postMessage({kind:'floor-items',requestId,
        query:message.query,items});
      return;
    }
    if(message.command==='floor-match'){
      const result=getNativeFloorMatchResult(catalog,views,
        message.regionKey,message.viewKey,
        message.gridIdNative,message.itemId);
      const windowResult=getNativeFloorWindowResult(catalog,views,
        message.regionKey,message.viewKey,
        message.gridIdNative,message.itemId,message.orientationCode,
        wasmFloorWindow);
      worker.postMessage({kind:'floor-match',requestId,result,windowResult});
      return;
    }
    if(message.command==='region-atlas'){
      const result=getNativeRegionGridAtlasPage(
        catalog,views,message.regionKey,message.offset);
      worker.postMessage({kind:'region-atlas',requestId,result});
      return;
    }
    const sourceView=views.find(view=>view.viewKey===message.viewKey);
    if (!sourceView)
      throw new TypeError('Unknown local World view');
    if(message.command==='floor-layer-inspect'){
      const result=inspectSourceDefaultGridLayers(
        catalog,views,sourceView.viewKey,message.gridIdNative,
        message.x,message.y);
      worker.postMessage({kind:'floor-layer-inspect',requestId,result});
      return;
    }
    if(message.command==='saved-shapes'){
      if(!sourceView.grids.some(g=>g.gridIdNative===message.gridIdNative))
        throw new TypeError('DB04_SAVE_SHAPE_GRID_MISSING');
      const result=buildSavedShapeMap(catalog,sourceView.layoutId,message.gridIdNative,message.points);
      worker.postMessage({kind:'saved-shapes',requestId,result});return;
    }
    if(message.command==='terrain-raster'){
      const grid=sourceView.grids.find(
        item=>item.gridIdNative===message.gridIdNative);
      if(!grid)throw new TypeError('Unknown original source Grid ID');
      const result=getNativeTerrainRaster(catalog,grid.gridDataPath);
      let objectMap=null;
      try{objectMap=buildSourceObjectMap(catalog,sourceView.layoutId,grid.gridIdNative);}
      catch{/* A malformed object definition must not hide valid terrain. */}
      worker.postMessage({
        kind:'terrain-raster',requestId,viewKey:sourceView.viewKey,
        gridIdNative:message.gridIdNative,gridDataPath:grid.gridDataPath,
        result,objectMap
      });
      return;
    }
    if(message.command==='candidate-probe'){
      if(!sourceView.grids.some(g=>g.gridIdNative===message.gridIdNative))
        throw new TypeError('Unknown original source Grid ID');
      const result=probeOriginalSourceDefaultCandidate(
        catalog,sourceView.layoutId,message.gridIdNative,
        message.gridObjectIdNative,message.itemId,
        message.candidateX,message.candidateY,message.orientationCode);
      worker.postMessage({kind:'candidate-probe',requestId,result});
      return;
    }
    if(message.command==='grid-cell-layers'){
      if(!sourceView.grids.some(g=>g.gridIdNative===message.gridIdNative))
        throw new TypeError('Unknown original source Grid ID');
      const result=getOriginalDefaultGridLayersAtCell(
        catalog,sourceView.layoutId,message.gridIdNative,
        message.x,message.y);
      worker.postMessage({kind:'grid-cell-layers',requestId,result});
      return;
    }
    if(message.command==='find-anchor'){
      if(!sourceView.grids.some(grid=>grid.gridIdNative===message.gridIdNative))
        throw new TypeError('Unknown original source Grid ID');
      const found=findOriginalItemAnchor(catalog,sourceView.layoutId,
        message.gridIdNative,message.itemId,message.matchIndex);
      const areaLink=found.status==='found'&&found.gridObjectIdNative!==null
        ?getOriginalGridObjectItemAreaLink(catalog,sourceView.layoutId,
          message.gridIdNative,found.gridObjectIdNative,message.itemId):null;
      worker.postMessage({kind:'anchor-found',requestId,result:found,
        areaLink,
        itemEvidence:getOriginalGridAreaEvidence(catalog,message.itemId)});
      return;
    }
    const domain=getSourceAnchorDomain(catalog,sourceView.layoutId,message.gridIdNative);
    if(domain?.status==='steam1262_original_factor_two_anchor_envelope'){
      // Raw GridData cells and factor-two source-object X/Y have not been
      // proven to be the same coordinate space. Never draw a fake overlay.
      const result=getTessellatedSourceAnchorWindow(
        catalog,sourceView.layoutId,message.gridIdNative,
        message.rect,message.offset,64);
      worker.postMessage({
        kind:'view',requestId,page:result.page,markers:result.markers,
        terrainStatus:'native_terrain_not_projected_to_source_anchor_coordinates',
        terrainRows:null,
        defaultLayersWindow:message.includeDefaultLayers?
          getOriginalDefaultGridLayersWindow(catalog,sourceView.layoutId,
            message.gridIdNative,message.rect):null
      });
      return;
    }
    if(domain?.status==='tessellation_coordinate_relation_unverified'){
      worker.postMessage({
        kind:'view',requestId,
        page:{status:'native_anchor_tessellation_not_corroborated'},
        markers:[],terrainStatus:null,terrainRows:null
      });
      return;
    }
    const page=getWorldPreviewAnchorWindow(catalog,sourceView,
      message.gridIdNative,message.rect,{offset:message.offset,limit:64});
    if (page.status!=='source_native_default_layout_anchors_only') {
      worker.postMessage({kind:'view',requestId,page,markers:[],
        terrainStatus:null,defaultLayersWindow:null});
      return;
    }

    // Point counts are SOURCE ANCHORS, never footprint or collision masks.
    const full=getWorldPreviewAnchorWindow(catalog,sourceView,
      message.gridIdNative,message.rect);
    const originalAnchors:unknown=full.defaultObjectAnchors;
    if (!Array.isArray(originalAnchors))
      throw new TypeError('Invalid source-default anchor window');
    const counts=new Map<string,number>();
    for (const point of originalAnchors as unknown[]) {
      if (!object(point) ||
          !Number.isSafeInteger(point.x) ||
          !Number.isSafeInteger(point.y))
        throw new TypeError('Invalid original source-local anchor');
      const key=String(point.x)+':'+String(point.y);
      counts.set(key,(counts.get(key)??0)+1);
    }
    const markers=[...counts].map(([key,count])=>{
      const [x,y]=key.split(':').map(Number);
      return {x,y,count};
    });
    if (typeof page.gridDataPath!=='string' ||
        !page.gridDataPath.startsWith('GridData/'))
      throw new TypeError('Invalid literal original GridData path');
    const terrain=getNativeTerrainWindow(catalog,page.gridDataPath,message.rect);
    worker.postMessage({
      kind:'view',requestId,page,markers,
      terrainStatus:terrain.status,
      terrainRows:terrain.status==='source_corroborated_grid_local_preview'
        ? terrain.rows : null,
      defaultLayersWindow:message.includeDefaultLayers?
        getOriginalDefaultGridLayersWindow(catalog,sourceView.layoutId,
          message.gridIdNative,message.rect):null
    });
  }catch(error){
    // A rejected older archive must not replace a newer source's status.
    if(pendingLoadTicket!==null &&
       !worldLoadEpoch.isCurrent(pendingLoadTicket))return;
    worker.postMessage({
      kind:'error',requestId,
      message:error instanceof Error?error.message.slice(0,240):
        'ローカルWorldデータの処理に失敗しました。'
    });
  }
};
