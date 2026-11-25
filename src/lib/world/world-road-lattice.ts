/** Local native road lattice adapters. A world stroke stays in the source
 * Grid selected at its start; different Grid origins can have odd parity.
 * Preserve one world history and never invent cross-Grid connections. */
import {mainlandFrameOffset,mainlandNetworkScope,resolveMainlandDesign,type MainlandDesignFrame} from './mainland-design-frame.ts';
import {roadPitch,snapRoadPoint,roadStroke,roadComponent,floodRoadRegion,type RoadPoint,type RoadTool} from './road-design.ts';
import {currentDesign,planRoadDesign,replaceDesignNetwork,restoreDesign,type DesignTimeline,type DesignPlacement,type DesignItemGeometry,type RoadDesignPlan} from './design-layout.ts';
import type {TerrainRaster} from './terrain-binding.ts';
function area(f:MainlandDesignFrame,p:RoadPoint){
 const key=mainlandNetworkScope(f)(p),g=f.grids.find(g=>g.key===key);return g?{grid:g,offset:mainlandFrameOffset(f,g)}:null;
}
const minus=(p:RoadPoint,o:RoadPoint)=>({x:p.x-o.x,y:p.y-o.y});
const plus=(p:RoadPoint,o:RoadPoint)=>({x:p.x+o.x,y:p.y+o.y});
export function snapWorldRoad(f:MainlandDesignFrame,p:RoadPoint,pitch:number,seed:RoadPoint=p):RoadPoint|null{
 const a=area(f,seed);return a?plus(snapRoadPoint(minus(p,a.offset),pitch),a.offset):null;
}
function scopedPlacements(f:MainlandDesignFrame,old:readonly DesignPlacement[],key:string,offset:RoadPoint){
 const scope=mainlandNetworkScope(f);return old.filter(p=>scope(p)===key).map(p=>({...p,...minus(p,offset)}));
}
function scopedRaster(f:MainlandDesignFrame,key:string,offset:RoadPoint):TerrainRaster|null{
 const grid=f.grids.find(g=>g.key===key),i=f.grids.findIndex(g=>g.key===key)+1;if(!grid||!i)return null;
 const {sizeX,sizeY}=grid,w=f.raster.sizeX,values=new Uint32Array(sizeX*sizeY);
 for(let y=0;y<sizeY;y++)for(let x=0;x<sizeX;x++){
  const k=(offset.y+y)*w+offset.x+x;if(f.owners[k]===i)values[y*sizeX+x]=f.raster.nativeFloorValues[k];
 }
 return {sizeX,sizeY,nativeFloorValues:values};
}
export function worldRoadStroke(f:MainlandDesignFrame,points:readonly RoadPoint[],tool:RoadTool,step:number,g:DesignItemGeometry,old:readonly DesignPlacement[],defs:ReadonlyMap<number,DesignItemGeometry>):RoadPoint[]|null{
 if(!points.length)return null;const a=area(f,points[0]);if(!a||roadPitch(g,a.grid.factor)!==step)return null;
 const local=points.map(p=>minus(p,a.offset)),shape=g.shapes[g.itemId+':8'];
 if(!shape)return null;
 let result:RoadPoint[]|null;
 if(tool==='flood'){
  const r=scopedRaster(f,a.grid.key,a.offset),items=scopedPlacements(f,old,a.grid.key,a.offset);
  if(!r||items.some(p=>defs.get(p.itemId)?.layer==='ground'&&roadPitch(defs.get(p.itemId),a.grid.factor)!==step))return null;
  result=floodRoadRegion(local[0],g,{raster:r,factor:a.grid.factor,verifiedGridOrdinals:[]},items);
 }else result=roadStroke(local,tool,step);
 return result?.map(p=>plus(p,a.offset))??null;
}
export function worldRoadPlan(f:MainlandDesignFrame,t:DesignTimeline,g:DesignItemGeometry,points:readonly RoadPoint[],erase:boolean):RoadDesignPlan|null{
 if(!points.length)return null;const a=area(f,points[0]),shape=g.shapes[g.itemId+':8'];if(!a||!shape)return null;
 // Validate every affected cell even during erasure: no partial stroke
 // crossing into an unresolved or other native Grid.
 if(points.some(p=>resolveMainlandDesign(f,p.x,p.y,shape)?.grid.key!==a.grid.key))return null;
 const old=scopedPlacements(f,currentDesign(t),a.grid.key,a.offset),local={snapshots:[old],cursor:0,nextId:t.nextId};
 const plan=planRoadDesign(local,g,points.map(p=>minus(p,a.offset)),a.grid.factor,a.grid.sizeX,a.grid.sizeY,erase);
 if(!plan||currentDesign(t).length+plan.add.length-plan.remove.length>5000)return null;
 return {remove:plan.remove,add:plan.add.map(p=>({...p,...plus(p,a.offset)}))};
}
export function worldRoadComponent(f:MainlandDesignFrame,old:readonly DesignPlacement[],defs:ReadonlyMap<number,DesignItemGeometry>,seed:number):number[]{
 const root=old.find(p=>p.id===seed),a=root?area(f,root):null;
 return a?roadComponent(scopedPlacements(f,old,a.grid.key,a.offset),defs,a.grid.factor,seed):[];
}
export function replaceWorldRoad(f:MainlandDesignFrame,t:DesignTimeline,seed:number,target:DesignItemGeometry,defs:ReadonlyMap<number,DesignItemGeometry>):DesignTimeline|null{
 const old=currentDesign(t),root=old.find(p=>p.id===seed),a=root?area(f,root):null;if(!a)return null;
 const local={snapshots:[scopedPlacements(f,old,a.grid.key,a.offset)],cursor:0,nextId:t.nextId};
 const next=replaceDesignNetwork(local,seed,target,defs,a.grid.factor,a.grid.sizeX,a.grid.sizeY);if(!next)return null;
 const changes=new Map(currentDesign(next).map(p=>[p.id,p.itemId]));
 return restoreDesign(t,old.map(p=>changes.has(p.id)?{...p,itemId:changes.get(p.id)!}:p),defs,f.raster.sizeX,f.raster.sizeY);
}
