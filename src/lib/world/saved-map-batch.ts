/** In-memory staging for a single opened Save across scoped shape receipts. Each final
 * plan is always expressed against the original record, not a staged copy.
 * The existing Rust mixed transaction remains the write authority.
 */
import type {SavedShapeMap,SavedShapeObject} from './saved-shape-map.ts';
import {alignmentTargets,type MapAlignment} from './map-alignment.ts';
import {draftSavedMapTransform,CARDINAL_ORIENTATIONS,isCardinal,exclusiveAnchorConflict,exclusiveAnchorClass,worldMoveEligible,worldRotateEligible} from './saved-map-transform.ts';
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

export interface GroupTarget{readonly ordinal:number;readonly x:number;readonly y:number;readonly orientation:string|null;readonly shapeKey:string|null}
/** Rotate mapped footprint bounding boxes about the group's top-left corner,
 * in the displayed local coordinate system (positive Y downward).
 * Reuse cardinal source shapes; no road/fence or parent rotation inferred. */
export function groupTargets(map:SavedShapeMap,objects:readonly SavedShapeObject[],dx:number,dy:number,turns=0):GroupTarget[]|null{
 if(objects.length<2||objects.length>WORLD_BATCH_LIMIT||![dx,dy,turns].every(Number.isSafeInteger))return null;
 const turn=((turns%4)+4)%4;
 if(!objects.every(o=>worldMoveEligible(o)&&o.localGridOrdinal===objects[0].localGridOrdinal))return null;
 if(turn&&!objects.every(o=>worldRotateEligible(o)&&o.shapeKey&&map.shapes[o.shapeKey]))return null;
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(const o of objects){const s=o.shapeKey?map.shapes[o.shapeKey]:null;left=Math.min(left,o.x);top=Math.min(top,o.y);right=Math.max(right,o.x+(s?.width??1));bottom=Math.max(bottom,o.y+(s?.height??1));}
 const result:GroupTarget[]=[];
 for(const o of objects){
  let x=o.x,y=o.y,orientation=o.orientation,shapeKey=o.shapeKey;
  if(turn){
   const s=map.shapes[o.shapeKey!],u=o.x-left,v=o.y-top,w=right-left,h=bottom-top;
   if(turn===1){x=left+h-v-s.height;y=top+u;}
   else if(turn===2){x=left+w-u-s.width;y=top+h-v-s.height;}
   else{x=left+v;y=top+w-u-s.width;}
   const index=(CARDINAL_ORIENTATIONS.indexOf(o.orientation as typeof CARDINAL_ORIENTATIONS[number])-turn+4)%4;
   orientation=CARDINAL_ORIENTATIONS[index];shapeKey=o.itemId+':'+index*4;
   const next=map.shapes[shapeKey];
   if(!next||next.width!==(turn%2?s.height:s.width)||next.height!==(turn%2?s.width:s.height))return null;
  }
  x+=dx;y+=dy;
  if(![x,y].every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647))return null;
  result.push({ordinal:o.localOrdinal,x,y,orientation,shapeKey});
 }
 return result;
}
/** Atomic same-grid transform; every plan stays relative to the original. */
export function stageWorldGroupMove(map:SavedShapeMap,t:WorldEditTimeline,ordinals:readonly number[],
    dx:number,dy:number,warning:string,turns=0):WorldEditTimeline|null{
  if(!Number.isSafeInteger(turns)||(!dx&&!dy&&turns%4===0)||
    ordinals.length<2||ordinals.length>WORLD_BATCH_LIMIT)return null;
  const effective=projectWorldEdits(map,currentWorldEdits(t));
  const selected=ordinals.map(id=>effective.objects.find(o=>o.localOrdinal===id));
  if(selected.some(o=>!o))return null;
  const targets=groupTargets(effective,selected as SavedShapeObject[],dx,dy,turns);
  return targets?stageWorldTargets(map,t,targets,warning):null;
}
export function stageWorldAlignment(map:SavedShapeMap,t:WorldEditTimeline,ordinals:readonly number[],mode:MapAlignment,warning:string):WorldEditTimeline|null{
 if(ordinals.length<2||ordinals.length>WORLD_BATCH_LIMIT)return null;
 const effective=projectWorldEdits(map,currentWorldEdits(t)),ids=new Set(ordinals);
 const selected=effective.objects.filter(o=>ids.has(o.localOrdinal));
 if(ids.size!==ordinals.length||selected.length!==ids.size)return null;
 const targets=alignmentTargets(effective,selected,mode);
 return targets?stageWorldTargets(map,t,targets,warning):null;
}
export function stageWorldTargets(map:SavedShapeMap,t:WorldEditTimeline,targets:readonly GroupTarget[],warning:string):WorldEditTimeline|null{
  if(targets.length<2||targets.length>WORLD_BATCH_LIMIT)return null;
  const ids=new Set(targets.map(o=>o.ordinal));if(ids.size!==targets.length)return null;
  const previous=currentWorldEdits(t),effectiveMap=projectWorldEdits(map,previous);
  const originalById=new Map(map.objects.map(o=>[o.localOrdinal,o]));
  const effectiveById=new Map(effectiveMap.objects.map(o=>[o.localOrdinal,o]));
  const priorById=new Map(previous.map(e=>[e.plan.localOrdinal,e]));
  const edits=previous.filter(e=>!ids.has(e.plan.localOrdinal));
  const grid=effectiveById.get(targets[0].ordinal)?.localGridOrdinal;
  if(grid===undefined)return null;
  const destinations=new Set<string>();let changed=false;
  for(const target of targets){
    const id=target.ordinal,o=originalById.get(id),e=effectiveById.get(id),prior=priorById.get(id);
    if(!o||!e||!worldMoveEligible(e)||e.localGridOrdinal!==grid||(prior&&!matchesOriginal(o,prior)))return null;
    const {x,y,orientation}=target,modified=x!==e.x||y!==e.y||orientation!==e.orientation;
    if(modified&&!draftSavedMapTransform(e,x,y,orientation))return null;
    changed||=modified;
    const plan=draftSavedMapTransform(o,x,y,orientation);
    if(!plan&&(x!==o.x||y!==o.y||orientation!==o.orientation))return null;
    const cls=exclusiveAnchorClass(e.itemId);
    if(cls){const k=cls+':'+x+':'+y;if(destinations.has(k))return null;destinations.add(k);}
    if(plan)edits.push({plan,name:o.name??'Item '+o.itemId,warning,gridOrdinal:o.localGridOrdinal});
  }
  if(!changed)return null;
  for(const o of effectiveMap.objects){
    if(o.localGridOrdinal!==grid||ids.has(o.localOrdinal))continue;
    const cls=exclusiveAnchorClass(o.itemId);
    if(cls&&destinations.has(cls+':'+o.x+':'+o.y))return null;
  }
  if(edits.length>WORLD_BATCH_LIMIT)return null;
  const snapshots=[...t.snapshots.slice(0,t.cursor+1),{edits,title:targets.length+'件の一括変形',warning}].slice(-(WORLD_HISTORY_LIMIT+1));
  return {snapshots,cursor:snapshots.length-1};
}
