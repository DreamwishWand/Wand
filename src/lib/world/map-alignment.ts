/** Shared alignment of actual occupied-cell bounds. Pure logical coordinates;
 * no new Save write route. Road and fence topology is intentionally excluded. */
import type {SavedShapeMap,SavedShapeObject} from './saved-shape-map.ts';
import type {GroupTarget} from './saved-map-batch.ts';
import {worldMoveEligible,exclusiveAnchorClass} from './saved-map-transform.ts';
export const MAP_ALIGNMENT=['left','right','top','bottom','center-x','center-y','distribute-x','distribute-y'] as const;
export type MapAlignment=typeof MAP_ALIGNMENT[number];
type Bounds={object:SavedShapeObject;left:number;right:number;top:number;bottom:number};
function occupiedBounds(map:SavedShapeMap,o:SavedShapeObject):Bounds|null{
 const shape=o.shapeKey?map.shapes[o.shapeKey]:null;
 if(!shape?.runs.length||!worldMoveEligible(o)||exclusiveAnchorClass(o.itemId))return null;
 let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
 for(const run of shape.runs){left=Math.min(left,o.x+run.x);right=Math.max(right,o.x+run.x+run.width);top=Math.min(top,o.y+run.y);bottom=Math.max(bottom,o.y+run.y+1);}
 return [left,right,top,bottom].every(Number.isSafeInteger)&&right>left&&bottom>top?{object:o,left,right,top,bottom}:null;
}
export function alignmentTargets(map:SavedShapeMap,objects:readonly SavedShapeObject[],mode:MapAlignment):GroupTarget[]|null{
 const distribute=mode==='distribute-x'||mode==='distribute-y';
 if(!MAP_ALIGNMENT.includes(mode)||objects.length<(distribute?3:2)||new Set(objects.map(o=>o.localOrdinal)).size!==objects.length||objects.some(o=>o.localGridOrdinal!==objects[0].localGridOrdinal))return null;
 const bounds=objects.map(o=>occupiedBounds(map,o));if(bounds.some(v=>v===null))return null;
 const rows=bounds as Bounds[],horizontal=mode==='left'||mode==='right'||mode==='center-x'||mode==='distribute-x';
 const start=horizontal?'left':'top',end=horizontal?'right':'bottom';
 const low=Math.min(...rows.map(o=>o[start])),high=Math.max(...rows.map(o=>o[end]));
 const offsets=new Map<number,number>();
 if(distribute){
  const sorted=[...rows].sort((a,b)=>a[start]-b[start]||a[end]-b[end]||a.object.localOrdinal-b.object.localOrdinal);
  const sizes=sorted.map(o=>o[end]-o[start]),gap=(high-low-sizes.reduce((n,v)=>n+v,0))/(sorted.length-1);
  if(!Number.isSafeInteger(gap)||gap<0)return null;
  let at=low;for(let i=0;i<sorted.length;i++){offsets.set(sorted[i].object.localOrdinal,at-sorted[i][start]);at+=sizes[i]+gap;}
 }else for(const row of rows){
  const delta=mode==='left'||mode==='top'?low-row[start]:mode==='right'||mode==='bottom'?high-row[end]:(low+high-row[start]-row[end])/2;
  if(!Number.isSafeInteger(delta))return null;
  offsets.set(row.object.localOrdinal,delta);
 }
 if(![...offsets.values()].some(n=>n!==0))return null;
 const targets=rows.map(({object:o})=>{
  const delta=offsets.get(o.localOrdinal)!;
  return {ordinal:o.localOrdinal,x:o.x+(horizontal?delta:0),y:o.y+(horizontal?0:delta),orientation:o.orientation,shapeKey:o.shapeKey};
 });
 return targets.every(o=>[o.x,o.y].every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647))?targets:null;
}
