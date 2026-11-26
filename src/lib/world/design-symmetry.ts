/** Exact local integer-cell symmetry. An image or bounding box is not
 * evidence that a chiral object has a representable mirrored orientation. */
import type {DesignSupportAttachment} from './design-support-attachment.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {exclusiveAnchorClass} from './saved-map-transform.ts';
import {currentDesign,canPasteDesign,pasteDesign,translateDesignTargets,transformDesignGroup,type DesignClipItem,type DesignTimeline,type DesignItemGeometry} from './design-layout.ts';
import type {SourceObjectShape} from './source-object-map.ts';
export type SymmetryMode='vertical'|'horizontal'|'point';
/** Axis/center coordinate is represented in half cells: x2=2*x. */
export interface DesignSymmetry{readonly mode:SymmetryMode;readonly x2:number;readonly y2:number}
export interface SymmetryItem{readonly itemId:number;readonly x:number;readonly y:number;readonly orientation:number;readonly attachment?:DesignSupportAttachment}
function runSignature(shape:SourceObjectShape,flipX:boolean,flipY:boolean){
 return shape.runs.map(r=>[flipY?shape.height-1-r.y:r.y,flipX?shape.width-r.x-r.width:r.x,r.width]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(r=>r.join(':')).join(';');
}
export function reflectedDesignItem(p:SymmetryItem,g:DesignItemGeometry,s:DesignSymmetry):SymmetryItem|null{
 if(p.attachment||!['vertical','horizontal','point'].includes(s.mode)||![s.x2,s.y2,p.x,p.y,p.orientation].every(Number.isSafeInteger)||p.orientation<0||p.orientation>3||p.itemId!==g.itemId||
  exclusiveAnchorClass(String(p.itemId))||!['furniture','landscape'].includes(g.layer)||nativeActionBlocked(g.editRestrictions,'select'))return null;
 const a=g.shapes[p.itemId+':'+p.orientation*4];if(!a?.runs.length)return null;
 const fx=s.mode!=='horizontal',fy=s.mode!=='vertical';
 const orientation=s.mode==='point'?(p.orientation+2)%4:s.mode==='vertical'?(4-p.orientation)%4:(6-p.orientation)%4;
 if(orientation!==p.orientation&&nativeActionBlocked(g.editRestrictions,'rotate'))return null;
 const b=g.shapes[p.itemId+':'+orientation*4];
 if(!b||a.width!==b.width||a.height!==b.height||a.cellCount!==b.cellCount||runSignature(a,fx,fy)!==runSignature(b,false,false))return null;
 const x=fx?s.x2-p.x-a.width:p.x,y=fy?s.y2-p.y-a.height:p.y;
 return [x,y].every(Number.isSafeInteger)?{itemId:p.itemId,x,y,orientation}:null;
}
const key=(p:SymmetryItem)=>p.itemId+':'+p.x+':'+p.y+':'+p.orientation;
const anchor=(p:SymmetryItem)=>p.itemId+':'+p.x+':'+p.y;
/** Return original and mirrored placements without duplicate center objects.
 * Existing exact matches may serve as the counterpart, but an ambiguous
 * same-item anchor with a different direction is rejected. */
export function symmetricDesignItems(original:readonly SymmetryItem[],defs:ReadonlyMap<number,DesignItemGeometry>,symmetry:DesignSymmetry,includeOriginal:boolean,existing:readonly SymmetryItem[]=[]):SymmetryItem[]|null{
 if(!original.length)return null;
 const all=new Set(existing.map(key)),anchors=new Map(existing.map(p=>[anchor(p),key(p)])),result:SymmetryItem[]=[];
 function append(p:SymmetryItem){const k=key(p),a=anchor(p);if(all.has(k))return true;if(anchors.has(a))return false;all.add(k);anchors.set(a,k);result.push(p);return true;}
 if(includeOriginal)for(const p of original)if(!append(p))return null;
 for(const p of original){
  const g=defs.get(p.itemId);if(!g)return null;
  const reflected=reflectedDesignItem(p,g,symmetry);if(!reflected||!append(reflected))return null;
 }
 return result;
}
export const asDesignClip=(items:readonly SymmetryItem[]):DesignClipItem[]=>items.map(p=>({itemId:p.itemId,dx:p.x,dy:p.y,orientation:p.orientation,...(p.attachment?{attachment:p.attachment}:{})}));
export function symmetryPlan(t:DesignTimeline,items:readonly SymmetryItem[],defs:ReadonlyMap<number,DesignItemGeometry>,s:DesignSymmetry,includeOriginal:boolean,width:number,height:number){
 const candidates=symmetricDesignItems(items,defs,s,includeOriginal,currentDesign(t));
 return candidates&&candidates.length&&canPasteDesign(t,asDesignClip(candidates),defs,0,0,width,height)?candidates:null;
}
export function commitSymmetry(t:DesignTimeline,candidates:readonly SymmetryItem[],defs:ReadonlyMap<number,DesignItemGeometry>,width:number,height:number){
 return pasteDesign(t,asDesignClip(candidates),defs,0,0,width,height);
}

/** Link existing exact reflected placements only for this operation.
 * No persistent pair IDs, implicit duplicates, or guessing among overlaps. */
export function symmetricMoveTargets(t:DesignTimeline,ids:readonly number[],defs:ReadonlyMap<number,DesignItemGeometry>,s:DesignSymmetry,dx:number,dy:number,eligible:ReadonlySet<number>):{id:number;x:number;y:number}[]|null{
 if(!ids.length||![dx,dy].every(Number.isSafeInteger)||!dx&&!dy)return null;
 const old=currentDesign(t),byId=new Map(old.map(p=>[p.id,p])),byPose=new Map<string,number[]>();
 for(const p of old){const k=key(p),group=byPose.get(k)??[];group.push(p.id);byPose.set(k,group);}
 const targets=new Map<number,{id:number;x:number;y:number}>();
 function put(id:number,x:number,y:number){
  if(!eligible.has(id)||![x,y].every(Number.isSafeInteger))return false;
  const prev=targets.get(id);if(prev)return prev.x===x&&prev.y===y;
  targets.set(id,{id,x,y});return true;
 }
 for(const id of new Set(ids)){
  const p=byId.get(id),g=p?defs.get(p.itemId):null;if(!p||!g||!eligible.has(id)||nativeActionBlocked(g.editRestrictions,'move'))return null;
  if(byPose.get(key(p))?.length!==1)return null;
  const mirror=reflectedDesignItem(p,g,s),next=reflectedDesignItem({...p,x:p.x+dx,y:p.y+dy},g,s);
  if(!mirror||!next)return null;
  const matches=byPose.get(key(mirror));if(matches?.length!==1)return null;
  if(!put(id,p.x+dx,p.y+dy)||!put(matches[0],next.x,next.y))return null;
 }
 return [...targets.values()];
}
export function symmetricMoveDesign(t:DesignTimeline,ids:readonly number[],defs:ReadonlyMap<number,DesignItemGeometry>,s:DesignSymmetry,dx:number,dy:number,eligible:ReadonlySet<number>,width:number,height:number){
 const targets=symmetricMoveTargets(t,ids,defs,s,dx,dy,eligible);
 return targets?translateDesignTargets(t,targets,defs,width,height):null;
}

/** Rotate the chosen group and its uniquely identified reflected counterpart.
 * Compute the selected group using the existing native-footprint rotation,
 * then reflect the resulting poses. A selected object and its counterpart
 * may never request conflicting poses. One transaction preserves all IDs. */
export function symmetricRotateDesign(t:DesignTimeline,ids:readonly number[],defs:ReadonlyMap<number,DesignItemGeometry>,s:DesignSymmetry,turns:number,eligible:ReadonlySet<number>,width:number,height:number):DesignTimeline|null{
 if(!ids.length||!Number.isSafeInteger(turns)||turns%4===0||new Set(ids).size!==ids.length)return null;
 const original=currentDesign(t),byId=new Map(original.map(p=>[p.id,p])),byPose=new Map<string,number[]>();
 for(const p of original){const k=key(p),matches=byPose.get(k)??[];matches.push(p.id);byPose.set(k,matches);}
 const rotated=transformDesignGroup(t,ids,defs,0,0,turns,width,height);
 if(!rotated)return null;
 const changed=new Map(currentDesign(rotated).map(p=>[p.id,p]));
 const targets=new Map<number,{id:number;x:number;y:number;orientation:number}>();
 function put(id:number,p:SymmetryItem){
  if(!eligible.has(id))return false;
  const prev=targets.get(id);
  if(prev)return prev.x===p.x&&prev.y===p.y&&prev.orientation===p.orientation;
  targets.set(id,{id,x:p.x,y:p.y,orientation:p.orientation});return true;
 }
 for(const id of ids){
  const p=byId.get(id),next=changed.get(id),g=p?defs.get(p.itemId):null;
  if(!p||!next||!g||!eligible.has(id)||byPose.get(key(p))?.length!==1)return null;
  const before=reflectedDesignItem(p,g,s),after=reflectedDesignItem(next,g,s);
  if(!before||!after)return null;
  const matches=byPose.get(key(before));
  if(matches?.length!==1||!put(id,next)||!put(matches[0],after))return null;
 }
 return translateDesignTargets(t,[...targets.values()],defs,width,height);
}
