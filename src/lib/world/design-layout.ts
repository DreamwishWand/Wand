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
