/** In-memory staging for a single opened Save across scoped shape receipts. Each final
 * plan is always expressed against the original record, not a staged copy.
 * The existing Rust mixed transaction remains the write authority.
 */
import type {SavedShapeMap,SavedShapeObject} from './saved-shape-map.ts';
import {draftSavedMapTransform,CARDINAL_ORIENTATIONS,isCardinal,exclusiveAnchorConflict,exclusiveAnchorClass,worldMoveEligible} from './saved-map-transform.ts';
export type WorldEditPlan=NonNullable<ReturnType<typeof draftSavedMapTransform>>;
export interface WorldStagedEdit {readonly plan:WorldEditPlan;readonly name:string;readonly warning:string;readonly gridOrdinal:number}
export interface WorldEditSnapshot {readonly edits:readonly WorldStagedEdit[];readonly title:string;readonly warning:string}
export interface WorldEditTimeline {readonly snapshots:readonly WorldEditSnapshot[];readonly cursor:number}
import {MAX_GRID_MIXED_EDITS} from '../save/grid-edit-limits.ts';
export const WORLD_BATCH_LIMIT=MAX_GRID_MIXED_EDITS;
export const WORLD_HISTORY_LIMIT=512;
export const emptyWorldTimeline=():WorldEditTimeline=>({snapshots:[{edits:[],title:'',warning:''}],cursor:0});
export function currentWorldEdits(t:WorldEditTimeline):readonly WorldStagedEdit[]{return t.snapshots[t.cursor].edits;}
export function travelWorldTimeline(t:WorldEditTimeline,delta:-1|1):WorldEditTimeline{
  const cursor=t.cursor+delta;
  return cursor>=0&&cursor<t.snapshots.length?{...t,cursor}:t;
}
function matchesOriginal(o:SavedShapeObject,e:WorldStagedEdit):boolean{
  const p=e.plan;
  return o.localOrdinal===p.localOrdinal&&o.localGridOrdinal===e.gridOrdinal&&o.itemId===p.itemId&&o.x===p.expectedX&&o.y===p.expectedY&&
    (p.expectedOrientation===null||o.orientation===p.expectedOrientation);
}
export function projectWorldEdits(map:SavedShapeMap,edits:readonly WorldStagedEdit[]):SavedShapeMap{
  if(!edits.length)return map;
  const byOrdinal=new Map(edits.map(e=>[e.plan.localOrdinal,e]));
  return {...map,objects:map.objects.map(o=>{
    const edit=byOrdinal.get(o.localOrdinal);
    if(!edit||!matchesOriginal(o,edit))return o;
    const p=edit.plan;
    const orientation=p.replacementOrientation??o.orientation;
    const orientationCode=isCardinal(orientation)?CARDINAL_ORIENTATIONS.indexOf(orientation)*4:null;
    const key=orientationCode===null?null:o.itemId+':'+orientationCode;
    return {...o,x:p.replacementX??o.x,y:p.replacementY??o.y,orientation,orientationCode,
      shapeKey:key&&map.shapes[key]?key:null};
  })};
}
export function stageWorldEdit(map:SavedShapeMap,t:WorldEditTimeline,ordinal:number,
    x:number|undefined,y:number|undefined,orientation:string|null,warning:string):WorldEditTimeline|null{
  const previous=currentWorldEdits(t);
  const original=map.objects.find(o=>o.localOrdinal===ordinal);
  const effectiveMap=projectWorldEdits(map,previous);
  const effective=effectiveMap.objects.find(o=>o.localOrdinal===ordinal);
  const prior=previous.find(e=>e.plan.localOrdinal===ordinal);
  if(!original||!effective||(prior&&!matchesOriginal(original,prior))||!draftSavedMapTransform(effective,x,y,orientation)||
    exclusiveAnchorConflict(effectiveMap,effective,x,y))return null;
  const plan=draftSavedMapTransform(original,x,y,orientation);
  if(!plan&&(x!==original.x||y!==original.y||orientation!==original.orientation))return null;
  const name=original.name??'Item '+original.itemId;
  const edits=previous.filter(e=>e.plan.localOrdinal!==ordinal);
  if(plan)edits.push({plan,name,warning,gridOrdinal:original.localGridOrdinal});
  if(edits.length>WORLD_BATCH_LIMIT)return null;
  const snapshots=[...t.snapshots.slice(0,t.cursor+1),{edits,title:name,warning}].slice(-(WORLD_HISTORY_LIMIT+1));
  return {snapshots,cursor:snapshots.length-1};
}

/** A group moves as one atomic timeline step, against final positions, not
 * sequential intermediate anchors. Every plan remains relative to the original.
 * Only same-Grid translation is supported; no implicit support/child movement. */
export function stageWorldGroupMove(map:SavedShapeMap,t:WorldEditTimeline,ordinals:readonly number[],
    dx:number,dy:number,warning:string):WorldEditTimeline|null{
  if(!Number.isSafeInteger(dx)||!Number.isSafeInteger(dy)||(!dx&&!dy)||
    ordinals.length<2||ordinals.length>WORLD_BATCH_LIMIT)return null;
  const ids=new Set(ordinals);if(ids.size!==ordinals.length)return null;
  const previous=currentWorldEdits(t),effectiveMap=projectWorldEdits(map,previous);
  const originalById=new Map(map.objects.map(o=>[o.localOrdinal,o]));
  const effectiveById=new Map(effectiveMap.objects.map(o=>[o.localOrdinal,o]));
  const priorById=new Map(previous.map(e=>[e.plan.localOrdinal,e]));
  const edits=previous.filter(e=>!ids.has(e.plan.localOrdinal));
  const destinations=new Set<string>();let grid:number|undefined;
  for(const id of ids){
    const o=originalById.get(id),e=effectiveById.get(id),prior=priorById.get(id);
    if(!o||!e||!worldMoveEligible(e)||(prior&&!matchesOriginal(o,prior)))return null;
    if(grid===undefined)grid=e.localGridOrdinal;
    if(grid!==e.localGridOrdinal)return null;
    const x=e.x+dx,y=e.y+dy;
    if(!draftSavedMapTransform(e,x,y,e.orientation))return null;
    const plan=draftSavedMapTransform(o,x,y,e.orientation);
    if(!plan&&(x!==o.x||y!==o.y||e.orientation!==o.orientation))return null;
    const cls=exclusiveAnchorClass(e.itemId);
    if(cls){const k=cls+':'+x+':'+y;if(destinations.has(k))return null;destinations.add(k);}
    if(plan)edits.push({plan,name:o.name??'Item '+o.itemId,warning,gridOrdinal:o.localGridOrdinal});
  }
  for(const o of effectiveMap.objects){
    if(o.localGridOrdinal!==grid||ids.has(o.localOrdinal))continue;
    const cls=exclusiveAnchorClass(o.itemId);
    if(cls&&destinations.has(cls+':'+o.x+':'+o.y))return null;
  }
  if(edits.length>WORLD_BATCH_LIMIT)return null;
  const snapshots=[...t.snapshots.slice(0,t.cursor+1),{edits,title:ordinals.length+'件の一括移動',warning}].slice(-(WORLD_HISTORY_LIMIT+1));
  return {snapshots,cursor:snapshots.length-1};
}
