/** In-memory staging for a single opened Save/shape receipt. Each final
 * plan is always expressed against the original record, not a staged copy.
 * The existing Rust mixed transaction remains the write authority.
 */
import type {SavedShapeMap,SavedShapeObject} from './saved-shape-map.ts';
import {draftSavedMapTransform,CARDINAL_ORIENTATIONS,isCardinal,exclusiveAnchorConflict} from './saved-map-transform.ts';
export type WorldEditPlan=NonNullable<ReturnType<typeof draftSavedMapTransform>>;
export interface WorldStagedEdit {readonly plan:WorldEditPlan;readonly name:string;readonly warning:string}
export interface WorldEditSnapshot {readonly edits:readonly WorldStagedEdit[];readonly title:string;readonly warning:string}
export interface WorldEditTimeline {readonly snapshots:readonly WorldEditSnapshot[];readonly cursor:number}
export const WORLD_BATCH_LIMIT=16;
export const emptyWorldTimeline=():WorldEditTimeline=>({snapshots:[{edits:[],title:'',warning:''}],cursor:0});
export function currentWorldEdits(t:WorldEditTimeline):readonly WorldStagedEdit[]{return t.snapshots[t.cursor].edits;}
export function travelWorldTimeline(t:WorldEditTimeline,delta:-1|1):WorldEditTimeline{
  const cursor=t.cursor+delta;
  return cursor>=0&&cursor<t.snapshots.length?{...t,cursor}:t;
}
export function projectWorldEdits(map:SavedShapeMap,edits:readonly WorldStagedEdit[]):SavedShapeMap{
  if(!edits.length)return map;
  const byOrdinal=new Map(edits.map(e=>[e.plan.localOrdinal,e.plan]));
  return {...map,objects:map.objects.map(o=>{
    const p=byOrdinal.get(o.localOrdinal);
    if(!p)return o;
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
  if(!original||!effective||!draftSavedMapTransform(effective,x,y,orientation)||
    exclusiveAnchorConflict(effectiveMap,effective,x,y))return null;
  const plan=draftSavedMapTransform(original,x,y,orientation);
  if(!plan&&(x!==original.x||y!==original.y||orientation!==original.orientation))return null;
  const name=original.name??'Item '+original.itemId;
  const edits=previous.filter(e=>e.plan.localOrdinal!==ordinal);
  if(plan)edits.push({plan,name,warning});
  if(edits.length>WORLD_BATCH_LIMIT)return null;
  const snapshots=[...t.snapshots.slice(0,t.cursor+1),{edits,title:name,warning}].slice(-41);
  return {snapshots,cursor:snapshots.length-1};
}
