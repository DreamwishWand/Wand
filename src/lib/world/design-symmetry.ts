/** Exact local integer-cell symmetry. An image or bounding box is not
 * evidence that a chiral object has a representable mirrored orientation. */
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {exclusiveAnchorClass} from './saved-map-transform.ts';
import {currentDesign,canPasteDesign,pasteDesign,type DesignClipItem,type DesignTimeline,type DesignItemGeometry} from './design-layout.ts';
import type {SourceObjectShape} from './source-object-map.ts';
export type SymmetryMode='vertical'|'horizontal'|'point';
/** Axis/center coordinate is represented in half cells: x2=2*x. */
export interface DesignSymmetry{readonly mode:SymmetryMode;readonly x2:number;readonly y2:number}
export interface SymmetryItem{readonly itemId:number;readonly x:number;readonly y:number;readonly orientation:number}
function runSignature(shape:SourceObjectShape,flipX:boolean,flipY:boolean){
 return shape.runs.map(r=>[flipY?shape.height-1-r.y:r.y,flipX?shape.width-r.x-r.width:r.x,r.width]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(r=>r.join(':')).join(';');
}
export function reflectedDesignItem(p:SymmetryItem,g:DesignItemGeometry,s:DesignSymmetry):SymmetryItem|null{
 if(!['vertical','horizontal','point'].includes(s.mode)||![s.x2,s.y2,p.x,p.y,p.orientation].every(Number.isSafeInteger)||p.orientation<0||p.orientation>3||p.itemId!==g.itemId||
  exclusiveAnchorClass(String(p.itemId))||!['furniture','landscape'].includes(g.layer)||g.surfaceCapable&&g.layer==='surface'||nativeActionBlocked(g.editRestrictions,'select'))return null;
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
export const asDesignClip=(items:readonly SymmetryItem[]):DesignClipItem[]=>items.map(p=>({itemId:p.itemId,dx:p.x,dy:p.y,orientation:p.orientation}));
export function symmetryPlan(t:DesignTimeline,items:readonly SymmetryItem[],defs:ReadonlyMap<number,DesignItemGeometry>,s:DesignSymmetry,includeOriginal:boolean,width:number,height:number){
 const candidates=symmetricDesignItems(items,defs,s,includeOriginal,currentDesign(t));
 return candidates&&candidates.length&&canPasteDesign(t,asDesignClip(candidates),defs,0,0,width,height)?candidates:null;
}
export function commitSymmetry(t:DesignTimeline,candidates:readonly SymmetryItem[],defs:ReadonlyMap<number,DesignItemGeometry>,width:number,height:number){
 return pasteDesign(t,asDesignClip(candidates),defs,0,0,width,height);
}
