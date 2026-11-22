/**
 * DB-04 World preview Module Worker. TypeScript owns typed requests, lifecycle,
 * local file boundaries and viewport projections. This is READ-ONLY.
 * The legacy JavaScript catalog adapter is an explicit pending migration; it
 * is not a World Editor, collision solver, placement Writer or save Codec.
 */
import { openLocalWorldZip } from './local-snapshot.mjs';
import { getNativeTerrainWindow } from './catalog.mjs';
import { findOriginalItemAnchor } from './native-item-anchor-finder.ts';
import { getSourceAnchorDomain, getTessellatedSourceAnchorWindow } from './native-anchor-domain';
import {
  listWorldPreviewViews,
  summarizeWorldPreviewSourceCoverage,
  getWorldPreviewAnchorWindow
} from './preview-views.mjs';

type Rect = Readonly<{x:number; y:number; width:number; height:number}>;
type View = Readonly<{
  viewKey:string;
  layoutId:string;
  grids:ReadonlyArray<{gridIdNative:number;gridDataPath:string}>;
}>;
/** A small, explicit typed adapter around the old untyped read-only JS view. */
interface NativeSourcePage {
  status:string;
  gridDataPath?:string;
  defaultObjectAnchors?:unknown[];
}
const readNativeSourceWindow = getWorldPreviewAnchorWindow as unknown as (
  catalog:unknown, view:View, gridId:number, rect:Rect,
  options?:{offset:number;limit:number}|null
)=>NativeSourcePage;
type Request =
  | { command:'clear'; requestId:number }
  | { command:'load'; requestId:number; file:Blob }
  | { command:'view'; requestId:number; viewKey:string;
      gridIdNative:number; rect:Rect; offset:number }
  | { command:'find-anchor'; requestId:number; viewKey:string;
      gridIdNative:number; itemId:number; matchIndex:number };

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => Promise<void>) | null;
  postMessage: (message: unknown) => void;
}
const worker = self as unknown as WorkerScope;
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
  if (data.command==='find-anchor' &&
      typeof data.viewKey==='string' && data.viewKey.length<=2048 &&
      data.viewKey.length>0 &&
      nonnegative(data.gridIdNative) && data.gridIdNative<=0xffffffff &&
      positive(data.itemId) && nonnegative(data.matchIndex) &&
      data.matchIndex<=1_000_000)
    return {command:'find-anchor',requestId,
      viewKey:data.viewKey,gridIdNative:data.gridIdNative,
      itemId:data.itemId,matchIndex:data.matchIndex};
  if (data.command==='view' &&
      typeof data.viewKey==='string' && data.viewKey.length>0 &&
      nonnegative(data.gridIdNative) && validRect(data.rect) &&
      nonnegative(data.offset))
    return {command:'view',requestId,
      viewKey:data.viewKey,gridIdNative:data.gridIdNative,
      rect:data.rect,offset:data.offset};
  throw new TypeError('DB04_WORKER_INVALID_REQUEST');
}

// No source objects, full archive, save bytes or World edits cross the UI edge.
let loaded:Awaited<ReturnType<typeof openLocalWorldZip>>|null=null;
let catalog:unknown=null;
let views:View[]=[];

worker.onmessage = async ({data}:MessageEvent<unknown>):Promise<void> => {
  const rawId = object(data) ? data.requestId : undefined;
  const requestId = nonnegative(rawId) ? rawId : 0;
  try {
    const message = parseRequest(data);
    if (message.command==='clear') {
      loaded=null;
      catalog=null;
      views=[];
      worker.postMessage({kind:'cleared',requestId});
      return;
    }
    if (message.command==='load') {
      loaded=null;
      catalog=null;
      views=[];
      const source = await openLocalWorldZip(message.file);
      catalog=source.catalog;
      loaded=source;
      views=(listWorldPreviewViews(catalog) as View[]).map(view=>({
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
        sourceScopeVerified:source.sourceScopeVerified,
        regionCoverage:summarizeWorldPreviewSourceCoverage(catalog),
        layouts:views
      });
      return;
    }
    if (catalog===null)
      throw new TypeError('No selected local World source');
    const sourceView=views.find(view=>view.viewKey===message.viewKey);
    if (!sourceView)
      throw new TypeError('Unknown local World view');
    if(message.command==='find-anchor'){
      if(!sourceView.grids.some(grid=>grid.gridIdNative===message.gridIdNative))
        throw new TypeError('Unknown original source Grid ID');
      const found=findOriginalItemAnchor(catalog,sourceView.layoutId,
        message.gridIdNative,message.itemId,message.matchIndex);
      worker.postMessage({kind:'anchor-found',requestId,result:found});
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
        terrainRows:null
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
    const page=readNativeSourceWindow(catalog,sourceView,
      message.gridIdNative,message.rect,{offset:message.offset,limit:64});
    if (page.status!=='source_native_default_layout_anchors_only') {
      worker.postMessage({kind:'view',requestId,page,markers:[],
        terrainStatus:null});
      return;
    }

    // Point counts are SOURCE ANCHORS, never footprint or collision masks.
    const full=readNativeSourceWindow(catalog,sourceView,
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
        ? terrain.rows : null
    });
  }catch(error){
    worker.postMessage({
      kind:'error',requestId,
      message:error instanceof Error?error.message.slice(0,240):
        'ローカルWorldデータの処理に失敗しました。'
    });
  }
};
