/** Logical cardinal path cells. The v1.25 native pitch contract is used
 * only for design previews whose current source shape matches it. */
import type {DesignItemGeometry} from './design-layout.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {exclusiveAnchorClass} from './saved-map-transform.ts';
export type RoadTool='brush'|'line'|'outline'|'fill'|'erase'|'flood'|'erase-line'|'erase-rect';
export const roadErase=(tool:RoadTool)=>tool==='erase'||tool==='erase-line'||tool==='erase-rect';
export const roadFreehand=(tool:RoadTool)=>tool==='brush'||tool==='erase';
export type RoadPoint={readonly x:number;readonly y:number};
export const ROAD_STROKE_LIMIT=5000;
export function roadPitch(g:DesignItemGeometry|null|undefined,factor:number):number|null{
 if(!g||exclusiveAnchorClass(String(g.itemId))!=='ground'||g.layer!=='ground'||nativeActionBlocked(g.editRestrictions,'select')||!/^(?:Path|Road)_/i.test(g.name??'')||!(factor===1||factor===2))return null;
 const pitch=2*factor,s=g.shapes[g.itemId+':8'];
 return s&&s.width===pitch&&s.height===pitch&&s.cellCount===pitch*pitch&&s.runs.length===pitch&&s.runs.every((r,i)=>r.x===0&&r.y===i&&r.width===pitch)?pitch:null;
}
export function snapRoadPoint(p:RoadPoint,pitch:number):RoadPoint{return {x:Math.floor(p.x/pitch)*pitch,y:Math.floor(p.y/pitch)*pitch};}
export function roadStroke(points:readonly RoadPoint[],tool:RoadTool,pitch:number):RoadPoint[]|null{
 if(!points.length||points.length>ROAD_STROKE_LIMIT||!Number.isSafeInteger(pitch)||pitch<=0||!points.every(p=>Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)&&p.x%pitch===0&&p.y%pitch===0))return null;
 if(tool==='flood')return null; // requires explicit terrain and occupancy
 if(tool==='erase-line')tool='line';else if(tool==='erase-rect')tool='fill';
 const result=new Map<string,RoadPoint>();
 const add=(p:RoadPoint)=>{result.set(p.x+':'+p.y,p);return result.size<=ROAD_STROKE_LIMIT;};
 const a=points[0],b=points[points.length-1];
 function cardinal(start:RoadPoint,end:RoadPoint){
  let x=start.x,y=start.y;if(Math.abs(end.x-x)/pitch+Math.abs(end.y-y)/pitch>=ROAD_STROKE_LIMIT||!add({x,y}))return false;
  while(x!==end.x||y!==end.y){if(x!==end.x)x+=Math.sign(end.x-x)*pitch;else y+=Math.sign(end.y-y)*pitch;if(!add({x,y}))return false;}return true;
 }
 if(tool==='outline'||tool==='fill'){
  const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y),w=(right-left)/pitch+1,h=(bottom-top)/pitch+1;
  if((tool==='fill'?w*h:w===1||h===1?w*h:2*w+2*h-4)>ROAD_STROKE_LIMIT)return null;
  if(tool==='fill'){for(let y=top;y<=bottom;y+=pitch)for(let x=left;x<=right;x+=pitch)if(!add({x,y}))return null;}
  else if(!cardinal({x:left,y:top},{x:right,y:top})||!cardinal({x:right,y:top},{x:right,y:bottom})||!cardinal({x:right,y:bottom},{x:left,y:bottom})||!cardinal({x:left,y:bottom},{x:left,y:top}))return null;
 }else if(tool==='line'){
  const target=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y)?{x:b.x,y:a.y}:{x:a.x,y:b.y};
  if(!cardinal(a,target))return null;
 }else{
  if(!add(a))return null;
  for(let i=1;i<points.length;i++)if(!cardinal(points[i-1],points[i]))return null;
 }
 return [...result.values()];
}

/** Local cardinal design roads only. The source Save's diagonal state is not
 * represented here, so only cardinal same-family neighbors are traversed. */
export function roadComponent(placements:readonly import('./design-layout.ts').DesignPlacement[],defs:ReadonlyMap<number,DesignItemGeometry>,factor:number,seed:number):number[]{
 const root=placements.find(p=>p.id===seed),pitch=root?roadPitch(defs.get(root.itemId),factor):null;
 if(!root||!pitch||root.orientation!==2||root.x%pitch||root.y%pitch)return [];
 const nodes=new Map<string,typeof root>();
 for(const p of placements)if(p.itemId===root.itemId&&p.orientation===2&&p.x%pitch===0&&p.y%pitch===0){
  const key=p.x+':'+p.y;if(nodes.has(key))return [];nodes.set(key,p);
 }
 const seen=new Set([seed]),queue=[root];
 for(let i=0;i<queue.length;i++){const p=queue[i];for(const [dx,dy] of [[pitch,0],[-pitch,0],[0,pitch],[0,-pitch]]){
  const n=nodes.get((p.x+dx)+':'+(p.y+dy));if(n&&!seen.has(n.id)){seen.add(n.id);queue.push(n);}
 }}
 return [...seen];
}

import {terrainFloorAt,type TerrainBinding} from './terrain-binding.ts';
import type {DesignPlacement} from './design-layout.ts';
/** Flood fill the connected empty road-cell region with the same exact
 * original terrain signature. Existing ground items, map bounds, zero or
 * incompatible floor values and changed terrain signatures are boundaries.
 * This is a local design tool, not runtime placement authorization.
 * Oversize fills fail closed (no truncated partial fill). */
export function floodRoadRegion(seed:RoadPoint,g:DesignItemGeometry,terrain:TerrainBinding,placements:readonly DesignPlacement[]):RoadPoint[]|null{
 const pitch=roadPitch(g,terrain.factor),shape=g.shapes[g.itemId+':8'];
 if(!pitch||!shape||!Number.isSafeInteger(seed.x)||!Number.isSafeInteger(seed.y)||seed.x%pitch||seed.y%pitch)return null;
 const width=terrain.raster.sizeX*terrain.factor,height=terrain.raster.sizeY*terrain.factor;
 const blocked=new Set<string>(),key=(x:number,y:number)=>x+':'+y;
 // Source-ground footprints can be unusual; callers supply only recognized
 // cardinal ground design records for this operation.
 for(const p of placements)if(exclusiveAnchorClass(String(p.itemId))==='ground'){
  if(p.orientation!==2||p.x%pitch||p.y%pitch)return null;blocked.add(key(p.x,p.y));
 }
 function signature(x:number,y:number){
  if(x<0||y<0||x+pitch>width||y+pitch>height||blocked.has(key(x,y)))return null;
  const result:number[]=[];
  for(let dy=0;dy<pitch;dy+=terrain.factor)for(let dx=0;dx<pitch;dx+=terrain.factor){
   const floor=terrainFloorAt(terrain,x+dx,y+dy);
   if(floor===null||floor===0||shape.acceptedFloorTypesFlag!==undefined&&(floor&shape.acceptedFloorTypesFlag)===0)return null;
   result.push(floor);
  }
  return result.join(',');
 }
 const reference=signature(seed.x,seed.y);if(reference===null)return null;
 const seen=new Set([key(seed.x,seed.y)]),result:RoadPoint[]=[seed];
 for(let i=0;i<result.length;i++){
  const p=result[i];for(const [dx,dy] of [[pitch,0],[-pitch,0],[0,pitch],[0,-pitch]]){
   const x=p.x+dx,y=p.y+dy,k=key(x,y);if(seen.has(k))continue;seen.add(k);
   if(signature(x,y)!==reference)continue;
   if(result.length>=ROAD_STROKE_LIMIT)return null;result.push({x,y});
  }
 }
 return result;
}
