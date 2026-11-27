import {CARDINAL_ORIENTATIONS,isCardinal} from './saved-map-transform.ts';
import {bindMainlandGrid,sourceWorldScope,type MainlandGrid} from './mainland-world-coordinates.ts';
import {playerHouseSourceEligible,type StockDestination} from './save-furniture-placement.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
export interface HousePose{itemId:number;x:number;y:number;orientation:number}
export interface HouseAreaPlan{destination:StockDestination;before:HousePose[];after:HousePose[]}
export const HOUSE_LAYOUT_LIMIT=128;
const key=(p:HousePose)=>[p.itemId,p.x,p.y,p.orientation].join(':');
export function housePoseRows(value:unknown,g:MainlandGrid):HousePose[]{
 if(!bindMainlandGrid(g)||!Array.isArray(value)||value.length>HOUSE_LAYOUT_LIMIT)throw Error('HOUSE_LAYOUT_SCOPE');
 return value.map(p=>{if(!p||typeof p!=='object'||Object.keys(p).length!==4||!Number.isSafeInteger(p.itemId)||Math.floor(p.itemId/100000)!==205||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)||p.x<0||p.y<0||p.x>=g.sizeX*g.factor||p.y>=g.sizeY*g.factor||!Number.isInteger(p.orientation)||p.orientation<0||p.orientation>3)throw Error('HOUSE_LAYOUT_POSE');return {itemId:p.itemId,x:p.x,y:p.y,orientation:p.orientation};});
}
export function captureHousePoses(g:MainlandGrid,objects:readonly MainlandSavedObject[]):HousePose[]|null{
 const houses=objects.filter(p=>p.area===g.key&&Math.floor(Number(p.object.itemId)/100000)===205);
 if(houses.some(p=>!playerHouseSourceEligible(p)||p.factor!==g.factor||!isCardinal(p.object.orientation)))return null;
 try{return housePoseRows(houses.map(p=>({itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y,orientation:CARDINAL_ORIENTATIONS.indexOf(p.object.orientation as typeof CARDINAL_ORIENTATIONS[number])})),g);}catch{return null;}
}
export function reviewHouseLayout(grids:readonly MainlandGrid[],objects:ReadonlyMap<string,readonly MainlandSavedObject[]>,incoming:ReadonlyMap<string,{houses?:readonly HousePose[]}>,free:boolean){
 if(!grids.length||grids.some(g=>!bindMainlandGrid(g)||sourceWorldScope(g)!==sourceWorldScope(grids[0]))||incoming.size!==grids.length)return null;
 const plans=new Map<string,HouseAreaPlan>(),sources=new Set<string>(),desired=new Set<string>();
 let removed=0,added=0,retained=0;
 for(const g of grids){
  const rows=objects.get(g.key),wanted=incoming.get(g.key)?.houses;if(!rows||!wanted)return null;
  const before=captureHousePoses(g,rows);if(!before)return null;
  let after:HousePose[];try{after=housePoseRows(wanted,g);}catch{return null;}
  for(const p of before)sources.add(p.itemId+':'+g.factor);
  for(const p of after)desired.add(p.itemId+':'+g.factor);
  const counts=new Map<string,number>();for(const p of before)counts.set(key(p),(counts.get(key(p))??0)+1);
  for(const p of after){const k=key(p),n=counts.get(k)??0;if(n){counts.set(k,n-1);retained++;}else added++;}
  removed+=[...counts.values()].reduce((a,b)=>a+b,0);
  plans.set(g.key,{destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY},before,after});
 }
 if(sources.size!==desired.size||[...sources].some(k=>!desired.has(k))||removed+added>HOUSE_LAYOUT_LIMIT||!free&&(removed||added))return null;
 return {plans,removed,added,retained,changed:removed+added>0};
}
export const houseBackupWords={ja:'プレイヤーハウス外観（内装は保持）',en:'Player house exteriors (interiors retained)',fr:'Extérieurs des maisons (intérieurs conservés)',it:'Esterni delle case (interni conservati)',de:'Spielerhaus-Außenbereiche (Innenräume bleiben)', 'es-ES':'Exteriores de casas (interiores conservados)','zh-CN':'玩家房屋外观（保留室内）','pt-BR':'Exteriores das casas (interiores mantidos)'} as const;
