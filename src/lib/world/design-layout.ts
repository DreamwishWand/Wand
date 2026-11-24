/** Independent local design state. IDs are synthetic and never sent to a save writer. */
import type {SavedShapeMap,SavedShapeObject} from './saved-shape-map.ts';
import type {SourceObjectShape} from './source-object-map.ts';
import {CARDINAL_ORIENTATIONS,exclusiveAnchorClass} from './saved-map-transform.ts';
import {nativeActionBlocked,type NativeEditRestrictions} from './native-edit-restrictions.ts';
import type {MapObjectLayer} from './source-map-layers.ts';
export interface DesignCatalogItem{
 readonly itemId:number;readonly name:string;readonly layer:MapObjectLayer;
}
export interface DesignItemGeometry{
 readonly itemId:number;readonly name:string|null;readonly layer:MapObjectLayer;
 readonly surfaceCapable:boolean;readonly editRestrictions?:NativeEditRestrictions;
 readonly shapes:Readonly<Record<string,SourceObjectShape>>;
}
export interface DesignPlacement{
 readonly id:number;readonly itemId:number;readonly x:number;readonly y:number;readonly orientation:number;
}
export interface DesignTimeline{
 readonly snapshots:readonly (readonly DesignPlacement[])[];readonly cursor:number;readonly nextId:number;
}
export const emptyDesign=():DesignTimeline=>({snapshots:[[]],cursor:0,nextId:1});
export const currentDesign=(t:DesignTimeline)=>t.snapshots[t.cursor];
export function travelDesign(t:DesignTimeline,delta:-1|1):DesignTimeline{
 const cursor=t.cursor+delta;return cursor>=0&&cursor<t.snapshots.length?{...t,cursor}:t;
}
export const DESIGN_LIMIT=5000;
function commit(t:DesignTimeline,placements:readonly DesignPlacement[],nextId=t.nextId):DesignTimeline{
 const snapshots=[...t.snapshots.slice(0,t.cursor+1),placements].slice(-129);
 return {snapshots,cursor:snapshots.length-1,nextId};
}
export function designCandidateValid(placements:readonly DesignPlacement[],candidate:DesignPlacement,
 geometry:DesignItemGeometry,width:number,height:number):boolean{
 const shape=geometry.shapes[geometry.itemId+':'+candidate.orientation*4];
 if(candidate.itemId!==geometry.itemId||!shape||!Number.isSafeInteger(candidate.x)||!Number.isSafeInteger(candidate.y)||
   candidate.x<0||candidate.y<0||candidate.x+shape.width>width||candidate.y+shape.height>height||
   nativeActionBlocked(geometry.editRestrictions,'select'))return false;
 const exclusive=exclusiveAnchorClass(String(candidate.itemId));
 return !exclusive||!placements.some(o=>o.id!==candidate.id&&o.x===candidate.x&&o.y===candidate.y&&exclusiveAnchorClass(String(o.itemId))===exclusive);
}
export function placeDesign(t:DesignTimeline,g:DesignItemGeometry,x:number,y:number,orientation:number,width:number,height:number):DesignTimeline|null{
 const old=currentDesign(t);if(old.length>=DESIGN_LIMIT)return null;
 const candidate={id:t.nextId,itemId:g.itemId,x,y,orientation};
 return designCandidateValid(old,candidate,g,width,height)?commit(t,[...old,candidate],t.nextId+1):null;
}
export function transformDesign(t:DesignTimeline,id:number,g:DesignItemGeometry,x:number,y:number,orientation:number,width:number,height:number):DesignTimeline|null{
 const old=currentDesign(t),o=old.find(o=>o.id===id);
 if(!o||o.itemId!==g.itemId||x===o.x&&y===o.y&&orientation===o.orientation||
    (x!==o.x||y!==o.y)&&nativeActionBlocked(g.editRestrictions,'move')||
    orientation!==o.orientation&&(exclusiveAnchorClass(String(o.itemId))||nativeActionBlocked(g.editRestrictions,'rotate')))return null;
 const candidate={...o,x,y,orientation};
 return designCandidateValid(old,candidate,g,width,height)?commit(t,old.map(p=>p.id===id?candidate:p)):null;
}
export function removeDesign(t:DesignTimeline,id:number,g:DesignItemGeometry):DesignTimeline|null{
 const old=currentDesign(t),o=old.find(o=>o.id===id);
 return o&&o.itemId===g.itemId&&!nativeActionBlocked(g.editRestrictions,'remove')?commit(t,old.filter(p=>p.id!==id)):null;
}
export function designShapeMap(placements:readonly DesignPlacement[],definitions:ReadonlyMap<number,DesignItemGeometry>,
 grid:{layoutId:string;gridIdNative:number;gridDataPath:string;factor:1|2}):SavedShapeMap{
 const shapes:Record<string,SourceObjectShape>={},objects:SavedShapeObject[]=[];
 for(const p of placements){
  const g=definitions.get(p.itemId);if(!g)continue;
  Object.assign(shapes,g.shapes);
  const code=p.orientation*4,key=p.itemId+':'+code;
  objects.push({localOrdinal:p.id,localGridOrdinal:1,itemId:String(p.itemId),x:p.x,y:p.y,
   orientation:CARDINAL_ORIENTATIONS[p.orientation],orientationCode:code,shapeKey:shapes[key]?key:null,
   name:g.name,layer:g.layer,surfaceCapable:g.surfaceCapable,editRestrictions:g.editRestrictions});
 }
 return {layoutId:grid.layoutId,gridIdNative:grid.gridIdNative,gridDataPath:grid.gridDataPath,sourceGridFactor:grid.factor,
  objects,shapes,actualOccupancyVerified:false,savedSourceCoordinateEquivalenceVerified:false};
}

/** Local design document, not a game Save or native/Wand Preset slot. */
export interface DesignGridIdentity {
 readonly key:string;readonly layoutId:string;readonly gridDataPath:string;
 readonly gridIdNative:number;readonly sizeX:number;readonly sizeY:number;readonly factor:1|2;
}
export const DESIGN_FILE_LIMIT=1_000_000;
const identityKeys=['key','layoutId','gridDataPath','gridIdNative','sizeX','sizeY','factor'] as const;
function gridIdentity(grid:DesignGridIdentity):DesignGridIdentity {
 return {key:grid.key,layoutId:grid.layoutId,gridDataPath:grid.gridDataPath,gridIdNative:grid.gridIdNative,sizeX:grid.sizeX,sizeY:grid.sizeY,factor:grid.factor};
}
export function serializeDesign(t:DesignTimeline,grid:DesignGridIdentity):string{
 return JSON.stringify({schema:'wand.world-design@1',grid:gridIdentity(grid),placements:currentDesign(t).map(({id,itemId,x,y,orientation})=>({id,itemId,x,y,orientation}))});
}
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const bounded=(n:unknown,min:number,max:number):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
export function parseDesign(text:string,grid:DesignGridIdentity):DesignPlacement[]{
 if(text.length>DESIGN_FILE_LIMIT)throw Error('DESIGN_FILE_LIMIT');
 const value:unknown=JSON.parse(text);
 if(!record(value)||value.schema!=='wand.world-design@1'||!record(value.grid)||!Array.isArray(value.placements)||value.placements.length>DESIGN_LIMIT)throw Error('DESIGN_FILE_INVALID');
 const source=value.grid;
 if(!identityKeys.every(key=>source[key]===grid[key]))throw Error('DESIGN_GRID_MISMATCH');
 const ids=new Set<number>();
 return value.placements.map(p=>{
  if(!record(p)||!bounded(p.id,1,Number.MAX_SAFE_INTEGER-1)||ids.has(p.id)||!bounded(p.itemId,1,0xffffffff)||
     !bounded(p.x,0,grid.sizeX*grid.factor-1)||!bounded(p.y,0,grid.sizeY*grid.factor-1)||!bounded(p.orientation,0,3))throw Error('DESIGN_PLACEMENT_INVALID');
  ids.add(p.id);return {id:p.id,itemId:p.itemId,x:p.x,y:p.y,orientation:p.orientation};
 });
}
/** Restore as one undoable edit after resolving every footprint from the current DB.
 * Never trust geometry, restrictions or arbitrary paths supplied by a document. */
export function restoreDesign(t:DesignTimeline,placements:readonly DesignPlacement[],definitions:ReadonlyMap<number,DesignItemGeometry>,width:number,height:number):DesignTimeline|null{
 if(placements.length>DESIGN_LIMIT)return null;
 const ids=new Set<number>(),exclusive=new Set<string>();
 let nextId=t.nextId;
 for(const p of placements){
  const geometry=definitions.get(p.itemId);
  if(!geometry||!bounded(p.id,1,Number.MAX_SAFE_INTEGER-1)||ids.has(p.id)||!bounded(p.orientation,0,3)||!designCandidateValid([],p,geometry,width,height))return null;
  ids.add(p.id);nextId=Math.max(nextId,p.id+1);
  const kind=exclusiveAnchorClass(String(p.itemId));
  if(kind){const key=kind+':'+p.x+':'+p.y;if(exclusive.has(key))return null;exclusive.add(key);}
 }
 return commit(t,placements.map(p=>({...p})),nextId);
}
export function designItemCounts(placements:readonly DesignPlacement[]):Map<number,number>{
 const counts=new Map<number,number>();
 for(const p of placements)counts.set(p.itemId,(counts.get(p.itemId)??0)+1);
 return counts;
}

/** Clipboard carries only synthetic design data; no OS clipboard or Save bytes. */
export interface DesignClipItem{readonly itemId:number;readonly dx:number;readonly dy:number;readonly orientation:number}
export function designClipboard(t:DesignTimeline,ids:readonly number[]):DesignClipItem[]{
 const chosen=currentDesign(t).filter(p=>ids.includes(p.id));if(!chosen.length)return [];
 const x=Math.min(...chosen.map(p=>p.x)),y=Math.min(...chosen.map(p=>p.y));
 return chosen.map(p=>({itemId:p.itemId,dx:p.x-x,dy:p.y-y,orientation:p.orientation}));
}
export function pasteDesign(t:DesignTimeline,clip:readonly DesignClipItem[],defs:ReadonlyMap<number,DesignItemGeometry>,x:number,y:number,width:number,height:number):DesignTimeline|null{
 const old=currentDesign(t);if(!clip.length||old.length+clip.length>DESIGN_LIMIT||!Number.isSafeInteger(t.nextId+clip.length))return null;
 const added:DesignPlacement[]=[];
 for(const p of clip){const g=defs.get(p.itemId),candidate={id:t.nextId+added.length,itemId:p.itemId,x:x+p.dx,y:y+p.dy,orientation:p.orientation};
  if(!g||!designCandidateValid([...old,...added],candidate,g,width,height))return null;added.push(candidate);}
 return commit(t,[...old,...added],t.nextId+added.length);
}
export function removeDesignGroup(t:DesignTimeline,ids:readonly number[],defs:ReadonlyMap<number,DesignItemGeometry>):DesignTimeline|null{
 const set=new Set(ids),old=currentDesign(t),chosen=old.filter(p=>set.has(p.id));
 if(!chosen.length||chosen.length!==set.size||chosen.some(p=>!defs.has(p.itemId)||nativeActionBlocked(defs.get(p.itemId)?.editRestrictions,'remove')))return null;
 return commit(t,old.filter(p=>!set.has(p.id)));
}
export function transformDesignGroup(t:DesignTimeline,ids:readonly number[],defs:ReadonlyMap<number,DesignItemGeometry>,dx:number,dy:number,turns:number,width:number,height:number):DesignTimeline|null{
 const set=new Set(ids),old=currentDesign(t),chosen=old.filter(p=>set.has(p.id));
 if(!chosen.length||chosen.length!==set.size||![dx,dy,turns].every(Number.isSafeInteger))return null;
 const turn=((turns%4)+4)%4;
 if(!dx&&!dy&&!turn)return null;
 const left=Math.min(...chosen.map(p=>p.x)),top=Math.min(...chosen.map(p=>p.y));
 const shape=(p:DesignPlacement)=>defs.get(p.itemId)?.shapes[p.itemId+':'+p.orientation*4];
 if(chosen.some(p=>!shape(p)))return null;
 const w=Math.max(...chosen.map(p=>p.x+shape(p)!.width))-left,h=Math.max(...chosen.map(p=>p.y+shape(p)!.height))-top;
 const rest=old.filter(p=>!set.has(p.id)),updated=new Map<number,DesignPlacement>();
 for(const p of chosen){
  const g=defs.get(p.itemId)!,s=shape(p)!;let x=p.x,y=p.y;
  if(turn){
   if(nativeActionBlocked(g.editRestrictions,'rotate')||exclusiveAnchorClass(String(p.itemId)))return null;
   const u=x-left,v=y-top;
   if(turn===1){x=left+h-v-s.height;y=top+u;}else if(turn===2){x=left+w-u-s.width;y=top+h-v-s.height;}else{x=left+v;y=top+w-u-s.width;}
  }
  x+=dx;y+=dy;
  if((x!==p.x||y!==p.y)&&nativeActionBlocked(g.editRestrictions,'move'))return null;
  const next={...p,x,y,orientation:(p.orientation-turn+4)%4},n=shape(next);
  if(!n||n.width!==(turn%2?s.height:s.width)||n.height!==(turn%2?s.width:s.height)||!designCandidateValid([...rest,...updated.values()],next,g,width,height))return null;
  updated.set(p.id,next);
 }
 return commit(t,old.map(p=>updated.get(p.id)??p));
}
