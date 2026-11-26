import {stockSourceEligible,stockPlacement,stockFootprintFeedback,type StockCandidate,type StockDestination} from './save-furniture-placement.ts';
import {CARDINAL_ORIENTATIONS,type Cardinal} from './saved-map-transform.ts';
import {WORLD_BATCH_LIMIT} from './saved-map-batch.ts';
import {rotateDesignClipboard,type DesignClipItem,type DesignItemGeometry} from './design-layout.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import {mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {supportParentEligible} from './subgrid-local.ts';

export function cutEligible(p:MainlandSavedObject,allowSupport:boolean):boolean{const ordinary:boolean=stockSourceEligible(p);const support:boolean=supportParentEligible(p);return ordinary||allowSupport&&support&&!nativeActionBlocked(p.object.editRestrictions,'switchGrid')&&!nativeActionBlocked(p.object.editRestrictions,'rotate');}
export function captureFurnitureGroup(items:readonly MainlandSavedObject[],allowSupport=false):DesignClipItem[]|null{
 if(!items.length||items.length>WORLD_BATCH_LIMIT||new Set(items.map(p=>p.object.localOrdinal)).size!==items.length)return null;
 const rows=items.map(p=>{
  if(!cutEligible(p,allowSupport)||nativeActionBlocked(p.object.editRestrictions,'move')||!Number.isSafeInteger(p.x*2)||!Number.isSafeInteger(-p.y*2))return null;
  const orientation=CARDINAL_ORIENTATIONS.indexOf(p.object.orientation as Cardinal);
  if(orientation<0)return null;
  return {itemId:Number(p.object.itemId),dx:p.x*2,dy:-p.y*2,orientation};
 });
 if(rows.some(p=>!p))return null;
 const a=rows as DesignClipItem[],x=Math.min(...a.map(p=>p.dx)),y=Math.min(...a.map(p=>p.dy));
 return a.map(p=>({...p,dx:p.dx-x,dy:p.dy-y}));
}
export type GroupGeometry=ReadonlyMap<number,ReadonlyMap<number,DesignItemGeometry>>;
export interface GroupPasteRow{itemId:string;x:number;y:number;orientation:Cardinal;destination:StockDestination}
export interface GroupPasteCandidate{rows:GroupPasteRow[];ghosts:StockCandidate[]}
export function groupStockAvailable(clip:readonly DesignClipItem[],counts:ReadonlyMap<number,number>):boolean{
 const used=new Map<number,number>();
 return !!clip.length&&clip.every(p=>{const n=(used.get(p.itemId)??0)+1;used.set(p.itemId,n);return n<=(counts.get(p.itemId)??0);});
}
/** Rotate in common half-cell coordinates. Scale source factor-1 dimensions
 * for rotation only; actual placement uses the native runs for each target. */
export function rotateFurnitureGroup(clip:readonly DesignClipItem[],defs:GroupGeometry,turn:number){
 const scaled=new Map<number,DesignItemGeometry>();
 for(const item of clip){
  const a=defs.get(item.itemId),d=a?.get(2)??a?.get(1);if(!d)return null;
  if(a?.has(2))scaled.set(item.itemId,d);
  else scaled.set(item.itemId,{...d,shapes:Object.fromEntries(Object.entries(d.shapes).map(([key,s])=>[key,{...s,width:s.width*2,height:s.height*2,cellCount:s.cellCount*4,runs:s.runs.flatMap(r=>[0,1].map(dy=>({x:r.x*2,y:r.y*2+dy,width:r.width*2})))}]))});
 }
 return rotateDesignClipboard(clip,scaled,turn);
}
/** Physical bounds on the common half-cell lattice, used for Scene anchor
 * snapping. A target factor must have source-derived geometry. */
export function groupSceneOrigin(clip:readonly DesignClipItem[],defs:GroupGeometry,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,p:{x:number;y:number},anchor:'corner'|'center'){
 if(anchor==='corner')return p;
 const hits=mainlandTerrainHits(grids,rasters,p.x,p.y);if(hits.length!==1)return null;
 const g=hits[0];let width=0,height=0;
 for(const item of clip){const s=defs.get(item.itemId)?.get(g.factor)?.shapes[item.itemId+':'+item.orientation*4];if(!s)return null;width=Math.max(width,item.dx/2+s.width/g.factor);height=Math.max(height,item.dy/2+s.height/g.factor);}
 if(!width||!height)return null;
 const x=2*g.origin.position[0]+Math.floor((p.x-2*g.origin.position[0])*g.factor)/g.factor;
 const y=-2*g.origin.position[2]-Math.floor((-p.y-2*g.origin.position[2])*g.factor)/g.factor;
 return {x:x-Math.floor((width*g.factor-1)/2)/g.factor+.001,y:y+Math.floor((height*g.factor-1)/2)/g.factor-.001};
}
export function groupPasteCandidate(clip:readonly DesignClipItem[],grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,defs:GroupGeometry,stock:ReadonlyMap<number,number>,objects:readonly MainlandSavedObject[],omitted:number,wx:number,wy:number):GroupPasteCandidate|null{
 if(!clip.length||clip.length>WORLD_BATCH_LIMIT||!groupStockAvailable(clip,stock)||!Number.isFinite(wx)||!Number.isFinite(wy))return null;
 const hits=mainlandTerrainHits(grids,rasters,wx,wy);if(hits.length!==1)return null;
 const g=hits[0],baseX=2*g.origin.position[0]+Math.floor((wx-2*g.origin.position[0])*g.factor)/g.factor,baseY=-2*g.origin.position[2]-Math.floor((-wy-2*g.origin.position[2])*g.factor)/g.factor;
 const poses=clip.map(p=>({itemId:p.itemId,x:baseX+p.dx/2,y:baseY-p.dy/2,orientation:p.orientation}));
 if(clip.some(p=>![p.dx,p.dy,p.orientation].every(Number.isSafeInteger)||p.dx<0||p.dy<0||p.orientation<0||p.orientation>3))return null;
 return groupAbsoluteCandidate(poses,grids,rasters,defs,stock,objects,omitted);
}
export interface WorldGroupPose{itemId:number;x:number;y:number;orientation:number}
export interface WorldSymmetryAxis{mode:SymmetryMode;x:number;y:number}
/** All poses share map coordinates; each independently resolves its exact
 * source Grid. The bounding rectangle's empty corner need not be on land. */
export function groupAbsoluteCandidate(poses:readonly WorldGroupPose[],grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,defs:GroupGeometry,stock:ReadonlyMap<number,number>,objects:readonly MainlandSavedObject[],omitted:number):GroupPasteCandidate|null{
 if(!poses.length||poses.length>WORLD_BATCH_LIMIT||!groupStockAvailable(poses.map(p=>({itemId:p.itemId,dx:0,dy:0,orientation:p.orientation})),stock))return null;
 const rows:GroupPasteRow[]=[],ghosts:StockCandidate[]=[],anchors=new Set<string>();
 for(const p of poses){
  const {x,y}=p,geo=defs.get(p.itemId);if(!geo||!Number.isSafeInteger(x*2)||!Number.isSafeInteger(y*2)||!Number.isInteger(p.orientation)||p.orientation<0||p.orientation>3)return null;
  const target=mainlandTerrainHits(grids,rasters,x+.001,y-.001);if(target.length!==1)return null;
  const t=target[0],lx=(x-2*t.origin.position[0])*t.factor,ly=(-y-2*t.origin.position[2])*t.factor;
  if(!Number.isSafeInteger(lx)||!Number.isSafeInteger(ly))return null;
  const q=stockPlacement(grids,rasters,geo,p.itemId,CARDINAL_ORIENTATIONS[p.orientation],x+.001,y-.001);
  if(!q||q.plan.action!=='place'||!q.destination||q.plan.x!==lx||q.plan.y!==ly)return null;
  const key=q.area+':'+lx+':'+ly;if(anchors.has(key)||objects.some(o=>o.area===q.area&&o.object.layer!=='ground'&&o.object.x===lx&&o.object.y===ly))return null;
  anchors.add(key);
  // Exact occupied-cell conflicts are refused for ordinary group placement;
  // roads remain visible context. Unknown objects remain a warning.
  if(stockFootprintFeedback(q,objects,omitted).overlaps>0)return null;
  for(const other of ghosts){
   const synthetic:MainlandSavedObject={area:other.area,x:other.x,y:other.y,factor:other.factor,shape:other.shape,object:{localOrdinal:1,localGridOrdinal:1,itemId:other.plan.itemId,x:0,y:0,orientation:'GridOrientation_Down',orientationCode:8,shapeKey:null,name:null,layer:'furniture',surfaceCapable:false}};
   if(stockFootprintFeedback(q,[synthetic]).overlaps>0)return null;
  }
  rows.push({itemId:q.plan.itemId,x:lx,y:ly,orientation:q.plan.orientation,destination:q.destination});ghosts.push(q);
 }
 return {rows,ghosts};
}
