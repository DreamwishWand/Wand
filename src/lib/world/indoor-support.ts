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
