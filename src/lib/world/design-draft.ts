/** Device-local work recovery only. No game save, private identifiers or ghost state. */
import {DESIGN_LIMIT,designCandidateValid,type DesignTimeline,type DesignPlacement,type DesignItemGeometry} from './design-layout.ts';
import {mainlandItemsValid,type MainlandDesignFrame} from './mainland-design-frame.ts';
import {PUBLIC_TERRAIN_ROOT,type PublicTerrainGridRef} from './public-terrain-projection.ts';
import {exclusiveAnchorClass} from './saved-map-transform.ts';
import {maxMapZoom,type MapCamera} from './map-camera.ts';
export interface DraftLocation{key:string;identity:string;width:number;height:number}
const gridIdentity=(g:PublicTerrainGridRef)=>[g.key,g.layoutId,g.gridDataPath,g.gridIdNative,g.factor,g.sizeX,g.sizeY];
export function designDraftLocation(grid:PublicTerrainGridRef,frame:MainlandDesignFrame|null):DraftLocation{
 const width=frame?.raster.sizeX??grid.sizeX*grid.factor,height=frame?.raster.sizeY??grid.sizeY*grid.factor;
 const key=frame?'world:'+frame.grids[0]?.layoutId.split('/')[1]:'area:'+grid.key;
 const basis=frame?[frame.minX,frame.minZ,...frame.grids.map(g=>[...gridIdentity(g),...g.origin.position,g.bounds.x,g.bounds.y,g.bounds.w,g.bounds.h]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'en'))]:gridIdentity(grid);
 return {key,identity:JSON.stringify([PUBLIC_TERRAIN_ROOT,width,height,basis]),width,height};
}
export interface DesignDraft{schema:'wand.local-design-draft@1';identity:string;timeline:DesignTimeline;camera:MapCamera;selection:number[]}
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(n:unknown,min:number,max:number):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
export function makeDesignDraft(location:DraftLocation,timeline:DesignTimeline,camera:MapCamera,selection:readonly number[]):DesignDraft{
 const ids=new Set(timeline.snapshots[timeline.cursor].map(p=>p.id));
 return {schema:'wand.local-design-draft@1',identity:location.identity,timeline,camera:{...camera},selection:[...new Set(selection)].filter(id=>ids.has(id))};
}
export function parseDesignDraft(value:unknown,location:DraftLocation):DesignDraft{
 const fail=()=>{throw Error('DESIGN_DRAFT_INVALID');};
 if(!record(value)||value.schema!=='wand.local-design-draft@1'||value.identity!==location.identity||!record(value.timeline)||!record(value.camera)||!Array.isArray(value.selection))throw Error('DESIGN_DRAFT_CONTEXT');
 const t=value.timeline,c=value.camera;
 if(!Array.isArray(t.snapshots)||!t.snapshots.length||t.snapshots.length>129||!integer(t.cursor,0,t.snapshots.length-1)||!integer(t.nextId,1,Number.MAX_SAFE_INTEGER-1))throw Error('DESIGN_DRAFT_HISTORY');
 const nextId=t.nextId,cursor=t.cursor;
 const snapshots:DesignPlacement[][]=[];
 for(const snapshot of t.snapshots){
  if(!Array.isArray(snapshot)||snapshot.length>DESIGN_LIMIT)throw Error('DESIGN_DRAFT_LIMIT');
  const ids=new Set<number>(),placements:DesignPlacement[]=[];
  for(const p of snapshot){
   if(!record(p)||!integer(p.id,1,nextId-1)||ids.has(p.id)||!integer(p.itemId,1,0xffffffff)||!integer(p.x,0,location.width-1)||!integer(p.y,0,location.height-1)||!integer(p.orientation,0,3))throw Error('DESIGN_DRAFT_PLACEMENT');
   ids.add(p.id);placements.push({id:p.id,itemId:p.itemId,x:p.x,y:p.y,orientation:p.orientation});
  }
  snapshots.push(placements);
 }
 const zoom=c.zoom,x=c.x,y=c.y;
 if(typeof zoom!=='number'||!Number.isFinite(zoom)||zoom<1||zoom>maxMapZoom(Math.max(location.width,location.height))||typeof x!=='number'||typeof y!=='number'||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw Error('DESIGN_DRAFT_CAMERA');
 const bound=(n:number)=>Math.max(.5/zoom,Math.min(1-.5/zoom,n));
 const selected=new Set(snapshots[cursor].map(p=>p.id));
 if(value.selection.length>DESIGN_LIMIT||!value.selection.every(id=>integer(id,1,nextId-1)&&selected.has(id)))fail();
 return {schema:'wand.local-design-draft@1',identity:location.identity,timeline:{snapshots,cursor,nextId},camera:{zoom,x:bound(x),y:bound(y)},selection:[...new Set(value.selection as number[])]};
}
export function draftItemIds(draft:DesignDraft):number[]{
 const ids=new Set<number>();for(const snapshot of draft.timeline.snapshots)for(const p of snapshot)ids.add(p.itemId);return [...ids];
}
/** Revalidate every history state against current definitions. Shared poses
 * are checked once, but exclusive road/fence anchors are checked per state. */
export function validateDesignDraft(draft:DesignDraft,location:DraftLocation,frame:MainlandDesignFrame|null,defs:ReadonlyMap<number,DesignItemGeometry>):boolean{
 const checked=new Set<string>();
 for(const snapshot of draft.timeline.snapshots){
  const exclusive=new Set<string>();
  for(const p of snapshot){
   const pose=[p.itemId,p.x,p.y,p.orientation].join(':');
   if(!checked.has(pose)){
    const g=defs.get(p.itemId);
    if(!g||!designCandidateValid([],p,g,location.width,location.height)||!mainlandItemsValid(frame,[p],defs))return false;
    checked.add(pose);
   }
   const kind=exclusiveAnchorClass(String(p.itemId));
   if(kind){const anchor=kind+':'+p.x+':'+p.y;if(exclusive.has(anchor))return false;exclusive.add(anchor);}
  }
 }
 return true;
}
interface StoredDraft{revision:string;draft:unknown}
const DB='wand-world-design-recovery',STORE='drafts';
function openDraftDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
  req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('DRAFT_DB_BLOCKED'));
  req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
 });
}
export async function readDesignDraft(key:string):Promise<StoredDraft|undefined>{
 const db=await openDraftDb();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(key);
  tx.oncomplete=()=>resolve(req.result as StoredDraft|undefined);tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
}
/** Revision check and mutation occur within one read/write transaction, so
 * another tab's newer draft is never silently replaced or discarded. */
async function changeDraft(key:string,expected:string|null,draft:DesignDraft|null):Promise<string|null>{
 const db=await openDraftDb();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),get=store.get(key);
  let revision:string|null=null,conflict=false;
  get.onsuccess=()=>{
   const existing=get.result as StoredDraft|undefined;
   if((typeof existing?.revision==='string'?existing.revision:null)!==expected){conflict=true;tx.abort();return;}
   try{if(draft){revision=crypto.randomUUID();store.put({revision,draft},key);}else store.delete(key);}catch(e){reject(e);tx.abort();}
  };
  tx.oncomplete=()=>resolve(revision);tx.onabort=()=>reject(conflict?Error('DRAFT_CONFLICT'):tx.error??Error('DRAFT_WRITE'));tx.onerror=()=>reject(tx.error??Error('DRAFT_WRITE'));
 });}finally{db.close();}
}
export const writeDesignDraft=(key:string,expected:string|null,draft:DesignDraft)=>changeDraft(key,expected,draft);
export const discardDesignDraft=(key:string,expected:string|null)=>changeDraft(key,expected,null);
