import {CARDINAL_ORIENTATIONS,isCardinal,worldTransformEligible} from './saved-map-transform.ts';
import {bindMainlandGrid,sourceWorldScope,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {StockDestination} from './save-furniture-placement.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
export interface BuildingPose{itemId:number;x:number;y:number;orientation:number}
export interface BuildingAreaPlan{destination:StockDestination;before:BuildingPose[];after:BuildingPose[]}
export const BUILDING_LAYOUT_LIMIT=256;
const buildingId=(id:number)=>Number.isSafeInteger(id)&&[200,201,202,203].includes(Math.floor(id/100000));
const key=(p:BuildingPose)=>[p.itemId,p.x,p.y,p.orientation].join(':');
export function buildingPoseRows(value:unknown,g:MainlandGrid):BuildingPose[]{
 if(!bindMainlandGrid(g)||!Array.isArray(value)||value.length>BUILDING_LAYOUT_LIMIT)throw Error('BUILDING_LAYOUT_SCOPE');
 return value.map(p=>{if(!p||typeof p!=='object'||Object.keys(p).length!==4||!buildingId(p.itemId)||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)||p.x<0||p.y<0||p.x>=g.sizeX*g.factor||p.y>=g.sizeY*g.factor||!Number.isInteger(p.orientation)||p.orientation<0||p.orientation>3)throw Error('BUILDING_LAYOUT_POSE');return {itemId:p.itemId,x:p.x,y:p.y,orientation:p.orientation};});
}
export function captureBuildingPoses(g:MainlandGrid,objects:readonly MainlandSavedObject[]):BuildingPose[]|null{
 const buildings=objects.filter(p=>p.area===g.key&&buildingId(Number(p.object.itemId)));
 // Omit an entire ambiguous ItemID family if any member has no resolved geometry.
 const blocked=new Set(buildings.filter(p=>!p.shape||p.factor!==g.factor||p.object.nativeType!=='Building'||!worldTransformEligible(p.object,true)||!isCardinal(p.object.orientation)||p.object.x<0||p.object.y<0||p.object.x>=g.sizeX*g.factor||p.object.y>=g.sizeY*g.factor).map(p=>p.object.itemId));
 try{return buildingPoseRows(buildings.filter(p=>!blocked.has(p.object.itemId)).map(p=>({itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y,orientation:CARDINAL_ORIENTATIONS.indexOf(p.object.orientation as typeof CARDINAL_ORIENTATIONS[number])})),g);}catch{return null;}
}
export function reviewBuildingLayout(grids:readonly MainlandGrid[],objects:ReadonlyMap<string,readonly MainlandSavedObject[]>,incoming:ReadonlyMap<string,{buildings?:readonly BuildingPose[]}>,free:boolean){
 if(!grids.length||grids.some(g=>!bindMainlandGrid(g)||sourceWorldScope(g)!==sourceWorldScope(grids[0]))||incoming.size!==grids.length)return null;
 const plans=new Map<string,BuildingAreaPlan>();let moved=0,retained=0;
 for(const g of grids){
  const rows=objects.get(g.key),wanted=incoming.get(g.key)?.buildings;if(!rows||!wanted)return null;
  const before=captureBuildingPoses(g,rows);if(!before)return null;
  let after:BuildingPose[];try{after=buildingPoseRows(wanted,g);}catch{return null;}
  // Missing families in older/different snapshots are protected. A family
  // explicitly present in the incoming layout must retain its exact count.
  const ids=new Set(after.map(p=>p.itemId)),old=before.filter(p=>ids.has(p.itemId));
  for(const id of ids){
   const a=old.filter(p=>p.itemId===id).map(key),b=after.filter(p=>p.itemId===id).map(key);
   if(a.length!==b.length)return null;
   for(const k of b){const i=a.indexOf(k);if(i>=0){a.splice(i,1);retained++;}}
   if(a.length>1)return null; // never guess which stateful instance should move
   moved+=a.length;
  }
  plans.set(g.key,{destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY},before:old,after});
 }
 if(moved>BUILDING_LAYOUT_LIMIT||!free&&moved)return null;
 return {plans,moved,retained,changed:moved>0};
}
export const buildingBackupWords={ja:'既存建物の位置・方向（状態保持）',en:'Existing building poses (state retained)',fr:'Positions des bâtiments (état conservé)',it:'Posizioni edifici (stato conservato)',de:'Gebäudepositionen (Zustand bleibt)', 'es-ES':'Posiciones de edificios (estado conservado)','zh-CN':'现有建筑位置和方向（保留状态）','pt-BR':'Posições de edifícios (estado mantido)'} as const;
