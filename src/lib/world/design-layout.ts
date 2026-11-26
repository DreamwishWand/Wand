/** Independent local design state. IDs are synthetic and never sent to a save writer. */
import {readDesignAttachment,countAttachedDesign,type DesignSupportAttachment} from './design-support-attachment.ts';
import type {SavedShapeMap,SavedShapeObject} from './saved-shape-map.ts';
import {fencePitch,knownFenceBaseId,fenceComponent} from './fence-design.ts';
import {roadPitch,roadComponent,localNetworkScope,type RoadPoint,type NetworkScope} from './road-design.ts';
import {alignmentTargets,type MapAlignment} from './map-alignment.ts';
import type {SourceObjectShape} from './source-object-map.ts';
import {CARDINAL_ORIENTATIONS,exclusiveAnchorClass} from './saved-map-transform.ts';
import {nativeActionBlocked,type NativeEditRestrictions} from './native-edit-restrictions.ts';
import type {MapObjectLayer} from './source-map-layers.ts';
export interface DesignCatalogItem{
 readonly itemId:number;readonly name:string;readonly layer:MapObjectLayer;
}
export interface DesignItemGeometry{
 readonly itemId:number;readonly name:string|null;readonly layer:MapObjectLayer;
 readonly surfaceCapable:boolean;readonly supportPath?:string;readonly editRestrictions?:NativeEditRestrictions;
 readonly shapes:Readonly<Record<string,SourceObjectShape>>;
}
export interface DesignPlacement{
 readonly id:number;readonly itemId:number;readonly x:number;readonly y:number;readonly orientation:number;readonly attachment?:DesignSupportAttachment;
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
 if(candidate.attachment&&(!geometry.supportPath||candidate.attachment.scene.ownerItemId!==candidate.itemId||candidate.attachment.scene.tree.sourcePath!==geometry.supportPath))return false;
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
 return JSON.stringify({schema:'wand.world-design@1',grid:gridIdentity(grid),placements:currentDesign(t).map(({id,itemId,x,y,orientation,attachment})=>({id,itemId,x,y,orientation,...(attachment?{attachment}:{})}))});
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
  const attachment=readDesignAttachment(p,p.itemId,grid.layoutId==='DesignRooms/local-only.json'&&grid.gridDataPath.startsWith('GridData/Rooms/'));
  ids.add(p.id);return {id:p.id,itemId:p.itemId,x:p.x,y:p.y,orientation:p.orientation,...(attachment?{attachment}:{})};
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
 return countAttachedDesign(placements);
}

/** Clipboard carries only synthetic design data; no OS clipboard or Save bytes. */
export interface DesignClipItem{readonly itemId:number;readonly dx:number;readonly dy:number;readonly orientation:number;readonly attachment?:DesignSupportAttachment}
export function designClipboard(t:DesignTimeline,ids:readonly number[]):DesignClipItem[]{
 const chosen=currentDesign(t).filter(p=>ids.includes(p.id));if(!chosen.length)return [];
 const x=Math.min(...chosen.map(p=>p.x)),y=Math.min(...chosen.map(p=>p.y));
 return chosen.map(p=>({itemId:p.itemId,dx:p.x-x,dy:p.y-y,orientation:p.orientation,...(p.attachment?{attachment:p.attachment}:{})}));
}
/** Rotate a temporary clipboard group with the same footprint and restriction
 * checks as committed group rotation. No IDs or history escape this preview. */
export function rotateDesignClipboard(clip:readonly DesignClipItem[],defs:ReadonlyMap<number,DesignItemGeometry>,turns:number):DesignClipItem[]|null{
 if(!clip.length||clip.length>DESIGN_LIMIT||!Number.isSafeInteger(turns)||clip.some(p=>!Number.isSafeInteger(p.dx)||!Number.isSafeInteger(p.dy)||p.dx<0||p.dy<0||!Number.isInteger(p.orientation)||p.orientation<0||p.orientation>3))return null;
 if(turns%4===0)return [...clip];
 const placements=clip.map((p,i)=>({id:i+1,itemId:p.itemId,x:p.dx,y:p.dy,orientation:p.orientation,...(p.attachment?{attachment:p.attachment}:{})}));
 const preview:DesignTimeline={snapshots:[placements],cursor:0,nextId:placements.length+1};
 const rotated=transformDesignGroup(preview,placements.map(p=>p.id),defs,0,0,turns,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER);
 return rotated?designClipboard(rotated,placements.map(p=>p.id)):null;
}
function pasteCandidates(t:DesignTimeline,clip:readonly DesignClipItem[],defs:ReadonlyMap<number,DesignItemGeometry>,x:number,y:number,width:number,height:number):DesignPlacement[]|null{
 const old=currentDesign(t);if(!clip.length||old.length+clip.length>DESIGN_LIMIT||!Number.isSafeInteger(t.nextId+clip.length))return null;
 const occupied=new Set<string>();
 for(const p of old){const kind=exclusiveAnchorClass(String(p.itemId));if(kind)occupied.add(kind+':'+p.x+':'+p.y);}
 const added:DesignPlacement[]=[];
 for(const p of clip){
  const g=defs.get(p.itemId),candidate={id:t.nextId+added.length,itemId:p.itemId,x:x+p.dx,y:y+p.dy,orientation:p.orientation,...(p.attachment?{attachment:p.attachment}:{})};
  if(!g||!designCandidateValid([],candidate,g,width,height))return null;
  const kind=exclusiveAnchorClass(String(candidate.itemId));if(kind){const key=kind+':'+candidate.x+':'+candidate.y;if(occupied.has(key))return null;occupied.add(key);}
  added.push(candidate);
 }
 return added;
}
export function canPasteDesign(t:DesignTimeline,clip:readonly DesignClipItem[],defs:ReadonlyMap<number,DesignItemGeometry>,x:number,y:number,width:number,height:number):boolean{
 return pasteCandidates(t,clip,defs,x,y,width,height)!==null;
}
export function pasteDesign(t:DesignTimeline,clip:readonly DesignClipItem[],defs:ReadonlyMap<number,DesignItemGeometry>,x:number,y:number,width:number,height:number):DesignTimeline|null{
 const added=pasteCandidates(t,clip,defs,x,y,width,height);
 return added?commit(t,[...currentDesign(t),...added],t.nextId+added.length):null;
}
export function removeDesignGroup(t:DesignTimeline,ids:readonly number[],defs:ReadonlyMap<number,DesignItemGeometry>):DesignTimeline|null{
 const set=new Set(ids),old=currentDesign(t),chosen=old.filter(p=>set.has(p.id));
 if(!chosen.length||chosen.length!==set.size||chosen.some(p=>!defs.has(p.itemId)||nativeActionBlocked(defs.get(p.itemId)?.editRestrictions,'remove')))return null;
 return commit(t,old.filter(p=>!set.has(p.id)));
}
/** Apply different integer translations to existing objects as one history entry.
 * All selected and counterpart IDs must be eligible; no partial changes. */
export function translateDesignTargets(t:DesignTimeline,targets:readonly {id:number;x:number;y:number;orientation?:number}[],defs:ReadonlyMap<number,DesignItemGeometry>,width:number,height:number):DesignTimeline|null{
 const old=currentDesign(t),byId=new Map(old.map(p=>[p.id,p])),updates=new Map<number,DesignPlacement>();
 if(!targets.length||targets.length>old.length)return null;
 for(const target of targets){
  const p=byId.get(target.id),g=p?defs.get(p.itemId):null;
  if(!p||!g||updates.has(p.id)||!Number.isSafeInteger(target.x)||!Number.isSafeInteger(target.y)||nativeActionBlocked(g.editRestrictions,'select'))return null;
  if((p.x!==target.x||p.y!==target.y)&&nativeActionBlocked(g.editRestrictions,'move'))return null;
  const orientation=target.orientation??p.orientation;
  if(!Number.isSafeInteger(orientation)||orientation<0||orientation>3||orientation!==p.orientation&&(nativeActionBlocked(g.editRestrictions,'rotate')||exclusiveAnchorClass(String(p.itemId))))return null;
  updates.set(p.id,p.x===target.x&&p.y===target.y&&orientation===p.orientation?p:{...p,x:target.x,y:target.y,orientation});
 }
 const anchors=new Set<string>();
 for(const p of old){if(updates.has(p.id))continue;const kind=exclusiveAnchorClass(String(p.itemId));if(kind)anchors.add(kind+':'+p.x+':'+p.y);}
 if([...updates.values()].every(p=>byId.get(p.id)===p))return null;
 for(const p of updates.values()){
  const g=defs.get(p.itemId)!;
  if(!designCandidateValid([],p,g,width,height))return null;
  const kind=exclusiveAnchorClass(String(p.itemId));if(kind){const k=kind+':'+p.x+':'+p.y;if(anchors.has(k))return null;anchors.add(k);}
 }
 return commit(t,old.map(p=>updates.get(p.id)??p));
}
export function transformDesignGroup(t:DesignTimeline,ids:readonly number[],defs:ReadonlyMap<number,DesignItemGeometry>,dx:number,dy:number,turns:number,width:number,height:number):DesignTimeline|null{
 const set=new Set(ids),old=currentDesign(t),chosen=old.filter(p=>set.has(p.id));
 if(!chosen.length||chosen.length!==set.size||![dx,dy,turns].every(Number.isSafeInteger))return null;
 const turn=((turns%4)+4)%4;
 if(!dx&&!dy&&!turn)return null;
 if(!turn)return translateDesignTargets(t,chosen.map(p=>({id:p.id,x:p.x+dx,y:p.y+dy})),defs,width,height);
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

export function alignDesign(t:DesignTimeline,map:SavedShapeMap,ids:readonly number[],defs:ReadonlyMap<number,DesignItemGeometry>,mode:MapAlignment,width:number,height:number):DesignTimeline|null{
 const idSet=new Set(ids),chosen=map.objects.filter(o=>idSet.has(o.localOrdinal));
 if(chosen.length!==idSet.size)return null;
 const targets=alignmentTargets(map,chosen,mode);if(!targets)return null;
 const old=currentDesign(t),byId=new Map(old.map(p=>[p.id,p])),updated=new Map<number,DesignPlacement>(),rest=old.filter(p=>!idSet.has(p.id));
 for(const target of targets){
  const p=byId.get(target.ordinal),g=p?defs.get(p.itemId):null;
  if(!p||!g||nativeActionBlocked(g.editRestrictions,'move'))return null;
  const candidate={...p,x:target.x,y:target.y};
  if(!designCandidateValid([...rest,...updated.values()],candidate,g,width,height))return null;
  updated.set(p.id,candidate);
 }
 return commit(t,old.map(p=>updated.get(p.id)??p));
}

/** Atomic local design edits, never a Save topology serializer. */
export interface RoadDesignPlan {readonly add:readonly DesignPlacement[];readonly remove:readonly number[]}
function planNetworkDesign(t:DesignTimeline,g:DesignItemGeometry,points:readonly RoadPoint[],factor:number,width:number,height:number,erase:boolean,kind:'ground'|'fence'):RoadDesignPlan|null{
 const pitch=kind==='ground'?roadPitch(g,factor):fencePitch(g,factor),old=currentDesign(t);
 if(!pitch||!points.length||points.length>DESIGN_LIMIT||!points.every(p=>Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)&&p.x%pitch===0&&p.y%pitch===0&&p.x>=0&&p.y>=0&&p.x+pitch<=width&&p.y+pitch<=height))return null;
 const ground=new Map<string,DesignPlacement[]>();
 const blocked=new Set<string>();
 for(const p of old)if(exclusiveAnchorClass(String(p.itemId))===kind){
  const k=p.x+':'+p.y,row=ground.get(k);if(row)row.push(p);else ground.set(k,[p]);
  // Reject intersections with off-lattice legacy anchor locations.
  for(let y=Math.floor(p.y/pitch)*pitch;y<p.y+pitch;y+=pitch)for(let x=Math.floor(p.x/pitch)*pitch;x<p.x+pitch;x+=pitch)blocked.add(x+':'+y);
 }
 if(kind==='fence'&&old.some(p=>exclusiveAnchorClass(String(p.itemId))==='fence'&&(!knownFenceBaseId(p.itemId)||p.orientation!==2||p.x%pitch!==0||p.y%pitch!==0)))return null;
 const cells=new Set<string>(),add:DesignPlacement[]=[],remove:number[]=[];
 for(const p of points){
  const k=p.x+':'+p.y;if(cells.has(k))continue;cells.add(k);
  const present=ground.get(k)??[];if(present.length>1)return null;const match=present[0];
  if(erase){if(match?.itemId===g.itemId&&match.orientation===2){if(nativeActionBlocked(g.editRestrictions,'remove'))return null;remove.push(match.id);}continue;}
  if(match){if(match.itemId!==g.itemId||match.orientation!==2)return null;continue;}
  if(blocked.has(k))return null;
  const candidate={id:t.nextId+add.length,itemId:g.itemId,x:p.x,y:p.y,orientation:2};
  if(!Number.isSafeInteger(candidate.id)||!designCandidateValid([],candidate,g,width,height))return null;
  add.push(candidate);
 }
 if(old.length+add.length-remove.length>DESIGN_LIMIT||!Number.isSafeInteger(t.nextId+add.length))return null;
 return {add,remove};
}
export function planRoadDesign(t:DesignTimeline,g:DesignItemGeometry,points:readonly RoadPoint[],factor:number,width:number,height:number,erase=false){return planNetworkDesign(t,g,points,factor,width,height,erase,'ground');}
export function planFenceDesign(t:DesignTimeline,g:DesignItemGeometry,points:readonly RoadPoint[],factor:number,width:number,height:number,erase=false){return planNetworkDesign(t,g,points,factor,width,height,erase,'fence');}
export function commitNetworkDesign(t:DesignTimeline,plan:RoadDesignPlan|null):DesignTimeline|null{
 if(!plan)return null;
 if(!plan.add.length&&!plan.remove.length)return t;
 const removed=new Set(plan.remove);
 return commit(t,[...currentDesign(t).filter(o=>!removed.has(o.id)),...plan.add],t.nextId+plan.add.length);
}

export function commitRoadDesign(t:DesignTimeline,g:DesignItemGeometry,points:readonly RoadPoint[],factor:number,width:number,height:number,erase=false):DesignTimeline|null{return commitNetworkDesign(t,planRoadDesign(t,g,points,factor,width,height,erase));}
export function commitFenceDesign(t:DesignTimeline,g:DesignItemGeometry,points:readonly RoadPoint[],factor:number,width:number,height:number,erase=false):DesignTimeline|null{return commitNetworkDesign(t,planFenceDesign(t,g,points,factor,width,height,erase));}

/** Full component style replacement preserves every cell and connection.
 * Refuse a replacement that would merge with a neighboring target family,
 * or any unknown/off-lattice representation in the affected layer. */
export function replaceDesignNetwork(t:DesignTimeline,seed:number,target:DesignItemGeometry,defs:ReadonlyMap<number,DesignItemGeometry>,factor:number,width:number,height:number,scope:NetworkScope=localNetworkScope):DesignTimeline|null{
 const old=currentDesign(t),root=old.find(p=>p.id===seed),source=root?defs.get(root.itemId):null;
 if(!root||!source||target.itemId===root.itemId||source.layer!==target.layer||nativeActionBlocked(source.editRestrictions,'remove'))return null;
 const kind=source.layer;if(kind!=='ground'&&kind!=='fence')return null;
 const getPitch=kind==='ground'?roadPitch:fencePitch,pitch=getPitch(source,factor);
 if(!pitch||getPitch(target,factor)!==pitch)return null;
 const ids=new Set((kind==='ground'?roadComponent:fenceComponent)(old,defs,factor,seed,scope));
 if(!ids.size)return null;
 const chosen=old.filter(p=>ids.has(p.id)),rest=old.filter(p=>!ids.has(p.id));
 const targetAnchors=new Set(rest.filter(p=>p.itemId===target.itemId&&scope(p)===scope(root)).map(p=>p.x+':'+p.y));
 const occupied=new Set<string>();
 for(const p of old)if(exclusiveAnchorClass(String(p.itemId))===kind){
  if(getPitch(defs.get(p.itemId),factor)!==pitch||p.orientation!==2||p.x%pitch!==0||p.y%pitch!==0)return null;
  const key=p.x+':'+p.y;if(occupied.has(key))return null;occupied.add(key);
 }
 for(const p of chosen){
  if([[0,0],[pitch,0],[-pitch,0],[0,pitch],[0,-pitch]].some(([dx,dy])=>targetAnchors.has((p.x+dx)+':'+(p.y+dy))))return null;
  if(!designCandidateValid([], {...p,itemId:target.itemId},target,width,height))return null;
 }
 return commit(t,old.map(p=>ids.has(p.id)?{...p,itemId:target.itemId}:p));
}

export function replaceDesignAttachment(t:DesignTimeline,id:number,attachment:DesignSupportAttachment|undefined,g:DesignItemGeometry):DesignTimeline|null{
 const old=currentDesign(t),p=old.find(p=>p.id===id);if(!p||p.itemId!==g.itemId||!g.supportPath||nativeActionBlocked(g.editRestrictions,'move'))return null;
 if(attachment&&(attachment.scene.ownerItemId!==p.itemId||attachment.scene.tree.sourcePath!==g.supportPath))return null;
 if(!attachment&&!p.attachment)return null;
 const {attachment:previous,...root}=p;return commit(t,old.map(o=>o.id===id?{...root,...(attachment?{attachment}:{})}:o));
}
