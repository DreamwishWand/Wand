/** Link existing, uniquely reflected native objects for one staged transaction.
 * No new IDs, stock consumption, inferred dependencies or cross-grid transfers. */
import {reflectedDesignItem,type SymmetryItem,type SymmetryMode} from './design-symmetry.ts';
import {CARDINAL_ORIENTATIONS} from './saved-map-transform.ts';
import {mainlandSavedCell,mainlandSavedMoveEligible,mainlandSavedDraftAtCell,type MainlandGroupDraft,type MainlandSavedObject} from './mainland-saved-objects.ts';
import {groupTargets,WORLD_BATCH_LIMIT,WORLD_HISTORY_LIMIT,type WorldEditTimeline} from './saved-map-batch.ts';
import type {SavedShapeMap,SavedShapeObject} from './saved-shape-map.ts';
import type {SourceObjectShape} from './source-object-map.ts';
import type {MainlandGrid} from './mainland-world-coordinates.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import type {DesignItemGeometry} from './design-layout.ts';
export interface SavedSymmetryAxis{mode:SymmetryMode;x:number;y:number}
export type SavedSymmetryAction={dx:number;dz:number}|{turn:number};
const invalid:MainlandGroupDraft={ghosts:[],next:null};
function pose(p:MainlandSavedObject):SymmetryItem|null{
 const c=mainlandSavedCell(p),i=CARDINAL_ORIENTATIONS.findIndex(o=>o===p.object.orientation);
 return c&&i>=0?{itemId:Number(p.object.itemId),x:c.x,y:c.z,orientation:i}:null;
}
function geometry(p:MainlandSavedObject,maps:ReadonlyMap<string,SavedShapeMap>):DesignItemGeometry|null{
 const m=maps.get(p.area);return m&&p.shape?{itemId:Number(p.object.itemId),name:p.object.name,layer:p.object.layer,surfaceCapable:p.object.surfaceCapable,editRestrictions:p.object.editRestrictions,shapes:m.shapes}:null;
}
const key=(p:SymmetryItem,factor:number)=>[p.itemId,p.x/factor,p.y/factor,p.orientation].join(':');
function sameShape(a:SourceObjectShape|undefined,b:SourceObjectShape|undefined){return !!a&&!!b&&a.width===b.width&&a.height===b.height&&a.cellCount===b.cellCount&&a.path===b.path;}
/** Group rotation uses the same anchor and cardinal convention as ordinary
 * saved group rotation. Single rotation keeps its anchor. */
function selectedPoses(items:readonly MainlandSavedObject[],maps:ReadonlyMap<string,SavedShapeMap>,action:SavedSymmetryAction):Map<number,SymmetryItem>|null{
 const out=new Map<number,SymmetryItem>();
 if('dx' in action){
  if(![action.dx*2,action.dz*2].every(Number.isSafeInteger)||(!action.dx&&!action.dz))return null;
  for(const p of items){const a=pose(p);if(!a||![action.dx*p.factor,action.dz*p.factor].every(Number.isSafeInteger))return null;out.set(p.object.localOrdinal,{...a,x:a.x+action.dx*p.factor,y:a.y+action.dz*p.factor});}
  return out;
 }
 if(!Number.isSafeInteger(action.turn)||action.turn%4===0)return null;
 if(items.length===1){const p=items[0],a=pose(p);if(!a)return null;out.set(p.object.localOrdinal,{...a,orientation:((a.orientation-action.turn)%4+4)%4});return out;}
 if(items.some(p=>p.factor!==items[0].factor))return null;
 const shapes:Record<string,SourceObjectShape>={},objects:SavedShapeObject[]=[];
 for(const p of items){
  const a=pose(p),g=geometry(p,maps);if(!a||!g||!p.object.shapeKey)return null;
  for(const i of [0,4,8,12]){const k=p.object.itemId+':'+i,s=g.shapes[k];if(!s)continue;if(shapes[k]&&!sameShape(shapes[k],s))return null;shapes[k]=s;}
  objects.push({...p.object,x:a.x,y:a.y,localGridOrdinal:1});
 }
 const first=maps.get(items[0].area);if(!first)return null;
 const rows=groupTargets({...first,objects,shapes},objects,0,0,action.turn);if(!rows)return null;
 for(const r of rows){const p=objects.find(o=>o.localOrdinal===r.ordinal),orientation=CARDINAL_ORIENTATIONS.findIndex(o=>o===r.orientation);if(!p||orientation<0)return null;out.set(r.ordinal,{itemId:Number(p.itemId),x:r.x,y:r.y,orientation});}
 return out;
}
export function savedSymmetryDraft(items:readonly MainlandSavedObject[],all:readonly MainlandSavedObject[],eligible:ReadonlySet<number>,axis:SavedSymmetryAxis,action:SavedSymmetryAction,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,maps:ReadonlyMap<string,SavedShapeMap>,timeline:WorldEditTimeline):MainlandGroupDraft{
 if(!items.length||items.length>WORLD_BATCH_LIMIT||new Set(items.map(p=>p.object.localOrdinal)).size!==items.length||!['vertical','horizontal','point'].includes(axis.mode)||![axis.x*4,axis.y*4].every(Number.isSafeInteger))return invalid;
 const byPose=new Map<string,MainlandSavedObject[]>();
 for(const p of all){const a=pose(p);if(!a)continue;const k=key(a,p.factor),rows=byPose.get(k)??[];rows.push(p);byPose.set(k,rows);}
 const next=selectedPoses(items,maps,action);if(!next)return invalid;
 const targets=new Map<number,{p:MainlandSavedObject;target:SymmetryItem}>();
 function put(p:MainlandSavedObject,target:SymmetryItem){
  const id=p.object.localOrdinal;if(!eligible.has(id)||!mainlandSavedMoveEligible(p)||!p.shape)return false;
  const old=targets.get(id);if(old)return key(old.target,p.factor)===key(target,p.factor);
  targets.set(id,{p,target});return true;
 }
 for(const p of items){
  const before=pose(p),after=next.get(p.object.localOrdinal),g=geometry(p,maps);
  if(!before||!after||!g||!mainlandSavedMoveEligible(p)||byPose.get(key(before,p.factor))?.length!==1||byPose.get(key(before,p.factor))?.[0].object.localOrdinal!==p.object.localOrdinal)return invalid;
  const s={mode:axis.mode,x2:axis.x*2*p.factor,y2:-axis.y*2*p.factor};
  const original=reflectedDesignItem(before,g,s),reflected=reflectedDesignItem(after,g,s);if(!original||!reflected)return invalid;
  const pair=byPose.get(key(original,p.factor));if(pair?.length!==1||pair[0].factor!==p.factor)return invalid;
  const other=pair[0],og=geometry(other,maps);
  if(!og||!sameShape(g.shapes[before.itemId+':'+original.orientation*4],other.shape??undefined)||!sameShape(g.shapes[before.itemId+':'+reflected.orientation*4],og.shapes[before.itemId+':'+reflected.orientation*4]))return invalid;
  if(!put(p,after)||!put(other,reflected))return invalid;
 }
 if(targets.size>WORLD_BATCH_LIMIT)return invalid;
 let working=timeline,valid=true;
 const ghosts:MainlandGroupDraft['ghosts'][number][]=[];
 for(const {p,target} of targets.values()){
  const old=pose(p)!;if(key(old,p.factor)===key(target,p.factor))continue;
  const q=mainlandSavedDraftAtCell(p,grids,rasters,maps,working,target.x,target.y,CARDINAL_ORIENTATIONS[target.orientation]);
  ghosts.push({object:p,draft:q,x:target.x/p.factor,y:-target.y/p.factor});
  if(!q?.next)valid=false;else working=q.next;
 }
 if(!valid||working===timeline)return {ghosts,next:null};
 const snapshots=[...timeline.snapshots.slice(0,timeline.cursor+1),working.snapshots[working.cursor]].slice(-(WORLD_HISTORY_LIMIT+1));
 return {ghosts,next:{snapshots,cursor:snapshots.length-1}};
}
