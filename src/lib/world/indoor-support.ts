import type {GroupPickupRow} from './group-pickup.ts';
import {CARDINAL_ORIENTATIONS} from './saved-map-transform.ts';
import type {SourceObjectShape} from './source-object-map.ts';
import type {IndoorSurface} from './indoor-room-view.ts';
import type {IndoorRoom} from './indoor-room-view.ts';
export interface SupportParentWitness{localOrdinal:number;itemId:number;x:number;y:number}
export type IndoorSupportWitness=SupportParentWitness&{roomOrdinal:number;surfaceOrdinal:number;index:number};
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
/** Validate ephemeral support handles against the exact projected surface.
 * Never expose native Grid/Object IDs or infer a parent by item name. */
export function parseIndoorSupportParents(value:unknown,rooms:readonly IndoorRoom[]):IndoorSupportWitness[]{
 if(!record(value)||value.supportParents===undefined)return [];
 if(!Array.isArray(value.supportParents)||value.supportParents.length>20000)throw Error('INDOOR_SUPPORT');
 const seen=new Set<number>(),poses=new Set<string>();
 return value.supportParents.map(w=>{
  if(!record(w)||Object.keys(w).length!==7||!integer(w.roomOrdinal,1,2048)||!integer(w.surfaceOrdinal,1,65)||!integer(w.index,0,99999)||!integer(w.localOrdinal,1,20000)||!integer(w.itemId,1,0xffffffff)||!integer(w.x,-1000000,1000000)||!integer(w.y,-1000000,1000000)||seen.has(w.localOrdinal))throw Error('INDOOR_SUPPORT');
  const face=rooms[w.roomOrdinal-1]?.surfaces[w.surfaceOrdinal-1],pose=face?.positions[w.index],key=w.roomOrdinal+':'+w.surfaceOrdinal+':'+w.index;
  if(!face||face.gridStatus!=='full'||face.missingPositions||!face.factor||!pose||pose.itemId!==w.itemId||pose.x!==w.x||pose.y!==w.y||poses.has(key))throw Error('INDOOR_SUPPORT');
  seen.add(w.localOrdinal);poses.add(key);return {roomOrdinal:w.roomOrdinal,surfaceOrdinal:w.surfaceOrdinal,index:w.index,localOrdinal:w.localOrdinal,itemId:w.itemId,x:w.x,y:w.y};
 });
}

/** Only exact support roots on the selected surface. The existing Rust
 * group pickup writer revalidates the whole descendant/stock closure. */
export function roomSupportPickupPlan(face:IndoorSurface|null,witnesses:readonly IndoorSupportWitness[],indices:readonly number[],shapes:Readonly<Record<string,SourceObjectShape>>,removable:ReadonlySet<number>):GroupPickupRow[]|null{
 if(!face||face.gridStatus!=='full'||!face.factor||face.missingPositions||!indices.length||indices.length>32||new Set(indices).size!==indices.length)return null;
 const rows:GroupPickupRow[]=[];
 for(const index of indices){
  const p=face.positions[index],w=witnesses.find(w=>w.index===index&&w.surfaceOrdinal===face.ordinal);
  if(!p||!w||w.itemId!==p.itemId||w.x!==p.x||w.y!==p.y||Math.floor(p.itemId/100000)!==400||p.orientationCode===null||p.orientationCode%4!==0||p.plain===true||p.storage===true||!shapes[p.itemId+':'+p.orientationCode]||!removable.has(p.itemId))return null;
  rows.push({localOrdinal:w.localOrdinal,itemId:String(p.itemId),expectedX:p.x,expectedY:p.y,expectedOrientation:CARDINAL_ORIENTATIONS[p.orientationCode/4],includeSupport:true});
 }
 return new Set(rows.map(r=>r.localOrdinal)).size===rows.length?rows.sort((a,b)=>a.localOrdinal-b.localOrdinal):null;
}
